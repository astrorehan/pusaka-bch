// "One payment pays everyone.": the night payout flow, distilled to a borderless, minimalist beam diagram.
// Clean floating medallions, razor-thin curved animated beams, a subtle rising blurred horizon circle at the
// bottom edge, and minimal text.
//
// Pick any heir to focus their beam and read their exact share. Switch between "Send to heirs" and
// "I'm still here" to see the simultaneous split vs. the check-in return loop. Amounts never animate.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Hand, Send } from 'lucide-react';
import { useMedia } from '../../components/useMedia';
import { BASE } from '../../lib/asset';
import { SplitWords, useInView } from './motion';
import { Fireflies } from './NightPayout';
import { HEIRS, POT } from './payoutHeirs';
import { NIGHT_SUB, NIGHT_TITLE, PINNED_QUERY } from './landingCopy';
import './subak.css';

type Mode = 'payout' | 'checkin';

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
}

interface BeamSegment {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface FlowGeo {
  w: number;
  h: number;
  feed: BeamSegment;
  out: BeamSegment[];
  ret: BeamSegment;
}

const HEIR_HEX = ['#60a5fa', '#a78bfa', '#22d3ee', '#f472b6', '#a3e635'] as const;
const BCH_ICON = `${BASE}brands/bitcoin-cash.svg`;

/** True while the element is on screen, so beam animations pause when scrolled away. */
function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: '80px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on] as const;
}

function relBox(el: HTMLElement, root: DOMRect): Box {
  const r = el.getBoundingClientRect();
  const left = r.left - root.left;
  const top = r.top - root.top;
  return {
    left,
    right: left + r.width,
    top,
    bottom: top + r.height,
    cx: left + r.width / 2,
    cy: top + r.height / 2,
  };
}

function measureFlow(
  rootEl: HTMLElement,
  planEl: HTMLElement,
  hubEl: HTMLElement,
  heirEls: (HTMLElement | null)[],
  narrow: boolean,
): FlowGeo | null {
  const root = rootEl.getBoundingClientRect();
  if (root.width < 10 || root.height < 10) return null;
  const plan = relBox(planEl, root);
  const hub = relBox(hubEl, root);
  const heirs = heirEls.map((el) => (el ? relBox(el, root) : null));
  if (heirs.some((b) => b === null)) return null;
  const boxes = heirs as Box[];

  if (!narrow) {
    // Desktop: horizontal 1 -> Hub -> 3 beam diagram
    const fx1 = plan.cx;
    const fy1 = plan.cy;
    const fx2 = hub.cx;
    const fy2 = hub.cy;
    const fmx = (fx1 + fx2) / 2;
    const feed: BeamSegment = {
      d: `M ${fx1.toFixed(1)} ${fy1.toFixed(1)} Q ${fmx.toFixed(1)} ${fy1.toFixed(1)} ${fx2.toFixed(1)} ${fy2.toFixed(1)}`,
      x1: fx1,
      y1: fy1,
      x2: fx2,
      y2: fy2,
    };

    const out: BeamSegment[] = boxes.map((b, i) => {
      const x1 = hub.cx;
      const y1 = hub.cy;
      const x2 = b.cx;
      const y2 = b.cy;
      const dx = x2 - x1;
      const spread = (i - (boxes.length - 1) / 2) * 14;
      const cx1 = x1 + dx * 0.48;
      const cx2 = x2 - dx * 0.42;
      return {
        d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx1.toFixed(1)} ${(y1 + spread).toFixed(1)}, ${cx2.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
        x1,
        y1,
        x2,
        y2,
      };
    });

    // Check-in return arc: smooth shallow curve arching over the top from Hub back to Plan
    const rx1 = hub.cx;
    const ry1 = hub.cy;
    const rx2 = plan.cx;
    const ry2 = plan.cy;
    const archY = Math.min(ry1, ry2) - 82;
    const ret: BeamSegment = {
      d: `M ${rx1.toFixed(1)} ${ry1.toFixed(1)} Q ${((rx1 + rx2) / 2).toFixed(1)} ${archY.toFixed(1)} ${rx2.toFixed(1)} ${ry2.toFixed(1)}`,
      x1: rx1,
      y1: ry1,
      x2: rx2,
      y2: ry2,
    };

    return { w: root.width, h: root.height, feed, out, ret };
  }

  // Mobile (< 768px): clean symmetrical top -> center -> 3-column bottom fan
  const feed: BeamSegment = {
    d: `M ${plan.cx.toFixed(1)} ${plan.cy.toFixed(1)} L ${hub.cx.toFixed(1)} ${hub.cy.toFixed(1)}`,
    x1: plan.cx,
    y1: plan.cy,
    x2: hub.cx,
    y2: hub.cy,
  };

  const out: BeamSegment[] = boxes.map((b) => {
    const x1 = hub.cx;
    const y1 = hub.cy;
    const x2 = b.cx;
    const y2 = b.cy;
    const my = y1 + (y2 - y1) * 0.54;
    return {
      d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${my.toFixed(1)}, ${x2.toFixed(1)} ${my.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      x1,
      y1,
      x2,
      y2,
    };
  });

  // Check-in return loop curving gracefully around the right side back up to the Plan tile
  const archX = Math.max(plan.cx, hub.cx) + 74;
  const ret: BeamSegment = {
    d: `M ${hub.cx.toFixed(1)} ${hub.cy.toFixed(1)} Q ${archX.toFixed(1)} ${((hub.cy + plan.cy) / 2).toFixed(1)} ${plan.cx.toFixed(1)} ${plan.cy.toFixed(1)}`,
    x1: hub.cx,
    y1: hub.cy,
    x2: plan.cx,
    y2: plan.cy,
  };

  return { w: root.width, h: root.height, feed, out, ret };
}

/** Segmented control with a smoothly sliding measured pill indicator. */
function ModeSegmented({
  mode,
  onChange,
  seen,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
  seen: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const payoutRef = useRef<HTMLButtonElement>(null);
  const checkinRef = useRef<HTMLButtonElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const root = rootRef.current;
      const active = mode === 'payout' ? payoutRef.current : checkinRef.current;
      if (!root || !active) return;
      setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    update();
    const ro = new ResizeObserver(update);
    if (rootRef.current) ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, [mode]);

  return (
    <div
      ref={rootRef}
      className={`pf-seg rise-in${seen ? ' is-seen' : ''}`}
      role="tablist"
      aria-label="What the plan does"
      style={{ animationDelay: '120ms' }}
    >
      {pill && (
        <span
          className="pf-seg__indicator"
          aria-hidden
          style={{ transform: `translateX(${pill.left}px)`, width: `${pill.width}px` }}
        />
      )}
      <button
        ref={payoutRef}
        type="button"
        role="tab"
        aria-selected={mode === 'payout'}
        className="pf-seg__tab"
        onClick={() => onChange('payout')}
      >
        <Send strokeWidth={1.75} aria-hidden />
        <span>Send to heirs</span>
      </button>
      <button
        ref={checkinRef}
        type="button"
        role="tab"
        aria-selected={mode === 'checkin'}
        className="pf-seg__tab"
        onClick={() => onChange('checkin')}
      >
        <Hand strokeWidth={1.75} aria-hidden />
        <span>I’m still here</span>
      </button>
    </div>
  );
}

/** Razor-thin animated beam curves. */
function FlowBeams({
  id,
  geo,
  payout,
  pick,
  still,
}: {
  id: string;
  geo: FlowGeo | null;
  payout: boolean;
  pick: number;
  still: boolean;
}) {
  if (!geo) return null;
  return (
    <svg
      className="pf-beams"
      width={geo.w}
      height={geo.h}
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient
          id={`${id}-feed`}
          gradientUnits="userSpaceOnUse"
          x1={geo.feed.x1}
          y1={geo.feed.y1}
          x2={geo.feed.x2}
          y2={geo.feed.y2}
        >
          <stop offset="0%" stopColor={payout ? '#e3ca8e' : '#2fd9a6'} stopOpacity="0" />
          <stop offset="55%" stopColor={payout ? '#f3dc9e' : '#2fd9a6'} stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff8ec" stopOpacity="1" />
        </linearGradient>

        <linearGradient
          id={`${id}-ret`}
          gradientUnits="userSpaceOnUse"
          x1={geo.ret.x1}
          y1={geo.ret.y1}
          x2={geo.ret.x2}
          y2={geo.ret.y2}
        >
          <stop offset="0%" stopColor="#2fd9a6" stopOpacity="0" />
          <stop offset="55%" stopColor="#2fd9a6" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#e3ca8e" stopOpacity="1" />
        </linearGradient>

        {geo.out.map((seg, i) => {
          const hex = HEIR_HEX[i % HEIR_HEX.length];
          return (
            <linearGradient
              key={i}
              id={`${id}-out-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
            >
              <stop offset="0%" stopColor="#e3ca8e" stopOpacity="0.25" />
              <stop offset="50%" stopColor={hex} stopOpacity="0.95" />
              <stop offset="100%" stopColor="#fff8ec" stopOpacity="1" />
            </linearGradient>
          );
        })}
      </defs>

      {/* Plan -> Hub hairline + light streak */}
      <path className="pf-track" d={geo.feed.d} strokeWidth={1.4} />
      {still ? (
        <path className="pf-static" d={geo.feed.d} stroke={`url(#${id}-feed)`} strokeWidth={1.6} />
      ) : (
        <path
          className="pf-pulse pf-pulse--s1"
          d={geo.feed.d}
          pathLength={100}
          stroke={`url(#${id}-feed)`}
          strokeWidth={1.9}
        />
      )}

      {/* Hub -> Heirs: three delicate curves, pulsing together */}
      {geo.out.map((seg, i) => {
        const isPick = i === pick;
        const hex = HEIR_HEX[i % HEIR_HEX.length];
        return (
          <g key={i} className={`pf-out-group${isPick ? ' is-pick' : ''}`}>
            <path
              className={`pf-track${payout ? '' : ' is-quiet'}`}
              d={seg.d}
              stroke={payout && isPick ? hex : undefined}
              strokeWidth={isPick && payout ? 1.5 : 1.25}
            />
            {payout &&
              (still ? (
                <path
                  className="pf-static"
                  d={seg.d}
                  stroke={`url(#${id}-out-${i})`}
                  strokeWidth={isPick ? 1.9 : 1.4}
                  strokeOpacity={isPick ? 0.95 : 0.55}
                />
              ) : (
                <path
                  className="pf-pulse pf-pulse--s2"
                  d={seg.d}
                  pathLength={100}
                  stroke={`url(#${id}-out-${i})`}
                  strokeWidth={isPick ? 2.1 : 1.6}
                  strokeOpacity={isPick ? 1 : 0.72}
                />
              ))}
          </g>
        );
      })}

      {/* Check-in return arc: Hub -> Plan */}
      <g className={`pf-ret-group${payout ? ' is-hidden' : ''}`}>
        <path className="pf-track pf-track--ret" d={geo.ret.d} strokeWidth={1.4} />
        {!payout &&
          (still ? (
            <path className="pf-static" d={geo.ret.d} stroke={`url(#${id}-ret)`} strokeWidth={1.7} />
          ) : (
            <path
              className="pf-pulse pf-pulse--s2"
              d={geo.ret.d}
              pathLength={100}
              stroke={`url(#${id}-ret)`}
              strokeWidth={2}
            />
          ))}
      </g>
    </svg>
  );
}

export function SubakPayout() {
  const id = useId();
  const pinned = useMedia(PINNED_QUERY);
  const narrow = useMedia('(max-width: 767px)');
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const [ref, seen] = useInView<HTMLElement>(0.05);
  const [liveRef, live] = useOnScreen<HTMLDivElement>();
  const [mode, setMode] = useState<Mode>('payout');
  const [pick, setPick] = useState(0);

  const flowRef = useRef<HTMLDivElement>(null);
  const planTileRef = useRef<HTMLDivElement>(null);
  const hubTileRef = useRef<HTMLButtonElement>(null);
  const heirTileRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [geo, setGeo] = useState<FlowGeo | null>(null);

  const payout = mode === 'payout';
  const heir = HEIRS[pick];

  const recompute = useCallback(() => {
    const flowEl = flowRef.current;
    const planEl = planTileRef.current;
    const hubEl = hubTileRef.current;
    if (!flowEl || !planEl || !hubEl) return;
    const next = measureFlow(flowEl, planEl, hubEl, heirTileRefs.current, narrow);
    if (next) setGeo(next);
  }, [narrow]);

  useLayoutEffect(() => {
    recompute();
    const ro = new ResizeObserver(recompute);
    if (flowRef.current) ro.observe(flowRef.current);
    if (planTileRef.current) ro.observe(planTileRef.current);
    if (hubTileRef.current) ro.observe(hubTileRef.current);
    for (const el of heirTileRefs.current) {
      if (el) ro.observe(el);
    }
    window.addEventListener('resize', recompute);
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) recompute();
    });
    return () => {
      alive = false;
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [recompute]);

  return (
    <section ref={ref} id="payout" className={`np np--subak${pinned ? ' np--pulled' : ''}`} aria-labelledby={`${id}-title`}>
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

        <ModeSegmented mode={mode} onChange={setMode} seen={seen} />

        {/* Borderless open stage with smooth crossfading rising blurred horizon circles */}
        <div
          ref={liveRef}
          className={`pf-stage rise-in${seen ? ' is-seen' : ''}`}
          data-mode={mode}
          data-live={live && !still ? '' : undefined}
          style={{ animationDelay: '180ms' }}
        >
          <div className="pf-horizon pf-horizon--payout" aria-hidden>
            <div className="pf-stage__orb pf-stage__orb--payout" />
            <div className="pf-stage__crest pf-stage__crest--payout" />
          </div>
          <div className="pf-horizon pf-horizon--checkin" aria-hidden>
            <div className="pf-stage__orb pf-stage__orb--checkin" />
            <div className="pf-stage__crest pf-stage__crest--checkin" />
          </div>

          <div className="pf-head">
            <p key={`eyebrow-${mode}`} className="pf-eyebrow pf-fade mono">
              {payout ? 'ONE PAYMENT, THREE HEIRS' : 'CHECK-IN, NOTHING LEAVES'}
            </p>
            <h3 key={`title-${mode}`} className="pf-title pf-fade">
              {payout ? (
                <>
                  One payment splits <span className="num">{POT}</span>,
                  <br />
                  straight to every heir.
                </>
              ) : (
                <>
                  Still here? All <span className="num">{POT}</span> stays,
                  <br />
                  and the wait starts again.
                </>
              )}
            </h3>
          </div>

          <div ref={flowRef} className="pf-flow">
            <FlowBeams id={id} geo={geo} payout={payout} pick={pick} still={still} />

            {/* Left: Source medallion (no card border) */}
            <div className="pf-source">
              <div ref={planTileRef} className="pf-node pf-node--source">
                <img className="pf-bch" src={BCH_ICON} alt="" width={30} height={30} />
              </div>
              <div className="pf-source__text">
                <strong className="num">{POT}</strong>
                <span key={`state-${mode}`} className="pf-fade">
                  {payout ? 'Waiting time passed' : 'Waiting time restarted'}
                </span>
              </div>
            </div>

            {/* Center: Glossy squircle Hub with smooth gradient & icon crossfade */}
            <div className="pf-hub-col">
              <button
                ref={hubTileRef}
                type="button"
                className="pf-hub"
                onClick={() => setMode((m) => (m === 'payout' ? 'checkin' : 'payout'))}
                aria-label={
                  payout
                    ? 'One payment pays every heir together. Press to switch to I’m still here.'
                    : 'I’m still here keeps everything in the plan. Press to switch to Send to heirs.'
                }
              >
                <span className="pf-hub__fill pf-tone--gold" aria-hidden />
                <span className="pf-hub__fill pf-hub__fill--checkin pf-tone--green" aria-hidden />
                <span className="pf-hub__icon pf-hub__icon--payout" aria-hidden>
                  <Send strokeWidth={1.85} />
                </span>
                <span className="pf-hub__icon pf-hub__icon--checkin" aria-hidden>
                  <Hand strokeWidth={1.85} />
                </span>
              </button>
              <span key={`hub-${mode}`} className="pf-hub__label pf-fade mono">
                {payout ? 'ONE PAYMENT' : 'STILL HERE'}
              </span>
            </div>

            {/* Right: Three borderless heir nodes */}
            <ul className="pf-heirs" aria-label="Heirs">
              {HEIRS.map((h, i) => {
                const active = i === pick;
                const hex = HEIR_HEX[i % HEIR_HEX.length];
                return (
                  <li key={h.name}>
                    <button
                      type="button"
                      className={`pf-heir${active ? ' is-pick' : ''}`}
                      aria-pressed={active}
                      style={{ ['--c' as string]: hex } as CSSProperties}
                      onClick={() => setPick(i)}
                    >
                      <span
                        ref={(el) => {
                          heirTileRefs.current[i] = el;
                        }}
                        className="pf-node pf-node--heir"
                        aria-hidden
                      >
                        <span className={`pf-avatar pf-avatar--${i + 1}`}>{h.name[0]}</span>
                      </span>
                      <span className="pf-heir__text">
                        <span className="pf-heir__name">{h.name}</span>
                        <span className="pf-heir__val num">
                          {h.bch} BCH · {h.pct}%
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <p key={`foot-${mode}-${pick}`} className="pf-foot pf-fade" aria-live="polite">
            {payout ? (
              <>
                <b>
                  {heir.name} receives <span className="num">{heir.bch} BCH</span>
                </b>{' '}
                <span className="num">({heir.sats} satoshis)</span> in the same payment as everyone else. The
                ~5,000 satoshis network fee comes out of the plan itself.
              </>
            ) : (
              <>
                <b>The waiting time starts again.</b> All <span className="num">{POT}</span> stays in the plan, and
                your heirs wait for the new date.
              </>
            )}
          </p>
        </div>
      </div>
      <div className="np__tail" aria-hidden />
    </section>
  );
}
