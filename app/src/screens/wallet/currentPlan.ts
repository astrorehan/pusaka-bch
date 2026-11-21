import { useOutletContext } from 'react-router-dom';
import { binToHex } from '@bitauth/libauth/build/lib/format/hex.js';
import { addressPrefix, toBytes20 } from '../../lib/cashAddress';
import type { LoadedPlan } from '../../lib/chain/v2';
import { formatBch } from '../../lib/format';
import { NETWORK } from '../../lib/networkName';
import type { PusakaV2PlanMetadata } from '../../lib/protocol/plan-metadata';

export const planAddressPrefix = `${addressPrefix(NETWORK)}:`;

export function planAddressHash(value: string) {
  const address = value.trim();
  if (!address.startsWith(planAddressPrefix)) return null;
  try {
    const payload = toBytes20(address);
    return payload.length === 20 ? binToHex(payload) : null;
  } catch {
    return null;
  }
}

export interface CurrentPlan {
  metadata: PusakaV2PlanMetadata | null;
  data: LoadedPlan | null;
  demo: boolean;
  /** Every demo example has paid its heirs. */
  demoExhausted: boolean;
  /** No demo example could be read from the network. */
  demoUnreachable: boolean;
  /** Pick the demo example with the most left to do. */
  nextDemo(): void;
  loading: boolean;
  canRefresh: boolean;
  error: string;
  /** `fresh` reads past the network listing cache: after a transaction, or when the visitor asks. */
  refresh(fresh?: boolean): Promise<void>;
}

export function useCurrentPlan() {
  return useOutletContext<CurrentPlan>();
}

export function claimFundingMessage(data: LoadedPlan, action: string) {
  const { funding, state } = data;
  if (state.inboxBalanceSats > 0n)
    return 'Collect incoming BCH into the protected balance before trying this step.';
  if (funding.canSponsor)
    return `A funded wallet can cover the network costs to ${action}.`;
  if (funding.self.shortfall > 0n)
    return `Add and collect ${formatBch(funding.self.shortfall)} BCH so the plan can pay every heir after fees.`;
  return 'This plan’s fee budget is too low for this step. Ask the owner to review the plan rules.';
}
