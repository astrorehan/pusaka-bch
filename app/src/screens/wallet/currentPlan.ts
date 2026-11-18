import { useOutletContext } from 'react-router-dom';
import { addressPrefix, binToHex, pkhOfAddress } from '../../lib/chain/network';
import {
  NETWORK,
  type LoadedPlan,
  type PusakaV2PlanMetadata,
} from '../../lib/chain/v2';

export const planAddressPrefix = `${addressPrefix(NETWORK)}:`;

export function planAddressHash(value: string) {
  const address = value.trim();
  if (!address.startsWith(planAddressPrefix)) return null;
  try {
    const payload = pkhOfAddress(address);
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
  selectPlan(plan: PusakaV2PlanMetadata, data?: LoadedPlan): void;
}

export function useCurrentPlan() {
  return useOutletContext<CurrentPlan>();
}
