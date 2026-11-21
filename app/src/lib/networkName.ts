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

/** Map the current in-app route onto the sibling network's published app, when this site hosts both. */
export function otherNetworkHref(pathname: string): string | null {
  if (!OTHER_APP) return null;
  const clean = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  // A shared plan link belongs to one network's contracts; land on the wallet hub when switching.
  if (clean === '/v2/plan' || clean === '/plan' || clean === '/try') {
    return `${OTHER_APP}wallet`;
  }
  const relative = clean.replace(/^\//, '');
  return `${OTHER_APP}${relative}`;
}

/** Open a plan link made on the other network in that network's app. Returns true when the page is leaving. */
export function openInOtherApp(planNetwork: string, route: string): boolean {
  const url = otherAppUrl(planNetwork, route);
  if (url) location.replace(url);
  return Boolean(url);
}
