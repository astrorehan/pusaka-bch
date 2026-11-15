// The 12 prototype cases (../prototype/test.mjs), ported to SolidCash + solidhat.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Contract, SignatureTemplate, TransactionBuilder, randomUtxo, type Utxo } from '@solidcash/solidcash';
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock';
import { secp256k1, hash160, encodeCashAddress, generatePrivateKey, numberToBinUint32LE } from '@bitauth/libauth';

const artifact = JSON.parse(
  readFileSync(new URL('../artifacts/solidcash/contracts/VaultStateless.scash/VaultStateless.json', import.meta.url), 'utf8'),
);
const provider = new MockNetworkProvider();

type Person = { pkh: Uint8Array; address: string; tpl: SignatureTemplate };
function person(): Person {
  const priv = generatePrivateKey();
  const pkh = hash160(secp256k1.derivePublicKeyCompressed(priv) as Uint8Array);
  const address = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address;
  return { pkh, address, tpl: new SignatureTemplate(priv) };
}

type Heir = { who: Person; share: number };
function makeVault(owner: Person, heirList: Heir[], period = 4320, feeBudget = 2000n) {
  const total = heirList.reduce((s, h) => s + h.share, 0);
  const heirsBytes = new Uint8Array(heirList.length * 24);
  heirList.forEach((h, i) => {
    heirsBytes.set(h.who.pkh, i * 24);
    heirsBytes.set(numberToBinUint32LE(h.share), i * 24 + 20);
  });
  const contract = new Contract(artifact, [owner.pkh, BigInt(period), BigInt(total), feeBudget, heirsBytes], { provider });
  return { contract, total, period, feeBudget };
}
type Vault = ReturnType<typeof makeVault>;
const payouts = (value: bigint, v: Vault, heirList: Heir[]) =>
  heirList.map((h) => ({ to: h.who.address, amount: ((value - v.feeBudget) * BigInt(h.share)) / BigInt(v.total) }));
const build = () => new TransactionBuilder({ provider });

// Faraid case: wife 1/8, father 1/6, mother 1/6, two sons and a daughter share the rest 2:2:1 -> out of 120
const owner = person();
const stranger = person();
const shares = [15, 20, 20, 26, 26, 13];
const heirs: Heir[] = shares.map((share) => ({ who: person(), share }));
const v = makeVault(owner, heirs);
const VALUE = 1_000_000n;

describe('VaultStateless (prototype port)', () => {
  let coin: Utxo;
  let ownerCoin: Utxo;
  let strangerCoin: Utxo;

  it('setup', async () => {
    coin = await provider.addUtxo(v.contract.address, randomUtxo({ satoshis: VALUE }));
    ownerCoin = await provider.addUtxo(owner.address, randomUtxo({ satoshis: 20_000n }));
    strangerCoin = await provider.addUtxo(stranger.address, randomUtxo({ satoshis: 20_000n }));
  });

  it('rejects distribute before the period ends', async () => {
    await expect(build().addInput(coin, v.contract.unlock.distribute(), { sequence: 100 }).addOutputs(payouts(VALUE, v, heirs)).send()).rejects.toThrow();
  });

  it('rejects distribute that underpays the daughter by 1 satoshi', async () => {
    const o = payouts(VALUE, v, heirs);
    o[5].amount -= 1n;
    o[0].amount += 1n;
    await expect(build().addInput(coin, v.contract.unlock.distribute(), { sequence: v.period }).addOutputs(o).send()).rejects.toThrow();
  });

  it('rejects distribute that swaps in a stranger address', async () => {
    const o = payouts(VALUE, v, heirs);
    o[3].to = stranger.address;
    await expect(build().addInput(coin, v.contract.unlock.distribute(), { sequence: v.period }).addOutputs(o).send()).rejects.toThrow();
  });

  it('rejects distribute with an extra output to a stranger', async () => {
    const o = [...payouts(VALUE, v, heirs), { to: stranger.address, amount: 1000n }];
    await expect(build().addInput(coin, v.contract.unlock.distribute(), { sequence: v.period }).addOutputs(o).send()).rejects.toThrow();
  });

  it('rejects check-in by a stranger', async () => {
    await expect(
      build().addInput(coin, v.contract.unlock.checkIn()).addInput(strangerCoin, stranger.tpl.unlockP2PKH())
        .addOutput({ to: v.contract.address, amount: VALUE }).addOutput({ to: stranger.address, amount: 19_000n }).send(),
    ).rejects.toThrow();
  });

  it('rejects withdraw by a stranger', async () => {
    await expect(
      build().addInput(coin, v.contract.unlock.withdraw()).addInput(strangerCoin, stranger.tpl.unlockP2PKH())
        .addOutput({ to: stranger.address, amount: VALUE + 19_000n }).send(),
    ).rejects.toThrow();
  });

  it('rejects owner check-in that shrinks the vault', async () => {
    await expect(
      build().addInput(coin, v.contract.unlock.checkIn()).addInput(ownerCoin, owner.tpl.unlockP2PKH())
        .addOutput({ to: v.contract.address, amount: VALUE - 5000n }).addOutput({ to: owner.address, amount: 24_000n }).send(),
    ).rejects.toThrow();
  });

  it('accepts owner check-in that tops up 5,000 sats', async () => {
    await build().addInput(coin, v.contract.unlock.checkIn()).addInput(ownerCoin, owner.tpl.unlockP2PKH())
      .addOutput({ to: v.contract.address, amount: VALUE + 5000n }).addOutput({ to: owner.address, amount: 14_000n }).send();
    coin = (await provider.getUtxos(v.contract.address))[0];
    expect(coin.satoshis).toBe(VALUE + 5000n);
  });

  it('rejects distribute right after a check-in (the timer was reset)', async () => {
    await expect(build().addInput(coin, v.contract.unlock.distribute(), { sequence: v.period }).addOutputs(payouts(coin.satoshis, v, heirs)).send()).rejects.toThrow(/BIP68/);
  });

  it('pays 6 heirs their exact shares in one transaction after the period', async () => {
    await provider.mine(v.period);
    const o = payouts(coin.satoshis, v, heirs);
    await build().addInput(coin, v.contract.unlock.distribute(), { sequence: v.period }).addOutputs(o).send();
    for (const [i, h] of heirs.entries()) {
      const got = await provider.getUtxos(h.who.address);
      expect(got.reduce((s, u) => s + u.satoshis, 0n)).toBe(o[i].amount);
    }
  });

  it('lets the owner withdraw everything', async () => {
    const coin2 = await provider.addUtxo(v.contract.address, randomUtxo({ satoshis: 300_000n }));
    const ownerCoin2 = (await provider.getUtxos(owner.address))[0];
    await build().addInput(coin2, v.contract.unlock.withdraw()).addInput(ownerCoin2, owner.tpl.unlockP2PKH())
      .addOutput({ to: owner.address, amount: 300_000n + ownerCoin2.satoshis - 1000n }).send();
    expect(await provider.getUtxos(v.contract.address)).toHaveLength(0);
  });

  for (const n of [20, 50]) {
    it(`pays ${n} heirs in one transaction`, async () => {
      const many: Heir[] = Array.from({ length: n }, (_, i) => ({ who: person(), share: i + 1 }));
      const big = makeVault(owner, many, 4320, BigInt(1500 + 60 * n));
      const c = await provider.addUtxo(big.contract.address, randomUtxo({ satoshis: 50_000_000n }));
      const o = payouts(50_000_000n, big, many);
      await build().addInput(c, big.contract.unlock.distribute(), { sequence: big.period }).addOutputs(o).send();
      console.log(`${n} heirs: redeem script ${big.contract.bytesize} bytes`);
    });
  }
});
