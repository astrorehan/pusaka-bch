import { describe, expect, it } from 'vitest';
import {
  SignatureTemplate,
  TransactionBuilder,
  randomUtxo,
  type Utxo,
} from '@solidcash/solidcash';
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock';
import {
  binToHex,
  encodeCashAddress,
  generatePrivateKey,
  hash160,
  NonFungibleTokenCapability,
  secp256k1,
} from '@bitauth/libauth';
import {
  BIP68_DISABLE_FLAG,
  BIP68_TIME_FLAG,
  buildCancelClaimTx,
  buildDepositTx,
  buildFinalizeClaimTx,
  buildGenesisPlanTx,
  buildOpenClaimTx,
  buildOwnerWithdrawTx,
  decodePlanStateCommitment,
  discoverClaimReviewState,
  encodePlanStateCommitment,
  encodeReviewDurationToBip68Sequence,
  encodeRoundCommitment,
  ensureGenesisUtxo,
  instantiateClaimReviewContracts,
  MAX_REVIEW_SECONDS,
  PLAN_STATUS_ACTIVE,
  PLAN_STATUS_REVIEW,
} from '../../scripts/v2/claim-review.js';
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
}

function makeActor(seedByte: number): TestActor {
  // Deterministic non-secret test keys (never used on mainnet)
  const priv = new Uint8Array(32).fill(seedByte);
  priv[31] = (seedByte + 1) & 0xff || 1;
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
  };
}

async function setupChain() {
  const provider = new MockNetworkProvider();
  const verifier = new StrictBip68ChainVerifier(provider);
  await verifier.init();
  const owner = makeActor(0x11);
  const heir = makeActor(0x22);
  const stranger = makeActor(0x33);
  const relayer = makeActor(0x44);
  return { provider, verifier, owner, heir, stranger, relayer };
}

async function fundConfirmed(
  verifier: StrictBip68ChainVerifier,
  address: string,
  satoshis: bigint,
  vout = 0,
): Promise<Utxo> {
  const tip = await verifier.provider.getBlockHeight();
  const utxo = await verifier.provider.addUtxo(
    address,
    randomUtxo({ satoshis, vout }),
  );
  await verifier.recordOutpoint(utxo.txid, utxo.vout, Math.max(1, tip - 5));
  return utxo;
}

describe('Pusaka v2 Stage 2 — ClaimReviewProof & ClaimReviewAnchor', () => {
  it('encodes review duration into time-based BIP68 sequence rounding upward in 512s units', () => {
    expect(encodeReviewDurationToBip68Sequence(1)).toEqual({
      sequence: BIP68_TIME_FLAG | 1, // 0x00400001
      units: 1,
      effectiveSeconds: 512,
      requestedSeconds: 1,
    });
    expect(encodeReviewDurationToBip68Sequence(512)).toEqual({
      sequence: BIP68_TIME_FLAG | 1,
      units: 1,
      effectiveSeconds: 512,
      requestedSeconds: 512,
    });
    expect(encodeReviewDurationToBip68Sequence(513)).toEqual({
      sequence: BIP68_TIME_FLAG | 2,
      units: 2,
      effectiveSeconds: 1024,
      requestedSeconds: 513,
    });
    expect(encodeReviewDurationToBip68Sequence(600)).toEqual({
      sequence: BIP68_TIME_FLAG | 2,
      units: 2,
      effectiveSeconds: 1024,
      requestedSeconds: 600,
    });
    // 72h production policy -> ceil(259200 / 512) = 507 units = 259,584s
    expect(encodeReviewDurationToBip68Sequence(72 * 3600)).toEqual({
      sequence: BIP68_TIME_FLAG | 507,
      units: 507,
      effectiveSeconds: 259_584,
      requestedSeconds: 259_200,
    });

    expect(() => encodeReviewDurationToBip68Sequence(0)).toThrow();
    expect(() => encodeReviewDurationToBip68Sequence(-10)).toThrow();
    expect(() => encodeReviewDurationToBip68Sequence(MAX_REVIEW_SECONDS + 1)).toThrow();
  });

  it('completes full lifecycle: genesis -> openClaim -> deposit during REVIEW -> full MTP delay -> finalizeClaim', async () => {
    const { provider, verifier, owner, heir, stranger, relayer } = await setupChain();
    const seq = encodeReviewDurationToBip68Sequence(600); // 2 units = 1024s effective

    const ownerGenesisCoin = await fundConfirmed(verifier, owner.address, 100_000n, 0);
    const sponsorCoin = await fundConfirmed(verifier, stranger.address, 20_000n, 0);
    const depositCoin = await fundConfirmed(verifier, stranger.address, 30_000n, 0);
    const relayerCoin = await fundConfirmed(verifier, relayer.address, 15_000n, 0);

    // 1. Genesis
    const genesis = buildGenesisPlanTx({
      provider,
      genesisUtxo: ownerGenesisCoin,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
      initialDepositSats: 50_000n,
    });
    const genesisRes = await verifier.sendBuilderStrict(genesis.builder);
    expect(genesisRes.sizeBytes).toBeGreaterThan(100);

    let state = await discoverClaimReviewState(genesis.contracts);
    expect(state.status).toBe(PLAN_STATUS_ACTIVE);
    expect(state.round).toBe(0);
    expect(state.planBalanceSats).toBe(50_000n);
    expect(state.anchorUtxo).toBeUndefined();

    // 2. Open Claim (sponsored by stranger / contact trigger)
    const { builder: openBuilder, nextRound } = buildOpenClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      sponsorUtxo: sponsorCoin,
      sponsorUnlocker: stranger.tpl.unlockP2PKH(),
      sponsorChangeAddress: stranger.address,
    });
    expect(nextRound).toBe(1);

    // Check WizardConnect transaction serialization compatibility on openClaim
    const wcOpen = openBuilder.generateWcTransactionObject({
      broadcast: false,
      userPrompt: 'Open Pusaka claim review',
    });
    expect(wcOpen.transaction).toBeDefined();
    expect(wcOpen.sourceOutputs.length).toBe(2);

    const openRes = await verifier.sendBuilderStrict(openBuilder);
    state = await discoverClaimReviewState(genesis.contracts);
    expect(state.status).toBe(PLAN_STATUS_REVIEW);
    expect(state.round).toBe(1);
    expect(state.pendingAnchorRound).toBe(1);
    expect(state.planBalanceSats).toBe(50_000n);
    expect(state.anchorSats).toBe(1000n);
    const originalAnchorOutpoint = `${state.anchorUtxo!.txid}:${state.anchorUtxo!.vout}`;

    // 3. Deposit during REVIEW must succeed without touching or resetting Anchor UTXO
    await verifier.advanceTimeAndMine(400, 1); // advance block time partway; MTP still anchored
    const depositBuilder = buildDepositTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      fundingUtxo: depositCoin,
      fundingUnlocker: stranger.tpl.unlockP2PKH(),
      depositSats: 25_000n,
      changeAddress: stranger.address,
    });
    const depositRes = await verifier.sendBuilderStrict(depositBuilder);
    expect(depositRes.txid).toBeDefined();

    state = await discoverClaimReviewState(genesis.contracts);
    expect(state.status).toBe(PLAN_STATUS_REVIEW);
    expect(state.round).toBe(1);
    expect(state.planBalanceSats).toBe(75_000n);
    expect(`${state.anchorUtxo!.txid}:${state.anchorUtxo!.vout}`).toBe(originalAnchorOutpoint);

    // 4. Advance chain MTP past full 1024s effective delay
    await verifier.advanceTimeAndMine(1024, 6);

    // 5. Finalize claim by unrelated relayer paying fees -> heir gets full 75,000 + 1,000 anchor
    const finalizeBuilder = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
      submitterUtxo: relayerCoin,
      submitterUnlocker: relayer.tpl.unlockP2PKH(),
      submitterChangeAddress: relayer.address,
    });
    const finalizeRes = await verifier.sendBuilderStrict(finalizeBuilder);
    expect(finalizeRes.sizeBytes).toBeLessThan(1500);

    const heirUtxos = await provider.getUtxos(heir.address);
    expect(heirUtxos.reduce((s, u) => s + u.satoshis, 0n)).toBe(76_000n);

    const finalState = await discoverClaimReviewState(genesis.contracts);
    expect(finalState.status).toBe('EXITED_OR_UNINITIALIZED');
    expect(finalState.anchorUtxo).toBeUndefined();
  });

  it('proves raw MockNetworkProvider fails open on time-based CSV while StrictBip68ChainVerifier rejects early finality', async () => {
    const { provider, verifier, owner, heir, stranger } = await setupChain();
    const seq = encodeReviewDurationToBip68Sequence(600); // 1024s

    const ownerGenesisCoin = await fundConfirmed(verifier, owner.address, 100_000n, 0);
    const sponsorCoin = await fundConfirmed(verifier, stranger.address, 20_000n, 0);

    const genesis = buildGenesisPlanTx({
      provider,
      genesisUtxo: ownerGenesisCoin,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
      initialDepositSats: 50_000n,
    });
    await verifier.sendBuilderStrict(genesis.builder);

    let state = await discoverClaimReviewState(genesis.contracts);
    const { builder: openBuilder } = buildOpenClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      sponsorUtxo: sponsorCoin,
      sponsorUnlocker: stranger.tpl.unlockP2PKH(),
      sponsorChangeAddress: stranger.address,
    });
    await verifier.sendBuilderStrict(openBuilder);
    state = await discoverClaimReviewState(genesis.contracts);

    // Build immediate finalize tx at elapsed MTP = 0s
    const earlyFinalizeHex = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
    }).build();

    // Strict verifier MUST reject with non-BIP68-final (0s < 1024s)
    const strictRes = await verifier.verifyTxStrict(earlyFinalizeHex);
    expect(strictRes.ok).toBe(false);
    expect(strictRes.stage).toBe('bip68-sequence');
    expect(strictRes.error).toContain('non-BIP68-final');
    expect(strictRes.inputAges?.[1].elapsedMtpSeconds).toBe(0);

    // Demonstrate the underlying MockNetworkProvider bug directly:
    // @mem-cash/core omits `medianTimePast` in `utxoToSourceOutput()`, so raw provider accepts!
    await expect(provider.sendRawTransaction(earlyFinalizeHex)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects backdated openClaim locktime, unconfirmed anchor, insufficient MTP shift, and elapsed = delay - 1s', async () => {
    const { provider, verifier, owner, heir, stranger } = await setupChain();
    const seq = encodeReviewDurationToBip68Sequence(600); // 1024s

    const ownerGenesisCoin = await fundConfirmed(verifier, owner.address, 100_000n, 0);
    const sponsorCoin = await fundConfirmed(verifier, stranger.address, 20_000n, 0);

    const genesis = buildGenesisPlanTx({
      provider,
      genesisUtxo: ownerGenesisCoin,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
      initialDepositSats: 50_000n,
    });
    await verifier.sendBuilderStrict(genesis.builder);
    let state = await discoverClaimReviewState(genesis.contracts);

    // Hostile claimant sets openClaim tx.locktime to year 1985 (500_000_001)!
    const { builder: backdatedOpen } = buildOpenClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      sponsorUtxo: sponsorCoin,
      sponsorUnlocker: stranger.tpl.unlockP2PKH(),
      sponsorChangeAddress: stranger.address,
      locktime: 500_000_001,
    });
    const openRes = await verifier.sendBuilderStrict(backdatedOpen);
    state = await discoverClaimReviewState(genesis.contracts);

    const finalizeHex = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
    }).build();

    // Unconfirmed mempool anchor (height = 0) fails BIP68
    const unconfirmedCheck = await verifier.verifyTxStrict(finalizeHex, {
      outpointOverrides: new Map([
        [`${state.anchorUtxo!.txid}:${state.anchorUtxo!.vout}`, { height: 0, prevMtp: openRes.prevMtpForOutputs }],
      ]),
    });
    expect(unconfirmedCheck.ok).toBe(false);
    expect(unconfirmedCheck.stage).toBe('bip68-sequence');

    // Immediately after openClaim confirmation (despite 1985 locktime!), still fails
    const immediateCheck = await verifier.verifyTxStrict(finalizeHex);
    expect(immediateCheck.ok).toBe(false);
    expect(immediateCheck.stage).toBe('bip68-sequence');

    // Advance time by 1023 seconds (1s short of 1024s) and shift MTP with 6 blocks -> MUST reject
    await verifier.advanceTimeAndMine(1023, 6);
    const shortByOneSecond = await verifier.verifyTxStrict(finalizeHex);
    expect(shortByOneSecond.ok).toBe(false);
    expect(shortByOneSecond.stage).toBe('bip68-sequence');
    expect(shortByOneSecond.inputAges?.[1].elapsedMtpSeconds).toBe(1023);

    // Advance +100s more, but mine only 5 blocks (11-block median stays at T0 + 1023!) -> MUST reject
    await verifier.advanceTimeAndMine(100, 5);
    const medianNotShiftedYet = await verifier.verifyTxStrict(finalizeHex);
    expect(medianNotShiftedYet.ok).toBe(false);
    expect(medianNotShiftedYet.stage).toBe('bip68-sequence');

    // Mine 1 more block at T0 + 1123 -> 6 blocks >= T0 + 1123 -> median shifts -> SUCCEEDS
    await verifier.advanceTimeAndMine(0, 1);
    const finalRes = await verifier.sendTxStrict(finalizeHex);
    expect(finalRes.txid).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects non-version-2 tx, disabled/height-mode/too-short sequence, and open+finalize in same tx', async () => {
    const { provider, verifier, owner, heir, stranger } = await setupChain();
    const seq = encodeReviewDurationToBip68Sequence(600); // 0x00400002

    const ownerGenesisCoin = await fundConfirmed(verifier, owner.address, 100_000n, 0);
    const sponsorCoin = await fundConfirmed(verifier, stranger.address, 20_000n, 0);

    const genesis = buildGenesisPlanTx({
      provider,
      genesisUtxo: ownerGenesisCoin,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
      initialDepositSats: 50_000n,
    });
    await verifier.sendBuilderStrict(genesis.builder);
    let state = await discoverClaimReviewState(genesis.contracts);

    // Adversarial: attempt openClaim + anchor co-spend in same transaction
    const sameTxAttempt = new TransactionBuilder({ provider })
      .addInput(state.planUtxo!, genesis.contracts.proof.unlock.openClaim())
      .addInput(sponsorCoin, stranger.tpl.unlockP2PKH())
      .addOutput({
        to: genesis.contracts.proof.tokenAddress,
        amount: 50_000n,
        token: {
          category: genesis.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(encodePlanStateCommitment(PLAN_STATUS_REVIEW, 1)),
          },
        },
      })
      .addOutput({
        to: heir.address,
        amount: 10_000n,
      });
    await expect(verifier.sendBuilderStrict(sameTxAttempt)).rejects.toThrow();

    // Legitimate openClaim and full delay
    const { builder: openBuilder } = buildOpenClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      sponsorUtxo: sponsorCoin,
      sponsorUnlocker: stranger.tpl.unlockP2PKH(),
      sponsorChangeAddress: stranger.address,
    });
    await verifier.sendBuilderStrict(openBuilder);
    await verifier.advanceTimeAndMine(1024, 6);
    state = await discoverClaimReviewState(genesis.contracts);

    // 1. Mutated tx.version = 1 (non-version-2)
    const validHex = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
    }).build();
    const version1Hex = buildMutatedTxHex(validHex, (tx) => ({ ...tx, version: 1 }));
    const v1Res = await verifier.verifyTxStrict(version1Hex);
    expect(v1Res.ok).toBe(false);
    expect(v1Res.stage).toBe('vm');

    // 2. Disabled sequence flag (bit 31 set: 0x80400002)
    const disabledHex = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
      anchorSequenceOverride: (BIP68_DISABLE_FLAG | seq.sequence) >>> 0,
    }).build();
    const disabledRes = await verifier.verifyTxStrict(disabledHex);
    expect(disabledRes.ok).toBe(false);
    expect(disabledRes.stage).toBe('vm');

    // 3. Wrong sequence type: height-based (bit 22 clear, even with huge block count 0x0000ffff)
    const heightSeqHex = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
      anchorSequenceOverride: 0x0000ffff,
    }).build();
    const heightRes = await verifier.verifyTxStrict(heightSeqHex);
    expect(heightRes.ok).toBe(false);
    expect(heightRes.stage).toBe('vm');

    // 4. Too-short time-based sequence (1 unit = 512s < required 2 units = 1024s)
    const shortSeqHex = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
      anchorSequenceOverride: BIP68_TIME_FLAG | 1,
    }).build();
    const shortRes = await verifier.verifyTxStrict(shortSeqHex);
    expect(shortRes.ok).toBe(false);
    expect(shortRes.stage).toBe('vm');
  });

  it('rejects substituted, plain-BCH, wrong-plan, wrong-round anchors, repeated openClaim, and hijacked payout', async () => {
    const { provider, verifier, owner, heir, stranger } = await setupChain();
    const seq = encodeReviewDurationToBip68Sequence(512); // 1 unit = 512s

    // Plan A
    const genesisCoinA = await fundConfirmed(verifier, owner.address, 100_000n, 0);
    const sponsorA = await fundConfirmed(verifier, stranger.address, 20_000n, 0);
    const genesisA = buildGenesisPlanTx({
      provider,
      genesisUtxo: genesisCoinA,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
      initialDepositSats: 50_000n,
    });
    await verifier.sendBuilderStrict(genesisA.builder);

    // Plan B (separate planCategory!)
    const genesisCoinB = await fundConfirmed(verifier, owner.address, 100_000n, 0);
    const sponsorB = await fundConfirmed(verifier, stranger.address, 20_000n, 0);
    const genesisB = buildGenesisPlanTx({
      provider,
      genesisUtxo: genesisCoinB,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
      initialDepositSats: 50_000n,
    });
    await verifier.sendBuilderStrict(genesisB.builder);

    // Open both Plan A and Plan B
    let stateA = await discoverClaimReviewState(genesisA.contracts);
    await verifier.sendBuilderStrict(
      buildOpenClaimTx({
        contracts: genesisA.contracts,
        planUtxo: stateA.planUtxo!,
        sponsorUtxo: sponsorA,
        sponsorUnlocker: stranger.tpl.unlockP2PKH(),
        sponsorChangeAddress: stranger.address,
      }).builder,
    );
    let stateB = await discoverClaimReviewState(genesisB.contracts);
    await verifier.sendBuilderStrict(
      buildOpenClaimTx({
        contracts: genesisB.contracts,
        planUtxo: stateB.planUtxo!,
        sponsorUtxo: sponsorB,
        sponsorUnlocker: stranger.tpl.unlockP2PKH(),
        sponsorChangeAddress: stranger.address,
      }).builder,
    );

    stateA = await discoverClaimReviewState(genesisA.contracts);
    stateB = await discoverClaimReviewState(genesisB.contracts);

    // Repeated openClaim while already in REVIEW must fail
    const extraSponsor = await fundConfirmed(verifier, stranger.address, 20_000n, 0);
    const repeatOpenAttempt = new TransactionBuilder({ provider })
      .addInput(stateA.planUtxo!, genesisA.contracts.proof.unlock.openClaim())
      .addInput(extraSponsor, stranger.tpl.unlockP2PKH())
      .addOutput({
        to: genesisA.contracts.proof.tokenAddress,
        amount: 50_000n,
        token: {
          category: genesisA.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(encodePlanStateCommitment(PLAN_STATUS_REVIEW, 2)),
          },
        },
      })
      .addOutput({
        to: genesisA.contracts.anchor.tokenAddress,
        amount: 1000n,
        token: {
          category: genesisA.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.none,
            commitment: binToHex(encodeRoundCommitment(2)),
          },
        },
      });
    await expect(verifier.sendBuilderStrict(repeatOpenAttempt)).rejects.toThrow();

    // Advance full delay
    await verifier.advanceTimeAndMine(512, 6);

    // 1. Plain BCH sent to Plan A's anchor address cannot substitute for real Anchor NFT
    const fakePlainAnchor = await fundConfirmed(verifier, genesisA.contracts.anchor.address, 2000n, 0);
    const plainAnchorTx = buildFinalizeClaimTx({
      contracts: genesisA.contracts,
      planUtxo: stateA.planUtxo!,
      anchorUtxo: fakePlainAnchor,
      heirAddress: heir.address,
    }).build();
    expect((await verifier.verifyTxStrict(plainAnchorTx)).ok).toBe(false);

    // 2. Plan B's legitimate Anchor cannot finalize Plan A
    const crossPlanTx = new TransactionBuilder({ provider, allowImplicitNftBurn: true })
      .addInput(stateA.planUtxo!, genesisA.contracts.proof.unlock.finalizeClaim())
      .addInput(stateB.anchorUtxo!, genesisB.contracts.anchor.unlock.finalize(), {
        sequence: seq.sequence,
      })
      .addOutput({ to: heir.address, amount: 50_000n })
      .build();
    expect((await verifier.verifyTxStrict(crossPlanTx)).ok).toBe(false);

    // 3. Hijack payout to stranger instead of heirPkh
    const hijackPayoutTx = buildFinalizeClaimTx({
      contracts: genesisA.contracts,
      planUtxo: stateA.planUtxo!,
      anchorUtxo: stateA.anchorUtxo!,
      heirAddress: stranger.address,
    }).build();
    expect((await verifier.verifyTxStrict(hijackPayoutTx)).ok).toBe(false);

    // 4. Adversarial deposit trying to revert status to ACTIVE must fail
    const badDepositTx = new TransactionBuilder({ provider })
      .addInput(stateA.planUtxo!, genesisA.contracts.proof.unlock.deposit())
      .addInput(extraSponsor, stranger.tpl.unlockP2PKH())
      .addOutput({
        to: genesisA.contracts.proof.tokenAddress,
        amount: 60_000n,
        token: {
          category: genesisA.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: binToHex(encodePlanStateCommitment(PLAN_STATUS_ACTIVE, 1)),
          },
        },
      })
      .build();
    expect((await verifier.verifyTxStrict(badDepositTx)).ok).toBe(false);
  });

  it('enforces owner cancelClaim (rejects stranger, stops old finalize after delay, restarts fresh round 2 delay, allows ownerWithdraw)', async () => {
    const { provider, verifier, owner, heir, stranger } = await setupChain();
    const seq = encodeReviewDurationToBip68Sequence(600); // 1024s

    const ownerGenesisCoin = await fundConfirmed(verifier, owner.address, 100_000n, 0);
    const ownerCancelCoin = await fundConfirmed(verifier, owner.address, 20_000n, 0);
    const ownerWithdrawCoin = await fundConfirmed(verifier, owner.address, 20_000n, 0);
    const sponsor1 = await fundConfirmed(verifier, stranger.address, 20_000n, 0);
    const sponsor2 = await fundConfirmed(verifier, stranger.address, 20_000n, 0);

    const genesis = buildGenesisPlanTx({
      provider,
      genesisUtxo: ownerGenesisCoin,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
      initialDepositSats: 50_000n,
    });
    await verifier.sendBuilderStrict(genesis.builder);

    // Round 1 openClaim
    let state = await discoverClaimReviewState(genesis.contracts);
    await verifier.sendBuilderStrict(
      buildOpenClaimTx({
        contracts: genesis.contracts,
        planUtxo: state.planUtxo!,
        sponsorUtxo: sponsor1,
        sponsorUnlocker: stranger.tpl.unlockP2PKH(),
        sponsorChangeAddress: stranger.address,
      }).builder,
    );
    state = await discoverClaimReviewState(genesis.contracts);
    expect(state.status).toBe(PLAN_STATUS_REVIEW);
    expect(state.round).toBe(1);

    // Pre-build Round 1 finalize tx while anchor 1 is unspent
    const staleRound1FinalizeHex = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
    }).build();

    // Stranger cannot cancel claim
    const strangerCancelHex = buildCancelClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      ownerUtxo: sponsor2,
      ownerUnlocker: stranger.tpl.unlockP2PKH(),
      ownerChangeAddress: stranger.address,
    }).build();
    expect((await verifier.verifyTxStrict(strangerCancelHex)).ok).toBe(false);

    // Owner cannot call ownerWithdraw while REVIEW is pending
    const withdrawWhileReviewHex = buildOwnerWithdrawTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      ownerUtxo: ownerCancelCoin,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
    }).build();
    expect((await verifier.verifyTxStrict(withdrawWhileReviewHex)).ok).toBe(false);

    // Owner immediately cancels at 0s elapsed -> burns Round 1 anchor, returns Plan to ACTIVE (round 1)
    await verifier.sendBuilderStrict(
      buildCancelClaimTx({
        contracts: genesis.contracts,
        planUtxo: state.planUtxo!,
        anchorUtxo: state.anchorUtxo!,
        ownerUtxo: ownerCancelCoin,
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerChangeAddress: owner.address,
      }),
    );
    state = await discoverClaimReviewState(genesis.contracts);
    expect(state.status).toBe(PLAN_STATUS_ACTIVE);
    expect(state.round).toBe(1);
    expect(state.anchorUtxo).toBeUndefined();

    // Advance past full delay and attempt stale Round 1 finalize -> MUST fail
    await verifier.advanceTimeAndMine(1500, 6);
    const staleAttempt = await verifier.verifyTxStrict(staleRound1FinalizeHex);
    expect(staleAttempt.ok).toBe(false);

    // Round 2 openClaim creates fresh Round 2 anchor whose clock starts at 0 again
    await verifier.sendBuilderStrict(
      buildOpenClaimTx({
        contracts: genesis.contracts,
        planUtxo: state.planUtxo!,
        sponsorUtxo: sponsor2,
        sponsorUnlocker: stranger.tpl.unlockP2PKH(),
        sponsorChangeAddress: stranger.address,
      }).builder,
    );
    state = await discoverClaimReviewState(genesis.contracts);
    expect(state.status).toBe(PLAN_STATUS_REVIEW);
    expect(state.round).toBe(2);
    expect(state.pendingAnchorRound).toBe(2);

    // Round 2 finalize MUST fail immediately (previous elapsed time does not carry over!)
    const round2EarlyHex = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
    }).build();
    const round2EarlyCheck = await verifier.verifyTxStrict(round2EarlyHex);
    expect(round2EarlyCheck.ok).toBe(false);
    expect(round2EarlyCheck.stage).toBe('bip68-sequence');

    // Owner cancels Round 2 and withdraws full plan balance
    const ownerCancelCoin2 = await fundConfirmed(verifier, owner.address, 20_000n, 0);
    await verifier.sendBuilderStrict(
      buildCancelClaimTx({
        contracts: genesis.contracts,
        planUtxo: state.planUtxo!,
        anchorUtxo: state.anchorUtxo!,
        ownerUtxo: ownerCancelCoin2,
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerChangeAddress: owner.address,
      }),
    );
    state = await discoverClaimReviewState(genesis.contracts);
    expect(state.status).toBe(PLAN_STATUS_ACTIVE);
    expect(state.round).toBe(2);

    const withdrawRes = await verifier.sendBuilderStrict(
      buildOwnerWithdrawTx({
        contracts: genesis.contracts,
        planUtxo: state.planUtxo!,
        ownerUtxo: ownerWithdrawCoin,
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerAddress: owner.address,
      }),
    );
    expect(withdrawRes.txid).toMatch(/^[0-9a-f]{64}$/);
    const exited = await discoverClaimReviewState(genesis.contracts);
    expect(exited.status).toBe('EXITED_OR_UNINITIALIZED');
  });

  it('supports ensureGenesisUtxo pre-split when owner initially holds only vout > 0 UTXOs', async () => {
    const { provider, verifier, owner, heir } = await setupChain();
    const seq = encodeReviewDurationToBip68Sequence(512);

    const nonZeroVoutCoin = await fundConfirmed(verifier, owner.address, 80_000n, 3);
    expect(nonZeroVoutCoin.vout).toBe(3);

    const { genesisUtxo, preTxid } = await ensureGenesisUtxo({
      provider,
      ownerAddress: owner.address,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      minimumSats: 60_000n,
    });
    expect(preTxid).toBeDefined();
    expect(genesisUtxo.vout).toBe(0);
    await verifier.recordOutpoint(genesisUtxo.txid, genesisUtxo.vout);

    const genesis = buildGenesisPlanTx({
      provider,
      genesisUtxo,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
      initialDepositSats: 50_000n,
    });
    await verifier.sendBuilderStrict(genesis.builder);
    const state = await discoverClaimReviewState(genesis.contracts);
    expect(state.status).toBe(PLAN_STATUS_ACTIVE);
    expect(decodePlanStateCommitment(state.planUtxo!.token!.nft!.commitment).round).toBe(0);
  });

  it('supports self-funded openClaim + finalizeClaim while rejecting excessive fee deductions', async () => {
    const { provider, verifier, owner, heir } = await setupChain();
    const seq = encodeReviewDurationToBip68Sequence(512);
    const ownerGenesisCoin = await fundConfirmed(verifier, owner.address, 100_000n, 0);

    const genesis = buildGenesisPlanTx({
      provider,
      genesisUtxo: ownerGenesisCoin,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
      initialDepositSats: 50_000n,
    });
    await verifier.sendBuilderStrict(genesis.builder);
    let state = await discoverClaimReviewState(genesis.contracts);

    // Adversarial: self-funded openClaim deducting 1 sat more than minAnchorSats + feeBudget
    const overFeeOpen = buildOpenClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      fee: genesis.contracts.feeBudget + 1n,
    }).builder.build();
    expect((await verifier.verifyTxStrict(overFeeOpen)).ok).toBe(false);

    // Valid self-funded openClaim (no sponsor input)
    await verifier.sendBuilderStrict(
      buildOpenClaimTx({
        contracts: genesis.contracts,
        planUtxo: state.planUtxo!,
      }).builder,
    );
    state = await discoverClaimReviewState(genesis.contracts);
    expect(state.status).toBe(PLAN_STATUS_REVIEW);
    expect(state.planBalanceSats).toBe(50_000n - 1000n - 1500n); // 47,500 sats

    await verifier.advanceTimeAndMine(512, 6);

    // Adversarial: self-funded finalizeClaim deducting 1 sat more than feeBudget
    const overFeeFinalize = buildFinalizeClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: state.anchorUtxo!,
      heirAddress: heir.address,
      fee: genesis.contracts.feeBudget + 1n,
    }).build();
    expect((await verifier.verifyTxStrict(overFeeFinalize)).ok).toBe(false);

    // Valid self-funded finalizeClaim (no relayer input)
    await verifier.sendBuilderStrict(
      buildFinalizeClaimTx({
        contracts: genesis.contracts,
        planUtxo: state.planUtxo!,
        anchorUtxo: state.anchorUtxo!,
        heirAddress: heir.address,
      }),
    );
    const heirUtxos = await provider.getUtxos(heir.address);
    expect(heirUtxos.reduce((s, u) => s + u.satoshis, 0n)).toBe(47_500n + 1000n - 1600n);
  });

  it('rejects a caller taking part of the review fee reserve as a self-funded change output', async () => {
    const { provider, verifier, owner, heir, stranger } = await setupChain();
    const coin = await fundConfirmed(verifier, owner.address, 100_000n);
    const genesis = buildGenesisPlanTx({
      provider,
      genesisUtxo: coin,
      ownerUnlocker: owner.tpl.unlockP2PKH(),
      ownerAddress: owner.address,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: encodeReviewDurationToBip68Sequence(512).sequence,
      initialDepositSats: 50_000n,
      feeBudget: 5_000n,
    });
    await verifier.sendBuilderStrict(genesis.builder);
    const state = await discoverClaimReviewState(genesis.contracts);
    const attack = buildOpenClaimTx({
      contracts: genesis.contracts,
      planUtxo: state.planUtxo!,
      fee: 5_000n,
    }).builder.addOutput({ to: stranger.address, amount: 2_000n }).build();

    // The remaining 3,000 satoshis cover relay fees. The extra payment uses only
    // plan funds and requires no owner or sponsor signature, so VM must reject it.
    const result = await verifier.verifyTxStrict(attack);
    expect(result.ok).toBe(false);
    expect(result.stage).toBe('vm');
  });

  it('handles round >= 128 signed-byte boundary and rejects stale-round or standalone anchor spends', async () => {
    const { provider, verifier, owner, heir, stranger } = await setupChain();
    const seq = encodeReviewDurationToBip68Sequence(512);
    const genesisCoin = await fundConfirmed(verifier, owner.address, 100_000n, 0);
    const sponsorCoin = await fundConfirmed(verifier, stranger.address, 30_000n, 0);

    const contracts = instantiateClaimReviewContracts({
      provider,
      planCategoryHex: genesisCoin.txid,
      ownerPkh: owner.pkh,
      heirPkh: heir.pkh,
      reviewSequence: seq.sequence,
    });

    // Simulate a Plan UTXO already at ACTIVE round = 127 (0x7f -> crosses 0x80 signed bit on next open!)
    const round127Plan = await provider.addUtxo(contracts.proof.tokenAddress, {
      txid: genesisCoin.txid,
      vout: 0,
      satoshis: 50_000n,
      token: {
        category: contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: binToHex(encodePlanStateCommitment(PLAN_STATUS_ACTIVE, 127)),
        },
      },
    });
    await verifier.recordOutpoint(round127Plan.txid, round127Plan.vout);

    // Open claim -> round 128 (`0x80000000` in 4-byte LE)
    const { builder: open128, nextRound } = buildOpenClaimTx({
      contracts,
      planUtxo: round127Plan,
      sponsorUtxo: sponsorCoin,
      sponsorUnlocker: stranger.tpl.unlockP2PKH(),
      sponsorChangeAddress: stranger.address,
    });
    expect(nextRound).toBe(128);
    await verifier.sendBuilderStrict(open128);
    let state = await discoverClaimReviewState(contracts);
    expect(state.round).toBe(128);
    expect(state.pendingAnchorRound).toBe(128);

    // Cancel round 128 and re-open round 129 -> proves int(0x80000000) == +128 (NOT -0!)
    const ownerCoin = await fundConfirmed(verifier, owner.address, 20_000n, 0);
    await verifier.sendBuilderStrict(
      buildCancelClaimTx({
        contracts,
        planUtxo: state.planUtxo!,
        anchorUtxo: state.anchorUtxo!,
        ownerUtxo: ownerCoin,
        ownerUnlocker: owner.tpl.unlockP2PKH(),
        ownerChangeAddress: owner.address,
      }),
    );
    state = await discoverClaimReviewState(contracts);
    expect(state.round).toBe(128);

    const sponsorCoin2 = await fundConfirmed(verifier, stranger.address, 30_000n, 0);
    await verifier.sendBuilderStrict(
      buildOpenClaimTx({
        contracts,
        planUtxo: state.planUtxo!,
        sponsorUtxo: sponsorCoin2,
        sponsorUnlocker: stranger.tpl.unlockP2PKH(),
        sponsorChangeAddress: stranger.address,
      }).builder,
    );
    state = await discoverClaimReviewState(contracts);
    expect(state.round).toBe(129);
    expect(state.pendingAnchorRound).toBe(129);

    await verifier.advanceTimeAndMine(512, 6);

    // Adversarial: inject a counterfeit stale Round-128 Anchor and try pairing it with Round-129 Plan
    const staleAnchor128 = await provider.addUtxo(contracts.anchor.tokenAddress, {
      txid: randomUtxo().txid,
      vout: 1,
      satoshis: 1000n,
      token: {
        category: contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.none,
          commitment: binToHex(encodeRoundCommitment(128)),
        },
      },
    });
    await verifier.recordOutpoint(staleAnchor128.txid, staleAnchor128.vout, 1);

    const mismatchedRoundTx = buildFinalizeClaimTx({
      contracts,
      planUtxo: state.planUtxo!,
      anchorUtxo: staleAnchor128,
      heirAddress: heir.address,
    }).build();
    expect((await verifier.verifyTxStrict(mismatchedRoundTx)).ok).toBe(false);

    // Adversarial: attempt spending ClaimReviewAnchor.finalize() standalone without Plan minting NFT
    const standaloneAnchorTx = new TransactionBuilder({ provider, allowImplicitNftBurn: true })
      .addInput(state.anchorUtxo!, contracts.anchor.unlock.finalize(), {
        sequence: seq.sequence,
      })
      .addInput(await fundConfirmed(verifier, stranger.address, 10_000n, 0), stranger.tpl.unlockP2PKH())
      .addOutput({ to: stranger.address, amount: 9000n })
      .build();
    expect((await verifier.verifyTxStrict(standaloneAnchorTx)).ok).toBe(false);

    // Real Round-129 Anchor finalizes cleanly
    const finalRes = await verifier.sendBuilderStrict(
      buildFinalizeClaimTx({
        contracts,
        planUtxo: state.planUtxo!,
        anchorUtxo: state.anchorUtxo!,
        heirAddress: heir.address,
      }),
    );
    expect(finalRes.txid).toMatch(/^[0-9a-f]{64}$/);
  });
});

