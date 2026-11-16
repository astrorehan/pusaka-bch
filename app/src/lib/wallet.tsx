// Wallet state shared by every screen. The wallet button lives at the top right (organiser's rule).
import { createContext, useContext, useState, type ReactNode } from 'react';
import { planService, type WalletInfo } from './planService';

type WalletStatus = 'disconnected' | 'connecting' | 'connected';

interface WalletCtx {
  status: WalletStatus;
  wallet: WalletInfo | null;
  /** resolves true when connected, false when the user cancelled */
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
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

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWallet outside WalletProvider');
  return c;
}
