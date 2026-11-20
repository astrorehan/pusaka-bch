import { MIN_PLAN_CARRIER_SATS } from "./plan-metadata.ts";

export const MIN_ANCHOR_SATS = 1_000n;
export const P2PKH_DUST_SATS = 546n;
export const DEFAULT_FEE_BUDGET = 5_000n;

/** Balance needed to pay the smallest share above dust, including the plan carrier and fee reserves. */
export function claimFunding(
  balance: bigint,
  shares: bigint[],
  payoutFee: bigint,
  openingFee = 0n,
) {
  const total = shares.reduce((sum, share) => sum + share, 0n);
  const smallestShare = shares.reduce((min, share) => share < min ? share : min, total);
  const minimumPot = (P2PKH_DUST_SATS * total + smallestShare - 1n) / smallestShare;
  const payoutReserve = MIN_PLAN_CARRIER_SATS + payoutFee;
  const payoutMinimum = payoutReserve + minimumPot;
  const minimum = payoutMinimum + openingFee;
  const pot = balance - payoutReserve - openingFee;
  return {
    minimum,
    shortfall: balance < minimum ? minimum - balance : 0n,
    smallestPayout: pot > 0n ? pot * smallestShare / total : 0n,
  };
}
