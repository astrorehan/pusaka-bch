// Connect and restore WizardConnect sessions without loading the transaction builders.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlphanumericQRCode, useWizardConnect } from '@wizardconnect/react';
import { Check, Copy } from 'lucide-react';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { copyText } from './clipboard';
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
  const [linkCopy, setLinkCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const linkCopyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(linkCopyTimer.current), []);
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
      const info = { address, balance: null, name: session.name };
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
  const copyLink = useCallback(async () => {
    if (!uri) return;
    setLinkCopy((await copyText(uri)) ? 'copied' : 'failed');
    window.clearTimeout(linkCopyTimer.current);
    linkCopyTimer.current = window.setTimeout(() => setLinkCopy('idle'), 2000);
  }, [uri]);
  const copyStatus = linkCopy === 'copied' ? 'Copied connection link' : linkCopy === 'failed' ? 'Could not copy' : '';

  return (
    <Sheet
      open={pairing}
      onClose={() => {
        setLinkCopy('idle');
        clearWallet();
        void wiz.disconnect();
        settle(false);
      }}
      size="sm"
      title="Connect your wallet"
      description="Scan the QR code with Paytaca or Cashonize. On the same device, copy the link and paste it in Paytaca’s WizardConnect or Cashonize’s dApp connection screen."
      footer={uri && (
        <>
          <Button type="button" size="lg" block icon={linkCopy === 'copied' ? <Check /> : <Copy />} onClick={copyLink}>
            {copyStatus || 'Copy connection link'}
          </Button>
          <span role="status" className="sr-only">{copyStatus}</span>
        </>
      )}
    >
      {uri && wiz.qrUri ? (
        <div className="wallet-pair">
          <button
            type="button"
            className="wallet-pair__qr"
            data-copy-state={linkCopy}
            onClick={copyLink}
            aria-label="Tap QR code to copy wallet connection link"
          >
            <span role="img" aria-label="Wallet connection QR code" className="wallet-pair__qr-img">
              <AlphanumericQRCode value={wiz.qrUri} size={224} quietZone={12} />
            </span>
            <span className="wallet-pair__qr-hint">
              <Copy size={13} aria-hidden /> Tap QR code to copy
            </span>
          </button>
        </div>
      ) : <p role="status">Preparing the connection…</p>}
    </Sheet>
  );
}
