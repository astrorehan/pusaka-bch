// The frame around every page: the hackathon banner, the test-network strip, the header and <main>.
// Header: logo and name on the left; desktop links; theme, phone menu and the wallet button on the right.
// The wallet button is the rightmost control on every width (organiser's rule).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { ExternalLink, Menu, Moon, Sun, Unplug, Wallet, X } from 'lucide-react';
import { Logo } from './Logo';
import { Button } from './Button';
import { Banner } from './Banner';
import { CopyButton } from './CopyButton';
import { Popover } from './Popover';
import { useMedia } from './useMedia';
import { DOCS_URL, REPO_URL } from './banner-config';
import { useWallet } from '../lib/wallet';
import { planService } from '../lib/planService';
import { formatBch, formatUsd, shortAddress } from '../lib/format';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import './shell.css';

export const NETWORK: 'mainnet' | 'chipnet' = (import.meta.env.VITE_NETWORK as 'mainnet' | 'chipnet') ?? 'chipnet';

/** Under 360 px the wallet button shortens so the header fits a 320 px phone. */
const NARROW = '(max-width: 359.98px)';

// ---------------------------------------------------------------- theme

function useThemeState() {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const systemDark = useMedia('(prefers-color-scheme: dark)');
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  function toggle() {
    const next: Theme = dark ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }
  return { dark, toggle };
}

// ---------------------------------------------------------------- wallet

function WalletPanel({ onDisconnect }: { onDisconnect: () => void }) {
  const { wallet } = useWallet();
  const [usd, setUsd] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    planService.usdPerBch().then((v) => live && setUsd(v)).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!wallet) return null;
  const dollars = formatUsd(wallet.balance, usd);
  return (
    <div className="wallet-panel">
      <p className="wallet-panel__head">
        <span className="wallet-panel__dot" aria-hidden />
        <span>Connected with <strong>{wallet.name}</strong></span>
      </p>
      <div className="wallet-panel__addr">
        <span className="mono" title={wallet.address}>{shortAddress(wallet.address, 4, 4)}</span>
        <CopyButton value={wallet.address} label="Copy your wallet address" />
      </div>
      <p className="wallet-panel__bal num">
        <strong>{formatBch(wallet.balance)} BCH</strong>
        {dollars && <span className="muted"> {dollars}</span>}
      </p>
      <Button variant="secondary" block icon={<Unplug />} onClick={onDisconnect}>Disconnect</Button>
    </div>
  );
}

function WalletButton() {
  const { status, wallet, connect, disconnect } = useWallet();
  const narrow = useMedia(NARROW);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const location = useLocation();

  // Close the panel when the page changes, or when the wallet is no longer connected.
  const [pageKey, setPageKey] = useState(location.key);
  if (pageKey !== location.key) {
    setPageKey(location.key);
    setOpen(false);
  }
  const panelOpen = open && status === 'connected';
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(false), 5000);
    return () => window.clearTimeout(t);
  }, [note]);
  async function onConnect() {
    setNote(false);
    const ok = await connect();
    if (!ok) setNote(true);
  }

  let button;
  if (status === 'connected' && wallet) {
    const body = wallet.address.split(':').pop() ?? wallet.address;
    const label = narrow ? `…${body.slice(-4)}` : `${body.slice(0, 4)}…${body.slice(-4)}`;
    button = (
      <Button
        ref={trigger}
        variant="secondary"
        className="wallet-btn wallet-btn--on"
        icon={<Wallet />}
        aria-expanded={panelOpen}
        aria-controls={panelId}
        aria-label={`Wallet ${shortAddress(wallet.address, 4, 4)}. Show wallet details`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mono">{label}</span>
      </Button>
    );
  } else {
    const connecting = status === 'connecting';
    // Under 360 px the label stays "Connect" while connecting, so the button never changes width under the
    // finger; the blooming logo in place of the wallet icon says it is waiting (DESIGN "Waiting state").
    const text = narrow ? 'Connect' : connecting ? 'Connecting…' : 'Connect wallet';
    button = (
      <Button
        variant="secondary"
        className="wallet-btn"
        onClick={onConnect}
        loading={connecting}
        icon={connecting ? <Logo size={20} bloom="loop" /> : <Wallet />}
        aria-label={connecting ? 'Connecting wallet' : 'Connect wallet'}
      >
        {text}
      </Button>
    );
  }

  return (
    <div className="wallet">
      {button}
      <Popover id={panelId} open={panelOpen} onClose={() => setOpen(false)} anchorRef={trigger} align="end" label="Wallet" className="wallet-popover">
        <WalletPanel
          onDisconnect={() => {
            setOpen(false);
            void disconnect();
          }}
        />
      </Popover>
      <div className="wallet-note-live" aria-live="polite">
        {note && (
          <p className="wallet-note" role="status">
            Cancelled in your wallet. You can connect any time.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- phone menu

function PhoneMenu({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const location = useLocation();
  const [pageKey, setPageKey] = useState(location.key);
  if (pageKey !== location.key) {
    setPageKey(location.key);
    setOpen(false);
  }

  return (
    <div className="phone-menu">
      <button
        ref={trigger}
        type="button"
        className="icon-btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="icon-swap" data-on={!open || undefined} aria-hidden><Menu /></span>
        <span className="icon-swap" data-on={open || undefined} aria-hidden><X /></span>
      </button>
      <Popover id={id} open={open} onClose={() => setOpen(false)} anchorRef={trigger} align="end" label="Menu" className="phone-menu__panel">
        <nav aria-label="Main">
          <ul className="menu-list">
            <li><NavLink to="/how-it-works" className="menu-item">How it works</NavLink></li>
            <li>
              <a href={DOCS_URL} target="_blank" rel="noreferrer" className="menu-item">
                Docs <ExternalLink aria-hidden className="menu-item__ext" />
              </a>
            </li>
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="menu-item">
                GitHub <ExternalLink aria-hidden className="menu-item__ext" />
              </a>
            </li>
          </ul>
        </nav>
        <div className="menu-sep" />
        <button type="button" role="switch" aria-checked={dark} className="menu-item menu-item--switch" onClick={onToggleTheme}>
          {dark ? <Moon aria-hidden className="menu-item__icon" /> : <Sun aria-hidden className="menu-item__icon" />}
          Dark theme
          <span className="switch" aria-hidden><span className="switch__thumb" /></span>
        </button>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------- shell

export function AppShell() {
  const { dark, toggle } = useThemeState();
  const top = useRef<HTMLDivElement>(null);

  // Publish the height of everything above <main>, so a screen can fill the first view exactly.
  useLayoutEffect(() => {
    const el = top.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--shell-top', `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <div ref={top} className="shell__top">
        <Banner />
        {NETWORK === 'chipnet' && <div className="testnet-badge" role="note">Test network: no real money</div>}
        <header className="header">
          <Link to="/" className="brand" aria-label="Pusaka home">
            <Logo size={26} />
            <span className="brand__name">Pusaka</span>
          </Link>
          <nav className="header__links" aria-label="Main">
            <NavLink to="/how-it-works">How it works</NavLink>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">Docs</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
          <div className="header__actions">
            <button
              type="button"
              className="icon-btn header__theme"
              onClick={toggle}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <span className="icon-swap" data-on={!dark || undefined} aria-hidden><Moon /></span>
              <span className="icon-swap" data-on={dark || undefined} aria-hidden><Sun /></span>
            </button>
            <PhoneMenu dark={dark} onToggleTheme={toggle} />
            <WalletButton />
          </div>
        </header>
      </div>
      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>
      {/* A new page starts at the top; Back and Forward return to where the reader was. */}
      <ScrollRestoration />
    </div>
  );
}
