import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '../../components/Button';
import { useWallet } from '../../lib/wallet';
import { formatBch, formatUsd, shortAddress } from '../../lib/format';
import { Notice, Waiting } from './Bits';

interface Props { onDone(): void; usd: number | null }

/** Step 1. One tap (or one scan). If the wallet is already connected, the flow skips this step. */
export function StepWallet({ onDone, usd }: Props) {
  const { status, wallet, connect, disconnect } = useWallet();
  const [cancelled, setCancelled] = useState(false);

  async function onConnect() {
    setCancelled(false);
    const ok = await connect();
    if (ok) onDone();
    else setCancelled(true);
  }

  return (
    <div className="cr-stack">
      <div className="cr-card cr-wallet">
        {status === 'connecting' ? (
          <Waiting text="Waiting for your wallet…" sub="Scan the code with your wallet, or approve the request in the wallet app." />
        ) : status === 'connected' && wallet ? (
          <div className="cr-wallet__on">
            <span className="cr-wallet__icon cr-wallet__icon--on"><Wallet aria-hidden /></span>
            <div>
              <p className="cr-wallet__name">{wallet.name}</p>
              <p className="cr-wallet__addr mono" title={wallet.address}>{shortAddress(wallet.address)}</p>
              <p className="cr-wallet__bal num">
                {formatBch(wallet.balance)} BCH <span className="muted">{formatUsd(wallet.balance, usd)}</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="cr-wallet__off">
            <span className="cr-wallet__icon"><Wallet aria-hidden /></span>
            <p className="cr-wallet__lead">Your BCH stays in your wallet until you approve the plan at the end.</p>
            <p className="cr-wallet__works muted">Works with Paytaca and Cashonize.</p>
          </div>
        )}
      </div>

      {cancelled && status !== 'connecting' && (
        <div role="status"><Notice title="Connection cancelled in your wallet.">Nothing was shared. Try again when you're ready.</Notice></div>
      )}

      <div className="cr-actions">
        {status === 'connected' && wallet ? (
          <>
            <Button size="lg" block onClick={onDone}>Continue</Button>
            <Button variant="ghost" block onClick={() => disconnect()}>Use another wallet</Button>
          </>
        ) : status === 'connecting' ? null : (
          <Button size="lg" block onClick={onConnect}>Connect wallet</Button>
        )}
      </div>
    </div>
  );
}
