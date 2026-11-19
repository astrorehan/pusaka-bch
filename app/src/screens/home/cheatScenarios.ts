// The four ways someone might try to cheat a plan, and the two layers that stop each one.
// Backed by the contract's test suite (contract/test): every case here is a test that expects a refusal.
import { AlertCircle, Clock3, Coins, UserX, type LucideIcon } from 'lucide-react';
import { POT } from './payoutHeirs';

export interface CheatScenario {
  id: string;
  label: string;
  icon: LucideIcon;
  /** what the person tries */
  attemptTitle: string;
  attemptLine: string;
  /** layer 1: the app */
  appBadge: string;
  appReason: string;
  /** layer 2: the network */
  networkHeadline: string;
  networkSummary: string;
  networkReason: string;
  proofs: string[];
}

export const CHEAT_SCENARIOS: CheatScenario[] = [
  {
    id: 'early',
    label: 'Claim early',
    icon: Clock3,
    attemptTitle: 'Pay out before the review ends',
    attemptLine: 'A claim has just opened, and someone tries to send the payout before the owner’s review period is over.',
    appBadge: 'Review period running',
    appReason: '“Pay the heirs” stays locked until the review period ends, so the owner has time to stop the claim.',
    networkHeadline: 'Refused by the network',
    networkSummary: `Early payout · ${POT}`,
    networkReason: 'Bitcoin Cash itself holds the claim until the review period has passed. On the test network it refused exactly this payout.',
    proofs: ['Review period still running', 'No payment was made', 'Plan balance unchanged'],
  },
  {
    id: 'satoshi',
    label: 'Pay 1 satoshi less',
    icon: Coins,
    attemptTitle: 'Take 1 satoshi from one heir',
    attemptLine: 'A changed request sends Layla 239,999,999 satoshis instead of her exact 240,000,000.',
    appBadge: 'Amounts don’t match',
    appReason: 'The review screen works out every heir’s exact share before any wallet is asked to sign.',
    networkHeadline: 'Refused by the network',
    networkSummary: '1 satoshi short for Layla',
    networkReason: 'Every node checks every heir’s exact share. Even 1 satoshi off makes the payment invalid.',
    proofs: ['Layla’s share did not match the plan', 'No payment was made', 'Plan balance unchanged'],
  },
  {
    id: 'address',
    label: 'Swap an address',
    icon: UserX,
    attemptTitle: 'Replace an heir’s address',
    attemptLine: 'Someone swaps Omar’s Bitcoin Cash address for their own in the payout.',
    appBadge: 'Address not in plan',
    appReason: 'Heir addresses are fixed when the plan is made, and checked again before signing.',
    networkHeadline: 'Refused by the network',
    networkSummary: 'Unknown address in the payout',
    networkReason: 'Every payout must go to the addresses written into the plan on the day it was made.',
    proofs: ['Address is not in this plan', 'No payment was made', 'Plan balance unchanged'],
  },
  {
    id: 'stranger',
    label: 'Stranger checks in',
    icon: AlertCircle,
    attemptTitle: 'A stranger presses “I’m still here”',
    attemptLine: 'Someone else tries to restart the waiting time, or take the BCH, without the owner’s wallet.',
    appBadge: 'Owner only',
    appReason: 'Only the owner’s connected wallet can spend, press “I’m still here” or take the BCH back.',
    networkHeadline: 'Refused by the network',
    networkSummary: 'Owner’s wallet missing',
    networkReason: 'Spending, “I’m still here” and taking the BCH back all need a coin from the owner’s own wallet.',
    proofs: ['Not signed by the plan owner', 'No payment was made', 'Plan balance unchanged'],
  },
];
