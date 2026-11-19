// Connect and restore WizardConnect sessions without loading the transaction builders.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlphanumericQRCode, useWizardConnect } from '@wizardconnect/react';
import { ButtonLink } from '../components/Button';
import { CopyButton } from '../components/CopyButton';
import { Sheet } from '../components/Sheet';
import { plainBalance } from './chain/network';
import { getWizardWallet, setWizardWallet, WizardWallet } from './chain/wizard';
import { setChainWallet, type WalletInfo } from './planService';
import type { NetworkName } from './types';

export interface BridgeApi {
  /** opens the QR dialog and starts pairing; the outcome arrives through onSettle */
  connect(): void;
  disconnect(): Promise<void>;
}

export interface BridgeProps {
  network: NetworkName;
  sessionKey: string;
  onReady(api: BridgeApi): void;
  onState(state: { wallet: WalletInfo | null; connecting: boolean }): void;
  /** a connect() finished: true when a wallet is ready, false when the user closed the dialog */
  onSettle(ok: boolean): void;
}

export default function WizardBridge({ network, sessionKey, onReady, onState, onSettle }: BridgeProps) {
  const wiz = useWizardConnect({
    dappName: 'Pusaka',
    dappIcon: `${window.location.origin}${import.meta.env.BASE_URL}favicon.svg`,
    sessionKey,
  });
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const clearWallet = useCallback(() => {
    setWizardWallet(null);
    setChainWallet(null);
    setWallet(null);
  }, []);

  const settle = useCallback((ok: boolean) => {
    setDialogOpen(false);
    onSettle(ok);
  }, [onSettle]);

  // A session is usable once the wallet has shared its receive path (wallet_ready, or restored on reload).
  useEffect(() => {
    const manager = wiz.manager;
    if (wiz.state !== 'connected' || !manager) {
      clearWallet();
      return;
    }
    let current: WizardWallet | null = null;
    const ready = async () => {
      if (!manager.hasPath(0)) return;
      const session = new WizardWallet(manager, network);
      let address: string;
      try {
        address = session.ownerAddress();
      } catch {
        clearWallet();
        settle(false);
        return;
      }
      const info = { address, balance: 0n, name: session.name };
      current = session;
      setWizardWallet(session);
      setChainWallet(info);
      setWallet(info);
      settle(true);
      try {
        const parts = await Promise.all(session.derivedAddresses().map(({ address }) => plainBalance(network, address)));
        const balance = parts.reduce((t, b) => t + b, 0n);
        if (getWizardWallet() !== session) return;
        const withBalance = { ...info, balance };
        setChainWallet(withBalance);
        setWallet(withBalance);
      } catch {
        /* keep the session; the chain layer still refuses a call the wallet can't pay for, in plain words */
      }
    };
    void ready();
    manager.on('walletready', ready);
    return () => {
      manager.off('walletready', ready);
      if (getWizardWallet() === current) {
        setWizardWallet(null);
        setChainWallet(null);
      }
    };
  }, [wiz.state, wiz.manager, settle, network, clearWallet]);

  const connectionFailed = Boolean(wiz.error) || wiz.state === 'disconnected';
  useEffect(() => {
    if (dialogOpen && connectionFailed) onSettle(false);
  }, [dialogOpen, connectionFailed, onSettle]);

  // Report the session up to the provider.
  const pairing = dialogOpen && !connectionFailed && !wallet;
  const connecting = !wallet && (wiz.state === 'connecting' || pairing);
  useEffect(() => { onState({ wallet, connecting }); }, [wallet, connecting, onState]);

  // Hand the provider an API that always sees the latest session.
  const latest = useRef({ wiz, wallet });
  useEffect(() => { latest.current = { wiz, wallet }; });
  useEffect(() => {
    onReady({
      connect() {
        const { wiz: w, wallet: current } = latest.current;
        if (current) { onSettle(true); return; }
        try {
          if (w.state === 'connecting' || w.connect()) {
            setDialogOpen(true);
            return;
          }
        } catch { /* The relay could not start. */ }
        onSettle(false);
      },
      async disconnect() {
        clearWallet();
        await latest.current.wiz.disconnect();
      },
    });
  }, [onReady, onSettle, clearWallet]);

  const uri = wiz.uri?.startsWith('wiz://') ? wiz.uri : null;
  return (
    <Sheet
      open={pairing}
      onClose={() => {
        clearWallet();
        void wiz.disconnect();
        settle(false);
      }}
      size="sm"
      title="Connect your wallet"
      description="Scan the code with Paytaca or another WizardConnect wallet."
      footer={uri && <ButtonLink href={uri} size="lg" block>Open in wallet</ButtonLink>}
    >
      {uri && wiz.qrUri ? (
        <div className="wallet-pair">
          <div role="img" aria-label="Wallet connection QR code">
            <AlphanumericQRCode value={wiz.qrUri} size={224} quietZone={12} />
          </div>
          <div className="wallet-pair__link">
            <span>Wallet connection link</span>
            <CopyButton value={uri} label="Copy wallet connection link" size="sm" />
          </div>
        </div>
      ) : <p role="status">Preparing the connection…</p>}
    </Sheet>
  );
}
