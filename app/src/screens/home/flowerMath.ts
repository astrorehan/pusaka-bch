// Geometry and colours shared by the share flower, its name chips and the share bars.

export interface FlowerHeir {
  name: string;
  /** share weight; only ratios matter */
  share: number;
}

/** Heir colours in DESIGN order; they repeat after five. */
export const heirColor = (i: number) => `var(--heir-${(i % 5) + 1})`;

/** Petal angle in degrees, clockwise from the top. Four heirs: the logo diagonals. */
export function petalAngle(i: number, n: number): number {
  const start = n === 4 ? 45 : 0;
  return start + (i * 360) / n;
}

/** Petal length factor: area follows the share, so length and width follow its square root. */
export function petalScale(share: number, max: number): number {
  return Math.max(0.42, Math.sqrt(share / max));
}
