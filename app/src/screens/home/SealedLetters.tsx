// "Your family. Your way to share.": three example plans as sealed letters. In Indonesian a will is a surat
// wasiat, a letter of bequest. Each plan arrives folded in three, kawung on the outside and closed with a wax seal
// stamped with the bloom; in view the seal breaks, the letter unfolds and its writing appears: the blooms, the
// heirs and their exact shares, and a link that opens the create flow with that split picked.
//
// The open letter is the real card; the folded paper is drawn over it only while it opens, so the card is never
// taken apart. Reduced motion: the letters are open from the start.
import { useId, useState, type CSSProperties } from 'react';
import { Logo } from '../../components/Logo';
import { useMedia } from '../../components/useMedia';
import { FamilyFace } from './FamilyCards';
import { FAMILIES, KAWUNG, TITLE, type Family } from './familyPlans';
import { SplitWords, useInView } from './motion';
import './sealed-letters.css';

const FROM_TILT = [-5, 2, 6];

// A wax seal's edge: a circle that has spread a little unevenly.
const SEAL_EDGE = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r = 29 + 1.6 * Math.sin(5 * a + 0.6) + 1.1 * Math.sin(11 * a + 2.1) + 0.6 * Math.sin(19 * a + 1.3);
    pts.push(`${(32 + r * Math.cos(a)).toFixed(2)} ${(32 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();

function Seal() {
  const id = useId();
  return (
    <span className="sl-seal__wax">
      <svg viewBox="0 0 64 64" width="64" height="64">
        <defs>
          <radialGradient id={`${id}w`} cx="36%" cy="30%" r="78%">
            <stop offset="0" stopColor="#efd79c" />
            <stop offset="0.5" stopColor="#c99d58" />
            <stop offset="1" stopColor="#8a5f2c" />
          </radialGradient>
        </defs>
        <path d={SEAL_EDGE} fill={`url(#${id}w)`} />
        <circle cx="32" cy="32" r="20.5" fill="none" stroke="rgba(255, 238, 196, 0.55)" strokeWidth="1.2" transform="translate(-0.6 -0.6)" />
        <circle cx="32" cy="32" r="20.5" fill="none" stroke="rgba(92, 60, 22, 0.5)" strokeWidth="1.2" transform="translate(0.6 0.6)" />
      </svg>
      <span className="sl-seal__mark"><Logo size={26} /></span>
    </span>
  );
}

function Letter({ f, k, still }: { f: Family; k: number; still: boolean }) {
  const [tilt, setTilt] = useState(0);
  const [ref, open] = useInView<HTMLLIElement>(0.35);
  return (
    <li
      ref={ref}
      className={`sl fc-hover${open ? ' is-open' : ''}${still ? ' sl--still' : ''}`}
      style={{ '--tilt': `${tilt}deg`, '--k': k, '--from-tilt': `${FROM_TILT[k]}deg`, '--tint': f.tint } as CSSProperties}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setTilt((Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.8)); }}
    >
      <FamilyFace f={f} className="fc-front sl-card" />
      {!still && (
        <div className="sl-fold" aria-hidden>
          <div className="sl-mid" />
          <div className="sl-flap sl-flap--bottom">
            <div className="sl-face sl-face--in" />
            <div className="sl-face sl-face--out" style={{ backgroundImage: KAWUNG }} />
          </div>
          <div className="sl-flap sl-flap--top">
            <div className="sl-face sl-face--in" />
            <div className="sl-face sl-face--out" style={{ backgroundImage: KAWUNG }} />
          </div>
          <div className="sl-seal">
            <span className="sl-seal__half sl-seal__half--l"><Seal /></span>
            <span className="sl-seal__half sl-seal__half--r"><Seal /></span>
          </div>
        </div>
      )}
    </li>
  );
}

export function SealedLetters() {
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const [headRef, headSeen] = useInView<HTMLElement>(0.3);
  return (
    <section className="lp-section fc" aria-labelledby="fc-title">
      <header ref={headRef} className="lp-head">
        <h2 id="fc-title" className="lp-h2" aria-label={TITLE.replace('\n', ' ')}>
          <SplitWords text={TITLE} seen={headSeen} />
        </h2>
        <p className={`lp-sub fade-up${headSeen ? ' is-seen' : ''}`} style={{ animationDelay: '420ms' }}>
          Pick how the plan splits between the people you love. These are examples, so nothing moves. Change any of it
          when you make your own.
        </p>
      </header>
      <ul className="fc-grid">
        {FAMILIES.map((f, k) => <Letter key={f.mode} f={f} k={k} still={still} />)}
      </ul>
    </section>
  );
}
