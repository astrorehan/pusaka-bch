// "One payment pays everyone.": the paddy at night, fireflies over the water, and the payout drawn as light.
// The plan's seed on the left, one payment in the middle, every heir on the right; coins of light run along the
// paths. "I'm still here" switches it: the heirs' paths go quiet and a loop runs back to the plan instead.
// Pick an heir to see their exact amount. No frame: the drawing's edges fade into the night.
//
// Desktop with motion: the title was already shown at the end of the paddy scroll (PaddyScroll), so this section
// pulls up under it and starts with the drawing. Elsewhere it carries its own title.
// Reduced motion: no moving coins and the fireflies hold still.
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Clock3, Hand, Send, UsersRound } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { useMedia } from '../../components/useMedia';
import { SplitWords, useInView } from './motion';
import { NIGHT_SUB, NIGHT_TITLE, PINNED_QUERY } from './landingCopy';
import { HEIRS } from './payoutHeirs';

interface Pt { x: number; y: number }
interface Label extends Pt { align: 'center' | 'start' }
interface Layout {
  w: number; h: number; wide: boolean;
  plan: Pt; planR: number; planLabel: Label;
  hub: Pt; hubR: number; hubLabel: Label;
  /** heirs are anchored by their left edge */
  heirs: Pt[];
}

// Wide: plan, payment and heirs in a row. Tall (phones): plan and payment down the left with their labels
// beside or under them, the heirs stacked on the right, so no label sits on a path.
const WIDE: Layout = {
  w: 1200, h: 520, wide: true,
  plan: { x: 200, y: 260 }, planR: 74, planLabel: { x: 200, y: 386, align: 'center' },
  hub: { x: 600, y: 260 }, hubR: 48, hubLabel: { x: 600, y: 342, align: 'center' },
  heirs: [80, 200, 320, 440].map((y) => ({ x: 900, y })),
};
const TALL: Layout = {
  w: 360, h: 500, wide: false,
  plan: { x: 76, y: 80 }, planR: 56, planLabel: { x: 150, y: 80, align: 'start' },
  hub: { x: 76, y: 318 }, hubR: 38, hubLabel: { x: 76, y: 384, align: 'center' },
  heirs: [196, 270, 344, 418].map((y) => ({ x: 194, y })),
};

function paths(L: Layout) {
  const { plan, planR, hub, hubR } = L;
  if (L.wide) {
    return {
      into: `M ${plan.x + planR} ${plan.y} L ${hub.x - hubR} ${hub.y}`,
      out: L.heirs.map((e) => `M ${hub.x + hubR} ${hub.y} C ${hub.x + 160} ${hub.y}, ${e.x - 170} ${e.y}, ${e.x - 6} ${e.y}`),
      loop: `M ${hub.x} ${hub.y - hubR} C ${hub.x} ${hub.y - 190}, ${plan.x} ${plan.y - 210}, ${plan.x} ${plan.y - planR}`,
    };
  }
  return {
    into: `M ${plan.x} ${plan.y + planR} L ${hub.x} ${hub.y - hubR}`,
    out: L.heirs.map((e) => `M ${hub.x + hubR} ${hub.y} C ${hub.x + 70} ${hub.y}, ${e.x - 40} ${e.y}, ${e.x - 4} ${e.y}`),
    loop: `M ${hub.x - hubR} ${hub.y} C ${hub.x - 80} ${hub.y}, ${plan.x - 84} ${plan.y}, ${plan.x - planR} ${plan.y}`,
  };
}

const at = (L: Layout, p: Pt) => ({ left: `${(p.x / L.w) * 100}%`, top: `${(p.y / L.h) * 100}%` });

/** Fireflies over the night paddy: a few dozen soft points that drift and blink. Drawn only while on screen. */
export function Fireflies({ still }: { still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    // seeded, so the night looks the same every visit
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const flies = Array.from({ length: 46 }, () => ({
      x: rnd(), y: 0.08 + rnd() * 0.84, r: 0.8 + rnd() * 1.5,
      ax: 0.012 + rnd() * 0.03, ay: 0.01 + rnd() * 0.02, fx: 0.05 + rnd() * 0.12, fy: 0.04 + rnd() * 0.1,
      ph: rnd() * Math.PI * 2, blink: 0.25 + rnd() * 0.6,
    }));
    function size() {
      W = c!.clientWidth; H = c!.clientHeight;
      c!.width = Math.round(W * dpr); c!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw(t: number) {
      ctx!.clearRect(0, 0, W, H);
      for (const f of flies) {
        const x = (f.x + Math.sin(t * f.fx + f.ph) * f.ax) * W;
        const y = (f.y + Math.cos(t * f.fy + f.ph) * f.ay) * H;
        const a = still ? 0.7 : 0.15 + 0.85 * Math.max(0, Math.sin(t * f.blink + f.ph)) ** 2;
        const halo = ctx!.createRadialGradient(x, y, 0, x, y, f.r * 7);
        halo.addColorStop(0, `rgba(226, 236, 120, ${0.42 * a})`);
        halo.addColorStop(1, 'rgba(226, 236, 120, 0)');
        ctx!.fillStyle = halo;
        ctx!.beginPath(); ctx!.arc(x, y, f.r * 7, 0, Math.PI * 2); ctx!.fill();
        ctx!.fillStyle = `rgba(250, 252, 205, ${a})`;
        ctx!.beginPath(); ctx!.arc(x, y, f.r, 0, Math.PI * 2); ctx!.fill();
      }
    }
    let frame = 0;
    let on = false;
    const loop = (now: number) => { draw(now / 1000); frame = on ? requestAnimationFrame(loop) : 0; };
    const io = new IntersectionObserver(([e]) => {
      on = e.isIntersecting && !still && !document.hidden;
      if (on && !frame) frame = requestAnimationFrame(loop);
      if (still) draw(0);
    });
    const ro = new ResizeObserver(() => { size(); draw(performance.now() / 1000); });
    size();
    draw(0);
    io.observe(c);
    ro.observe(c);
    return () => { on = false; cancelAnimationFrame(frame); io.disconnect(); ro.disconnect(); };
  }, [still]);
  return <canvas ref={canvas} className="np__flies" aria-hidden />;
}

export function NightPayout() {
  const id = useId();
  const pinned = useMedia(PINNED_QUERY);
  const narrow = useMedia('(max-width: 767px)');
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const [ref, seen] = useInView<HTMLElement>(0.05);
  const [mode, setMode] = useState<'payout' | 'checkin'>('payout');
  const [pick, setPick] = useState(0);
  const L = narrow ? TALL : WIDE;
  const P = paths(L);
  const payout = mode === 'payout';
  const heir = HEIRS[pick];

  return (
    <section ref={ref} id="payout" className={`np${pinned ? ' np--pulled' : ''}`} aria-labelledby={`${id}-title`}>
      <Fireflies still={still} />
      <div className="np__inner">
        {pinned ? (
          <h2 id={`${id}-title`} className="sr-only">{NIGHT_TITLE}</h2>
        ) : (
          <header className="np__head">
            <h2 id={`${id}-title`} className="lp-display-xl" aria-label={NIGHT_TITLE}>
              <SplitWords text={NIGHT_TITLE} seen={seen} />
            </h2>
            <p className={`np__sub rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '300ms' }}>{NIGHT_SUB}</p>
          </header>
        )}

        <div className={`np__controls rise-in${seen ? ' is-seen' : ''}`} role="tablist" aria-label="What the plan does" style={{ animationDelay: '120ms' }}>
          <button type="button" role="tab" aria-selected={payout} className="np__tab" onClick={() => setMode('payout')}>
            <Send aria-hidden /> Send to heirs
          </button>
          <button type="button" role="tab" aria-selected={!payout} className="np__tab" onClick={() => setMode('checkin')}>
            <Hand aria-hidden /> I’m still here
          </button>
        </div>

        <div
          className={`np__map rise-in${seen ? ' is-seen' : ''}`}
          data-mode={mode}
          data-layout={L.wide ? 'wide' : 'tall'}
          style={{ aspectRatio: `${L.w} / ${L.h}`, animationDelay: '200ms' }}
        >
          <svg className="np__svg" viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden key={L.wide ? 'w' : 't'}>
            <path className="np__path np__path--in" d={P.into} />
            {P.out.map((d, i) => (
              <path
                key={i}
                className={`np__path np__path--out${i === pick ? ' is-pick' : ''}`}
                d={d}
                style={{ ['--c' as string]: HEIRS[i].color }}
              />
            ))}
            <path className="np__path np__path--loop" d={P.loop} />
            {!still && payout && (
              <g className="np__coins">
                {[0, 0.8, 1.6].map((b) => (
                  <circle key={`in${b}`} r="3.5" className="np__coin">
                    <animateMotion dur="2.4s" begin={`${b}s`} repeatCount="indefinite" path={P.into} />
                  </circle>
                ))}
                {P.out.flatMap((d, i) => [0.4, 1.6].map((b) => (
                  <circle key={`o${i}${b}`} r={i === pick ? 4 : 3} className="np__coin" style={{ ['--c' as string]: HEIRS[i].color }}>
                    <animateMotion dur="2.4s" begin={`${b + i * 0.15}s`} repeatCount="indefinite" path={d} />
                  </circle>
                )))}
              </g>
            )}
            {!still && !payout && (
              <circle r="4" className="np__coin np__coin--loop">
                <animateMotion dur="2.6s" repeatCount="indefinite" path={P.loop} />
              </circle>
            )}
          </svg>

          <div className="np__plan" style={at(L, L.plan)}>
            <span className="np__seed"><Logo size={L.wide ? 64 : 48} /></span>
          </div>
          <div className="np__plan-label" data-align={L.planLabel.align} style={at(L, L.planLabel)}>
            <span className="np__kicker">For your heirs</span>
            <strong className="num">0.12 BCH</strong>
            <span className="np__state">
              {payout ? <Clock3 aria-hidden /> : <Check aria-hidden />}
              {payout ? 'Waiting time passed' : 'Waiting time restarted'}
            </span>
          </div>

          <div className="np__hub" style={at(L, L.hub)}>
            {payout ? <UsersRound aria-hidden /> : <Hand aria-hidden />}
          </div>
          <div className="np__hub-label" data-align={L.hubLabel.align} style={at(L, L.hubLabel)}>
            <strong>{payout ? 'One payment' : '“I’m still here”'}</strong>
            <span>{payout ? 'Pays every heir together' : 'Nothing leaves the plan'}</span>
          </div>

          <ul className="np__heirs" aria-label="Heirs">
            {HEIRS.map((h, i) => (
              <li key={h.name} style={at(L, L.heirs[i])}>
                <button
                  type="button"
                  className="np__heir"
                  aria-pressed={i === pick}
                  style={{ ['--c' as string]: h.color }}
                  onClick={() => setPick(i)}
                >
                  <span className="np__dot" aria-hidden />
                  <span className="np__heir-name">{h.name}</span>
                  <span className="np__heir-pct num">{h.pct}%</span>
                  <span className="np__heir-amt num">{h.bch} BCH</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={`np__inspector rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '280ms' }} aria-live="polite">
          <p className="np__detail">
            <span className="np__dot" style={{ ['--c' as string]: payout ? heir.color : 'var(--accent)' }} aria-hidden />
            {payout ? (
              <span>
                <b>{heir.name} receives <span className="num">{heir.bch} BCH</span></b>{' '}
                <span className="np__muted num">({heir.sats} satoshis, {heir.pct}% share), in the same payment as everyone else.</span>
              </span>
            ) : (
              <span>
                <b>The waiting time starts again.</b>{' '}
                <span className="np__muted">All <span className="num">0.12 BCH</span> stays in the plan, and the heirs wait for the new date.</span>
              </span>
            )}
          </p>
          <p className="np__fee">The network fee, about 9,000 to 12,000 satoshis, is paid by whoever presses the button.</p>
        </div>
      </div>
      <div className="np__tail" aria-hidden />
    </section>
  );
}
