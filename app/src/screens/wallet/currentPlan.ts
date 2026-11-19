import { useOutletContext } from 'react-router-dom';
import { binToHex } from '@bitauth/libauth/build/lib/format/hex.js';
import { addressPrefix, toBytes20 } from '../../lib/cashAddress';
import type { LoadedPlan } from '../../lib/chain/v2';
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
  loading: boolean;
  canRefresh: boolean;
  error: string;
  refresh(): Promise<void>;
  selectPlan(plan: PusakaV2PlanMetadata): void;
}

export function useCurrentPlan() {
  return useOutletContext<CurrentPlan>();
}
