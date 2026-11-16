// Wallet state shared by every screen. The wallet button lives at the top right (organiser's rule).
// Real mode pairs a wallet over WizardConnect (QR code or wiz:// link); mock mode (`?mock`) simulates one.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWizardConnect, WizardConnectQRDialog } from '@wizardconnect/react';
import { isMockMode, loadChain, planService, setChainWallet, type WalletInfo } from './planService';
import type { NetworkName } from './types';

type WalletStatus = 'disconnected' | 'connecting' | 'connected';

interface WalletCtx {
  status: WalletStatus;
  wallet: WalletInfo | null;
  /** resolves true when connected, false when the user cancelled */
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);
const NETWORK: NetworkName = (import.meta.env.VITE_NETWORK as NetworkName) ?? 'chipnet';

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

function WizardWalletProvider({ children }: { children: ReactNode }) {
  const wiz = useWizardConnect({
    dappName: 'Pusaka',
    dappIcon: `${window.location.origin}/favicon.svg`,
  });
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pending = useRef<((ok: boolean) => void) | null>(null);
  /** True once a session was handed to the chain layer. Until then nothing loads the chain chunk, so the
   *  first screen stays light (the SolidCash SDK is large). */
  const handedOver = useRef(false);

  const settle = useCallback((ok: boolean) => {
    pending.current?.(ok);
    pending.current = null;
    setDialogOpen(false);
  }, []);

  // A session is usable once the wallet has shared its receive path (wallet_ready, or restored on reload).
  useEffect(() => {
    const manager = wiz.manager;
    if (wiz.state !== 'connected' || !manager) {
      if (wiz.state === 'disconnected' || wiz.state === 'idle') {
        setWallet(null);
        setChainWallet(null);
        if (handedOver.current) {
          handedOver.current = false;
          void loadChain().then((c) => c.setWizardManager(null, NETWORK));
        }
      }
      return;
    }
    let cancelled = false;
    const ready = async () => {
      if (!manager.hasPath(0) || cancelled) return;
      const chain = await loadChain();
      chain.setWizardManager(manager, NETWORK);
      handedOver.current = true;
      const info = chain.chainPlanService.wallet();
      if (cancelled || !info) return;
      setChainWallet(info);
      setWallet(info);
      settle(true);
    };
    void ready();
    manager.on('walletready', ready);
    return () => {
      cancelled = true;
      manager.off('walletready', ready);
    };
  }, [wiz.state, wiz.manager, settle]);

  const connect = useCallback(() => {
    if (wallet) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setDialogOpen(true);
      if (wiz.state !== 'connecting') wiz.connect();
    });
  }, [wallet, wiz]);

  const disconnect = useCallback(async () => {
    await wiz.disconnect();
    setWallet(null);
    setChainWallet(null);
    if (handedOver.current) {
      handedOver.current = false;
      (await loadChain()).setWizardManager(null, NETWORK);
    }
  }, [wiz]);

  const status: WalletStatus = wallet ? 'connected' : wiz.state === 'connecting' || dialogOpen ? 'connecting' : 'disconnected';

  return (
    <Ctx.Provider value={{ status, wallet, connect, disconnect }}>
      {children}
      {wiz.uri && wiz.qrUri && (
        <WizardConnectQRDialog
          show={dialogOpen && !wallet}
          onClose={() => {
            void wiz.disconnect();
            settle(false);
          }}
          uri={wiz.uri}
          qrUri={wiz.qrUri}
          title="Connect your wallet"
          subtitle="Scan with a WizardConnect wallet, or open the link on this device."
          theme={{
            backdropColor: 'var(--scrim)',
            dialogBackground: 'var(--surface)',
            headerBackground: 'var(--surface)',
            titleColor: 'var(--text)',
            subtitleColor: 'var(--text-muted)',
            qrForeground: '#131B33',
            qrBackground: '#FFFFFF',
            uriRowBackground: 'var(--surface-2)',
            uriTextColor: 'var(--text-muted)',
            borderColor: 'var(--border)',
            closeButtonColor: 'var(--text-muted)',
            copyButtonColor: 'var(--text-muted)',
          }}
        />
      )}
    </Ctx.Provider>
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  return isMockMode() ? <MockWalletProvider>{children}</MockWalletProvider> : <WizardWalletProvider>{children}</WizardWalletProvider>;
}

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWallet outside WalletProvider');
  return c;
}
