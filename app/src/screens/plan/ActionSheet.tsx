// Every action goes through here: review (every coin that moves, where, and the network fee) ->
// waiting for the wallet -> sending (the plan is read again) -> sent, cancelled or failed.
import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, CalendarPlus, Check, Undo2, Wallet } from 'lucide-react';
import { Button } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { planService } from '../../lib/planService';
import { useWallet } from '../../lib/wallet';
import { explorerTxUrl, formatBch } from '../../lib/format';
import type { PlanData, PlanState, TxPreview, TxResult } from '../../lib/types';
import { Address, Amount, Disclosure } from './bits';
import { heirColor } from './util';
import { Sheet } from './Sheet';
import { formatDateTime } from './time';

export type PlanAction = 'send' | 'checkin' | 'takeback';
type Phase = 'review' | 'waiting' | 'sending' | 'sent' | 'cancelled' | 'failed';

const TITLES: Record<PlanAction, string> = {
  send: 'Send to heirs',
  checkin: "I'm still here",
  takeback: 'Take my BCH back',
};

interface Props {
  action: PlanAction | null;
  plan: PlanData;
  state: PlanState;
  usd: number | null;
  onClose(): void;
  /** re-reads the plan; resolves once the page shows the new state */
  refresh(): Promise<void>;
  onReminder(): void;
}

const ACT: Record<PlanAction, { preview(p: PlanData): Promise<TxPreview>; run(p: PlanData): Promise<TxResult> }> = {
  send: { preview: (p) => planService.previewSendToHeirs(p), run: (p) => planService.sendToHeirs(p) },
  checkin: { preview: (p) => planService.previewCheckIn(p), run: (p) => planService.checkIn(p) },
  takeback: { preview: (p) => planService.previewTakeBack(p), run: (p) => planService.takeBack(p) },
};

export function ActionSheet(props: Props) {
  const { action } = props;
  // Keep the last action while the sheet animates out.
  // Each opening starts a fresh flow; closing keeps the last one on screen while it animates out.
  const [shown, setShown] = useState<{ action: PlanAction; id: number } | null>(null);
  const [prevAction, setPrevAction] = useState<PlanAction | null>(null);
  if (action !== prevAction) {
    setPrevAction(action);
    if (action) setShown({ action, id: (shown?.id ?? 0) + 1 });
  }
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  return (
    <Sheet open={!!action} closable={!busy} onClose={props.onClose} labelledBy={titleId}>
      {shown && <Flow key={shown.id} {...props} action={shown.action} titleId={titleId} setBusy={setBusy} />}
    </Sheet>
  );
}

function Flow({ action, plan, state, usd, onClose, refresh, onReminder, titleId, setBusy }: Props & { action: PlanAction; titleId: string; setBusy(b: boolean): void }) {
  const { wallet, status: walletStatus, connect } = useWallet();
  const [phase, setPhase] = useState<Phase>('review');
  const [preview, setPreview] = useState<TxPreview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);
  const [connectCancelled, setConnectCancelled] = useState(false);

  useEffect(() => {
    let live = true;
    ACT[action].preview(plan).then((p) => live && setPreview(p)).catch(() => live && setPreviewError(true));
    return () => { live = false; };
  }, [action, plan]);

  useEffect(() => { setBusy(phase === 'waiting' || phase === 'sending'); }, [phase, setBusy]);
  useEffect(() => () => setBusy(false), [setBusy]);

  // Move focus with the phase: to its main button when there is one, else to the dialog itself.
  const root = useRef<HTMLDivElement>(null);
  const previewReady = preview != null;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ?? el.closest<HTMLElement>('[role="dialog"]');
    target?.focus({ preventScroll: true });
  }, [phase, previewReady]);

  const fee = preview?.networkFee ?? 0n;
  const short = wallet != null && preview != null && wallet.balance < fee;

  async function confirm() {
    if (!wallet) {
      setConnectCancelled(false);
      const ok = await connect();
      if (!ok) setConnectCancelled(true);
      return;
    }
    setPhase('waiting');
    const r = await ACT[action].run(plan).catch((e: unknown): TxResult => ({
      ok: false, reason: 'failed', message: 'Something went wrong before your wallet was asked. Nothing was sent.', details: String(e),
    }));
    setResult(r);
    if (!r.ok) { setPhase(r.reason === 'cancelled' ? 'cancelled' : 'failed'); return; }
    // Say "Sending…" until the network shows the new state.
    setPhase('sending');
    await refresh().catch(() => undefined);
    setPhase('sent');
  }

  const live =
    phase === 'waiting' ? 'Waiting for your wallet…' :
    phase === 'sending' ? 'Sending…' :
    phase === 'sent' ? (action === 'send' ? 'Sent to heirs.' : action === 'checkin' ? 'Done. Your heirs keep waiting.' : 'Your BCH is back in your wallet.') :
    phase === 'cancelled' ? 'Cancelled in your wallet. Nothing was sent.' :
    phase === 'failed' ? "This didn't go through. Nothing was sent." : '';

  return (
    <div className="ax" ref={root}>
      <p className="sr-only" aria-live="polite" role="status">{live}</p>

      {phase === 'review' && (
        <div className="ax-phase" key="review">
          <h2 id={titleId} className="ax-title">{TITLES[action]}</h2>
          <p className="ax-lead">{lead(action, plan)}</p>

          {action === 'takeback' && (
            <div className="ax-warn" role="note">
              <AlertCircle aria-hidden />
              <p>This closes your plan. Your heirs will receive nothing from it. You can make a new plan any time.</p>
            </div>
          )}

          {!preview && !previewError && <ReviewSkeleton />}
          {previewError && <p className="ax-note ax-note--danger">We couldn't work out this transaction. Close this and try again in a moment.</p>}

          {preview && (
            <Review action={action} plan={plan} state={state} preview={preview} usd={usd} />
          )}

          <div className="ax-foot">
            {!wallet && (
              <p className="ax-note">
                <Wallet aria-hidden />
                <span>Connect a BCH wallet, such as Paytaca or Cashonize. It pays the network fee{preview ? <> of <b className="num">{formatBch(fee)} BCH</b></> : null}.{action === 'send' ? " The heirs' shares are not touched." : ''}</span>
              </p>
            )}
            {connectCancelled && !wallet && <p className="ax-note ax-note--muted" role="status">Cancelled in your wallet. Nothing was shared. Connect again when you're ready.</p>}
            {short && wallet && (
              <p className="ax-note ax-note--danger" role="alert">
                Your wallet has {formatBch(wallet.balance)} BCH. It needs at least {formatBch(fee)} BCH for the network fee. Add a little BCH, then try again.
              </p>
            )}
            {wallet && !short && <p className="ax-sign">Your wallet will ask you to sign. Nothing moves until you do.</p>}
            <div className="ax-buttons">
              {action === 'takeback' && <Button variant="secondary" size="lg" block onClick={onClose} data-autofocus>Keep my plan</Button>}
              <Button
                variant="primary"
                className={action === 'takeback' && wallet ? 'ax-btn-danger' : ''}
                size="lg"
                block
                data-autofocus={action === 'takeback' ? undefined : true}
                disabled={!preview || short}
                loading={walletStatus === 'connecting'}
                icon={!wallet ? <Wallet /> : undefined}
                onClick={confirm}
              >
                {!wallet ? (walletStatus === 'connecting' ? 'Connecting…' : 'Connect wallet') : TITLES[action]}
              </Button>
            </div>
          </div>
        </div>
      )}

      {(phase === 'waiting' || phase === 'sending') && (
        <div className="ax-phase ax-centre" key="busy">
          <Logo size={40} bloom="loop" />
          <h2 id={titleId} className="ax-status">{phase === 'waiting' ? 'Waiting for your wallet…' : 'Sending…'}</h2>
          <p className="ax-sub">
            {phase === 'waiting'
              ? `Open ${wallet?.name ?? 'your wallet'} and approve the request.`
              : 'Waiting for the network to confirm it.'}
          </p>
          <div className="ax-progress" aria-hidden><span /></div>
        </div>
      )}

      {phase === 'sent' && result?.ok && (
        <Sent action={action} plan={plan} state={state} usd={usd} preview={preview} txid={result.txid} titleId={titleId} onClose={onClose} onReminder={onReminder} />
      )}

      {phase === 'cancelled' && (
        <div className="ax-phase ax-centre" key="cancelled">
          <span className="ax-icon ax-icon--muted"><Undo2 aria-hidden /></span>
          <h2 id={titleId} className="ax-status">Cancelled in your wallet</h2>
          <p className="ax-sub">Nothing was sent. You can try again whenever you're ready.</p>
          <div className="ax-buttons ax-buttons--row">
            <Button variant="secondary" size="lg" block onClick={onClose}>Close</Button>
            <Button size="lg" block data-autofocus onClick={() => { setResult(null); setPhase('review'); }}>Try again</Button>
          </div>
        </div>
      )}

      {phase === 'failed' && result && !result.ok && (
        <div className="ax-phase ax-centre" key="failed">
          <span className="ax-icon ax-icon--danger"><AlertCircle aria-hidden /></span>
          <h2 id={titleId} className="ax-status">This didn't go through</h2>
          <p className="ax-sub">{result.message}</p>
          {result.details && (
            <Disclosure summary="Details" className="ax-details">
              <code className="mono">{result.details}</code>
            </Disclosure>
          )}
          <div className="ax-buttons ax-buttons--row">
            <Button variant="secondary" size="lg" block onClick={onClose}>Close</Button>
            <Button size="lg" block data-autofocus onClick={() => { setResult(null); setPhase('review'); }}>Try again</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function lead(action: PlanAction, plan: PlanData): string {
  const n = plan.heirs.length;
  if (action === 'send') return `Every heir gets their share in one transaction. Here is exactly what moves.`;
  if (action === 'checkin') return `This tells the plan you're still here. The waiting time starts again, and your ${n} ${n === 1 ? 'heir keeps' : 'heirs keep'} waiting.`;
  return 'Everything in the plan comes back to your wallet.';
}

function ReviewSkeleton() {
  return (
    <div className="ax-group" aria-hidden>
      {[0, 1, 2].map((i) => <div key={i} className="ax-row"><span className="sk sk--line" style={{ width: '40%' }} /><span className="sk sk--line" style={{ width: '24%' }} /></div>)}
    </div>
  );
}

function Review({ action, plan, state, preview, usd }: { action: PlanAction; plan: PlanData; state: PlanState; preview: TxPreview; usd: number | null }) {
  const fromPlan = preview.lines;
  const paidOut = fromPlan.reduce((a, l) => a + l.amount, 0n);
  const leftover = action === 'send' ? state.balance - plan.feeBudget - paidOut : 0n;
  const [openedAt] = useState(() => Date.now());
  const newDeadline = openedAt + Number(plan.period) * 1000;

  return (
    <>
      {action === 'checkin' && (
        <div className="ax-group">
          <div className="ax-row">
            <span className="ax-row__label">Stays in your plan</span>
            <Amount sats={state.balance} usd={usd} />
          </div>
          <div className="ax-row">
            <span className="ax-row__label">Heirs can receive from</span>
            <span className="ax-row__value num">about {formatDateTime(newDeadline)}</span>
          </div>
        </div>
      )}

      {fromPlan.length > 0 && (
        <div className="ax-group">
          <h3 className="ax-group__title">From the plan</h3>
          {fromPlan.map((l, i) => {
            const heirIndex = l.kind === 'heir' ? plan.heirs.findIndex((h) => h.address === l.address) : -1;
            return (
              <div className="ax-row" key={i}>
                <span className="ax-row__label">
                  {heirIndex >= 0 && <span className="ax-dot" style={{ background: heirColor(heirIndex) }} aria-hidden />}
                  <span className="ax-row__who">
                    <span>{l.label}</span>
                    {l.address && <Address address={l.address} label={`Copy ${l.label}'s address`} />}
                  </span>
                </span>
                <Amount sats={l.amount} usd={usd} />
              </div>
            );
          })}
          {leftover > 0n && (
            <div className="ax-row ax-row--muted">
              <span className="ax-row__label">Left over from rounding, added to the network fee</span>
              <span className="num">{leftover.toLocaleString('en-US')} {leftover === 1n ? 'satoshi' : 'satoshis'}</span>
            </div>
          )}
        </div>
      )}

      <div className="ax-group">
        <h3 className="ax-group__title">From your wallet</h3>
        <div className="ax-row">
          <span className="ax-row__label">
            <span className="ax-row__who">
              <span>Network fee</span>
              <span className="ax-row__hint">{action === 'send' ? 'Paid by you, not the heirs' : 'Paid by your wallet'}</span>
            </span>
          </span>
          <Amount sats={preview.networkFee} usd={usd} />
        </div>
      </div>
    </>
  );
}

function Sent({ action, plan, state, usd, preview, txid, titleId, onClose, onReminder }: { action: PlanAction; plan: PlanData; state: PlanState; usd: number | null; preview: TxPreview | null; txid: string; titleId: string; onClose(): void; onReminder(): void }) {
  const [sentAt] = useState(() => Date.now());
  const explorer = (
    <a className="ax-link" href={explorerTxUrl(txid, plan.network)} target="_blank" rel="noreferrer">
      View on explorer <ArrowUpRight aria-hidden />
    </a>
  );

  if (action === 'send') {
    const colours = plan.heirs.slice(0, 4).map((_, i) => heirColor(i));
    return (
      <div className="ax-phase ax-centre ax-sent" key="sent">
        <Logo size={120} bloom="once" petalColors={colours} />
        <h2 id={titleId} className="ax-title ax-title--centre">Sent to heirs</h2>
        <p className="ax-sub">{plan.heirs.length} heirs received their shares in one transaction.</p>
        <ul className="ax-paid">
          {(preview?.lines ?? []).filter((l) => l.kind === 'heir').map((l, i) => (
            <li key={i}>
              <span className="ax-dot" style={{ background: heirColor(plan.heirs.findIndex((h) => h.address === l.address)) }} aria-hidden />
              <span className="ax-paid__name">{l.label}</span>
              <Amount sats={l.amount} usd={usd} />
              <span className="ax-paid__mark"><Check aria-hidden /><span className="sr-only">Paid</span></span>
            </li>
          ))}
        </ul>
        {explorer}
        <div className="ax-buttons">
          <Button size="lg" block data-autofocus onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  if (action === 'checkin') {
    const deadlineMs = sentAt + Number(state.deadline - state.networkTime) * 1000;
    return (
      <div className="ax-phase ax-centre" key="sent">
        <span className="ax-icon ax-icon--ok"><Check aria-hidden /></span>
        <h2 id={titleId} className="ax-status">Your heirs keep waiting</h2>
        <p className="ax-sub">They can receive from about <b className="num">{formatDateTime(deadlineMs)}</b>. Press “I’m still here” again before then.</p>
        {explorer}
        <div className="ax-buttons ax-buttons--row">
          <Button variant="secondary" size="lg" block icon={<CalendarPlus />} onClick={onReminder}>Add a reminder</Button>
          <Button size="lg" block data-autofocus onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ax-phase ax-centre" key="sent">
      <span className="ax-icon ax-icon--ok"><Check aria-hidden /></span>
      <h2 id={titleId} className="ax-status">Your BCH is back in your wallet</h2>
      <p className="ax-sub">This plan is closed. Your heirs will receive nothing from it.</p>
      {explorer}
      <div className="ax-buttons">
        <Button size="lg" block data-autofocus onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
