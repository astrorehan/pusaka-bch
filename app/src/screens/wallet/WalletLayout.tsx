import { HAS_DEMO } from '../../lib/demo';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  ScrollRestoration,
  useLocation,
} from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  History,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sun,
  Wallet,
  WalletCards,
  X,
} from 'lucide-react';
import { WalletButton } from '../../components/AppShell';
import { Banner } from '../../components/Banner';
import { Logo } from '../../components/Logo';
import { useMedia } from '../../components/useMedia';
import { shortAddress } from '../../lib/format';
import { NETWORK } from '../../lib/networkName';
import { getTheme } from '../../lib/theme';
import { useWallet } from '../../lib/wallet';
import { isDemoWallet, walletPath } from './paths';
import './wallet-theme.css';
import './wallet-layout.css';

const FOLD_KEY = 'pusaka.sidebar.folded';
const THEME_KEY = 'pusaka.wallet.theme';
const NAVIGATION = [
  { path: '/wallet', title: 'Wallet', icon: WalletCards },
  { path: '/wallet/swap', title: 'Swap', icon: ArrowLeftRight },
  { path: '/wallet/plan', title: 'Inheritance', icon: ShieldCheck },
  { path: '/wallet/activity', title: 'Activity', icon: History },
] as const;

function readFolded() {
  try {
    return localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
}

function readWalletTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* storage may be blocked */
  }
  return getTheme() === 'light' ? 'light' : 'dark';
}

function sectionFor(pathname: string) {
  const path = pathname.replace(/\/$/, '');
  if (path === '/wallet/edit') return 'Edit inheritance';
  if (path === '/new' || path === '/wallet/new') return 'Wallet setup';
  if (path === '/legacy/new') return 'Legacy plan setup';
  if (path === '/plan' || path === '/try') return 'Legacy inheritance';
  if (path === '/v2/plan') return 'Inheritance';
  return NAVIGATION.find((item) => item.path === path)?.title ?? 'Wallet';
}

function ThemeButton({
  rail,
  dark,
  toggle,
}: {
  rail: boolean;
  dark: boolean;
  toggle: () => void;
}) {
  return (
    <button
      type="button"
      className="pw-nav-link"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={
        rail
          ? dark
            ? 'Switch to light theme'
            : 'Switch to dark theme'
          : undefined
      }
      onClick={toggle}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
      <span className="pw-nav-label">
        {dark ? 'Light appearance' : 'Dark appearance'}
      </span>
    </button>
  );
}

function Sidebar({
  rail = false,
  drawer = false,
  onToggle,
  onNavigate,
  demo,
  pathname,
  dark,
  toggleTheme,
}: {
  rail?: boolean;
  drawer?: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  demo: boolean;
  pathname: string;
  dark: boolean;
  toggleTheme: () => void;
}) {
  const { status, wallet } = useWallet();
  const walletHome = walletPath('/wallet', demo);
  const section = sectionFor(pathname);
  return (
    <div className={`pw-sidebar-body${rail ? ' pw-sidebar-body--rail' : ''}`}>
      <div className="pw-sidebar-head">
        <Link
          to={walletHome}
          onClick={onNavigate}
          className="pw-brand"
          aria-label="Pusaka workspace"
        >
          <span className="pw-brand-mark">
            <Logo size={24} />
          </span>
          <span className="pw-nav-label">Pusaka</span>
        </Link>
        <button
          type="button"
          className="pw-icon"
          aria-label={
            drawer
              ? 'Close navigation'
              : rail
                ? 'Expand sidebar'
                : 'Fold sidebar'
          }
          title={drawer ? undefined : rail ? 'Expand sidebar' : 'Fold sidebar'}
          onClick={onToggle}
        >
          {drawer ? (
            <X aria-hidden />
          ) : rail ? (
            <PanelLeftOpen aria-hidden />
          ) : (
            <PanelLeftClose aria-hidden />
          )}
        </button>
      </div>

      <div className="pw-profile">
        <span className="pw-profile-icon">
          <Wallet aria-hidden size={19} />
        </span>
        <div className="pw-nav-label">
          <strong>{demo ? 'Demo wallet' : 'Personal wallet'}</strong>
          <small className={wallet && !demo ? 'mono' : undefined}>
            {demo
              ? 'Chipnet example'
              : wallet
                ? shortAddress(wallet.address)
                : status === 'connecting'
                  ? 'Connecting…'
                  : 'Not connected'}
          </small>
        </div>
      </div>

      <div className="pw-sidebar-scroll">
        <nav aria-label="Wallet navigation" className="pw-nav">
          {NAVIGATION.map(({ path, title, icon: Icon }) => (
            <Link
              key={path}
              to={walletPath(path, demo)}
              className="pw-nav-link"
              aria-current={section === title ? 'page' : undefined}
              title={rail ? title : undefined}
              onClick={onNavigate}
            >
              <Icon aria-hidden /> <span className="pw-nav-label">{title}</span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Resources" className="pw-nav pw-resources">
          <div className="pw-sidebar-label">Resources</div>
          {HAS_DEMO && (
            <Link
              to={demo ? '/wallet' : '/wallet/demo'}
              className="pw-nav-link"
              onClick={onNavigate}
              title={
                rail ? (demo ? 'Exit demo' : 'View demo wallet') : undefined
              }
            >
              <FlaskConical aria-hidden />{' '}
              <span className="pw-nav-label">
                {demo ? 'Exit demo' : 'View demo wallet'}
              </span>
            </Link>
          )}
          <NavLink
            to="/how-it-works"
            className="pw-nav-link"
            onClick={onNavigate}
            title={rail ? 'How it works' : undefined}
          >
            <CircleHelp aria-hidden />{' '}
            <span className="pw-nav-label">How it works</span>
          </NavLink>
        </nav>
      </div>

      <div className="pw-sidebar-foot">
        <ThemeButton rail={rail} dark={dark} toggle={toggleTheme} />
        <Link
          to="/"
          className="pw-nav-link"
          onClick={onNavigate}
          title={rail ? 'Pusaka home' : undefined}
        >
          <ArrowUpRight aria-hidden />{' '}
          <span className="pw-nav-label">Pusaka home</span>
        </Link>
      </div>
    </div>
  );
}

export function WalletLayout() {
  const location = useLocation();
  const desktop = useMedia('(min-width: 1280px)');
  const [theme, setTheme] = useState(readWalletTheme);
  const [folded, setFolded] = useState(readFolded);
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const banner = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const app = useRef<HTMLDivElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);
  const drawerId = useId();
  const demo = isDemoWallet(location.pathname, location.search);
  const title = sectionFor(location.pathname);
  const rail = !desktop || folded;
  const open = !desktop && drawerKey === location.key;
  if (drawerKey !== null && (desktop || drawerKey !== location.key))
    setDrawerKey(null);

  useLayoutEffect(() => {
    const container = app.current;
    const bar = banner.current;
    const top = header.current;
    if (!container || !bar || !top) return;
    const measure = () => {
      container.style.setProperty(
        '--pw-banner-height',
        `${bar.offsetHeight}px`,
      );
      container.style.setProperty(
        '--shell-top',
        `${bar.offsetHeight + top.offsetHeight}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(top);
    measure();
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (location.pathname === '/plan' || location.pathname === '/try') return;
    document.title = `${title} · Pusaka`;
    return () => {
      document.title = 'Pusaka';
    };
  }, [location.pathname, title]);

  function toggleSidebar() {
    if (!desktop) {
      setDrawerKey(location.key);
      return;
    }
    const next = !folded;
    setFolded(next);
    try {
      localStorage.setItem(FOLD_KEY, next ? '1' : '0');
    } catch {
      /* use this visit's choice */
    }
  }

  function closeDrawer() {
    setDrawerKey(null);
  }

  const dark = theme === 'dark';
  const sidebarProps = {
    demo,
    pathname: location.pathname,
    dark,
    toggleTheme: () => {
      const next = dark ? 'light' : 'dark';
      setTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* use this visit's choice */
      }
    },
  };

  return (
    <div
      className={`pw-app${rail ? ' pw-app--rail' : ''}`}
      data-wallet-theme={theme}
      ref={app}
    >
      <a
        className="skip-link"
        href="#wallet-main"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus({ preventScroll: true });
          main.current?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <div className="pw-banner" ref={banner}>
        <Banner />
      </div>
      <div className="pw-frame">
        <aside className="pw-sidebar">
          <Sidebar {...sidebarProps} rail={rail} onToggle={toggleSidebar} />
        </aside>
        <div className="pw-workspace">
          <header className="pw-topbar" ref={header}>
            <button
              type="button"
              className="pw-icon pw-menu-trigger"
              aria-label="Open navigation"
              aria-controls={drawerId}
              aria-expanded={open}
              onClick={toggleSidebar}
            >
              <Menu aria-hidden />
            </button>
            <Link
              to={walletPath('/wallet', demo)}
              className="pw-mobile-brand"
              aria-label="Pusaka workspace"
            >
              <Logo size={19} /> <span>Pusaka</span>
            </Link>
            <div className="pw-location">
              <Link
                to={walletPath('/wallet', demo)}
                className="pw-location-root"
              >
                Workspace
              </Link>
              <ChevronRight
                className="pw-location-divider"
                size={14}
                aria-hidden
              />
              <strong>{title}</strong>
            </div>
            {NETWORK === 'chipnet' && (
              <span
                className="pw-testnet"
                role="note"
                title="Test network: no real money"
              >
                <i aria-hidden /> Testnet
                <span className="sr-only">, no real money</span>
              </span>
            )}
            <WalletButton pill={false} />
          </header>
          <main id="wallet-main" tabIndex={-1} ref={main}>
            <Outlet />
          </main>
        </div>
      </div>
      <dialog
        id={drawerId}
        ref={drawer}
        className="pw-nav-drawer"
        aria-label="Workspace navigation"
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClick={(event) => {
          if (event.target === drawer.current) closeDrawer();
        }}
      >
        {open && (
          <Sidebar
            {...sidebarProps}
            drawer
            onToggle={closeDrawer}
            onNavigate={closeDrawer}
          />
        )}
      </dialog>
      <ScrollRestoration />
    </div>
  );
}
