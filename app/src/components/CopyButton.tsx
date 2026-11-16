// Copy a value (an address, a link) with one tap. The icon turns into a check for 1.5 s and
// "Copied" is read out politely.
//
//   <CopyButton value={address} label="Copy donation address" />           44 px, for content
//   <CopyButton value={address} label="Copy donation address" size="sm" /> 28 px look, 44 px hit area
import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import './copy-button.css';

interface CopyButtonProps {
  value: string;
  /** accessible name, e.g. "Copy donation address" */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function CopyButton({ value, label, size = 'md', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard blocked (http, old browser): fall back to a hidden selection.
      const t = document.createElement('textarea');
      t.value = value;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className={`copy-btn copy-btn--${size} ${className}`} onClick={copy} aria-label={label} title={label}>
      <span className="copy-btn__icon" data-on={!copied || undefined} aria-hidden><Copy /></span>
      <span className="copy-btn__icon copy-btn__icon--done" data-on={copied || undefined} aria-hidden><Check /></span>
      <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </button>
  );
}
