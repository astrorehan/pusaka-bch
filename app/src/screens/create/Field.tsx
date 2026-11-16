import type { InputHTMLAttributes, ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { fieldId } from './model';


interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'id'> {
  fkey: string;
  label: ReactNode;
  value: string;
  onValue(v: string): void;
  error?: string | null;
  hint?: string | null;
  suffix?: ReactNode;
  trailing?: ReactNode;
  mono?: boolean;
  big?: boolean;
  /** visually hide the label (it is still read out) */
  quietLabel?: boolean;
  /** the message is rendered by the caller, at `${fieldId(fkey)}-msg` */
  messageElsewhere?: boolean;
  /** content between the input and the message (e.g. the dollar value) */
  below?: ReactNode;
  className?: string;
}

/** Label, input and an inline message. The screen decides when the error is shown (on blur, not while typing). */
export function Field({ fkey, label, value, onValue, error, hint, suffix, trailing, mono, big, quietLabel, messageElsewhere, below, className = '', ...rest }: FieldProps) {
  const id = fieldId(fkey);
  const msgId = `${id}-msg`;
  return (
    <div className={`cr-field ${className}`}>
      <label htmlFor={id} className={quietLabel ? 'sr-only' : 'cr-field__label'}>{label}</label>
      <div className={`cr-input${error ? ' cr-input--error' : ''}${big ? ' cr-input--big' : ''}`}>
        <input
          id={id}
          className={mono ? 'mono' : undefined}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          {...rest}
        />
        {suffix && <span className="cr-input__suffix" aria-hidden>{suffix}</span>}
        {trailing}
      </div>
      {below}
      {messageElsewhere ? null : error ? (
        <p id={msgId} className="cr-field__error"><CircleAlert aria-hidden />{error}</p>
      ) : hint ? (
        <p id={msgId} className="cr-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
