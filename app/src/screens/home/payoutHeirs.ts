// The example heirs of the night payout: 0.12 BCH split 40 / 30 / 20 / 10.

export interface FlowHeir { name: string; pct: number; bch: string; sats: string; color: string }

// 0.12 BCH for the heirs (12,000,000 satoshis), split 40 / 30 / 20 / 10: every amount is exact.
export const HEIRS: FlowHeir[] = [
  { name: 'Aisha', pct: 40, bch: '0.048', sats: '4,800,000', color: 'var(--heir-1)' },
  { name: 'Omar', pct: 30, bch: '0.036', sats: '3,600,000', color: 'var(--heir-2)' },
  { name: 'Layla', pct: 20, bch: '0.024', sats: '2,400,000', color: 'var(--heir-3)' },
  { name: 'Zayd', pct: 10, bch: '0.012', sats: '1,200,000', color: 'var(--heir-4)' },
];
