// Copy a value (an address, a link) with one tap. The icon turns into a check for 1.5 s and
// "Copied" is read out politely.
//
//   <CopyButton value={address} label="Copy donation address" />           44 px, for content
//   <CopyButton value={address} label="Copy donation address" size="sm" /> 28 px look, 44 px hit area
import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Copy } from 'lucide-react';
import { copyText } from '../lib/clipboard';
import './copy-button.css';

interface CopyButtonProps {
  value: string;
  /** accessible name, e.g. "Copy donation address" */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function CopyButton({ value, label, size = 'md', className = '' }: CopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    setStatus(await copyText(value) ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('idle'), 1500);
  }

  return (
    <button type="button" className={`copy-btn copy-btn--${size} ${className}`} onClick={copy} aria-label={label} title={status === 'failed' ? 'Could not copy' : label}>
      <span className="copy-btn__icon" data-on={status === 'idle' || undefined} aria-hidden><Copy /></span>
      <span className="copy-btn__icon copy-btn__icon--done" data-on={status === 'copied' || undefined} aria-hidden><Check /></span>
      <span className="copy-btn__icon" data-on={status === 'failed' || undefined} aria-hidden><CircleAlert /></span>
      <span className="sr-only" aria-live="polite">{status === 'copied' ? 'Copied' : status === 'failed' ? 'Could not copy' : ''}</span>
    </button>
  );
}
