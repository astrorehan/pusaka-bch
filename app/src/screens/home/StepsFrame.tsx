// "Set once, check in, stay sure.": a light sheet with big rounded corners rises over the night. A wide frame looks
// out over the terraces at golden hour; on it, a glass card shows what each of the three steps looks like in the
// app. The steps under the frame advance on their own while in view (a thin line fills under the active one);
// hovering the section pauses it, and picking a step shows it. Reduced motion: no auto-advance.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Clock3, Hand } from 'lucide-react';
import { CountdownRing } from '../plan/CountdownRing';
import { formatDay } from '../plan/time';
import { useMedia } from '../../components/useMedia';
import { SplitWords, useInView } from './motion';
import { BASE } from '../../lib/asset';
import { HEIRS } from './payoutHeirs';

const STEPS = [
  { title: 'Choose heirs', line: 'Add up to 10 people, their BCH addresses and the share each one gets.' },
  { title: 'Check in now and then', line: 'Tap “I’m still here” before your waiting time runs out. It starts again from that day.' },
  { title: 'Missed it? They receive their shares', line: 'Once the waiting time has passed, every heir is paid their share in one payment.' },
];

const PERIOD = 180 * 86400;
const TITLE = 'Set once, check in, stay sure.';

function HeirsUi() {
  return (
    <div className="sf-ui">
      <p className="sf-ui__head"><span>Your heirs</span><span className="sf-ui__muted">{HEIRS.length} of up to 10</span></p>
      <ul className="sf-ui__rows">
        {HEIRS.map((h) => (
          <li key={h.name} style={{ '--c': h.color } as CSSProperties}>
            <span className="sf-ui__avatar" aria-hidden>{h.name[0]}</span>
            <span className="sf-ui__who"><b>{h.name}</b><span className="mono">{h.addr}</span></span>
            <span className="sf-ui__pct num">{h.pct}%</span>
          </li>
        ))}
      </ul>
      <div className="sf-ui__bar" aria-hidden>
        {HEIRS.map((h) => <span key={h.name} style={{ flexGrow: h.pct, background: h.color }} />)}
      </div>
      <p className="sf-ui__foot"><Clock3 aria-hidden /> Waiting time: 6 months</p>
    </div>
  );
}

function StillHereUi() {
  const [until] = useState(() => formatDay(Date.now() + PERIOD * 1000));
  return (
    <div className="sf-ui sf-ui--ring">
      <p className="sf-ui__head"><span>Family plan</span><span className="sf-ui__ok"><Check aria-hidden /> Restarted</span></p>
      <div className="sf-ui__ring">
        <CountdownRing status="active" secondsLeft={PERIOD} periodSeconds={PERIOD} heirColours={HEIRS.map((h) => h.color)} />
      </div>
      <p className="sf-ui__note">Heirs can receive from about {until}.</p>
      <span className="sf-ui__btn" aria-hidden><Hand /> I’m still here</span>
    </div>
  );
}

function SentUi() {
  return (
    <div className="sf-ui">
      <p className="sf-ui__sent"><span className="sf-ui__tick" aria-hidden><Check /></span>Sent to {HEIRS.length} heirs in one payment</p>
      <ul className="sf-ui__rows sf-ui__rows--paid">
        {HEIRS.map((h) => (
          <li key={h.name} style={{ '--c': h.color } as CSSProperties}>
            <span className="sf-ui__avatar" aria-hidden>{h.name[0]}</span>
            <span className="sf-ui__who"><b>{h.name}</b><span>{h.pct}% share</span></span>
            <span className="sf-ui__amt num">{h.bch} BCH</span>
            <Check className="sf-ui__paid" aria-label="Received" />
          </li>
        ))}
      </ul>
      <p className="sf-ui__foot sf-ui__foot--link">View on explorer <ArrowRight aria-hidden /></p>
    </div>
  );
}

const SCREENS = [HeirsUi, StillHereUi, SentUi];

export function StepsFrame() {
  const [ref, seen] = useInView<HTMLElement>(0.25);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const section = useRef<HTMLElement | null>(null);

  // Auto-advance only while the frame is on screen.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const playing = seen && inView && !paused && !still;
  const words = TITLE.split(' ').length;

  return (
    <section
      ref={(node) => { ref.current = node; section.current = node; }}
      className="lp-section sf"
      aria-labelledby="sf-title"
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setPaused(true); }}
      onPointerLeave={() => setPaused(false)}
    >
      <header className="lp-head">
        <h2 id="sf-title" className="lp-h2" aria-label={TITLE}>
          <SplitWords text={TITLE} seen={seen} />
        </h2>
      </header>

      <div className={`sf-frame fade-up${seen ? ' is-seen' : ''}`} style={{ animationDelay: `${words * 60 + 120}ms` }}>
        <img className="sf-frame__photo" src={`${BASE}landing/steps-frame.webp`} alt="" width={1920} height={1080} loading="lazy" decoding="async" />
        <div className="grain sf-frame__grain" aria-hidden />
        <div className="sf-frame__stack" aria-live="polite">
          {SCREENS.map((Screen, i) => (
            <div key={i} className={`sf-frame__screen glass-float${i === active ? ' is-on' : ''}`} aria-hidden={i !== active}>
              <Screen />
            </div>
          ))}
        </div>
        <span className="sf-frame__tag">Step {active + 1} of 3</span>
      </div>

      <ol className="sf-steps" aria-label="The three steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className={`rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: `${words * 60 + 260 + i * 110}ms` }}>
            <button
              type="button"
              className="sf-step"
              aria-current={i === active ? 'step' : undefined}
              onClick={() => setActive(i)}
            >
              <span className="sf-step__num" aria-hidden>{i + 1}</span>
              <span className="sf-step__text">
                <span className="sf-step__title">{s.title}</span>
                <span className="sf-step__line">{s.line}</span>
              </span>
              <span className="sf-step__track" aria-hidden>
                {i === active && (
                  <span
                    key={`${active}`}
                    className="sf-step__fill"
                    data-playing={playing || undefined}
                    data-still={still || undefined}
                    onAnimationEnd={() => setActive((a) => (a + 1) % STEPS.length)}
                  />
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <p className="sf-more">
        <Link to="/how-it-works" className="home-arrowlink">Read the full explanation <ArrowRight aria-hidden /></Link>
      </p>
    </section>
  );
}
