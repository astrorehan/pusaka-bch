// The WizardConnect session, loaded lazily by the wallet provider (lib/wallet.tsx) after the first paint.
// WizardConnect brings nostr and the libauth crypto (about 250 KB gzipped); keeping it out of the first chunk
// lets the home page draw at once. This component renders only the QR dialog and reports the session up to
// the provider, so loading it never remounts the page.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWizardConnect, WizardConnectQRDialog } from '@wizardconnect/react';
import { loadChain, setChainWallet, type WalletInfo } from './planService';
import type { NetworkName } from './types';

export interface BridgeApi {
  /** opens the QR dialog and starts pairing; the outcome arrives through onSettle */
  connect(): void;
  disconnect(): Promise<void>;
}

export interface BridgeProps {
  network: NetworkName;
  onReady(api: BridgeApi): void;
  onState(state: { wallet: WalletInfo | null; connecting: boolean }): void;
  /** a connect() finished: true when a wallet is ready, false when the user closed the dialog */
  onSettle(ok: boolean): void;
}

export default function WizardBridge({ network, onReady, onState, onSettle }: BridgeProps) {
  const wiz = useWizardConnect({
    dappName: 'Pusaka',
    dappIcon: `${window.location.origin}/favicon.svg`,
  });
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  /** True once a session was handed to the chain layer. Until then nothing loads the chain chunk, so the
   *  first screen stays light (the SolidCash SDK is large). */
  const handedOver = useRef(false);

  const settle = useCallback((ok: boolean) => {
    setDialogOpen(false);
    onSettle(ok);
  }, [onSettle]);

  // A session is usable once the wallet has shared its receive path (wallet_ready, or restored on reload).
  useEffect(() => {
    const manager = wiz.manager;
    if (wiz.state !== 'connected' || !manager) {
      if (wiz.state === 'disconnected' || wiz.state === 'idle') {
        setWallet(null);
        setChainWallet(null);
        if (handedOver.current) {
          handedOver.current = false;
          void loadChain().then((c) => c.setWizardManager(null, network));
        }
      }
      return;
    }
    let cancelled = false;
    const ready = async () => {
      if (!manager.hasPath(0) || cancelled) return;
      const chain = await loadChain();
      chain.setWizardManager(manager, network);
      handedOver.current = true;
      const info = chain.chainPlanService.wallet();
      if (cancelled || !info) return;
      setChainWallet(info);
      setWallet(info);
      settle(true);
      // chainPlanService.wallet() reports a balance of 0 (unknown). Screens check the balance before signing
      // ("Your wallet has 0 BCH" would block Send to heirs), so read the real one: the plain coins on every
      // address the wallet can sign for, which is what the chain layer gathers before a call.
      try {
        const [{ WizardWallet }, { plainBalance }] = await Promise.all([import('./chain/wizard'), import('./chain/network')]);
        const addresses = new WizardWallet(manager, network).derivedAddresses().map((d) => d.address);
        const parts = await Promise.all(addresses.map((a) => plainBalance(network, a)));
        const balance = parts.reduce((t, b) => t + b, 0n);
        if (cancelled) return;
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
      cancelled = true;
      manager.off('walletready', ready);
    };
  }, [wiz.state, wiz.manager, settle, network]);

  // Report the session up to the provider.
  const connecting = !wallet && (wiz.state === 'connecting' || dialogOpen);
  useEffect(() => { onState({ wallet, connecting }); }, [wallet, connecting, onState]);

  // Hand the provider an API that always sees the latest session.
  const latest = useRef({ wiz, wallet });
  useEffect(() => { latest.current = { wiz, wallet }; });
  useEffect(() => {
    onReady({
      connect() {
        const { wiz: w, wallet: current } = latest.current;
        if (current) { onSettle(true); return; }
        setDialogOpen(true);
        if (w.state !== 'connecting') w.connect();
      },
      async disconnect() {
        await latest.current.wiz.disconnect();
        setWallet(null);
        setChainWallet(null);
        if (handedOver.current) {
          handedOver.current = false;
          (await loadChain()).setWizardManager(null, network);
        }
      },
    });
  }, [onReady, onSettle, network]);

  if (!wiz.uri || !wiz.qrUri) return null;
  return (
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
  );
}
