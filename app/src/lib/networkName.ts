import type { NetworkName } from './types';

export const NETWORK: NetworkName = import.meta.env.VITE_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

/** The published app for the other network ('/pusaka-bch/chipnet/' from mainnet and back), or '' in other builds. */
export const OTHER_APP: string = import.meta.env.VITE_OTHER_APP ?? '';

/**
 * Where a page for the other network lives in that network's app, when this site has one.
 * `route` is the app path without its base, such as 'v2/plan#…'.
 */
export function otherAppUrl(planNetwork: string, route: string): string | null {
  if (!OTHER_APP || planNetwork === NETWORK || (planNetwork !== 'mainnet' && planNetwork !== 'chipnet')) return null;
  return OTHER_APP + route.replace(/^\//, '');
}

/** Open a plan link made on the other network in that network's app. Returns true when the page is leaving. */
export function openInOtherApp(planNetwork: string, route: string): boolean {
  const url = otherAppUrl(planNetwork, route);
  if (url) location.replace(url);
  return Boolean(url);
}
