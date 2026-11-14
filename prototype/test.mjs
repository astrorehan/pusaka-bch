import fs from 'fs';
import { Contract, MockNetworkProvider, TransactionBuilder, SignatureTemplate, randomUtxo } from 'cashscript';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin, generatePrivateKey, numberToBinUint32LE } from '@bitauth/libauth';

const artifact = JSON.parse(fs.readFileSync('vault.json'));
const provider = new MockNetworkProvider();

function person() {
  const priv = generatePrivateKey();
  const pub = secp256k1.derivePublicKeyCompressed(priv);
  const pkh = hash160(pub);
  const address = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address;
  return { priv, pkh, address, tpl: new SignatureTemplate(priv) };
}

async function attempt(name, expectOk, build) {
  let ok = true, msg = '';
  try { const r = await build(); msg = r ?? ''; } catch (e) { ok = false; msg = String(e.message).split('\n').find(l => /require|Error|fail/i.test(l))?.slice(0, 110) ?? String(e.message).slice(0, 110); }
  const pass = ok === expectOk;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  -> ${ok ? 'accepted' : 'rejected'} ${msg}`);
  if (!pass) process.exitCode = 1;
}

function makeVault(owner, heirList, period = 4320, feeBudget = 2000n) {
  const total = heirList.reduce((s, h) => s + h.share, 0);
  const heirsBytes = new Uint8Array(heirList.length * 24);
  heirList.forEach((h, i) => { heirsBytes.set(h.who.pkh, i * 24); heirsBytes.set(numberToBinUint32LE(h.share), i * 24 + 20); });
  const contract = new Contract(artifact, [owner.pkh, BigInt(period), BigInt(total), feeBudget, heirsBytes], { provider });
  return { contract, total, period, feeBudget };
}
const payouts = (value, v, heirList) => heirList.map(h => ({ to: h.who.address, amount: (value - v.feeBudget) * BigInt(h.share) / BigInt(v.total) }));

// Faraid case: wife 1/8, father 1/6, mother 1/6, two sons and a daughter share the rest 2:2:1 -> out of 120
const owner = person(), stranger = person();
const names = ['wife', 'father', 'mother', 'son1', 'son2', 'daughter'];
const shares = [15, 20, 20, 26, 26, 13];
const heirs = names.map((n, i) => ({ name: n, who: person(), share: shares[i] }));
const v = makeVault(owner, heirs);
const VALUE = 1_000_000n;
console.log('vault address:', v.contract.address, '| redeem script bytes:', v.contract.bytesize);

let coin = provider.addUtxo(v.contract.address, randomUtxo({ satoshis: VALUE }));

await attempt('distribute before the period ends', false, () =>
  new TransactionBuilder({ provider }).addInput(coin, v.contract.unlock.distribute(), { sequence: 100 }).addOutputs(payouts(VALUE, v, heirs)).send());

await attempt('distribute but underpay the daughter', false, () => {
  const o = payouts(VALUE, v, heirs); o[5].amount -= 1n; o[0].amount += 1n;
  return new TransactionBuilder({ provider }).addInput(coin, v.contract.unlock.distribute(), { sequence: v.period }).addOutputs(o).send(); });

await attempt('distribute but swap in a stranger address', false, () => {
  const o = payouts(VALUE, v, heirs); o[3].to = stranger.address;
  return new TransactionBuilder({ provider }).addInput(coin, v.contract.unlock.distribute(), { sequence: v.period }).addOutputs(o).send(); });

await attempt('distribute with an extra output to a stranger', false, () => {
  const o = payouts(VALUE, v, heirs); o.push({ to: stranger.address, amount: 1000n });
  return new TransactionBuilder({ provider }).addInput(coin, v.contract.unlock.distribute(), { sequence: v.period }).addOutputs(o).send(); });

// check-in
let ownerCoin = provider.addUtxo(owner.address, randomUtxo({ satoshis: 20_000n }));
let strangerCoin = provider.addUtxo(stranger.address, randomUtxo({ satoshis: 20_000n }));
await attempt('check-in by a stranger', false, () =>
  new TransactionBuilder({ provider }).addInput(coin, v.contract.unlock.checkIn()).addInput(strangerCoin, stranger.tpl.unlockP2PKH())
    .addOutput({ to: v.contract.address, amount: VALUE }).addOutput({ to: stranger.address, amount: 19_000n }).send());
await attempt('withdraw by a stranger', false, () =>
  new TransactionBuilder({ provider }).addInput(coin, v.contract.unlock.withdraw()).addInput(strangerCoin, stranger.tpl.unlockP2PKH())
    .addOutput({ to: stranger.address, amount: VALUE + 19_000n }).send());
await attempt('check-in by the owner, but vault balance reduced', false, () =>
  new TransactionBuilder({ provider }).addInput(coin, v.contract.unlock.checkIn()).addInput(ownerCoin, owner.tpl.unlockP2PKH())
    .addOutput({ to: v.contract.address, amount: VALUE - 5000n }).addOutput({ to: owner.address, amount: 24_000n }).send());
await attempt('check-in by the owner (also tops up 5,000 sats)', true, async () => {
  const tx = await new TransactionBuilder({ provider }).addInput(coin, v.contract.unlock.checkIn()).addInput(ownerCoin, owner.tpl.unlockP2PKH())
    .addOutput({ to: v.contract.address, amount: VALUE + 5000n }).addOutput({ to: owner.address, amount: 14_000n }).send();
  return `size ${tx.hex.length / 2} bytes`; });

coin = (await provider.getUtxos(v.contract.address))[0];
const NEW = coin.satoshis;
await attempt('distribute after the period: 6 heirs paid in ONE transaction', true, async () => {
  const o = payouts(NEW, v, heirs);
  const tx = await new TransactionBuilder({ provider }).addInput(coin, v.contract.unlock.distribute(), { sequence: v.period }).addOutputs(o).send();
  const paid = o.reduce((s, x) => s + x.amount, 0n);
  console.log('      ' + o.map((x, i) => `${names[i]} ${x.amount}`).join(', '));
  return `size ${tx.hex.length / 2} bytes, miner fee ${NEW - paid} sats`; });

// withdraw by owner on a fresh vault coin
let coin2 = provider.addUtxo(v.contract.address, randomUtxo({ satoshis: 300_000n }));
let ownerCoin2 = (await provider.getUtxos(owner.address))[0];
await attempt('withdraw everything by the owner', true, async () => {
  const tx = await new TransactionBuilder({ provider }).addInput(coin2, v.contract.unlock.withdraw()).addInput(ownerCoin2, owner.tpl.unlockP2PKH())
    .addOutput({ to: owner.address, amount: 300_000n + ownerCoin2.satoshis - 1000n }).send();
  return `size ${tx.hex.length / 2} bytes`; });

// scale: how many heirs fit?
for (const n of [20, 50]) {
  const many = Array.from({ length: n }, (_, i) => ({ who: person(), share: i + 1 }));
  const big = makeVault(owner, many, 4320, BigInt(1500 + 60 * n));
  const c = provider.addUtxo(big.contract.address, randomUtxo({ satoshis: 50_000_000n }));
  await attempt(`distribute to ${n} heirs in one transaction`, true, async () => {
    const o = payouts(50_000_000n, big, many);
    const tx = await new TransactionBuilder({ provider }).addInput(c, big.contract.unlock.distribute(), { sequence: big.period }).addOutputs(o).send();
    const paid = o.reduce((s, x) => s + x.amount, 0n);
    return `size ${tx.hex.length / 2} bytes, fee ${50_000_000n - paid} sats, redeem script ${big.contract.bytesize} bytes`; });
}
