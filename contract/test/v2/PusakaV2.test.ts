import { describe, expect, it } from 'vitest';
import {
  Contract,
  SignatureTemplate,
  Signer,
  TransactionBuilder,
  randomUtxo,
  type ExternalTransactionSigner,
  type Utxo,
} from '@solidcash/solidcash';
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock';
import {
  binToHex,
  decodeTransactionBch,
  encodeCashAddress,
  encodeTransaction,
  hash160,
  hexToBin,
  NonFungibleTokenCapability,
  numberToBinUint32LE,
  secp256k1,
} from '@bitauth/libauth';
import {
  attachPusakaV2Plan,
  BIP68_DISABLE_FLAG,
  BIP68_TIME_FLAG,
  buildCancelClaimTx,
  buildCheckInTx,
  buildContactApproveTx,
  buildDepositDirectTx,
  buildDistributeLateTx,
  buildFinalizeClaimTx,
  buildGenesisV2PlanTx,
  buildOpenClaimByInactivityTx,
  buildOwnerExitTx,
  buildSendTx,
  buildSweepInboxTx,
  buildUpdatePolicyTx,
  computePolicyPayoutPreview,
  decodeAnchorCommitment,
  decodePlanStateCommitment,
  decodePolicyBytes,
  decodePusakaV2PlanLink,
  DEFAULT_FEE_BUDGET,
  discoverPusakaV2State,
  encodeAnchorCommitment,
  encodePlanStateCommitment,
  encodePolicyBytes,
  encodePusakaV2PlanLink,
  encodeReviewDurationToBip68Sequence,
  ensureGenesisUtxo,
  equalShares,
  faraidResultantShares,
  finalizeBuilderTxHex,
  instantiatePusakaV2Contracts,
  MIN_ANCHOR_SATS,
  MIN_PLAN_CARRIER_SATS,
  P2PKH_DUST_SATS,
  p2pkhLockingBytecode,
  percentShares,
  pickFundedPlainUtxo,
  PLAN_STATUS_ACTIVE,
  PLAN_STATUS_CLOSED,
  PLAN_STATUS_PAID_OUT,
  PLAN_STATUS_REVIEW,
  PolicyHashMismatchError,
  PUSAKA_V2_VERSION,
  withFundedPlainUtxoPreference,
  type PusakaV2PolicyInput,
} from '../../scripts/v2/pusaka-v2.js';
import {
  buildMutatedTxHex,
  StrictBip68ChainVerifier,
} from '../../scripts/v2/claim-review-verifier.js';

interface TestActor {
  priv: Uint8Array;
  pub: Uint8Array;
  pkh: Uint8Array;
  address: string;
  tpl: SignatureTemplate;
  signer: Signer;
}

function makeActor(seedByte: number, provider: MockNetworkProvider): TestActor {
  // Deterministic non-secret test key material (never used on mainnet)
  const priv = new Uint8Array(32).fill(seedByte);
  priv[31] = ((seedByte * 7 + 1) & 0xff) || 1;
  const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
  const pkh = hash160(pub);
  const res = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh });
  if (typeof res === 'string') throw new Error(res);
  return {
    priv,
    pub,
    pkh,
    address: res.address,
    tpl: new SignatureTemplate(priv),
    signer: new Signer(priv, provider),
  };
}

interface ExternalAuditEntry {
  inputsTotal: number;
  signedOwnInputs: number;
  covenantInputsZeroedInRequest: number;
  userPrompt?: string;
}

function createStrictExternalSigner(
  actor: TestActor,
  provider: MockNetworkProvider,
  auditLog: ExternalAuditEntry[],
  userPrompt?: string,
): Signer {
  const unlocker = actor.tpl.unlockP2PKH();
  const ownLockHex = binToHex(unlocker.generateLockingBytecode());
  const wallet: ExternalTransactionSigner = {
    async signTransaction(request) {
      const { transaction, sourceOutputs } = request;
      if (sourceOutputs.length !== transaction.inputs.length) {
        throw new Error('sourceOutputs length mismatch');
      }
      let signedOwnInputs = 0;
      let covenantInputsZeroedInRequest = 0;
      const inputs = transaction.inputs.map((inp, idx) => {
        if (inp.unlockingBytecode.length !== 0) {
          throw new Error(`Expected empty unlockingBytecode at input ${idx}`);
        }
        const lockHex = binToHex(sourceOutputs[idx].lockingBytecode);
        if (lockHex !== ownLockHex) {
          covenantInputsZeroedInRequest++;
          return inp;
        }
        signedOwnInputs++;
        return {
          ...inp,
          unlockingBytecode: unlocker.generateUnlockingBytecode({
            transaction,
            sourceOutputs,
            inputIndex: idx,
          }),
        };
      });
      if (signedOwnInputs === 0) {
        throw new Error('Strict external wallet refused tx with 0 own P2PKH inputs');
      }
      auditLog.push({
        inputsTotal: transaction.inputs.length,
        signedOwnInputs,
        covenantInputsZeroedInRequest,
        userPrompt: request.userPrompt,
      });
      return { signedTransaction: binToHex(encodeTransaction({ ...transaction, inputs })) };
    },
  };
  return Signer.external(
    { wallet, address: actor.address, publicKey: actor.pub, userPrompt },
    provider,
  );
}

async function setupEnv() {
  const provider = new MockNetworkProvider();
  const verifier = new StrictBip68ChainVerifier(provider);
  await verifier.init();

  const owner = makeActor(0x10, provider);
  const c0 = makeActor(0x21, provider);
  const c1 = makeActor(0x22, provider);
  const c2 = makeActor(0x23, provider);
  const c3 = makeActor(0x24, provider);
  const recipient = makeActor(0x31, provider);
  const relayer = makeActor(0x41, provider);
  const stranger = makeActor(0x51, provider);
  const heirs = Array.from({ length: 10 }, (_, i) => makeActor(0x60 + i, provider));

  return { provider, verifier, owner, c0, c1, c2, c3, recipient, relayer, stranger, heirs };
}

async function fund(
  verifier: StrictBip68ChainVerifier,
  address: string,
  satoshis: bigint,
  vout = 0,
): Promise<Utxo> {
  const tip = await verifier.provider.getBlockHeight();
  const utxo = await verifier.provider.addUtxo(address, randomUtxo({ satoshis, vout }));
  await verifier.recordOutpoint(utxo.txid, utxo.vout, Math.max(1, tip - 5));
  return utxo;
}

async function sendStrictBuilder(
  verifier: StrictBip68ChainVerifier,
  builder: TransactionBuilder,
) {
  const hex = await finalizeBuilderTxHex(builder);
  return verifier.sendTxStrict(hex);
}

function assertConsensusSizeMetrics(txHex: string, label: string, maxInputBytesAllowed = 5_000) {
  const raw = hexToBin(txHex);
  expect(raw.length, `${label} total tx bytes`).toBeLessThan(100_000);
  const decoded = decodeTransactionBch(raw);
  expect(typeof decoded).not.toBe('string');
  if (typeof decoded === 'string') throw new Error(decoded);
  for (let i = 0; i < decoded.inputs.length; i++) {
    const unlockLen = decoded.inputs[i].unlockingBytecode.length;
    expect(unlockLen, `${label} input[${i}] unlockingBytecode bytes`).toBeLessThan(maxInputBytesAllowed);
    expect(unlockLen, `${label} input[${i}] < BCH 10,000 B limit`).toBeLessThan(10_000);
  }
  return { txBytes: raw.length, inputSizes: decoded.inputs.map((inp) => inp.unlockingBytecode.length) };
}

describe('Pusaka v2 Stage 3 — Complete Inheritance Wallet Covenant & SDK', () => {
  it('runs complete Stage-3 lifecycle with strict Signer.external, Faraid shares, policy edits, inbox preservation, and fresh-session restore', async () => {
    const { provider, verifier, owner, c0, c1, c2, c3, recipient, relayer, heirs } = await setupEnv();
    const auditLog: ExternalAuditEntry[] = [];
    const ownerExt = createStrictExternalSigner(owner, provider, auditLog, 'Approve Pusaka v2 tx');
    const ownerExtWrapped = withFundedPlainUtxoPreference(ownerExt, 5_000n);

    // Owner holds only vout=1 + a tiny stale 2,000-sat coin at vout=2
    await fund(verifier, owner.address, 2_000n, 2);
    await fund(verifier, owner.address, 500_000n, 1);
    await fund(verifier, relayer.address, 100_000n, 0);
    await fund(verifier, c0.address, 50_000n, 0);
    await fund(verifier, c1.address, 50_000n, 0);
    await fund(verifier, c2.address, 50_000n, 0);
    await fund(verifier, c3.address, 50_000n, 0);

    // ensureGenesisUtxo with Signer.external creates vout=0 pre-split
    const { genesisUtxo, preTxid } = await ensureGenesisUtxo({
      provider,
      ownerAddress: ownerExt.address,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      minimumSats: 100_000n,
      fee: 500n,
    });
    expect(preTxid).toBeTruthy();
    expect(genesisUtxo.vout).toBe(0);
    // record pre-split outputs in strict verifier
    const preRaw = await provider.getRawTransaction(preTxid!);
    const preDec = decodeTransactionBch(hexToBin(preRaw));
    if (typeof preDec !== 'string') {
      for (let v = 0; v < preDec.outputs.length; v++) {
        await verifier.recordOutpoint(preTxid!, v);
      }
    }

    // Faraid resultant shares (6 heirs summing to 120)
    const faraid = faraidResultantShares([15, 20, 20, 26, 26, 13]);
    const policy1: PusakaV2PolicyInput = {
      inactivityPeriodSeconds: 30 * 86_400,
      reviewPeriodSeconds: 600, // rounds up to 2 units = 1024s (0x00400002)
      feeBudget: DEFAULT_FEE_BUDGET,
      contacts: [c0.pkh, c1.pkh, c2.pkh],
      heirs: faraid.shares.map((share, idx) => ({ pkh: heirs[idx].pkh, share, label: `Heir ${idx + 1}` })),
    };

    const { spendMtp: m0 } = await verifier.getCurrentSpendContext();
    const genesis = buildGenesisV2PlanTx({
      provider,
      genesisUtxo,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerAddress: ownerExt.address,
      ownerPkh: ownerExt.pkh,
      policy: policy1,
      createdAtLocktime: m0 - 1,
      initialDepositSats: 20_000n,
    });
    const genRes = await sendStrictBuilder(verifier, genesis.builder);
    assertConsensusSizeMetrics(genRes.txHex, 'genesis');

    // Verify link encode/decode & fresh-session attach
    const link1 = encodePusakaV2PlanLink(genesis.metadata);
    const decodedMeta1 = decodePusakaV2PlanLink(link1);
    const attached1 = await attachPusakaV2Plan(decodedMeta1, provider);
    expect(attached1.metadata.inboxAddress).toBe(genesis.metadata.inboxAddress);
    const issuedInboxAddress = attached1.metadata.inboxAddress;

    // Receive ordinary plain BCH + a stuck token junk UTXO at issuedInboxAddress
    const inboxCoin1 = await fund(verifier, issuedInboxAddress, 40_000n, 0);
    await verifier.provider.addUtxo(
      issuedInboxAddress,
      randomUtxo({
        satoshis: 1_000n,
        vout: 1,
        token: { category: 'aa'.repeat(32), amount: 500n },
      }),
    );

    let state = await discoverPusakaV2State(attached1);
    expect(state.status).toBe('ACTIVE');
    expect(state.inboxJunkTokenUtxos.length).toBe(1);
    expect(state.inboxBalanceSats).toBe(40_000n);
    const deadlineAfterGenesis = state.deadline;

    // Permissionless self-sweep ignores token junk and sweeps 40,000 sats without advancing deadline
    const sweep1 = buildSweepInboxTx({
      handle: attached1,
      planUtxo: state.planUtxo!,
      inboxUtxos: [inboxCoin1],
      mode: 'self',
    });
    const sweep1Res = await sendStrictBuilder(verifier, sweep1.builder);
    const sweep1Metrics = assertConsensusSizeMetrics(sweep1Res.txHex, 'self-sweep-1');
    expect(sweep1Metrics.txBytes).toBeLessThan(4_000);

    state = await discoverPusakaV2State(attached1);
    expect(state.deadline).toBe(deadlineAfterGenesis); // deposits NEVER renew life
    expect(state.round).toBe(0);
    expect(state.planBalanceSats).toBe(20_000n + 40_000n - sweep1.fee);

    // Owner partial send #1 using Signer.external + withFundedPlainUtxoPreference (ignores 2,000-sat stale coin)
    await verifier.advanceTimeAndMine(120, 6);
    const { spendMtp: m1 } = await verifier.getCurrentSpendContext();
    const ownerExtUtxos1 = await ownerExtWrapped.getUtxos();
    expect(ownerExtUtxos1[0].satoshis).toBeGreaterThanOrEqual(5_000n);
    const send1 = buildSendTx({
      handle: attached1,
      planUtxo: state.planUtxo!,
      ownerUtxo: pickFundedPlainUtxo(ownerExtUtxos1, 5_000n),
      ownerUnlocker: ownerExtWrapped.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      recipientAddressOrLock: recipient.address,
      amount: 12_000n,
      locktime: m1 - 1,
    });
    // Also validate WcTransactionObject serializes cleanly under WalletConnect's 39 KB wire cap
    const wcObj = send1.builder.generateWcTransactionObject({ userPrompt: 'Send 12,000 sats' });
    expect(wcObj.sourceOutputs.length).toBe(2);
    const wirePayload = {
      transaction: binToHex(encodeTransaction(wcObj.transaction)),
      sourceOutputs: wcObj.sourceOutputs.map(({ contract, ...rest }: any) => ({
        ...rest,
        ...(contract ? { contract: { abiFunction: contract.abiFunction, redeemScript: contract.redeemScript } } : {}),
      })),
      broadcast: wcObj.broadcast,
      userPrompt: wcObj.userPrompt,
    };
    const serializedWc = JSON.stringify(wirePayload, (_k, v) =>
      v instanceof Uint8Array ? binToHex(v) : typeof v === 'bigint' ? v.toString() : v,
    );
    expect(serializedWc.length).toBeLessThan(39_000);

    const send1Res = await sendStrictBuilder(verifier, send1.builder);
    assertConsensusSizeMetrics(send1Res.txHex, 'send-1');

    state = await discoverPusakaV2State(attached1);
    expect(state.round).toBe(1);
    expect(state.deadline).toBe(m1 - 1 + policy1.inactivityPeriodSeconds);
    expect(state.planBalanceSats).toBe(20_000n + 40_000n - sweep1.fee - 12_000n);

    // Contact 0 casts 1st approval in round 1 (mask becomes 1), plus new receipt arrives at SAME issuedInboxAddress
    const approve1 = buildContactApproveTx({
      handle: attached1,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: c0.address,
      contactUtxo: pickFundedPlainUtxo(await c0.signer.getUtxos(), 5_000n),
      contactUnlocker: c0.tpl.unlockP2PKH(),
      contactChangeAddress: c0.address,
    });
    expect(approve1.enteredReview).toBe(false);
    await sendStrictBuilder(verifier, approve1.builder);
    await fund(verifier, issuedInboxAddress, 25_000n, 0);

    state = await discoverPusakaV2State(attached1);
    expect(state.approvedContactIndices).toEqual([0]);

    // Owner updates policy: switches to Equal 3-heir split, swaps contact0 -> contact3, changes periods
    const equal3 = equalShares(3);
    const policy2: PusakaV2PolicyInput = {
      inactivityPeriodSeconds: 7 * 86_400,
      reviewPeriodSeconds: 1_200, // rounds up to 3 units = 1536s (0x00400003)
      feeBudget: 6_000n,
      contacts: [c1.pkh, c2.pkh, c3.pkh],
      heirs: [0, 1, 2].map((i) => ({ pkh: heirs[i].pkh, share: equal3.shares[i] })),
    };
    await verifier.advanceTimeAndMine(60, 6);
    const { spendMtp: m2 } = await verifier.getCurrentSpendContext();
    const upd = buildUpdatePolicyTx({
      handle: attached1,
      planUtxo: state.planUtxo!,
      ownerUtxo: pickFundedPlainUtxo(await ownerExtWrapped.getUtxos(), 5_000n),
      ownerUnlocker: ownerExtWrapped.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      newPolicy: policy2,
      locktime: m2 - 1,
    });
    const updRes = await sendStrictBuilder(verifier, upd.builder);
    assertConsensusSizeMetrics(updRes.txHex, 'updatePolicy');

    // Receive address NEVER changed across updatePolicy
    expect(upd.nextMetadata.inboxAddress).toBe(issuedInboxAddress);
    expect(upd.nextMetadata.planAddress).toBe(genesis.metadata.planAddress);
    expect(upd.nextMetadata.anchorAddress).toBe(genesis.metadata.anchorAddress);

    // Old link1 now fails fail-closed policyHash check against chain
    await expect(attachPusakaV2Plan(decodePusakaV2PlanLink(link1), provider)).rejects.toBeInstanceOf(
      PolicyHashMismatchError,
    );

    // Fresh attach with updated link2 succeeds
    const link2 = encodePusakaV2PlanLink(upd.nextMetadata);
    const attached2 = await attachPusakaV2Plan(decodePusakaV2PlanLink(link2), provider);
    state = await discoverPusakaV2State(attached2);
    expect(state.status).toBe('ACTIVE');
    expect(state.round).toBe(2);
    expect(state.approvalsMask).toBe(0); // old contact0 vote was wiped!
    expect(state.deadline).toBe(m2 - 1 + 7 * 86_400);

    // Sweep previously-issued inbox deposit under updated plan via sponsored sweep (100% added)
    const sweep2 = buildSweepInboxTx({
      handle: attached2,
      planUtxo: state.planUtxo!,
      inboxUtxos: state.inboxUtxos,
      mode: 'sponsored',
      sponsorUtxo: pickFundedPlainUtxo(await relayer.signer.getUtxos(), 6_000n),
      sponsorUnlocker: relayer.tpl.unlockP2PKH(),
      sponsorChangeAddress: relayer.address,
    });
    await sendStrictBuilder(verifier, sweep2.builder);

    // Removed contact c0 can no longer approve; registered c1 + c2 trigger early REVIEW
    await expect(
      Promise.resolve().then(() =>
        buildContactApproveTx({
          handle: attached2,
          planUtxo: state.planUtxo!,
          contactIndexOrAddress: c0.address,
          contactUtxo: c0.signer.getUtxos() as any,
          contactUnlocker: c0.tpl.unlockP2PKH(),
          contactChangeAddress: c0.address,
        }),
      ),
    ).rejects.toThrow(/not a registered trusted contact/i);

    state = await discoverPusakaV2State(attached2);
    const v1 = buildContactApproveTx({
      handle: attached2,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: c1.address,
      contactUtxo: pickFundedPlainUtxo(await c1.signer.getUtxos(), 5_000n),
      contactUnlocker: c1.tpl.unlockP2PKH(),
      contactChangeAddress: c1.address,
    });
    await sendStrictBuilder(verifier, v1.builder);

    state = await discoverPusakaV2State(attached2);
    const v2 = buildContactApproveTx({
      handle: attached2,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: c2.address,
      contactUtxo: pickFundedPlainUtxo(await c2.signer.getUtxos(), 6_000n),
      contactUnlocker: c2.tpl.unlockP2PKH(),
      contactChangeAddress: c2.address,
    });
    expect(v2.enteredReview).toBe(true);
    const v2Res = await sendStrictBuilder(verifier, v2.builder);
    assertConsensusSizeMetrics(v2Res.txHex, 'contact-quorum-2');

    // Wait full 1536s review MTP delay and finalize via permissionless self-funded payout
    state = await discoverPusakaV2State(attached2);
    expect(state.status).toBe('REVIEW');
    expect(state.anchorUtxo).toBeDefined();
    await verifier.advanceTimeAndMine(1_536, 6);

    const fin = buildFinalizeClaimTx({
      handle: attached2,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
    });
    const finRes = await sendStrictBuilder(verifier, fin.builder);
    assertConsensusSizeMetrics(finRes.txHex, 'finalizeClaim-3heirs');

    // Audit external wallet log: every owner spend was externally signed with zeroed covenant inputs
    expect(auditLog.length).toBeGreaterThanOrEqual(4);
    for (const entry of auditLog) {
      expect(entry.signedOwnInputs).toBe(1);
      if (entry.inputsTotal > 1) {
        expect(entry.covenantInputsZeroedInRequest).toBeGreaterThanOrEqual(1);
      }
    }

    // Verify heirs got equal integer floor payouts and plan stayed PAID_OUT with carrier + leftover
    state = await discoverPusakaV2State(attached2);
    expect(state.status).toBe('PAID_OUT');
    for (let i = 0; i < 3; i++) {
      const hUtxos = await provider.getUtxos(heirs[i].address);
      const sum = hUtxos.reduce((s, u) => s + u.satoshis, 0n);
      expect(sum).toBe(fin.heirPayouts[i].amount);
    }

    // Late deposit after PAID_OUT sweeps & distributes cleanly to the same heirs
    await fund(verifier, issuedInboxAddress, 30_000n, 0);
    state = await discoverPusakaV2State(attached2);
    const lateSweep = buildSweepInboxTx({
      handle: attached2,
      planUtxo: state.planUtxo!,
      inboxUtxos: state.inboxUtxos,
      mode: 'self',
    });
    await sendStrictBuilder(verifier, lateSweep.builder);
    state = await discoverPusakaV2State(attached2);
    const distLate = buildDistributeLateTx({
      handle: attached2,
      planUtxo: state.planUtxo!,
      sponsorUtxo: pickFundedPlainUtxo(await relayer.signer.getUtxos(), 6_000n),
      sponsorUnlocker: relayer.tpl.unlockP2PKH(),
      sponsorChangeAddress: relayer.address,
    });
    const distRes = await sendStrictBuilder(verifier, distLate.builder);
    assertConsensusSizeMetrics(distRes.txHex, 'distributeLate-3heirs');
  });

  it('handles maximum 10-heir custom/percent split, VM resource headroom, non-divisible rounding, and dust heir rejection', async () => {
    const { provider, verifier, owner, c0, c1, c2, relayer, heirs } = await setupEnv();
    const genUtxo = await fund(verifier, owner.address, 200_000n, 0);
    await fund(verifier, relayer.address, 100_000n, 0);

    const { total: total10, shares: shares10 } = percentShares([
      15.5, 14.5, 12.25, 10.75, 10.0, 9.5, 8.5, 7.0, 6.5, 5.5,
    ]);
    expect(total10).toBe(10_000n);

    const policy10: PusakaV2PolicyInput = {
      inactivityPeriodSeconds: 120,
      reviewPeriodSeconds: 512,
      feeBudget: DEFAULT_FEE_BUDGET,
      contacts: [c0.pkh, c1.pkh, c2.pkh],
      heirs: shares10.map((share, idx) => ({ pkh: heirs[idx].pkh, share })),
    };

    const { spendMtp } = await verifier.getCurrentSpendContext();
    const gen = buildGenesisV2PlanTx({
      provider,
      genesisUtxo: genUtxo,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      policy: policy10,
      createdAtLocktime: spendMtp - 1,
      initialDepositSats: 150_001n, // deliberately non-divisible pot!
    });
    await sendStrictBuilder(verifier, gen.builder);

    // Check VM resource usage on self-funded 10-heir openClaimByInactivity & finalizeClaim
    await verifier.advanceTimeAndMine(121, 6);
    let state = await discoverPusakaV2State(gen.handle);
    const { spendMtp: mOpen } = await verifier.getCurrentSpendContext();
    const open = buildOpenClaimByInactivityTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      locktime: mOpen - 1,
    });
    const openVm = open.builder.getVmResourceUsage();
    expect(openVm[0].operationCost).toBeLessThan(openVm[0].maximumOperationCost);
    const openRes = await sendStrictBuilder(verifier, open.builder);
    const openMetrics = assertConsensusSizeMetrics(openRes.txHex, 'openClaimByInactivity-self-10heirs');

    await verifier.advanceTimeAndMine(512, 6);
    state = await discoverPusakaV2State(gen.handle);
    const fin = buildFinalizeClaimTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
    });
    const finVm = fin.builder.getVmResourceUsage();
    for (const m of finVm) {
      expect(m.operationCost).toBeLessThan(m.maximumOperationCost);
    }
    const finRes = await sendStrictBuilder(verifier, fin.builder);
    const finMetrics = assertConsensusSizeMetrics(finRes.txHex, 'finalizeClaim-self-10heirs');
    expect(openMetrics.txBytes).toBeLessThan(4_500);
    expect(finMetrics.txBytes).toBeLessThan(4_500);
    expect(Math.max(...finMetrics.inputSizes)).toBeLessThan(4_000);

    // Exact rounding conservation check: leftover + unused feeBudget stay inside PAID_OUT Plan UTXO
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('PAID_OUT');
    const expectedCarrier =
      MIN_PLAN_CARRIER_SATS + fin.leftover + (DEFAULT_FEE_BUDGET - fin.fee);
    expect(state.planBalanceSats).toBe(expectedCarrier);

    // Dust heir rejection test: 3 equal heirs with pot = 1,500 (500 < 546 dust) fails both off-chain and on-chain
    const genSmallUtxo = await fund(verifier, owner.address, 20_000n, 0);
    const eq3 = equalShares(3);
    const { spendMtp: mDust } = await verifier.getCurrentSpendContext();
    const dustPlan = buildGenesisV2PlanTx({
      provider,
      genesisUtxo: genSmallUtxo,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      policy: {
        inactivityPeriodSeconds: 60,
        reviewPeriodSeconds: 512,
        feeBudget: 5_000n,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [0, 1, 2].map((i) => ({ pkh: heirs[i].pkh, share: eq3.shares[i] })),
      },
      createdAtLocktime: mDust - 1,
      initialDepositSats: 1_500n, // sponsored finalize pot = 1500 + 1000 - 1000 = 1500 -> 500 each < 546
    });
    await sendStrictBuilder(verifier, dustPlan.builder);
    await verifier.advanceTimeAndMine(61, 6);
    let dustState = await discoverPusakaV2State(dustPlan.handle);
    const { spendMtp: mDustOpen } = await verifier.getCurrentSpendContext();
    const dustOpen = buildOpenClaimByInactivityTx({
      handle: dustPlan.handle,
      planUtxo: dustState.planUtxo!,
      locktime: mDustOpen - 1,
      sponsorUtxo: pickFundedPlainUtxo(await relayer.signer.getUtxos(), 6_000n),
      sponsorUnlocker: relayer.tpl.unlockP2PKH(),
      sponsorChangeAddress: relayer.address,
    });
    await sendStrictBuilder(verifier, dustOpen.builder);
    await verifier.advanceTimeAndMine(512, 6);
    dustState = await discoverPusakaV2State(dustPlan.handle);

    expect(() =>
      computePolicyPayoutPreview(1_500n, dustPlan.policy),
    ).toThrow(/below dust/i);

    // Force raw tx with 500-sat heir outputs to prove contract VM also rejects dust
    const sponsorCoin = pickFundedPlainUtxo(await relayer.signer.getUtxos(), 10_000n);
    const forcedDustBuilder = new TransactionBuilder({ provider, allowImplicitNftBurn: true })
      .addInput(dustState.planUtxo!, dustPlan.contracts.plan.unlock.finalizeClaim(dustPlan.policy.policyBytes))
      .addInput(dustState.anchorUtxo!, dustPlan.contracts.anchor.unlock.finalize(), {
        sequence: dustPlan.policy.reviewSequence,
      })
      .addInput(sponsorCoin, relayer.tpl.unlockP2PKH())
      .addOutput({
        to: dustPlan.contracts.planAddress,
        amount: 1_000n,
        token: {
          category: dustPlan.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_PAID_OUT,
                round: dustState.round,
                approvalsMask: 0,
                deadline: dustState.deadline,
                inactivityPeriodSeconds: dustState.inactivityPeriodSeconds,
                policyHashBytes: dustPlan.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({ to: heirs[0].address, amount: 500n })
      .addOutput({ to: heirs[1].address, amount: 500n })
      .addOutput({ to: heirs[2].address, amount: 500n })
      .addOutput({ to: relayer.address, amount: sponsorCoin.satoshis - 4_500n });
    const forcedDustTx = forcedDustBuilder.build();
    const dustVerify = await verifier.verifyTxStrict(forcedDustTx);
    expect(dustVerify.ok).toBe(false);
    expect(() => forcedDustBuilder.debug()).toThrow(/heir share below dust/i);
  }, 60_000);

  it('enforces consensus BIP68 delay on BOTH contact-quorum and inactivity triggers and rejects backdated/mutated timings', async () => {
    const { provider, verifier, owner, c0, c1, c2, relayer, heirs } = await setupEnv();
    const genUtxo = await fund(verifier, owner.address, 200_000n, 0);
    await fund(verifier, c0.address, 50_000n, 0);
    await fund(verifier, c1.address, 50_000n, 0);
    await fund(verifier, relayer.address, 100_000n, 0);

    const { spendMtp: m0 } = await verifier.getCurrentSpendContext();
    const gen = buildGenesisV2PlanTx({
      provider,
      genesisUtxo: genUtxo,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      policy: {
        inactivityPeriodSeconds: 3_600,
        reviewPeriodSeconds: 600, // 2 * 512s = 1024s (0x00400002)
        feeBudget: DEFAULT_FEE_BUDGET,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      createdAtLocktime: m0 - 1,
      initialDepositSats: 50_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // Route A: Contact quorum opens REVIEW before inactivity
    let state = await discoverPusakaV2State(gen.handle);
    const v1 = buildContactApproveTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: 0,
      contactUtxo: pickFundedPlainUtxo(await c0.signer.getUtxos(), 5_000n),
      contactUnlocker: c0.tpl.unlockP2PKH(),
      contactChangeAddress: c0.address,
    });
    await sendStrictBuilder(verifier, v1.builder);
    state = await discoverPusakaV2State(gen.handle);
    const v2 = buildContactApproveTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: 1,
      contactUtxo: pickFundedPlainUtxo(await c1.signer.getUtxos(), 6_000n),
      contactUnlocker: c1.tpl.unlockP2PKH(),
      contactChangeAddress: c1.address,
    });
    await sendStrictBuilder(verifier, v2.builder);

    state = await discoverPusakaV2State(gen.handle);
    const finA = buildFinalizeClaimTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
    });
    const finAHex = finA.builder.build();

    // 0s elapsed -> strictly rejected non-BIP68-final
    const rej0 = await verifier.verifyTxStrict(finAHex);
    expect(rej0.ok).toBe(false);
    expect(rej0.stage).toBe('bip68-sequence');

    // Unconfirmed anchor (height=0) rejected even at +2000s if simulated unconfirmed
    const rejUnconf = await verifier.verifyTxStrict(finAHex, {
      outpointOverrides: new Map([[`${state.anchorUtxo!.txid}:${state.anchorUtxo!.vout}`, { height: 0, prevMtp: m0 }]]),
    });
    expect(rejUnconf.ok).toBe(false);
    expect(rejUnconf.stage).toBe('bip68-sequence');

    // 1023s elapsed (< 1024s) -> rejected
    await verifier.advanceTimeAndMine(1_023, 6);
    const rej1023 = await verifier.verifyTxStrict(finAHex);
    expect(rej1023.ok).toBe(false);
    expect(rej1023.stage).toBe('bip68-sequence');

    // Advance 1s more, mine ONLY 5 blocks (11-block MTP stays stagnant at +1023) -> still rejected!
    await verifier.advanceTimeAndMine(1, 5);
    const rej5Blocks = await verifier.verifyTxStrict(finAHex);
    expect(rej5Blocks.ok).toBe(false);
    expect(rej5Blocks.stage).toBe('bip68-sequence');

    // Transaction version 1, disabled flag, height sequence, shorter time sequence all fail
    const badVer = buildMutatedTxHex(finAHex, (tx) => ({ ...tx, version: 1 }));
    expect((await verifier.verifyTxStrict(badVer)).ok).toBe(false);

    const badSeqDisabled = buildFinalizeClaimTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      anchorSequenceOverride: (BIP68_DISABLE_FLAG | 1) >>> 0,
    }).builder.build();
    expect((await verifier.verifyTxStrict(badSeqDisabled)).ok).toBe(false);

    const badSeqHeight = buildFinalizeClaimTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      anchorSequenceOverride: 0x0000ffff,
    }).builder.build();
    expect((await verifier.verifyTxStrict(badSeqHeight)).ok).toBe(false);

    const badSeqShort = buildFinalizeClaimTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      anchorSequenceOverride: (BIP68_TIME_FLAG | 1) >>> 0,
    }).builder.build();
    expect((await verifier.verifyTxStrict(badSeqShort)).ok).toBe(false);

    // Owner cancels via checkIn() immediately while in REVIEW (burns Anchor)
    const { spendMtp: mCancel } = await verifier.getCurrentSpendContext();
    const ciCancel = buildCheckInTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      ownerUtxo: pickFundedPlainUtxo(await owner.signer.getUtxos(), 6_000n),
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerChangeAddress: owner.address,
      locktime: mCancel - 1,
    });
    expect(ciCancel.cancelledReview).toBe(true);
    await sendStrictBuilder(verifier, ciCancel.builder);

    // Route B: Inactivity trigger fails before deadline, then succeeds after deadline
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('ACTIVE');
    const preDeadlineOpen = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.openClaimByInactivity(gen.policy.policyBytes))
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats - 1000n - 3500n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_REVIEW,
                round: state.round + 1,
                approvalsMask: 0,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({
        to: gen.contracts.anchorAddress,
        amount: 1000n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.none,
            commitment: binToHex(encodeAnchorCommitment(state.round + 1, gen.policy.reviewSequence)),
          },
        },
      })
      .setLocktime(state.deadline) // future relative to spendMtp!
      .build();
    const rejFutureLock = await verifier.verifyTxStrict(preDeadlineOpen);
    expect(rejFutureLock.ok).toBe(false);
    expect(rejFutureLock.stage).toBe('locktime');

    // Advance past inactivity deadline -> inactivity open succeeds, starts a FRESH 0s BIP68 anchor clock!
    await verifier.advanceTimeAndMine(3_700, 6);
    const { spendMtp: mExpired } = await verifier.getCurrentSpendContext();
    const openB = buildOpenClaimByInactivityTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      locktime: mExpired - 1,
    });
    await sendStrictBuilder(verifier, openB.builder);

    state = await discoverPusakaV2State(gen.handle);
    const finB = buildFinalizeClaimTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
    });
    // Immediate finalize after inactivity trigger MUST fail BIP68 delay!
    expect((await verifier.verifyTxStrict(finB.builder.build())).ok).toBe(false);

    // Wait 1024s across 6 blocks -> Route B finalizes cleanly
    await verifier.advanceTimeAndMine(1_024, 6);
    await sendStrictBuilder(verifier, finB.builder);
    expect((await discoverPusakaV2State(gen.handle)).status).toBe('PAID_OUT');
  });

  it('supports owner atomic cancel across send/cancelClaim/updatePolicy, full spendable drain, and CLOSED exit + late recovery', async () => {
    const { provider, verifier, owner, c0, c1, c2, c3, recipient, relayer, heirs } = await setupEnv();
    const genUtxo = await fund(verifier, owner.address, 200_000n, 0);
    await fund(verifier, c0.address, 50_000n, 0);
    await fund(verifier, c1.address, 50_000n, 0);
    await fund(verifier, c2.address, 50_000n, 0);
    await fund(verifier, relayer.address, 50_000n, 0);

    const { spendMtp: m0 } = await verifier.getCurrentSpendContext();
    const gen = buildGenesisV2PlanTx({
      provider,
      genesisUtxo: genUtxo,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      policy: {
        inactivityPeriodSeconds: 10_000,
        reviewPeriodSeconds: 512,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      createdAtLocktime: m0 - 1,
      initialDepositSats: 25_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // Trigger 2-of-3 quorum -> owner uses send() to spend + atomically cancel REVIEW in one tx
    let state = await discoverPusakaV2State(gen.handle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 0,
        contactUtxo: pickFundedPlainUtxo(await c0.signer.getUtxos(), 5_000n),
        contactUnlocker: c0.tpl.unlockP2PKH(),
        contactChangeAddress: c0.address,
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 1,
        contactUtxo: pickFundedPlainUtxo(await c1.signer.getUtxos(), 6_000n),
        contactUnlocker: c1.tpl.unlockP2PKH(),
        contactChangeAddress: c1.address,
      }).builder,
    );

    // ownerExit must be blocked during REVIEW
    state = await discoverPusakaV2State(gen.handle);
    const { spendMtp: mSend } = await verifier.getCurrentSpendContext();
    expect(() =>
      buildOwnerExitTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxo: genUtxo,
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerAddress: owner.address,
        locktime: mSend - 1,
      }),
    ).toThrow(/cancel pending REVIEW/i);

    // Full spendable drain via send() during REVIEW atomically burns Anchor and leaves 1,000-sat carrier!
    const drainSend = buildSendTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      ownerUtxo: pickFundedPlainUtxo(await owner.signer.getUtxos(), 6_000n),
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerChangeAddress: owner.address,
      recipientAddressOrLock: recipient.address,
      amount: state.spendableBalanceSats, // drains to exact 1,000 carrier
      locktime: mSend - 1,
    });
    expect(drainSend.cancelledReview).toBe(true);
    expect(drainSend.planSatsAfter).toBe(1_000n);
    await sendStrictBuilder(verifier, drainSend.builder);

    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('ACTIVE');
    expect(state.planBalanceSats).toBe(1_000n);
    expect(state.anchorUtxo).toBeUndefined();

    // New transfer arrives at inboxAddress after full drain -> revives plan cleanly
    await fund(verifier, gen.metadata.inboxAddress, 15_000n, 0);
    state = await discoverPusakaV2State(gen.handle);
    await sendStrictBuilder(
      verifier,
      buildSweepInboxTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        inboxUtxos: state.inboxUtxos,
        mode: 'self',
      }).builder,
    );

    // Enter REVIEW again and test explicit cancelClaim() + updatePolicy() atomic cancel
    state = await discoverPusakaV2State(gen.handle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 1,
        contactUtxo: pickFundedPlainUtxo(await c1.signer.getUtxos(), 5_000n),
        contactUnlocker: c1.tpl.unlockP2PKH(),
        contactChangeAddress: c1.address,
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 2,
        contactUtxo: pickFundedPlainUtxo(await c2.signer.getUtxos(), 6_000n),
        contactUnlocker: c2.tpl.unlockP2PKH(),
        contactChangeAddress: c2.address,
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    const { spendMtp: mCancel } = await verifier.getCurrentSpendContext();
    await sendStrictBuilder(
      verifier,
      buildCancelClaimTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        anchorUtxo: state.anchorUtxo!,
        ownerUtxo: pickFundedPlainUtxo(await owner.signer.getUtxos(), 6_000n),
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerChangeAddress: owner.address,
        locktime: mCancel - 1,
      }).builder,
    );

    // Owner exits cleanly -> status becomes CLOSED with 1,000-sat carrier alive & renewed deadline
    await verifier.advanceTimeAndMine(120, 2);
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('ACTIVE');
    const prevDeadline = state.deadline;
    const { spendMtp: mExit1 } = await verifier.getCurrentSpendContext();
    const exitTx = buildOwnerExitTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: pickFundedPlainUtxo(await owner.signer.getUtxos(), 6_000n),
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      locktime: mExit1 - 1,
    });
    await sendStrictBuilder(verifier, exitTx.builder);

    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('CLOSED');
    expect(state.planBalanceSats).toBe(1_000n);
    expect(state.deadline).toBe(Math.max(prevDeadline, (mExit1 - 1) + state.inactivityPeriodSeconds));

    // Late deposit hits inboxAddress while CLOSED -> sweeps cleanly into CLOSED plan without extending deadline;
    // owner can still recover it via ownerExit or reactivate via checkIn!
    await fund(verifier, gen.metadata.inboxAddress, 20_000n, 0);
    state = await discoverPusakaV2State(gen.handle);
    await sendStrictBuilder(
      verifier,
      buildSweepInboxTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        inboxUtxos: state.inboxUtxos,
        mode: 'self',
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('CLOSED');
    expect(state.planBalanceSats).toBeGreaterThan(15_000n);
    expect(state.deadline).toBe(exitTx.nextDeadline);

    // Verify owner recovers CLOSED balance cleanly
    const { spendMtp: mExit2 } = await verifier.getCurrentSpendContext();
    await sendStrictBuilder(
      verifier,
      buildOwnerExitTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxo: pickFundedPlainUtxo(await owner.signer.getUtxos(), 6_000n),
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerAddress: owner.address,
        locktime: mExit2 - 1,
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('CLOSED');
    expect(state.planBalanceSats).toBe(1_000n);

    // Owner reactivates CLOSED plan via checkIn() -> back to ACTIVE!
    const { spendMtp: mRe } = await verifier.getCurrentSpendContext();
    await sendStrictBuilder(
      verifier,
      buildCheckInTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxo: pickFundedPlainUtxo(await owner.signer.getUtxos(), 6_000n),
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerChangeAddress: owner.address,
        locktime: mRe - 1,
      }).builder,
    );
    expect((await discoverPusakaV2State(gen.handle)).status).toBe('ACTIVE');
  });

  it('rejects all adversarial attack vectors (fee-reserve siphon, contact double-vote/replay, substitution, policy forgery, CLTV bypass, inbox skim)', async () => {
    const { provider, verifier, owner, c0, c1, c2, stranger, heirs } = await setupEnv();
    const genUtxo = await fund(verifier, owner.address, 200_000n, 0);
    await fund(verifier, stranger.address, 100_000n, 0);
    await fund(verifier, c0.address, 100_000n, 0);
    await fund(verifier, c1.address, 100_000n, 0);

    const { spendMtp: m0 } = await verifier.getCurrentSpendContext();
    const gen = buildGenesisV2PlanTx({
      provider,
      genesisUtxo: genUtxo,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      policy: {
        inactivityPeriodSeconds: 600,
        reviewPeriodSeconds: 512,
        feeBudget: 6_000n,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      createdAtLocktime: m0 - 1,
      initialDepositSats: 50_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // 1. Tampered metadata rejected fail-closed
    const badMeta = { ...gen.metadata, inboxAddress: stranger.address };
    await expect(attachPusakaV2Plan(badMeta, provider)).rejects.toThrow(/metadata mismatch/i);

    // 2. Duplicate contacts / owner-as-contact rejected by SDK & on-chain updatePolicy
    expect(() =>
      encodePolicyBytes({
        inactivityPeriodSeconds: 600,
        reviewPeriodSeconds: 512,
        contacts: [c0.pkh, c0.pkh, c1.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      }),
    ).toThrow(/distinct/i);
    expect(() =>
      encodePolicyBytes(
        {
          inactivityPeriodSeconds: 600,
          reviewPeriodSeconds: 512,
          contacts: [owner.pkh, c1.pkh, c2.pkh],
          heirs: [{ pkh: heirs[0].pkh, share: 1 }],
        },
        owner.pkh,
      ),
    ).toThrow(/distinct from the owner/i);

    let state = await discoverPusakaV2State(gen.handle);

    // 3. Stranger cannot send, checkIn, or exit
    const strangerSendHex = new TransactionBuilder({ provider })
      .addInput(
        state.planUtxo!,
        gen.contracts.plan.unlock.send(p2pkhLockingBytecode(stranger.pkh), 5_000n),
      )
      .addInput(pickFundedPlainUtxo(await stranger.signer.getUtxos(), 6_000n), stranger.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: 45_000n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_ACTIVE,
                round: 1,
                approvalsMask: 0,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({ to: stranger.address, amount: 5_000n })
      .setLocktime(m0 - 1)
      .build();
    expect((await verifier.verifyTxStrict(strangerSendHex)).ok).toBe(false);

    // 4. CLTV bypass attempt with sequence = 0xffffffff and future locktime rejected
    const ownerCoin = pickFundedPlainUtxo(await owner.signer.getUtxos(), 6_000n);
    const cltvBypassHex = new TransactionBuilder({ provider })
      .addInput(
        state.planUtxo!,
        gen.contracts.plan.unlock.checkIn(),
        { sequence: 0xffffffff },
      )
      .addInput(ownerCoin, owner.tpl.unlockP2PKH(), { sequence: 0xffffffff })
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_ACTIVE,
                round: 1,
                approvalsMask: 0,
                deadline: state.deadline + 1_000_000,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .setLocktime(m0 + 1_000_000 - gen.policy.inactivityPeriodSeconds)
      .build();
    expect((await verifier.verifyTxStrict(cltvBypassHex)).ok).toBe(false);

    // 5. Contact 0 cannot count twice in the same round, and cannot renew deadline
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 0,
        contactUtxo: pickFundedPlainUtxo(await c0.signer.getUtxos(), 6_000n),
        contactUnlocker: c0.tpl.unlockP2PKH(),
        contactChangeAddress: c0.address,
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    const doubleVoteBuilder = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.contactApprove(0n, gen.policy.policyBytes))
      .addInput(pickFundedPlainUtxo(await c0.signer.getUtxos(), 6_000n), c0.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_REVIEW,
                round: state.round + 1,
                approvalsMask: 0,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({
        to: gen.contracts.anchorAddress,
        amount: 1_000n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.none,
            commitment: binToHex(encodeAnchorCommitment(state.round + 1, gen.policy.reviewSequence)),
          },
        },
      });
    const doubleRes = await verifier.verifyTxStrict(doubleVoteBuilder.build());
    expect(doubleRes.ok).toBe(false);
    expect(() => doubleVoteBuilder.debug()).toThrow(/already approved/i);

    // 6. Self-funded openClaimByInactivity fee-reserve siphon (extra caller change output) REJECTED!
    await verifier.advanceTimeAndMine(650, 6);
    const { spendMtp: mLate } = await verifier.getCurrentSpendContext();
    state = await discoverPusakaV2State(gen.handle);
    const openSiphonBuilder = new TransactionBuilder({ provider })
      .addInput(
        state.planUtxo!,
        gen.contracts.plan.unlock.openClaimByInactivity(gen.policy.policyBytes),
      )
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats - 1_000n - 5_500n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_REVIEW,
                round: state.round + 1,
                approvalsMask: 0,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({
        to: gen.contracts.anchorAddress,
        amount: 1_000n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.none,
            commitment: binToHex(encodeAnchorCommitment(state.round + 1, gen.policy.reviewSequence)),
          },
        },
      })
      .addOutput({ to: stranger.address, amount: 1_900n }) // siphon attempt!
      .setLocktime(mLate - 1);
    const openSiphonRes = await verifier.verifyTxStrict(openSiphonBuilder.build());
    expect(openSiphonRes.ok).toBe(false);
    expect(() => openSiphonBuilder.debug()).toThrow(/self-funded open cannot pay caller change/i);

    // Legitimately open claim, deposit during REVIEW (must preserve Anchor outpoint/age), then test finalize attacks
    await sendStrictBuilder(
      verifier,
      buildOpenClaimByInactivityTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        locktime: mLate - 1,
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    const anchorOutpointBefore = `${state.anchorUtxo!.txid}:${state.anchorUtxo!.vout}`;

    await fund(verifier, gen.metadata.inboxAddress, 10_000n, 0);
    await sendStrictBuilder(
      verifier,
      buildSweepInboxTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        inboxUtxos: (await discoverPusakaV2State(gen.handle)).inboxUtxos,
        mode: 'self',
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    expect(`${state.anchorUtxo!.txid}:${state.anchorUtxo!.vout}`).toBe(anchorOutpointBefore);

    await verifier.advanceTimeAndMine(512, 6);
    state = await discoverPusakaV2State(gen.handle);

    const pot = state.planBalanceSats + state.anchorBalanceSats - 1_000n - gen.policy.feeBudget;
    const finSiphonBuilder = new TransactionBuilder({ provider, allowImplicitNftBurn: true })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.finalizeClaim(gen.policy.policyBytes))
      .addInput(state.anchorUtxo!, gen.contracts.anchor.unlock.finalize(), {
        sequence: gen.policy.reviewSequence,
      })
      .addOutput({
        to: gen.contracts.planAddress,
        amount: 1_000n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_PAID_OUT,
                round: state.round,
                approvalsMask: 0,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({ to: heirs[0].address, amount: pot })
      .addOutput({ to: stranger.address, amount: 1_500n }); // siphon attempt!
    const finSiphonRes = await verifier.verifyTxStrict(finSiphonBuilder.build());
    expect(finSiphonRes.ok).toBe(false);
    expect(() => finSiphonBuilder.debug()).toThrow(/self-funded finalize output count/i);

    // Recipient substitution on finalizeClaim rejected
    const hijackBuilder = new TransactionBuilder({ provider, allowImplicitNftBurn: true })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.finalizeClaim(gen.policy.policyBytes))
      .addInput(state.anchorUtxo!, gen.contracts.anchor.unlock.finalize(), {
        sequence: gen.policy.reviewSequence,
      })
      .addOutput({
        to: gen.contracts.planAddress,
        amount: 1_000n + (gen.policy.feeBudget - 4_000n),
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_PAID_OUT,
                round: state.round,
                approvalsMask: 0,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({ to: stranger.address, amount: pot });
    const hijackRes = await verifier.verifyTxStrict(hijackBuilder.build());
    expect(hijackRes.ok).toBe(false);
    expect(() => hijackBuilder.debug()).toThrow(/wrong heir address/i);

    // Forged policyBytes rejected
    const forgedPolicy = encodePolicyBytes({
      inactivityPeriodSeconds: 600,
      reviewPeriodSeconds: 512,
      feeBudget: 6_000n,
      contacts: [c0.pkh, c1.pkh, c2.pkh],
      heirs: [{ pkh: stranger.pkh, share: 1 }],
    });
    const forgedBuilder = new TransactionBuilder({ provider, allowImplicitNftBurn: true })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.finalizeClaim(forgedPolicy.policyBytes))
      .addInput(state.anchorUtxo!, gen.contracts.anchor.unlock.finalize(), {
        sequence: gen.policy.reviewSequence,
      })
      .addOutput({
        to: gen.contracts.planAddress,
        amount: 1_000n + (gen.policy.feeBudget - 4_000n),
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_PAID_OUT,
                round: state.round,
                approvalsMask: 0,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({ to: stranger.address, amount: pot });
    const forgedRes = await verifier.verifyTxStrict(forgedBuilder.build());
    expect(forgedRes.ok).toBe(false);
    expect(() => forgedBuilder.debug()).toThrow(/policyBytes hash mismatch/i);

    // Standalone Anchor spend without Plan NFT rejected
    const standaloneAnchorBuilder = new TransactionBuilder({ provider, allowImplicitNftBurn: true })
      .addInput(state.anchorUtxo!, gen.contracts.anchor.unlock.finalize(), {
        sequence: gen.policy.reviewSequence,
      })
      .addInput(pickFundedPlainUtxo(await stranger.signer.getUtxos(), 6_000n), stranger.tpl.unlockP2PKH())
      .addOutput({ to: stranger.address, amount: 2_000n });
    expect((await verifier.verifyTxStrict(standaloneAnchorBuilder.build())).ok).toBe(false);

    // Inbox self-sweep fee cap excess rejected
    const inboxCoin = await fund(verifier, gen.metadata.inboxAddress, 10_000n, 0);
    const overFeeSweepBuilder = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.deposit())
      .addInput(inboxCoin, gen.contracts.inbox.unlock.sweep())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats + 10_000n - (3_300n + 600n + 1n),
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: state.planUtxo!.token!.nft!.commitment,
          },
        },
      });
    const sweepOverRes = await verifier.verifyTxStrict(overFeeSweepBuilder.build());
    expect(sweepOverRes.ok).toBe(false);
    expect(() => overFeeSweepBuilder.debug()).toThrow(/fee exceeds cap/i);
  }, 150_000);

  it('survives signed-byte round boundary (127 -> 128 -> 129), rejects stale-round anchor & sponsored skim & distributeLate siphon, and verifies all consensus byte limits', async () => {
    const { provider, verifier, owner, c0, c1, c2, relayer, stranger, heirs } = await setupEnv();
    const { spendMtp: m0 } = await verifier.getCurrentSpendContext();
    const policy = encodePolicyBytes(
      {
        inactivityPeriodSeconds: 600,
        reviewPeriodSeconds: 512,
        feeBudget: DEFAULT_FEE_BUDGET,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      owner.pkh,
    );
    const contracts = instantiatePusakaV2Contracts({
      provider,
      planCategoryHex: randomUtxo().txid,
      ownerPkh: owner.pkh,
    });
    const metadata = {
      version: PUSAKA_V2_VERSION,
      network: provider.network,
      planCategoryHex: contracts.planCategoryHex,
      ownerPkhHex: binToHex(owner.pkh),
      planAddress: contracts.planAddress,
      planLockHex: binToHex(contracts.planLockingBytecode),
      anchorAddress: contracts.anchorAddress,
      anchorLockHex: binToHex(contracts.anchorLockingBytecode),
      inboxAddress: contracts.inboxAddress,
      inboxLockHex: binToHex(contracts.inboxLockingBytecode),
      perInputFeeCap: contracts.perInputFeeCap.toString(),
      policyBytesHex: policy.policyBytesHex,
      policyHashHex: policy.policyHashHex,
      createdAtLocktime: m0 - 1,
      inactivityPeriodSeconds: policy.inactivityPeriodSeconds,
      reviewSequence: policy.reviewSequence,
      reviewUnits: policy.reviewUnits,
      effectiveReviewSeconds: policy.effectiveReviewSeconds,
      feeBudget: policy.feeBudget.toString(),
      contacts: [binToHex(c0.pkh), binToHex(c1.pkh), binToHex(c2.pkh)] as [string, string, string],
      totalShares: policy.totalShares.toString(),
      heirs: [{ pkhHex: binToHex(heirs[0].pkh), share: '1' }],
    };
    const handle = { metadata, policy, contracts, provider };

    const seedCoin = randomUtxo({ satoshis: 80_000n, vout: 0 });
    const round127Plan = await provider.addUtxo(contracts.planAddress, {
      txid: seedCoin.txid,
      vout: 0,
      satoshis: 80_000n,
      token: {
        category: contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: binToHex(
            encodePlanStateCommitment({
              status: PLAN_STATUS_ACTIVE,
              round: 127,
              approvalsMask: 0,
              deadline: m0 - 10,
              inactivityPeriodSeconds: 600,
              policyHashBytes: policy.policyHashBytes,
            }),
          ),
        },
      },
    });
    await verifier.recordOutpoint(round127Plan.txid, round127Plan.vout, 1);
    await fund(verifier, owner.address, 50_000n, 0);
    await fund(verifier, relayer.address, 50_000n, 0);
    await fund(verifier, stranger.address, 50_000n, 0);

    // 127 -> 128 across 0x80 signed-byte boundary via inactivity trigger
    let state = await discoverPusakaV2State(handle);
    expect(state.round).toBe(127);
    const open128 = buildOpenClaimByInactivityTx({
      handle,
      planUtxo: state.planUtxo!,
      locktime: m0 - 1,
    });
    expect(open128.nextRound).toBe(128);
    await sendStrictBuilder(verifier, open128.builder);

    // Owner cancels round 128 -> advances to round 129 via checkIn
    state = await discoverPusakaV2State(handle);
    expect(state.round).toBe(128);
    expect(state.anchorRound).toBe(128);
    const { spendMtp: mCancel } = await verifier.getCurrentSpendContext();
    await sendStrictBuilder(
      verifier,
      buildCheckInTx({
        handle,
        planUtxo: state.planUtxo!,
        anchorUtxo: state.anchorUtxo!,
        ownerUtxo: pickFundedPlainUtxo(await owner.signer.getUtxos(), 6_000n),
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerChangeAddress: owner.address,
        locktime: mCancel - 1,
      }).builder,
    );

    // Advance past new deadline, open round 130
    await verifier.advanceTimeAndMine(650, 6);
    state = await discoverPusakaV2State(handle);
    expect(state.round).toBe(129);
    const { spendMtp: mOpen2 } = await verifier.getCurrentSpendContext();
    await sendStrictBuilder(
      verifier,
      buildOpenClaimByInactivityTx({
        handle,
        planUtxo: state.planUtxo!,
        locktime: mOpen2 - 1,
      }).builder,
    );
    await verifier.advanceTimeAndMine(512, 6);
    state = await discoverPusakaV2State(handle);
    expect(state.round).toBe(130);

    // Counterfeit stale round-128 Anchor rejected against round-130 Plan
    const staleAnchor128 = await provider.addUtxo(contracts.anchorAddress, {
      txid: randomUtxo().txid,
      vout: 1,
      satoshis: 1_000n,
      token: {
        category: contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.none,
          commitment: binToHex(encodeAnchorCommitment(128, policy.reviewSequence)),
        },
      },
    });
    await verifier.recordOutpoint(staleAnchor128.txid, staleAnchor128.vout, 1);
    const stalePot = state.planBalanceSats + 1_000n - MIN_PLAN_CARRIER_SATS - policy.feeBudget;
    const stalePairHex = new TransactionBuilder({ provider, allowImplicitNftBurn: true })
      .addInput(state.planUtxo!, contracts.plan.unlock.finalizeClaim(policy.policyBytes))
      .addInput(staleAnchor128, contracts.anchor.unlock.finalize(), { sequence: policy.reviewSequence })
      .addOutput({
        to: contracts.planAddress,
        amount: MIN_PLAN_CARRIER_SATS + (policy.feeBudget - 4_000n),
        token: {
          category: contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_PAID_OUT,
                round: state.round,
                approvalsMask: 0,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({ to: heirs[0].address, amount: stalePot })
      .build();
    expect((await verifier.verifyTxStrict(stalePairHex)).ok).toBe(false);

    // Sponsored inbox sweep 1-sat skim rejected
    const inboxDeposit = await fund(verifier, metadata.inboxAddress, 20_000n, 0);
    const skimSweepHex = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, contracts.plan.unlock.deposit())
      .addInput(inboxDeposit, contracts.inbox.unlock.sweep())
      .addInput(pickFundedPlainUtxo(await stranger.signer.getUtxos(), 6_000n), stranger.tpl.unlockP2PKH())
      .addOutput({
        to: contracts.planAddress,
        amount: state.planBalanceSats + 19_999n, // skimmed 1 sat!
        token: {
          category: contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: state.planUtxo!.token!.nft!.commitment,
          },
        },
      })
      .addOutput({ to: stranger.address, amount: 46_000n })
      .build();
    expect((await verifier.verifyTxStrict(skimSweepHex)).ok).toBe(false);

    // Legitimately finalize round 130 -> PAID_OUT, sweep 20,000, and reject self-funded distributeLate siphon
    await sendStrictBuilder(
      verifier,
      buildFinalizeClaimTx({
        handle,
        planUtxo: state.planUtxo!,
        anchorUtxo: state.anchorUtxo!,
      }).builder,
    );
    state = await discoverPusakaV2State(handle);
    await sendStrictBuilder(
      verifier,
      buildSweepInboxTx({
        handle,
        planUtxo: state.planUtxo!,
        inboxUtxos: state.inboxUtxos,
        mode: 'self',
      }).builder,
    );
    state = await discoverPusakaV2State(handle);
    const latePot = state.planBalanceSats - MIN_PLAN_CARRIER_SATS - policy.feeBudget;
    const lateSiphonHex = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, contracts.plan.unlock.distributeLate(policy.policyBytes))
      .addOutput({
        to: contracts.planAddress,
        amount: MIN_PLAN_CARRIER_SATS,
        token: {
          category: contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: state.planUtxo!.token!.nft!.commitment,
          },
        },
      })
      .addOutput({ to: heirs[0].address, amount: latePot })
      .addOutput({ to: stranger.address, amount: 1_000n }) // siphon!
      .build();
    expect((await verifier.verifyTxStrict(lateSiphonHex)).ok).toBe(false);

    // Legitimate self-funded distributeLate succeeds
    const distOk = buildDistributeLateTx({
      handle,
      planUtxo: state.planUtxo!,
    });
    const distRes = await sendStrictBuilder(verifier, distOk.builder);
    assertConsensusSizeMetrics(distRes.txHex, 'distributeLate-self');
  });
});
