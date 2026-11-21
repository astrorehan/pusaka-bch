import { BASE } from './asset';
import { NETWORK, openInOtherApp } from './networkName';
import { decodePusakaV2PlanLink, encodePusakaV2PlanLink, readV2Metadata, type PusakaV2PlanMetadata } from './protocol/plan-metadata';

const PLANS_KEY = `pusaka.v2.plans.${NETWORK}`;
const HISTORY_KEY = `pusaka.v2.activity.${NETWORK}`;
const PENDING_PREFIX = `pusaka.v2.pending.${NETWORK}.`;
const TXID = /^[a-f\d]{64}$/i;

export type PendingPlanSubmission = {
  txid: string;
  title: string;
  metadata: PusakaV2PlanMetadata;
};

export function pendingPlanSubmissions(): PendingPlanSubmission[] {
  try {
    return Object.keys(localStorage).flatMap((key) => {
      if (!key.startsWith(PENDING_PREFIX)) return [];
      try {
        const { txid, title, metadata } = JSON.parse(localStorage.getItem(key) ?? 'null');
        const plan = readV2Metadata(metadata);
        if (!TXID.test(txid) || key !== PENDING_PREFIX + txid || typeof title !== 'string' || plan.network !== NETWORK) return [];
        return [{ txid, title, metadata: plan }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function savePendingPlan(record: PendingPlanSubmission) {
  try {
    // One key per transaction preserves both drafts if two tabs submit at the same time.
    localStorage.setItem(PENDING_PREFIX + record.txid, JSON.stringify(record));
  } catch {
    throw new Error('Browser storage could not save the plan recovery data. Enable storage for this site and try again.');
  }
}

export function removePendingPlan(txid: string) {
  try {
    localStorage.removeItem(PENDING_PREFIX + txid);
  } catch {
    // Retaining the recovery copy is safe if the browser cannot remove it.
  }
}

export function savedPlans(): PusakaV2PlanMetadata[] {
  return readList(PLANS_KEY).flatMap((value) => {
    try {
      const plan = readV2Metadata(value);
      return plan.network === NETWORK ? [plan] : [];
    } catch {
      return [];
    }
  });
}

export function savePlan(plan: PusakaV2PlanMetadata) {
  const plans = savedPlans().filter((saved) => saved.planCategoryHex !== plan.planCategoryHex);
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify([plan, ...plans]));
    return true;
  } catch {
    // The plan link and file can still be shared when browser storage is unavailable.
    return false;
  }
}

export function planLink(plan: PusakaV2PlanMetadata) {
  return encodePusakaV2PlanLink(plan, `${location.origin}${BASE}v2/plan`);
}

export function importPlan(fragment: string): PusakaV2PlanMetadata {
  let plan: PusakaV2PlanMetadata;
  try {
    plan = decodePusakaV2PlanLink(fragment);
  } catch {
    throw new Error('Could not read this plan. Paste the complete plan link or choose the saved plan file.');
  }
  if (plan.network !== NETWORK) {
    if (openInOtherApp(plan.network, `v2/plan${encodePusakaV2PlanLink(plan, '')}`)) {
      throw new Error(`Opening this plan in the Pusaka app for the ${plan.network === 'mainnet' ? 'main' : 'test'} network…`);
    }
    throw new Error('Open this plan in the Pusaka app for its Bitcoin Cash network.');
  }
  return plan;
}

type Activity = {
  txid: string;
  title: string;
  at: number;
  plan: string;
  status: 'accepted';
  /** Sent on a public example plan from the demo: shown only beside that example, never as the visitor's own. */
  demo?: boolean;
};

function readList(key: string): unknown[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function isActivity(value: unknown): value is Activity {
  if (!value || typeof value !== 'object') return false;
  const { txid, title, at, plan, status } = value as Activity;
  return typeof txid === 'string' && TXID.test(txid) && typeof title === 'string' &&
    Number.isFinite(at) && typeof plan === 'string' && status === 'accepted';
}

export function history() {
  return readList(HISTORY_KEY).filter(isActivity);
}

export function recordActivity(entry: Activity) {
  try {
    const others = history().filter(({ txid }) => txid !== entry.txid);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...others].slice(0, 100)));
  } catch {
    // A submitted transaction remains valid when browser storage is unavailable.
  }
}
