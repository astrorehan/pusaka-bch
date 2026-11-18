// The three example family plans shown on the home page, and the kawung pattern their letters are wrapped in.
import type { SplitMode } from '../../lib/types';

export interface Family {
  mode: SplitMode;
  title: string;
  role: string;
  tint: string;
  names: string[];
  shares: bigint[];
}

export const FAMILIES: Family[] = [
  { mode: 'equal', title: 'Equal shares', role: 'The same share for everyone.', tint: 'var(--heir-1)', names: ['Aisha', 'Omar', 'Layla'], shares: [1n, 1n, 1n] },
  { mode: 'custom', title: 'Your own split', role: 'A little more here, a little less there.', tint: 'var(--heir-2)', names: ['Aisha', 'Omar', 'Layla'], shares: [50n, 30n, 20n] },
  {
    mode: 'faraid',
    title: 'Islamic inheritance (faraid)',
    role: 'Shares worked out from your family.',
    tint: 'var(--gold)',
    names: ['Wife', 'Father', 'Mother', 'Son 1', 'Son 2', 'Daughter'],
    shares: [15n, 20n, 20n, 26n, 26n, 13n],
  },
];

export const TITLE = 'Your family.\nYour way to share.';

// Kawung: four ovals on the diagonals around each point of a centred square grid, with a dot at the centre.
export const KAWUNG = (() => {
  const points = [[0, 0], [48, 0], [0, 48], [48, 48], [24, 24]];
  const petals = points.flatMap(([x, y]) => [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([dx, dy]) => {
    const cx = x + dx * 6.4, cy = y + dy * 6.4;
    return `<ellipse cx='${cx}' cy='${cy}' rx='7.2' ry='3.5' transform='rotate(${dx * dy * 45} ${cx} ${cy})'/>`;
  }));
  const dots = points.map(([x, y]) => `<circle cx='${x}' cy='${y}' r='1.6'/>`);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><g fill='none' stroke='%23C9A56A' stroke-width='1' opacity='0.55'>${petals.join('')}</g><g fill='%23C9A56A' opacity='0.7'>${dots.join('')}</g></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}")`;
})();
