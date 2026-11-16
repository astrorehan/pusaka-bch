// Small pieces used across the create flow.
import { useState, type ReactNode } from 'react';
import { ChevronDown, CircleAlert, CircleCheck, Info, Minus, Plus } from 'lucide-react';
import { Logo } from '../../components/Logo';

/** A calm message block. `info` is neutral (also used for "Cancelled in your wallet"), never red. */
export function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'danger' ? CircleAlert : tone === 'success' ? CircleCheck : Info;
  return (
    <div className={`cr-notice cr-notice--${tone}`}>
      <Icon className="cr-notice__icon" aria-hidden />
      <div className="cr-notice__body">
        {title && <p className="cr-notice__title">{title}</p>}
        {children && <div className="cr-notice__text">{children}</div>}
        {action && <div className="cr-notice__action">{action}</div>}
      </div>
    </div>
  );
}

/** Raw error text, folded away. */
export function Details({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cr-details">
      <button type="button" className="cr-details__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Details <ChevronDown aria-hidden className={open ? 'cr-rot' : undefined} />
      </button>
      {open && <pre className="cr-details__text mono">{text}</pre>}
    </div>
  );
}

/** The waiting state: a 40 px logo that blooms, closes and blooms again, above the status text. */
export function Waiting({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="cr-waiting" role="status" aria-live="polite">
      <Logo size={40} bloom="loop" />
      <p className="cr-waiting__text">{text}</p>
      {sub && <p className="cr-waiting__sub">{sub}</p>}
    </div>
  );
}

/** A plus/minus counter, 44 px targets. */
export function Stepper({ label, one, value, min = 0, max, onValue, sub, id }: { label: string; one: string; value: number; min?: number; max: number; onValue(n: number): void; sub?: string; id: string }) {
  return (
    <div className="cr-row" role="group" aria-labelledby={id}>
      <div className="cr-row__text">
        <span id={id} className="cr-row__label">{label}</span>
        {sub && <span className="cr-row__sub">{sub}</span>}
      </div>
      <div className="cr-stepper">
        <button type="button" onClick={() => onValue(value - 1)} disabled={value <= min} aria-label={`One ${one} fewer`}>
          <Minus aria-hidden />
        </button>
        <output className="num" aria-live="polite" aria-label={`${label}: ${value}`}>{value}</output>
        <button type="button" onClick={() => onValue(value + 1)} disabled={value >= max} aria-label={`One more ${one}`}>
          <Plus aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** An on/off switch row. */
export function Toggle({ label, checked, onChange, sub }: { label: string; checked: boolean; onChange(v: boolean): void; sub?: string }) {
  return (
    <label className="cr-row cr-row--toggle">
      <span className="cr-row__text">
        <span className="cr-row__label">{label}</span>
        {sub && <span className="cr-row__sub">{sub}</span>}
      </span>
      <input type="checkbox" role="switch" className="cr-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
