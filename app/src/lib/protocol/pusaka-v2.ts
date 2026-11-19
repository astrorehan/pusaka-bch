import assetPlanArtifact from "./PusakaAssetPlan.json" with { type: "json" };
import {
  Contract,
  Signer,
  TransactionBuilder,
  type NetworkProvider,
  type Unlocker,
  type Utxo,
} from "@solidcash/solidcash";
import { applyExternalSignatures } from "@solidcash/solidcash/dist/external-signing.js";
import { hash256, type Artifact } from "@solidcash/utils";
import {
  binToHex,
  binToNumberUint32LE,
  cashAddressToLockingBytecode,
  decodeTransactionBch,
  encodeTransaction,
  hexToBin,
  lockingBytecodeToCashAddress,
  NonFungibleTokenCapability,
  numberToBinUint32LE,
} from "@bitauth/libauth";
import { p2pkhCashAddressFromPkh, toBytes20 } from "../cashAddress.ts";
import {
  MAX_HEIRS,
  MAX_INT32,
  MIN_PLAN_CARRIER_SATS,
  PUSAKA_V2_VERSION,
  readV2Metadata,
  type PusakaV2PlanMetadata,
} from "./plan-metadata.ts";
import {
  BIP68_DISABLE_FLAG,
  BIP68_MASK,
  BIP68_TIME_FLAG,
  BIP68_UNIT_SECONDS,
  categoryDisplayHexToVmBytes,
  categoryVmBytesToDisplayHex,
  decodeBip68TimeSequence,
  encodeReviewDurationToBip68Sequence,
  ensureGenesisUtxo,
  MAX_BIP68_UNITS,
  MAX_REVIEW_SECONDS,
  MIN_REVIEW_SECONDS,
  type Bip68SequenceEncoding,
} from "./claim-primitives.ts";

export {
  BIP68_DISABLE_FLAG,
  BIP68_MASK,
  BIP68_TIME_FLAG,
  BIP68_UNIT_SECONDS,
  categoryDisplayHexToVmBytes,
  categoryVmBytesToDisplayHex,
  decodeBip68TimeSequence,
  encodeReviewDurationToBip68Sequence,
  ensureGenesisUtxo,
  MAX_BIP68_UNITS,
  MAX_REVIEW_SECONDS,
  MIN_REVIEW_SECONDS,
  type Bip68SequenceEncoding,
};

export { p2pkhCashAddressFromPkh, toBytes20 };
export {
  decodePusakaV2PlanLink, encodePusakaV2PlanLink, MAX_HEIRS, MAX_INT32,
  MIN_PLAN_CARRIER_SATS, PUSAKA_V2_VERSION, type PusakaV2PlanMetadata,
} from "./plan-metadata.ts";
export const PLAN_COMMITMENT_VERSION = 0x02;
export const PLAN_COMMITMENT_BYTES = 51;
export const ANCHOR_COMMITMENT_BYTES = 8;

export const PLAN_STATUS_ACTIVE = 0x00 as const;
export const PLAN_STATUS_REVIEW = 0x01 as const;
export const PLAN_STATUS_PAID_OUT = 0x02 as const;
export const PLAN_STATUS_CLOSED = 0x03 as const;

export type PlanStatusCode =
  | typeof PLAN_STATUS_ACTIVE
  | typeof PLAN_STATUS_REVIEW
  | typeof PLAN_STATUS_PAID_OUT
  | typeof PLAN_STATUS_CLOSED;

export type PlanStatusName =
  "ACTIVE" | "REVIEW" | "PAID_OUT" | "CLOSED" | "UNINITIALIZED";

export const MIN_ANCHOR_SATS = 1_000n;
export const P2PKH_DUST_SATS = 546n;
export const DEFAULT_FEE_BUDGET = 5_000n;
export const MIN_FEE_BUDGET = 500n;
export const MAX_FEE_BUDGET = 100_000n;
export const MAX_OWNER_TX_FEE = 10_000n;
export const DEFAULT_AUTH_COIN_RESERVE_SATS = 600n;
export const DEFAULT_PER_INPUT_FEE_CAP = 600n;
export const MIN_CLTV_TIMESTAMP = 500_000_000;
export const MAX_CLTV_TIMESTAMP = 0xffffffff;
export const MAX_INBOX_SWEEP_INPUTS = 20;

export type OwnerFeeFundingMode = "auto" | "owner" | "protected";
export type OwnerFeeFundingSource = "owner" | "protected" | "hybrid";

import artifactPlan from "./PusakaV2Plan.json" with { type: "json" };
export const PUSAKA_V2_PLAN_ARTIFACT = artifactPlan as Artifact;
import artifactAnchor from "./PusakaV2Anchor.json" with { type: "json" };
export const PUSAKA_V2_ANCHOR_ARTIFACT = artifactAnchor as Artifact;
import artifactInbox from "./PusakaV2Inbox.json" with { type: "json" };
export const PUSAKA_V2_INBOX_ARTIFACT = artifactInbox as Artifact;

export interface PusakaV2HeirInput {
  pkh: Uint8Array | string;
  share: number | bigint;
  label?: string;
}

export interface PusakaV2PolicyInput {
  inactivityPeriodSeconds: number;
  reviewPeriodSeconds?: number;
  reviewSequence?: number;
  feeBudget?: bigint | number;
  contacts: [Uint8Array | string, Uint8Array | string, Uint8Array | string];
  heirs: PusakaV2HeirInput[];
}

export interface NormalizedPusakaV2Policy {
  inactivityPeriodSeconds: number;
  reviewSequence: number;
  reviewUnits: number;
  effectiveReviewSeconds: number;
  feeBudget: bigint;
  contacts: [Uint8Array, Uint8Array, Uint8Array];
  totalShares: bigint;
  heirs: Array<{ pkh: Uint8Array; share: bigint; label?: string }>;
  policyBytes: Uint8Array;
  policyBytesHex: string;
  policyHashBytes: Uint8Array;
  policyHashHex: string;
}

export interface PusakaV2CommitmentState {
  version: number;
  statusCode: PlanStatusCode;
  status: Exclude<PlanStatusName, "UNINITIALIZED">;
  round: number;
  approvalsMask: number;
  approvedContactIndices: number[];
  deadline: number;
  inactivityPeriodSeconds: number;
  policyHashHex: string;
}

export interface PusakaV2AnchorCommitment {
  round: number;
  reviewSequence: number;
}

export interface PusakaV2Contracts {
  protocolRevision?: "assets-1";
  provider: NetworkProvider;
  network: string;
  planCategoryHex: string;
  planCategoryVmBytes: Uint8Array;
  ownerPkh: Uint8Array;
  perInputFeeCap: bigint;
  anchor: Contract;
  plan: Contract;
  inbox: Contract;
  anchorLockingBytecode: Uint8Array;
  planLockingBytecode: Uint8Array;
  inboxLockingBytecode: Uint8Array;
  planAddress: string;
  anchorAddress: string;
  inboxAddress: string;
}

export interface PusakaV2PlanHandle {
  metadata: PusakaV2PlanMetadata;
  policy: NormalizedPusakaV2Policy;
  contracts: PusakaV2Contracts;
  provider: NetworkProvider;
}

export interface DiscoveredPusakaV2State {
  status: PlanStatusName;
  statusCode?: PlanStatusCode;
  round: number;
  approvalsMask: number;
  approvedContactIndices: number[];
  deadline: number;
  inactivityPeriodSeconds: number;
  onChainPolicyHashHex?: string;
  policyMatchesMetadata: boolean;
  planUtxo?: Utxo;
  planBalanceSats: bigint;
  spendableBalanceSats: bigint;
  anchorUtxo?: Utxo;
  anchorBalanceSats: bigint;
  anchorRound?: number;
  anchorSequence?: number;
  anchorMatchesRound: boolean;
  inboxUtxos: Utxo[];
  inboxJunkTokenUtxos: Utxo[];
  inboxBalanceSats: bigint;
  totalCoveredBalanceSats: bigint;
}

export class PolicyHashMismatchError extends Error {
  constructor(expectedHash: string, onChainHash: string) {
    super(
      `PusakaV2 metadata policyHash mismatch: metadata has ${expectedHash}, on-chain state has ${onChainHash}. Fetch the updated plan link/metadata.`,
    );
    this.name = "PolicyHashMismatchError";
  }
}

export function statusCodeToName(
  status: PlanStatusCode,
): Exclude<PlanStatusName, "UNINITIALIZED"> {
  switch (status) {
    case PLAN_STATUS_ACTIVE:
      return "ACTIVE";
    case PLAN_STATUS_REVIEW:
      return "REVIEW";
    case PLAN_STATUS_PAID_OUT:
      return "PAID_OUT";
    case PLAN_STATUS_CLOSED:
      return "CLOSED";
  }
}

export function resolveLockingBytecode(
  addressOrLock: string | Uint8Array,
): Uint8Array {
  if (addressOrLock instanceof Uint8Array) {
    return addressOrLock;
  }
  const trimmed = addressOrLock.trim();
  if (
    /^(0x)?[0-9a-fA-F]+$/.test(trimmed) &&
    trimmed.replace(/^0x/, "").length % 2 === 0
  ) {
    return hexToBin(trimmed.replace(/^0x/, ""));
  }
  const decoded = cashAddressToLockingBytecode(trimmed);
  if (typeof decoded === "string") {
    throw new Error(`Invalid CashAddress '${addressOrLock}': ${decoded}`);
  }
  return decoded.bytecode;
}

export function p2pkhLockingBytecode(pkh: Uint8Array | string): Uint8Array {
  const bytes = toBytes20(pkh);
  const out = new Uint8Array(25);
  out[0] = 0x76;
  out[1] = 0xa9;
  out[2] = 0x14;
  out.set(bytes, 3);
  out[23] = 0x88;
  out[24] = 0xac;
  return out;
}

export function lockToCashAddress(
  lock: Uint8Array,
  network: string,
  tokenSupport = false,
): string {
  const prefix =
    network === "mainnet"
      ? "bitcoincash"
      : network === "regtest"
        ? "bchreg"
        : "bchtest";
  const encoded = lockingBytecodeToCashAddress({
    bytecode: lock,
    prefix,
    tokenSupport,
  });
  if (typeof encoded === "string") {
    throw new Error(`Cannot encode locking bytecode: ${encoded}`);
  }
  return encoded.address;
}

export function equalShares(n: number): { shares: bigint[]; total: bigint } {
  if (!Number.isInteger(n) || n < 1 || n > MAX_HEIRS) {
    throw new Error(`Heir count must be between 1 and ${MAX_HEIRS}; got ${n}`);
  }
  return { shares: Array.from({ length: n }, () => 1n), total: BigInt(n) };
}

export function percentShares(percents: number[]): {
  shares: bigint[];
  total: bigint;
} {
  if (percents.length < 1 || percents.length > MAX_HEIRS) {
    throw new Error(
      `Heir count must be between 1 and ${MAX_HEIRS}; got ${percents.length}`,
    );
  }
  const shares = percents.map((p) => BigInt(Math.round(p * 100)));
  const sum = shares.reduce((s, v) => s + v, 0n);
  if (sum !== 10_000n) {
    throw new Error(
      `Custom percentage shares must sum to 100.00% (10000); got ${sum}`,
    );
  }
  return { shares, total: 10_000n };
}

export function faraidResultantShares(
  resultantShares: Array<number | bigint>,
): { shares: bigint[]; total: bigint } {
  if (resultantShares.length < 1 || resultantShares.length > MAX_HEIRS) {
    throw new Error(
      `Heir count must be between 1 and ${MAX_HEIRS}; got ${resultantShares.length}`,
    );
  }
  const shares = resultantShares.map((s) => BigInt(s));
  for (const s of shares) {
    if (s <= 0n || s >= BigInt(MAX_INT32)) {
      throw new Error(
        `Each resultant Faraid integer share must be in [1, ${MAX_INT32 - 1}]; got ${s}`,
      );
    }
  }
  const total = shares.reduce((a, b) => a + b, 0n);
  if (total <= 0n || total >= BigInt(MAX_INT32)) {
    throw new Error(
      `Total shares must fit positive signed 32-bit int; got ${total}`,
    );
  }
  return { shares, total };
}

export function heirAmounts(
  pot: bigint,
  shares: bigint[],
  shareTotal: bigint,
): { amounts: bigint[]; paidTotal: bigint; leftover: bigint } {
  if (pot <= 0n) {
    throw new Error(`Payout pot must be > 0; got ${pot}`);
  }
  if (shareTotal <= 0n) {
    throw new Error(`Total shares must be > 0; got ${shareTotal}`);
  }
  const amounts = shares.map((s) => (pot * s) / shareTotal);
  const paidTotal = amounts.reduce((a, b) => a + b, 0n);
  return { amounts, paidTotal, leftover: pot - paidTotal };
}

export function computePolicyPayoutPreview(
  pot: bigint,
  policy: Pick<NormalizedPusakaV2Policy, "heirs" | "totalShares">,
): { amounts: bigint[]; paidTotal: bigint; leftover: bigint } {
  const res = heirAmounts(
    pot,
    policy.heirs.map((h) => h.share),
    policy.totalShares,
  );
  for (let i = 0; i < res.amounts.length; i++) {
    if (res.amounts[i] < P2PKH_DUST_SATS) {
      throw new Error(
        `Heir ${i} payout (${res.amounts[i]} sats) is below dust (${P2PKH_DUST_SATS} sats) for pot=${pot}`,
      );
    }
  }
  return res;
}

function writeUint64LE(value: number | bigint): Uint8Array {
  const big = BigInt(value);
  if (big < 0n || big > 0x7fffffffffffffffn) {
    throw new Error(`Uint64 LE value out of range: ${big}`);
  }
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, big, true);
  return out;
}

function readUint64LE(bytes: Uint8Array): bigint {
  if (bytes.length !== 8) {
    throw new Error(`Expected 8 bytes for uint64 LE; got ${bytes.length}`);
  }
  return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true);
}

export function encodePolicyBytes(
  policy: PusakaV2PolicyInput,
  ownerPkh?: Uint8Array | string,
): NormalizedPusakaV2Policy {
  if (
    !Number.isInteger(policy.inactivityPeriodSeconds) ||
    policy.inactivityPeriodSeconds <= 0 ||
    policy.inactivityPeriodSeconds >= MAX_INT32
  ) {
    throw new Error(
      `inactivityPeriodSeconds must be positive uint31; got ${policy.inactivityPeriodSeconds}`,
    );
  }

  let reviewSeq: Bip68SequenceEncoding;
  if (policy.reviewSequence !== undefined) {
    const decoded = decodeBip68TimeSequence(policy.reviewSequence);
    if (decoded.disabled || !decoded.isTimeBased || decoded.units < 1) {
      throw new Error(
        `Invalid time-based BIP68 reviewSequence: ${policy.reviewSequence}`,
      );
    }
    reviewSeq = {
      sequence: policy.reviewSequence >>> 0,
      units: decoded.units,
      effectiveSeconds: decoded.effectiveSeconds,
      requestedSeconds: policy.reviewPeriodSeconds ?? decoded.effectiveSeconds,
    };
  } else if (policy.reviewPeriodSeconds !== undefined) {
    reviewSeq = encodeReviewDurationToBip68Sequence(policy.reviewPeriodSeconds);
  } else {
    throw new Error(
      "Either reviewPeriodSeconds or reviewSequence must be specified in policy",
    );
  }

  const feeBudget = BigInt(policy.feeBudget ?? DEFAULT_FEE_BUDGET);
  if (feeBudget < MIN_FEE_BUDGET || feeBudget > MAX_FEE_BUDGET) {
    throw new Error(
      `feeBudget must be between ${MIN_FEE_BUDGET} and ${MAX_FEE_BUDGET}; got ${feeBudget}`,
    );
  }

  if (policy.contacts.length !== 3) {
    throw new Error(
      `Expected exactly 3 registered trusted contacts; got ${policy.contacts.length}`,
    );
  }
  const contacts = [
    toBytes20(policy.contacts[0]),
    toBytes20(policy.contacts[1]),
    toBytes20(policy.contacts[2]),
  ] as [Uint8Array, Uint8Array, Uint8Array];
  const contactHexes = contacts.map((c) => binToHex(c));
  if (new Set(contactHexes).size !== 3) {
    throw new Error(
      "All 3 registered trusted contacts must be pairwise distinct",
    );
  }
  if (ownerPkh !== undefined) {
    const ownerHex = binToHex(toBytes20(ownerPkh));
    if (contactHexes.includes(ownerHex)) {
      throw new Error(
        "Registered trusted contacts must be distinct from the owner",
      );
    }
  }

  if (policy.heirs.length < 1 || policy.heirs.length > MAX_HEIRS) {
    throw new Error(
      `Plan requires between 1 and ${MAX_HEIRS} heirs; got ${policy.heirs.length}`,
    );
  }

  const heirs = policy.heirs.map((h, idx) => {
    const pkh = toBytes20(h.pkh);
    const share = BigInt(h.share);
    if (share <= 0n || share >= BigInt(MAX_INT32)) {
      throw new Error(
        `Heir ${idx} share must be positive signed 32-bit int; got ${share}`,
      );
    }
    return { pkh, share, label: h.label };
  });

  const totalShares = heirs.reduce((s, h) => s + h.share, 0n);
  if (totalShares <= 0n || totalShares >= BigInt(MAX_INT32)) {
    throw new Error(
      `totalShares must fit positive signed 32-bit int; got ${totalShares}`,
    );
  }

  const totalLen = 77 + heirs.length * 24;
  const policyBytes = new Uint8Array(totalLen);
  policyBytes.set(numberToBinUint32LE(policy.inactivityPeriodSeconds), 0);
  policyBytes.set(numberToBinUint32LE(reviewSeq.sequence), 4);
  policyBytes.set(numberToBinUint32LE(Number(feeBudget)), 8);
  policyBytes.set(contacts[0], 12);
  policyBytes.set(contacts[1], 32);
  policyBytes.set(contacts[2], 52);
  policyBytes.set(numberToBinUint32LE(Number(totalShares)), 72);
  policyBytes[76] = heirs.length;

  heirs.forEach((heir, i) => {
    const offset = 77 + i * 24;
    policyBytes.set(heir.pkh, offset);
    policyBytes.set(numberToBinUint32LE(Number(heir.share)), offset + 20);
  });

  const policyHashBytes = hash256(policyBytes);
  return {
    inactivityPeriodSeconds: policy.inactivityPeriodSeconds,
    reviewSequence: reviewSeq.sequence,
    reviewUnits: reviewSeq.units,
    effectiveReviewSeconds: reviewSeq.effectiveSeconds,
    feeBudget,
    contacts,
    totalShares,
    heirs,
    policyBytes,
    policyBytesHex: binToHex(policyBytes),
    policyHashBytes,
    policyHashHex: binToHex(policyHashBytes),
  };
}

export function decodePolicyBytes(
  policyBytesOrHex: string | Uint8Array,
): NormalizedPusakaV2Policy {
  const bytes =
    typeof policyBytesOrHex === "string"
      ? hexToBin(policyBytesOrHex)
      : policyBytesOrHex;
  if (bytes.length < 101 || bytes.length > 317) {
    throw new Error(
      `Invalid policyBytes length ${bytes.length}; expected 101..317`,
    );
  }
  const inactivityPeriodSeconds = binToNumberUint32LE(bytes.slice(0, 4));
  const reviewSequence = binToNumberUint32LE(bytes.slice(4, 8));
  const feeBudget = BigInt(binToNumberUint32LE(bytes.slice(8, 12)));
  const c0 = bytes.slice(12, 32);
  const c1 = bytes.slice(32, 52);
  const c2 = bytes.slice(52, 72);
  const totalShares = BigInt(binToNumberUint32LE(bytes.slice(72, 76)));
  const heirCount = bytes[76];
  if (
    heirCount < 1 ||
    heirCount > MAX_HEIRS ||
    bytes.length !== 77 + heirCount * 24
  ) {
    throw new Error(
      `Policy heirCount (${heirCount}) mismatches length (${bytes.length})`,
    );
  }

  const heirs: PusakaV2HeirInput[] = [];
  for (let i = 0; i < heirCount; i++) {
    const off = 77 + i * 24;
    heirs.push({
      pkh: bytes.slice(off, off + 20),
      share: BigInt(binToNumberUint32LE(bytes.slice(off + 20, off + 24))),
    });
  }

  const normalized = encodePolicyBytes({
    inactivityPeriodSeconds,
    reviewSequence,
    feeBudget,
    contacts: [c0, c1, c2],
    heirs,
  });
  if (normalized.totalShares !== totalShares) {
    throw new Error(
      `Encoded totalShares (${totalShares}) != sum of heir shares (${normalized.totalShares})`,
    );
  }
  return normalized;
}

export function encodePlanStateCommitment(params: {
  status: PlanStatusCode;
  round: number;
  approvalsMask: number;
  deadline: number;
  inactivityPeriodSeconds: number;
  policyHashBytes: Uint8Array;
}): Uint8Array {
  if (
    !Number.isInteger(params.round) ||
    params.round < 0 ||
    params.round >= MAX_INT32
  ) {
    throw new Error(`Invalid round ${params.round}`);
  }
  if (
    !Number.isInteger(params.approvalsMask) ||
    params.approvalsMask < 0 ||
    params.approvalsMask > 7
  ) {
    throw new Error(`Invalid approvalsMask ${params.approvalsMask}`);
  }
  if (!Number.isInteger(params.deadline) || params.deadline < 0) {
    throw new Error(`Invalid deadline ${params.deadline}`);
  }
  if (
    !Number.isInteger(params.inactivityPeriodSeconds) ||
    params.inactivityPeriodSeconds <= 0
  ) {
    throw new Error(
      `Invalid inactivityPeriodSeconds ${params.inactivityPeriodSeconds}`,
    );
  }
  if (params.policyHashBytes.length !== 32) {
    throw new Error(
      `Expected 32-byte policyHash; got ${params.policyHashBytes.length}`,
    );
  }

  const out = new Uint8Array(PLAN_COMMITMENT_BYTES);
  out[0] = PLAN_COMMITMENT_VERSION;
  out[1] = params.status;
  out.set(numberToBinUint32LE(params.round), 2);
  out[6] = params.approvalsMask;
  out.set(writeUint64LE(params.deadline), 7);
  out.set(numberToBinUint32LE(params.inactivityPeriodSeconds), 15);
  out.set(params.policyHashBytes, 19);
  return out;
}

export function decodePlanStateCommitment(
  commitmentHexOrBytes: string | Uint8Array,
): PusakaV2CommitmentState {
  const bytes =
    typeof commitmentHexOrBytes === "string"
      ? hexToBin(commitmentHexOrBytes)
      : commitmentHexOrBytes;
  if (bytes.length !== PLAN_COMMITMENT_BYTES) {
    throw new Error(
      `Invalid PusakaV2 commitment length ${bytes.length}; expected ${PLAN_COMMITMENT_BYTES}`,
    );
  }
  const version = bytes[0];
  if (version !== PLAN_COMMITMENT_VERSION) {
    throw new Error(
      `Unsupported PusakaV2 commitment version 0x${version.toString(16)}`,
    );
  }
  const statusByte = bytes[1];
  if (
    statusByte !== PLAN_STATUS_ACTIVE &&
    statusByte !== PLAN_STATUS_REVIEW &&
    statusByte !== PLAN_STATUS_PAID_OUT &&
    statusByte !== PLAN_STATUS_CLOSED
  ) {
    throw new Error(
      `Invalid PusakaV2 status byte 0x${statusByte.toString(16)}`,
    );
  }
  const statusCode = statusByte as PlanStatusCode;
  const round = binToNumberUint32LE(bytes.slice(2, 6));
  const approvalsMask = bytes[6];
  const approvedContactIndices = [0, 1, 2].filter(
    (idx) => (approvalsMask & (1 << idx)) !== 0,
  );
  const deadline = Number(readUint64LE(bytes.slice(7, 15)));
  const inactivityPeriodSeconds = binToNumberUint32LE(bytes.slice(15, 19));
  const policyHashHex = binToHex(bytes.slice(19, 51));

  return {
    version,
    statusCode,
    status: statusCodeToName(statusCode),
    round,
    approvalsMask,
    approvedContactIndices,
    deadline,
    inactivityPeriodSeconds,
    policyHashHex,
  };
}

export function encodeAnchorCommitment(
  round: number,
  reviewSequence: number,
): Uint8Array {
  if (!Number.isInteger(round) || round <= 0 || round >= MAX_INT32) {
    throw new Error(`Invalid anchor round ${round}`);
  }
  const decoded = decodeBip68TimeSequence(reviewSequence);
  if (decoded.disabled || !decoded.isTimeBased || decoded.units < 1) {
    throw new Error(`Invalid BIP68 reviewSequence ${reviewSequence}`);
  }
  const out = new Uint8Array(ANCHOR_COMMITMENT_BYTES);
  out.set(numberToBinUint32LE(round), 0);
  out.set(numberToBinUint32LE(reviewSequence), 4);
  return out;
}

export function decodeAnchorCommitment(
  commitmentHexOrBytes: string | Uint8Array,
): PusakaV2AnchorCommitment {
  const bytes =
    typeof commitmentHexOrBytes === "string"
      ? hexToBin(commitmentHexOrBytes)
      : commitmentHexOrBytes;
  if (bytes.length !== ANCHOR_COMMITMENT_BYTES) {
    throw new Error(
      `Invalid PusakaV2Anchor commitment length ${bytes.length}; expected ${ANCHOR_COMMITMENT_BYTES}`,
    );
  }
  return {
    round: binToNumberUint32LE(bytes.slice(0, 4)),
    reviewSequence: binToNumberUint32LE(bytes.slice(4, 8)),
  };
}

function contractLockingBytes(contract: Contract): Uint8Array {
  return (contract.lockingBytecode as unknown) instanceof Uint8Array
    ? (contract.lockingBytecode as unknown as Uint8Array)
    : hexToBin(contract.lockingBytecode);
}

export function instantiatePusakaV2Contracts(params: {
  protocolRevision?: "assets-1";
  provider: NetworkProvider;
  planCategoryHex: string;
  ownerPkh: Uint8Array | string;
  perInputFeeCap?: bigint;
}): PusakaV2Contracts {
  const planCategoryVmBytes = categoryDisplayHexToVmBytes(
    params.planCategoryHex,
  );
  const ownerPkh = toBytes20(params.ownerPkh);
  const perInputFeeCap = params.perInputFeeCap ?? DEFAULT_PER_INPUT_FEE_CAP;

  const anchor = new Contract(
    PUSAKA_V2_ANCHOR_ARTIFACT,
    [planCategoryVmBytes, ownerPkh],
    { provider: params.provider, addressType: "p2sh32" },
  );
  const anchorLockingBytecode = contractLockingBytes(anchor);
  if (anchorLockingBytecode.length !== 35) {
    throw new Error(
      `Expected 35-byte P2SH32 anchor lock; got ${anchorLockingBytecode.length}`,
    );
  }

  const plan = new Contract(
    params.protocolRevision === "assets-1"
      ? (assetPlanArtifact as Artifact)
      : PUSAKA_V2_PLAN_ARTIFACT,
    [planCategoryVmBytes, ownerPkh, anchorLockingBytecode],
    { provider: params.provider, addressType: "p2sh32" },
  );
  const planLockingBytecode = contractLockingBytes(plan);
  if (planLockingBytecode.length !== 35) {
    throw new Error(
      `Expected 35-byte P2SH32 plan lock; got ${planLockingBytecode.length}`,
    );
  }

  const inbox = new Contract(
    PUSAKA_V2_INBOX_ARTIFACT,
    [planCategoryVmBytes, planLockingBytecode, perInputFeeCap],
    { provider: params.provider, addressType: "p2sh32" },
  );
  const inboxLockingBytecode = contractLockingBytes(inbox);
  if (inboxLockingBytecode.length !== 35) {
    throw new Error(
      `Expected 35-byte P2SH32 inbox lock; got ${inboxLockingBytecode.length}`,
    );
  }

  return {
    provider: params.provider,
    network: params.provider.network,
    protocolRevision: params.protocolRevision,
    planCategoryHex: params.planCategoryHex,
    planCategoryVmBytes,
    ownerPkh,
    perInputFeeCap,
    anchor,
    plan,
    inbox,
    anchorLockingBytecode,
    planLockingBytecode,
    inboxLockingBytecode,
    planAddress: plan.tokenAddress,
    anchorAddress: anchor.tokenAddress,
    inboxAddress: inbox.address,
  };
}

export function buildPusakaV2Metadata(params: {
  contracts: PusakaV2Contracts;
  policy: NormalizedPusakaV2Policy;
  createdAtLocktime: number;
}): PusakaV2PlanMetadata {
  const { contracts, policy, createdAtLocktime } = params;
  return {
    version: PUSAKA_V2_VERSION,
    ...(contracts.protocolRevision
      ? { protocolRevision: contracts.protocolRevision }
      : {}),
    network: contracts.network,
    planCategoryHex: contracts.planCategoryHex,
    ownerPkhHex: binToHex(contracts.ownerPkh),
    planAddress: contracts.planAddress,
    planLockHex: binToHex(contracts.planLockingBytecode),
    anchorAddress: contracts.anchorAddress,
    anchorLockHex: binToHex(contracts.anchorLockingBytecode),
    inboxAddress: contracts.inboxAddress,
    inboxLockHex: binToHex(contracts.inboxLockingBytecode),
    perInputFeeCap: contracts.perInputFeeCap.toString(),
    policyBytesHex: policy.policyBytesHex,
    policyHashHex: policy.policyHashHex,
    createdAtLocktime,
    inactivityPeriodSeconds: policy.inactivityPeriodSeconds,
    reviewSequence: policy.reviewSequence,
    reviewUnits: policy.reviewUnits,
    effectiveReviewSeconds: policy.effectiveReviewSeconds,
    feeBudget: policy.feeBudget.toString(),
    contacts: [
      binToHex(policy.contacts[0]),
      binToHex(policy.contacts[1]),
      binToHex(policy.contacts[2]),
    ],
    totalShares: policy.totalShares.toString(),
    heirs: policy.heirs.map((h) => ({
      pkhHex: binToHex(h.pkh),
      share: h.share.toString(),
      ...(h.label !== undefined ? { label: h.label } : {}),
    })),
  };
}

export function updateMetadataWithPolicy(
  prev: PusakaV2PlanMetadata,
  newPolicyInput: PusakaV2PolicyInput,
): { metadata: PusakaV2PlanMetadata; policy: NormalizedPusakaV2Policy } {
  const policy = encodePolicyBytes(newPolicyInput, hexToBin(prev.ownerPkhHex));
  return {
    policy,
    metadata: {
      ...prev,
      policyBytesHex: policy.policyBytesHex,
      policyHashHex: policy.policyHashHex,
      inactivityPeriodSeconds: policy.inactivityPeriodSeconds,
      reviewSequence: policy.reviewSequence,
      reviewUnits: policy.reviewUnits,
      effectiveReviewSeconds: policy.effectiveReviewSeconds,
      feeBudget: policy.feeBudget.toString(),
      contacts: [
        binToHex(policy.contacts[0]),
        binToHex(policy.contacts[1]),
        binToHex(policy.contacts[2]),
      ],
      totalShares: policy.totalShares.toString(),
      heirs: policy.heirs.map((h) => ({
        pkhHex: binToHex(h.pkh),
        share: h.share.toString(),
        ...(h.label !== undefined ? { label: h.label } : {}),
      })),
    },
  };
}

function verifyMetadataFieldsMatchPolicy(
  metadata: PusakaV2PlanMetadata,
): NormalizedPusakaV2Policy {
  const policy = decodePolicyBytes(metadata.policyBytesHex);
  if (policy.policyHashHex !== metadata.policyHashHex) {
    throw new Error(
      `Metadata corruption: policyHash (${metadata.policyHashHex}) != hash256(policyBytes) (${policy.policyHashHex})`,
    );
  }
  if (policy.inactivityPeriodSeconds !== metadata.inactivityPeriodSeconds) {
    throw new Error(
      "Metadata inactivityPeriodSeconds disagrees with policyBytes",
    );
  }
  if (policy.reviewSequence !== metadata.reviewSequence) {
    throw new Error("Metadata reviewSequence disagrees with policyBytes");
  }
  if (policy.reviewUnits !== metadata.reviewUnits) {
    throw new Error("Metadata reviewUnits disagrees with policyBytes");
  }
  if (policy.effectiveReviewSeconds !== metadata.effectiveReviewSeconds) {
    throw new Error(
      "Metadata effectiveReviewSeconds disagrees with policyBytes",
    );
  }
  if (policy.feeBudget.toString() !== metadata.feeBudget) {
    throw new Error("Metadata feeBudget disagrees with policyBytes");
  }
  if (policy.totalShares.toString() !== metadata.totalShares) {
    throw new Error("Metadata totalShares disagrees with policyBytes");
  }
  const ownerHex = binToHex(toBytes20(metadata.ownerPkhHex));
  const cHexes = policy.contacts.map((c) => binToHex(c));
  if (cHexes.includes(ownerHex)) {
    throw new Error("Metadata policy contains owner PKH as a trusted contact");
  }
  if (
    cHexes[0] !== metadata.contacts[0] ||
    cHexes[1] !== metadata.contacts[1] ||
    cHexes[2] !== metadata.contacts[2]
  ) {
    throw new Error("Metadata contacts disagree with policyBytes");
  }
  if (policy.heirs.length !== metadata.heirs.length) {
    throw new Error("Metadata heirs count disagrees with policyBytes");
  }
  for (let i = 0; i < policy.heirs.length; i++) {
    if (
      binToHex(policy.heirs[i].pkh) !== metadata.heirs[i].pkhHex ||
      policy.heirs[i].share.toString() !== metadata.heirs[i].share
    ) {
      throw new Error(`Metadata heir ${i} disagrees with policyBytes`);
    }
    policy.heirs[i].label = metadata.heirs[i].label;
  }
  return policy;
}

/**
 * Reconstruct a Pusaka v2 plan handle from versioned JSON metadata in a fresh session.
 * Fails closed on tampered addresses, policy hash mismatches, or stale policy metadata.
 */
export async function attachPusakaV2Plan(
  metadataOrJson: PusakaV2PlanMetadata | string,
  runner: NetworkProvider | Signer,
  options: { verifyOnChain?: boolean } = {},
): Promise<PusakaV2PlanHandle> {
  const metadata = readV2Metadata(
    typeof metadataOrJson === "string"
      ? JSON.parse(metadataOrJson)
      : metadataOrJson,
  );

  const policy = verifyMetadataFieldsMatchPolicy(metadata);
  // A caller may use the same SDK version from another package installation.
  const provider = (
    runner instanceof Signer || "provider" in runner ? runner.provider : runner
  ) as NetworkProvider;
  if (metadata.network !== provider.network) {
    throw new Error(
      `Metadata network (${metadata.network}) differs from provider network (${provider.network})`,
    );
  }
  const contracts = instantiatePusakaV2Contracts({
    provider,
    planCategoryHex: metadata.planCategoryHex,
    ownerPkh: metadata.ownerPkhHex,
    perInputFeeCap: BigInt(metadata.perInputFeeCap),
    protocolRevision: metadata.protocolRevision,
  });

  if (
    binToHex(contracts.anchorLockingBytecode) !== metadata.anchorLockHex ||
    contracts.anchorAddress !== metadata.anchorAddress
  ) {
    throw new Error(
      "Metadata mismatch: derived PusakaV2Anchor locking script or address does not match",
    );
  }
  if (
    binToHex(contracts.planLockingBytecode) !== metadata.planLockHex ||
    contracts.planAddress !== metadata.planAddress
  ) {
    throw new Error(
      "Metadata mismatch: derived PusakaV2Plan locking script or address does not match",
    );
  }
  if (
    binToHex(contracts.inboxLockingBytecode) !== metadata.inboxLockHex ||
    contracts.inboxAddress !== metadata.inboxAddress
  ) {
    throw new Error(
      "Metadata mismatch: derived PusakaV2Inbox locking script or address does not match",
    );
  }

  const handle: PusakaV2PlanHandle = {
    metadata,
    policy,
    contracts,
    provider,
  };

  if (options.verifyOnChain !== false) {
    const state = await discoverPusakaV2State(handle);
    if (state.planUtxo && !state.policyMatchesMetadata) {
      throw new PolicyHashMismatchError(
        metadata.policyHashHex,
        state.onChainPolicyHashHex ?? "<missing>",
      );
    }
  }

  return handle;
}

export async function discoverPusakaV2State(
  handleOrContracts: PusakaV2PlanHandle | PusakaV2Contracts,
  expectedPolicyHashHex?: string,
): Promise<DiscoveredPusakaV2State> {
  const contracts =
    "contracts" in handleOrContracts
      ? handleOrContracts.contracts
      : handleOrContracts;
  const targetPolicyHash =
    expectedPolicyHashHex ??
    ("metadata" in handleOrContracts
      ? handleOrContracts.metadata.policyHashHex
      : undefined);

  const [planUtxos, anchorUtxos, rawInboxUtxos] = await Promise.all([
    contracts.provider.getUtxos(contracts.planAddress),
    contracts.provider.getUtxos(contracts.anchorAddress),
    contracts.provider.getUtxos(contracts.inboxAddress),
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
  const inboxUtxos = rawInboxUtxos.filter((u) => !u.token);
  const inboxJunkTokenUtxos = rawInboxUtxos.filter((u) => !!u.token);
  const inboxBalanceSats = inboxUtxos.reduce((s, u) => s + u.satoshis, 0n);

  let anchorRound: number | undefined;
  let anchorSequence: number | undefined;
  if (anchorUtxo?.token?.nft) {
    try {
      const dec = decodeAnchorCommitment(anchorUtxo.token.nft.commitment);
      anchorRound = dec.round;
      anchorSequence = dec.reviewSequence;
    } catch {
      anchorRound = undefined;
      anchorSequence = undefined;
    }
  }

  if (!planUtxo || !planUtxo.token?.nft) {
    return {
      status: "UNINITIALIZED",
      planBalanceSats: 0n,
      spendableBalanceSats: 0n,
      round: 0,
      approvalsMask: 0,
      approvedContactIndices: [],
      deadline: 0,
      inactivityPeriodSeconds: 0,
      policyMatchesMetadata: false,
      anchorUtxo,
      anchorBalanceSats: anchorUtxo?.satoshis ?? 0n,
      anchorRound,
      anchorSequence,
      anchorMatchesRound: false,
      inboxUtxos,
      inboxJunkTokenUtxos,
      inboxBalanceSats,
      totalCoveredBalanceSats: inboxBalanceSats,
    };
  }

  const decoded = decodePlanStateCommitment(planUtxo.token.nft.commitment);
  const spendableBalanceSats =
    planUtxo.satoshis > MIN_PLAN_CARRIER_SATS
      ? planUtxo.satoshis - MIN_PLAN_CARRIER_SATS
      : 0n;

  return {
    status: decoded.status,
    statusCode: decoded.statusCode,
    round: decoded.round,
    approvalsMask: decoded.approvalsMask,
    approvedContactIndices: decoded.approvedContactIndices,
    deadline: decoded.deadline,
    inactivityPeriodSeconds: decoded.inactivityPeriodSeconds,
    onChainPolicyHashHex: decoded.policyHashHex,
    policyMatchesMetadata:
      targetPolicyHash === undefined
        ? true
        : decoded.policyHashHex === targetPolicyHash,
    planUtxo,
    planBalanceSats: planUtxo.satoshis,
    spendableBalanceSats,
    anchorUtxo,
    anchorBalanceSats: anchorUtxo?.satoshis ?? 0n,
    anchorRound,
    anchorSequence,
    anchorMatchesRound:
      anchorRound !== undefined && anchorRound === decoded.round,
    inboxUtxos,
    inboxJunkTokenUtxos,
    inboxBalanceSats,
    totalCoveredBalanceSats: planUtxo.satoshis + inboxBalanceSats,
  };
}

/**
 * Wrap a Signer to sort plain UTXOs descending by value and exclude coins smaller than
 * `minSats` whenever at least one well-funded plain coin exists.
 */
export function withFundedPlainUtxoPreference(
  signer: Signer,
  minSats = 5_000n,
): Signer {
  const wrapped: Signer = Object.create(signer);
  wrapped.getUtxos = async () => {
    const utxos = await signer.getUtxos();
    const plain = utxos
      .filter((u) => !u.token)
      .sort((a, b) =>
        b.satoshis > a.satoshis ? 1 : b.satoshis < a.satoshis ? -1 : 0,
      );
    const tokens = utxos.filter((u) => !!u.token);
    const funded = plain.filter((u) => u.satoshis >= minSats);
    return [...(funded.length > 0 ? funded : plain), ...tokens];
  };
  return wrapped;
}

export function pickFundedPlainUtxo(utxos: Utxo[], minSats: bigint): Utxo {
  const sorted = utxos
    .filter((u) => !u.token && u.satoshis >= minSats)
    .sort((a, b) =>
      b.satoshis > a.satoshis ? 1 : b.satoshis < a.satoshis ? -1 : 0,
    );
  if (sorted.length === 0) {
    const maxAvail = utxos
      .filter((u) => !u.token)
      .reduce((m, u) => (u.satoshis > m ? u.satoshis : m), 0n);
    throw new Error(
      `No plain BCH UTXO with >= ${minSats} sats (largest available: ${maxAvail} sats)`,
    );
  }
  return sorted[0];
}

/**
 * Build and apply any `Signer.external` / `bch_signTransaction` signatures on a
 * `TransactionBuilder`, returning finalized broadcast-ready hex (for both Chipnet and
 * `StrictBip68ChainVerifier`).
 */
export async function finalizeBuilderTxHex(
  builder: TransactionBuilder,
): Promise<string> {
  const { transaction, sourceOutputs } = builder.buildLibauthProgram();
  const signed = await applyExternalSignatures(
    builder.inputs.map((i) => i.unlocker),
    transaction,
    sourceOutputs,
  );
  const raw = encodeTransaction(signed);
  const decoded = decodeTransactionBch(raw);
  if (typeof decoded === "string") {
    throw new Error(`Finalized transaction failed decode check: ${decoded}`);
  }
  return binToHex(raw);
}

function measureExactFee(
  buildFn: (fee: bigint) => TransactionBuilder,
  feePerByte = 1n,
  feeMargin = 20n,
): bigint {
  const probe1 = buildFn(500n);
  const f1 = BigInt(probe1.getTransactionSize()) * feePerByte + feeMargin;
  const probe2 = buildFn(f1);
  const f2 = BigInt(probe2.getTransactionSize()) * feePerByte + feeMargin;
  return f2 > f1 ? f2 : f1;
}

export function buildGenesisV2PlanTx(params: {
  protocolRevision?: "assets-1";
  provider: NetworkProvider;
  genesisUtxo: Utxo;
  ownerUnlocker: Unlocker;
  ownerAddress: string;
  ownerPkh: Uint8Array | string;
  policy: PusakaV2PolicyInput;
  createdAtLocktime: number;
  initialDepositSats?: bigint;
  perInputFeeCap?: bigint;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  handle: PusakaV2PlanHandle;
  metadata: PusakaV2PlanMetadata;
  policy: NormalizedPusakaV2Policy;
  contracts: PusakaV2Contracts;
  builder: TransactionBuilder;
  fee: bigint;
} {
  if (params.genesisUtxo.vout !== 0) {
    throw new Error(
      `CashTokens genesis requires input 0 with vout === 0; got ${params.genesisUtxo.vout}`,
    );
  }
  if (params.genesisUtxo.token) {
    throw new Error("Genesis UTXO must be plain BCH without tokens");
  }
  if (
    !Number.isInteger(params.createdAtLocktime) ||
    params.createdAtLocktime < MIN_CLTV_TIMESTAMP
  ) {
    throw new Error(
      `createdAtLocktime must be unix timestamp >= ${MIN_CLTV_TIMESTAMP}; got ${params.createdAtLocktime}`,
    );
  }

  const ownerPkh = toBytes20(params.ownerPkh);
  const policy = encodePolicyBytes(params.policy, ownerPkh);
  const contracts = instantiatePusakaV2Contracts({
    provider: params.provider,
    planCategoryHex: params.genesisUtxo.txid,
    protocolRevision: params.protocolRevision,
    ownerPkh,
    perInputFeeCap: params.perInputFeeCap,
  });

  const planSats = params.initialDepositSats ?? MIN_PLAN_CARRIER_SATS;
  if (planSats < MIN_PLAN_CARRIER_SATS) {
    throw new Error(
      `initialDepositSats must be >= ${MIN_PLAN_CARRIER_SATS}; got ${planSats}`,
    );
  }

  const initialCommitment = binToHex(
    encodePlanStateCommitment({
      status: PLAN_STATUS_ACTIVE,
      round: 0,
      approvalsMask: 0,
      deadline: checkedDeadline(
        params.createdAtLocktime,
        policy.inactivityPeriodSeconds,
      ),
      inactivityPeriodSeconds: policy.inactivityPeriodSeconds,
      policyHashBytes: policy.policyHashBytes,
    }),
  );

  const buildTx = (fee: bigint) => {
    const builder = new TransactionBuilder({ provider: params.provider })
      .addInput(params.genesisUtxo, params.ownerUnlocker)
      .addOutput({
        to: contracts.planAddress,
        amount: planSats,
        token: {
          category: contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: initialCommitment,
          },
        },
      });
    const change = params.genesisUtxo.satoshis - planSats - fee;
    if (change < 0n) {
      throw new Error(
        `Genesis UTXO (${params.genesisUtxo.satoshis} sats) cannot cover deposit ${planSats} + fee ${fee}`,
      );
    }
    if (change >= P2PKH_DUST_SATS) {
      builder.addOutput({ to: params.ownerAddress, amount: change });
    }
    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  const builder = buildTx(fee);
  const metadata = buildPusakaV2Metadata({
    contracts,
    policy,
    createdAtLocktime: params.createdAtLocktime,
  });

  return {
    handle: { metadata, policy, contracts, provider: params.provider },
    metadata,
    policy,
    contracts,
    builder,
    fee,
  };
}

export function buildSweepInboxTx(params: {
  handle: PusakaV2PlanHandle | PusakaV2Contracts;
  planUtxo: Utxo;
  inboxUtxos: Utxo[];
  mode?: "auto" | "self" | "sponsored";
  sponsorUtxo?: Utxo;
  sponsorUnlocker?: Unlocker;
  sponsorChangeAddress?: string;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  mode: "self" | "sponsored";
  inboxSatsSwept: bigint;
  planSatsAfter: bigint;
  fee: bigint;
} {
  const contracts =
    "contracts" in params.handle ? params.handle.contracts : params.handle;
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing PusakaV2 state NFT");
  }
  const plainInbox = params.inboxUtxos.filter((u) => !u.token);
  if (plainInbox.length === 0) {
    throw new Error("No tokenless inbox UTXOs provided to sweep");
  }
  if (plainInbox.length > MAX_INBOX_SWEEP_INPUTS) {
    throw new Error(
      `Sweep at most ${MAX_INBOX_SWEEP_INPUTS} inbox inputs per transaction; split into batches`,
    );
  }
  const inboxSatsSwept = plainInbox.reduce((s, u) => s + u.satoshis, 0n);

  let mode: "self" | "sponsored";
  if (params.mode === "self") {
    mode = "self";
  } else if (params.mode === "sponsored") {
    if (!params.sponsorUtxo || !params.sponsorUnlocker) {
      throw new Error(
        "Sponsored sweep requires sponsorUtxo and sponsorUnlocker",
      );
    }
    mode = "sponsored";
  } else {
    mode = params.sponsorUtxo && params.sponsorUnlocker ? "sponsored" : "self";
  }

  const commitment = params.planUtxo.token.nft.commitment;
  if (mode === "self") {
    const buildSelf = (fee: bigint) => {
      const nextPlanSats = params.planUtxo.satoshis + inboxSatsSwept - fee;
      const builder = new TransactionBuilder({
        provider: contracts.provider,
      }).addInput(params.planUtxo, contracts.plan.unlock.deposit());
      for (const u of plainInbox) {
        builder.addInput(u, contracts.inbox.unlock.sweep());
      }
      builder.addOutput({
        to: contracts.planAddress,
        amount: nextPlanSats,
        token: {
          category: contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment,
          },
        },
      });
      return builder;
    };

    const fee =
      params.fee ??
      measureExactFee(buildSelf, params.feePerByte, params.feeMargin);
    const maxCap = 3300n + BigInt(plainInbox.length) * contracts.perInputFeeCap;
    if (fee > maxCap) {
      throw new Error(`Self-sweep fee ${fee} exceeds covenant cap ${maxCap}`);
    }
    const planSatsAfter = params.planUtxo.satoshis + inboxSatsSwept - fee;
    if (planSatsAfter < params.planUtxo.satoshis) {
      throw new Error(
        `Inbox sats (${inboxSatsSwept}) insufficient to cover self-sweep fee (${fee}); use sponsored sweep`,
      );
    }
    return {
      builder: buildSelf(fee),
      mode: "self",
      inboxSatsSwept,
      planSatsAfter,
      fee,
    };
  }

  const sponsorUtxo = params.sponsorUtxo!;
  const sponsorUnlocker = params.sponsorUnlocker!;
  const planSatsAfter = params.planUtxo.satoshis + inboxSatsSwept;

  const buildSponsored = (fee: bigint) => {
    const builder = new TransactionBuilder({
      provider: contracts.provider,
    }).addInput(params.planUtxo, contracts.plan.unlock.deposit());
    for (const u of plainInbox) {
      builder.addInput(u, contracts.inbox.unlock.sweep());
    }
    builder.addInput(sponsorUtxo, sponsorUnlocker).addOutput({
      to: contracts.planAddress,
      amount: planSatsAfter,
      token: {
        category: contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment,
        },
      },
    });
    const change = sponsorUtxo.satoshis - fee;
    if (change < 0n) {
      throw new Error(
        `Sponsor UTXO (${sponsorUtxo.satoshis}) cannot cover sweep fee ${fee}`,
      );
    }
    if (change >= P2PKH_DUST_SATS) {
      if (!params.sponsorChangeAddress) {
        throw new Error(
          "sponsorChangeAddress required when sponsor change >= dust",
        );
      }
      builder.addOutput({ to: params.sponsorChangeAddress, amount: change });
    }
    return builder;
  };

  const fee =
    params.fee ??
    measureExactFee(buildSponsored, params.feePerByte, params.feeMargin);
  return {
    builder: buildSponsored(fee),
    mode: "sponsored",
    inboxSatsSwept,
    planSatsAfter,
    fee,
  };
}

export function buildDepositDirectTx(params: {
  handle: PusakaV2PlanHandle | PusakaV2Contracts;
  planUtxo: Utxo;
  fundingUtxo: Utxo;
  fundingUnlocker: Unlocker;
  depositSats: bigint;
  changeAddress?: string;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): { builder: TransactionBuilder; fee: bigint } {
  const contracts =
    "contracts" in params.handle ? params.handle.contracts : params.handle;
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing state NFT");
  }
  if (params.depositSats <= 0n) {
    throw new Error(`depositSats must be > 0; got ${params.depositSats}`);
  }
  const commitment = params.planUtxo.token.nft.commitment;
  const nextPlanSats = params.planUtxo.satoshis + params.depositSats;

  const buildTx = (fee: bigint) => {
    const builder = new TransactionBuilder({ provider: contracts.provider })
      .addInput(params.planUtxo, contracts.plan.unlock.deposit())
      .addInput(params.fundingUtxo, params.fundingUnlocker)
      .addOutput({
        to: contracts.planAddress,
        amount: nextPlanSats,
        token: {
          category: contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment,
          },
        },
      });
    const change = params.fundingUtxo.satoshis - params.depositSats - fee;
    if (change < 0n) {
      throw new Error(
        `Funding UTXO (${params.fundingUtxo.satoshis}) insufficient for deposit ${params.depositSats} + fee ${fee}`,
      );
    }
    if (change >= P2PKH_DUST_SATS) {
      if (!params.changeAddress) {
        throw new Error(
          "changeAddress required when deposit produces >= dust change",
        );
      }
      builder.addOutput({ to: params.changeAddress, amount: change });
    }
    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  return { builder: buildTx(fee), fee };
}

export function checkedDeadline(
  locktime: number,
  periodSeconds: number,
): number {
  const deadline = locktime + periodSeconds;
  if (
    !Number.isInteger(locktime) ||
    locktime < MIN_CLTV_TIMESTAMP ||
    !Number.isInteger(periodSeconds) ||
    periodSeconds <= 0 ||
    !Number.isSafeInteger(deadline) ||
    deadline > MAX_CLTV_TIMESTAMP
  ) {
    throw new Error("Deadline must fit the 32-bit timestamp locktime range");
  }
  return deadline;
}

function computeRolledDeadline(
  currentDeadline: number,
  locktime: number,
  periodSeconds: number,
): number {
  const candidate = checkedDeadline(locktime, periodSeconds);
  return candidate > currentDeadline ? candidate : currentDeadline;
}

function normalizeOwnerUtxos(
  params: { ownerUtxo?: Utxo; ownerUtxos?: Utxo[] },
  planUtxo: Utxo,
  anchorUtxo?: Utxo,
): Utxo[] {
  if (params.ownerUtxo !== undefined && params.ownerUtxos !== undefined) {
    throw new Error("Provide either ownerUtxos or ownerUtxo, not both");
  }
  const raw = params.ownerUtxos ?? (params.ownerUtxo ? [params.ownerUtxo] : []);
  if (raw.length === 0) {
    throw new Error(
      "At least one ordinary owner UTXO is required for co-spend authorization",
    );
  }
  const planKey = `${planUtxo.txid}:${planUtxo.vout}`;
  const anchorKey = anchorUtxo
    ? `${anchorUtxo.txid}:${anchorUtxo.vout}`
    : undefined;
  const seen = new Set<string>();
  for (const u of raw) {
    if (u.token) {
      throw new Error(
        `Owner co-spend UTXO ${u.txid}:${u.vout} must be plain BCH without tokens`,
      );
    }
    if (u.satoshis <= 0n) {
      throw new Error(
        `Owner co-spend UTXO ${u.txid}:${u.vout} must have positive satoshis`,
      );
    }
    const key = `${u.txid}:${u.vout}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate owner UTXO provided: ${key}`);
    }
    if (key === planKey || (anchorKey && key === anchorKey)) {
      throw new Error(
        `Owner UTXO ${key} cannot duplicate planUtxo or anchorUtxo`,
      );
    }
    seen.add(key);
  }
  return raw;
}

function assertOwnerChangeMatchesOwnerPkh(
  ownerChangeAddress: string,
  ownerPkh: Uint8Array,
): void {
  const expectedLockHex = binToHex(p2pkhLockingBytecode(ownerPkh));
  const actualLockHex = binToHex(resolveLockingBytecode(ownerChangeAddress));
  if (actualLockHex !== expectedLockHex) {
    throw new Error(
      "Protected fee funding requires ownerChangeAddress to lock to the plan owner PKH",
    );
  }
}

interface ResolvedOwnerFeePlan {
  feeFundingSource: OwnerFeeFundingSource;
  ownerFeeSats: bigint;
  protectedFeeSats: bigint;
  anchorFeeCreditSats: bigint;
  ownerChangeSats: bigint;
  planSatsAfter: bigint;
}

function resolveOwnerFeePlan(params: {
  action: "send" | "checkIn" | "cancelClaim" | "updatePolicy";
  fee: bigint;
  mode: OwnerFeeFundingMode;
  basePlanSats: bigint;
  ownerCoinsTotal: bigint;
  anchorSats: bigint;
  reclaimAnchorIntoPlan: boolean;
  authCoinReserveSats: bigint;
  allowBurnAuthCoin: boolean;
}): ResolvedOwnerFeePlan {
  const {
    action,
    fee,
    mode,
    basePlanSats,
    ownerCoinsTotal,
    anchorSats,
    reclaimAnchorIntoPlan,
    authCoinReserveSats,
    allowBurnAuthCoin,
  } = params;
  if (fee < 0n) {
    throw new Error(`Fee must be non-negative; got ${fee}`);
  }

  const anchorFeeCreditSats = !reclaimAnchorIntoPlan ? anchorSats : 0n;
  const planBeforeFee =
    basePlanSats + (reclaimAnchorIntoPlan ? anchorSats : 0n);
  const carrierHeadroom =
    planBeforeFee > MIN_PLAN_CARRIER_SATS
      ? planBeforeFee - MIN_PLAN_CARRIER_SATS
      : 0n;
  const covenantHeadroom = planBeforeFee - (basePlanSats - MAX_OWNER_TX_FEE);
  const maxPlanContribution =
    carrierHeadroom < covenantHeadroom ? carrierHeadroom : covenantHeadroom;

  const neededAfterAnchor =
    fee > anchorFeeCreditSats ? fee - anchorFeeCreditSats : 0n;
  const surplusAnchor =
    anchorFeeCreditSats > fee ? anchorFeeCreditSats - fee : 0n;

  if (mode === "owner") {
    const ownerChangeSats = ownerCoinsTotal + anchorFeeCreditSats - fee;
    if (ownerChangeSats < 0n) {
      throw new Error(
        `Owner UTXOs (${ownerCoinsTotal}${anchorFeeCreditSats > 0n ? ` + anchor ${anchorFeeCreditSats}` : ""}) insufficient for ${action} fee ${fee}`,
      );
    }
    if (!allowBurnAuthCoin && ownerChangeSats < P2PKH_DUST_SATS) {
      throw new Error(
        `Owner change (${ownerChangeSats} sats) is below dust (${P2PKH_DUST_SATS} sats) and would consume the last owner auth coin; use feeFunding: 'auto' or 'protected' or add ordinary funds`,
      );
    }
    return {
      feeFundingSource: "owner",
      ownerFeeSats: neededAfterAnchor,
      protectedFeeSats: 0n,
      anchorFeeCreditSats,
      ownerChangeSats,
      planSatsAfter: planBeforeFee,
    };
  }

  if (mode === "protected") {
    if (neededAfterAnchor > carrierHeadroom) {
      throw new Error(
        `Protected balance (${planBeforeFee}) insufficient for ${action} fee ${neededAfterAnchor} above ${MIN_PLAN_CARRIER_SATS}-sat carrier`,
      );
    }
    if (neededAfterAnchor > covenantHeadroom) {
      throw new Error(
        `Protected ${action} fee (${neededAfterAnchor}) exceeds covenant upper bound (${MAX_OWNER_TX_FEE})`,
      );
    }
    const ownerChangeSats = ownerCoinsTotal + surplusAnchor;
    if (!allowBurnAuthCoin && ownerChangeSats < P2PKH_DUST_SATS) {
      throw new Error(
        `Owner auth coin (${ownerCoinsTotal} sats) is below dust (${P2PKH_DUST_SATS} sats) and cannot be returned intact`,
      );
    }
    return {
      feeFundingSource: "protected",
      ownerFeeSats: 0n,
      protectedFeeSats: neededAfterAnchor,
      anchorFeeCreditSats,
      ownerChangeSats,
      planSatsAfter: planBeforeFee - neededAfterAnchor,
    };
  }

  // mode === 'auto': preserve legacy owner-funded behavior whenever ordinary funds suffice
  // while keeping >= dust auth coin alive; otherwise pay fee from protected BCH.
  const ownerOnlyChange = ownerCoinsTotal + anchorFeeCreditSats - fee;
  if (ownerOnlyChange >= P2PKH_DUST_SATS) {
    return {
      feeFundingSource: "owner",
      ownerFeeSats: neededAfterAnchor,
      protectedFeeSats: 0n,
      anchorFeeCreditSats,
      ownerChangeSats: ownerOnlyChange,
      planSatsAfter: planBeforeFee,
    };
  }

  const protectedChange = ownerCoinsTotal + surplusAnchor;
  if (
    protectedChange >= P2PKH_DUST_SATS &&
    neededAfterAnchor <= maxPlanContribution
  ) {
    return {
      feeFundingSource: "protected",
      ownerFeeSats: 0n,
      protectedFeeSats: neededAfterAnchor,
      anchorFeeCreditSats,
      ownerChangeSats: protectedChange,
      planSatsAfter: planBeforeFee - neededAfterAnchor,
    };
  }

  const targetReserve =
    authCoinReserveSats >= P2PKH_DUST_SATS
      ? authCoinReserveSats
      : P2PKH_DUST_SATS;
  const reserve =
    ownerCoinsTotal >= targetReserve ? targetReserve : P2PKH_DUST_SATS;
  if (ownerCoinsTotal >= P2PKH_DUST_SATS) {
    const ownerContribution =
      ownerCoinsTotal > reserve ? ownerCoinsTotal - reserve : 0n;
    const shortfall =
      fee > ownerContribution + anchorFeeCreditSats
        ? fee - ownerContribution - anchorFeeCreditSats
        : 0n;
    if (shortfall > 0n && shortfall <= maxPlanContribution) {
      return {
        feeFundingSource: "hybrid",
        ownerFeeSats: ownerContribution,
        protectedFeeSats: shortfall,
        anchorFeeCreditSats,
        ownerChangeSats: reserve,
        planSatsAfter: planBeforeFee - shortfall,
      };
    }
  }

  if (allowBurnAuthCoin && ownerOnlyChange >= 0n) {
    return {
      feeFundingSource: "owner",
      ownerFeeSats: neededAfterAnchor,
      protectedFeeSats: 0n,
      anchorFeeCreditSats,
      ownerChangeSats: ownerOnlyChange,
      planSatsAfter: planBeforeFee,
    };
  }

  throw new Error(
    `Owner UTXOs (${ownerCoinsTotal} sats) and protected balance (${carrierHeadroom} spendable sats) insufficient for ${action} fee ${fee} while preserving ${P2PKH_DUST_SATS}-sat auth coin`,
  );
}

export function buildSendTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  anchorUtxo?: Utxo;
  ownerUtxo?: Utxo;
  ownerUtxos?: Utxo[];
  ownerUnlocker: Unlocker;
  ownerChangeAddress: string;
  recipientAddressOrLock: string | Uint8Array;
  amount: bigint;
  locktime: number;
  reclaimAnchorIntoPlan?: boolean;
  feeFunding?: OwnerFeeFundingMode;
  authCoinReserveSats?: bigint;
  allowBurnAuthCoin?: boolean;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  cancelledReview: boolean;
  nextRound: number;
  nextDeadline: number;
  planSatsAfter: bigint;
  fee: bigint;
  feeFundingSource: OwnerFeeFundingSource;
  ownerFeeSats: bigint;
  protectedFeeSats: bigint;
  anchorFeeCreditSats: bigint;
  ownerChangeSats: bigint;
} {
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing state NFT");
  }
  if (
    !Number.isInteger(params.locktime) ||
    params.locktime < MIN_CLTV_TIMESTAMP
  ) {
    throw new Error(
      `locktime must be unix timestamp >= ${MIN_CLTV_TIMESTAMP}; got ${params.locktime}`,
    );
  }
  const current = decodePlanStateCommitment(
    params.planUtxo.token.nft.commitment,
  );
  if (
    current.statusCode !== PLAN_STATUS_ACTIVE &&
    current.statusCode !== PLAN_STATUS_REVIEW
  ) {
    throw new Error(
      `Cannot send from status ${current.status}; expected ACTIVE or REVIEW`,
    );
  }
  const inReview = current.statusCode === PLAN_STATUS_REVIEW;
  if (inReview && !params.anchorUtxo) {
    throw new Error(
      "anchorUtxo is required to send during REVIEW (atomic cancel)",
    );
  }
  if (params.amount < P2PKH_DUST_SATS) {
    throw new Error(
      `Send amount (${params.amount}) below dust (${P2PKH_DUST_SATS})`,
    );
  }

  const ownerUtxos = normalizeOwnerUtxos(
    params,
    params.planUtxo,
    params.anchorUtxo,
  );
  const ownerCoinsTotal = ownerUtxos.reduce((s, u) => s + u.satoshis, 0n);

  const spendable = params.planUtxo.satoshis - MIN_PLAN_CARRIER_SATS;
  if (params.amount > spendable) {
    throw new Error(
      `Insufficient spendable protected balance: need ${params.amount}, have ${spendable}`,
    );
  }

  const recipientLock = resolveLockingBytecode(params.recipientAddressOrLock);
  const recipientCashAddr = lockToCashAddress(
    recipientLock,
    params.handle.contracts.network,
    false,
  );
  const nextRound = current.round + 1;
  const nextDeadline = computeRolledDeadline(
    current.deadline,
    params.locktime,
    current.inactivityPeriodSeconds,
  );
  const nextCommitment = binToHex(
    encodePlanStateCommitment({
      status: PLAN_STATUS_ACTIVE,
      round: nextRound,
      approvalsMask: 0,
      deadline: nextDeadline,
      inactivityPeriodSeconds: current.inactivityPeriodSeconds,
      policyHashBytes: hexToBin(current.policyHashHex),
    }),
  );

  const reclaim = params.reclaimAnchorIntoPlan ?? false;
  const anchorSats = inReview ? params.anchorUtxo!.satoshis : 0n;
  const basePlanSats = params.planUtxo.satoshis - params.amount;
  const feeFundingMode = params.feeFunding ?? "auto";
  const authCoinReserveSats =
    params.authCoinReserveSats ?? DEFAULT_AUTH_COIN_RESERVE_SATS;
  const allowBurnAuthCoin = params.allowBurnAuthCoin ?? false;

  const planForFee = (fee: bigint) =>
    resolveOwnerFeePlan({
      action: "send",
      fee,
      mode: feeFundingMode,
      basePlanSats,
      ownerCoinsTotal,
      anchorSats,
      reclaimAnchorIntoPlan: reclaim,
      authCoinReserveSats,
      allowBurnAuthCoin,
    });

  const buildTx = (fee: bigint) => {
    const plan = planForFee(fee);
    if (
      plan.planSatsAfter < basePlanSats &&
      plan.ownerChangeSats >= P2PKH_DUST_SATS
    ) {
      assertOwnerChangeMatchesOwnerPkh(
        params.ownerChangeAddress,
        params.handle.contracts.ownerPkh,
      );
    }
    const builder = new TransactionBuilder({
      provider: params.handle.provider,
      allowImplicitNftBurn: inReview,
    });
    builder.addInput(
      params.planUtxo,
      params.handle.contracts.plan.unlock.send(recipientLock, params.amount),
    );
    if (inReview) {
      builder.addInput(
        params.anchorUtxo!,
        params.handle.contracts.anchor.unlock.cancel(),
      );
    }
    for (const u of ownerUtxos) {
      builder.addInput(u, params.ownerUnlocker);
    }

    builder
      .addOutput({
        to: params.handle.contracts.planAddress,
        amount: plan.planSatsAfter,
        token: {
          category: params.handle.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: nextCommitment,
          },
        },
      })
      .addOutput({
        to: recipientCashAddr,
        amount: params.amount,
      });

    if (plan.ownerChangeSats >= P2PKH_DUST_SATS) {
      builder.addOutput({
        to: params.ownerChangeAddress,
        amount: plan.ownerChangeSats,
      });
    }
    builder.setLocktime(params.locktime);
    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  const accounting = planForFee(fee);
  return {
    builder: buildTx(fee),
    cancelledReview: inReview,
    nextRound,
    nextDeadline,
    planSatsAfter: accounting.planSatsAfter,
    fee,
    feeFundingSource: accounting.feeFundingSource,
    ownerFeeSats: accounting.ownerFeeSats,
    protectedFeeSats: accounting.protectedFeeSats,
    anchorFeeCreditSats: accounting.anchorFeeCreditSats,
    ownerChangeSats:
      accounting.ownerChangeSats >= P2PKH_DUST_SATS
        ? accounting.ownerChangeSats
        : 0n,
  };
}

export function buildCheckInTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  anchorUtxo?: Utxo;
  ownerUtxo?: Utxo;
  ownerUtxos?: Utxo[];
  ownerUnlocker: Unlocker;
  ownerChangeAddress: string;
  locktime: number;
  reclaimAnchorIntoPlan?: boolean;
  feeFunding?: OwnerFeeFundingMode;
  authCoinReserveSats?: bigint;
  allowBurnAuthCoin?: boolean;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  cancelledReview: boolean;
  nextRound: number;
  nextDeadline: number;
  planSatsAfter: bigint;
  fee: bigint;
  feeFundingSource: OwnerFeeFundingSource;
  ownerFeeSats: bigint;
  protectedFeeSats: bigint;
  anchorFeeCreditSats: bigint;
  ownerChangeSats: bigint;
} {
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing state NFT");
  }
  if (
    !Number.isInteger(params.locktime) ||
    params.locktime < MIN_CLTV_TIMESTAMP
  ) {
    throw new Error(
      `locktime must be unix timestamp >= ${MIN_CLTV_TIMESTAMP}; got ${params.locktime}`,
    );
  }
  const current = decodePlanStateCommitment(
    params.planUtxo.token.nft.commitment,
  );
  if (
    current.statusCode !== PLAN_STATUS_ACTIVE &&
    current.statusCode !== PLAN_STATUS_REVIEW &&
    current.statusCode !== PLAN_STATUS_CLOSED
  ) {
    throw new Error(`Cannot checkIn from status ${current.status}`);
  }
  const inReview = current.statusCode === PLAN_STATUS_REVIEW;
  if (inReview && !params.anchorUtxo) {
    throw new Error("anchorUtxo required to checkIn during REVIEW");
  }

  const ownerUtxos = normalizeOwnerUtxos(
    params,
    params.planUtxo,
    params.anchorUtxo,
  );
  const ownerCoinsTotal = ownerUtxos.reduce((s, u) => s + u.satoshis, 0n);

  const nextRound = current.round + 1;
  const nextDeadline = computeRolledDeadline(
    current.deadline,
    params.locktime,
    current.inactivityPeriodSeconds,
  );
  const nextCommitment = binToHex(
    encodePlanStateCommitment({
      status: PLAN_STATUS_ACTIVE,
      round: nextRound,
      approvalsMask: 0,
      deadline: nextDeadline,
      inactivityPeriodSeconds: current.inactivityPeriodSeconds,
      policyHashBytes: hexToBin(current.policyHashHex),
    }),
  );

  const reclaim = params.reclaimAnchorIntoPlan ?? false;
  const anchorSats = inReview ? params.anchorUtxo!.satoshis : 0n;
  const basePlanSats = params.planUtxo.satoshis;
  const feeFundingMode = params.feeFunding ?? "auto";
  const authCoinReserveSats =
    params.authCoinReserveSats ?? DEFAULT_AUTH_COIN_RESERVE_SATS;
  const allowBurnAuthCoin = params.allowBurnAuthCoin ?? false;

  const planForFee = (fee: bigint) =>
    resolveOwnerFeePlan({
      action: "checkIn",
      fee,
      mode: feeFundingMode,
      basePlanSats,
      ownerCoinsTotal,
      anchorSats,
      reclaimAnchorIntoPlan: reclaim,
      authCoinReserveSats,
      allowBurnAuthCoin,
    });

  const buildTx = (fee: bigint) => {
    const plan = planForFee(fee);
    if (
      plan.planSatsAfter < basePlanSats &&
      plan.ownerChangeSats >= P2PKH_DUST_SATS
    ) {
      assertOwnerChangeMatchesOwnerPkh(
        params.ownerChangeAddress,
        params.handle.contracts.ownerPkh,
      );
    }
    const builder = new TransactionBuilder({
      provider: params.handle.provider,
      allowImplicitNftBurn: inReview,
    });
    builder.addInput(
      params.planUtxo,
      params.handle.contracts.plan.unlock.checkIn(),
    );
    if (inReview) {
      builder.addInput(
        params.anchorUtxo!,
        params.handle.contracts.anchor.unlock.cancel(),
      );
    }
    for (const u of ownerUtxos) {
      builder.addInput(u, params.ownerUnlocker);
    }

    builder.addOutput({
      to: params.handle.contracts.planAddress,
      amount: plan.planSatsAfter,
      token: {
        category: params.handle.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: nextCommitment,
        },
      },
    });

    if (plan.ownerChangeSats >= P2PKH_DUST_SATS) {
      builder.addOutput({
        to: params.ownerChangeAddress,
        amount: plan.ownerChangeSats,
      });
    }
    builder.setLocktime(params.locktime);
    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  const accounting = planForFee(fee);
  return {
    builder: buildTx(fee),
    cancelledReview: inReview,
    nextRound,
    nextDeadline,
    planSatsAfter: accounting.planSatsAfter,
    fee,
    feeFundingSource: accounting.feeFundingSource,
    ownerFeeSats: accounting.ownerFeeSats,
    protectedFeeSats: accounting.protectedFeeSats,
    anchorFeeCreditSats: accounting.anchorFeeCreditSats,
    ownerChangeSats:
      accounting.ownerChangeSats >= P2PKH_DUST_SATS
        ? accounting.ownerChangeSats
        : 0n,
  };
}

export function buildCancelClaimTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  anchorUtxo: Utxo;
  ownerUtxo?: Utxo;
  ownerUtxos?: Utxo[];
  ownerUnlocker: Unlocker;
  ownerChangeAddress: string;
  locktime: number;
  reclaimAnchorIntoPlan?: boolean;
  feeFunding?: OwnerFeeFundingMode;
  authCoinReserveSats?: bigint;
  allowBurnAuthCoin?: boolean;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  nextRound: number;
  nextDeadline: number;
  planSatsAfter: bigint;
  fee: bigint;
  feeFundingSource: OwnerFeeFundingSource;
  ownerFeeSats: bigint;
  protectedFeeSats: bigint;
  anchorFeeCreditSats: bigint;
  ownerChangeSats: bigint;
} {
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing state NFT");
  }
  if (
    !Number.isInteger(params.locktime) ||
    params.locktime < MIN_CLTV_TIMESTAMP
  ) {
    throw new Error(
      `locktime must be unix timestamp >= ${MIN_CLTV_TIMESTAMP}; got ${params.locktime}`,
    );
  }
  const current = decodePlanStateCommitment(
    params.planUtxo.token.nft.commitment,
  );
  if (current.statusCode !== PLAN_STATUS_REVIEW) {
    throw new Error(
      `Cannot cancelClaim from status ${current.status}; expected REVIEW`,
    );
  }

  const ownerUtxos = normalizeOwnerUtxos(
    params,
    params.planUtxo,
    params.anchorUtxo,
  );
  const ownerCoinsTotal = ownerUtxos.reduce((s, u) => s + u.satoshis, 0n);

  const nextRound = current.round + 1;
  const nextDeadline = computeRolledDeadline(
    current.deadline,
    params.locktime,
    current.inactivityPeriodSeconds,
  );
  const nextCommitment = binToHex(
    encodePlanStateCommitment({
      status: PLAN_STATUS_ACTIVE,
      round: nextRound,
      approvalsMask: 0,
      deadline: nextDeadline,
      inactivityPeriodSeconds: current.inactivityPeriodSeconds,
      policyHashBytes: hexToBin(current.policyHashHex),
    }),
  );

  const reclaim = params.reclaimAnchorIntoPlan ?? false;
  const anchorSats = params.anchorUtxo.satoshis;
  const basePlanSats = params.planUtxo.satoshis;
  const feeFundingMode = params.feeFunding ?? "auto";
  const authCoinReserveSats =
    params.authCoinReserveSats ?? DEFAULT_AUTH_COIN_RESERVE_SATS;
  const allowBurnAuthCoin = params.allowBurnAuthCoin ?? false;

  const planForFee = (fee: bigint) =>
    resolveOwnerFeePlan({
      action: "cancelClaim",
      fee,
      mode: feeFundingMode,
      basePlanSats,
      ownerCoinsTotal,
      anchorSats,
      reclaimAnchorIntoPlan: reclaim,
      authCoinReserveSats,
      allowBurnAuthCoin,
    });

  const buildTx = (fee: bigint) => {
    const plan = planForFee(fee);
    if (
      plan.planSatsAfter < basePlanSats &&
      plan.ownerChangeSats >= P2PKH_DUST_SATS
    ) {
      assertOwnerChangeMatchesOwnerPkh(
        params.ownerChangeAddress,
        params.handle.contracts.ownerPkh,
      );
    }
    const builder = new TransactionBuilder({
      provider: params.handle.provider,
      allowImplicitNftBurn: true,
    })
      .addInput(
        params.planUtxo,
        params.handle.contracts.plan.unlock.cancelClaim(),
      )
      .addInput(
        params.anchorUtxo,
        params.handle.contracts.anchor.unlock.cancel(),
      );
    for (const u of ownerUtxos) {
      builder.addInput(u, params.ownerUnlocker);
    }
    builder.addOutput({
      to: params.handle.contracts.planAddress,
      amount: plan.planSatsAfter,
      token: {
        category: params.handle.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: nextCommitment,
        },
      },
    });

    if (plan.ownerChangeSats >= P2PKH_DUST_SATS) {
      builder.addOutput({
        to: params.ownerChangeAddress,
        amount: plan.ownerChangeSats,
      });
    }
    builder.setLocktime(params.locktime);
    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  const accounting = planForFee(fee);
  return {
    builder: buildTx(fee),
    nextRound,
    nextDeadline,
    planSatsAfter: accounting.planSatsAfter,
    fee,
    feeFundingSource: accounting.feeFundingSource,
    ownerFeeSats: accounting.ownerFeeSats,
    protectedFeeSats: accounting.protectedFeeSats,
    anchorFeeCreditSats: accounting.anchorFeeCreditSats,
    ownerChangeSats:
      accounting.ownerChangeSats >= P2PKH_DUST_SATS
        ? accounting.ownerChangeSats
        : 0n,
  };
}

export function buildUpdatePolicyTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  anchorUtxo?: Utxo;
  ownerUtxo?: Utxo;
  ownerUtxos?: Utxo[];
  ownerUnlocker: Unlocker;
  ownerChangeAddress: string;
  newPolicy: PusakaV2PolicyInput;
  locktime: number;
  reclaimAnchorIntoPlan?: boolean;
  feeFunding?: OwnerFeeFundingMode;
  authCoinReserveSats?: bigint;
  allowBurnAuthCoin?: boolean;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  nextHandle: PusakaV2PlanHandle;
  nextMetadata: PusakaV2PlanMetadata;
  nextPolicy: NormalizedPusakaV2Policy;
  cancelledReview: boolean;
  nextRound: number;
  nextDeadline: number;
  planSatsAfter: bigint;
  fee: bigint;
  feeFundingSource: OwnerFeeFundingSource;
  ownerFeeSats: bigint;
  protectedFeeSats: bigint;
  anchorFeeCreditSats: bigint;
  ownerChangeSats: bigint;
} {
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing state NFT");
  }
  if (
    !Number.isInteger(params.locktime) ||
    params.locktime < MIN_CLTV_TIMESTAMP
  ) {
    throw new Error(
      `locktime must be unix timestamp >= ${MIN_CLTV_TIMESTAMP}; got ${params.locktime}`,
    );
  }
  const current = decodePlanStateCommitment(
    params.planUtxo.token.nft.commitment,
  );
  if (
    current.statusCode !== PLAN_STATUS_ACTIVE &&
    current.statusCode !== PLAN_STATUS_REVIEW
  ) {
    throw new Error(`Cannot updatePolicy from status ${current.status}`);
  }
  const inReview = current.statusCode === PLAN_STATUS_REVIEW;
  if (inReview && !params.anchorUtxo) {
    throw new Error("anchorUtxo required to updatePolicy during REVIEW");
  }

  const ownerUtxos = normalizeOwnerUtxos(
    params,
    params.planUtxo,
    params.anchorUtxo,
  );
  const ownerCoinsTotal = ownerUtxos.reduce((s, u) => s + u.satoshis, 0n);

  const { metadata: nextMetadata, policy: nextPolicy } =
    updateMetadataWithPolicy(params.handle.metadata, params.newPolicy);
  const nextRound = current.round + 1;
  const nextDeadline = checkedDeadline(
    params.locktime,
    nextPolicy.inactivityPeriodSeconds,
  );
  const nextCommitment = binToHex(
    encodePlanStateCommitment({
      status: PLAN_STATUS_ACTIVE,
      round: nextRound,
      approvalsMask: 0,
      deadline: nextDeadline,
      inactivityPeriodSeconds: nextPolicy.inactivityPeriodSeconds,
      policyHashBytes: nextPolicy.policyHashBytes,
    }),
  );

  const reclaim = params.reclaimAnchorIntoPlan ?? false;
  const anchorSats = inReview ? params.anchorUtxo!.satoshis : 0n;
  const basePlanSats = params.planUtxo.satoshis;
  const feeFundingMode = params.feeFunding ?? "auto";
  const authCoinReserveSats =
    params.authCoinReserveSats ?? DEFAULT_AUTH_COIN_RESERVE_SATS;
  const allowBurnAuthCoin = params.allowBurnAuthCoin ?? false;

  const planForFee = (fee: bigint) =>
    resolveOwnerFeePlan({
      action: "updatePolicy",
      fee,
      mode: feeFundingMode,
      basePlanSats,
      ownerCoinsTotal,
      anchorSats,
      reclaimAnchorIntoPlan: reclaim,
      authCoinReserveSats,
      allowBurnAuthCoin,
    });

  const buildTx = (fee: bigint) => {
    const plan = planForFee(fee);
    if (
      plan.planSatsAfter < basePlanSats &&
      plan.ownerChangeSats >= P2PKH_DUST_SATS
    ) {
      assertOwnerChangeMatchesOwnerPkh(
        params.ownerChangeAddress,
        params.handle.contracts.ownerPkh,
      );
    }
    const builder = new TransactionBuilder({
      provider: params.handle.provider,
      allowImplicitNftBurn: inReview,
    });
    builder.addInput(
      params.planUtxo,
      params.handle.contracts.plan.unlock.updatePolicy(nextPolicy.policyBytes),
    );
    if (inReview) {
      builder.addInput(
        params.anchorUtxo!,
        params.handle.contracts.anchor.unlock.cancel(),
      );
    }
    for (const u of ownerUtxos) {
      builder.addInput(u, params.ownerUnlocker);
    }

    builder.addOutput({
      to: params.handle.contracts.planAddress,
      amount: plan.planSatsAfter,
      token: {
        category: params.handle.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: nextCommitment,
        },
      },
    });

    if (plan.ownerChangeSats >= P2PKH_DUST_SATS) {
      builder.addOutput({
        to: params.ownerChangeAddress,
        amount: plan.ownerChangeSats,
      });
    }
    builder.setLocktime(params.locktime);
    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  const accounting = planForFee(fee);
  const nextHandle: PusakaV2PlanHandle = {
    metadata: nextMetadata,
    policy: nextPolicy,
    contracts: params.handle.contracts,
    provider: params.handle.provider,
  };

  return {
    builder: buildTx(fee),
    nextHandle,
    nextMetadata,
    nextPolicy,
    cancelledReview: inReview,
    nextRound,
    nextDeadline,
    planSatsAfter: accounting.planSatsAfter,
    fee,
    feeFundingSource: accounting.feeFundingSource,
    ownerFeeSats: accounting.ownerFeeSats,
    protectedFeeSats: accounting.protectedFeeSats,
    anchorFeeCreditSats: accounting.anchorFeeCreditSats,
    ownerChangeSats:
      accounting.ownerChangeSats >= P2PKH_DUST_SATS
        ? accounting.ownerChangeSats
        : 0n,
  };
}

export function buildOwnerExitTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  ownerUtxo?: Utxo;
  ownerUtxos?: Utxo[];
  ownerUnlocker: Unlocker;
  ownerAddress: string;
  locktime: number;
  allowBurnAuthCoin?: boolean;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  nextRound: number;
  nextDeadline: number;
  withdrawnSats: bigint;
  carrierSatsAfter: bigint;
  fee: bigint;
  feeFundingSource: OwnerFeeFundingSource;
  ownerFeeSats: bigint;
  protectedFeeSats: bigint;
  ownerChangeSats: bigint;
} {
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing state NFT");
  }
  if (
    !Number.isInteger(params.locktime) ||
    params.locktime < MIN_CLTV_TIMESTAMP
  ) {
    throw new Error(
      `locktime must be unix timestamp >= ${MIN_CLTV_TIMESTAMP}; got ${params.locktime}`,
    );
  }
  const current = decodePlanStateCommitment(
    params.planUtxo.token.nft.commitment,
  );
  if (
    current.statusCode !== PLAN_STATUS_ACTIVE &&
    current.statusCode !== PLAN_STATUS_CLOSED
  ) {
    throw new Error(
      `Cannot ownerExit from status ${current.status}; cancel pending REVIEW before exit`,
    );
  }

  const ownerUtxos = normalizeOwnerUtxos(params, params.planUtxo);
  const ownerCoinsTotal = ownerUtxos.reduce((s, u) => s + u.satoshis, 0n);
  const allowBurnAuthCoin = params.allowBurnAuthCoin ?? false;

  const nextRound = current.round + 1;
  const nextDeadline = computeRolledDeadline(
    current.deadline,
    params.locktime,
    current.inactivityPeriodSeconds,
  );
  const closedCommitment = binToHex(
    encodePlanStateCommitment({
      status: PLAN_STATUS_CLOSED,
      round: nextRound,
      approvalsMask: 0,
      deadline: nextDeadline,
      inactivityPeriodSeconds: current.inactivityPeriodSeconds,
      policyHashBytes: hexToBin(current.policyHashHex),
    }),
  );

  const spendablePlanSats =
    params.planUtxo.satoshis > MIN_PLAN_CARRIER_SATS
      ? params.planUtxo.satoshis - MIN_PLAN_CARRIER_SATS
      : 0n;

  const buildTx = (fee: bigint) => {
    const ownerPayout = spendablePlanSats + ownerCoinsTotal - fee;
    if (ownerPayout < 0n) {
      throw new Error(
        `Combined spendable (${spendablePlanSats + ownerCoinsTotal}) insufficient for fee ${fee}`,
      );
    }
    if (!allowBurnAuthCoin && ownerPayout < P2PKH_DUST_SATS) {
      throw new Error(
        `Exit payout (${ownerPayout} sats) is below dust (${P2PKH_DUST_SATS} sats) and would consume the owner auth coin`,
      );
    }
    const builder = new TransactionBuilder({
      provider: params.handle.provider,
    }).addInput(
      params.planUtxo,
      params.handle.contracts.plan.unlock.ownerExit(),
    );
    for (const u of ownerUtxos) {
      builder.addInput(u, params.ownerUnlocker);
    }
    builder.addOutput({
      to: params.handle.contracts.planAddress,
      amount: MIN_PLAN_CARRIER_SATS,
      token: {
        category: params.handle.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: closedCommitment,
        },
      },
    });
    if (ownerPayout >= P2PKH_DUST_SATS) {
      assertOwnerChangeMatchesOwnerPkh(
        params.ownerAddress,
        params.handle.contracts.ownerPkh,
      );
      builder.addOutput({ to: params.ownerAddress, amount: ownerPayout });
    }
    builder.setLocktime(params.locktime);
    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  const ownerPayout = spendablePlanSats + ownerCoinsTotal - fee;
  const protectedFeeSats = spendablePlanSats >= fee ? fee : spendablePlanSats;
  const ownerFeeSats = fee - protectedFeeSats;
  const feeFundingSource: OwnerFeeFundingSource =
    protectedFeeSats === fee
      ? "protected"
      : ownerFeeSats === fee
        ? "owner"
        : "hybrid";

  return {
    builder: buildTx(fee),
    nextRound,
    nextDeadline,
    withdrawnSats: ownerPayout,
    carrierSatsAfter: MIN_PLAN_CARRIER_SATS,
    fee,
    feeFundingSource,
    ownerFeeSats,
    protectedFeeSats,
    ownerChangeSats: ownerPayout >= P2PKH_DUST_SATS ? ownerPayout : 0n,
  };
}

export function buildContactApproveTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  contactIndexOrAddress: number | Uint8Array | string;
  contactUtxo: Utxo;
  contactUnlocker: Unlocker;
  contactChangeAddress: string;
  anchorSats?: bigint;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  contactIndex: number;
  enteredReview: boolean;
  nextRound: number;
  nextApprovalsMask: number;
  fee: bigint;
} {
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing state NFT");
  }
  const current = decodePlanStateCommitment(
    params.planUtxo.token.nft.commitment,
  );
  if (
    current.statusCode !== PLAN_STATUS_ACTIVE &&
    current.statusCode !== PLAN_STATUS_CLOSED
  ) {
    throw new Error(
      `Cannot contactApprove in status ${current.status}; expected ACTIVE or CLOSED`,
    );
  }
  if (
    current.statusCode === PLAN_STATUS_CLOSED &&
    params.planUtxo.satoshis <= MIN_PLAN_CARRIER_SATS
  ) {
    throw new Error(
      `Cannot open contact claim on empty CLOSED plan (balance ${params.planUtxo.satoshis} <= ${MIN_PLAN_CARRIER_SATS}-sat carrier)`,
    );
  }
  if (current.policyHashHex !== params.handle.policy.policyHashHex) {
    throw new PolicyHashMismatchError(
      params.handle.policy.policyHashHex,
      current.policyHashHex,
    );
  }

  let contactIndex: number;
  if (typeof params.contactIndexOrAddress === "number") {
    contactIndex = params.contactIndexOrAddress;
  } else {
    const pkhHex = binToHex(toBytes20(params.contactIndexOrAddress));
    contactIndex = params.handle.policy.contacts.findIndex(
      (c) => binToHex(c) === pkhHex,
    );
    if (contactIndex < 0) {
      throw new Error(
        `Address/PKH ${pkhHex} is not a registered trusted contact`,
      );
    }
  }
  if (contactIndex < 0 || contactIndex > 2) {
    throw new Error(`Invalid contactIndex ${contactIndex}`);
  }
  const bit = 1 << contactIndex;
  if ((current.approvalsMask & bit) !== 0) {
    throw new Error(
      `Contact ${contactIndex} already approved in round ${current.round}`,
    );
  }

  const enteredReview = current.approvalsMask !== 0;
  const anchorSats = params.anchorSats ?? MIN_ANCHOR_SATS;
  if (enteredReview && anchorSats < MIN_ANCHOR_SATS) {
    throw new Error(`anchorSats must be >= ${MIN_ANCHOR_SATS}`);
  }

  const nextRound = enteredReview ? current.round + 1 : current.round;
  const nextApprovalsMask = enteredReview ? 0 : bit;
  const nextCommitment = binToHex(
    encodePlanStateCommitment({
      status: enteredReview ? PLAN_STATUS_REVIEW : current.statusCode,
      round: nextRound,
      approvalsMask: nextApprovalsMask,
      deadline: current.deadline,
      inactivityPeriodSeconds: current.inactivityPeriodSeconds,
      policyHashBytes: params.handle.policy.policyHashBytes,
    }),
  );

  const buildTx = (fee: bigint) => {
    const builder = new TransactionBuilder({ provider: params.handle.provider })
      .addInput(
        params.planUtxo,
        params.handle.contracts.plan.unlock.contactApprove(
          BigInt(contactIndex),
          params.handle.policy.policyBytes,
        ),
      )
      .addInput(params.contactUtxo, params.contactUnlocker)
      .addOutput({
        to: params.handle.contracts.planAddress,
        amount: params.planUtxo.satoshis,
        token: {
          category: params.handle.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: nextCommitment,
          },
        },
      });

    if (enteredReview) {
      const anchorCommitment = binToHex(
        encodeAnchorCommitment(nextRound, params.handle.policy.reviewSequence),
      );
      builder.addOutput({
        to: params.handle.contracts.anchorAddress,
        amount: anchorSats,
        token: {
          category: params.handle.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.none,
            commitment: anchorCommitment,
          },
        },
      });
    }

    const contactCost = (enteredReview ? anchorSats : 0n) + fee;
    const change = params.contactUtxo.satoshis - contactCost;
    if (change < 0n) {
      throw new Error(
        `Contact UTXO (${params.contactUtxo.satoshis}) insufficient for ${enteredReview ? "anchor + fee" : "fee"} (${contactCost})`,
      );
    }
    if (change >= P2PKH_DUST_SATS) {
      builder.addOutput({ to: params.contactChangeAddress, amount: change });
    }
    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  return {
    builder: buildTx(fee),
    contactIndex,
    enteredReview,
    nextRound,
    nextApprovalsMask,
    fee,
  };
}

export function buildOpenClaimByInactivityTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  locktime: number;
  sponsorUtxo?: Utxo;
  sponsorUnlocker?: Unlocker;
  sponsorChangeAddress?: string;
  anchorSats?: bigint;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  nextRound: number;
  anchorSats: bigint;
  fee: bigint;
} {
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing state NFT");
  }
  const current = decodePlanStateCommitment(
    params.planUtxo.token.nft.commitment,
  );
  if (
    current.statusCode !== PLAN_STATUS_ACTIVE &&
    current.statusCode !== PLAN_STATUS_CLOSED
  ) {
    throw new Error(
      `Cannot openClaimByInactivity from status ${current.status}; expected ACTIVE or CLOSED`,
    );
  }
  if (
    current.statusCode === PLAN_STATUS_CLOSED &&
    params.planUtxo.satoshis <= MIN_PLAN_CARRIER_SATS
  ) {
    throw new Error(
      `Cannot open inactivity claim on empty CLOSED plan (balance ${params.planUtxo.satoshis} <= ${MIN_PLAN_CARRIER_SATS}-sat carrier)`,
    );
  }
  if (current.policyHashHex !== params.handle.policy.policyHashHex) {
    throw new PolicyHashMismatchError(
      params.handle.policy.policyHashHex,
      current.policyHashHex,
    );
  }
  if (params.locktime < current.deadline) {
    throw new Error(
      `locktime (${params.locktime}) < inactivity deadline (${current.deadline})`,
    );
  }

  const nextRound = current.round + 1;
  const anchorSats = params.anchorSats ?? MIN_ANCHOR_SATS;
  const nextCommitment = binToHex(
    encodePlanStateCommitment({
      status: PLAN_STATUS_REVIEW,
      round: nextRound,
      approvalsMask: 0,
      deadline: current.deadline,
      inactivityPeriodSeconds: current.inactivityPeriodSeconds,
      policyHashBytes: params.handle.policy.policyHashBytes,
    }),
  );
  const anchorCommitment = binToHex(
    encodeAnchorCommitment(nextRound, params.handle.policy.reviewSequence),
  );

  const sponsored = Boolean(params.sponsorUtxo);
  if (sponsored && !params.sponsorUnlocker) {
    throw new Error("sponsorUnlocker required when sponsorUtxo provided");
  }

  const buildTx = (fee: bigint) => {
    const builder = new TransactionBuilder({
      provider: params.handle.provider,
    }).addInput(
      params.planUtxo,
      params.handle.contracts.plan.unlock.openClaimByInactivity(
        params.handle.policy.policyBytes,
      ),
    );
    if (sponsored) {
      builder.addInput(params.sponsorUtxo!, params.sponsorUnlocker!);
    } else if (fee > params.handle.policy.feeBudget) {
      throw new Error(
        `Self-funded openClaim fee (${fee}) exceeds policy feeBudget (${params.handle.policy.feeBudget})`,
      );
    }

    const nextPlanSats = sponsored
      ? params.planUtxo.satoshis
      : params.planUtxo.satoshis - anchorSats - fee;
    if (nextPlanSats < MIN_PLAN_CARRIER_SATS) {
      throw new Error(
        `Plan balance (${params.planUtxo.satoshis}) too small for self-funded openClaim (left ${nextPlanSats} < ${MIN_PLAN_CARRIER_SATS})`,
      );
    }

    builder
      .addOutput({
        to: params.handle.contracts.planAddress,
        amount: nextPlanSats,
        token: {
          category: params.handle.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.minting,
            commitment: nextCommitment,
          },
        },
      })
      .addOutput({
        to: params.handle.contracts.anchorAddress,
        amount: anchorSats,
        token: {
          category: params.handle.contracts.planCategoryHex,
          amount: 0n,
          nft: {
            capability: NonFungibleTokenCapability.none,
            commitment: anchorCommitment,
          },
        },
      });

    if (sponsored) {
      const change = params.sponsorUtxo!.satoshis - anchorSats - fee;
      if (change < 0n) {
        throw new Error(
          `Sponsor UTXO (${params.sponsorUtxo!.satoshis}) insufficient for anchor + fee (${anchorSats + fee})`,
        );
      }
      if (change >= P2PKH_DUST_SATS) {
        if (!params.sponsorChangeAddress) {
          throw new Error(
            "sponsorChangeAddress required when sponsor change >= dust",
          );
        }
        builder.addOutput({ to: params.sponsorChangeAddress, amount: change });
      }
    }

    builder.setLocktime(params.locktime);
    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  return { builder: buildTx(fee), nextRound, anchorSats, fee };
}

export function buildFinalizeClaimTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  anchorUtxo: Utxo;
  sponsorUtxo?: Utxo;
  sponsorUnlocker?: Unlocker;
  sponsorChangeAddress?: string;
  anchorSequenceOverride?: number;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  heirPayouts: Array<{ pkhHex: string; address: string; amount: bigint }>;
  paidTotal: bigint;
  leftover: bigint;
  planCarrierAfter: bigint;
  fee: bigint;
} {
  if (!params.planUtxo.token?.nft || !params.anchorUtxo.token?.nft) {
    throw new Error("planUtxo and anchorUtxo must hold PusakaV2 NFTs");
  }
  const current = decodePlanStateCommitment(
    params.planUtxo.token.nft.commitment,
  );
  if (current.statusCode !== PLAN_STATUS_REVIEW) {
    throw new Error(
      `Cannot finalizeClaim from status ${current.status}; expected REVIEW`,
    );
  }
  if (current.policyHashHex !== params.handle.policy.policyHashHex) {
    throw new PolicyHashMismatchError(
      params.handle.policy.policyHashHex,
      current.policyHashHex,
    );
  }
  const anchorDec = decodeAnchorCommitment(
    params.anchorUtxo.token.nft.commitment,
  );
  if (anchorDec.round !== current.round) {
    throw new Error(
      `Anchor round (${anchorDec.round}) != plan round (${current.round})`,
    );
  }

  const sponsored = Boolean(params.sponsorUtxo);
  if (sponsored && !params.sponsorUnlocker) {
    throw new Error("sponsorUnlocker required when sponsorUtxo provided");
  }

  const vaultTotal = params.planUtxo.satoshis + params.anchorUtxo.satoshis;
  const pot = sponsored
    ? vaultTotal - MIN_PLAN_CARRIER_SATS
    : vaultTotal - MIN_PLAN_CARRIER_SATS - params.handle.policy.feeBudget;
  if (pot <= 0n) {
    throw new Error(
      `Insufficient vault balance (${vaultTotal}) for finalizeClaim payout`,
    );
  }
  const preview = computePolicyPayoutPreview(pot, params.handle.policy);

  const paidOutCommitment = binToHex(
    encodePlanStateCommitment({
      status: PLAN_STATUS_PAID_OUT,
      round: current.round,
      approvalsMask: 0,
      deadline: current.deadline,
      inactivityPeriodSeconds: current.inactivityPeriodSeconds,
      policyHashBytes: params.handle.policy.policyHashBytes,
    }),
  );

  const anchorSequence =
    params.anchorSequenceOverride ?? anchorDec.reviewSequence;
  const heirOutputs = params.handle.policy.heirs.map((h, i) => ({
    pkhHex: binToHex(h.pkh),
    address: p2pkhCashAddressFromPkh(h.pkh, params.handle.contracts.network),
    amount: preview.amounts[i],
  }));

  const buildTx = (fee: bigint) => {
    if (!sponsored && fee > params.handle.policy.feeBudget) {
      throw new Error(
        `Self-funded finalize fee (${fee}) exceeds policy feeBudget (${params.handle.policy.feeBudget})`,
      );
    }
    const carrierAfter = sponsored
      ? vaultTotal - preview.paidTotal
      : vaultTotal - preview.paidTotal - fee;
    if (carrierAfter < MIN_PLAN_CARRIER_SATS) {
      throw new Error(
        `Resulting plan carrier (${carrierAfter}) below minimum ${MIN_PLAN_CARRIER_SATS}`,
      );
    }

    const builder = new TransactionBuilder({
      provider: params.handle.provider,
      allowImplicitNftBurn: true,
    })
      .addInput(
        params.planUtxo,
        params.handle.contracts.plan.unlock.finalizeClaim(
          params.handle.policy.policyBytes,
        ),
      )
      .addInput(
        params.anchorUtxo,
        params.handle.contracts.anchor.unlock.finalize(),
        {
          sequence: anchorSequence,
        },
      );

    if (sponsored) {
      builder.addInput(params.sponsorUtxo!, params.sponsorUnlocker!);
    }

    builder.addOutput({
      to: params.handle.contracts.planAddress,
      amount: carrierAfter,
      token: {
        category: params.handle.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment: paidOutCommitment,
        },
      },
    });

    for (const h of heirOutputs) {
      builder.addOutput({ to: h.address, amount: h.amount });
    }

    if (sponsored) {
      const change = params.sponsorUtxo!.satoshis - fee;
      if (change < 0n) {
        throw new Error(
          `Sponsor UTXO (${params.sponsorUtxo!.satoshis}) insufficient for finalize fee ${fee}`,
        );
      }
      if (change >= P2PKH_DUST_SATS) {
        if (!params.sponsorChangeAddress) {
          throw new Error(
            "sponsorChangeAddress required when sponsor change >= dust",
          );
        }
        builder.addOutput({ to: params.sponsorChangeAddress, amount: change });
      }
    }

    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  const carrierAfter = sponsored
    ? vaultTotal - preview.paidTotal
    : vaultTotal - preview.paidTotal - fee;

  return {
    builder: buildTx(fee),
    heirPayouts: heirOutputs,
    paidTotal: preview.paidTotal,
    leftover: preview.leftover,
    planCarrierAfter: carrierAfter,
    fee,
  };
}

export function buildDistributeLateTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  sponsorUtxo?: Utxo;
  sponsorUnlocker?: Unlocker;
  sponsorChangeAddress?: string;
  feePerByte?: bigint;
  feeMargin?: bigint;
  fee?: bigint;
}): {
  builder: TransactionBuilder;
  heirPayouts: Array<{ pkhHex: string; address: string; amount: bigint }>;
  paidTotal: bigint;
  leftover: bigint;
  planCarrierAfter: bigint;
  fee: bigint;
} {
  if (!params.planUtxo.token?.nft) {
    throw new Error("planUtxo missing state NFT");
  }
  const current = decodePlanStateCommitment(
    params.planUtxo.token.nft.commitment,
  );
  if (current.statusCode !== PLAN_STATUS_PAID_OUT) {
    throw new Error(
      `Cannot distributeLate from status ${current.status}; expected PAID_OUT`,
    );
  }
  if (current.policyHashHex !== params.handle.policy.policyHashHex) {
    throw new PolicyHashMismatchError(
      params.handle.policy.policyHashHex,
      current.policyHashHex,
    );
  }

  const sponsored = Boolean(params.sponsorUtxo);
  if (sponsored && !params.sponsorUnlocker) {
    throw new Error("sponsorUnlocker required when sponsorUtxo provided");
  }

  const vaultTotal = params.planUtxo.satoshis;
  const pot = sponsored
    ? vaultTotal - MIN_PLAN_CARRIER_SATS
    : vaultTotal - MIN_PLAN_CARRIER_SATS - params.handle.policy.feeBudget;
  if (pot <= 0n) {
    throw new Error(
      `Insufficient PAID_OUT balance (${vaultTotal}) for late distribution`,
    );
  }
  const preview = computePolicyPayoutPreview(pot, params.handle.policy);
  const heirOutputs = params.handle.policy.heirs.map((h, i) => ({
    pkhHex: binToHex(h.pkh),
    address: p2pkhCashAddressFromPkh(h.pkh, params.handle.contracts.network),
    amount: preview.amounts[i],
  }));
  const commitment = params.planUtxo.token.nft.commitment;

  const buildTx = (fee: bigint) => {
    if (!sponsored && fee > params.handle.policy.feeBudget) {
      throw new Error(
        `Self-funded distributeLate fee (${fee}) exceeds policy feeBudget (${params.handle.policy.feeBudget})`,
      );
    }
    const carrierAfter = sponsored
      ? vaultTotal - preview.paidTotal
      : vaultTotal - preview.paidTotal - fee;
    if (carrierAfter < MIN_PLAN_CARRIER_SATS) {
      throw new Error(
        `Resulting plan carrier (${carrierAfter}) below minimum ${MIN_PLAN_CARRIER_SATS}`,
      );
    }

    const builder = new TransactionBuilder({
      provider: params.handle.provider,
    }).addInput(
      params.planUtxo,
      params.handle.contracts.plan.unlock.distributeLate(
        params.handle.policy.policyBytes,
      ),
    );
    if (sponsored) {
      builder.addInput(params.sponsorUtxo!, params.sponsorUnlocker!);
    }

    builder.addOutput({
      to: params.handle.contracts.planAddress,
      amount: carrierAfter,
      token: {
        category: params.handle.contracts.planCategoryHex,
        amount: 0n,
        nft: {
          capability: NonFungibleTokenCapability.minting,
          commitment,
        },
      },
    });

    for (const h of heirOutputs) {
      builder.addOutput({ to: h.address, amount: h.amount });
    }

    if (sponsored) {
      const change = params.sponsorUtxo!.satoshis - fee;
      if (change < 0n) {
        throw new Error(
          `Sponsor UTXO (${params.sponsorUtxo!.satoshis}) insufficient for fee ${fee}`,
        );
      }
      if (change >= P2PKH_DUST_SATS) {
        if (!params.sponsorChangeAddress) {
          throw new Error(
            "sponsorChangeAddress required when sponsor change >= dust",
          );
        }
        builder.addOutput({ to: params.sponsorChangeAddress, amount: change });
      }
    }

    return builder;
  };

  const fee =
    params.fee ?? measureExactFee(buildTx, params.feePerByte, params.feeMargin);
  const carrierAfter = sponsored
    ? vaultTotal - preview.paidTotal
    : vaultTotal - preview.paidTotal - fee;

  return {
    builder: buildTx(fee),
    heirPayouts: heirOutputs,
    paidTotal: preview.paidTotal,
    leftover: preview.leftover,
    planCarrierAfter: carrierAfter,
    fee,
  };
}
