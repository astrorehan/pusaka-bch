// "While you're here, it waits. When you're not, it pays." Scrolling is time passing over the paddy.
//
// Desktop (1024 px and up, motion allowed): the section holds the screen while the camera stays still on the paddy
// and the day goes by. The light turns from morning to noon to late afternoon, the reflection of the sun crosses
// the water, the shadows of the reminder and the plan card swing round, and the plan's days count down. From the
// halfway point Pusaka asks whether you are still here: pressing "I'm still here" on the card really rewinds the
// light to morning and the count to 180 days, and the scene gives you a whole new day to scroll through. Leave it
// and the waiting time passes, the sun sets, the page around the picture goes dark, the bloom's seed lights up, and
// it is night with "One payment pays everyone." in place; the night section follows (SubakPayout).
//
// How it stays smooth: the picture is one fixed-size stage scaled once per resize. Scrolling only changes opacity
// and transform: light layers are crossfaded, the sun's reflection and the sun on its arc are moved, and the
// shadows are three fixed shadows crossfaded. Days are a number, not money, so they may count.
//
// Phones, tablets and reduced motion: the copy, then the working plan card on a patch of the paddy.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock3, Hand, Send, Sun, Undo2 } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { useMedia } from '../../components/useMedia';
import { formatDay } from '../plan/time';
import { SplitWords, useInView } from './motion';
import { Fireflies } from './NightPayout';
import { PlanBubble, ScenePlanCard } from './paddyParts';
import { NIGHT_SUB, NIGHT_TITLE, PINNED_QUERY } from './landingCopy';
import { BASE } from '../../lib/asset';
import './time-scroll.css';

/** The stage, in the photo's proportions (paddy-scene is 3:1). */
const STAGE_W = 2160;
const STAGE_H = 720;
/** At rest the photo is shifted left by this many stage pixels, so the bloom shows beside the plan card. */
const REST_SHIFT = 140;
/** The bloom's seed on the stage, where the light gathers at night. */
const SEED = { x: 854, y: 316 };
const PERIOD = 180;
const DAY_MS = 86_400_000;
/** Scroll distances, in px: a moment of morning, the day, a pause once the time has passed, then dusk into night. */
const SETTLE = 160;
const DAY = 1700;
const PASSED = 220;
const DUSK = 900;
const PIN = SETTLE + DAY + PASSED + DUSK;
/** Pusaka starts asking at this point of the day. */
const NUDGE = 0.45;

const TITLE = 'While you’re here,\nit waits.\nWhen you’re not,\nit pays.';
const TITLE_TEXT = 'While you’re here, it waits. When you’re not, it pays.';
const SUB = 'Press “I’m still here” now and then. If the waiting time passes without it, anyone with the plan link can send every heir their share.';

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** smoothstep: every fade starts and ends at zero slope, so nothing pops in */
const smooth = (a: number, b: number, v: number) => {
  const x = clamp((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

function Points({ className = '' }: { className?: string }) {
  return (
    <ul className={`lp-points ${className}`}>
      <li><span className="lp-points__icon" aria-hidden><Hand /></span>“I’m still here” restarts the waiting time from that day.</li>
      <li><span className="lp-points__icon" aria-hidden><Undo2 /></span>Take your BCH back to your wallet at any time.</li>
      <li><span className="lp-points__icon" aria-hidden><Send /></span>When the time passes, one payment reaches every heir.</li>
    </ul>
  );
}

function Copy({ seen, hint, className = '' }: { seen: boolean; hint?: boolean; className?: string }) {
  return (
    <div className={`ps-copy ${className}`}>
      <h2 className="lp-display" aria-label={TITLE_TEXT}>
        <SplitWords text={TITLE} seen={seen} />
      </h2>
      <p className={`lp-sub rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '420ms' }}>{SUB}</p>
      <Points className={`rise-in${seen ? ' is-seen' : ''}`} />
      {hint && (
        <p className={`ts-hint rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '560ms' }}>
          <Sun aria-hidden /> Scroll and the days go by.
        </p>
      )}
    </div>
  );
}

/** Three fixed shadows (sun from the left, overhead, from the right), crossfaded as the day turns. */
function Shadows() {
  return (
    <>
      <span className="ts-shadow ts-shadow--am" aria-hidden />
      <span className="ts-shadow ts-shadow--noon" aria-hidden />
      <span className="ts-shadow ts-shadow--pm" aria-hidden />
    </>
  );
}

/** Pusaka's reminder; what it says follows the day (data-phase on the scene). */
function TimeBubble() {
  return (
    <div className="pb">
      <div className="pb__from">
        <span className="pb__avatar"><Logo size={16} /></span>
        <span className="pb__name">Pusaka</span>
      </div>
      <div className="ts-cast">
        <Shadows />
        <p className="pb__text glass-water">
          <span className="ts-say ts-say--wait">
            Your plan has <span className="num ts-days">{PERIOD}</span> days left. Press “I’m still here” whenever you like and it starts again.
          </span>
          <span className="ts-say ts-say--nudge">
            <span className="num ts-days">{PERIOD}</span> days left. Still here? Press “I’m still here” and the waiting time starts again.
          </span>
          <span className="ts-say ts-say--passed">
            The waiting time passed. Anyone with the plan link can now send every heir their share.
          </span>
        </p>
      </div>
    </div>
  );
}

/** The plan card, driven by the day: its count and its state come from the scene; its buttons work. */
function TimeCard({ onCheckIn, note, onBack }: { onCheckIn: () => void; note: string; onBack: () => void }) {
  return (
    <div className="ts-cast">
      <Shadows />
      <div className="pc glass-water">
        <div className="pc__top">
          <span className="pc__label">Family plan</span>
          <span className="pc__badge ts-badge ts-badge--wait" data-tone="wait"><Clock3 aria-hidden /> Waiting</span>
          <span className="pc__badge ts-badge ts-badge--restarted" data-tone="ok"><Check aria-hidden /> Restarted</span>
          <span className="pc__badge ts-badge ts-badge--passed" data-tone="wait"><Clock3 aria-hidden /> Waiting time passed</span>
        </div>
        <p className="pc__big">
          <span className="num ts-days">{PERIOD}</span>
          <span className="pc__unit">days left</span>
        </p>
        <p className="pc__line ts-line--wait">
          Then Aisha, Omar and Layla can receive <b className="num">0.12 BCH</b>.
        </p>
        <p className="pc__line ts-line--passed">
          Aisha, Omar and Layla can receive <b className="num">0.12 BCH</b> now.
        </p>
        <p className="pc__meta">
          <span>6-month waiting time</span>
          <span className="num">About <span className="ts-date" /></span>
        </p>
        <div className="pc__actions ts-actions">
          <button type="button" className="pc__btn pc__btn--ghost" onClick={onBack}>
            <Undo2 aria-hidden /> Take my BCH back
          </button>
          <button type="button" className="pc__btn pc__btn--primary ts-still" onClick={onCheckIn}>
            <Hand aria-hidden /> I’m still here
          </button>
        </div>
        <p className="pc__note" role="status">{note}</p>
      </div>
    </div>
  );
}

function PinnedScene() {
  const root = useRef<HTMLElement>(null);
  const [copyRef, seen] = useInView<HTMLDivElement>(0.3);
  const [night, setNight] = useState(false);
  const [note, setNote] = useState('');
  /** set by the effect: press "I'm still here" from the card */
  const checkIn = useRef<() => void>(() => {});

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const q = <T extends Element>(sel: string) => section.querySelector<T>(sel)!;
    const qa = <T extends Element>(sel: string) => Array.from(section.querySelectorAll<T>(sel));
    const frame = q<HTMLElement>('.ts-frame');
    const stage = q<HTMLElement>('.ts-stage');
    const L = {
      cool: q<HTMLElement>('.ts-light--cool'),
      haze: q<HTMLElement>('.ts-light--haze'),
      warm: q<HTMLElement>('.ts-light--warm'),
      sunset: q<HTMLElement>('.ts-light--sunset'),
      dusk: q<HTMLElement>('.ts-light--dusk'),
      seed: q<HTMLElement>('.ts-seed'),
      glint: q<HTMLElement>('.ts-glint'),
      sun: q<HTMLElement>('.ts-sun__dot'),
      arc: q<HTMLElement>('.ts-sun'),
      dark: q<HTMLElement>('.ts-dark'),
      sky: q<HTMLElement>('.ts-sky'),
    };
    const am = qa<HTMLElement>('.ts-shadow--am');
    const noon = qa<HTMLElement>('.ts-shadow--noon');
    const pm = qa<HTMLElement>('.ts-shadow--pm');
    const daysEls = qa<HTMLElement>('.ts-days');
    const dateEl = q<HTMLElement>('.ts-date');
    const payout = document.getElementById('payout');
    const now = Date.now();

    /** px of scroll into the hold, eased; `shift` moves the day along after each check-in */
    const target = { e: 0 };
    const st = { e: 0 };
    let shift = 0;
    let extra = 0;
    let rewinding = false;
    let lastDays = -1;
    let lastPhase = '';
    let restartedUntil = 0;
    let frameW = 0;
    let isNight = false;

    function layout() {
      const H = frame.clientHeight;
      frameW = frame.clientWidth;
      const s = H / STAGE_H;
      stage.style.transform = `translate3d(${-REST_SHIFT * s}px, 0, 0) scale(${s})`;
    }

    function measure() {
      const top = section!.getBoundingClientRect().top;
      const p = Math.min(PIN + extra, Math.max(0, -top));
      target.e = p - shift;
    }

    function setOpacity(el: HTMLElement, o: number) {
      el.style.opacity = o.toFixed(3);
      el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
    }

    function render() {
      const t = clamp((st.e - SETTLE) / DAY);
      const d = clamp((st.e - SETTLE - DAY - PASSED) / DUSK);
      const noonness = Math.sin(Math.PI * t);

      // The light: cool and hazy at first, plain at noon, gold in the afternoon, orange as the sun goes, then blue.
      setOpacity(L.cool, 1 - smooth(0, 0.32, t));
      setOpacity(L.haze, 0.7 * (1 - smooth(0, 0.22, t)));
      setOpacity(L.warm, smooth(0.42, 0.78, t) * (1 - smooth(0.2, 0.7, d)));
      setOpacity(L.sunset, smooth(0.8, 1, t) * (1 - smooth(0.35, 0.8, d)));
      setOpacity(L.dusk, smooth(0.08, 0.75, d));
      setOpacity(L.seed, smooth(0.45, 0.85, d));

      // The sun's reflection crosses the water, brightest at noon.
      const gx = lerp(80, 980, t);
      const gy = lerp(250, 120, noonness);
      L.glint.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      setOpacity(L.glint, (0.35 + 0.65 * noonness) * (1 - smooth(0, 0.3, d)));

      // The sun on its arc above the picture, sinking at dusk.
      const st2 = t;
      const x0 = 40, x1 = frameW - 40, ax = (1 - st2) ** 2 * x0 + 2 * (1 - st2) * st2 * (frameW / 2) + st2 ** 2 * x1;
      // the same curve as the drawn arc: from 84 px at the ends through a control point at 6.5 px
      const ay = (1 - st2) ** 2 * 84 + 2 * (1 - st2) * st2 * 6.5 + st2 ** 2 * 84 + d * 60;
      L.sun.style.transform = `translate3d(${ax}px, ${ay}px, 0)`;
      setOpacity(L.arc, 1 - smooth(0, 0.35, d));

      // Shadows swing from right to left of the cards as the sun crosses, and go at dusk.
      const wa = clamp(1 - 2 * t), wp = clamp(2 * t - 1), wn = 1 - wa - wp;
      const shade = 1 - smooth(0.1, 0.5, d);
      am.forEach((el) => setOpacity(el, wa * shade));
      noon.forEach((el) => setOpacity(el, wn * shade));
      pm.forEach((el) => setOpacity(el, wp * shade));

      // Night falls on the page around the picture, then the picture goes and the night title is there.
      setOpacity(L.dark, smooth(0.22, 0.72, d));
      frame.style.opacity = (1 - smooth(0.74, 0.92, d)).toFixed(3);
      setOpacity(L.sky, smooth(0.8, 0.97, d));
      payout?.style.setProperty('--ps-sky', smooth(0.9, 1, d).toFixed(3));
      const nightNow = d > 0.3;
      if (nightNow !== isNight) { isNight = nightNow; setNight(nightNow); }

      // The count and what Pusaka says.
      const days = Math.max(0, Math.ceil(PERIOD * (1 - t) - 1e-6));
      if (days !== lastDays) {
        lastDays = days;
        const text = String(days);
        daysEls.forEach((el) => { el.textContent = text; });
        dateEl.textContent = formatDay(now + days * DAY_MS);
      }
      const phase = t >= 1 ? 'passed' : t >= NUDGE ? 'nudge' : 'wait';
      if (phase !== lastPhase) {
        lastPhase = phase;
        section!.dataset.phase = phase;
        // a note about the last press belongs to that morning only
        if (phase !== 'wait') setNote('');
      }
      const restarted = performance.now() < restartedUntil;
      if (restarted !== (section!.dataset.restarted === 'true')) section!.dataset.restarted = String(restarted);
    }

    let raf = 0;
    let last = 0;
    let near = false;
    function tick(now: number) {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      measure();
      // Eased toward the scroll; a rewind runs slower, so the light is seen going back.
      const k = 1 - Math.exp(-(rewinding ? 2.6 : 7) * dt);
      const diff = target.e - st.e;
      let moving = Math.abs(diff) > 0.3;
      if (moving) st.e += diff * k; else { st.e = target.e; rewinding = false; }
      render();
      if (performance.now() < restartedUntil) moving = true;
      raf = moving && near ? requestAnimationFrame(tick) : 0;
      if (!raf) last = 0;
    }
    const wake = () => { if (!raf && near) raf = requestAnimationFrame(tick); };

    checkIn.current = () => {
      // A whole new day from here: the hold grows by however far into the day we were.
      const top = section.getBoundingClientRect().top;
      const p = Math.max(0, -top);
      const add = Math.max(0, p - SETTLE - shift);
      shift += add;
      if (shift > extra) {
        extra = shift;
        section.style.setProperty('--pin', `${PIN + extra}px`);
      }
      rewinding = true;
      restartedUntil = performance.now() + 2600;
      wake();
    };

    const io = new IntersectionObserver(([e]) => {
      near = e.isIntersecting;
      if (!near) { measure(); st.e = target.e; render(); }
      wake();
    }, { rootMargin: '50% 0px' });
    io.observe(section);
    const ro = new ResizeObserver(() => { layout(); measure(); render(); });
    ro.observe(frame);

    layout();
    measure();
    st.e = target.e;
    render();
    window.addEventListener('scroll', wake, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', wake);
      io.disconnect();
      ro.disconnect();
      payout?.style.removeProperty('--ps-sky');
    };
  }, []);

  const onCheckIn = useCallback(() => {
    checkIn.current();
    setNote('Waiting time restarted. A preview, so nothing was sent.');
  }, []);
  const onBack = useCallback(() => setNote('In a real plan, this sends the 0.12 BCH back to your wallet.'), []);

  return (
    <section ref={root} className="ts ts--pinned" data-phase="wait" style={{ ['--pin' as string]: `${PIN}px` }}>
      <div className="ps-pin">
        <div ref={copyRef} className="ps-copy-wrap">
          <Copy seen={seen} hint />
        </div>
        <div className="ts-dark" aria-hidden />
        <div className="ts-frame">
          <div className="ts-stage">
            <img
              className="ps-stage__photo"
              src={`${BASE}landing/paddy-scene-2560.webp`}
              srcSet={`${BASE}landing/paddy-scene-2560.webp 1x, ${BASE}landing/paddy-scene.webp 2x`}
              alt="A blue water lily floating on its pads in a flooded rice paddy, seen from above in dappled palm shade."
              width={STAGE_W}
              height={STAGE_H}
              loading="lazy"
              decoding="async"
            />
            <div className="ps-stage__dusk" aria-hidden />
            <div className="ts-light ts-light--cool" aria-hidden />
            <div className="ts-light ts-light--haze" aria-hidden />
            <div className="ts-light ts-light--warm" aria-hidden />
            <div className="ts-light ts-light--sunset" aria-hidden />
            <div className="ts-glint" aria-hidden />
            <div className="ts-light ts-light--dusk" aria-hidden />
            <div className="ts-seed" style={{ left: SEED.x, top: SEED.y }} aria-hidden />
            <div className="ps-float">
              <div className="ps-float__tilt">
                <TimeBubble />
                <TimeCard onCheckIn={onCheckIn} note={note} onBack={onBack} />
              </div>
            </div>
          </div>
          {night && <Fireflies still={false} />}
          <div className="ts-sun" aria-hidden>
            <svg className="ts-sun__arc" viewBox="0 0 1000 100" preserveAspectRatio="none">
              <path d="M 0 100 Q 500 -14 1000 100" />
            </svg>
            <span className="ts-sun__dot" />
          </div>
          <div className="ps-grain grain" aria-hidden />
        </div>
        <div className="ps-sky ts-sky" aria-hidden>
          <div className="ps-sky__title">
            <p className="lp-display-xl">{NIGHT_TITLE}</p>
            <p className="ps-sky__sub">{NIGHT_SUB}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Phones, tablets and reduced motion: the copy, then the working plan card on a patch of the paddy. */
function StackedScene() {
  const [copyRef, seen] = useInView<HTMLDivElement>(0.15);
  return (
    <section className="ps ps--stacked" aria-label={TITLE_TEXT}>
      <div ref={copyRef} className="lp-wrap">
        <Copy seen={seen} className="ps-copy--stacked" />
        <div className={`water-box ps-box rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '300ms' }}>
          <PlanBubble glass="glass-lite" />
          <ScenePlanCard glass="glass-lite" />
        </div>
      </div>
    </section>
  );
}

export function TimeScroll() {
  const pinned = useMedia(PINNED_QUERY);
  return pinned ? <PinnedScene /> : <StackedScene />;
}
