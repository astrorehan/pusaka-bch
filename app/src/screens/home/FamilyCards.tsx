// "Your family. Your way to share.": three example plans, dealt from below face down and flipped over one by one.
// The back is kawung, the old Javanese batik of four ovals around a point: the same four petals and seed as the
// Pusaka logo, in gold on indigo. Each face shows its blooms on a soft tint, the heirs and their exact shares as
// chips, and a link that opens the create flow with that split picked.
// Hover (pointer devices): the card lifts with a small random tilt. Reduced motion: no dealing, no tilt.
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { SplitMode } from '../../lib/types';
import { sharePercent } from '../../lib/shares';
import { Logo } from '../../components/Logo';
import { SplitWords, useInView } from './motion';

interface Family {
  mode: SplitMode;
  title: string;
  role: string;
  tint: string;
  names: string[];
  shares: bigint[];
}

const FAMILIES: Family[] = [
  { mode: 'equal', title: 'Equal shares', role: 'The same share for everyone.', tint: 'var(--heir-1)', names: ['Aisha', 'Omar', 'Layla'], shares: [1n, 1n, 1n] },
  { mode: 'custom', title: 'Your own split', role: 'A little more here, a little less there.', tint: 'var(--heir-2)', names: ['Aisha', 'Omar', 'Layla'], shares: [50n, 30n, 20n] },
  {
    mode: 'faraid',
    title: 'Islamic inheritance (faraid)',
    role: 'Shares worked out from your family.',
    tint: 'var(--gold)',
    names: ['Wife', 'Father', 'Mother', 'Son 1', 'Son 2', 'Daughter'],
    shares: [15n, 20n, 20n, 26n, 26n, 13n],
  },
];

const TITLE = 'Your family.\nYour way to share.';
const FROM_TILT = [-9, 4, 10];

// Kawung: four ovals on the diagonals around each point of a centred square grid, with a dot at the centre.
const KAWUNG = (() => {
  const points = [[0, 0], [48, 0], [0, 48], [48, 48], [24, 24]];
  const petals = points.flatMap(([x, y]) => [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([dx, dy]) => {
    const cx = x + dx * 6.4, cy = y + dy * 6.4;
    return `<ellipse cx='${cx}' cy='${cy}' rx='7.2' ry='3.5' transform='rotate(${dx * dy * 45} ${cx} ${cy})'/>`;
  }));
  const dots = points.map(([x, y]) => `<circle cx='${x}' cy='${y}' r='1.6'/>`);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><g fill='none' stroke='%23C9A56A' stroke-width='1' opacity='0.55'>${petals.join('')}</g><g fill='%23C9A56A' opacity='0.7'>${dots.join('')}</g></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}")`;
})();

function Card({ f, k, dealt }: { f: Family; k: number; dealt: boolean }) {
  const [tilt, setTilt] = useState(0);
  const total = f.shares.reduce((a, b) => a + b, 0n);
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
        <article className="fc-face fc-front" style={{ animationDelay: delay }}>
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
