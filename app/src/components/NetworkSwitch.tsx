// Mainnet / Chipnet switcher when both network builds are published side-by-side (`OTHER_APP`).
// In single-network local builds, keeps the quiet Chipnet testnet badge so nothing links to a dead URL.
import { useLocation } from 'react-router-dom';
import { NETWORK, otherNetworkHref } from '../lib/networkName';

export function NetworkSwitch({ variant = 'shell' }: { variant?: 'shell' | 'workspace' }) {
  const { pathname } = useLocation();
  const switchHref = otherNetworkHref(pathname);
  const chipnet = NETWORK === 'chipnet';

  if (!switchHref) {
    if (!chipnet) return null;
    if (variant === 'workspace') {
      return (
        <span className="pw-testnet" role="note" title="Test network: no real money">
          <i aria-hidden /> Testnet
          <span className="sr-only">, no real money</span>
        </span>
      );
    }
    return (
      <div className="testnet-badge" role="note" title="Test network: no real money">
        Testnet
        <span className="sr-only">, no real money</span>
      </div>
    );
  }

  return (
    <div
      className={`net-switch net-switch--${variant}${chipnet ? ' net-switch--chipnet' : ''}`}
      role="group"
      aria-label="Bitcoin Cash network"
    >
      {chipnet ? (
        <>
          <a
            href={switchHref}
            className="net-switch__opt"
            title="Switch to Bitcoin Cash Mainnet (real BCH)"
          >
            Mainnet
          </a>
          <span
            className="net-switch__opt net-switch__opt--active net-switch__opt--test"
            role="note"
            aria-current="true"
            title="Test network: no real money"
          >
            <i aria-hidden /> Chipnet
            <span className="sr-only"> (test network, no real money)</span>
          </span>
        </>
      ) : (
        <>
          <span
            className="net-switch__opt net-switch__opt--active"
            aria-current="true"
            title="Bitcoin Cash Mainnet"
          >
            <i aria-hidden /> Mainnet
          </span>
          <a
            href={switchHref}
            className="net-switch__opt"
            title="Switch to Chipnet (test network, no real money)"
          >
            Chipnet
          </a>
        </>
      )}
    </div>
  );
}
