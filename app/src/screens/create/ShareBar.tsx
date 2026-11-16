import { formatBch, formatUsd, shortAddress } from '../../lib/format';
import { heirColor, percentOf, type ResolvedHeir } from './model';

interface Props {
  heirs: ResolvedHeir[];
  total: bigint;
  /** per-heir payout in satoshis, when an amount is known */
  amounts?: bigint[] | null;
  usd: number | null;
  /** Custom %: the entered sum in the same units as total, to show what is not assigned yet */
  assigned?: bigint;
  caption?: string;
  /** names and percentages as small chips under the bar (the heirs step, where cards carry the rest) */
  compact?: boolean;
  /** the heir's address under the name (review) */
  showAddress?: boolean;
}

/** The live stacked share bar. Each heir keeps one colour, and the name always sits next to it. */
export function ShareBar({ heirs, total, amounts, usd, assigned, caption, compact, showAddress }: Props) {
  const sum = assigned ?? total;
  const base = sum > total ? sum : total;
  const free = assigned !== undefined && assigned < total ? total - assigned : 0n;
  const pct = (v: bigint) => (base === 0n ? 0 : Number((v * 100000n) / base) / 1000);

  return (
    <figure className="cr-sharebar">
      {caption && <figcaption className="cr-sharebar__caption">{caption}</figcaption>}
      <div className="cr-sharebar__bar" aria-hidden>
        {heirs.map((h, i) => h.share > 0n && (
          <span key={h.id} className="cr-sharebar__seg" style={{ width: `${pct(h.share)}%`, background: heirColor(i) }} />
        ))}
        {free > 0n && <span className="cr-sharebar__seg cr-sharebar__seg--free" style={{ width: `${pct(free)}%` }} />}
      </div>
      {compact ? (
        <ul className="cr-chips">
          {heirs.map((h, i) => (
            <li key={h.id}>
              <span className="cr-dot" style={{ background: heirColor(i) }} aria-hidden />
              <span className="cr-chips__name">{h.name.trim() || h.label}</span>
              <span className="num muted">{percentOf(h.share, total)}%</span>
            </li>
          ))}
          {free > 0n && (
            <li>
              <span className="cr-dot cr-dot--free" aria-hidden />
              <span className="cr-chips__name muted">Not given yet</span>
              <span className="num muted">{percentOf(free, total)}%</span>
            </li>
          )}
        </ul>
      ) : (
      <ul className="cr-legend">
        {heirs.map((h, i) => {
          const amount = amounts?.[i];
          const usdText = amount !== undefined ? formatUsd(amount, usd) : null;
          return (
            <li key={h.id}>
              <span className="cr-dot" style={{ background: heirColor(i) }} aria-hidden />
              <span className="cr-legend__name">
                <span className="cr-legend__line">
                  {h.name.trim() || <span className="muted">{h.label}</span>}
                  {h.name.trim() && h.relation && <span className="cr-legend__rel">{h.label}</span>}
                </span>
              </span>
              <span className="cr-legend__value num">
                {amount !== undefined ? (
                  <>
                    <strong>{formatBch(amount)} BCH</strong>
                    <span className="cr-legend__sub">{percentOf(h.share, total)}%{usdText ? ` · ${usdText}` : ''}</span>
                  </>
                ) : (
                  <strong>{percentOf(h.share, total)}%</strong>
                )}
              </span>
              {showAddress && <span className="cr-legend__addr mono" title={h.address.trim()}>{shortAddress(h.address.trim())}</span>}
            </li>
          );
        })}
        {free > 0n && (
          <li className="cr-legend__free">
            <span className="cr-dot cr-dot--free" aria-hidden />
            <span className="cr-legend__name muted">Not given to anyone yet</span>
            <span className="cr-legend__value num"><strong>{percentOf(free, total)}%</strong></span>
          </li>
        )}
      </ul>
      )}
    </figure>
  );
}
