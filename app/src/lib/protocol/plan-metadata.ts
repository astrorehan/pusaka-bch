import { decodeCashAddress, encodeCashAddress } from "@bitauth/libauth/build/lib/address/cash-address.js";
import { binToHex, hexToBin } from "@bitauth/libauth/build/lib/format/hex.js";
import { addressPrefix } from "../cashAddress.ts";
import { decodePlanPayload, encodePlanPayload, MAX_PLAN_PAYLOAD } from "../planPayload.ts";

export const PUSAKA_V2_VERSION = "pusaka-v2" as const;
export const MAX_HEIRS = 10;
export const MAX_INT32 = 0x7fffffff;
export const MIN_PLAN_CARRIER_SATS = 1_000n;
export const CURRENT_ASSET_REVISION = "assets-2";
export type AssetRevision = "assets-1" | typeof CURRENT_ASSET_REVISION;
const COMPACT_PREFIX = "p2_";
const BIP68_UNITS_MASK = 0xffff;
const BIP68_UNIT_SECONDS = 512;

export interface PusakaV2PlanMetadata {
  protocolRevision?: AssetRevision;
  version: typeof PUSAKA_V2_VERSION;
  network: string;
  planCategoryHex: string;
  ownerPkhHex: string;
  planAddress: string;
  planLockHex: string;
  anchorAddress: string;
  anchorLockHex: string;
  inboxAddress: string;
  inboxLockHex: string;
  perInputFeeCap: string;
  policyBytesHex: string;
  policyHashHex: string;
  createdAtLocktime: number;
  inactivityPeriodSeconds: number;
  reviewSequence: number;
  reviewUnits: number;
  effectiveReviewSeconds: number;
  feeBudget: string;
  contacts: [string, string, string];
  totalShares: string;
  heirs: Array<{ pkhHex: string; share: string; label?: string }>;
}

const hex = (value: unknown, length: number) =>
  typeof value === "string" && value.length === length && /^[a-f0-9]+$/.test(value);
const pkh = (value: unknown) => hex(value, 40);
const address = (value: unknown) =>
  typeof value === "string" && /^(bitcoincash|bchtest|bchreg):(?:[a-z0-9]{42}|[a-z0-9]{61})$/.test(value);
const decimal = (value: unknown) =>
  typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value);
const uint32 = (value: number) =>
  Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

/** Validate the portable data before using it. Chain attachment checks the scripts and policy commitment. */
export function readV2Metadata(value: unknown): PusakaV2PlanMetadata {
  if (!value || typeof value !== "object") throw new Error("Invalid Pusaka v2 plan");
  const {
    version, protocolRevision, network, planCategoryHex, ownerPkhHex, planAddress, planLockHex,
    anchorAddress, anchorLockHex, inboxAddress, inboxLockHex, perInputFeeCap, policyBytesHex,
    policyHashHex, createdAtLocktime, inactivityPeriodSeconds, reviewSequence, reviewUnits,
    effectiveReviewSeconds, feeBudget, contacts, totalShares, heirs,
  } = value as PusakaV2PlanMetadata;
  if (
    version !== PUSAKA_V2_VERSION ||
    (protocolRevision !== undefined && protocolRevision !== "assets-1" && protocolRevision !== CURRENT_ASSET_REVISION) ||
    typeof network !== "string" || !/^[a-z0-9-]{1,24}$/.test(network) ||
    !hex(planCategoryHex, 64) || !pkh(ownerPkhHex) ||
    !address(planAddress) || !hex(planLockHex, 70) ||
    !address(anchorAddress) || !hex(anchorLockHex, 70) ||
    !address(inboxAddress) || !hex(inboxLockHex, 70) ||
    !decimal(perInputFeeCap) || !hex(policyHashHex, 64) ||
    !uint32(createdAtLocktime) || !uint32(inactivityPeriodSeconds) ||
    !uint32(reviewSequence) || !uint32(reviewUnits) || !uint32(effectiveReviewSeconds) ||
    !decimal(feeBudget) || !decimal(totalShares) ||
    !Array.isArray(contacts) || contacts.length !== 3 || !contacts.every(pkh) ||
    !Array.isArray(heirs) || heirs.length < 1 || heirs.length > MAX_HEIRS ||
    !heirs.every((heir) => heir && pkh(heir.pkhHex) && decimal(heir.share) &&
      (heir.label === undefined || (typeof heir.label === "string" && heir.label.length <= MAX_PLAN_PAYLOAD))) ||
    !hex(policyBytesHex, (77 + heirs.length * 24) * 2)
  ) {
    throw new Error("Invalid Pusaka v2 plan");
  }
  return {
    version, ...(protocolRevision && { protocolRevision }), network, planCategoryHex, ownerPkhHex,
    planAddress, planLockHex, anchorAddress, anchorLockHex, inboxAddress, inboxLockHex,
    perInputFeeCap, policyBytesHex, policyHashHex, createdAtLocktime, inactivityPeriodSeconds,
    reviewSequence, reviewUnits, effectiveReviewSeconds, feeBudget, contacts, totalShares,
    heirs: heirs.map(({ pkhHex, share, label }) => ({ pkhHex, share, ...(label !== undefined && { label }) })),
  };
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>> 0
  );
}

function writeU32LE(out: Uint8Array, offset: number, value: number) {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >>> 8) & 0xff;
  out[offset + 2] = (value >>> 16) & 0xff;
  out[offset + 3] = (value >>> 24) & 0xff;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(text: string): Uint8Array {
  if (text.length > MAX_PLAN_PAYLOAD || !/^[A-Za-z0-9_-]+={0,2}$/.test(text)) {
    throw new Error("Invalid compact plan link payload");
  }
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function p2sh32Hash(lockHex: string): Uint8Array | null {
  if (!/^aa20[a-f0-9]{64}87$/.test(lockHex)) return null;
  return hexToBin(lockHex.slice(4, 68));
}

function encodeP2sh32Address(hash: Uint8Array, network: string, tokenAware: boolean): string {
  const encoded = encodeCashAddress({
    prefix: addressPrefix(network),
    type: tokenAware ? "p2shWithTokens" : "p2sh",
    payload: hash,
  });
  if (typeof encoded === "string") throw new Error(encoded);
  return encoded.address;
}

const NET_TO_CODE: Record<string, number> = { mainnet: 1, chipnet: 2, regtest: 3 };
const CODE_TO_NET: Record<number, string> = { 1: "mainnet", 2: "chipnet", 3: "regtest" };

function decodeCompactV2Payload(encoded: string): PusakaV2PlanMetadata {
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length < 194 + 101) throw new Error("Invalid compact plan link");
  if (bytes[0] !== 1) throw new Error("Unsupported compact plan link version");
  const revCode = bytes[1];
  const protocolRevision: AssetRevision | undefined =
    revCode === 0 ? undefined : revCode === 1 ? "assets-1" : revCode === 2 ? CURRENT_ASSET_REVISION : (() => {
      throw new Error("Invalid protocol revision");
    })();
  const network = CODE_TO_NET[bytes[2]];
  if (!network) throw new Error("Invalid network code");
  const flags = bytes[3];
  const planCategoryHex = binToHex(bytes.slice(4, 36));
  const ownerPkhHex = binToHex(bytes.slice(36, 56));
  const planHash = bytes.slice(56, 88);
  const anchorHash = bytes.slice(88, 120);
  const inboxHash = bytes.slice(120, 152);
  const policyHashHex = binToHex(bytes.slice(152, 184));
  const createdAtLocktime = readU32LE(bytes, 184);
  const perInputFeeCap = String(readU32LE(bytes, 188));
  const policyLen = bytes[192] | (bytes[193] << 8);
  const policyEnd = 194 + policyLen;
  if (policyLen < 101 || policyEnd > bytes.length) throw new Error("Invalid compact policy length");
  const policy = bytes.slice(194, policyEnd);
  const heirCount = policy[76];
  if (heirCount < 1 || heirCount > MAX_HEIRS || policyLen !== 77 + heirCount * 24) {
    throw new Error("Invalid compact heir count");
  }
  let labels: Array<string | null> | null = null;
  if (policyEnd < bytes.length) {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(policyEnd)));
    if (!Array.isArray(parsed) || parsed.length !== heirCount) {
      throw new Error("Invalid compact heir labels");
    }
    labels = parsed;
  }
  const inactivityPeriodSeconds = readU32LE(policy, 0);
  const reviewSequence = readU32LE(policy, 4);
  const reviewUnits = reviewSequence & BIP68_UNITS_MASK;
  const effectiveReviewSeconds = reviewUnits * BIP68_UNIT_SECONDS;
  const feeBudget = String(readU32LE(policy, 8));
  const contacts: [string, string, string] = [
    binToHex(policy.slice(12, 32)),
    binToHex(policy.slice(32, 52)),
    binToHex(policy.slice(52, 72)),
  ];
  const totalShares = String(readU32LE(policy, 72));
  const heirs: PusakaV2PlanMetadata["heirs"] = [];
  for (let i = 0; i < heirCount; i++) {
    const off = 77 + i * 24;
    const label = labels?.[i];
    heirs.push({
      pkhHex: binToHex(policy.slice(off, off + 20)),
      share: String(readU32LE(policy, off + 20)),
      ...(typeof label === "string" ? { label } : {}),
    });
  }
  return {
    version: PUSAKA_V2_VERSION,
    ...(protocolRevision ? { protocolRevision } : {}),
    network,
    planCategoryHex,
    ownerPkhHex,
    planAddress: encodeP2sh32Address(planHash, network, Boolean(flags & 1)),
    planLockHex: `aa20${binToHex(planHash)}87`,
    anchorAddress: encodeP2sh32Address(anchorHash, network, Boolean(flags & 2)),
    anchorLockHex: `aa20${binToHex(anchorHash)}87`,
    inboxAddress: encodeP2sh32Address(inboxHash, network, Boolean(flags & 4)),
    inboxLockHex: `aa20${binToHex(inboxHash)}87`,
    perInputFeeCap,
    policyBytesHex: binToHex(policy),
    policyHashHex,
    createdAtLocktime,
    inactivityPeriodSeconds,
    reviewSequence,
    reviewUnits,
    effectiveReviewSeconds,
    feeBudget,
    contacts,
    totalShares,
    heirs,
  };
}

/** Compact lossless link (~700 chars for 6 heirs) so family plan links fit in a scannable QR code. */
export function encodeCompactPusakaV2PlanLink(
  metadata: PusakaV2PlanMetadata,
  baseUrl = "https://pusaka.cash/v2/plan",
): string {
  const netCode = NET_TO_CODE[metadata.network];
  const planHash = p2sh32Hash(metadata.planLockHex);
  const anchorHash = p2sh32Hash(metadata.anchorLockHex);
  const inboxHash = p2sh32Hash(metadata.inboxLockHex);
  const feeCapNum = Number(metadata.perInputFeeCap);
  if (
    !netCode || !planHash || !anchorHash || !inboxHash ||
    !Number.isInteger(feeCapNum) || feeCapNum < 0 || feeCapNum > 0xffffffff
  ) {
    return encodePusakaV2PlanLink(metadata, baseUrl);
  }
  const dPlan = decodeCashAddress(metadata.planAddress);
  const dAnchor = decodeCashAddress(metadata.anchorAddress);
  const dInbox = decodeCashAddress(metadata.inboxAddress);
  if (typeof dPlan === "string" || typeof dAnchor === "string" || typeof dInbox === "string") {
    return encodePusakaV2PlanLink(metadata, baseUrl);
  }
  const flags =
    (dPlan.type === "p2shWithTokens" ? 1 : 0) |
    (dAnchor.type === "p2shWithTokens" ? 2 : 0) |
    (dInbox.type === "p2shWithTokens" ? 4 : 0);
  const revCode =
    metadata.protocolRevision === CURRENT_ASSET_REVISION ? 2
      : metadata.protocolRevision === "assets-1" ? 1 : 0;
  const policy = hexToBin(metadata.policyBytesHex);
  const hasLabels = metadata.heirs.some((h) => h.label !== undefined);
  const labelBytes = hasLabels
    ? new TextEncoder().encode(JSON.stringify(metadata.heirs.map((h) => h.label ?? null)))
    : new Uint8Array(0);
  const out = new Uint8Array(194 + policy.length + labelBytes.length);
  out[0] = 1;
  out[1] = revCode;
  out[2] = netCode;
  out[3] = flags;
  out.set(hexToBin(metadata.planCategoryHex), 4);
  out.set(hexToBin(metadata.ownerPkhHex), 36);
  out.set(planHash, 56);
  out.set(anchorHash, 88);
  out.set(inboxHash, 120);
  out.set(hexToBin(metadata.policyHashHex), 152);
  writeU32LE(out, 184, metadata.createdAtLocktime);
  writeU32LE(out, 188, feeCapNum);
  out[192] = policy.length & 0xff;
  out[193] = (policy.length >>> 8) & 0xff;
  out.set(policy, 194);
  if (labelBytes.length) out.set(labelBytes, 194 + policy.length);
  return `${baseUrl}#${COMPACT_PREFIX}${bytesToBase64Url(out)}`;
}

export function encodePusakaV2PlanLink(
  metadata: PusakaV2PlanMetadata,
  baseUrl = "https://pusaka.cash/v2/plan",
): string {
  return `${baseUrl}#${encodePlanPayload(JSON.stringify(metadata))}`;
}

export function decodePusakaV2PlanLink(linkOrFragment: string): PusakaV2PlanMetadata {
  const fragment = linkOrFragment.slice(linkOrFragment.indexOf("#") + 1);
  if (fragment.startsWith(COMPACT_PREFIX)) {
    return readV2Metadata(decodeCompactV2Payload(fragment.slice(COMPACT_PREFIX.length)));
  }
  return readV2Metadata(decodePlanPayload(fragment));
}
