// Network, node and wallet errors arrive as library strings. People see a sentence they can act on instead.

import type { PendingPlanSubmission } from '../walletData';

const OFFLINE = /websocket|1006|failed to establish connection|socket|econn|timed? ?out|failed to fetch|network ?error|disconnect/i;
const CONFLICT = /mempool-conflict|missingorspent|missing inputs|already spent|inputs-missing/i;
const NOT_YET = /non-bip68-final|non-final|premature/i;
const LOW_FEE = /min relay fee|insufficient priority|fee not met|insufficient fee/i;
const LAGGING = /out of range|unknown block|header not found/i;

export class StaleReviewError extends Error {
  constructor() {
    super('An input was spent while this transaction was being reviewed. Review a fresh transaction.');
  }
}

/** Someone else already sent this exact transaction (a wallet-free step, built the same way): nothing more was sent. */
export class AlreadySent extends Error {
  readonly txid: string;
  constructor(txid: string) {
    super('This exact transaction is already on the network, probably sent by someone else a moment ago. Nothing more was sent.');
    this.txid = txid;
  }
}

/** The transaction was sent, but the network's reply was lost and a lookup could not find it yet. */
export class UncertainSubmission extends Error {
  readonly txid: string;
  constructor(txid: string) {
    super('We sent this transaction but did not hear back from the network. Check it with the link below before trying again.');
    this.txid = txid;
  }
}

export class UnconfirmedPlanSubmission extends Error {
  readonly record: PendingPlanSubmission;

  constructor(record: PendingPlanSubmission) {
    super('The network did not confirm the broadcast. The plan recovery data is saved in this browser. Check the transaction before trying again.');
    this.record = record;
  }
}

export function isInputConflict(e: unknown): boolean {
  return CONFLICT.test(message(e));
}

/** The node refused the transaction itself: it was not broadcast and nothing moved. */
export function isRejection(e: unknown): boolean {
  const text = message(e);
  return CONFLICT.test(text) || NOT_YET.test(text) || LOW_FEE.test(text) ||
    /mandatory-script-verify|script failed|bad-txns|dust|non-standard|scriptsig/i.test(text);
}

export function friendlyError(e: unknown): string {
  const text = message(e);
  if (CONFLICT.test(text)) return 'Another transaction just used an input. Refresh the plan and review again.';
  if (NOT_YET.test(text)) return 'The network clock has not reached this step yet. Wait a few minutes, refresh and try again.';
  if (LOW_FEE.test(text)) return 'The network asked for a higher fee. Refresh and try again.';
  if (LAGGING.test(text)) return 'The network server is catching up with the latest block. Try again in a moment.';
  if (OFFLINE.test(text)) return 'Could not reach the Bitcoin Cash network. Check your connection and try again.';
  return text;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
