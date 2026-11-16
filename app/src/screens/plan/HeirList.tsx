// Who receives what: a stacked share bar, then one row per heir.
import { Check } from 'lucide-react';
import type { PlanData } from '../../lib/types';
import { sharePercent } from '../../lib/shares';
import { formatBch, formatUsd } from '../../lib/format';
import { Address, capitalise, heirColor } from './bits';

interface Props {
  plan: PlanData;
  /** null when the amounts are not known (e.g. a plan opened after it was paid or closed) */
  amounts: bigint[] | null;
  usd: number | null;
  /** after the payout: every row is marked paid */
  paid: boolean;
  /** taken back: amounts are what heirs would have received, shown muted */
  closed?: boolean;
}

const pct = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

export function ShareBar({ plan, muted }: { plan: PlanData; muted?: boolean }) {
  return (
    <div className={`pl-bar${muted ? ' is-muted' : ''}`} aria-hidden>
      {plan.heirs.map((h, i) => (
        <span key={i} className="pl-bar__seg" style={{ flexGrow: Number(h.share), background: heirColor(i) }} />
      ))}
    </div>
  );
}

export function HeirList({ plan, amounts, usd, paid, closed }: Props) {
  return (
    <ul className={`pl-heirs${closed ? ' is-closed' : ''}`}>
      {plan.heirs.map((h, i) => (
        <li key={i} className="pl-heir">
          <span className="pl-heir__dot" style={{ background: heirColor(i) }} aria-hidden />
          <span className="pl-heir__name">
            {h.name}
            <span className="pl-heir__rel num">
              {h.relation ? `${capitalise(h.relation)} · ` : ''}{pct(sharePercent(h.share, plan.shareTotal))}
            </span>
          </span>
          {amounts && <span className="pl-heir__bch num">{formatBch(amounts[i] ?? 0n)} BCH</span>}
          <span className="pl-heir__sub">
            <Address address={h.address} label={`Copy ${h.name}'s address`} />
            {paid ? (
              <span className="pl-heir__usd pl-paid"><Check aria-hidden /> Paid</span>
            ) : (
              amounts && usd != null && <span className="pl-heir__usd num muted">{formatUsd(amounts[i] ?? 0n, usd)?.replace(' ', ' ')}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
