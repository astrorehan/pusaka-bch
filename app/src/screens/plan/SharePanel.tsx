// The plan-link card: copy, the native share sheet where there is one, and a calendar reminder.
import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Check, Copy, Share } from 'lucide-react';
import { copyText } from './bits';

interface Props {
  url: string;
  isOwner: boolean;
  /** paid out or taken back: the link is now a record */
  finished: boolean;
  /** null when no reminder makes sense (plan paid or closed) */
  onReminder: (() => void) | null;
  reminderLabel: string;
}

export function SharePanel({ url, isOwner, finished, onReminder, reminderLabel }: Props) {
  const [copied, setCopied] = useState(false);
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    if (await copyText(url)) {
      setCopied(true);
      clearTimeout(t.current);
      t.current = window.setTimeout(() => setCopied(false), 1800);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Inheritance plan', text: isOwner ? 'My inheritance plan on Pusaka. Keep this link safe.' : 'An inheritance plan on Pusaka.', url });
    } catch { /* closed the share sheet: nothing to do */ }
  }

  return (
    <section className="pl-card pl-link" aria-labelledby="pl-link-title">
      <h2 id="pl-link-title" className="pl-h2">Plan link</h2>
      <p className="pl-card__text">
        {finished
          ? 'Anyone with this link can see this plan and what happened to it.'
          : isOwner
          ? 'Your heirs need this link to receive. Keep it somewhere safe and share it with them.'
          : 'Anyone with this link can see the plan, and send it to the heirs once the waiting time has passed.'}
      </p>
      <div className="pl-link__url" title={url}>{url.replace(/^https?:\/\//, '')}</div>
      <div className="pl-link__actions">
        <button type="button" className="pl-chip" onClick={copy} aria-live="polite">
          <span className="pl-chip__icon">
            <span className="pl-swap" data-on={!copied}><Copy aria-hidden /></span>
            <span className="pl-swap" data-on={copied}><Check aria-hidden /></span>
          </span>
          <span className="pl-chip__label">
            <span className="pl-swap" data-on={!copied}>Copy link</span>
            <span className="pl-swap" data-on={copied}>Copied</span>
          </span>
        </button>
        {canShare && (
          <button type="button" className="pl-chip" onClick={share}>
            <span className="pl-chip__icon"><Share aria-hidden /></span>
            <span>Share</span>
          </button>
        )}
        {onReminder && (
          <button type="button" className="pl-chip" onClick={onReminder}>
            <span className="pl-chip__icon"><CalendarPlus aria-hidden /></span>
            <span>{reminderLabel}</span>
          </button>
        )}
      </div>
    </section>
  );
}
