// The judge path (/try): ready-made plans whose waiting time has already passed, so anyone can press
// "Send to heirs" at once. The page opens the first plan in the list that is still claimable, so one
// judge paying a plan out doesn't leave the next judge with nothing to press. When every plan has been
// paid, the page says so ("This example was already sent") instead of a dead end.
//
// MAINNET PLACEHOLDER: the mainnet addresses below are not real. Before launch, replace them with the
// pre-funded mainnet plans (deployed with their deadline a few hours behind the network clock), each with
// its categoryId, so the real chain layer can find them.

import type { PlanData } from '../../lib/types';
import { NETWORK } from '../../lib/networkName';

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

const MAINNET: PlanData[] = [
  {
    version: 1,
    network: 'mainnet',
    ownerAddress: 'bitcoincash:qrsl22a7cg0q84dn2wmncs8vx77vz4269e8zlgfzvf',
    heirs: faraidFamily,
    shareTotal: 120n,
    splitMode: 'faraid',
    period: 30n * DAY,
    feeBudget: 0n,
    contractAddress: 'bitcoincash:pr4v643etx9evgumus5wgg9rzgtmr9hxy6keup75x7',
  },
];

/**
 * Chipnet: a real plan made by the chain layer's end-to-end run (app/scripts/chain-e2e.ts, 16 Nov), already
 * paid to its three heirs. On the test network /try therefore shows a real plan read from the network (as
 * "already sent") rather than "We can't find this plan". Add fresh claimable Chipnet plans in front of it.
 */
const CHIPNET: PlanData[] = [
  {
    version: 1,
    network: 'chipnet',
    ownerAddress: 'bchtest:qzzj75lwsmpzh40v5nsudwyxslu0465lxyhywg5jua',
    heirs: [
      { name: 'Wife', address: 'bchtest:qzqj5jec3vx9w6yca2h9pph9qsvsvcmj8udje9wqmf', share: 15n },
      { name: 'Father', address: 'bchtest:qpzu3nfjdksp4v26f2mnzhmyyf00dl759vc77l5azx', share: 20n },
      { name: 'Son', address: 'bchtest:qrhw9wv228lkht5zz763lqvp2q8qk03csc05l3a398', share: 26n },
    ],
    shareTotal: 61n,
    splitMode: 'custom',
    period: 1n,
    feeBudget: 2000n,
    categoryId: '9f878af6960c0fe84aeab0f644f518cdab5dac39bcf5e34dda6c987e30007ac7',
    contractAddress: 'bchtest:r0c7gl4myd729ypsz20frhzaal5205ra9gsvz8e3eum3pxqgqqphqw0r6g6g9',
    createdTxid: '7b9ef747c27c4f625e86742355eceb3ad8b278a85bcc0140913934622f4b1104',
  },
];

export const DEMO_PLANS: PlanData[] = NETWORK === 'mainnet' ? MAINNET : CHIPNET;
