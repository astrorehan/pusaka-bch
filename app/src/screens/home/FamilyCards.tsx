// "Your family. Your way to share.": three example plans, dealt from below face down and flipped over one by one.
// The back is kawung, the old Javanese batik of four ovals around a point: the same four petals and seed as the
// Pusaka logo, in gold on indigo. Each face shows its blooms on a soft tint, the heirs and their exact shares as
// chips, and a link that opens the create flow with that split picked.
// Hover (pointer devices): the card lifts with a small random tilt. Reduced motion: no dealing, no tilt.
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { FAMILIES, KAWUNG, TITLE, type Family } from './familyPlans';
import { sharePercent } from '../../lib/shares';
import { Logo } from '../../components/Logo';
import { SplitWords, useInView } from './motion';

const FROM_TILT = [-9, 4, 10];

/** The open face of a family plan: its blooms, heirs and shares, and the link that starts it. */
export function FamilyFace({ f, className, style }: { f: Family; className: string; style?: CSSProperties }) {
  const total = f.shares.reduce((a, b) => a + b, 0n);
  return (
    <article className={className} style={style}>
      <div className="fc-panel">
        <div className="fc-panel__text">
          <h3 className="fc-title">{f.title}</h3>
          <p className="fc-role">{f.role}</p>
        </div>
        <img className="fc-art" src={`/landing/bloom-${f.mode}.webp`} alt="" loading="lazy" decoding="async" />
        <ul className="fc-chips" aria-label={`Example heirs for ${f.title}`}>
          {f.names.map((name, i) => (
            <li key={name} className="fc-chip" style={{ '--c': `var(--heir-${(i % 5) + 1})` } as CSSProperties}>
              <span className="fc-chip__dot" aria-hidden />
              {name}
              <span className="num">{sharePercent(f.shares[i], total)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="fc-foot">
        <div className="fc-who">
          <span className="fc-avatars" aria-hidden>
            {f.names.slice(0, 3).map((n, i) => (
              <span key={n} style={{ '--c': `var(--heir-${(i % 5) + 1})` } as CSSProperties}>{n[0]}</span>
            ))}
            {f.names.length > 3 && <span className="fc-avatars__more">+{f.names.length - 3}</span>}
          </span>
          <span className="fc-who__text">
            <b>{f.names.length} heirs</b>
            <span>Example, 0.12 BCH</span>
          </span>
        </div>
        <Link to={`/new?split=${f.mode}`} className="fc-cta" aria-label={`Start a plan with ${f.title.toLowerCase()}`}>
          Start <ArrowRight aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function Card({ f, k, dealt }: { f: Family; k: number; dealt: boolean }) {
  const [tilt, setTilt] = useState(0);
  const delay = `${150 + k * 220}ms`;
  return (
    <li
      className="fc-hover"
      style={{ '--tilt': `${tilt}deg` } as CSSProperties}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setTilt((Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.8)); }}
    >
      <div
        className={`fc-card${dealt ? ' is-dealt' : ''}`}
        style={{ animationDelay: delay, '--from-tilt': `${FROM_TILT[k]}deg`, '--tint': f.tint } as CSSProperties}
      >
        <FamilyFace f={f} className="fc-face fc-front" style={{ animationDelay: delay }} />
        <div className="fc-face fc-back" aria-hidden style={{ animationDelay: delay, backgroundImage: KAWUNG }}>
          <span className="fc-back__mark"><Logo size={88} /></span>
        </div>
      </div>
    </li>
  );
}

export function FamilyCards() {
  const [headRef, headSeen] = useInView<HTMLElement>(0.3);
  const [cardsRef, dealt] = useInView<HTMLUListElement>(0.15);
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
      <ul ref={cardsRef} className="fc-grid">
        {FAMILIES.map((f, k) => <Card key={f.mode} f={f} k={k} dealt={dealt} />)}
      </ul>
    </section>
  );
}
