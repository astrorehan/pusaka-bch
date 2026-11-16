// Small building blocks used only by the plan page.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { formatBch, formatUsd, shortAddress } from '../../lib/format';

/** Re-renders every `ms` so countdowns tick. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and insecure origins: fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

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

/** Heir colour for the i-th heir; repeats after five. */
export const heirColor = (i: number) => `var(--heir-${(i % 5) + 1})`;

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

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
