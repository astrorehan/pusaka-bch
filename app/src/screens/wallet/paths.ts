import { HAS_DEMO } from '../../lib/demo';

export function isDemoRoute(pathname: string, search: string) {
  const route = pathname.toLowerCase().replace(/\/$/, '');
  return route === '/wallet/demo' ||
    (['/wallet', '/wallet/plan', '/wallet/swap', '/wallet/activity'].includes(route) &&
      new URLSearchParams(search).get('demo') === '1');
}

export function isDemoWallet(pathname: string, search: string) {
  return HAS_DEMO && isDemoRoute(pathname, search);
}

export function walletPath(path: string, demo: boolean) {
  if (!demo) return path;
  return path === '/wallet' ? '/wallet/demo' : `${path}?demo=1`;
}
