// The plan link: the whole PlanData in the URL fragment, so no server ever sees it.
// Format: <origin>/plan#<base64url(JSON with bigints as strings)>

import type { PlanData } from './types';
import { decodeCashAddress } from '@bitauth/libauth/build/lib/address/cash-address.js';
import { addressPrefix } from './cashAddress.ts';
import { decodePlanPayload, encodePlanPayload } from './planPayload.ts';
import { MAX_HEIRS } from './protocol/plan-metadata.ts';

export function encodePlan(plan: PlanData): string {
  return encodePlanPayload(JSON.stringify(plan, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)));
}

function readInteger(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d{1,19}n$/.test(value)) throw new Error('Invalid plan amount');
  return BigInt(value.slice(0, -1));
}

export function decodePlan(fragment: string): PlanData | null {
  try {
    const obj = decodePlanPayload(fragment.replace(/^#/, ''));
    if (!obj || typeof obj !== 'object') return null;
    const { version, network, splitMode, ownerAddress, categoryId, contractAddress, createdTxid, heirs } = obj as PlanData;
    if (version !== 1 || (network !== 'mainnet' && network !== 'chipnet') ||
        !['equal', 'custom', 'faraid'].includes(splitMode) ||
        !Array.isArray(heirs) || !heirs.length || heirs.length > MAX_HEIRS) return null;

    function validAddress(address: unknown, p2pkhOnly = false) {
      if (typeof address !== 'string' || address.length > 80 || !address.includes(':')) return false;
      const decoded = decodeCashAddress(address);
      return typeof decoded !== 'string' && decoded.prefix === addressPrefix(network) &&
        (!p2pkhOnly || ((decoded.type === 'p2pkh' || decoded.type === 'p2pkhWithTokens') && decoded.payload.length === 20));
    }
    const optionalId = (id: unknown) => id === undefined || (typeof id === 'string' && /^[a-f\d]{64}$/i.test(id));
    if (!validAddress(ownerAddress, true) || !optionalId(categoryId) || !optionalId(createdTxid) ||
        (contractAddress !== undefined && !validAddress(contractAddress))) return null;

    const normalizedHeirs = heirs.map(({ name, address, share, relation }) => {
      const weight = readInteger(share);
      if (typeof name !== 'string' || !validAddress(address, true) || weight <= 0n ||
          (relation !== undefined && typeof relation !== 'string')) throw new Error('Invalid heir');
      return { name, address, share: weight, ...(relation !== undefined && { relation }) };
    });
    const shareTotal = readInteger((obj as PlanData).shareTotal);
    const period = readInteger((obj as PlanData).period);
    const feeBudget = readInteger((obj as PlanData).feeBudget);
    if (period <= 0n || period > 0xffffffffn ||
        normalizedHeirs.reduce((total, heir) => total + heir.share, 0n) !== shareTotal) return null;
    return { version, network, splitMode, ownerAddress, categoryId, contractAddress, createdTxid, heirs: normalizedHeirs, shareTotal, period, feeBudget };
  } catch {
    return null;
  }
}

export function planUrl(plan: PlanData, origin = window.location.origin): string {
  return `${origin}${import.meta.env.BASE_URL}plan#${encodePlan(plan)}`;
}
