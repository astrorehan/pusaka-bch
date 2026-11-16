// Domain types shared by every screen. Amounts are bigint satoshis; times are unix seconds.

export type NetworkName = 'mainnet' | 'chipnet';

export type SplitMode = 'equal' | 'custom' | 'faraid';

/** One heir as the owner enters it. `share` is a numerator over the plan's `shareTotal`. */
export interface Heir {
  name: string;
  /** cashaddr, with the `bitcoincash:` or `bchtest:` prefix */
  address: string;
  share: bigint;
  /** faraid relation, only when the split mode is faraid (e.g. 'wife', 'son') */
  relation?: string;
}

/** Everything needed to rebuild the contract and find it on-chain. This is what the plan link carries. */
export interface PlanData {
  version: 1;
  network: NetworkName;
  ownerAddress: string;
  heirs: Heir[];
  /** sum of all heir shares; on-chain the contract pays pot * share / shareTotal */
  shareTotal: bigint;
  splitMode: SplitMode;
  /** waiting time in seconds */
  period: bigint;
  /** satoshis kept back to pay the payout's network fee */
  feeBudget: bigint;
  /** the contract's address, filled in once deployed */
  contractAddress?: string;
  /** txid of the deployment */
  createdTxid?: string;
}

export type PlanStatus =
  | 'active' // waiting time running
  | 'ending-soon' // under 10% of the waiting time left
  | 'claimable' // waiting time passed, heirs can be paid
  | 'sent' // paid out to heirs
  | 'taken-back'; // owner withdrew everything

/** Live view of a plan, read from the network. */
export interface PlanState {
  status: PlanStatus;
  balance: bigint;
  /** unix seconds when heirs can claim */
  deadline: bigint;
  /** network clock (median time past), unix seconds */
  networkTime: bigint;
  /** last transaction that touched the plan */
  lastTxid?: string;
}

/** What a transaction will move, shown on the review screen before any signature. */
export interface TxPreview {
  lines: { label: string; address?: string; amount: bigint; kind: 'heir' | 'owner' | 'plan' | 'fee' | 'service' }[];
  networkFee: bigint;
}

export type TxResult = { ok: true; txid: string } | { ok: false; reason: 'cancelled' | 'failed'; message: string; details?: string };
