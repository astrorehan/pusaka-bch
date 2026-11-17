import { describe, expect, it } from 'vitest';
import {
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
  secp256k1,
} from '@bitauth/libauth';
import {
  attachPusakaV2Plan,
  buildCancelClaimTx,
  buildCheckInTx,
  buildContactApproveTx,
  buildDistributeLateTx,
  buildFinalizeClaimTx,
  buildGenesisV2PlanTx,
  buildOpenClaimByInactivityTx,
  buildOwnerExitTx,
  buildSendTx,
  buildSweepInboxTx,
  buildUpdatePolicyTx,
  DEFAULT_FEE_BUDGET,
  discoverPusakaV2State,
  encodeAnchorCommitment,
  encodePlanStateCommitment,
  equalShares,
  finalizeBuilderTxHex,
  MAX_CLTV_TIMESTAMP,
  MAX_OWNER_TX_FEE,
  MIN_PLAN_CARRIER_SATS,
  p2pkhLockingBytecode,
  percentShares,
  PLAN_STATUS_ACTIVE,
  PLAN_STATUS_CLOSED,
  PLAN_STATUS_REVIEW,
  type PusakaV2PolicyInput,
} from '../../scripts/v2/pusaka-v2.js';
import { StrictBip68ChainVerifier } from '../../scripts/v2/claim-review-verifier.js';

interface TestActor {
  priv: Uint8Array;
  pub: Uint8Array;
  pkh: Uint8Array;
  address: string;
  tpl: SignatureTemplate;
  signer: Signer;
}

function makeActor(seedByte: number, provider: MockNetworkProvider): TestActor {
  // Deterministic non-secret local test keys (never used on mainnet)
  const priv = new Uint8Array(32).fill(seedByte);
  priv[31] = ((seedByte * 11 + 3) & 0xff) || 1;
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

function createStrictExternalSigner(actor: TestActor, provider: MockNetworkProvider): Signer {
  const unlocker = actor.tpl.unlockP2PKH();
  const ownLockHex = binToHex(unlocker.generateLockingBytecode());
  const wallet: ExternalTransactionSigner = {
    async signTransaction(request) {
      const { transaction, sourceOutputs } = request;
      const inputs = transaction.inputs.map((inp, idx) => {
        if (binToHex(sourceOutputs[idx].lockingBytecode) !== ownLockHex) {
          return inp;
        }
        return {
          ...inp,
          unlockingBytecode: unlocker.generateUnlockingBytecode({
            transaction,
            sourceOutputs,
            inputIndex: idx,
          }),
        };
      });
      return { signedTransaction: binToHex(encodeTransaction({ ...transaction, inputs })) };
    },
  };
  return Signer.external(
    { wallet, address: actor.address, publicKey: actor.pub, userPrompt: 'Pusaka v2 Review' },
    provider,
  );
}

async function setupReviewEnv() {
  const provider = new MockNetworkProvider();
  const verifier = new StrictBip68ChainVerifier(provider);
  await verifier.init();

  const owner = makeActor(0x81, provider);
  const c0 = makeActor(0x82, provider);
  const c1 = makeActor(0x83, provider);
  const c2 = makeActor(0x84, provider);
  const relayer = makeActor(0x85, provider);
  const recipient = makeActor(0x86, provider);
  const heirs = Array.from({ length: 10 }, (_, i) => makeActor(0x90 + i, provider));

  return { provider, verifier, owner, c0, c1, c2, relayer, recipient, heirs };
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

function assertConsensusLimits(
  builder: TransactionBuilder,
  txHex: string,
  label: string,
  checkVmUsage = true,
) {
  const raw = hexToBin(txHex);
  expect(raw.length, `${label} tx bytes < 100k`).toBeLessThan(100_000);
  const decoded = decodeTransactionBch(raw);
  expect(typeof decoded).not.toBe('string');
  if (typeof decoded !== 'string') {
    for (let i = 0; i < decoded.inputs.length; i++) {
      expect(
        decoded.inputs[i].unlockingBytecode.length,
        `${label} input[${i}] < 10,000 B`,
      ).toBeLessThan(10_000);
    }
  }
  if (checkVmUsage) {
    const usage = builder.getVmResourceUsage();
    for (let i = 0; i < usage.length; i++) {
      expect(
        usage[i].operationCost,
        `${label} input[${i}] VM opCost < max`,
      ).toBeLessThan(usage[i].maximumOperationCost);
    }
  }
}

describe('Pusaka v2 Independent Review — Corrections & Coverage Checks', () => {
  it('[Fix #1a] post-ownerExit CLOSED receipts remain claimable via renewed inactivity deadline + full BIP68 review, while empty CLOSED plans reject public claim entry and sweeps never renew deadline', async () => {
    const { provider, verifier, owner, c0, c1, c2, relayer, heirs } = await setupReviewEnv();
    const genUtxo = await fund(verifier, owner.address, 200_000n, 0);
    await fund(verifier, c0.address, 50_000n, 0);
    await fund(verifier, relayer.address, 50_000n, 0);

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
        feeBudget: DEFAULT_FEE_BUDGET,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      createdAtLocktime: m0 - 1,
      initialDepositSats: 25_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // Advance 300s so ownerExit genuinely renews deadline beyond genesis deadline
    await verifier.advanceTimeAndMine(300, 3);
    const { spendMtp: mExit } = await verifier.getCurrentSpendContext();
    let state = await discoverPusakaV2State(gen.handle);
    const exitLocktime = mExit - 1;
    const exitTx = buildOwnerExitTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: (await owner.signer.getUtxos()).find((u) => !u.token && u.satoshis >= 6_000n)!,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      locktime: exitLocktime,
    });
    expect(exitTx.nextDeadline).toBe(exitLocktime + 600);
    await sendStrictBuilder(verifier, exitTx.builder);

    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('CLOSED');
    expect(state.planBalanceSats).toBe(MIN_PLAN_CARRIER_SATS);
    expect(state.deadline).toBe(exitTx.nextDeadline);

    // Negative: empty (1,000-sat carrier) CLOSED plan cannot open inactivity or contact claim
    await verifier.advanceTimeAndMine(700, 6);
    const { spendMtp: mEmpty } = await verifier.getCurrentSpendContext();
    const relayerCoinEmpty = (await relayer.signer.getUtxos())[0];
    const c0CoinEmpty = (await c0.signer.getUtxos())[0];
    expect(() =>
      buildOpenClaimByInactivityTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        sponsorUtxo: relayerCoinEmpty,
        sponsorUnlocker: relayer.tpl.unlockP2PKH(),
        sponsorChangeAddress: relayer.address,
        locktime: mEmpty - 1,
      }),
    ).toThrow(/empty CLOSED plan/i);

    const rawEmptyInactivity = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.openClaimByInactivity(gen.policy.policyBytes))
      .addInput(relayerCoinEmpty, relayer.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: MIN_PLAN_CARRIER_SATS,
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
      .setLocktime(mEmpty - 1);
    expect((await verifier.verifyTxStrict(rawEmptyInactivity.build())).ok).toBe(false);
    expect(() => rawEmptyInactivity.debug()).toThrow(/closed plan has no spendable funds/i);

    expect(() =>
      buildContactApproveTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 0,
        contactUtxo: c0CoinEmpty,
        contactUnlocker: c0.tpl.unlockP2PKH(),
        contactChangeAddress: c0.address,
      }),
    ).toThrow(/empty CLOSED plan/i);

    // Owner re-exits at current time to anchor a fresh full inactivity window, then becomes unavailable
    const { spendMtp: mReExit } = await verifier.getCurrentSpendContext();
    const reExitTx = buildOwnerExitTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: (await owner.signer.getUtxos()).find((u) => !u.token && u.satoshis >= 6_000n)!,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      locktime: mReExit - 1,
    });
    await sendStrictBuilder(verifier, reExitTx.builder);
    state = await discoverPusakaV2State(gen.handle);
    const renewedDeadline = state.deadline;
    expect(renewedDeadline).toBe((mReExit - 1) + 600);

    // Third party pays 50,000 sats to inboxAddress -> sweeps cleanly into CLOSED without changing deadline
    await fund(verifier, gen.metadata.inboxAddress, 50_000n, 0);
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
    expect(state.planBalanceSats).toBeGreaterThan(45_000n);
    expect(state.deadline).toBe(renewedDeadline); // sweep is NOT proof of life

    // Negative: before renewedDeadline elapses, inactivity trigger in CLOSED MUST fail
    await verifier.advanceTimeAndMine(250, 2);
    const { spendMtp: mTooEarly } = await verifier.getCurrentSpendContext();
    expect(mTooEarly - 1).toBeLessThan(renewedDeadline);
    expect(() =>
      buildOpenClaimByInactivityTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        locktime: mTooEarly - 1,
      }),
    ).toThrow(/inactivity deadline/i);

    // Advance past renewedDeadline -> permissionless openClaimByInactivity enters REVIEW from CLOSED
    await verifier.advanceTimeAndMine(400, 6);
    const { spendMtp: mOpen } = await verifier.getCurrentSpendContext();
    expect(mOpen - 1).toBeGreaterThanOrEqual(renewedDeadline);
    const openClosed = buildOpenClaimByInactivityTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      locktime: mOpen - 1,
    });
    await sendStrictBuilder(verifier, openClosed.builder);
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('REVIEW');
    expect(state.anchorUtxo).toBeDefined();

    // Newly anchored full BIP68 review delay is strictly enforced before finalizeClaim
    const earlyFinalize = buildFinalizeClaimTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
    });
    expect((await verifier.verifyTxStrict(earlyFinalize.builder.build())).ok).toBe(false);

    // Advance full 512s review delay -> finalizeClaim pays heirs & enters PAID_OUT
    await verifier.advanceTimeAndMine(512, 6);
    const heirBefore = (await heirs[0].signer.getUtxos()).reduce((s, u) => s + u.satoshis, 0n);
    const finTx = buildFinalizeClaimTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
    });
    await sendStrictBuilder(verifier, finTx.builder);
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('PAID_OUT');
    const heirAfter = (await heirs[0].signer.getUtxos()).reduce((s, u) => s + u.satoshis, 0n);
    expect(heirAfter - heirBefore).toBe(finTx.paidTotal);

    // Additional late receipt at inboxAddress after PAID_OUT distributes via distributeLate
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
    const distLate = buildDistributeLateTx({ handle: gen.handle, planUtxo: state.planUtxo! });
    await sendStrictBuilder(verifier, distLate.builder);
    expect((await heirs[0].signer.getUtxos()).reduce((s, u) => s + u.satoshis, 0n) - heirAfter).toBe(
      distLate.paidTotal,
    );
  }, 60_000);

  it('[Fix #1b] post-ownerExit CLOSED receipts support 2-contact quorum (1st vote keeps CLOSED, sweeps preserve mask/deadline, 2nd enters REVIEW with full review delay) and reject ownerExit CLTV bounds', async () => {
    const { provider, verifier, owner, c0, c1, c2, heirs } = await setupReviewEnv();
    const genUtxo = await fund(verifier, owner.address, 200_000n, 0);
    await fund(verifier, c0.address, 50_000n, 0);
    await fund(verifier, c1.address, 50_000n, 0);

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
      initialDepositSats: 20_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // 1st contact vote in ACTIVE, then ownerExit() wipes approvalsMask and enters CLOSED
    let state = await discoverPusakaV2State(gen.handle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 0,
        contactUtxo: (await c0.signer.getUtxos())[0],
        contactUnlocker: c0.tpl.unlockP2PKH(),
        contactChangeAddress: c0.address,
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    expect(state.approvalsMask).toBe(1);

    // Negative: ownerExit with final sequence / low locktime (< 500_000_000) or CLTV overflow rejected
    const ownerExitCoin = (await owner.signer.getUtxos()).find((u) => !u.token && u.satoshis >= 6_000n)!;
    expect(() =>
      buildOwnerExitTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxo: ownerExitCoin,
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerAddress: owner.address,
        locktime: MAX_CLTV_TIMESTAMP - 5_000, // + 10_000 > MAX_CLTV_TIMESTAMP
      }),
    ).toThrow(/32-bit/);

    const rawLowLockExit = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.ownerExit())
      .addInput(ownerExitCoin, owner.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: MIN_PLAN_CARRIER_SATS,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(
              encodePlanStateCommitment({
                status: PLAN_STATUS_CLOSED,
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
      .addOutput({ to: owner.address, amount: state.planBalanceSats + ownerExitCoin.satoshis - MIN_PLAN_CARRIER_SATS - 3_500n })
      .setLocktime(100);
    expect((await verifier.verifyTxStrict(rawLowLockExit.build())).ok).toBe(false);

    // Valid ownerExit -> CLOSED, round incremented, stale contact vote wiped
    await sendStrictBuilder(
      verifier,
      buildOwnerExitTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxo: ownerExitCoin,
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerAddress: owner.address,
        locktime: m0 - 1,
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('CLOSED');
    expect(state.approvalsMask).toBe(0);

    // Post-exit deposit -> sweeps into CLOSED
    await fund(verifier, gen.metadata.inboxAddress, 25_000n, 0);
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

    // Negative: cannot spoof 1st contact vote into reactivating CLOSED -> ACTIVE on-chain
    const c0Coin = (await c0.signer.getUtxos()).find((u) => !u.token && u.satoshis >= 6_000n)!;
    const spoofReactivateTx = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.contactApprove(0n, gen.policy.policyBytes))
      .addInput(c0Coin, c0.tpl.unlockP2PKH())
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
                round: state.round,
                approvalsMask: 1,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({ to: c0.address, amount: c0Coin.satoshis - 3_800n });
    expect((await verifier.verifyTxStrict(spoofReactivateTx.build())).ok).toBe(false);

    // Valid 1st contact approval in CLOSED keeps status === CLOSED (does NOT silently reactivate!)
    const vote1 = buildContactApproveTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: 0,
      contactUtxo: c0Coin,
      contactUnlocker: c0.tpl.unlockP2PKH(),
      contactChangeAddress: c0.address,
    });
    expect(vote1.enteredReview).toBe(false);
    await sendStrictBuilder(verifier, vote1.builder);
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('CLOSED');
    expect(state.approvalsMask).toBe(1);
    expect(state.anchorUtxo).toBeUndefined();

    // Another receipt swept while CLOSED with 1 vote preserves status CLOSED, approvalsMask=1, and deadline
    const deadlineWithOneVote = state.deadline;
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
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('CLOSED');
    expect(state.approvalsMask).toBe(1);
    expect(state.deadline).toBe(deadlineWithOneVote);

    // 2nd distinct contact approval reaches quorum -> enters REVIEW and mints Anchor
    const c1Coin = (await c1.signer.getUtxos()).find((u) => !u.token && u.satoshis >= 6_000n)!;
    const vote2 = buildContactApproveTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: 1,
      contactUtxo: c1Coin,
      contactUnlocker: c1.tpl.unlockP2PKH(),
      contactChangeAddress: c1.address,
    });
    expect(vote2.enteredReview).toBe(true);
    await sendStrictBuilder(verifier, vote2.builder);
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('REVIEW');
    expect(state.anchorUtxo).toBeDefined();

    // Newly anchored full 512s review delay is enforced before finalizeClaim
    expect(
      (
        await verifier.verifyTxStrict(
          buildFinalizeClaimTx({
            handle: gen.handle,
            planUtxo: state.planUtxo!,
            anchorUtxo: state.anchorUtxo!,
          }).builder.build(),
        )
      ).ok,
    ).toBe(false);

    await verifier.advanceTimeAndMine(512, 6);
    const finTx = buildFinalizeClaimTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
    });
    await sendStrictBuilder(verifier, finTx.builder);
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('PAID_OUT');
  }, 60_000);

  it('[Fix #2a] persistent 600-sat owner auth coin repeatedly performs send, checkIn, updatePolicy, send-during-REVIEW, and cancelClaim with Signer.external without top-ups', async () => {
    const { provider, verifier, owner, c0, c1, c2, recipient, heirs } = await setupReviewEnv();
    const ownerExt = createStrictExternalSigner(owner, provider);
    const genUtxo = await fund(verifier, owner.address, 102_000n, 0);
    await fund(verifier, c0.address, 50_000n, 0);
    await fund(verifier, c1.address, 50_000n, 0);

    const { spendMtp: m0 } = await verifier.getCurrentSpendContext();
    // Owner locks 100,000 sats and retains ONLY a ~1,000-sat coin after genesis
    const gen = buildGenesisV2PlanTx({
      provider,
      genesisUtxo: genUtxo,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerAddress: ownerExt.address,
      ownerPkh: ownerExt.pkh,
      policy: {
        inactivityPeriodSeconds: 600,
        reviewPeriodSeconds: 512,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      createdAtLocktime: m0 - 1,
      initialDepositSats: 100_000n,
      fee: 1_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // Trim owner's remaining plain UTXO to an exact single 600-sat auth coin (no other ordinary funds!)
    const leftover = (await ownerExt.getUtxos())[0];
    const trimHex = new TransactionBuilder({ provider })
      .addInput(leftover, owner.tpl.unlockP2PKH())
      .addOutput({ to: owner.address, amount: 600n })
      .build();
    await verifier.sendTxStrict(trimHex);

    let ownerCoins = await ownerExt.getUtxos();
    expect(ownerCoins.length).toBe(1);
    expect(ownerCoins[0].satoshis).toBe(600n);

    // 1. send() using ONLY the 600-sat auth coin + Signer.external -> fee paid from protected BCH, 600-sat coin returned intact
    let state = await discoverPusakaV2State(gen.handle);
    const send1 = buildSendTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxos: [ownerCoins[0]],
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      recipientAddressOrLock: recipient.address,
      amount: 5_000n,
      locktime: m0 - 1,
    });
    expect(send1.feeFundingSource).toBe('protected');
    expect(send1.protectedFeeSats).toBe(send1.fee);
    expect(send1.ownerFeeSats).toBe(0n);
    expect(send1.ownerChangeSats).toBe(600n);
    expect(send1.planSatsAfter).toBe(100_000n - 5_000n - send1.fee);
    await sendStrictBuilder(verifier, send1.builder);

    ownerCoins = await ownerExt.getUtxos();
    expect(ownerCoins.length).toBe(1);
    expect(ownerCoins[0].satoshis).toBe(600n);

    // 2. checkIn() reusing the exact returned 600-sat auth coin
    state = await discoverPusakaV2State(gen.handle);
    const checkInTx = buildCheckInTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: ownerCoins[0],
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      locktime: m0 - 1,
    });
    expect(checkInTx.feeFundingSource).toBe('protected');
    expect(checkInTx.ownerChangeSats).toBe(600n);
    await sendStrictBuilder(verifier, checkInTx.builder);

    ownerCoins = await ownerExt.getUtxos();
    expect(ownerCoins.length).toBe(1);
    expect(ownerCoins[0].satoshis).toBe(600n);

    // 3. updatePolicy() reusing the same 600-sat auth coin
    state = await discoverPusakaV2State(gen.handle);
    const updTx = buildUpdatePolicyTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxos: [ownerCoins[0]],
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      newPolicy: {
        inactivityPeriodSeconds: 900,
        reviewPeriodSeconds: 512,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [
          { pkh: heirs[0].pkh, share: 1 },
          { pkh: heirs[1].pkh, share: 1 },
        ],
      },
      locktime: m0 - 1,
    });
    expect(updTx.feeFundingSource).toBe('protected');
    expect(updTx.ownerChangeSats).toBe(600n);
    await sendStrictBuilder(verifier, updTx.builder);

    ownerCoins = await ownerExt.getUtxos();
    expect(ownerCoins.length).toBe(1);
    expect(ownerCoins[0].satoshis).toBe(600n);

    // 4. Contacts trigger REVIEW -> send() during REVIEW atomically cancels claim while keeping 600-sat auth coin
    state = await discoverPusakaV2State(updTx.nextHandle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: updTx.nextHandle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 0,
        contactUtxo: (await c0.signer.getUtxos())[0],
        contactUnlocker: c0.tpl.unlockP2PKH(),
        contactChangeAddress: c0.address,
      }).builder,
    );
    state = await discoverPusakaV2State(updTx.nextHandle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: updTx.nextHandle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 1,
        contactUtxo: (await c1.signer.getUtxos())[0],
        contactUnlocker: c1.tpl.unlockP2PKH(),
        contactChangeAddress: c1.address,
      }).builder,
    );
    state = await discoverPusakaV2State(updTx.nextHandle);
    expect(state.status).toBe('REVIEW');

    const sendCancel = buildSendTx({
      handle: updTx.nextHandle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      ownerUtxos: [ownerCoins[0]],
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      recipientAddressOrLock: recipient.address,
      amount: 4_000n,
      locktime: m0 - 1,
    });
    expect(sendCancel.cancelledReview).toBe(true);
    expect(sendCancel.feeFundingSource).toBe('protected');
    expect(sendCancel.anchorFeeCreditSats).toBe(1_000n);
    expect(sendCancel.protectedFeeSats).toBe(sendCancel.fee - 1_000n);
    expect(sendCancel.ownerChangeSats).toBe(600n);
    await sendStrictBuilder(verifier, sendCancel.builder);

    ownerCoins = await ownerExt.getUtxos();
    expect(ownerCoins.length).toBe(1);
    expect(ownerCoins[0].satoshis).toBe(600n);

    // 5. Contacts trigger REVIEW again -> cancelClaim() reusing the same 600-sat auth coin
    state = await discoverPusakaV2State(updTx.nextHandle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: updTx.nextHandle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 0,
        contactUtxo: (await c0.signer.getUtxos()).find((u) => !u.token && u.satoshis >= 6_000n)!,
        contactUnlocker: c0.tpl.unlockP2PKH(),
        contactChangeAddress: c0.address,
      }).builder,
    );
    state = await discoverPusakaV2State(updTx.nextHandle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: updTx.nextHandle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 1,
        contactUtxo: (await c1.signer.getUtxos()).find((u) => !u.token && u.satoshis >= 6_000n)!,
        contactUnlocker: c1.tpl.unlockP2PKH(),
        contactChangeAddress: c1.address,
      }).builder,
    );
    state = await discoverPusakaV2State(updTx.nextHandle);
    const cancelTx = buildCancelClaimTx({
      handle: updTx.nextHandle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      ownerUtxos: [ownerCoins[0]],
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      locktime: m0 - 1,
    });
    expect(cancelTx.feeFundingSource).toBe('protected');
    expect(cancelTx.anchorFeeCreditSats).toBe(1_000n);
    expect(cancelTx.protectedFeeSats).toBe(cancelTx.fee - 1_000n);
    expect(cancelTx.ownerChangeSats).toBe(600n);
    await sendStrictBuilder(verifier, cancelTx.builder);

    state = await discoverPusakaV2State(updTx.nextHandle);
    expect(state.status).toBe('ACTIVE');
    ownerCoins = await ownerExt.getUtxos();
    expect(ownerCoins.length).toBe(1);
    expect(ownerCoins[0].satoshis).toBe(600n);
  }, 60_000);

  it('[Fix #2b] supports multi-UTXO ownerUtxos, auto/owner/protected/hybrid fee modes, and rejects excessive fee, carrier breach, change siphon/redirect, non-owner protected spend, and invalid UTXO inputs', async () => {
    const { provider, verifier, owner, c0, c1, c2, recipient, relayer, heirs } = await setupReviewEnv();
    const ownerExt = createStrictExternalSigner(owner, provider);
    const genUtxo = await fund(verifier, owner.address, 120_000n, 0);
    await fund(verifier, relayer.address, 50_000n, 0);

    const { spendMtp: m0 } = await verifier.getCurrentSpendContext();
    const gen = buildGenesisV2PlanTx({
      provider,
      genesisUtxo: genUtxo,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerAddress: ownerExt.address,
      ownerPkh: ownerExt.pkh,
      policy: {
        inactivityPeriodSeconds: 600,
        reviewPeriodSeconds: 512,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      createdAtLocktime: m0 - 1,
      initialDepositSats: 60_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // Give owner two small plain UTXOs (2,000 + 2,000 = 4,000 sats; remainder < 546 dust after ~3,841 fee!)
    const bigChange = (await ownerExt.getUtxos())[0];
    const splitHex = new TransactionBuilder({ provider })
      .addInput(bigChange, owner.tpl.unlockP2PKH())
      .addOutput({ to: owner.address, amount: 2_000n })
      .addOutput({ to: owner.address, amount: 2_000n })
      .addOutput({ to: owner.address, amount: 12_000n })
      .build();
    await verifier.sendTxStrict(splitHex);

    const smallCoins = (await ownerExt.getUtxos()).filter((u) => u.satoshis === 2_000n);
    const largeCoin = (await ownerExt.getUtxos()).find((u) => u.satoshis === 12_000n)!;
    let state = await discoverPusakaV2State(gen.handle);

    // 1. Explicit owner mode rejects insufficient single coin and refuses to burn last auth coin (< 546 remainder)
    expect(() =>
      buildSendTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxo: smallCoins[0],
        ownerUnlocker: ownerExt.unlockP2PKH(),
        ownerChangeAddress: ownerExt.address,
        recipientAddressOrLock: recipient.address,
        amount: 2_000n,
        locktime: m0 - 1,
        feeFunding: 'owner',
      }),
    ).toThrow(/insufficient for send fee/i);

    expect(() =>
      buildSendTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxos: smallCoins, // 4,000 sats total vs ~3,841 fee -> < 546 dust change
        ownerUnlocker: ownerExt.unlockP2PKH(),
        ownerChangeAddress: ownerExt.address,
        recipientAddressOrLock: recipient.address,
        amount: 2_000n,
        locktime: m0 - 1,
        feeFunding: 'owner',
      }),
    ).toThrow(/would consume the last owner auth coin/i);

    // 2. 'auto' with 4,000 sats across two coins preserves both coins intact via 'protected'
    const multiAuto = buildSendTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxos: smallCoins,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      recipientAddressOrLock: recipient.address,
      amount: 2_000n,
      locktime: m0 - 1,
    });
    expect(multiAuto.feeFundingSource).toBe('protected');
    expect(multiAuto.ownerChangeSats).toBe(4_000n);
    await sendStrictBuilder(verifier, multiAuto.builder);

    // 3. With a well-funded 12,000-sat coin, 'auto' preserves legacy owner-funded behavior,
    //    while explicit 'protected' keeps the 12,000-sat coin untouched!
    state = await discoverPusakaV2State(gen.handle);
    const autoOwner = buildCheckInTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: largeCoin,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      locktime: m0 - 1,
    });
    expect(autoOwner.feeFundingSource).toBe('owner');
    expect(autoOwner.protectedFeeSats).toBe(0n);
    expect(autoOwner.planSatsAfter).toBe(state.planBalanceSats);

    const explicitProtected = buildCheckInTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: largeCoin,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      locktime: m0 - 1,
      feeFunding: 'protected',
    });
    expect(explicitProtected.feeFundingSource).toBe('protected');
    expect(explicitProtected.ownerChangeSats).toBe(12_000n);
    expect(explicitProtected.planSatsAfter).toBe(state.planBalanceSats - explicitProtected.fee);

    // 4. 'hybrid' mode: plan only has 2,500 sats left after send -> splits fee between owner (4,000 - 600) and plan!
    const coin4000 = (await ownerExt.getUtxos()).find((u) => u.satoshis === 4_000n)!;
    const drainAlmostAll = buildSendTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: coin4000,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      recipientAddressOrLock: recipient.address,
      amount: state.planBalanceSats - 2_500n - 3_800n,
      fee: 3_800n,
      feeFunding: 'protected',
      locktime: m0 - 1,
    });
    await sendStrictBuilder(verifier, drainAlmostAll.builder);
    state = await discoverPusakaV2State(gen.handle);
    expect(state.planBalanceSats).toBe(2_500n);
    const freshCoin4000 = (await ownerExt.getUtxos()).find((u) => u.satoshis === 4_000n)!;

    const hybridCheckIn = buildCheckInTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      ownerUtxo: freshCoin4000,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      locktime: m0 - 1,
    });
    expect(hybridCheckIn.feeFundingSource).toBe('hybrid');
    expect(hybridCheckIn.ownerChangeSats).toBe(600n);
    expect(hybridCheckIn.protectedFeeSats).toBeGreaterThan(0n);
    expect(hybridCheckIn.protectedFeeSats).toBeLessThanOrEqual(1_500n);
    await sendStrictBuilder(verifier, hybridCheckIn.builder);

    // 5. SDK negative validations for ownerUtxos & protected change ownership
    state = await discoverPusakaV2State(gen.handle);
    const curCoin = (await ownerExt.getUtxos()).find((u) => u.satoshis === 600n)!;
    expect(() =>
      buildCheckInTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxos: [],
        ownerUnlocker: ownerExt.unlockP2PKH(),
        ownerChangeAddress: ownerExt.address,
        locktime: m0 - 1,
      }),
    ).toThrow(/At least one ordinary owner UTXO/i);
    expect(() =>
      buildCheckInTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxo: curCoin,
        ownerUtxos: [curCoin],
        ownerUnlocker: ownerExt.unlockP2PKH(),
        ownerChangeAddress: ownerExt.address,
        locktime: m0 - 1,
      }),
    ).toThrow(/not both/i);
    expect(() =>
      buildCheckInTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxos: [curCoin, curCoin],
        ownerUnlocker: ownerExt.unlockP2PKH(),
        ownerChangeAddress: ownerExt.address,
        locktime: m0 - 1,
      }),
    ).toThrow(/Duplicate owner UTXO/i);
    expect(() =>
      buildCheckInTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxos: [state.planUtxo!],
        ownerUnlocker: ownerExt.unlockP2PKH(),
        ownerChangeAddress: ownerExt.address,
        locktime: m0 - 1,
      }),
    ).toThrow(/plain BCH without tokens/i);
    expect(() =>
      buildCheckInTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        ownerUtxo: curCoin,
        ownerUnlocker: ownerExt.unlockP2PKH(),
        ownerChangeAddress: recipient.address,
        feeFunding: 'protected',
        locktime: m0 - 1,
      }),
    ).toThrow(/ownerChangeAddress to lock to the plan owner PKH/i);

    // Refuel plan for on-chain negative tampering tests
    await fund(verifier, gen.metadata.inboxAddress, 30_000n, 0);
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
    const bigOwnerCoin = (await ownerExt.getUtxos()).find((u) => u.satoshis >= 10_000n)!;

    // 6. On-chain negative checks for bounded owner fee enforcement
    const nextCheckInCommitment = binToHex(
      encodePlanStateCommitment({
        status: PLAN_STATUS_ACTIVE,
        round: state.round + 1,
        approvalsMask: 0,
        deadline: state.deadline,
        inactivityPeriodSeconds: state.inactivityPeriodSeconds,
        policyHashBytes: gen.policy.policyHashBytes,
      }),
    );

    // 6a. Excessive owner fee (> 10,000 sats) rejected on-chain
    const excessiveFeeTx = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.checkIn())
      .addInput(bigOwnerCoin, owner.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats - (MAX_OWNER_TX_FEE + 1n),
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: { capability: NonFungibleTokenCapability.minting, commitment: nextCheckInCommitment },
        },
      })
      .addOutput({ to: owner.address, amount: bigOwnerCoin.satoshis })
      .setLocktime(m0 - 1);
    expect((await verifier.verifyTxStrict(excessiveFeeTx.build())).ok).toBe(false);
    expect(() => excessiveFeeTx.debug()).toThrow(/excessive owner fee/i);

    // 6b. Protected fee cannot redirect change output to a non-owner address
    const redirectChangeTx = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.checkIn())
      .addInput(bigOwnerCoin, owner.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats - 4_000n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: { capability: NonFungibleTokenCapability.minting, commitment: nextCheckInCommitment },
        },
      })
      .addOutput({ to: recipient.address, amount: bigOwnerCoin.satoshis })
      .setLocktime(m0 - 1);
    expect((await verifier.verifyTxStrict(redirectChangeTx.build())).ok).toBe(false);
    expect(() => redirectChangeTx.debug()).toThrow(/change output must pay owner/i);

    // 6c. Change output cannot draw from protected balance (value > extraIn)
    const drawProtectedChangeTx = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.checkIn())
      .addInput(bigOwnerCoin, owner.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats - 5_000n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: { capability: NonFungibleTokenCapability.minting, commitment: nextCheckInCommitment },
        },
      })
      .addOutput({ to: owner.address, amount: bigOwnerCoin.satoshis + 1_000n })
      .setLocktime(m0 - 1);
    expect((await verifier.verifyTxStrict(drawProtectedChangeTx.build())).ok).toBe(false);
    expect(() => drawProtectedChangeTx.debug()).toThrow(/change cannot draw from protected balance/i);

    // 6d. send() cannot breach 1,000-sat carrier or tamper payee amount even within 10,000 fee bound
    const breachCarrierSend = new TransactionBuilder({ provider })
      .addInput(
        state.planUtxo!,
        gen.contracts.plan.unlock.send(p2pkhLockingBytecode(recipient.pkh), state.spendableBalanceSats - 100n),
      )
      .addInput(bigOwnerCoin, owner.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: 900n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: { capability: NonFungibleTokenCapability.minting, commitment: nextCheckInCommitment },
        },
      })
      .addOutput({ to: recipient.address, amount: state.spendableBalanceSats - 100n })
      .addOutput({ to: owner.address, amount: bigOwnerCoin.satoshis - 3_500n })
      .setLocktime(m0 - 1);
    expect((await verifier.verifyTxStrict(breachCarrierSend.build())).ok).toBe(false);
    expect(() => breachCarrierSend.debug()).toThrow(/plan carrier below minimum/i);

    const wrongPayeeAmtSend = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.send(p2pkhLockingBytecode(recipient.pkh), 5_000n))
      .addInput(bigOwnerCoin, owner.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats - 5_000n - 3_500n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: { capability: NonFungibleTokenCapability.minting, commitment: nextCheckInCommitment },
        },
      })
      .addOutput({ to: recipient.address, amount: 4_000n })
      .addOutput({ to: owner.address, amount: bigOwnerCoin.satoshis })
      .setLocktime(m0 - 1);
    expect((await verifier.verifyTxStrict(wrongPayeeAmtSend.build())).ok).toBe(false);
    expect(() => wrongPayeeAmtSend.debug()).toThrow(/wrong payment amount/i);

    // 6e. Stranger cannot trigger protected fee deduction
    const relayerCoin = (await relayer.signer.getUtxos())[0];
    const strangerProtectedTx = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.checkIn())
      .addInput(relayerCoin, relayer.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats - 3_600n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: { capability: NonFungibleTokenCapability.minting, commitment: nextCheckInCommitment },
        },
      })
      .addOutput({ to: relayer.address, amount: relayerCoin.satoshis })
      .setLocktime(m0 - 1);
    expect((await verifier.verifyTxStrict(strangerProtectedTx.build())).ok).toBe(false);
  }, 60_000);

  it('rejects tampered review duration and network metadata when restoring a plan', async () => {
    const { provider, verifier, owner, c0, c1, c2, heirs } = await setupReviewEnv();
    const genUtxo = await fund(verifier, owner.address, 50_000n, 0);
    const { spendMtp } = await verifier.getCurrentSpendContext();

    const gen = buildGenesisV2PlanTx({
      provider,
      genesisUtxo: genUtxo,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      policy: {
        inactivityPeriodSeconds: 600,
        reviewPeriodSeconds: 512,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      createdAtLocktime: spendMtp - 1,
      initialDepositSats: 10_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // Tamper display-only metadata fields while leaving policyBytesHex & policyHashHex intact
    const tamperedMeta = {
      ...gen.metadata,
      reviewUnits: 2363,
      effectiveReviewSeconds: 1_209_856, // claims 14 days when consensus enforces 512s
    };
    await expect(attachPusakaV2Plan(tamperedMeta, provider)).rejects.toThrow(/reviewUnits/);
    await expect(attachPusakaV2Plan({ ...gen.metadata, effectiveReviewSeconds: 1 }, provider))
      .rejects.toThrow(/effectiveReviewSeconds/);
    await expect(attachPusakaV2Plan({ ...gen.metadata, network: 'mainnet' }, provider))
      .rejects.toThrow(/network/);
    const attached = await attachPusakaV2Plan(gen.metadata, provider);
    expect(attached.metadata.effectiveReviewSeconds).toBe(512);
  });

  it('verifies worst-case 10-heir policy (317 B) across updatePolicy during REVIEW, contactApprove quorum, sponsored finalizeClaim, and self/sponsored distributeLate', async () => {
    const { provider, verifier, owner, c0, c1, c2, relayer, heirs } = await setupReviewEnv();
    const ownerExt = createStrictExternalSigner(owner, provider);
    const genUtxo = await fund(verifier, owner.address, 300_000n, 0);
    await fund(verifier, c0.address, 50_000n, 0);
    await fund(verifier, c1.address, 50_000n, 0);
    await fund(verifier, relayer.address, 100_000n, 0);

    const { spendMtp: m0 } = await verifier.getCurrentSpendContext();
    const gen = buildGenesisV2PlanTx({
      provider,
      genesisUtxo: genUtxo,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerAddress: ownerExt.address,
      ownerPkh: ownerExt.pkh,
      policy: {
        inactivityPeriodSeconds: 600,
        reviewPeriodSeconds: 512,
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      createdAtLocktime: m0 - 1,
      initialDepositSats: 120_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // Enter REVIEW via inactivity
    await verifier.advanceTimeAndMine(610, 6);
    let state = await discoverPusakaV2State(gen.handle);
    const { spendMtp: mOpen } = await verifier.getCurrentSpendContext();
    await sendStrictBuilder(
      verifier,
      buildOpenClaimByInactivityTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        locktime: mOpen - 1,
      }).builder,
    );

    // Worst-case updatePolicy during REVIEW: 317-byte newPolicyBytes (10 heirs) + atomic Anchor burn
    state = await discoverPusakaV2State(gen.handle);
    expect(state.status).toBe('REVIEW');
    const eq10 = equalShares(10);
    const policy10: PusakaV2PolicyInput = {
      inactivityPeriodSeconds: 600,
      reviewPeriodSeconds: 512,
      feeBudget: DEFAULT_FEE_BUDGET,
      contacts: [c0.pkh, c1.pkh, c2.pkh],
      heirs: eq10.shares.map((share, i) => ({ pkh: heirs[i].pkh, share })),
    };
    const { spendMtp: mUpd } = await verifier.getCurrentSpendContext();
    const ownerCoin = (await ownerExt.getUtxos()).find((u) => !u.token && u.satoshis >= 10_000n)!;
    // Also measure getVmResourceUsage on a non-external build of the exact same updatePolicy
    const upd10VmProbe = buildUpdatePolicyTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      ownerUtxo: ownerCoin,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerChangeAddress: owner.address,
      newPolicy: policy10,
      locktime: mUpd - 1,
    });
    const upd10Vm = upd10VmProbe.builder.getVmResourceUsage();
    for (const m of upd10Vm) {
      expect(m.operationCost).toBeLessThan(m.maximumOperationCost);
    }

    const upd10 = buildUpdatePolicyTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      ownerUtxo: ownerCoin,
      ownerUnlocker: ownerExt.unlockP2PKH(),
      ownerChangeAddress: ownerExt.address,
      newPolicy: policy10,
      locktime: mUpd - 1,
    });
    expect(upd10.nextPolicy.policyBytes.length).toBe(317);
    const upd10Res = await sendStrictBuilder(verifier, upd10.builder);
    assertConsensusLimits(upd10.builder, upd10Res.txHex, 'updatePolicy-during-REVIEW-10heirs', false);

    // Contact 1st & 2nd quorum with 317-byte policyBytes
    state = await discoverPusakaV2State(upd10.nextHandle);
    const ca1 = buildContactApproveTx({
      handle: upd10.nextHandle,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: 0,
      contactUtxo: (await c0.signer.getUtxos())[0],
      contactUnlocker: c0.tpl.unlockP2PKH(),
      contactChangeAddress: c0.address,
    });
    const ca1Res = await sendStrictBuilder(verifier, ca1.builder);
    assertConsensusLimits(ca1.builder, ca1Res.txHex, 'contactApprove-1st-10heirs', false);

    state = await discoverPusakaV2State(upd10.nextHandle);
    const ca2 = buildContactApproveTx({
      handle: upd10.nextHandle,
      planUtxo: state.planUtxo!,
      contactIndexOrAddress: 1,
      contactUtxo: (await c1.signer.getUtxos())[0],
      contactUnlocker: c1.tpl.unlockP2PKH(),
      contactChangeAddress: c1.address,
    });
    const ca2Res = await sendStrictBuilder(verifier, ca2.builder);
    assertConsensusLimits(ca2.builder, ca2Res.txHex, 'contactApprove-2nd-10heirs', false);

    // Sponsored finalizeClaim with 10 heirs
    await verifier.advanceTimeAndMine(512, 6);
    state = await discoverPusakaV2State(upd10.nextHandle);
    const finSponsored = buildFinalizeClaimTx({
      handle: upd10.nextHandle,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      sponsorUtxo: (await relayer.signer.getUtxos())[0],
      sponsorUnlocker: relayer.tpl.unlockP2PKH(),
      sponsorChangeAddress: relayer.address,
    });
    const finSponsoredRes = await sendStrictBuilder(verifier, finSponsored.builder);
    assertConsensusLimits(finSponsored.builder, finSponsoredRes.txHex, 'finalizeClaim-sponsored-10heirs');

    // Post-payout late receipt -> self-funded distributeLate with 10 heirs
    await fund(verifier, upd10.nextMetadata.inboxAddress, 30_000n, 0);
    state = await discoverPusakaV2State(upd10.nextHandle);
    await sendStrictBuilder(
      verifier,
      buildSweepInboxTx({
        handle: upd10.nextHandle,
        planUtxo: state.planUtxo!,
        inboxUtxos: state.inboxUtxos,
        mode: 'self',
      }).builder,
    );
    state = await discoverPusakaV2State(upd10.nextHandle);
    const distSelf10 = buildDistributeLateTx({
      handle: upd10.nextHandle,
      planUtxo: state.planUtxo!,
    });
    const distSelf10Res = await sendStrictBuilder(verifier, distSelf10.builder);
    assertConsensusLimits(distSelf10.builder, distSelf10Res.txHex, 'distributeLate-self-10heirs');

    // Second late receipt -> sponsored distributeLate with 10 heirs
    await fund(verifier, upd10.nextMetadata.inboxAddress, 20_000n, 0);
    state = await discoverPusakaV2State(upd10.nextHandle);
    await sendStrictBuilder(
      verifier,
      buildSweepInboxTx({
        handle: upd10.nextHandle,
        planUtxo: state.planUtxo!,
        inboxUtxos: state.inboxUtxos,
        mode: 'self',
      }).builder,
    );
    state = await discoverPusakaV2State(upd10.nextHandle);
    const distSponsored10 = buildDistributeLateTx({
      handle: upd10.nextHandle,
      planUtxo: state.planUtxo!,
      sponsorUtxo: (await relayer.signer.getUtxos()).find((u) => !u.token && u.satoshis >= 10_000n)!,
      sponsorUnlocker: relayer.tpl.unlockP2PKH(),
      sponsorChangeAddress: relayer.address,
    });
    const distSponsored10Res = await sendStrictBuilder(verifier, distSponsored10.builder);
    assertConsensusLimits(
      distSponsored10.builder,
      distSponsored10Res.txHex,
      'distributeLate-sponsored-10heirs',
      false,
    );
  }, 180_000);

  it('verifies Anchor-deposit mismatch rejection, contactIndex mismatch rejection, and multi-UTXO small inbox batch sweeps', async () => {
    const { provider, verifier, owner, c0, c1, c2, relayer, heirs } = await setupReviewEnv();
    const genUtxo = await fund(verifier, owner.address, 100_000n, 0);
    await fund(verifier, c0.address, 50_000n, 0);
    await fund(verifier, c1.address, 50_000n, 0);
    await fund(verifier, relayer.address, 50_000n, 0);

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
        contacts: [c0.pkh, c1.pkh, c2.pkh],
        heirs: [{ pkh: heirs[0].pkh, share: 1 }],
      },
      createdAtLocktime: m0 - 1,
      initialDepositSats: 20_000n,
    });
    await sendStrictBuilder(verifier, gen.builder);

    // 1. Contact c0 cannot claim contactIndex=1
    let state = await discoverPusakaV2State(gen.handle);
    const c0Coin = (await c0.signer.getUtxos())[0];
    const wrongIdxTx = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.contactApprove(1n, gen.policy.policyBytes))
      .addInput(c0Coin, c0.tpl.unlockP2PKH())
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
                round: 0,
                approvalsMask: 2,
                deadline: state.deadline,
                inactivityPeriodSeconds: state.inactivityPeriodSeconds,
                policyHashBytes: gen.policy.policyHashBytes,
              }),
            ),
          },
        },
      })
      .addOutput({ to: c0.address, amount: c0Coin.satoshis - 4_000n })
      .build();
    expect((await verifier.verifyTxStrict(wrongIdxTx)).ok).toBe(false);

    // 2. Small 800-sat inbox deposits cannot self-sweep individually, but succeed via batch self-sweep (10 x 800 = 8,000 sats)
    const smallCoins: Utxo[] = [];
    for (let i = 0; i < 10; i++) {
      smallCoins.push(await fund(verifier, gen.metadata.inboxAddress, 800n, i));
    }
    state = await discoverPusakaV2State(gen.handle);
    expect(() =>
      buildSweepInboxTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        inboxUtxos: [smallCoins[0]],
        mode: 'self',
      }),
    ).toThrow(/insufficient to cover self-sweep fee/i);

    const batchSelfSweep = buildSweepInboxTx({
      handle: gen.handle,
      planUtxo: state.planUtxo!,
      inboxUtxos: smallCoins,
      mode: 'self',
    });
    const batchRes = await sendStrictBuilder(verifier, batchSelfSweep.builder);
    assertConsensusLimits(batchSelfSweep.builder, batchRes.txHex, 'inbox-batch-self-sweep-10', false);

    // 3. Enter REVIEW and verify Anchor.cancel() cannot pair with Plan.deposit()
    state = await discoverPusakaV2State(gen.handle);
    await sendStrictBuilder(
      verifier,
      buildContactApproveTx({
        handle: gen.handle,
        planUtxo: state.planUtxo!,
        contactIndexOrAddress: 0,
        contactUtxo: (await c0.signer.getUtxos())[0],
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
        contactUtxo: (await c1.signer.getUtxos())[0],
        contactUnlocker: c1.tpl.unlockP2PKH(),
        contactChangeAddress: c1.address,
      }).builder,
    );
    state = await discoverPusakaV2State(gen.handle);

    const ownerCoin = (await owner.signer.getUtxos()).find((u) => !u.token && u.satoshis >= 6_000n)!;
    const depositAnchorTx = new TransactionBuilder({ provider, allowImplicitNftBurn: true })
      .addInput(state.planUtxo!, gen.contracts.plan.unlock.deposit())
      .addInput(state.anchorUtxo!, gen.contracts.anchor.unlock.cancel())
      .addInput(ownerCoin, owner.tpl.unlockP2PKH())
      .addOutput({
        to: gen.contracts.planAddress,
        amount: state.planBalanceSats + 1_000n,
        token: {
          category: gen.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: state.planUtxo!.token!.nft!.commitment,
          },
        },
      })
      .addOutput({ to: owner.address, amount: ownerCoin.satoshis - 4_000n });
    expect((await verifier.verifyTxStrict(depositAnchorTx.build())).ok).toBe(false);
    expect(() => depositAnchorTx.debug()).toThrow(/deposit inputs must be plain BCH/i);
  }, 180_000);
});
