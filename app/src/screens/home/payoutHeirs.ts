// The one example family the whole landing page follows: Aisha, Omar and Layla sharing 12 BCH.
// The letters, the plan card, the night payout, the three steps, the cheat attempts and the heir box all use it.

export interface FlowHeir { name: string; pct: number; bch: string; sats: string; addr: string; color: string }

/** What the example plan holds for the heirs: 12 BCH (1,200,000,000 satoshis), split 50 / 30 / 20, every amount
 *  exact. A no-break space keeps the number and the unit on one line. */
export const POT = '12 BCH';

export const HEIRS: FlowHeir[] = [
  { name: 'Aisha', pct: 50, bch: '6', sats: '600,000,000', addr: 'bitcoincash:qp3w…7c9d', color: 'var(--heir-1)' },
  { name: 'Omar', pct: 30, bch: '3.6', sats: '360,000,000', addr: 'bitcoincash:qz8k…2m4e', color: 'var(--heir-2)' },
  { name: 'Layla', pct: 20, bch: '2.4', sats: '240,000,000', addr: 'bitcoincash:qr4x…8f2k', color: 'var(--heir-3)' },
];

/** "Aisha, Omar and Layla" */
export const HEIR_NAMES = `${HEIRS.slice(0, -1).map((h) => h.name).join(', ')} and ${HEIRS[HEIRS.length - 1].name}`;
