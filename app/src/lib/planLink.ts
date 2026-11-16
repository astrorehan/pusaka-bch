// The plan link: the whole PlanData in the URL fragment, so no server ever sees it.
// Format: <origin>/plan#<base64url(JSON with bigints as strings)>

import type { PlanData } from './types';

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodePlan(plan: PlanData): string {
  return toB64Url(JSON.stringify(plan, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)));
}

export function decodePlan(fragment: string): PlanData | null {
  try {
    const obj = JSON.parse(fromB64Url(fragment.replace(/^#/, '')), (_k, v) =>
      typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v,
    );
    if (obj?.version !== 1 || !Array.isArray(obj.heirs)) return null;
    return obj as PlanData;
  } catch {
    return null;
  }
}

export function planUrl(plan: PlanData, origin = window.location.origin): string {
  return `${origin}/plan#${encodePlan(plan)}`;
}
