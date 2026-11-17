// "While you're here, it waits. When you're not, it pays." The landing's scroll scene, over a flooded paddy.
//
// Desktop (1024 px and up, motion allowed): the title slides up word by word, then a big frame opens from the
// right edge as you scroll, showing the paddy from above: the bloom floating on its pads, Pusaka's reminder and
// the plan card lying on the water. The section then holds the screen (position: sticky) while the frame grows to
// fill it and the camera moves right across the water onto "What if someone tries to cheat?" and its two layers,
// already lying there. After a short hold, mist rises off the water and covers it; under that cover it turns to
// night with "One payment pays everyone." already in place; the mist thins and the night section follows.
//
// How it stays smooth: the photo and everything on it are one fixed-size stage, laid out once and only moved
// and scaled with `transform`; the frame is a window over it (`clip-path`). Three numbers drive it all (open,
// track, up), eased toward the scroll position each frame, so no layout runs while scrolling.
//
// Phones, tablets and reduced motion: no hold and no camera. The copy, then the plan on a patch of the paddy,
// then the cheat block on its own, as plain sections.
import { useEffect, useRef } from 'react';
import { Hand, Send, Undo2 } from 'lucide-react';
import { useMedia } from '../../components/useMedia';
import { SplitWords, useInView } from './motion';
import { CheatBlock, PlanBubble, ScenePlanCard } from './paddyParts';
import { NIGHT_SUB, NIGHT_TITLE, PINNED_QUERY } from './landingCopy';

/** The stage, in the photo's proportions (paddy-scene is 3:1). */
const STAGE_W = 2160;
const STAGE_H = 720;
/** Scroll distances of the hold, in px: the camera move, a pause on the cheat block, the rise into the night. */
const TRACK = 1600;
/** At rest the photo is shifted left by this many stage pixels, so the bloom shows beside the plan card. */
const REST_SHIFT = 140;
const HOLD = 260;
const UP = 1300;
const PIN = TRACK + HOLD + UP;

const TITLE = 'While you’re here,\nit waits.\nWhen you’re not,\nit pays.';
const TITLE_TEXT = 'While you’re here, it waits. When you’re not, it pays.';
const SUB = 'Press “I’m still here” now and then. If the waiting time passes without it, anyone with the plan link can send every heir their share.';
const MISTS = [
  { src: 'mist-a', cls: 'ps-mist--1', blur: 6 },
  { src: 'mist-b', cls: 'ps-mist--2', blur: 12 },
  { src: 'mist-a', cls: 'ps-mist--3', blur: 18 },
  { src: 'mist-b', cls: 'ps-mist--4', blur: 26 },
];

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

function Copy({ seen, className = '' }: { seen: boolean; className?: string }) {
  return (
    <div className={`ps-copy ${className}`}>
      <h2 className="lp-display" aria-label={TITLE_TEXT}>
        <SplitWords text={TITLE} seen={seen} />
      </h2>
      <p className={`lp-sub rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '420ms' }}>{SUB}</p>
      <Points className={`rise-in${seen ? ' is-seen' : ''}`} />
    </div>
  );
}

/** The photo and everything lying on it, in stage pixels. */
function Stage() {
  return (
    <div className="ps-stage">
      <img
        className="ps-stage__photo"
        src="/landing/paddy-scene-2560.webp"
        srcSet="/landing/paddy-scene-2560.webp 1x, /landing/paddy-scene.webp 2x"
        alt="A blue water lily floating on its pads in a flooded rice paddy, seen from above in dappled palm shade."
        width={STAGE_W}
        height={STAGE_H}
        loading="lazy"
        decoding="async"
      />
      <div className="ps-stage__dusk" aria-hidden />
      <div className="ps-float">
        <div className="ps-float__tilt">
          <PlanBubble />
          <ScenePlanCard />
        </div>
      </div>
      <div className="ps-cheat">
        <CheatBlock tone="scene" headingId="safety" />
      </div>
    </div>
  );
}

function PinnedScene() {
  const root = useRef<HTMLElement>(null);
  const [copyRef, seen] = useInView<HTMLDivElement>(0.3);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const q = <T extends Element>(sel: string) => section.querySelector<T>(sel)!;
    const visual = q<HTMLElement>('.ps-visual');
    const stage = q<HTMLElement>('.ps-stage');
    const copy = q<HTMLElement>('.ps-copy');
    const cheat = q<HTMLElement>('.ps-cheat');
    const sky = q<HTMLElement>('.ps-sky');
    const fog = q<HTMLElement>('.ps-fog');
    const grain = q<HTMLElement>('.ps-grain');
    const mists = Array.from(section.querySelectorAll<HTMLElement>('.ps-mist'));
    // The night section is pulled up under the end of this scene; its controls and fireflies appear as the fog clears.
    const night = document.getElementById('payout');

    const target = { open: 0, track: 0, up: 0 };
    const st = { open: 0, track: 0, up: 0 };

    function measure() {
      const vh = window.innerHeight;
      const top = section!.getBoundingClientRect().top;
      target.open = clamp((vh * 0.85 - top) / (vh * 0.85));
      const p = Math.max(0, -top);
      target.track = clamp(p / TRACK);
      target.up = clamp((p - TRACK - HOLD) / UP);
    }

    function render() {
      const W = visual.clientWidth;
      const H = visual.clientHeight;
      // At rest the frame starts beside the copy column; at the end it fills the screen.
      const L0 = Math.max(500, (W - 1200) / 2 + 520);
      const H0 = Math.min(H * 0.78, 760);
      const T0 = (H - H0) / 2;
      const t = st.track;
      const left = lerp(lerp(W, L0, st.open), 0, t);
      const top = lerp(T0, 0, t);
      const h = lerp(H0, H, t);
      const r = lerp(36, 0, t);
      visual.style.clipPath = `inset(${top}px 0px ${H - top - h}px ${left}px round ${r}px 0 0 ${r}px)`;
      // The stage sits in the window at the window's height; at the end it covers the screen with its right edge
      // on the screen's right edge, so the camera has moved across the water.
      const s0 = H0 / STAGE_H;
      const s1 = Math.max(H / STAGE_H, (W * 1.3) / STAGE_W);
      const sc = lerp(s0, s1, t);
      const x0 = L0 - REST_SHIFT * s0 + (1 - st.open) * 90; // a little parallax while it opens
      const x1 = W - STAGE_W * s1;
      const y1 = (H - STAGE_H * s1) / 2;
      const sx = lerp(x0, x1, t);
      stage.style.transform = `translate3d(${sx}px, ${lerp(T0, y1, t)}px, 0) scale(${sc})`;
      // The copy slides left with the photo, by the same distance.
      copy.style.transform = `translate3d(${sx - x0}px, 0, 0)`;
      // The cheat block lies at the photo's far side; it comes in as the camera starts to move.
      const c = clamp((t - 0.12) / 0.25);
      cheat.style.opacity = String(c);
      cheat.style.visibility = c > 0 ? 'visible' : 'hidden';
      // Into the mist, then the night.
      const u = st.up;
      sky.style.visibility = u > 0.38 ? 'visible' : 'hidden';
      sky.style.opacity = String(smooth(0.4, 0.52, u));
      // Layers that are fully transparent are hidden too, so the blurred mist is never composited for nothing.
      const fogO = smooth(0.16, 0.45, u) * (1 - smooth(0.6, 0.92, u));
      fog.style.opacity = String(fogO);
      fog.style.visibility = fogO > 0 ? 'visible' : 'hidden';
      fog.style.transform = `translate3d(0, ${H * (0.55 - 0.9 * u)}px, 0)`;
      mists.forEach((m, i) => {
        const k = [1, 1.2, 0.9, 1.35][i];
        m.style.transform = `translate3d(0, ${H * (1 + i * 0.12 - 1.5 * u * k)}px, 0) scale(${1.1 + 0.3 * u})`;
        const o = smooth(0, 0.3, u) * (1 - smooth(0.6, 0.86, u));
        m.style.opacity = String(o);
        m.style.visibility = o > 0 ? 'visible' : 'hidden';
      });
      grain.style.opacity = String(1 - smooth(0.4, 0.52, u));
      night?.style.setProperty('--ps-sky', String(smooth(0.6, 0.92, u)));
    }

    let frame = 0;
    let last = 0;
    let near = false;
    function tick(now: number) {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      measure();
      // Eased toward the scroll, like a 0.8 s scrub: quick to start, soft to settle.
      const k = 1 - Math.exp(-7 * dt);
      let moving = false;
      for (const key of ['open', 'track', 'up'] as const) {
        const d = target[key] - st[key];
        if (Math.abs(d) > 0.0004) { st[key] += d * k; moving = true; } else st[key] = target[key];
      }
      render();
      frame = moving && near ? requestAnimationFrame(tick) : 0;
      if (!frame) last = 0;
    }
    const wake = () => { if (!frame && near) frame = requestAnimationFrame(tick); };

    const io = new IntersectionObserver(([e]) => {
      near = e.isIntersecting;
      // Leaving (a long jump away): settle on where the scroll is, so coming back never eases from a stale point.
      if (!near) { measure(); Object.assign(st, target); render(); }
      wake();
    }, { rootMargin: '50% 0px' });
    io.observe(section);
    const ro = new ResizeObserver(() => { measure(); render(); });
    ro.observe(visual);

    // Start where the scroll already is (a reload halfway down), without easing in.
    measure();
    Object.assign(st, target);
    render();

    window.addEventListener('scroll', wake, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', wake);
      io.disconnect();
      ro.disconnect();
      night?.style.removeProperty('--ps-sky');
    };
  }, []);

  return (
    <section ref={root} className="ps ps--pinned" style={{ ['--pin' as string]: `${PIN}px` }}>
      <div className="ps-pin">
        <div ref={copyRef} className="ps-copy-wrap">
          <Copy seen={seen} />
        </div>
        <div className="ps-visual">
          <Stage />
          <div className="ps-sky" aria-hidden>
            <div className="ps-sky__title">
              <p className="lp-display-xl">{NIGHT_TITLE}</p>
              <p className="ps-sky__sub">{NIGHT_SUB}</p>
            </div>
          </div>
          {MISTS.map((m, i) => (
            <img key={i} className={`ps-mist ${m.cls}`} src={`/landing/${m.src}.webp`} alt="" aria-hidden loading="lazy" decoding="async" style={{ filter: `blur(${m.blur}px)` }} />
          ))}
          <div className="ps-fog" aria-hidden />
          <div className="ps-grain grain" aria-hidden />
        </div>
      </div>
    </section>
  );
}

/** Phones, tablets and reduced motion: the same story as plain sections. */
function StackedScene() {
  const [copyRef, seen] = useInView<HTMLDivElement>(0.15);
  const [cheatRef, cheatSeen] = useInView<HTMLElement>(0.1);
  return (
    <>
      <section className="ps ps--stacked" aria-label={TITLE_TEXT}>
        <div ref={copyRef} className="lp-wrap">
          <Copy seen={seen} className="ps-copy--stacked" />
          <div className={`water-box ps-box rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '300ms' }}>
            <PlanBubble glass="glass-lite" />
            <ScenePlanCard glass="glass-lite" />
          </div>
        </div>
      </section>
      <section ref={cheatRef} className="lp-section cheat-stacked" aria-labelledby="safety">
        <header className="lp-head">
          <h2 id="safety" className="lp-h2" aria-label="What if someone tries to cheat?">
            <SplitWords text="What if someone tries to cheat?" seen={cheatSeen} />
          </h2>
          <p className={`lp-sub rise-in${cheatSeen ? ' is-seen' : ''}`} style={{ animationDelay: '300ms' }}>
            Your rules live on the Bitcoin Cash network, not on this website. A trick has to get past Pusaka, then past
            the network.
          </p>
        </header>
        <div className={`rise-in${cheatSeen ? ' is-seen' : ''}`} style={{ animationDelay: '380ms' }}>
          <CheatBlock tone="page" />
        </div>
      </section>
    </>
  );
}

export function PaddyScroll() {
  const pinned = useMedia(PINNED_QUERY);
  return pinned ? <PinnedScene /> : <StackedScene />;
}
