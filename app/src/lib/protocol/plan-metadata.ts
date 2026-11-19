import { decodePlanPayload, encodePlanPayload, MAX_PLAN_PAYLOAD } from "../planPayload.ts";

export const PUSAKA_V2_VERSION = "pusaka-v2" as const;
export const MAX_HEIRS = 10;
export const MAX_INT32 = 0x7fffffff;
export const MIN_PLAN_CARRIER_SATS = 1_000n;

export interface PusakaV2PlanMetadata {
  protocolRevision?: "assets-1";
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
    (protocolRevision !== undefined && protocolRevision !== "assets-1") ||
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

export function encodePusakaV2PlanLink(
  metadata: PusakaV2PlanMetadata,
  baseUrl = "https://pusaka.cash/v2/plan",
): string {
  return `${baseUrl}#${encodePlanPayload(JSON.stringify(metadata))}`;
}

export function decodePusakaV2PlanLink(linkOrFragment: string): PusakaV2PlanMetadata {
  const fragment = linkOrFragment.slice(linkOrFragment.indexOf("#") + 1);
  return readV2Metadata(decodePlanPayload(fragment));
}
