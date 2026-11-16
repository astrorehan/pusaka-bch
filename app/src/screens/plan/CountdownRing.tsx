// The large countdown ring. The arc is the share of the waiting time still left. It updates in place, never pulses.
import { Check } from 'lucide-react';
import type { PlanStatus } from '../../lib/types';
import { Logo } from '../../components/Logo';
import { countdown } from './time';
import './ring.css';

interface Props {
  status: PlanStatus;
  secondsLeft: number;
  periodSeconds: number;
  /** petal colours for the ready state: the first four heirs */
  heirColours: string[];
}

const R = 100;
const C = 2 * Math.PI * R;

export function CountdownRing({ status, secondsLeft, periodSeconds, heirColours }: Props) {
  const running = status === 'active' || status === 'ending-soon';
  const fraction = running ? Math.min(1, Math.max(0, secondsLeft / Math.max(1, periodSeconds))) : status === 'taken-back' ? 0 : 1;
  const cd = countdown(secondsLeft);
  const tone = status === 'ending-soon' ? 'warn' : status === 'taken-back' ? 'off' : 'ok';

  let label: string;
  if (running) label = `${cd.phrase} left until heirs can receive`;
  else if (status === 'claimable') label = 'Waiting time has passed. Ready to send to heirs.';
  else if (status === 'sent') label = 'Sent to heirs';
  else label = 'Plan closed';

  return (
    <div className={`ring ring--${tone}`} role="img" aria-label={label}>
      <svg className="ring__svg" viewBox="0 0 220 220" aria-hidden>
        <circle className="ring__track" cx="110" cy="110" r={R} />
        {fraction > 0 && (
          <circle
            className="ring__arc"
            cx="110"
            cy="110"
            r={R}
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={C * (1 - fraction)}
            transform="rotate(-90 110 110)"
          />
        )}
      </svg>
      <div className="ring__centre" aria-hidden>
        {running && secondsLeft > 0 && (
          <>
            <span className="ring__value num">{cd.value}</span>
            <span className="ring__unit">{cd.unit}</span>
            {cd.rest && <span className="ring__rest num">{cd.rest}</span>}
          </>
        )}
        {running && secondsLeft <= 0 && (
          <>
            <span className="ring__word">Any minute</span>
            <span className="ring__unit">checking the network</span>
          </>
        )}
        {status === 'claimable' && (
          <>
            <Logo size={44} petalColors={heirColours} />
            <span className="ring__word ring__word--below">Ready</span>
          </>
        )}
        {status === 'sent' && (
          <>
            <span className="ring__check"><Check aria-hidden /></span>
            <span className="ring__unit ring__unit--strong">All heirs paid</span>
          </>
        )}
        {status === 'taken-back' && (
          <>
            <span className="ring__value num">0</span>
            <span className="ring__unit">BCH left in the plan</span>
          </>
        )}
      </div>
    </div>
  );
}
