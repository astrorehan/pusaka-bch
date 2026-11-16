// The plan, in plain words: state, countdown ring, the one action, who receives what, the plan link, details.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Check, CircleDot, Clock, Lock, Wallet } from 'lucide-react';
import { Button } from '../../components/Button';
import { useWallet } from '../../lib/wallet';
import { planService } from '../../lib/planService';
import { heirAmounts } from '../../lib/shares';
import { explorerTxUrl, formatBch, formatDuration, formatUsd } from '../../lib/format';
import { planUrl } from '../../lib/planLink';
import type { PlanData, PlanState, PlanStatus } from '../../lib/types';
import { CountdownRing } from './CountdownRing';
import { HeirList, ShareBar } from './HeirList';
import { SharePanel } from './SharePanel';
import { ActionSheet, type PlanAction } from './ActionSheet';
import { Address, Disclosure } from './bits';
import { heirColor, useNow } from './util';
import { downloadIcs } from './ics';
import { countdown, formatDateTime, formatDay } from './time';

interface Props {
  plan: PlanData;
  state: PlanState;
  readAt: number;
  usd: number | null;
  demo: boolean;
  demoUsed: boolean;
  refresh(): Promise<void>;
}

const norm = (a: string) => a.trim().toLowerCase().replace(/^(bitcoincash|bchtest):/, '');
const SPLIT: Record<PlanData['splitMode'], string> = {
  equal: 'Equal shares',
  custom: 'Custom shares',
  faraid: 'Islamic inheritance (faraid)',
};

export function PlanView({ plan, state, readAt, usd, demo, demoUsed, refresh }: Props) {
  const navigate = useNavigate();
  const { wallet, status: walletStatus, connect } = useWallet();
  const [action, setAction] = useState<PlanAction | null>(null);
  const now = useNow(1000);

  const periodS = Number(plan.period);
  const secondsLeft = Number(state.deadline - state.networkTime) - (now - readAt) / 1000;
  const deadlineMs = readAt + Number(state.deadline - state.networkTime) * 1000;
  const running = state.status === 'active' || state.status === 'ending-soon';
  const status: PlanStatus = running && secondsLeft < periodS / 10 ? 'ending-soon' : state.status;
  const isOwner = !!wallet && norm(wallet.address) === norm(plan.ownerAddress);
  const n = plan.heirs.length;

  // Once the countdown reaches zero, ask the network (it decides, not our clock).
  const asked = useRef(false);
  useEffect(() => {
    if (running && secondsLeft <= 0 && !asked.current) { asked.current = true; refresh(); }
    if (secondsLeft > 0) asked.current = false;
  }, [running, secondsLeft, refresh]);

  // Remember what each heir gets while there is money in the plan, so "Paid" rows keep their amounts.
  // After a payout or take back the plan only holds its fee budget and rounding dust; that is not a pot, so a
  // plan opened after it was paid shows shares and "Paid" without amounts.
  const finished = state.status === 'sent' || state.status === 'taken-back';
  const livePot = !finished && state.balance > plan.feeBudget ? state.balance - plan.feeBudget : null;
  const [knownPot, setKnownPot] = useState<bigint | null>(livePot);
  if (livePot != null && livePot !== knownPot) setKnownPot(livePot);
  const pot = livePot ?? knownPot;
  const amounts = useMemo(() => (pot != null && pot > 0n ? heirAmounts(pot, plan.heirs.map((h) => h.share), plan.shareTotal).amounts : null), [pot, plan]);
  const total = pot != null && pot > 0n ? pot : null;

  // The network fee of the main action, said before the button is pressed.
  const feeAction: PlanAction | null = isOwner && (running || status === 'claimable') ? 'checkin' : status === 'claimable' ? 'send' : null;
  const [fee, setFee] = useState<bigint | null>(null);
  useEffect(() => {
    if (!feeAction) return;
    let live = true;
    const p = feeAction === 'send' ? planService.previewSendToHeirs(plan) : planService.previewCheckIn(plan);
    p.then((x) => live && setFee(x.networkFee)).catch(() => undefined);
    return () => { live = false; };
  }, [feeAction, plan]);

  const url = useMemo(() => planUrl(plan), [plan]);

  function reminder() {
    if (isOwner) {
      const at = Math.max(Date.now() + 3600_000, deadlineMs - periodS * 100);
      downloadIcs({
        title: "Pusaka: press I'm still here",
        description: `Open your inheritance plan and press “I’m still here”, so your heirs keep waiting. Otherwise they can receive from about ${formatDateTime(deadlineMs)}.`,
        url, at, alertMinutes: 0,
      }, 'pusaka-im-still-here.ics');
    } else {
      downloadIcs({
        title: 'Pusaka: heirs can receive',
        description: 'The waiting time of this inheritance plan ends about now. Open the plan link to send it to the heirs.',
        url, at: Math.max(Date.now() + 60_000, deadlineMs), alertMinutes: 0,
      }, 'pusaka-heirs-can-receive.ics');
    }
  }

  const bch = total != null ? `${formatBch(total)} BCH` : 'the BCH';
  const copy = headline(status, { isOwner, demo, demoUsed, n, bch, day: formatDay(deadlineMs), when: formatDateTime(deadlineMs), left: countdown(secondsLeft).phrase });
  const feeText = fee != null ? <><b className="num">{formatBch(fee)} BCH</b>{usd != null && <span className="num"> ({formatUsd(fee, usd)?.replace(' ', ' ')})</span>}</> : null;

  return (
    <div className="pl enter">
      <p className="sr-only" aria-live="polite">{copy.title}</p>

      <section className="pl-hero" aria-labelledby="pl-title">
        <div className="pl-badges">
          {demo && <span className="pl-badge pl-badge--plain">Example plan</span>}
          <StatusBadge status={status} />
        </div>
        <h1 id="pl-title" className="pl-title">{copy.title}</h1>
        <p className="pl-summary">{copy.text}</p>

        <div className="pl-ring">
          <CountdownRing status={status} secondsLeft={secondsLeft} periodSeconds={periodS} heirColours={plan.heirs.slice(0, 4).map((_, i) => heirColor(i))} />
          {running && <p className="pl-when num">Heirs can receive from about {formatDateTime(deadlineMs)}</p>}
          {status === 'claimable' && <p className="pl-when num">Waiting time ended about {formatDateTime(deadlineMs)}</p>}
          {(status === 'sent' || status === 'taken-back') && state.lastTxid && (
            <p className="pl-when">
              <a className="pl-link-inline" href={explorerTxUrl(state.lastTxid, plan.network)} target="_blank" rel="noreferrer">
                View on explorer <ArrowUpRight aria-hidden />
              </a>
            </p>
          )}
        </div>

        <div className="pl-actions">
          {isOwner && (running || status === 'claimable') && (
            <>
              <Button size="lg" block onClick={() => setAction('checkin')}>I'm still here</Button>
              <Button variant="danger" size="lg" block onClick={() => setAction('takeback')}>Take my BCH back</Button>
              <p className="pl-hint">
                {feeText ? <>Each press costs a network fee of about {feeText}, paid by your wallet.</> : 'Each press costs a small network fee, paid by your wallet.'}
              </p>
            </>
          )}

          {!isOwner && status === 'claimable' && (
            <>
              <Button size="lg" block onClick={() => setAction('send')}>Send to heirs</Button>
              <p className="pl-hint pl-hint--card">
                <Wallet aria-hidden />
                <span>
                  {wallet
                    ? <>Your wallet pays the network fee{feeText ? <>, about {feeText}</> : null}. The heirs' shares are not touched.</>
                    : <>Sending needs a BCH wallet, such as Paytaca or Cashonize. It pays the network fee{feeText ? <>, about {feeText}</> : null}. The heirs' shares are not touched.</>}
                </span>
              </p>
            </>
          )}

          {!isOwner && running && (
            <div className="pl-quiet">
              <Clock aria-hidden />
              <div>
                <p><b>Nothing to do yet.</b> Come back after {formatDay(deadlineMs)}. If the owner is still here, they will press “I’m still here” before then.</p>
                {!wallet && (
                  <button type="button" className="pl-textbtn" onClick={() => connect()} disabled={walletStatus === 'connecting'}>
                    {walletStatus === 'connecting' ? 'Connecting…' : 'Is this your plan? Connect your wallet'}
                  </button>
                )}
              </div>
            </div>
          )}

          {(status === 'sent' || status === 'taken-back') && (
            <Button size="lg" block onClick={() => navigate('/new')}>{demo ? 'Make a plan for your family' : 'Create a plan'}</Button>
          )}
        </div>
      </section>

      <div className="pl-side">
        <section className="pl-card" aria-labelledby="pl-heirs-title">
          <div className="pl-card__head">
            <h2 id="pl-heirs-title" className="pl-h2">{status === 'sent' ? 'Who received what' : status === 'taken-back' ? 'Heirs in this plan' : 'Who receives what'}</h2>
            <span className="pl-card__meta num">{n} {n === 1 ? 'heir' : 'heirs'}{total != null && status !== 'taken-back' ? ` · ${formatBch(total)} BCH` : ''}</span>
          </div>
          <ShareBar plan={plan} muted={status === 'taken-back'} />
          <HeirList plan={plan} amounts={status === 'taken-back' ? null : amounts} usd={usd} paid={status === 'sent'} closed={status === 'taken-back'} />
        </section>

        <SharePanel
          url={url}
          isOwner={isOwner}
          finished={status === 'sent' || status === 'taken-back'}
          onReminder={running ? reminder : null}
          reminderLabel={isOwner ? 'Remind me' : 'Remind me when it ends'}
        />

        <Disclosure summary="Plan details" className="pl-details">
          <dl className="pl-dl">
            <div><dt>Waiting time</dt><dd>{formatDuration(plan.period)}</dd></div>
            <div><dt>Split</dt><dd>{SPLIT[plan.splitMode]}</dd></div>
            <div><dt>In the plan now</dt><dd className="num">{formatBch(state.balance)} BCH</dd></div>
            {plan.feeBudget > 0n && <div><dt>Stays in the plan (network minimum)</dt><dd className="num">{formatBch(plan.feeBudget)} BCH</dd></div>}
            <div><dt>Owner</dt><dd><Address address={plan.ownerAddress} label="Copy the owner's address" /></dd></div>
            {plan.contractAddress && <div><dt>Plan address</dt><dd><Address address={plan.contractAddress} label="Copy the plan address" /></dd></div>}
            {plan.createdTxid && (
              <div><dt>Created</dt><dd><a className="pl-link-inline" href={explorerTxUrl(plan.createdTxid, plan.network)} target="_blank" rel="noreferrer">View on explorer <ArrowUpRight aria-hidden /></a></dd></div>
            )}
          </dl>
          <p className="pl-fine">
            Times are approximate, give or take an hour: the network's clock runs a little behind real time.
            Only the owner's wallet can press “I’m still here” or take the BCH back. Anyone can send to the heirs once the waiting time has passed, and the shares can't be changed.
          </p>
        </Disclosure>
      </div>

      <ActionSheet
        action={action}
        plan={plan}
        state={state}
        usd={usd}
        onClose={() => setAction(null)}
        refresh={refresh}
        onReminder={reminder}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  if (status === 'active') return <span className="pl-badge pl-badge--ok"><CircleDot aria-hidden />Waiting time running</span>;
  if (status === 'ending-soon') return <span className="pl-badge pl-badge--warn"><AlertTriangle aria-hidden />Ends soon</span>;
  if (status === 'claimable') return <span className="pl-badge pl-badge--ok"><Check aria-hidden />Waiting time over</span>;
  if (status === 'sent') return <span className="pl-badge pl-badge--ok"><Check aria-hidden />Sent to heirs</span>;
  return <span className="pl-badge pl-badge--plain"><Lock aria-hidden />Closed</span>;
}

interface CopyCtx { isOwner: boolean; demo: boolean; demoUsed: boolean; n: number; bch: string; day: string; when: string; left: string }

function headline(status: PlanStatus, c: CopyCtx): { title: string; text: string } {
  const heirs = `${c.n} ${c.n === 1 ? 'heir' : 'heirs'}`;
  switch (status) {
    case 'active':
      return c.isOwner
        ? { title: 'Your heirs are waiting', text: `If you don't press “I’m still here” by about ${c.day}, your ${c.bch} goes to your ${heirs}.` }
        : { title: `Heirs receive in ${c.left}`, text: `If the owner doesn't press “I’m still here” by about ${c.day}, ${c.bch} goes to these ${heirs}, split by the shares below.` };
    case 'ending-soon':
      return c.isOwner
        ? { title: 'Your waiting time ends soon', text: `Press “I’m still here” before about ${c.when}, or your ${c.bch} goes to your ${heirs}.` }
        : { title: 'Waiting time ends soon', text: `If the owner doesn't press “I’m still here” by about ${c.when}, ${c.bch} goes to these ${heirs}.` };
    case 'claimable':
      if (c.isOwner) return { title: 'Your waiting time has passed', text: `Anyone with your plan link can now send your ${c.bch} to your ${heirs}. If you're still here, press “I’m still here” to start the waiting time again.` };
      if (c.demo) return { title: `${heirs} can receive now`, text: `The owner of this example plan stopped checking in, so the waiting time has passed. One press sends ${c.bch} to all ${heirs}, each by their share, in a single transaction.` };
      return { title: `${heirs} can receive now`, text: `The owner stopped checking in and the waiting time has passed. Anyone with this link can now send ${c.bch} to the ${heirs}, in one transaction.` };
    case 'sent':
      if (c.demoUsed) return { title: 'This example was already sent', text: `Someone already sent this example plan to its ${heirs}. Make a plan for your own family: it takes about a minute.` };
      return { title: 'Sent to heirs', text: `${c.n === 1 ? 'The heir' : `All ${heirs}`} received their shares in one transaction.` };
    default:
      return c.isOwner
        ? { title: 'This plan is closed', text: 'You took your BCH back. Your heirs will receive nothing from this plan.' }
        : { title: 'This plan is closed', text: 'The owner took their BCH back. The heirs will receive nothing from this plan.' };
  }
}
