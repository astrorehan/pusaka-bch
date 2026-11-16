import { CalendarClock } from 'lucide-react';
import { Button } from '../../components/Button';
import { formatBch, formatDate, formatUsd } from '../../lib/format';
import type { WalletInfo } from '../../lib/planService';
import { Field } from './Field';
import { ShareBar } from './ShareBar';
import { FEE_BUDGET, parseAmount, periodSeconds, type Draft, type PeriodChoice, type PeriodUnit, type Resolved } from './model';
import type { Vis } from './CreateScreen';

interface Props {
  draft: Draft;
  update(fn: (d: Draft) => Draft): void;
  resolved: Resolved;
  vis: Vis;
  amounts: bigint[] | null;
  usd: number | null;
  wallet: WalletInfo | null;
  onContinue(): void;
}

const CHOICES: { id: PeriodChoice; label: string }[] = [
  { id: '6m', label: '6 months' },
  { id: '1y', label: '1 year' },
  { id: '2y', label: '2 years' },
  { id: 'custom', label: 'Custom' },
];

/** The network clock (median time past) runs about an hour behind; the plan's end date follows it. */
const NETWORK_LAG_SECONDS = 3600n;

export function StepAmount({ draft, update, resolved, vis, amounts, usd, wallet, onContinue }: Props) {
  const amount = parseAmount(draft.amount);
  const amountUsd = amount !== null && amount > 0n ? formatUsd(amount, usd) : null;
  const period = periodSeconds(draft);
  const periodError = vis.show('period');
  const end = period !== null && !periodError ? BigInt(Math.floor(Date.now() / 1000)) + period - NETWORK_LAG_SECONDS : null;

  const set = (patch: Partial<Draft>) => update((d) => ({ ...d, ...patch }));

  return (
    <div className="cr-stack">
      <section className="cr-card" aria-labelledby="amount-title">
        <h2 id="amount-title" className="cr-card__title">Amount</h2>
        <Field
          fkey="amount" big quietLabel label="Amount for your heirs, in BCH" value={draft.amount} suffix="BCH"
          inputMode="decimal" placeholder="0.00" autoComplete="off"
          onValue={(v) => { vis.edit('amount'); set({ amount: v }); }} onBlur={() => vis.blur('amount')}
          error={vis.show('amount')}
          below={
            <div className="cr-amount__meta num">
              <span className="muted">{amountUsd ?? (usd ? '≈ $0.00' : '')}</span>
              {wallet && <span className="muted">In your wallet: {formatBch(wallet.balance)} BCH</span>}
            </div>
          }
        />

        {resolved.heirs.length > 0 && (
          <div className="cr-amount__bar">
            <ShareBar heirs={resolved.heirs} total={resolved.total} amounts={amounts} usd={usd} caption="Each heir receives" />
          </div>
        )}
        <p className="cr-small muted cr-amount__fee num">
          Plus {FEE_BUDGET.toLocaleString('en-US')} satoshis ({formatBch(FEE_BUDGET)} BCH{usd ? `, ${formatUsd(FEE_BUDGET, usd)}` : ''}) kept
          in the plan to pay the network fee when your heirs are paid.
        </p>
      </section>

      <section className="cr-card" aria-labelledby="wait-title">
        <h2 id="wait-title" className="cr-card__title">Waiting time</h2>
        <p className="cr-card__sub">If you don't say “I’m still here” for this long, your heirs can receive their shares.</p>
        <div className="cr-choices" role="radiogroup" aria-labelledby="wait-title">
          {CHOICES.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={draft.period === c.id} className="cr-choice" onClick={() => set({ period: c.id })}>
              {c.label}
            </button>
          ))}
        </div>

        {draft.period === 'custom' && (
          <div className="cr-custom">
            <Field
              fkey="period" label="Waiting time" quietLabel value={draft.customCount} inputMode="numeric" placeholder="18" autoComplete="off"
              onValue={(v) => { vis.edit('period'); set({ customCount: v }); }} onBlur={() => vis.blur('period')}
              error={periodError}
            />
            <label className="sr-only" htmlFor="period-unit">Unit</label>
            <div className="cr-select">
              <select id="period-unit" value={draft.customUnit} onChange={(e) => set({ customUnit: e.target.value as PeriodUnit })}>
                <option value="days">days</option>
                <option value="months">months</option>
                <option value="years">years</option>
              </select>
            </div>
          </div>
        )}

        <div className="cr-when">
          <CalendarClock aria-hidden />
          <div>
            {end !== null ? (
              <p className="cr-when__date">Your heirs can receive it from about <strong>{formatDate(end)}</strong>.</p>
            ) : (
              <p className="cr-when__date muted">Enter a waiting time to see the date.</p>
            )}
            <p className="cr-small muted">
              Each time you say “I’m still here”, the wait starts again. The exact moment can be about an hour off,
              because the network's clock runs a little behind.
            </p>
          </div>
        </div>
      </section>

      <div className="cr-actions">
        <Button size="lg" block onClick={onContinue}>Review plan</Button>
      </div>
    </div>
  );
}
