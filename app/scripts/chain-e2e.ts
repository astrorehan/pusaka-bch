// End-to-end check of the app's real chain layer (src/lib/chain) on Chipnet, from Node.
// A stand-in for the WizardConnect DappConnectionManager holds an HD key from the test mnemonic and signs
// exactly the inputs a request's `inputPaths` name, as a WizardConnect wallet does.
// Usage (from app/): SOLIDCASH_MNEMONIC_CHIPNET=... npx tsx scripts/chain-e2e.ts [create|checkin|takeback|send] [planfile]
import { readFileSync, writeFileSync } from 'node:fs';
import { deriveHdPath, deriveHdPrivateNodeFromSeed, deriveSeedFromBip39Mnemonic, secp256k1 } from '@bitauth/libauth';
import { SignatureTemplate } from '@solidcash/solidcash';
import { encodeTransaction, binToHex } from '@bitauth/libauth';
import { chainPlanService, setWizardManager } from '../src/lib/chain/chainPlanService';
import { addressOfPubkey } from '../src/lib/chain/network';
import type { PlanData } from '../src/lib/types';

const mnemonic = process.env.SOLIDCASH_MNEMONIC_CHIPNET;
if (!mnemonic) throw new Error('set SOLIDCASH_MNEMONIC_CHIPNET');
const seed = deriveSeedFromBip39Mnemonic(mnemonic);
const root = deriveHdPrivateNodeFromSeed(seed, { throwErrors: true });
const keyAt = (child: number, index: number) => {
  const node = deriveHdPath(root, `m/44'/145'/0'/${child}/${index}`);
  if (typeof node === 'string') throw new Error(node);
  return node.privateKey;
};
const pubAt = (child: number, index: number) => secp256k1.derivePublicKeyCompressed(keyAt(child, index)) as Uint8Array;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const fakeManager = {
  walletName: 'Test wallet',
  hasPath: (child: number) => child === 0 || child === 1,
  getPubkey: (child: number, index: bigint) => pubAt(child, Number(index)),
  on() {},
  off() {},
  async signTransaction({ transaction: request, inputPaths }: any) {
    const { transaction, sourceOutputs } = request;
    const inputs = [...transaction.inputs];
    for (const [i, path, index] of inputPaths as [number, string, number][]) {
      const unlocker = new SignatureTemplate(keyAt(path === 'change' ? 1 : 0, index)).unlockP2PKH();
      inputs[i] = { ...inputs[i], unlockingBytecode: unlocker.generateUnlockingBytecode({ transaction, sourceOutputs, inputIndex: i }) };
    }
    log(`  [wallet] ${transaction.inputs.length} inputs, signs ${inputPaths.length} at ${JSON.stringify(inputPaths.map((p: any[]) => p.slice(1)))}; prompt: ${request.userPrompt}`);
    return { signedTransaction: binToHex(encodeTransaction({ ...transaction, inputs })) };
  },
};

setWizardManager(fakeManager as never, 'chipnet');
const me = chainPlanService.wallet()!;
log('wallet owner address', me.address);

const step = process.argv[2] ?? 'create';
const planFile = process.argv[3] ?? 'scripts/.e2e-plan.json';
const save = (p: PlanData) => writeFileSync(planFile, JSON.stringify(p, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v), 2));
const load = (): PlanData => JSON.parse(readFileSync(planFile, 'utf8'), (_k, v) => (typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v));

if (step === 'create') {
  const heirAddr = (i: number) => addressOfPubkey(pubAt(0, i), 'chipnet');
  const plan: PlanData = {
    version: 1,
    network: 'chipnet',
    ownerAddress: me.address,
    heirs: [
      { name: 'Wife', address: heirAddr(2), share: 15n },
      { name: 'Father', address: heirAddr(3), share: 20n },
      { name: 'Son', address: heirAddr(4), share: 26n },
    ],
    shareTotal: 61n,
    splitMode: 'custom',
    period: BigInt(process.env.PERIOD ?? 1),
    feeBudget: 2000n,
  };
  const r = await chainPlanService.createPlan(plan, 30_000n);
  if (!r.ok) throw new Error(`${r.message} ${r.details ?? ''}`);
  save(r.plan);
  log('created', r.plan.categoryId, 'tx', r.txid);
}
const plan = load();
const state = await chainPlanService.readPlan(plan);
log('state', state);
if (step === 'checkin') log('checkIn', await chainPlanService.checkIn(plan));
if (step === 'takeback') log('takeBack', await chainPlanService.takeBack(plan));
if (step === 'send') {
  log('preview', (await chainPlanService.previewSendToHeirs(plan)).lines.map((l) => `${l.label} ${l.amount}`).join(', '));
  log('sendToHeirs', await chainPlanService.sendToHeirs(plan));
}
if (step !== 'create') log('state after', await chainPlanService.readPlan(plan));
process.exit(0);
