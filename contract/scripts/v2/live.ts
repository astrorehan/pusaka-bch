/**
 * Live runs of the Pusaka v2 wallet (the asset revision the web app creates) on Chipnet or mainnet,
 * with the same transaction builders as the app. Keys come from the solidhat network mnemonic and stand
 * in for the owner's, the trusted contacts', the heirs' and a sender's wallets. Never logs the mnemonic
 * or any key.
 *
 *   node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/live.ts --network <chipnet|mainnet>
 *
 * PUSAKA_LIVE selects the job (default: status):
 *   status  funding address, balances and the state of every recorded plan (read-only)
 *   proof   the lifecycle: create, receive, send, two contacts open a claim, an early payout refused by the
 *           network, the owner stops the claim, contacts open a second claim; then, once the review has
 *           matured (PUSAKA_LIVE_WAIT=1 waits up to an hour), anyone pays the heirs
 *   demo    example plans for visitors: each opens a claim after its inactivity period, so anyone can press
 *           "Pay the heirs" in the app once the review matures. PUSAKA_LIVE_DEMO lists the review
 *           durations in seconds, one plan each (default "512,512,512"); "512:active" leaves that plan
 *           past its deadline for a visitor to open. PUSAKA_LIVE_DEMO_DEPOSIT sets each deposit (22000)
 *   sweep   send every plain coin the helper keys hold back to the owner key (index 0)
 *
 * Broadcasting on mainnet also needs PUSAKA_LIVE_MAINNET=yes. The public record of every transaction and
 * plan is kept in scripts/v2/.live-<network>.json (no keys).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ethers, network } from '@solidcash/solidhat/hardhat3';
import { SignatureTemplate, Signer, TransactionBuilder, type Utxo } from '@solidcash/solidcash';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { binToHex, encodeTransaction, hexToBin, sha256 } from '@bitauth/libauth';
import {
  attachPusakaV2Plan,
  buildCancelClaimTx,
  buildContactApproveTx,
  buildFinalizeClaimTx,
  buildGenesisV2PlanTx,
  buildOpenClaimByInactivityTx,
  buildSendTx,
  buildSweepInboxTx,
  discoverPusakaV2State,
  encodePusakaV2PlanLink,
  ensureGenesisUtxo,
  finalizeBuilderTxHex,
  type PusakaV2PlanMetadata,
} from '../../../app/src/lib/protocol/pusaka-v2.ts';

type Actor = { address: string; pkh: Uint8Array; publicKey: Uint8Array; privateKey?: Uint8Array; signatureTemplate?: SignatureTemplate };
type Step = { step: string; txid?: string; bytes?: number; fee?: string; note?: string; at: string };
type ProofRecord = { metadata?: PusakaV2PlanMetadata; link?: string; phase: string; steps: Step[] };
type DemoRecord = {
  title: string;
  metadata: PusakaV2PlanMetadata;
  link: string;
  reviewSeconds: number;
  /** Left open past its deadline so a visitor can open the claim themselves. */
  keepActive?: boolean;
  phase: 'created' | 'active' | 'review' | 'paid';
  steps: Step[];
};
type LiveRecord = { network: string; proof?: ProofRecord; demo: DemoRecord[] };

const NET = network.name;
if (NET !== 'chipnet' && NET !== 'mainnet') throw new Error(`Use --network chipnet or --network mainnet (got ${NET})`);
const JOB = process.env.PUSAKA_LIVE ?? 'status';
const FILE = resolve(`scripts/v2/.live-${NET}.json`);
const provider = process.env.ELECTRUM_HOST
  ? new ElectrumNetworkProvider(NET, { hostname: process.env.ELECTRUM_HOST })
  : new ElectrumNetworkProvider(NET);
const explorer = NET === 'mainnet' ? 'https://explorer.bch.ninja/tx/' : 'https://chipnet.chaingraph.cash/tx/';
const appBase = NET === 'mainnet' ? 'https://astrorehan.github.io/pusaka-bch' : 'https://astrorehan.github.io/pusaka-bch/chipnet';

const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

function canBroadcast() {
  if (NET === 'mainnet' && process.env.PUSAKA_LIVE_MAINNET !== 'yes') {
    throw new Error('Mainnet broadcasts need PUSAKA_LIVE_MAINNET=yes');
  }
}

function load(): LiveRecord {
  return existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { network: NET, demo: [] };
}
/** Write back only the part this job changes, so two jobs running side by side don't undo each other. */
function save(record: LiveRecord) {
  const onDisk = load();
  const merged: LiveRecord = {
    network: NET,
    proof: JOB === 'proof' ? record.proof : onDisk.proof,
    demo: JOB === 'proof' ? onDisk.demo : record.demo,
  };
  writeFileSync(FILE, JSON.stringify(merged, null, 2) + '\n');
}

async function retry<T>(fn: () => Promise<T>, label: string, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const message = String((err as Error)?.message ?? err);
      if (!/socket|disconnect|timed? ?out|1006|econn|closed|connection|out of range/i.test(message) || i === attempts - 1) throw err;
      log(`  retry ${label}: ${message.slice(0, 80)}`);
      await sleep(2_000 * (i + 1));
    }
  }
  throw last;
}

async function medianTimePast(height?: number): Promise<number> {
  return retry(async () => {
    const tip = height ?? Number(await provider.getBlockHeight());
    const times: number[] = [];
    for (let h = tip; h > tip - 11; h--) {
      const header = hexToBin(String(await provider.performRequest('blockchain.block.header', h)));
      times.push(new DataView(header.buffer, header.byteOffset).getUint32(68, true));
    }
    return times.sort((a, b) => a - b)[5];
  }, 'medianTimePast');
}

const template = (a: Actor) => a.signatureTemplate ?? new SignatureTemplate(a.privateKey!);

/** Signs only its own P2PKH inputs of the request it is handed, like a WizardConnect wallet. */
function externalSigner(name: string, actor: Actor) {
  const unlocker = template(actor).unlockP2PKH();
  const own = binToHex(unlocker.generateLockingBytecode());
  return Signer.external(
    {
      address: actor.address,
      publicKey: actor.publicKey,
      userPrompt: `Pusaka (${name})`,
      wallet: {
        async signTransaction({ transaction, sourceOutputs }: any) {
          let signed = 0;
          const inputs = transaction.inputs.map((input: any, i: number) => {
            if (binToHex(sourceOutputs[i].lockingBytecode) !== own) return input;
            signed++;
            return { ...input, unlockingBytecode: unlocker.generateUnlockingBytecode({ transaction, sourceOutputs, inputIndex: i }) };
          });
          if (signed === 0) throw new Error(`${name} refused a request with none of its inputs`);
          return { signedTransaction: binToHex(encodeTransaction({ ...transaction, inputs })) };
        },
      },
    },
    provider,
  );
}

async function plainCoins(address: string): Promise<Utxo[]> {
  return (await retry(() => provider.getUtxos(address), 'getUtxos'))
    .filter((u) => !u.token)
    .sort((a, b) => (a.satoshis > b.satoshis ? -1 : 1));
}
async function plainBalance(address: string) {
  return (await plainCoins(address)).reduce((s, u) => s + u.satoshis, 0n);
}

const spent = new Set<string>();
const key = (u: { txid: string; vout: number }) => `${u.txid}:${u.vout}`;

async function coinAt(address: string, minimum: bigint): Promise<Utxo> {
  for (let i = 0; i < 30; i++) {
    const hit = (await plainCoins(address)).find((u) => u.satoshis >= minimum && !spent.has(key(u)));
    if (hit) return hit;
    await sleep(2_000);
  }
  throw new Error(`No plain coin of at least ${minimum} sats at ${address}`);
}

async function broadcast(builder: TransactionBuilder, label: string): Promise<{ txid: string; bytes: number }> {
  canBroadcast();
  const hex = await finalizeBuilderTxHex(builder);
  const expected = binToHex(sha256.hash(sha256.hash(hexToBin(hex))).reverse());
  for (const input of builder.inputs) spent.add(key(input));
  const response = await retry(() => provider.sendRawTransaction(hex), label);
  const txid = typeof response === 'string' ? response : (response as { txid?: string }).txid;
  if (txid !== expected) throw new Error(`${label}: the node answered ${String(txid)}, expected ${expected}`);
  log(`  ${label}: ${explorer}${txid} (${hex.length / 2} bytes)`);
  await sleep(2_500);
  return { txid, bytes: hex.length / 2 };
}

/** Pay `amount` from the owner to `to`, unless `to` already holds a big enough unspent coin. */
async function fund(owner: Actor, to: string, amount: bigint): Promise<Utxo> {
  const existing = (await plainCoins(to)).find((u) => u.satoshis >= amount && !spent.has(key(u)));
  if (existing) return existing;
  const source = await coinAt(owner.address, amount + 1_000n);
  const builder = new TransactionBuilder({ provider })
    .addInput(source, template(owner).unlockP2PKH())
    .addOutput({ to, amount });
  const change = source.satoshis - amount - 400n;
  if (change >= 546n) builder.addOutput({ to: owner.address, amount: change });
  const { txid } = await broadcast(builder, `fund ${to.slice(-8)}`);
  for (let i = 0; i < 30; i++) {
    const hit = (await plainCoins(to)).find((u) => u.txid === txid);
    if (hit) return hit;
    await sleep(2_000);
  }
  throw new Error(`Funding ${txid} did not appear at ${to}`);
}

async function planState(metadata: PusakaV2PlanMetadata, txid?: string) {
  const handle = await attachPusakaV2Plan(metadata, provider);
  for (let i = 0; i < 30; i++) {
    const state = await retry(() => discoverPusakaV2State(handle), 'discover');
    if (state.planUtxo && (!txid || state.planUtxo.txid === txid)) return { handle, state };
    await sleep(2_000);
  }
  throw new Error(`The plan has not indexed${txid ? ` transaction ${txid}` : ''}`);
}

/** Age, in network time, of the confirmed claim anchor; 0 while it is unconfirmed. */
async function anchorAge(metadata: PusakaV2PlanMetadata, anchor: Utxo): Promise<{ age: number; height: number; tip: number }> {
  const scriptHash = binToHex(sha256.hash(hexToBin(metadata.anchorLockHex)).reverse());
  const coins = (await retry(
    () => provider.performRequest('blockchain.scripthash.listunspent', scriptHash, 'include_tokens'),
    'listunspent',
  )) as Array<{ tx_hash: string; tx_pos: number; height: number }>;
  const hit = coins.find((c) => c.tx_hash === anchor.txid && c.tx_pos === anchor.vout);
  const tip = Number(await retry(() => provider.getBlockHeight(), 'height'));
  if (!hit || hit.height <= 0) return { age: 0, height: 0, tip };
  return { age: (await medianTimePast(tip)) - (await medianTimePast(hit.height - 1)), height: hit.height, tip };
}

function step(list: Step[], name: string, extra: Partial<Step> = {}) {
  list.push({ step: name, at: now(), ...extra });
}

async function actors() {
  const signers = (await ethers.getSigners(12)) as unknown as Actor[];
  const [owner, sender, c0, c1, c2, h0, h1, h2, h3, h4, h5] = signers;
  return { owner, sender, contacts: [c0, c1, c2], heirs: [h0, h1, h2, h3, h4, h5], all: signers };
}

async function createPlan(
  owner: Actor,
  policy: Parameters<typeof buildGenesisV2PlanTx>[0]['policy'],
  depositSats: bigint,
  label: string,
) {
  canBroadcast();
  const signer = externalSigner('owner', owner);
  const { genesisUtxo, preTxid } = await ensureGenesisUtxo({
    provider,
    ownerAddress: owner.address,
    ownerUnlocker: template(owner).unlockP2PKH(),
    minimumSats: depositSats + 3_500n,
  });
  if (preTxid) {
    spent.add(`${preTxid}:0`);
    log(`  prepared a coin at output 0: ${explorer}${preTxid}`);
  }
  const genesis = buildGenesisV2PlanTx({
    protocolRevision: 'assets-1',
    provider,
    genesisUtxo,
    ownerUnlocker: signer.unlockP2PKH(),
    ownerAddress: owner.address,
    ownerPkh: owner.pkh,
    policy,
    createdAtLocktime: (await medianTimePast()) - 1,
    initialDepositSats: depositSats,
  });
  const sent = await broadcast(genesis.builder, label);
  return { ...sent, fee: genesis.fee, metadata: genesis.metadata };
}

// ---------------------------------------------------------------- status

async function status() {
  const { owner, all } = await actors();
  const height = await retry(() => provider.getBlockHeight(), 'height');
  log(`network ${NET}, height ${height}, network time ${new Date((await medianTimePast()) * 1000).toISOString()}`);
  log(`funding address (owner): ${owner.address}`);
  log(`owner plain balance: ${await plainBalance(owner.address)} sats`);
  let helpers = 0n;
  for (const a of all.slice(1)) helpers += await plainBalance(a.address);
  log(`helper keys plain balance: ${helpers} sats`);
  const record = load();
  const plans = [
    ...(record.proof?.metadata ? [{ title: 'lifecycle proof', metadata: record.proof.metadata }] : []),
    ...record.demo.map((d) => ({ title: d.title, metadata: d.metadata })),
  ];
  for (const { title, metadata } of plans) {
    try {
      const { state } = await planState(metadata);
      let review = '';
      if (state.status === 'REVIEW' && state.anchorUtxo) {
        const a = await anchorAge(metadata, state.anchorUtxo);
        review = a.height ? ` review age ${a.age}s of ${metadata.effectiveReviewSeconds}s` : ' claim anchor unconfirmed';
      }
      log(`${title}: ${state.status}, ${state.planBalanceSats} sats in plan, deadline ${new Date(state.deadline * 1000).toISOString()}${review}`);
    } catch (err) {
      log(`${title}: ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------- proof

async function proof() {
  const { owner, sender, contacts, heirs } = await actors();
  const record = load();
  const p: ProofRecord = (record.proof ??= { phase: 'start', steps: [] });
  const small = NET === 'chipnet';
  const save$ = () => save(record);

  if (p.phase === 'start') {
    log('1. create the plan');
    const created = await createPlan(
      owner,
      {
        // A long inactivity period: this plan's claims come from the trusted contacts.
        inactivityPeriodSeconds: 30 * 86_400,
        reviewPeriodSeconds: 512,
        feeBudget: 5_000n,
        contacts: [contacts[0].pkh, contacts[1].pkh, contacts[2].pkh],
        // Faraid for a wife, a son and a daughter: 1/8 to the wife, the rest 2:1 to the son and daughter.
        heirs: [
          { pkh: heirs[0].pkh, share: 3, label: 'Wife' },
          { pkh: heirs[1].pkh, share: 14, label: 'Son' },
          { pkh: heirs[2].pkh, share: 7, label: 'Daughter' },
        ],
      },
      small ? 10_000n : 20_000n,
      'create plan',
    );
    p.metadata = created.metadata;
    p.link = `${appBase}${encodePusakaV2PlanLink(created.metadata, '/v2/plan')}`;
    step(p.steps, 'create', { txid: created.txid, bytes: created.bytes, fee: created.fee.toString() });
    p.phase = 'created';
    save$();
  }
  const metadata = p.metadata!;

  if (p.phase === 'created') {
    log('2. someone pays the plan\'s receive address; then the payment is collected into the balance');
    const deadlineBefore = (await planState(metadata)).state.deadline;
    const payer = await fund(owner, sender.address, small ? 3_500n : 8_000n);
    const pay = new TransactionBuilder({ provider })
      .addInput(payer, template(sender).unlockP2PKH())
      .addOutput({ to: metadata.inboxAddress, amount: payer.satoshis - 400n });
    const paid = await broadcast(pay, 'receive');
    step(p.steps, 'receive', { txid: paid.txid, bytes: paid.bytes, note: `${payer.satoshis - 400n} sats to the receive address` });
    let inbox: Utxo[] = [];
    let state = (await planState(metadata)).state;
    for (let i = 0; i < 30 && !inbox.length; i++) {
      state = (await planState(metadata)).state;
      inbox = state.inboxUtxos.filter((u) => u.txid === paid.txid);
      if (!inbox.length) await sleep(2_000);
    }
    const { handle } = await planState(metadata);
    // The receipt pays its own collection fee while that fee is within the inbox covenant's cap;
    // a single receipt into an asset-revision plan exceeds it, so a wallet (here the owner's) pays instead.
    let sweep: ReturnType<typeof buildSweepInboxTx>;
    try {
      sweep = buildSweepInboxTx({ handle, planUtxo: state.planUtxo!, inboxUtxos: inbox, mode: 'self' });
    } catch (err) {
      if (!/exceeds covenant cap|insufficient to cover/.test(String((err as Error).message))) throw err;
      log(`  ${(err as Error).message}; the owner's wallet pays the collection fee instead`);
      sweep = buildSweepInboxTx({
        handle,
        planUtxo: state.planUtxo!,
        inboxUtxos: inbox,
        mode: 'sponsored',
        sponsorUtxo: await coinAt(owner.address, 6_000n),
        sponsorUnlocker: externalSigner('owner', owner).unlockP2PKH(),
        sponsorChangeAddress: owner.address,
      });
    }
    const swept = await broadcast(sweep.builder, 'collect');
    const after = (await planState(metadata, swept.txid)).state;
    if (after.deadline !== deadlineBefore) throw new Error('An incoming payment moved the owner deadline');
    step(p.steps, 'collect', {
      txid: swept.txid,
      bytes: swept.bytes,
      fee: sweep.fee.toString(),
      note: `${sweep.mode === 'self' ? 'fee paid from the receipt' : "fee paid by the owner's wallet"}; deadline unchanged: a receipt is not proof of life`,
    });
    p.phase = 'received';
    save$();
  }

  if (p.phase === 'received') {
    log('3. the owner sends part of the balance; the same transaction renews activity');
    const { handle, state } = await planState(metadata);
    const signer = externalSigner('owner', owner);
    const coin = await coinAt(owner.address, 600n);
    const send = buildSendTx({
      handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: coin,
      ownerUnlocker: signer.unlockP2PKH(),
      ownerChangeAddress: owner.address,
      recipientAddressOrLock: sender.address,
      amount: small ? 1_000n : 2_000n,
      locktime: (await medianTimePast()) - 1,
    });
    const sent = await broadcast(send.builder, 'send');
    step(p.steps, 'send', {
      txid: sent.txid,
      bytes: sent.bytes,
      fee: send.fee.toString(),
      note: `paid ${small ? 1_000 : 2_000} sats; deadline moved to ${new Date(send.nextDeadline * 1000).toISOString()}`,
    });
    p.phase = 'sent';
    save$();
  }

  const approve = async (i: number, label: string) => {
    const { handle, state } = await planState(metadata);
    if (state.status === 'REVIEW') return true;
    if (state.approvedContactIndices.includes(i)) {
      log(`  ${label}: already confirmed in this round`);
      return false;
    }
    // The confirmation that reaches the quorum also funds the 1,000-sat claim anchor (about 5,300 sats in all).
    const coin = await fund(owner, contacts[i].address, small ? 7_500n : 9_000n);
    const tx = buildContactApproveTx({
      handle,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: i,
      contactUtxo: coin,
      contactUnlocker: template(contacts[i]).unlockP2PKH(),
      contactChangeAddress: contacts[i].address,
    });
    const done = await broadcast(tx.builder, label);
    step(p.steps, label, { txid: done.txid, bytes: done.bytes, fee: tx.fee.toString(), note: tx.enteredReview ? 'quorum reached: review started' : 'first confirmation, no payout right' });
    save$();
    await planState(metadata, done.txid);
    return tx.enteredReview;
  };

  if (p.phase === 'sent') {
    log('4. two trusted contacts confirm a claim');
    await approve(0, 'contact 1 confirms');
    if (!(await approve(1, 'contact 2 confirms'))) throw new Error('The second confirmation did not open the review');
    p.phase = 'review1';
    save$();
  }

  if (p.phase === 'review1') {
    log('5. an immediate payout is refused by the network');
    const { handle, state } = await planState(metadata);
    const early = buildFinalizeClaimTx({ handle, planUtxo: state.planUtxo!, anchorUtxo: state.anchorUtxo! });
    canBroadcast();
    try {
      await provider.sendRawTransaction(await finalizeBuilderTxHex(early.builder));
      throw new Error('UNEXPECTED: the network accepted a payout before the review period');
    } catch (err) {
      const message = String((err as Error)?.message ?? err);
      if (!/BIP68|non-final|sequence/i.test(message)) throw err;
      log(`  refused: ${message.slice(0, 160)}`);
      step(p.steps, 'early payout refused', { note: message.slice(0, 200) });
    }
    log('6. the owner stops the claim');
    const signer = externalSigner('owner', owner);
    const fresh = (await planState(metadata)).state;
    const cancel = buildCancelClaimTx({
      handle,
      planUtxo: fresh.planUtxo!,
      anchorUtxo: fresh.anchorUtxo!,
      ownerUtxo: await coinAt(owner.address, 600n),
      ownerUnlocker: signer.unlockP2PKH(),
      ownerChangeAddress: owner.address,
      locktime: (await medianTimePast()) - 1,
    });
    const stopped = await broadcast(cancel.builder, 'stop claim');
    step(p.steps, 'stop claim', { txid: stopped.txid, bytes: stopped.bytes, fee: cancel.fee.toString(), note: 'claim cancelled; earlier confirmations no longer count' });
    const back = (await planState(metadata, stopped.txid)).state;
    if (back.status !== 'ACTIVE') throw new Error(`Expected ACTIVE after the owner stopped the claim, got ${back.status}`);
    p.phase = 'cancelled';
    save$();
  }

  if (p.phase === 'cancelled') {
    log('7. the contacts open a second claim, which is left to mature');
    await approve(1, 'contact 2 confirms again');
    if (!(await approve(2, 'contact 3 confirms'))) throw new Error('The confirmations did not open the review');
    p.phase = 'review2';
    save$();
  }

  if (p.phase === 'review2') {
    const { handle, state } = await planState(metadata);
    const started = Date.now();
    for (;;) {
      const a = await anchorAge(metadata, state.anchorUtxo!);
      log(`  review: anchor height ${a.height || 'unconfirmed'}, tip ${a.tip}, age ${a.age}s of ${metadata.effectiveReviewSeconds}s`);
      if (a.height && a.age >= metadata.effectiveReviewSeconds) break;
      if (process.env.PUSAKA_LIVE_WAIT !== '1' || Date.now() - started > 60 * 60_000) {
        log('  not mature yet; run again later (PUSAKA_LIVE_WAIT=1 waits up to an hour)');
        return;
      }
      await sleep(60_000);
    }
    log('8. the review has matured: anyone pays the heirs');
    const pay = buildFinalizeClaimTx({ handle, planUtxo: state.planUtxo!, anchorUtxo: state.anchorUtxo! });
    const paid = await broadcast(pay.builder, 'pay the heirs');
    step(p.steps, 'pay the heirs', {
      txid: paid.txid,
      bytes: paid.bytes,
      fee: pay.fee.toString(),
      note: pay.heirPayouts.map((h, i) => `${metadata.heirs[i]?.label ?? `heir ${i + 1}`} ${h.amount}`).join(', '),
    });
    p.phase = 'paid';
    save$();
    log('Lifecycle complete.');
  }
}

// ---------------------------------------------------------------- demo plans

const DEMO_FAMILY = [
  { label: 'Aisha (wife)', share: 15 },
  { label: 'Yusuf (father)', share: 20 },
  { label: 'Mariam (mother)', share: 20 },
  { label: 'Omar (son)', share: 26 },
  { label: 'Idris (son)', share: 26 },
  { label: 'Layla (daughter)', share: 13 },
];

async function demo() {
  const { owner, contacts, heirs } = await actors();
  const record = load();
  // "512" opens the claim after the deadline; "512:active" leaves the plan for a visitor to open.
  const wanted = (process.env.PUSAKA_LIVE_DEMO ?? '512,512,512').split(',').map((s) => {
    const [seconds, mode] = s.trim().split(':');
    return { seconds: Number(seconds), keepActive: mode === 'active' };
  }).filter((w) => w.seconds > 0);
  // Opening the claim (about 4,200 sats), the claim marker (1,000), the payout fee budget (5,000) and the
  // plan's own 1,000 all come out of the deposit before the six heirs share the rest.
  const deposit = BigInt(process.env.PUSAKA_LIVE_DEMO_DEPOSIT ?? '22000');

  for (let i = record.demo.length; i < wanted.length; i++) {
    log(`demo plan ${i + 1}: create (review ${wanted[i].seconds}s${wanted[i].keepActive ? ', left for a visitor to open' : ''})`);
    const created = await createPlan(
      owner,
      {
        inactivityPeriodSeconds: 60,
        reviewPeriodSeconds: wanted[i].seconds,
        feeBudget: 5_000n,
        contacts: [contacts[0].pkh, contacts[1].pkh, contacts[2].pkh],
        heirs: DEMO_FAMILY.map((h, j) => ({ pkh: heirs[j].pkh, share: h.share, label: h.label })),
      },
      deposit,
      `create demo plan ${i + 1}`,
    );
    const entry: DemoRecord = {
      title: `demo plan ${i + 1}`,
      metadata: created.metadata,
      link: `${appBase}${encodePusakaV2PlanLink(created.metadata, '/v2/plan')}`,
      reviewSeconds: wanted[i].seconds,
      ...(wanted[i].keepActive ? { keepActive: true } : {}),
      phase: wanted[i].keepActive ? 'active' : 'created',
      steps: [],
    };
    step(entry.steps, 'create', { txid: created.txid, bytes: created.bytes, fee: created.fee.toString() });
    record.demo.push(entry);
    save(record);
  }

  for (const entry of record.demo) {
    if (entry.phase !== 'created') continue;
    const { handle, state } = await planState(entry.metadata);
    if (state.status !== 'ACTIVE') {
      entry.phase = state.status === 'PAID_OUT' ? 'paid' : 'review';
      continue;
    }
    let mtp = await medianTimePast();
    while (mtp <= state.deadline) {
      if (process.env.PUSAKA_LIVE_WAIT !== '1') {
        log(`${entry.title}: network time ${mtp} has not passed the deadline ${state.deadline}; run again later`);
        break;
      }
      log(`${entry.title}: waiting for the network time to pass the deadline (${state.deadline - mtp}s to go)`);
      await sleep(60_000);
      mtp = await medianTimePast();
    }
    if (mtp <= state.deadline) continue;
    log(`${entry.title}: open the claim after inactivity`);
    const open = buildOpenClaimByInactivityTx({ handle, planUtxo: state.planUtxo!, locktime: mtp - 1 });
    const opened = await broadcast(open.builder, `open claim on ${entry.title}`);
    step(entry.steps, 'open claim after inactivity', { txid: opened.txid, bytes: opened.bytes, fee: open.fee.toString() });
    entry.phase = 'review';
    save(record);
  }
}

// ---------------------------------------------------------------- sweep

async function sweepHelpers() {
  const { owner, all } = await actors();
  for (const a of all.slice(1)) {
    const coins = (await plainCoins(a.address)).filter((u) => !spent.has(key(u)));
    const total = coins.reduce((s, u) => s + u.satoshis, 0n);
    const fee = 200n + 150n * BigInt(coins.length);
    if (total < fee + 546n) continue;
    const builder = new TransactionBuilder({ provider });
    for (const u of coins) builder.addInput(u, template(a).unlockP2PKH());
    builder.addOutput({ to: owner.address, amount: total - fee });
    await broadcast(builder, `sweep ${a.address.slice(-8)}`);
  }
}

// ---------------------------------------------------------------- preview

/** Build, without broadcasting, the payout each plan under review would make now. */
async function preview() {
  const record = load();
  const plans = [
    ...(record.proof?.metadata ? [{ title: 'lifecycle proof', metadata: record.proof.metadata }] : []),
    ...record.demo.map((d) => ({ title: d.title, metadata: d.metadata })),
  ];
  for (const { title, metadata } of plans) {
    const { handle, state } = await planState(metadata);
    if (state.status !== 'REVIEW' || !state.anchorUtxo) {
      log(`${title}: ${state.status}, nothing to preview`);
      continue;
    }
    try {
      const pay = buildFinalizeClaimTx({ handle, planUtxo: state.planUtxo!, anchorUtxo: state.anchorUtxo });
      log(`${title}: plan ${state.planUtxo!.satoshis} + anchor ${state.anchorUtxo.satoshis}; fee ${pay.fee}; carrier after ${pay.planCarrierAfter}; leftover ${pay.leftover}; heirs ${pay.heirPayouts.map((h) => h.amount).join(' / ')}`);
    } catch (err) {
      log(`${title}: payout cannot be built: ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------- top up

/** Pay PUSAKA_LIVE_TOPUP sats into each demo plan under review whose payout cannot be built yet, then collect it. */
async function topUp() {
  const { owner, sender } = await actors();
  const record = load();
  const amount = BigInt(process.env.PUSAKA_LIVE_TOPUP ?? '8000');
  for (const entry of record.demo) {
    const { handle, state } = await planState(entry.metadata);
    if (state.status !== 'REVIEW' || !state.anchorUtxo) continue;
    try {
      buildFinalizeClaimTx({ handle, planUtxo: state.planUtxo!, anchorUtxo: state.anchorUtxo });
      continue;
    } catch {
      // Not payable yet: top it up.
    }
    const payer = await fund(owner, sender.address, amount + 400n);
    const pay = new TransactionBuilder({ provider })
      .addInput(payer, template(sender).unlockP2PKH())
      .addOutput({ to: entry.metadata.inboxAddress, amount: payer.satoshis - 400n });
    const paid = await broadcast(pay, `top up ${entry.title}`);
    let inbox: Utxo[] = [];
    let current = state;
    for (let i = 0; i < 30 && !inbox.length; i++) {
      current = (await planState(entry.metadata)).state;
      inbox = current.inboxUtxos.filter((u) => u.txid === paid.txid);
      if (!inbox.length) await sleep(2_000);
    }
    const sweep = buildSweepInboxTx({
      handle,
      planUtxo: current.planUtxo!,
      inboxUtxos: inbox,
      mode: 'sponsored',
      sponsorUtxo: await coinAt(owner.address, 6_000n),
      sponsorUnlocker: externalSigner('owner', owner).unlockP2PKH(),
      sponsorChangeAddress: owner.address,
    });
    const swept = await broadcast(sweep.builder, `collect into ${entry.title}`);
    step(entry.steps, 'top up', { txid: paid.txid, note: `${payer.satoshis - 400n} sats to the receive address` });
    step(entry.steps, 'collect', { txid: swept.txid, bytes: swept.bytes, fee: sweep.fee.toString(), note: 'collected during the review; the claim and its clock are unchanged' });
    save(record);
  }
}

const jobs: Record<string, () => Promise<void>> = { status, proof, demo, preview, topup: topUp, sweep: sweepHelpers };
if (!jobs[JOB]) throw new Error(`Unknown PUSAKA_LIVE job ${JOB}`);
jobs[JOB]()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
