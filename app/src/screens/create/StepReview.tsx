import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { formatBch, formatDate, formatUsd } from '../../lib/format';
import { planService, type WalletInfo } from '../../lib/planService';
import type { NetworkName, PlanData, TxPreview } from '../../lib/types';
import { Details, Notice, Waiting } from './Bits';
import { ShareBar } from './ShareBar';
import { ACTION_FEE_RANGE, buildPlan, parseAmount, periodSeconds, periodWords, type Draft, type Resolved, type Step } from './model';

interface Props {
  draft: Draft;
  resolved: Resolved;
  amounts: bigint[];
  leftover: bigint;
  usd: number | null;
  wallet: WalletInfo | null;
  walletBusy: boolean;
  network: NetworkName;
  onEdit(step: Step): void;
  onConnect(): void;
  onCreated(plan: PlanData, txid: string, amount: bigint): void;
}

type Tx = { s: 'idle' } | { s: 'waiting' } | { s: 'cancelled'; message: string } | { s: 'failed'; message: string; details?: string };

const LAG = 3600n;

export function StepReview({ draft, resolved, amounts, leftover, usd, wallet, walletBusy, network, onEdit, onConnect, onCreated }: Props) {
  const amount = parseAmount(draft.amount) ?? 0n;
  const [preview, setPreview] = useState<TxPreview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [slow, setSlow] = useState(false);
  const [tx, setTx] = useState<Tx>({ s: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const owner = wallet?.address ?? '';
  const [now] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const plan = useMemo(() => buildPlan(draft, network, owner), [draft, network, owner]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => live && setSlow(true), 300);
    planService.previewCreate(plan, amount)
      .then((p) => { if (live) setPreview(p); })
      .catch(() => { if (live) setPreviewError(true); })
      .finally(() => clearTimeout(t));
    return () => { live = false; clearTimeout(t); };
  }, [plan, amount, attempt]);

  const outTotal = preview ? preview.lines.reduce((s, l) => s + l.amount, 0n) + preview.networkFee : null;
  const tooMuch = wallet && outTotal !== null && outTotal > wallet.balance;
  const period = periodSeconds(draft) ?? 0n;
  const end = now + period - LAG;
  const usdOf = (s: bigint) => formatUsd(s, usd);

  async function sign() {
    if (!wallet) return;
    setTx({ s: 'waiting' });
    try {
      const r = await planService.createPlan(plan, amount);
      if (r.ok) onCreated(r.plan, r.txid, amount);
      else if (r.reason === 'cancelled') setTx({ s: 'cancelled', message: r.message || 'Cancelled in your wallet. Nothing was sent.' });
      else setTx({ s: 'failed', message: r.message, details: r.details });
    } catch (e) {
      setTx({ s: 'failed', message: "We couldn't reach the network. Nothing was sent. Check your connection and try again.", details: String(e) });
    }
  }

  const busy = tx.s === 'waiting';

  return (
    <div className="cr-stack">
      <section className="cr-card" aria-labelledby="rv-heirs">
        <div className="cr-card__head">
          <h2 id="rv-heirs" className="cr-card__title">Your heirs receive</h2>
          <button type="button" className="cr-link" onClick={() => onEdit(2)} disabled={busy}>Edit</button>
        </div>
        <ShareBar heirs={resolved.heirs} total={resolved.total} amounts={amounts} usd={usd} showAddress />
        {leftover > 0n && (
          <p className="cr-small muted num">
            {leftover.toLocaleString('en-US')} satoshi{leftover === 1n ? '' : 's'} left over from rounding go{leftover === 1n ? 'es' : ''} to the network fee.
          </p>
        )}
      </section>

      <section className="cr-card" aria-labelledby="rv-when">
        <div className="cr-card__head">
          <h2 id="rv-when" className="cr-card__title">When</h2>
          <button type="button" className="cr-link" onClick={() => onEdit(3)} disabled={busy}>Edit</button>
        </div>
        <p>After <strong>{periodWords(draft)}</strong> without “I’m still here”. From about <strong>{formatDate(end)}</strong>.</p>
        <p className="cr-small muted">The exact moment can be about an hour off, because the network's clock runs a little behind.</p>
      </section>

      <section className="cr-card" aria-labelledby="rv-now" aria-busy={!preview && !previewError}>
        <h2 id="rv-now" className="cr-card__title">Leaving your wallet now</h2>
        {previewError ? (
          <Notice tone="danger" title="We couldn't work out the fees." action={<Button variant="secondary" onClick={() => { setPreviewError(false); setSlow(false); setAttempt((n) => n + 1); }}>Try again</Button>}>
            Check your connection. Nothing was sent.
          </Notice>
        ) : !preview ? (
          slow ? (
            <ul className="cr-rows" aria-label="Loading">
              {[0, 1, 2].map((i) => <li key={i} className="cr-line"><span className="cr-skel" style={{ width: '55%' }} /><span className="cr-skel" style={{ width: '22%' }} /></li>)}
            </ul>
          ) : <div className="cr-skel-space" />
        ) : (
          <ul className="cr-rows">
            {preview.lines.map((l, i) => (
              <li key={i} className="cr-line">
                <span className="cr-line__label">
                  {l.label}
                  {l.kind === 'plan' && <span className="cr-line__sub">Your heirs share this later</span>}
                  {l.kind === 'fee' && <span className="cr-line__sub">Stays in the plan</span>}
                </span>
                <span className="cr-line__value num">{formatBch(l.amount)} BCH<span className="cr-line__sub">{usdOf(l.amount)}</span></span>
              </li>
            ))}
            <li className="cr-line">
              <span className="cr-line__label">Network fee<span className="cr-line__sub">To create the plan</span></span>
              <span className="cr-line__value num">{formatBch(preview.networkFee)} BCH<span className="cr-line__sub">{usdOf(preview.networkFee)}</span></span>
            </li>
            <li className="cr-line cr-line--total">
              <span className="cr-line__label">Total</span>
              <span className="cr-line__value num">{formatBch(outTotal!)} BCH<span className="cr-line__sub">{usdOf(outTotal!)}</span></span>
            </li>
          </ul>
        )}
        <p className="cr-small muted num">
          Later, each action (I’m still here, take my BCH back, send to heirs) costs a network fee of
          about {ACTION_FEE_RANGE[0].toLocaleString('en-US')} to {ACTION_FEE_RANGE[1].toLocaleString('en-US')} satoshis
          {usd ? ` (${usdOf(ACTION_FEE_RANGE[1])?.replace('≈ ', 'about ')})` : ''}, paid by whoever presses the button.
        </p>
      </section>

      <div className="cr-actions" aria-live="polite">
        {tx.s === 'waiting' ? (
          <Waiting text="Waiting for your wallet…" sub={`Approve the plan in ${wallet?.name ?? 'your wallet'}. Nothing is sent until you do.`} />
        ) : !wallet ? (
          <>
            <Notice title="Your wallet disconnected.">Everything you entered is kept. Connect again to sign.</Notice>
            <Button size="lg" block onClick={onConnect} loading={walletBusy}>{walletBusy ? 'Connecting…' : 'Connect wallet'}</Button>
          </>
        ) : tooMuch ? (
          <>
            <Notice tone="danger" title="Not enough BCH in your wallet.">
              Your wallet has {formatBch(wallet.balance)} BCH, and this plan needs {formatBch(outTotal!)} BCH. Lower the amount.
            </Notice>
            <Button size="lg" block onClick={() => onEdit(3)}>Change the amount</Button>
          </>
        ) : (
          <>
            {tx.s === 'cancelled' && <Notice title={tx.message}>Everything you entered is kept. Sign again when you're ready.</Notice>}
            {tx.s === 'failed' && (
              <Notice tone="danger" title={tx.message}>
                {tx.details && <Details text={tx.details} />}
              </Notice>
            )}
            <Button size="lg" block onClick={sign} disabled={!preview}>
              {tx.s === 'failed' ? 'Try again' : 'Sign in your wallet'}
            </Button>
            <p className="cr-small muted cr-center">Your wallet shows the same amounts before you approve.</p>
          </>
        )}
      </div>
    </div>
  );
}
