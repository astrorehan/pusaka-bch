// Wallet state shared by every screen. The wallet button lives at the top right (organiser's rule).
// Real mode pairs a wallet over WizardConnect (QR code or wiz:// link); mock mode (`?mock`) simulates one.
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { isMockMode, planService, type WalletInfo } from './planService';
import type { BridgeApi, BridgeProps } from './wizardBridge';
import { NETWORK } from './networkName';

type WalletStatus = 'disconnected' | 'connecting' | 'connected';

interface WalletCtx {
  status: WalletStatus;
  wallet: WalletInfo | null;
  /** resolves true when connected, false when the user cancelled */
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);
const WIZARD_SESSION_KEY = 'wizardconnect-session';

function MockWalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletInfo | null>(planService.wallet());
  const [status, setStatus] = useState<WalletStatus>(wallet ? 'connected' : 'disconnected');

  async function connect() {
    setStatus('connecting');
    const r = await planService.connectWallet();
    if ('cancelled' in r) {
      setStatus('disconnected');
      return false;
    }
    setWallet(r);
    setStatus('connected');
    return true;
  }

  async function disconnect() {
    await planService.disconnectWallet();
    setWallet(null);
    setStatus('disconnected');
  }

  return <Ctx.Provider value={{ status, wallet, connect, disconnect }}>{children}</Ctx.Provider>;
}

/** Load WizardConnect when a user connects or has a session to restore. */
const WizardBridge = lazy<ComponentType<BridgeProps>>(() =>
  import('./wizardBridge').catch(() => ({
    // Offline or a failed deploy: say "not connected" instead of breaking the page.
    default: function Unavailable({ onState, onSettle }: BridgeProps) {
      useEffect(() => {
        onState({ wallet: null, connecting: false });
        onSettle(false);
      }, [onState, onSettle]);
      return null;
    },
  })),
);

const whenIdle = (fn: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 2000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 600);
  return () => window.clearTimeout(id);
};

function WizardWalletProvider({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState(false);
  const [session, setSession] = useState<{ wallet: WalletInfo | null; connecting: boolean }>({ wallet: null, connecting: false });
  /** connect() was pressed before WizardConnect finished loading */
  const [waitingForBridge, setWaitingForBridge] = useState(false);
  const api = useRef<BridgeApi | null>(null);
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(WIZARD_SESSION_KEY)) return whenIdle(() => setLoad(true));
    } catch { /* Connect remains available if browser storage is blocked. */ }
  }, []);

  const onReady = useCallback((a: BridgeApi) => {
    const first = !api.current;
    api.current = a;
    if (first && pending.current) {
      a.connect();
    }
  }, []);
  const onSettle = useCallback((ok: boolean) => {
    setWaitingForBridge(false);
    pending.current?.resolve(ok);
    pending.current = null;
  }, []);

  const connect = useCallback(() => {
    if (session.wallet) return Promise.resolve(true);
    if (pending.current) return pending.current.promise;
    let settle!: (ok: boolean) => void;
    const promise = new Promise<boolean>((resolve) => { settle = resolve; });
    pending.current = { promise, resolve: settle };
    setWaitingForBridge(true);
    if (api.current) api.current.connect();
    else setLoad(true);
    return promise;
  }, [session.wallet]);

  const disconnect = useCallback(async () => {
    await api.current?.disconnect();
    setSession({ wallet: null, connecting: false });
  }, []);

  const status: WalletStatus = session.wallet ? 'connected' : session.connecting || waitingForBridge ? 'connecting' : 'disconnected';

  return (
    <Ctx.Provider value={{ status, wallet: session.wallet, connect, disconnect }}>
      {children}
      {load && (
        <Suspense fallback={null}>
          <WizardBridge network={NETWORK} sessionKey={WIZARD_SESSION_KEY} onReady={onReady} onState={setSession} onSettle={onSettle} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  return import.meta.env.DEV && isMockMode()
    ? <MockWalletProvider>{children}</MockWalletProvider>
    : <WizardWalletProvider>{children}</WizardWalletProvider>;
}

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWallet outside WalletProvider');
  return c;
}
