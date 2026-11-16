// Small building blocks used only by the plan page.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { copyText } from './util';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { formatBch, formatUsd, shortAddress } from '../../lib/format';



/** Icon button that copies `text` and confirms with a check for 1.6 s. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const t = useRef<number>(0);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      className={`pl-copy${done ? ' is-done' : ''}`}
      aria-label={done ? 'Copied' : label}
      title={done ? 'Copied' : label}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          clearTimeout(t.current);
          t.current = window.setTimeout(() => setDone(false), 1600);
        }
      }}
    >
      <span className="pl-swap" data-on={!done}><Copy aria-hidden /></span>
      <span className="pl-swap" data-on={done}><Check aria-hidden /></span>
    </button>
  );
}

/** A shortened address in mono, the full one on hover, with a copy button. */
export function Address({ address, label = 'Copy address' }: { address: string; label?: string }) {
  return (
    <span className="pl-addr">
      <span className="mono pl-addr__text" title={address}>{shortAddress(address)}</span>
      <CopyButton text={address} label={label} />
    </span>
  );
}

/** BCH first, dollars second and muted. */
export function Amount({ sats, usd, size = 'md' }: { sats: bigint; usd: number | null; size?: 'md' | 'lg' }) {
  const u = formatUsd(sats, usd)?.replace(' ', ' ');
  return (
    <span className={`pl-amount pl-amount--${size}`}>
      <span className="num pl-amount__bch">{formatBch(sats)} BCH</span>
      {u && <span className="num muted pl-amount__usd">{u}</span>}
    </span>
  );
}


export function Disclosure({ summary, children, className = '' }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={`pl-disclosure ${className}`}>
      <summary>
        <span>{summary}</span>
        <ChevronDown className="pl-disclosure__chev" aria-hidden />
      </summary>
      <div className="pl-disclosure__body">{children}</div>
    </details>
  );
}

