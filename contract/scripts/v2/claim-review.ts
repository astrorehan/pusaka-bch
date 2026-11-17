import { readFileSync } from 'node:fs';
import {
  Contract,
  SignatureTemplate,
  TransactionBuilder,
  type NetworkProvider,
  type Output,
  type Unlocker,
  type Utxo,
} from '@solidcash/solidcash';
import {
  binToHex,
  hexToBin,
  lockingBytecodeToCashAddress,
  NonFungibleTokenCapability,
  numberToBinUint32LE,
  binToNumberUint32LE,
} from '@bitauth/libauth';

export const BIP68_DISABLE_FLAG = 0x80000000;
export const BIP68_TIME_FLAG = 0x00400000; // 4_194_304
export const BIP68_MASK = 0x0000ffff; // 65_535
export const BIP68_UNIT_SECONDS = 512;
export const MAX_BIP68_UNITS = 0xffff; // 65_535 (~388.355 days)
export const MIN_REVIEW_SECONDS = BIP68_UNIT_SECONDS; // 512s (1 unit)
export const MAX_REVIEW_SECONDS = MAX_BIP68_UNITS * BIP68_UNIT_SECONDS; // 33_553_920s

export const PLAN_STATE_VERSION = 0x02;
export const PLAN_STATUS_ACTIVE = 0x00;
export const PLAN_STATUS_REVIEW = 0x01;

export const DEFAULT_MIN_ANCHOR_SATS = 1000n;
export const DEFAULT_FEE_BUDGET = 2500n;

export type PlanStatus = typeof PLAN_STATUS_ACTIVE | typeof PLAN_STATUS_REVIEW;

export interface Bip68SequenceEncoding {
  sequence: number;
  units: number;
  effectiveSeconds: number;
  requestedSeconds: number;
}

export interface PlanStateCommitment {
  version: number;
  status: PlanStatus;
  round: number;
}

export interface ClaimReviewSigner {
  pkh: Uint8Array;
  address: string;
  tokenAddress?: string;
  template: SignatureTemplate;
}

export interface ClaimReviewContracts {
  provider: NetworkProvider;
  planCategoryHex: string;
  planCategoryVmBytes: Uint8Array;
  ownerPkh: Uint8Array;
  heirPkh: Uint8Array;
  reviewSequence: number;
  reviewUnits: number;
  effectiveReviewSeconds: number;
  minAnchorSats: bigint;
  feeBudget: bigint;
  anchor: Contract;
  proof: Contract;
  anchorLockingBytecode: Uint8Array;
  planLockingBytecode: Uint8Array;
}

export interface DiscoveredClaimReviewState {
  status: PlanStatus | 'EXITED_OR_UNINITIALIZED';
  round: number;
  planUtxo?: Utxo;
  anchorUtxo?: Utxo;
  pendingAnchorRound?: number;
  planBalanceSats: bigint;
  anchorSats: bigint;
}

function loadArtifact(relativePath: string) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

export const CLAIM_REVIEW_ANCHOR_ARTIFACT = loadArtifact(
  '../../artifacts/solidcash/contracts/ClaimReviewAnchor.scash/ClaimReviewAnchor.json',
);
export const CLAIM_REVIEW_PROOF_ARTIFACT = loadArtifact(
  '../../artifacts/solidcash/contracts/ClaimReviewProof.scash/ClaimReviewProof.json',
);

/**
 * Encode a review duration in seconds into a time-based BIP68 sequence number.
 * Rounds upward to 512-second quanta (`ceil(seconds / 512)`), clamping validation
 * strictly to `[1, 65535]` units (`0x00400001 .. 0x0040ffff`).
 */
export function encodeReviewDurationToBip68Sequence(durationSeconds: number): Bip68SequenceEncoding {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Review duration must be > 0 seconds; got ${durationSeconds}`);
  }
  const units = Math.ceil(durationSeconds / BIP68_UNIT_SECONDS);
  if (units < 1 || units > MAX_BIP68_UNITS) {
    throw new Error(
      `Review duration ${durationSeconds}s requires ${units} 512s units, outside BIP68 range [1, ${MAX_BIP68_UNITS}]`,
    );
  }
  const sequence = (BIP68_TIME_FLAG | units) >>> 0;
  return {
    sequence,
    units,
    effectiveSeconds: units * BIP68_UNIT_SECONDS,
    requestedSeconds: durationSeconds,
  };
}

export function decodeBip68TimeSequence(sequence: number): {
  disabled: boolean;
  isTimeBased: boolean;
  units: number;
  effectiveSeconds: number;
} {
  const u = sequence >>> 0;
  const disabled = (u & BIP68_DISABLE_FLAG) !== 0;
  const isTimeBased = (u & BIP68_TIME_FLAG) !== 0;
  const units = u & BIP68_MASK;
  return {
    disabled,
    isTimeBased,
    units,
    effectiveSeconds: isTimeBased ? units * BIP68_UNIT_SECONDS : units,
  };
}

/**
 * CashTokens VM opcodes (`OP_UTXOTOKENCATEGORY` / `OP_OUTPUTTOKENCATEGORY`) push
 * the 32-byte category ID in raw wire byte order (reversed from display txid hex).
 */
export function categoryDisplayHexToVmBytes(categoryHex: string): Uint8Array {
  const bytes = hexToBin(categoryHex);
  if (bytes.length !== 32) {
    throw new Error(`Expected 32-byte category hex; got ${bytes.length} bytes`);
  }
  return bytes.reverse();
}

export function categoryVmBytesToDisplayHex(vmBytes: Uint8Array): string {
  if (vmBytes.length !== 32) {
    throw new Error(`Expected 32-byte VM category; got ${vmBytes.length} bytes`);
  }
  return binToHex(Uint8Array.from(vmBytes).reverse());
}

export function encodePlanStateCommitment(status: PlanStatus, round: number): Uint8Array {
  if (!Number.isInteger(round) || round < 0 || round >= 0x7fffffff) {
    throw new Error(`Invalid round ${round}`);
  }
  const out = new Uint8Array(6);
  out[0] = PLAN_STATE_VERSION;
  out[1] = status;
  out.set(numberToBinUint32LE(round), 2);
  return out;
}

export function decodePlanStateCommitment(commitmentHexOrBytes: string | Uint8Array): PlanStateCommitment {
  const bytes = typeof commitmentHexOrBytes === 'string' ? hexToBin(commitmentHexOrBytes) : commitmentHexOrBytes;
  if (bytes.length !== 6) {
    throw new Error(`Invalid plan commitment length ${bytes.length}; expected 6 bytes`);
  }
  if (bytes[0] !== PLAN_STATE_VERSION) {
    throw new Error(`Unsupported plan state version 0x${bytes[0].toString(16)}`);
  }
  const status = bytes[1];
  if (status !== PLAN_STATUS_ACTIVE && status !== PLAN_STATUS_REVIEW) {
    throw new Error(`Invalid plan status byte 0x${status.toString(16)}`);
  }
  const round = binToNumberUint32LE(bytes.slice(2, 6));
  return { version: bytes[0], status, round };
}

export function encodeRoundCommitment(round: number): Uint8Array {
  if (!Number.isInteger(round) || round <= 0 || round >= 0x7fffffff) {
    throw new Error(`Invalid claim round ${round}`);
  }
  return numberToBinUint32LE(round);
}

export function decodeRoundCommitment(commitmentHexOrBytes: string | Uint8Array): number {
  const bytes = typeof commitmentHexOrBytes === 'string' ? hexToBin(commitmentHexOrBytes) : commitmentHexOrBytes;
  if (bytes.length !== 4) {
    throw new Error(`Invalid anchor round commitment length ${bytes.length}; expected 4 bytes`);
  }
  return binToNumberUint32LE(bytes);
}

export function lockingBytecodeFromAddress(contract: Contract): Uint8Array {
  return contract.lockingBytecode instanceof Uint8Array
    ? contract.lockingBytecode
    : hexToBin(contract.lockingBytecode);
}

export function instantiateClaimReviewContracts(params: {
  provider: NetworkProvider;
  planCategoryHex: string;
  ownerPkh: Uint8Array;
  heirPkh: Uint8Array;
  reviewSequence: number;
  minAnchorSats?: bigint;
  feeBudget?: bigint;
}): ClaimReviewContracts {
  const minAnchorSats = params.minAnchorSats ?? DEFAULT_MIN_ANCHOR_SATS;
  const feeBudget = params.feeBudget ?? DEFAULT_FEE_BUDGET;
  const decodedSeq = decodeBip68TimeSequence(params.reviewSequence);
  if (decodedSeq.disabled || !decodedSeq.isTimeBased || decodedSeq.units < 1) {
    throw new Error(`Invalid time-based BIP68 sequence ${params.reviewSequence}`);
  }
  const planCategoryVmBytes = categoryDisplayHexToVmBytes(params.planCategoryHex);

  const anchor = new Contract(
    CLAIM_REVIEW_ANCHOR_ARTIFACT,
    [planCategoryVmBytes, params.ownerPkh, BigInt(params.reviewSequence)],
    { provider: params.provider, addressType: 'p2sh32' },
  );
  const anchorLockingBytecode = lockingBytecodeFromAddress(anchor);
  if (anchorLockingBytecode.length !== 35) {
    throw new Error(`Expected 35-byte P2SH32 anchor locking bytecode; got ${anchorLockingBytecode.length}`);
  }

  const proof = new Contract(
    CLAIM_REVIEW_PROOF_ARTIFACT,
    [
      planCategoryVmBytes,
      params.ownerPkh,
      params.heirPkh,
      BigInt(params.reviewSequence),
      anchorLockingBytecode,
      minAnchorSats,
      feeBudget,
    ],
    { provider: params.provider, addressType: 'p2sh32' },
  );
  const planLockingBytecode = lockingBytecodeFromAddress(proof);

  return {
    provider: params.provider,
    planCategoryHex: params.planCategoryHex,
    planCategoryVmBytes,
    ownerPkh: params.ownerPkh,
    heirPkh: params.heirPkh,
    reviewSequence: params.reviewSequence,
    reviewUnits: decodedSeq.units,
    effectiveReviewSeconds: decodedSeq.effectiveSeconds,
    minAnchorSats,
    feeBudget,
    anchor,
    proof,
    anchorLockingBytecode,
    planLockingBytecode,
  };
}

/**
 * Ensure we have a `vout === 0` plain-BCH UTXO for CashTokens genesis.
 * If none of the signer's UTXOs has `vout === 0`, spends an existing UTXO to
 * create a self-owned `vout === 0` UTXO first.
 */
export async function ensureGenesisUtxo(params: {
  provider: NetworkProvider;
  ownerAddress: string;
  ownerUnlocker: Unlocker;
  minimumSats: bigint;
  fee?: bigint;
}): Promise<{ genesisUtxo: Utxo; preTxid?: string }> {
  const fee = params.fee ?? 500n;
  const utxos = await params.provider.getUtxos(params.ownerAddress);
  const eligible = utxos.find((u) => !u.token && u.vout === 0 && u.satoshis >= params.minimumSats);
  if (eligible) return { genesisUtxo: eligible };

  const funding = utxos
    .filter((u) => !u.token && u.satoshis >= params.minimumSats + fee)
    .sort((a, b) => Number(b.satoshis - a.satoshis))[0];
  if (!funding) {
    throw new Error(`Owner ${params.ownerAddress} lacks a plain UTXO with >= ${params.minimumSats + fee} sats`);
  }
  const preTx = new TransactionBuilder({ provider: params.provider })
    .addInput(funding, params.ownerUnlocker)
    .addOutput({ to: params.ownerAddress, amount: funding.satoshis - fee });
  const details = await preTx.send();
  const refreshed = await params.provider.getUtxos(params.ownerAddress);
  const created = refreshed.find((u) => u.txid === details.txid && u.vout === 0);
  if (!created) {
    throw new Error(`Failed to locate vout=0 genesis UTXO after pre-split ${details.txid}`);
  }
  return { genesisUtxo: created, preTxid: details.txid };
}

export function buildGenesisPlanTx(params: {
  provider: NetworkProvider;
  genesisUtxo: Utxo;
  ownerUnlocker: Unlocker;
  ownerAddress: string;
  heirPkh: Uint8Array;
  ownerPkh: Uint8Array;
  reviewSequence: number;
  initialDepositSats: bigint;
  minAnchorSats?: bigint;
  feeBudget?: bigint;
  fee?: bigint;
}): {
  contracts: ClaimReviewContracts;
  builder: TransactionBuilder;
} {
  if (params.genesisUtxo.vout !== 0) {
    throw new Error(`CashTokens genesis requires input 0 with vout === 0; got vout ${params.genesisUtxo.vout}`);
  }
  if (params.genesisUtxo.token) {
    throw new Error('Genesis UTXO must be plain BCH without tokens');
  }
  const fee = params.fee ?? 800n;
  const contracts = instantiateClaimReviewContracts({
    provider: params.provider,
    planCategoryHex: params.genesisUtxo.txid,
    ownerPkh: params.ownerPkh,
    heirPkh: params.heirPkh,
    reviewSequence: params.reviewSequence,
    minAnchorSats: params.minAnchorSats,
    feeBudget: params.feeBudget,
  });

  const initialCommitment = binToHex(encodePlanStateCommitment(PLAN_STATUS_ACTIVE, 0));
  const builder = new TransactionBuilder({ provider: params.provider })
    .addInput(params.genesisUtxo, params.ownerUnlocker)
    .addOutput({
      to: contracts.proof.tokenAddress,
      amount: params.initialDepositSats,
      token: {
        category: contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: initialCommitment,
        },
      },
    });

  const change = params.genesisUtxo.satoshis - params.initialDepositSats - fee;
  if (change < 0n) {
    throw new Error(
      `Genesis UTXO (${params.genesisUtxo.satoshis} sats) cannot cover deposit ${params.initialDepositSats} + fee ${fee}`,
    );
  }
  if (change >= 600n) {
    builder.addOutput({ to: params.ownerAddress, amount: change });
  }
  return { contracts, builder };
}

export function buildDepositTx(params: {
  contracts: ClaimReviewContracts;
  planUtxo: Utxo;
  fundingUtxo: Utxo;
  fundingUnlocker: Unlocker;
  depositSats: bigint;
  changeAddress?: string;
  fee?: bigint;
}): TransactionBuilder {
  const fee = params.fee ?? 1500n;
  if (params.depositSats <= 0n) {
    throw new Error(`depositSats must be > 0; got ${params.depositSats}`);
  }
  if (!params.planUtxo.token?.nft) {
    throw new Error('planUtxo missing state NFT');
  }
  const nextPlanSats = params.planUtxo.satoshis + params.depositSats;
  const change = params.fundingUtxo.satoshis - params.depositSats - fee;
  if (change < 0n) {
    throw new Error(`Funding UTXO (${params.fundingUtxo.satoshis}) insufficient for deposit ${params.depositSats} + fee ${fee}`);
  }

  const builder = new TransactionBuilder({ provider: params.contracts.provider })
    .addInput(params.planUtxo, params.contracts.proof.unlock.deposit())
    .addInput(params.fundingUtxo, params.fundingUnlocker)
    .addOutput({
      to: params.contracts.proof.tokenAddress,
      amount: nextPlanSats,
      token: {
        category: params.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: params.planUtxo.token.nft.commitment,
        },
      },
    });

  if (change >= 600n) {
    if (!params.changeAddress) {
      throw new Error('changeAddress required when deposit produces >= 600 sat change');
    }
    builder.addOutput({ to: params.changeAddress, amount: change });
  }
  return builder;
}

export function buildOpenClaimTx(params: {
  contracts: ClaimReviewContracts;
  planUtxo: Utxo;
  sponsorUtxo?: Utxo;
  sponsorUnlocker?: Unlocker;
  sponsorChangeAddress?: string;
  anchorSats?: bigint;
  fee?: bigint;
  locktime?: number;
}): { builder: TransactionBuilder; nextRound: number } {
  if (!params.planUtxo.token?.nft) {
    throw new Error('planUtxo missing state NFT');
  }
  const current = decodePlanStateCommitment(params.planUtxo.token.nft.commitment);
  if (current.status !== PLAN_STATUS_ACTIVE) {
    throw new Error(`Cannot openClaim from status ${current.status}; expected ACTIVE (${PLAN_STATUS_ACTIVE})`);
  }
  const nextRound = current.round + 1;
  const anchorSats = params.anchorSats ?? params.contracts.minAnchorSats;
  const fee = params.fee ?? 1500n;
  const nextPlanCommitment = binToHex(encodePlanStateCommitment(PLAN_STATUS_REVIEW, nextRound));
  const anchorCommitment = binToHex(encodeRoundCommitment(nextRound));

  const builder = new TransactionBuilder({ provider: params.contracts.provider })
    .addInput(params.planUtxo, params.contracts.proof.unlock.openClaim());

  let nextPlanSats = params.planUtxo.satoshis;
  if (params.sponsorUtxo) {
    if (!params.sponsorUnlocker) {
      throw new Error('sponsorUnlocker is required when sponsorUtxo is provided');
    }
    builder.addInput(params.sponsorUtxo, params.sponsorUnlocker);
  } else {
    nextPlanSats = params.planUtxo.satoshis - anchorSats - fee;
    if (nextPlanSats < 1000n) {
      throw new Error(`Plan balance (${params.planUtxo.satoshis}) too small for self-funded openClaim`);
    }
  }

  builder
    .addOutput({
      to: params.contracts.proof.tokenAddress,
      amount: nextPlanSats,
      token: {
        category: params.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: nextPlanCommitment,
        },
      },
    })
    .addOutput({
      to: params.contracts.anchor.tokenAddress,
      amount: anchorSats,
      token: {
        category: params.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.none,
          commitment: anchorCommitment,
        },
      },
    });

  if (params.sponsorUtxo) {
    const change = params.sponsorUtxo.satoshis - anchorSats - fee;
    if (change < 0n) {
      throw new Error(`Sponsor UTXO (${params.sponsorUtxo.satoshis}) cannot cover anchor ${anchorSats} + fee ${fee}`);
    }
    if (change >= 600n) {
      if (!params.sponsorChangeAddress) {
        throw new Error('sponsorChangeAddress required when sponsor change >= 600 sats');
      }
      builder.addOutput({ to: params.sponsorChangeAddress, amount: change });
    }
  }

  if (params.locktime !== undefined) {
    builder.setLocktime(params.locktime);
  }

  return { builder, nextRound };
}

export function buildCancelClaimTx(params: {
  contracts: ClaimReviewContracts;
  planUtxo: Utxo;
  anchorUtxo: Utxo;
  ownerUtxo: Utxo;
  ownerUnlocker: Unlocker;
  ownerChangeAddress: string;
  reclaimAnchorIntoPlan?: boolean;
  fee?: bigint;
}): TransactionBuilder {
  if (!params.planUtxo.token?.nft) {
    throw new Error('planUtxo missing state NFT');
  }
  const current = decodePlanStateCommitment(params.planUtxo.token.nft.commitment);
  if (current.status !== PLAN_STATUS_REVIEW) {
    throw new Error(`Cannot cancelClaim from status ${current.status}; expected REVIEW (${PLAN_STATUS_REVIEW})`);
  }
  const fee = params.fee ?? 1800n;
  const activeCommitment = binToHex(encodePlanStateCommitment(PLAN_STATUS_ACTIVE, current.round));
  const reclaim = params.reclaimAnchorIntoPlan ?? false;

  const nextPlanSats = reclaim
    ? params.planUtxo.satoshis + params.anchorUtxo.satoshis
    : params.planUtxo.satoshis;

  const totalOwnerSide = reclaim
    ? params.ownerUtxo.satoshis
    : params.ownerUtxo.satoshis + params.anchorUtxo.satoshis;
  const change = totalOwnerSide - fee;
  if (change < 0n) {
    throw new Error(`Insufficient sats on cancel (${totalOwnerSide}) to pay fee ${fee}`);
  }

  const builder = new TransactionBuilder({
    provider: params.contracts.provider,
    allowImplicitNftBurn: true,
  })
    .addInput(params.planUtxo, params.contracts.proof.unlock.cancelClaim())
    .addInput(params.anchorUtxo, params.contracts.anchor.unlock.cancel())
    .addInput(params.ownerUtxo, params.ownerUnlocker)
    .addOutput({
      to: params.contracts.proof.tokenAddress,
      amount: nextPlanSats,
      token: {
        category: params.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: activeCommitment,
        },
      },
    });

  if (change >= 600n) {
    builder.addOutput({ to: params.ownerChangeAddress, amount: change });
  }
  return builder;
}

export function buildOwnerWithdrawTx(params: {
  contracts: ClaimReviewContracts;
  planUtxo: Utxo;
  ownerUtxo: Utxo;
  ownerUnlocker: Unlocker;
  ownerAddress: string;
  fee?: bigint;
}): TransactionBuilder {
  const fee = params.fee ?? 1500n;
  const payout = params.planUtxo.satoshis + params.ownerUtxo.satoshis - fee;
  if (payout < 600n) {
    throw new Error('Withdraw output below dust');
  }
  return new TransactionBuilder({
    provider: params.contracts.provider,
    allowImplicitNftBurn: true,
  })
    .addInput(params.planUtxo, params.contracts.proof.unlock.ownerWithdraw())
    .addInput(params.ownerUtxo, params.ownerUnlocker)
    .addOutput({ to: params.ownerAddress, amount: payout });
}

export function buildFinalizeClaimTx(params: {
  contracts: ClaimReviewContracts;
  planUtxo: Utxo;
  anchorUtxo: Utxo;
  heirAddress: string;
  submitterUtxo?: Utxo;
  submitterUnlocker?: Unlocker;
  submitterChangeAddress?: string;
  fee?: bigint;
  anchorSequenceOverride?: number;
}): TransactionBuilder {
  const fee = params.fee ?? 1600n;
  const anchorSequence = params.anchorSequenceOverride ?? params.contracts.reviewSequence;
  const vaultTotal = params.planUtxo.satoshis + params.anchorUtxo.satoshis;

  const builder = new TransactionBuilder({
    provider: params.contracts.provider,
    allowImplicitNftBurn: true,
  })
    .addInput(params.planUtxo, params.contracts.proof.unlock.finalizeClaim())
    .addInput(params.anchorUtxo, params.contracts.anchor.unlock.finalize(), {
      sequence: anchorSequence,
    });

  if (params.submitterUtxo) {
    if (!params.submitterUnlocker) {
      throw new Error('submitterUnlocker is required when submitterUtxo is provided');
    }
    builder.addInput(params.submitterUtxo, params.submitterUnlocker);
    builder.addOutput({ to: params.heirAddress, amount: vaultTotal });
    const change = params.submitterUtxo.satoshis - fee;
    if (change < 0n) {
      throw new Error(`Submitter UTXO (${params.submitterUtxo.satoshis}) insufficient for fee ${fee}`);
    }
    if (change >= 600n) {
      if (!params.submitterChangeAddress) {
        throw new Error('submitterChangeAddress required when submitter change >= 600 sats');
      }
      builder.addOutput({ to: params.submitterChangeAddress, amount: change });
    }
  } else {
    const payout = vaultTotal - fee;
    if (payout < 600n) {
      throw new Error(`Vault total (${vaultTotal}) minus fee (${fee}) is below dust`);
    }
    builder.addOutput({ to: params.heirAddress, amount: payout });
  }

  return builder;
}

export async function discoverClaimReviewState(
  contracts: ClaimReviewContracts,
): Promise<DiscoveredClaimReviewState> {
  const [planUtxos, anchorUtxos] = await Promise.all([
    contracts.provider.getUtxos(contracts.proof.tokenAddress),
    contracts.provider.getUtxos(contracts.anchor.tokenAddress),
  ]);

  const planUtxo = planUtxos.find(
    (u) =>
      u.token?.category === contracts.planCategoryHex &&
      u.token.nft?.capability === NonFungibleTokenCapability.minting,
  );
  const anchorUtxo = anchorUtxos.find(
    (u) =>
      u.token?.category === contracts.planCategoryHex &&
      u.token.nft?.capability === NonFungibleTokenCapability.none,
  );

  if (!planUtxo || !planUtxo.token?.nft) {
    return {
      status: 'EXITED_OR_UNINITIALIZED',
      round: 0,
      anchorUtxo,
      pendingAnchorRound: anchorUtxo?.token?.nft ? decodeRoundCommitment(anchorUtxo.token.nft.commitment) : undefined,
      planBalanceSats: 0n,
      anchorSats: anchorUtxo?.satoshis ?? 0n,
    };
  }

  const decoded = decodePlanStateCommitment(planUtxo.token.nft.commitment);
  return {
    status: decoded.status,
    round: decoded.round,
    planUtxo,
    anchorUtxo,
    pendingAnchorRound: anchorUtxo?.token?.nft ? decodeRoundCommitment(anchorUtxo.token.nft.commitment) : undefined,
    planBalanceSats: planUtxo.satoshis,
    anchorSats: anchorUtxo?.satoshis ?? 0n,
  };
}

export function p2pkhCashAddressFromPkh(pkh: Uint8Array, prefix: 'bitcoincash' | 'bchtest' | 'bchreg' = 'bchtest'): string {
  // Construct 25-byte P2PKH locking bytecode: OP_DUP OP_HASH160 <20> pkh OP_EQUALVERIFY OP_CHECKSIG
  const locking = new Uint8Array(25);
  locking[0] = 0x76;
  locking[1] = 0xa9;
  locking[2] = 0x14;
  locking.set(pkh, 3);
  locking[23] = 0x88;
  locking[24] = 0xac;
  const res = lockingBytecodeToCashAddress({ bytecode: locking, prefix });
  if (typeof res === 'string') {
    throw new Error(res);
  }
  return res.address;
}
