/**
 * Repeatable live Chipnet verification script for Pusaka v2 Stage 3.
 *
 * Usage (read-only status & balance check):
 *   node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/pusaka-v2-chipnet.ts --network chipnet
 *
 * Usage (full live Chipnet lifecycle + non-BIP68-final rejection + exit & post-exit recovery):
 *   $env:PUSAKA_V2_CHIPNET_BROADCAST="1"; node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/pusaka-v2-chipnet.ts --network chipnet
 *
 * Usage (leave final REVIEW open in public checkpoint JSON, then resume after >=512s MTP / 6 blocks):
 *   $env:PUSAKA_V2_CHIPNET_BROADCAST="1"; $env:PUSAKA_V2_LEAVE_REVIEW="1"; node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/pusaka-v2-chipnet.ts --network chipnet
 *   $env:PUSAKA_V2_CHIPNET_RESUME="1"; node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/pusaka-v2-chipnet.ts --network chipnet
 * Add PUSAKA_V2_CHIPNET_WAIT=1 to wait (at most one hour) for the confirmed anchor's
 * actual BIP68 age before resuming. The checkpoint is kept if the wait times out.
 *
 * Security: uses only SOLIDCASH_MNEMONIC_CHIPNET via solidhat --network chipnet; never logs mnemonics or keys.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ethers, network } from '@solidcash/solidhat/hardhat3';
import {
  SignatureTemplate,
  Signer,
  TransactionBuilder,
  type ExternalTransactionSigner,
  type Utxo,
} from '@solidcash/solidcash';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { binToHex, encodeTransaction, hexToBin, sha256 } from '@bitauth/libauth';
import {
  attachPusakaV2Plan,
  buildCancelClaimTx,
  buildCheckInTx,
  buildContactApproveTx,
  buildDistributeLateTx,
  buildFinalizeClaimTx,
  buildGenesisV2PlanTx,
  buildOwnerExitTx,
  buildSendTx,
  buildSweepInboxTx,
  buildUpdatePolicyTx,
  computePolicyPayoutPreview,
  decodePusakaV2PlanLink,
  DEFAULT_FEE_BUDGET,
  discoverPusakaV2State,
  encodePusakaV2PlanLink,
  ensureGenesisUtxo,
  equalShares,
  faraidResultantShares,
  finalizeBuilderTxHex,
  type PusakaV2PlanMetadata,
} from './pusaka-v2.ts';

const CHECKPOINT_FILE = resolve('scripts/v2/.pusaka-v2-chipnet-checkpoint.json');
const COMPLETED_PROOF_FILE = resolve('scripts/v2/.pusaka-v2-chipnet-completed.json');
const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);

function isTransientNetworkError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return /socket|disconnect|timeout|1006|econn|econnaborted|econnreset|etimedout|closed|connection/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientNetworkError(err) || i === attempts - 1) throw err;
      const delayMs = 1_500 * (i + 1);
      log(`  [retry ${i + 1}/${attempts - 1}] ${label} transient error, waiting ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function signerTemplate(signer: any): SignatureTemplate {
  if (signer.signatureTemplate) return signer.signatureTemplate;
  if (signer.privateKey) return new SignatureTemplate(signer.privateKey);
  throw new Error('Signer does not expose privateKey or signatureTemplate');
}

function makeStrictExternalSigner(
  name: string,
  signer: any,
  provider: ElectrumNetworkProvider,
): Signer {
  const tpl = signerTemplate(signer);
  const unlocker = tpl.unlockP2PKH();
  const ownLockHex = binToHex(unlocker.generateLockingBytecode());
  const wallet: ExternalTransactionSigner = {
    async signTransaction(request) {
      const { transaction, sourceOutputs } = request;
      if (sourceOutputs.length !== transaction.inputs.length) {
        throw new Error('sourceOutputs length mismatch');
      }
      let signed = 0;
      const inputs = transaction.inputs.map((inp, idx) => {
        if (inp.unlockingBytecode.length !== 0) {
          throw new Error(`Expected empty unlockingBytecode at input ${idx}`);
        }
        if (binToHex(sourceOutputs[idx].lockingBytecode) !== ownLockHex) {
          return inp;
        }
        signed++;
        return {
          ...inp,
          unlockingBytecode: unlocker.generateUnlockingBytecode({
            transaction,
            sourceOutputs,
            inputIndex: idx,
          }),
        };
      });
      if (signed === 0) {
        throw new Error(`[${name}] refused to sign tx with 0 own P2PKH inputs`);
      }
      const hex = binToHex(encodeTransaction({ ...transaction, inputs }));
      log(`  [${name}] externally signed ${signed}/${inputs.length} inputs (${hex.length / 2} B)`);
      return { signedTransaction: hex };
    },
  };
  return Signer.external(
    { wallet, address: signer.address, publicKey: signer.publicKey, userPrompt: `Pusaka v2 (${name})` },
    provider,
  );
}

async function medianTimePast(provider: ElectrumNetworkProvider, atHeight?: number): Promise<number> {
  return withRetry(async () => {
    const height = atHeight ?? Number(await provider.getBlockHeight());
    const times: number[] = [];
    for (let h = height; h > height - 11; h--) {
      const headerHex = String(await provider.performRequest('blockchain.block.header', h));
      times.push(new DataView(hexToBin(headerHex).buffer).getUint32(68, true));
    }
    times.sort((a, b) => a - b);
    return times[5];
  }, 'medianTimePast');
}

async function sumPlainSats(provider: ElectrumNetworkProvider, address: string): Promise<bigint> {
  const utxos = await withRetry(() => provider.getUtxos(address), 'sumPlainSats');
  return utxos.filter((u) => !u.token).reduce((s, u) => s + u.satoshis, 0n);
}

async function waitForNewPlainUtxo(
  provider: ElectrumNetworkProvider,
  address: string,
  minSats: bigint,
  exclude = new Set<string>(),
): Promise<Utxo> {
  for (let i = 0; i < 20; i++) {
    const utxos = await withRetry(() => provider.getUtxos(address), 'getUtxos');
    const hit = utxos
      .filter((u) => !u.token && u.satoshis >= minSats && !exclude.has(`${u.txid}:${u.vout}`))
      .sort((a, b) => Number(b.satoshis - a.satoshis))[0];
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for >= ${minSats} sats plain UTXO at ${address}`);
}

async function waitExactOutpoint(
  provider: ElectrumNetworkProvider,
  address: string,
  txid: string,
  minSats: bigint,
  maxSats?: bigint,
): Promise<Utxo> {
  for (let i = 0; i < 20; i++) {
    const utxos = await withRetry(() => provider.getUtxos(address), 'waitExactOutpoint');
    const hit = utxos.find(
      (u) =>
        !u.token &&
        u.txid === txid &&
        u.satoshis >= minSats &&
        (maxSats === undefined || u.satoshis <= maxSats),
    );
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for outpoint from ${txid} at ${address}`);
}

async function ensurePlainBalance(
  provider: ElectrumNetworkProvider,
  fromAddress: string,
  fromTpl: SignatureTemplate,
  toAddress: string,
  neededSats: bigint,
  spentOutpoints: Set<string>,
): Promise<Utxo> {
  const existing = (await withRetry(() => provider.getUtxos(toAddress), 'ensurePlainBalance.getUtxos'))
    .filter((u) => !u.token && u.satoshis >= neededSats && !spentOutpoints.has(`${u.txid}:${u.vout}`))
    .sort((a, b) => Number(b.satoshis - a.satoshis))[0];
  if (existing) return existing;

  const fromCoin = await waitForNewPlainUtxo(provider, fromAddress, neededSats + 500n, spentOutpoints);
  spentOutpoints.add(`${fromCoin.txid}:${fromCoin.vout}`);
  const fundBuilder = new TransactionBuilder({ provider })
    .addInput(fromCoin, fromTpl.unlockP2PKH())
    .addOutput({ to: toAddress, amount: neededSats });
  const change = fromCoin.satoshis - neededSats - 400n;
  if (change >= 600n) {
    fundBuilder.addOutput({ to: fromAddress, amount: change });
  }
  const txid = await withRetry(() => provider.sendRawTransaction(fundBuilder.build()), 'ensurePlainBalance.send');
  log('  funded', toAddress, neededSats.toString(), 'sats -> txid', txid);
  return waitForNewPlainUtxo(provider, toAddress, neededSats, spentOutpoints);
}

async function waitPlanTxid(handle: any, expectedTxid: string) {
  for (let i = 0; i < 20; i++) {
    const s = await withRetry(() => discoverPusakaV2State(handle), 'waitPlanTxid');
    if (s.planUtxo?.txid === expectedTxid) return s;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for plan UTXO from tx ${expectedTxid}`);
}

async function sendTx(
  provider: ElectrumNetworkProvider,
  builder: TransactionBuilder,
  spentOutpoints: Set<string>,
): Promise<{ txid: string; bytes: number }> {
  const hex = await finalizeBuilderTxHex(builder);
  for (const inp of builder.inputs) {
    spentOutpoints.add(`${inp.txid}:${inp.vout}`);
  }
  const txid = await withRetry(() => provider.sendRawTransaction(hex), 'sendRawTransaction');
  return { txid, bytes: hex.length / 2 };
}

interface PublicCheckpoint {
  metadata: PusakaV2PlanMetadata;
  openReviewTxid: string;
  openedAtMtp: number;
  effectiveReviewSeconds: number;
  originStatus?: 'CLOSED' | 'ACTIVE';
  finalizeTxid?: string;
  lateDepositTxid?: string;
  lateSweepTxid?: string;
  distributeTxid?: string;
}

function saveCheckpoint(cp: PublicCheckpoint) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

/** Wait for the actual confirmed anchor age, then let the node validate the payout. */
async function waitCheckpointMaturity(provider: ElectrumNetworkProvider): Promise<void> {
  const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8')) as PublicCheckpoint;
  const handle = await attachPusakaV2Plan(cp.metadata, provider);
  const scriptHash = binToHex(sha256.hash(hexToBin(cp.metadata.anchorLockHex)).reverse());
  const started = Date.now();
  let lastTip = -1;
  let anchorHeight = 0;
  let previousMtp = 0;
  while (Date.now() - started < 60 * 60 * 1000) {
    const state = await withRetry(() => discoverPusakaV2State(handle), 'waitMaturity.state');
    if (state.status === 'PAID_OUT') return;
    if (state.status !== 'REVIEW' || !state.anchorUtxo) {
      throw new Error(`Expected a pending claim while waiting; got ${state.status}`);
    }
    const tip = Number(await withRetry(() => provider.getBlockHeight(), 'waitMaturity.tip'));
    if (tip !== lastTip) {
      const coins = await withRetry(
        () => provider.performRequest('blockchain.scripthash.listunspent', scriptHash, 'include_tokens'),
        'waitMaturity.anchor',
      ) as Array<{ tx_hash: string; tx_pos: number; height: number }>;
      const anchor = coins.find(c => c.tx_hash === state.anchorUtxo!.txid && c.tx_pos === state.anchorUtxo!.vout);
      if (anchor && anchor.height > 0 && anchor.height !== anchorHeight) {
        anchorHeight = anchor.height;
        previousMtp = await medianTimePast(provider, anchorHeight - 1);
      }
      const spendMtp = await medianTimePast(provider, tip);
      const age = anchorHeight > 0 ? spendMtp - previousMtp : 0;
      log('Maturity check:', { tip, anchorHeight, previousMtp, spendMtp, age, required: handle.policy.effectiveReviewSeconds });
      if (anchorHeight > 0 && age >= handle.policy.effectiveReviewSeconds) return;
      lastTip = tip;
    }
    await new Promise(resolve => setTimeout(resolve, 30_000));
  }
  throw new Error('Chipnet maturity wait timed out; public checkpoint retained for a later resume');
}

async function resumePendingCheckpoint(provider: ElectrumNetworkProvider, signers: any[]) {
  if (!existsSync(CHECKPOINT_FILE)) {
    throw new Error(`No checkpoint file found at ${CHECKPOINT_FILE}`);
  }
  const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8')) as PublicCheckpoint;
  const handle = await attachPusakaV2Plan(cp.metadata, provider);
  let state = await withRetry(() => discoverPusakaV2State(handle), 'resume.discover');
  const currentMtp = await medianTimePast(provider);
  const elapsed = currentMtp - cp.openedAtMtp;
  log('Checkpoint planCategory:', cp.metadata.planCategoryHex);
  log('Current status:', state.status, 'round:', state.round, 'MTP elapsed since open:',
    cp.openedAtMtp > 0 ? `${elapsed}s / ${cp.effectiveReviewSeconds}s` : 'not retained in recovered checkpoint');

  const [owner] = signers;
  const ownerTpl = signerTemplate(owner);
  const spent = new Set<string>();

  if (state.status === 'REVIEW') {
    if (!state.planUtxo || !state.anchorUtxo) {
      throw new Error('Checkpoint REVIEW plan missing planUtxo or anchorUtxo');
    }
    const sponsor = await waitForNewPlainUtxo(provider, owner.address, 6_000n, spent);
    const fin = buildFinalizeClaimTx({
      handle,
      planUtxo: state.planUtxo,
      anchorUtxo: state.anchorUtxo,
      sponsorUtxo: sponsor,
      sponsorUnlocker: ownerTpl.unlockP2PKH(),
      sponsorChangeAddress: owner.address,
    });
    const finRes = await sendTx(provider, fin.builder, spent);
    cp.finalizeTxid = finRes.txid;
    saveCheckpoint(cp);
    log('Mature finalizeClaim SUCCEEDED:', finRes.txid, 'bytes:', finRes.bytes);
    state = await waitPlanTxid(handle, finRes.txid);
  } else if (state.status === 'PAID_OUT') {
    log('Plan already PAID_OUT (resuming late payout steps)...');
  } else {
    throw new Error(`Checkpoint plan cannot resume from status=${state.status}`);
  }

  let canDistributeLate = false;
  try {
    computePolicyPayoutPreview(state.spendableBalanceSats, handle.policy);
    canDistributeLate = true;
  } catch {
    // A small remainder needs a larger test receipt before all heir outputs meet dust.
  }
  if (!cp.distributeTxid && state.inboxUtxos.length === 0 && !canDistributeLate) {
    const lateCoin = await ensurePlainBalance(
      provider,
      owner.address,
      ownerTpl,
      handle.metadata.inboxAddress,
      8_000n,
      spent,
    );
    cp.lateDepositTxid = lateCoin.txid;
    saveCheckpoint(cp);
    log('Sent post-payout inbox deposit:', lateCoin.txid);
    state = await withRetry(() => discoverPusakaV2State(handle), 'resume.discoverAfterDeposit');
  }

  if (state.inboxUtxos.length > 0) {
    const sweep = buildSweepInboxTx({
      handle,
      planUtxo: state.planUtxo!,
      inboxUtxos: state.inboxUtxos,
      mode: 'self',
    });
    const sweepRes = await sendTx(provider, sweep.builder, spent);
    cp.lateSweepTxid = sweepRes.txid;
    saveCheckpoint(cp);
    log('Post-payout inbox self-sweep txid:', sweepRes.txid, 'bytes:', sweepRes.bytes);
    state = await waitPlanTxid(handle, sweepRes.txid);
  }

  if (!cp.distributeTxid) {
    // The preview checks the actual configured shares, rather than a fixed balance
    // threshold which could silently skip a valid late payout and clear its proof.
    computePolicyPayoutPreview(state.spendableBalanceSats, handle.policy);
    const distSponsor = await waitForNewPlainUtxo(provider, owner.address, 6_000n, spent);
    const dist = buildDistributeLateTx({
      handle,
      planUtxo: state.planUtxo!,
      sponsorUtxo: distSponsor,
      sponsorUnlocker: ownerTpl.unlockP2PKH(),
      sponsorChangeAddress: owner.address,
    });
    const distRes = await sendTx(provider, dist.builder, spent);
    cp.distributeTxid = distRes.txid;
    saveCheckpoint(cp);
    log('Post-payout distributeLate txid:', distRes.txid, 'bytes:', distRes.bytes);
  }

  if (!cp.distributeTxid) throw new Error('Late-receipt payout incomplete; checkpoint retained');
  const finalState = await waitPlanTxid(handle, cp.distributeTxid);
  if (finalState.status !== 'PAID_OUT') throw new Error('Late payout did not preserve PAID_OUT');
  writeFileSync(COMPLETED_PROOF_FILE, JSON.stringify({ ...cp, finalPlanSats: finalState.planBalanceSats.toString() }, null, 2));
  unlinkSync(CHECKPOINT_FILE);
  log('Checkpoint cleared after verified late payout; completed public proof saved.');
}

async function main() {
  if (network.name !== 'chipnet') {
    throw new Error(`Expected --network chipnet; got ${network.name}`);
  }

  const provider = process.env.ELECTRUM_HOST
    ? new ElectrumNetworkProvider('chipnet', { hostname: process.env.ELECTRUM_HOST })
    : new ElectrumNetworkProvider('chipnet');
  const signers = (await ethers.getSigners(9)) as any[];
  const [owner, recipient, c0, c1, c2, h1, h2, h3, c3] = signers;

  const height = await withRetry(() => provider.getBlockHeight(), 'getBlockHeight');
  const mtp = await medianTimePast(provider);
  const ownerBal = await sumPlainSats(provider, owner.address);

  log('network:', network.name, 'height:', height, 'MTP:', mtp);
  log('ownerAddress:', owner.address, 'plainSats:', ownerBal.toString());

  if (process.env.PUSAKA_V2_CHIPNET_RESUME === '1') {
    if (process.env.PUSAKA_V2_CHIPNET_WAIT === '1') await waitCheckpointMaturity(provider);
    await resumePendingCheckpoint(provider, signers);
    return;
  }

  if (process.env.PUSAKA_V2_CHIPNET_BROADCAST !== '1') {
    log('Read-only dry check complete. Set PUSAKA_V2_CHIPNET_BROADCAST=1 to run live Chipnet lifecycle.');
    return;
  }

  if (ownerBal < 80_000n) {
    throw new Error(`Insufficient Chipnet balance at ${owner.address}: ${ownerBal} sats (< 80,000)`);
  }

  const ownerTpl = signerTemplate(owner);
  const ownerExt = makeStrictExternalSigner('chipnet-owner', owner, provider);
  const spent = new Set<string>();

  // 1. Pre-split vout=0 if needed & Genesis
  const { genesisUtxo, preTxid } = await ensureGenesisUtxo({
    provider,
    ownerAddress: ownerExt.address,
    ownerUnlocker: ownerExt.unlockP2PKH(),
    minimumSats: 30_000n,
    fee: 500n,
  });
  if (preTxid) {
    log('0. pre-split vout=0 txid:', preTxid);
    spent.add(`${preTxid}:0`);
  }
  spent.add(`${genesisUtxo.txid}:${genesisUtxo.vout}`);

  const faraid = faraidResultantShares([15, 20, 20, 26, 26, 13]);
  const genesis = buildGenesisV2PlanTx({
    provider,
    genesisUtxo,
    ownerUnlocker: ownerExt.unlockP2PKH(),
    ownerAddress: ownerExt.address,
    ownerPkh: ownerExt.pkh,
    policy: {
      inactivityPeriodSeconds: 120,
      reviewPeriodSeconds: 512,
      feeBudget: DEFAULT_FEE_BUDGET,
      contacts: [c0.pkh, c1.pkh, c2.pkh],
      heirs: [h1, h2, h3, recipient, c0, c1].map((s, idx) => ({
        pkh: s.pkh,
        share: faraid.shares[idx],
      })),
    },
    createdAtLocktime: mtp - 1,
    initialDepositSats: 12_000n,
  });
  const genRes = await sendTx(provider, genesis.builder, spent);
  log('1. genesis txid:', genRes.txid, 'bytes:', genRes.bytes, 'category:', genesis.metadata.planCategoryHex);
  log('   issued long-lived inboxAddress:', genesis.metadata.inboxAddress);

  // 2. Deposit to inboxAddress & self-sweep (no deadline change)
  let state = await waitPlanTxid(genesis.handle, genRes.txid);
  const deadlineBefore = state.deadline;
  const deposit1 = await ensurePlainBalance(provider, owner.address, ownerTpl, genesis.metadata.inboxAddress, 18_000n, spent);
  log('2a. inbox deposit 1:', deposit1.txid);
  const sweep1 = buildSweepInboxTx({
    handle: genesis.handle,
    planUtxo: state.planUtxo!,
    inboxUtxos: [deposit1],
    mode: 'self',
  });
  const sweep1Res = await sendTx(provider, sweep1.builder, spent);
  log('2b. self-sweep 1 txid:', sweep1Res.txid, 'bytes:', sweep1Res.bytes, 'fee:', sweep1.fee.toString());

  // 3. Partial owner send (legacy owner-funded via auto, with Signer.external)
  state = await waitPlanTxid(genesis.handle, sweep1Res.txid);
  if (state.deadline !== deadlineBefore) {
    throw new Error('Sweep unexpectedly altered deadline');
  }
  const sendCoin1 = await waitForNewPlainUtxo(provider, owner.address, 6_000n, spent);
  const send1 = buildSendTx({
    handle: genesis.handle,
    planUtxo: state.planUtxo!,
    ownerUtxo: sendCoin1,
    ownerUnlocker: ownerExt.unlockP2PKH(),
    ownerChangeAddress: ownerExt.address,
    recipientAddressOrLock: recipient.address,
    amount: 3_000n,
    locktime: mtp - 1,
  });
  const send1Res = await sendTx(provider, send1.builder, spent);
  log('3. partial send 1 txid:', send1Res.txid, 'bytes:', send1Res.bytes, 'feeSource:', send1.feeFundingSource, 'planSatsAfter:', send1.planSatsAfter.toString());

  // 4. Policy update (swaps to Equal 3 heirs, swaps c0->c3; inboxAddress stays identical!)
  state = await waitPlanTxid(genesis.handle, send1Res.txid);
  const eq3 = equalShares(3);
  const updCoin = await waitForNewPlainUtxo(provider, owner.address, 6_000n, spent);
  const upd = buildUpdatePolicyTx({
    handle: genesis.handle,
    planUtxo: state.planUtxo!,
    ownerUtxo: updCoin,
    ownerUnlocker: ownerExt.unlockP2PKH(),
    ownerChangeAddress: ownerExt.address,
    newPolicy: {
      inactivityPeriodSeconds: 90,
      reviewPeriodSeconds: 512,
      feeBudget: DEFAULT_FEE_BUDGET,
      contacts: [c1.pkh, c2.pkh, c3.pkh],
      heirs: [h1, h2, h3].map((h, i) => ({ pkh: h.pkh, share: eq3.shares[i] })),
    },
    locktime: mtp - 1,
  });
  const updRes = await sendTx(provider, upd.builder, spent);
  log('4. updatePolicy txid:', updRes.txid, 'bytes:', updRes.bytes, 'inboxUnchanged:', upd.nextMetadata.inboxAddress === genesis.metadata.inboxAddress);

  // 5. Fresh-session link decode & attach + deposit to already-issued inboxAddress
  state = await waitPlanTxid(upd.nextHandle, updRes.txid);
  const link = encodePusakaV2PlanLink(upd.nextMetadata);
  const attached = await attachPusakaV2Plan(decodePusakaV2PlanLink(link), provider);
  const deposit2 = await ensurePlainBalance(provider, owner.address, ownerTpl, genesis.metadata.inboxAddress, 15_000n, spent);
  const sweep2 = buildSweepInboxTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    inboxUtxos: [deposit2],
    mode: 'self',
  });
  const sweep2Res = await sendTx(provider, sweep2.builder, spent);
  log('5. fresh-attach + self-sweep 2 txid:', sweep2Res.txid, 'bytes:', sweep2Res.bytes);

  // 6. 2-of-3 trusted contacts open early REVIEW + verify live Chipnet non-BIP68-final rejection
  state = await waitPlanTxid(attached, sweep2Res.txid);
  const c1Coin = await ensurePlainBalance(provider, owner.address, ownerTpl, c1.address, 6_000n, spent);
  const v1 = buildContactApproveTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    contactIndexOrAddress: c1.address,
    contactUtxo: c1Coin,
    contactUnlocker: signerTemplate(c1).unlockP2PKH(),
    contactChangeAddress: c1.address,
  });
  const v1Res = await sendTx(provider, v1.builder, spent);
  log('6a. contact 1 approval txid:', v1Res.txid, 'bytes:', v1Res.bytes);

  state = await waitPlanTxid(attached, v1Res.txid);
  const c2Coin = await ensurePlainBalance(provider, owner.address, ownerTpl, c2.address, 8_000n, spent);
  const v2 = buildContactApproveTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    contactIndexOrAddress: c2.address,
    contactUtxo: c2Coin,
    contactUnlocker: signerTemplate(c2).unlockP2PKH(),
    contactChangeAddress: c2.address,
  });
  const v2Res = await sendTx(provider, v2.builder, spent);
  log('6b. contact 2 quorum (enter REVIEW) txid:', v2Res.txid, 'bytes:', v2Res.bytes);

  state = await waitPlanTxid(attached, v2Res.txid);
  const earlyFin = buildFinalizeClaimTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    anchorUtxo: state.anchorUtxo!,
  });
  const earlyHex = earlyFin.builder.build();
  let rejectedEarly = false;
  try {
    await provider.sendRawTransaction(earlyHex);
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (!message.includes('non-BIP68-final')) throw err;
    rejectedEarly = true;
    log('7. live Chipnet early finalizeClaim REJECTED as expected:', message);
  }
  if (!rejectedEarly) throw new Error('UNEXPECTED: live Chipnet accepted unconfirmed early finalizeClaim');

  // 8. Persistent 600-sat auth coin live test:
  //    Mint an exact 600-sat owner auth coin, cancel REVIEW using ONLY that 600-sat coin (+ Signer.external),
  //    then reuse the returned 600-sat coin for send() without any top-up!
  const splitSrc = await waitForNewPlainUtxo(provider, owner.address, 2_000n, spent);
  spent.add(`${splitSrc.txid}:${splitSrc.vout}`);
  const splitAuthBuilder = new TransactionBuilder({ provider })
    .addInput(splitSrc, ownerTpl.unlockP2PKH())
    .addOutput({ to: owner.address, amount: 600n });
  const splitRem = splitSrc.satoshis - 600n - 300n;
  if (splitRem >= 600n) {
    splitAuthBuilder.addOutput({ to: owner.address, amount: splitRem });
  }
  const splitAuthTxid = await withRetry(
    () => provider.sendRawTransaction(splitAuthBuilder.build()),
    'mint600AuthCoin',
  );
  const tinyAuthCoin1 = await waitExactOutpoint(provider, owner.address, splitAuthTxid, 600n, 600n);
  log('8a. created persistent 600-sat auth coin:', `${tinyAuthCoin1.txid}:${tinyAuthCoin1.vout}`);

  const cancel600 = buildCancelClaimTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    anchorUtxo: state.anchorUtxo!,
    ownerUtxo: tinyAuthCoin1,
    ownerUnlocker: ownerExt.unlockP2PKH(),
    ownerChangeAddress: ownerExt.address,
    locktime: mtp - 1,
  });
  if (cancel600.feeFundingSource !== 'protected' || cancel600.ownerChangeSats !== 600n) {
    throw new Error(`Expected protected fee keeping 600-sat auth coin; got ${cancel600.feeFundingSource} / ${cancel600.ownerChangeSats}`);
  }
  const cancel600Res = await sendTx(provider, cancel600.builder, spent);
  spent.add(`${tinyAuthCoin1.txid}:${tinyAuthCoin1.vout}`);
  log(
    '8b. cancelClaim-during-REVIEW with 600-sat coin txid:',
    cancel600Res.txid,
    'bytes:',
    cancel600Res.bytes,
    'protectedFee:',
    cancel600.protectedFeeSats.toString(),
    'returnedCoin:',
    cancel600.ownerChangeSats.toString(),
  );

  const tinyAuthCoin2 = await waitExactOutpoint(provider, owner.address, cancel600Res.txid, 600n, 600n);
  state = await waitPlanTxid(attached, cancel600Res.txid);
  const send600 = buildSendTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    ownerUtxo: tinyAuthCoin2,
    ownerUnlocker: ownerExt.unlockP2PKH(),
    ownerChangeAddress: ownerExt.address,
    recipientAddressOrLock: recipient.address,
    amount: 2_000n,
    locktime: mtp - 1,
  });
  if (send600.feeFundingSource !== 'protected' || send600.ownerChangeSats !== 600n) {
    throw new Error(`Expected second 600-sat reuse to stay protected / 600; got ${send600.feeFundingSource} / ${send600.ownerChangeSats}`);
  }
  const send600Res = await sendTx(provider, send600.builder, spent);
  spent.add(`${tinyAuthCoin2.txid}:${tinyAuthCoin2.vout}`);
  log(
    '8c. reused 600-sat coin for send txid:',
    send600Res.txid,
    'bytes:',
    send600Res.bytes,
    'protectedFee:',
    send600.protectedFeeSats.toString(),
    'returnedCoin:',
    send600.ownerChangeSats.toString(),
  );

  // 9. Owner exits -> CLOSED (preserves 1000-sat carrier & renews deadline) -> post-exit receipt -> owner recovers
  state = await waitPlanTxid(attached, send600Res.txid);
  const exitCoin = await waitForNewPlainUtxo(provider, owner.address, 6_000n, spent);
  const exitMtp = await medianTimePast(provider);
  const exit1 = buildOwnerExitTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    ownerUtxo: exitCoin,
    ownerUnlocker: ownerExt.unlockP2PKH(),
    ownerAddress: ownerExt.address,
    locktime: exitMtp - 1,
  });
  const exit1Res = await sendTx(provider, exit1.builder, spent);
  log('9a. ownerExit (CLOSED, 1000 carrier) txid:', exit1Res.txid, 'bytes:', exit1Res.bytes, 'nextDeadline:', exit1.nextDeadline);

  state = await waitPlanTxid(attached, exit1Res.txid);
  const postExitDeposit = await ensurePlainBalance(provider, owner.address, ownerTpl, attached.metadata.inboxAddress, 10_000n, spent);
  const postExitSweep = buildSweepInboxTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    inboxUtxos: [postExitDeposit],
    mode: 'self',
  });
  const postExitSweepRes = await sendTx(provider, postExitSweep.builder, spent);
  log('9b. post-exit inbox sweep into CLOSED txid:', postExitSweepRes.txid, 'bytes:', postExitSweepRes.bytes);

  state = await waitPlanTxid(attached, postExitSweepRes.txid);
  const recoverCoin = await waitForNewPlainUtxo(provider, owner.address, 6_000n, spent);
  const recoverExit = buildOwnerExitTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    ownerUtxo: recoverCoin,
    ownerUnlocker: ownerExt.unlockP2PKH(),
    ownerAddress: ownerExt.address,
    locktime: exitMtp - 1,
  });
  const recoverRes = await sendTx(provider, recoverExit.builder, spent);
  log('9c. owner post-exit recovery txid:', recoverRes.txid, 'bytes:', recoverRes.bytes);

  // 10. Post-exit receipt in CLOSED claimed by 2-of-3 contacts (1st vote stays CLOSED, 2nd enters REVIEW)
  state = await waitPlanTxid(attached, recoverRes.txid);
  const closedClaimDeposit = await ensurePlainBalance(provider, owner.address, ownerTpl, attached.metadata.inboxAddress, 15_000n, spent);
  const closedClaimSweep = buildSweepInboxTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    inboxUtxos: [closedClaimDeposit],
    mode: 'self',
  });
  const closedClaimSweepRes = await sendTx(provider, closedClaimSweep.builder, spent);
  log('10a. second post-exit sweep into CLOSED txid:', closedClaimSweepRes.txid, 'bytes:', closedClaimSweepRes.bytes);

  state = await waitPlanTxid(attached, closedClaimSweepRes.txid);
  const k1Coin = await ensurePlainBalance(provider, owner.address, ownerTpl, c2.address, 5_000n, spent);
  const kv1 = buildContactApproveTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    contactIndexOrAddress: c2.address,
    contactUtxo: k1Coin,
    contactUnlocker: signerTemplate(c2).unlockP2PKH(),
    contactChangeAddress: c2.address,
  });
  const kv1Res = await sendTx(provider, kv1.builder, spent);
  state = await waitPlanTxid(attached, kv1Res.txid);
  if (state.status !== 'CLOSED' || state.approvalsMask !== 2) {
    throw new Error(`Expected CLOSED after 1st contact vote; got ${state.status} mask=${state.approvalsMask}`);
  }
  log('10b. contact 1 vote from CLOSED (stays CLOSED) txid:', kv1Res.txid, 'bytes:', kv1Res.bytes);

  const k2Coin = await ensurePlainBalance(provider, owner.address, ownerTpl, c3.address, 6_000n, spent);
  const kv2 = buildContactApproveTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    contactIndexOrAddress: c3.address,
    contactUtxo: k2Coin,
    contactUnlocker: signerTemplate(c3).unlockP2PKH(),
    contactChangeAddress: c3.address,
  });
  const kv2Res = await sendTx(provider, kv2.builder, spent);
  state = await waitPlanTxid(attached, kv2Res.txid);
  if (state.status !== 'REVIEW') {
    throw new Error(`Expected REVIEW after 2nd contact vote from CLOSED; got ${state.status}`);
  }
  log('10c. contact 2 quorum from CLOSED (enters REVIEW) txid:', kv2Res.txid, 'bytes:', kv2Res.bytes);

  if (process.env.PUSAKA_V2_LEAVE_REVIEW === '1') {
    const checkpoint: PublicCheckpoint = {
      metadata: attached.metadata,
      openReviewTxid: kv2Res.txid,
      openedAtMtp: await medianTimePast(provider),
      effectiveReviewSeconds: attached.policy.effectiveReviewSeconds,
      originStatus: 'CLOSED',
    };
    saveCheckpoint(checkpoint);
    log('11. Left CLOSED-originated REVIEW anchor in public checkpoint for mature resume:', kv2Res.txid);
    return;
  }

  // Otherwise owner cancels CLOSED-originated REVIEW cleanly via checkIn (back to ACTIVE)
  const tinyAuthCoin3 = await waitExactOutpoint(provider, owner.address, send600Res.txid, 600n, 600n);
  const cancelClosedReview = buildCheckInTx({
    handle: attached,
    planUtxo: state.planUtxo!,
    anchorUtxo: state.anchorUtxo!,
    ownerUtxo: tinyAuthCoin3,
    ownerUnlocker: ownerExt.unlockP2PKH(),
    ownerChangeAddress: ownerExt.address,
    locktime: (await medianTimePast(provider)) - 1,
  });
  const cancelClosedRes = await sendTx(provider, cancelClosedReview.builder, spent);
  log('11. owner checkIn cancels CLOSED-originated REVIEW (3rd 600-sat reuse!) txid:', cancelClosedRes.txid, 'bytes:', cancelClosedRes.bytes);

  const endingBal = await sumPlainSats(provider, owner.address);
  log('Live Chipnet Stage-3 verification COMPLETE. Ending owner sats:', endingBal.toString(), 'net delta:', (ownerBal - endingBal).toString());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
