import { ChevronLeft } from 'lucide-react';
import type { Step } from './model';

const STEPS = ['Wallet', 'Heirs', 'Amount'] as const;
const NAMES = ['Connect wallet', 'Heirs and shares', 'Amount and waiting time'];

interface Props {
  step: Step;
  /** go back to an earlier step */
  onStep(s: Step): void;
  onBack?: () => void;
}

/** "Back" and "Step 2 of 3", then three segments. Done steps can be tapped to go back. */
export function Progress({ step, onStep, onBack }: Props) {
  const shown = Math.min(step, 3);
  return (
    <div className="cr-progress">
      <div className="cr-progress__top">
        {onBack ? (
          <button type="button" className="cr-back" onClick={onBack}>
            <ChevronLeft aria-hidden />Back
          </button>
        ) : <span />}
        <span className="cr-progress__count num">
          {step === 4 ? 'Review' : `Step ${shown} of 3`}
          <span className="sr-only">: {step === 4 ? 'check your plan' : NAMES[shown - 1]}</span>
        </span>
      </div>
      <ol className="cr-progress__steps" aria-label="Progress">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          const state = n < shown || step === 4 ? 'done' : n === shown ? 'current' : 'todo';
          const canGo = n < step && n > 1;
          return (
            <li key={label} className={`cr-progress__step cr-progress__step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              {canGo ? (
                <button type="button" onClick={() => onStep(n)} aria-label={`Go back to ${NAMES[i]}`}>
                  <span className="cr-progress__bar" />
                  <span className="cr-progress__label">{label}</span>
                </button>
              ) : (
                <span className="cr-progress__item">
                  <span className="cr-progress__bar" />
                  <span className="cr-progress__label">{label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
