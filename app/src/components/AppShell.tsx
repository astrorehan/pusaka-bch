import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Moon, Sun, Wallet } from 'lucide-react';
import { Logo } from './Logo';
import { Button } from './Button';
import { useWallet } from '../lib/wallet';
import { shortAddress } from '../lib/format';
import { applyTheme, getTheme, isDark, type Theme } from '../lib/theme';
import './shell.css';

export const NETWORK: 'mainnet' | 'chipnet' = (import.meta.env.VITE_NETWORK as 'mainnet' | 'chipnet') ?? 'chipnet';

function WalletButton() {
  const { status, wallet, connect, disconnect } = useWallet();
  if (status === 'connected' && wallet) {
    return (
      <Button variant="secondary" onClick={disconnect} title="Disconnect wallet" icon={<Wallet />}>
        <span className="mono">{shortAddress(wallet.address, 0, 4).replace('bitcoincash:', '')}</span>
      </Button>
    );
  }
  return (
    <Button variant="secondary" onClick={connect} loading={status === 'connecting'} icon={<Wallet />}>
      {status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
    </Button>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const dark = isDark(theme);
  return (
    <button
      className="icon-btn"
      onClick={() => {
        const next: Theme = dark ? 'light' : 'dark';
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

export function AppShell() {
  return (
    <div className="shell">
      {NETWORK === 'chipnet' && <div className="testnet-badge" role="note">Test network: no real money</div>}
      <header className="header">
        <Link to="/" className="brand" aria-label="Pusaka home">
          <Logo size={26} />
          <span className="brand__name">Pusaka</span>
        </Link>
        <nav className="header__links" aria-label="Main">
          <Link to="/how-it-works">How it works</Link>
          <a href="https://github.com/astrorehan/pusaka-bch" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="header__actions">
          <ThemeToggle />
          <WalletButton />
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
