// The judge path (/try): ready-made plans whose waiting time has already passed, so anyone can press
// "Send to heirs" at once. The page opens the first plan in the list that is still claimable, so one
// judge paying a plan out doesn't leave the next judge with nothing to press.
//
// PLACEHOLDERS: the addresses below are not real. Before launch, replace them with the pre-funded
// mainnet plans (deployed with their deadline a few hours behind the network clock).

import type { PlanData } from '../../lib/types';
import { NETWORK } from '../../components/AppShell';

const DAY = 86_400n;

/** Six heirs, split by Islamic inheritance (faraid): wife 15, father 20, mother 20, two sons 26 each, daughter 13, out of 120. */
const faraidFamily: PlanData['heirs'] = [
  { name: 'Aisha', relation: 'wife', share: 15n, address: 'bitcoincash:qrvwwawq0nt0x4ugrghjypug6ydtsku6xrtu406p5a' },
  { name: 'Yusuf', relation: 'father', share: 20n, address: 'bitcoincash:qr5tm7uagwavu4qrg56lndezwd94edc4tfdx87fsrz' },
  { name: 'Mariam', relation: 'mother', share: 20n, address: 'bitcoincash:qplrxqh864j8tya2shelrw2glkmtm8f4ny26x8p6q4' },
  { name: 'Omar', relation: 'son', share: 26n, address: 'bitcoincash:qpvt4pvhpjp7hmqtak40s8v7cut0hhsle5z8rct35q' },
  { name: 'Idris', relation: 'son', share: 26n, address: 'bitcoincash:qp98kk0ezud4fznc27f7teqysat3rfj0v0h7qqplsd' },
  { name: 'Layla', relation: 'daughter', share: 13n, address: 'bitcoincash:qp4wrt9xu86nn8aduq22n8yn4tju8su0phrn9epx0m' },
];

export const DEMO_PLANS: PlanData[] = [
  {
    version: 1,
    network: NETWORK,
    ownerAddress: 'bitcoincash:qrsl22a7cg0q84dn2wmncs8vx77vz4269e8zlgfzvf',
    heirs: faraidFamily,
    shareTotal: 120n,
    splitMode: 'faraid',
    period: 30n * DAY,
    feeBudget: 0n,
    contractAddress: 'bitcoincash:pr4v643etx9evgumus5wgg9rzgtmr9hxy6keup75x7',
  },
];
