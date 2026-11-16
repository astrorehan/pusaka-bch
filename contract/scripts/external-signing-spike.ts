// Spike: the whole Pusaka lifecycle on Chipnet with every key held by a "wallet" that signs over the
// WalletConnect BCH protocol (bch_signTransaction), exactly as the web app will. Only the SDK
// (@solidcash/solidcash) is used for contracts; solidhat only supplies the test keys from the mnemonic.
//   A: deploy -> I'm still here -> take back.   B: deployed past its deadline -> send to 6 heirs (paid by a stranger).
// Usage: node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/external-signing-spike.ts --network chipnet
import { ethers } from '@solidcash/solidhat/hardhat3';
import { Contract, Signer, SignatureTemplate, type ExternalTransactionSigner } from '@solidcash/solidcash';
import { StatefulContract } from '@solidcash/solidcash/stateful';
import { getContractFactory } from '@solidcash/solidcash/contract-factory';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { binToHex, decodeTransaction, encodeTransaction, hexToBin } from '@bitauth/libauth';
import artifact from '../artifacts/solidcash/Pusaka.json' with { type: 'json' };

const DAY = 86400n;
const PERIOD = 30n * DAY;
const FEE_BUDGET = 2000n;
const FARAID = [15n, 20n, 20n, 26n, 26n, 13n];
const TOTAL = 120n;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const provider = process.env.ELECTRUM_HOST
  ? new ElectrumNetworkProvider('chipnet', { hostname: process.env.ELECTRUM_HOST })
  : new ElectrumNetworkProvider('chipnet');

/** A stand-in for a WalletConnect wallet: signs its own empty P2PKH inputs, as bch_signTransaction asks. */
function fakeWallet(name: string, privateKey: Uint8Array): ExternalTransactionSigner {
  const template = new SignatureTemplate(privateKey);
  const unlocker = template.unlockP2PKH();
  return {
    async signTransaction(request) {
      const requestBytes = JSON.stringify(request, (_k, v) =>
        v instanceof Uint8Array ? binToHex(v) : typeof v === 'bigint' ? v.toString() : v).length;
      const { transaction, sourceOutputs } = request;
      const ownLock = binToHex(unlocker.generateLockingBytecode());
      let signed = 0;
      const inputs = transaction.inputs.map((input, inputIndex) => {
        const mine = binToHex(sourceOutputs[inputIndex].lockingBytecode) === ownLock && input.unlockingBytecode.length === 0;
        if (!mine) return input;
        signed++;
        return { ...input, unlockingBytecode: unlocker.generateUnlockingBytecode({ transaction, sourceOutputs, inputIndex }) };
      });
      const hex = binToHex(encodeTransaction({ ...transaction, inputs }));
      log(`  [${name} wallet] request ${requestBytes} chars, ${transaction.inputs.length} inputs, signed ${signed}, tx ${hex.length / 2} bytes, prompt: ${request.userPrompt ?? '-'}`);
      return { signedTransaction: hex };
    },
  };
}

async function medianTimePast(): Promise<bigint> {
  const height = Number(await provider.getBlockHeight());
  const times: number[] = [];
  for (let h = height; h > height - 11; h--) {
    const hex = String(await provider.performRequest('blockchain.block.header', h));
    times.push(Number(new DataView(hexToBin(hex).buffer).getUint32(68, true)));
  }
  times.sort((a, b) => a - b);
  return BigInt(times[5]);
}

const keys = await ethers.getSigners(8);
const [ownerKey, strangerKey, ...heirKeys] = keys as any[];
const owner = Signer.external({ wallet: fakeWallet('owner', ownerKey.privateKey), address: ownerKey.address, publicKey: process.env.NO_PUBKEY ? undefined : ownerKey.publicKey, userPrompt: 'Pusaka' }, provider);
const stranger = Signer.external({ wallet: fakeWallet('stranger', strangerKey.privateKey), address: strangerKey.address }, provider);
const heirs = heirKeys.map((h: any, i: number) => ({ pkh: h.pkh, share: FARAID[i] }));

const balanceOf = async (addr: string) => (await provider.getUtxos(addr)).reduce((t, u) => t + u.satoshis, 0n);
log('owner', ownerKey.address, 'balance', await balanceOf(ownerKey.address));
log('stranger', strangerKey.address, 'balance', await balanceOf(strangerKey.address));
const mtp = await medianTimePast();
log('median time past', mtp, `(${BigInt(Math.floor(Date.now() / 1000)) - mtp} s behind)`);

const factory = getContractFactory(artifact as any, owner);

/** Rebuild a deployed plan from what the plan link carries: the static constructor args and the category. */
function attach(category: string, runner: Signer): any {
  const base = new Contract(artifact as any, [ownerKey.pkh, PERIOD, TOTAL, FEE_BUDGET], { provider });
  return (new StatefulContract(base as any, category) as any).connect(runner);
}

// ---- A: owner lifecycle (A_GENESIS reuses a vault from an earlier run; SKIP_A skips it; B_CATEGORY reuses B)
/** A plan's category: the txid of the coin its genesis spent first (input 0). */
async function categoryOfGenesis(txid: string): Promise<string> {
  const tx = decodeTransaction(hexToBin(await provider.getRawTransaction(txid)));
  if (typeof tx === 'string') throw new Error(tx);
  return binToHex(tx.inputs[0].outpointTransactionHash);
}

if (!process.env.SKIP_A) {
let category = process.env.A_GENESIS ? await categoryOfGenesis(process.env.A_GENESIS) : '';
if (!category) {
  const a: any = await factory.deploy(ownerKey.pkh, PERIOD, TOTAL, FEE_BUDGET, mtp + PERIOD, heirs, { initialBalance: 20_000n });
  await a.waitForDeployment();
  category = a.categoryId;
  log('A deployed', await a.getAddress(), 'tx', a.deploymentTransaction()?.txid, 'category', category,
    'matches genesis input 0:', category === await categoryOfGenesis(a.deploymentTransaction()?.txid));
}
const aAgain: any = attach(category, owner);
log('A attached from category', category, 'deadline', await aAgain.state.deadline(), 'balance', await aAgain.getBalance());

const t1 = Number((await medianTimePast()) - 1n);
const ci = await aAgain.call.checkIn().setLocktime(t1).send();
log('A checkIn tx', ci.txid, 'new deadline', await aAgain.state.deadline(), 'expected', BigInt(t1) + PERIOD);

const wd = await aAgain.call.withdraw().send();
log('A withdraw tx', wd.txid, 'balance after', await aAgain.getBalance());
}

// ---- B: past its deadline, paid out by a stranger
let bCategory = process.env.B_CATEGORY ?? '';
if (!bCategory) {
  const b: any = await factory.deploy(ownerKey.pkh, PERIOD, TOTAL, FEE_BUDGET, mtp - 3600n, heirs, { initialBalance: 60_000n });
  await b.waitForDeployment();
  bCategory = b.categoryId as string;
  log('B deployed', await b.getAddress(), 'tx', b.deploymentTransaction()?.txid, 'category', bCategory);
}

const bByStranger: any = attach(bCategory, stranger);
const pot = (await bByStranger.getBalance()) - FEE_BUDGET;
let call: any = bByStranger.call.distribute().setLocktime(Number((await medianTimePast()) - 1n));
heirKeys.forEach((h: any, i: number) => { call = call.transfer(h.getLockingBytecode(), (pot * FARAID[i]) / TOTAL); });
const ds = await call.send();
log('B distribute tx', ds.txid);
process.exit(0);
