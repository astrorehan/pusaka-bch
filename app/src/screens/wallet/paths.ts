import { NETWORK } from '../../components/AppShell';

export function isDemoWallet(pathname: string, search: string) {
  return (
    NETWORK === 'chipnet' &&
    (pathname.replace(/\/$/, '') === '/wallet/demo' ||
      new URLSearchParams(search).get('demo') === '1')
  );
}

export function walletPath(path: string, demo: boolean) {
  if (!demo) return path;
  return path === '/wallet' ? '/wallet/demo' : `${path}?demo=1`;
}
