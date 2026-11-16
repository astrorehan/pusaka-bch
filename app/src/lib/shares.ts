// Share math, matching the contract exactly: each heir gets floor(pot * share / shareTotal).
// Leftover satoshis from rounding go to the network fee.

export const MAX_HEIRS = 10;

export function heirAmounts(pot: bigint, shares: bigint[], shareTotal: bigint): { amounts: bigint[]; leftover: bigint } {
  const amounts = shares.map((s) => (pot * s) / shareTotal);
  const paid = amounts.reduce((a, b) => a + b, 0n);
  return { amounts, leftover: pot - paid };
}

/** Equal split for n heirs, as integer numerators over a common total. */
export function equalShares(n: number): { shares: bigint[]; total: bigint } {
  return { shares: Array.from({ length: n }, () => 1n), total: BigInt(Math.max(n, 1)) };
}

/** Custom percentages with up to 2 decimals (e.g. 33.33). Total is 10000. */
export function percentShares(percents: number[]): { shares: bigint[]; total: bigint } {
  return { shares: percents.map((p) => BigInt(Math.round(p * 100))), total: 10000n };
}

/** Share as a percentage with 2 decimals, rounded to nearest (20/120 -> 16.67), the same as the create flow shows. */
export function sharePercent(share: bigint, total: bigint): number {
  return total === 0n ? 0 : Number((share * 10000n + total / 2n) / total) / 100;
}
