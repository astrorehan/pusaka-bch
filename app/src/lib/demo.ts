// The demo wallet (/wallet/demo): real public plans that anyone can open, and act on, without a wallet of their own.
// They are example plans made for visitors by contract/scripts/v2/live.ts (PUSAKA_LIVE=demo). Each one waits a
// minute, then either has its claim opened by the script or is left for a visitor to open. Once the network has
// enforced the review period, any visitor can press "Pay the heirs" and send that real payout; the plan pays the
// network fee. The demo opens whichever plan has the most to do (see WalletPlanLayout).
// Chipnet also keeps the asset-revision proof wallet, already paid to its heirs, as the last choice.
import chipnetProof from './protocol/demo-plan.json';
import chipnetPlans from './protocol/demo-plans.chipnet.json';
import mainnetPlans from './protocol/demo-plans.mainnet.json';
import { NETWORK, OTHER_APP } from './networkName';

export const DEMO_PLAN_DATA: unknown[] = NETWORK === 'mainnet' ? mainnetPlans : [...chipnetPlans, chipnetProof];
export const HAS_DEMO = DEMO_PLAN_DATA.length > 0;

/** The example plans' categories. Their transactions stay out of a visitor's own activity and saved plans. */
export const DEMO_CATEGORIES = new Set(
  DEMO_PLAN_DATA.flatMap((plan) => {
    const category = (plan as { planCategoryHex?: unknown } | null)?.planCategoryHex;
    return typeof category === 'string' ? [category.toLowerCase()] : [];
  }),
);

/** Where "Try it now" leads: this app's example plans, or the test-network app's when this network has none. */
export const TRY_IT: { to: string } | { href: string } | null = HAS_DEMO
  ? { to: '/wallet/demo' }
  : OTHER_APP
    ? { href: `${OTHER_APP}wallet/demo` }
    : null;

/** The transaction that created an example plan, when its record has one: the first step of the demo's story. */
export function demoCreatedTxid(category: string): string | undefined {
  const entry = DEMO_PLAN_DATA.find(
    (plan) => (plan as { planCategoryHex?: unknown } | null)?.planCategoryHex === category,
  ) as { createdTxid?: unknown } | undefined;
  return typeof entry?.createdTxid === 'string' && /^[a-f\d]{64}$/.test(entry.createdTxid) ? entry.createdTxid : undefined;
}
