// /new: the create-a-plan flow. Three steps (wallet, heirs, amount and waiting time), a review, then the
// success screen with the plan-link gate. Design note: docs/ux/create.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { NETWORK } from '../../components/AppShell';
import { planService } from '../../lib/planService';
import type { PlanData, SplitMode } from '../../lib/types';
import { useWallet } from '../../lib/wallet';
import { Notice } from './Bits';
import { fieldId } from './Field';
import { Progress } from './Progress';
import { StepWallet } from './StepWallet';
import { StepHeirs } from './StepHeirs';
import { StepAmount } from './StepAmount';
import { StepReview } from './StepReview';
import { SuccessScreen } from './SuccessScreen';
import {
  clearDraft, emptyDraft, equalPercents, heirPayouts, loadDraft, resolve, saveDraft,
  validateAmount, validateHeirs, validatePeriod, type Draft, type Errors, type Step,
} from './model';
import './create.css';

/** When to show a field's message: after blur or a Continue press, never while typing. */
export interface Vis {
  show(key: string): string | null;
  hint(key: string): string | null;
  blur(key: string): void;
  edit(key: string): void;
}

const HEADINGS: Record<Step, [string, string]> = {
  1: ['Connect your wallet', 'It takes about two minutes. Nothing is sent until you approve it at the end.'],
  2: ['Who gets your BCH?', 'Add each heir and choose how to split.'],
  3: ['How much, and for how long?', 'Choose what your heirs share, and how long Pusaka waits for you.'],
  4: ['Check your plan', 'Nothing moves until you approve it in your wallet.'],
};

function modeFrom(params: URLSearchParams): SplitMode | null {
  const m = params.get('split') ?? params.get('preset');
  return m === 'equal' || m === 'custom' || m === 'faraid' ? m : null;
}

function initialDraft(params: URLSearchParams, connected: boolean): Draft {
  const mode = modeFrom(params);
  let d = loadDraft() ?? emptyDraft(mode ?? 'equal');
  if (mode && mode !== d.mode) {
    d = { ...d, mode };
    if (mode === 'custom') { const p = equalPercents(d.heirs.length); d.heirs = d.heirs.map((h, i) => ({ ...h, percent: h.percent || p[i] })); }
  }
  if (d.step === 1 && connected) d = { ...d, step: 2 };
  return d;
}

export function CreateScreen() {
  const [params] = useSearchParams();
  const walletCtx = useWallet();
  const { status, wallet } = walletCtx;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(params, status === 'connected'));
  const [usd, setUsd] = useState<number | null>(null);
  const [created, setCreated] = useState<{ plan: PlanData; txid: string; amount: bigint } | null>(null);

  // Field messages: shown after blur, or for the whole step after a Continue press.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<Step | 0>(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const update = useCallback((fn: (d: Draft) => Draft) => setDraft(fn), []);

  useEffect(() => { planService.usdPerBch().then(setUsd).catch(() => setUsd(null)); }, []);
  useEffect(() => { if (!created) saveDraft(draft); }, [draft, created]);

  const resolved = useMemo(() => resolve(draft), [draft]);
  const payouts = useMemo(() => heirPayouts(draft), [draft]);
  const heirCheck = useMemo(() => validateHeirs(draft, NETWORK, wallet?.address), [draft, wallet]);
  const stepErrors: Errors = useMemo(() => {
    if (draft.step === 2) return heirCheck.errors;
    if (draft.step === 3) {
      const e: Errors = {};
      const a = validateAmount(draft, usd, wallet?.balance);
      if (a) e.amount = a;
      const p = validatePeriod(draft);
      if (p) e.period = p;
      return e;
    }
    return {};
  }, [draft, heirCheck, usd, wallet]);

  const vis: Vis = {
    show: (k) => {
      const e = stepErrors[k];
      if (!e || editing === k) return null;
      return touched.has(k) || showAll === draft.step ? e : null;
    },
    hint: (k) => (editing === k ? null : heirCheck.hints[k] ?? null),
    blur: (k) => { setEditing(null); setTouched((t) => (t.has(k) ? t : new Set(t).add(k))); },
    edit: (k) => setEditing(k),
  };

  const go = useCallback((step: Step) => {
    setShowAll(0);
    setEditing(null);
    setDraft((d) => ({ ...d, step }));
  }, []);

  // New step: start at the top and move focus to the heading, so screen readers hear where they are.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [draft.step, created]);

  function next(from: Step) {
    const keys = Object.keys(stepErrors);
    if (keys.length === 0) { go((from + 1) as Step); return; }
    setShowAll(from);
    setEditing(null);
    // Focus the first field with a problem (in screen order).
    requestAnimationFrame(() => {
      const fields = [...document.querySelectorAll<HTMLElement>('.cr [aria-invalid="true"], .cr [data-problem]')];
      const first = fields[0] ?? document.getElementById(fieldId(keys[0]));
      first?.focus?.();
      first?.scrollIntoView({ block: 'center' });
    });
  }

  function onCreated(plan: PlanData, txid: string, amount: bigint) {
    clearDraft();
    setCreated({ plan, txid, amount });
  }

  if (created) {
    return (
      <div className="column cr enter">
        <SuccessScreen plan={created.plan} txid={created.txid} amount={created.amount} usd={usd} />
      </div>
    );
  }

  const step = draft.step;
  const [title, sub] = HEADINGS[step];
  const lostWallet = step >= 2 && step <= 3 && status !== 'connected';

  return (
    <div className="column cr">
      <Progress step={step} onStep={go} onBack={step > 1 ? () => go((step - 1) as Step) : undefined} />

      <div key={step} className="enter">
        <header className="cr-head">
          <h1 ref={headingRef} tabIndex={-1} className="cr-head__title">{title}</h1>
          <p className="cr-head__sub">{sub}</p>
        </header>

        {lostWallet && (
          <div className="cr-lost" role="status">
            <Notice
              title="Your wallet disconnected."
              action={<Button variant="secondary" onClick={() => walletCtx.connect()} loading={status === 'connecting'}>{status === 'connecting' ? 'Connecting…' : 'Connect wallet'}</Button>}
            >
              Everything you entered is kept.
            </Notice>
          </div>
        )}

        {step === 1 && <StepWallet usd={usd} onDone={() => go(2)} />}
        {step === 2 && (
          <StepHeirs draft={draft} update={update} resolved={resolved} vis={vis} usd={usd} network={NETWORK} onContinue={() => next(2)} />
        )}
        {step === 3 && (
          <StepAmount draft={draft} update={update} resolved={resolved} vis={vis} amounts={payouts?.amounts ?? null} usd={usd} wallet={wallet} onContinue={() => next(3)} />
        )}
        {step === 4 && payouts && (
          <StepReview
            draft={draft} resolved={resolved} amounts={payouts.amounts} leftover={payouts.leftover} usd={usd}
            wallet={status === 'connected' ? wallet : null} walletBusy={status === 'connecting'} network={NETWORK}
            onEdit={go} onConnect={() => walletCtx.connect()} onCreated={onCreated}
          />
        )}
        {step === 4 && !payouts && (
          <Notice tone="danger" title="Something in the plan is missing." action={<Button variant="secondary" onClick={() => go(3)}>Go to amount</Button>}>
            Check the amount and try again.
          </Notice>
        )}
      </div>
    </div>
  );
}
