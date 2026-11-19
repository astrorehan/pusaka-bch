// "One payment pays everyone.", drawn as subak: Bali's way of sharing water between rice terraces, where one
// spring feeds every field through a divider whose openings are cut to each field's agreed share.
// The plan is the spring. One payment opens its gate; the water runs down the canal to the divider and fills every
// heir's terrace at once, each through a channel as wide as that heir's share. "I'm still here" closes the gate and
// the water runs back into the spring. Amounts are fixed labels; only the water moves (money never animates).
// Pick a terrace to see that heir's exact amount.
//
// Desktop with motion: the title was already shown at the end of the scroll scene, so this section pulls up under
// it and starts with the drawing. Elsewhere it carries its own title. Reduced motion: the water switches without
// running and nothing shimmers.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Check, Clock3, Hand, Send } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { useMedia } from '../../components/useMedia';
import { SplitWords, useInView } from './motion';
import { Fireflies } from './NightPayout';
import { HEIRS, POT } from './payoutHeirs';
import { NIGHT_SUB, NIGHT_TITLE, PINNED_QUERY } from './landingCopy';
import './subak.css';

interface Pt { x: number; y: number }
interface Label extends Pt { align: 'center' | 'start' }
interface Terrace { x0: number; x1: number; y: number; h: number }
interface Geo {
  w: number; h: number; wide: boolean;
  pool: Pt & { rx: number; ry: number };
  /** where the gate stands; `across` is the direction the canal leaves it */
  gate: Pt & { across: 'x' | 'y' };
  canal: string;
  canalW: number;
  divider: Pt;
  channels: string[];
  terraces: Terrace[];
  planLabel: Label; gateLabel: Label; dividerLabel: Label;
}

const widths = (total: number) => HEIRS.map((h) => Math.max(1.6, (total * h.pct) / 100));

/** Channels leave the divider downwards, side by side, and each turns into its terrace. The top terrace takes the
 *  rightmost channel, so no channel crosses another. */
function channels(cx: number, top: number, canalW: number, gap: number, terraces: Terrace[]) {
  const ws = widths(canalW);
  const span = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
  let x = cx + span / 2;
  return ws.map((w, i) => {
    const c = x - w / 2;
    x -= w + gap;
    const t = terraces[i];
    const cs = c.toFixed(1);
    return `M ${cs} ${top} L ${cs} ${t.y - 24} Q ${cs} ${t.y}, ${(c + 24).toFixed(1)} ${t.y} L ${t.x0 + 14} ${t.y}`;
  });
}

/** Wide: the spring at the top left, the canal along the top to the divider, the terraces stepping down below. */
function wideGeo(): Geo {
  const canalW = 22;
  const terraces = HEIRS.map((_, i) => ({ x0: 548 - i * 4, x1: [1132, 1154, 1170, 1184, 1196][i], y: 262 + i * 78, h: 64 }));
  return {
    w: 1200, h: terraces[terraces.length - 1].y + 44, wide: true,
    pool: { x: 170, y: 104, rx: 118, ry: 46 },
    gate: { x: 302, y: 106, across: 'x' },
    canal: 'M 290 106 C 400 106, 484 116, 484 188',
    canalW,
    divider: { x: 484, y: 194 },
    channels: channels(484, 200, canalW, 3.5, terraces),
    terraces,
    planLabel: { x: 170, y: 198, align: 'center' },
    gateLabel: { x: 396, y: 50, align: 'center' },
    dividerLabel: { x: 524, y: 194, align: 'start' },
  };
}

/** Tall (phones): the same, narrower: the canal runs down the left and the terraces step down on the right. */
function tallGeo(): Geo {
  const canalW = 16;
  const terraces = HEIRS.map((_, i) => ({ x0: 124, x1: [340, 346, 350, 354, 356][i], y: 292 + i * 74, h: 58 }));
  return {
    w: 360, h: terraces[terraces.length - 1].y + 46, wide: false,
    pool: { x: 84, y: 70, rx: 66, ry: 30 },
    gate: { x: 84, y: 114, across: 'y' },
    canal: 'M 84 100 L 84 216',
    canalW,
    divider: { x: 84, y: 222 },
    channels: channels(84, 228, canalW, 3, terraces),
    terraces,
    planLabel: { x: 168, y: 70, align: 'start' },
    gateLabel: { x: 114, y: 152, align: 'start' },
    dividerLabel: { x: 114, y: 222, align: 'start' },
  };
}

const WIDE = wideGeo();
const TALL = tallGeo();
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const at = (g: Geo, p: Pt): CSSProperties => ({ left: pct(p.x, g.w), top: pct(p.y, g.h) });
/** each terrace bends a little differently, like contour lines */
const BEND = [8, -5, 10, -3, 6];

/** A terrace seen from the front: a long field whose ends taper into the hillside, its top edge (the bund)
 *  catching the moon. */
function terracePath({ x0, x1, y, h }: Terrace, k: number) {
  const t = y - h / 2, b = y + h / 2, w = x1 - x0;
  return [
    `M ${x0 + 26} ${t + 7}`,
    `C ${x0 + w * 0.32} ${t - 5 + k}, ${x0 + w * 0.68} ${t + 5 - k}, ${x1 - 30} ${t + 2}`,
    `C ${x1 - 6} ${t + 1}, ${x1 + 2} ${y - 4}, ${x1 - 4} ${y + 6}`,
    `C ${x1 - 9} ${b - 2}, ${x1 - 22} ${b}, ${x1 - 40} ${b}`,
    `C ${x0 + w * 0.68} ${b + 5 - k}, ${x0 + w * 0.32} ${b - 5 + k}, ${x0 + 30} ${b - 2}`,
    `C ${x0 + 12} ${b - 3}, ${x0 - 2} ${y + 8}, ${x0 + 2} ${y - 2}`,
    `C ${x0 + 5} ${t + 12}, ${x0 + 14} ${t + 7}, ${x0 + 26} ${t + 7} Z`,
  ].join(' ');
}
function rimPath({ x0, x1, y, h }: Terrace, k: number) {
  const t = y - h / 2, w = x1 - x0;
  return `M ${x0 + 4} ${y - 8} C ${x0 + 6} ${t + 12}, ${x0 + 14} ${t + 7}, ${x0 + 26} ${t + 7} C ${x0 + w * 0.32} ${t - 5 + k}, ${x0 + w * 0.68} ${t + 5 - k}, ${x1 - 30} ${t + 2} C ${x1 - 8} ${t + 1}, ${x1 + 1} ${y - 6}, ${x1 - 1} ${y - 2}`;
}
/** the same top edge a little lower: the moon's reflection along the water's far edge */
function shinePath({ x0, x1, y, h }: Terrace, k: number) {
  const t = y - h / 2 + 7, w = x1 - x0;
  return `M ${x0 + 30} ${t + 7} C ${x0 + w * 0.32} ${t - 5 + k}, ${x0 + w * 0.68} ${t + 5 - k}, ${x1 - 34} ${t + 2}`;
}

/** True while the element is on screen, so the water's shimmer only runs when someone can see it. */
function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on] as const;
}

function Gate({ g }: { g: Geo }) {
  const { x, y } = g.gate;
  const half = g.canalW / 2 + 5;
  // Two posts either side of the canal, a beam over it, and the board that slides to close it.
  return g.gate.across === 'x' ? (
    <g className="sb__gate">
      <path className="sb__gate-frame" d={`M ${x} ${y + half} L ${x} ${y - half - 14} M ${x - 6} ${y - half - 14} L ${x + 6} ${y - half - 14}`} />
      <rect className="sb__gate-board" x={x - 4} y={y - half + 1} width={8} height={half * 2 - 2} rx={2} />
    </g>
  ) : (
    <g className="sb__gate">
      <path className="sb__gate-frame" d={`M ${x + half} ${y} L ${x - half - 14} ${y} M ${x - half - 14} ${y - 6} L ${x - half - 14} ${y + 6}`} />
      <rect className="sb__gate-board" x={x - half + 1} y={y - 4} width={half * 2 - 2} height={8} rx={2} />
    </g>
  );
}

export function SubakPayout() {
  const id = useId();
  const pinned = useMedia(PINNED_QUERY);
  const narrow = useMedia('(max-width: 767px)');
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const [ref, seen] = useInView<HTMLElement>(0.05);
  const [mapRef, mapSeen] = useInView<HTMLDivElement>(0.45);
  const [liveRef, live] = useOnScreen<HTMLDivElement>();
  const [mode, setMode] = useState<'payout' | 'checkin'>('payout');
  const [pick, setPick] = useState(0);
  const g = narrow ? TALL : WIDE;
  const payout = mode === 'payout';
  const heir = HEIRS[pick];
  const flow = mapSeen && payout ? 'on' : 'off';

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

        <div className={`np__controls rise-in${seen ? ' is-seen' : ''}`} role="tablist" aria-label="What the plan does" style={{ animationDelay: '120ms' }}>
          <button type="button" role="tab" aria-selected={payout} className="np__tab" onClick={() => setMode('payout')}>
            <Send aria-hidden /> Send to heirs
          </button>
          <button type="button" role="tab" aria-selected={!payout} className="np__tab" onClick={() => setMode('checkin')}>
            <Hand aria-hidden /> I’m still here
          </button>
        </div>

        <div ref={mapRef} className="sb-wrap">
          <div
            ref={liveRef}
            className={`sb rise-in${seen ? ' is-seen' : ''}`}
            data-flow={flow}
            data-live={live && !still ? '' : undefined}
            data-layout={g.wide ? 'wide' : 'tall'}
            style={{ aspectRatio: `${g.w} / ${g.h}`, animationDelay: '200ms' }}
          >
            <svg className="sb__svg" viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden key={g.wide ? 'w' : 't'}>
              <defs>
                <radialGradient id={`${id}pool`} cx="50%" cy="50%" r="60%">
                  <stop offset="0" stopColor="#f3dc9e" stopOpacity="0.62" />
                  <stop offset="0.38" stopColor="#c4d4f6" stopOpacity="0.4" />
                  <stop offset="1" stopColor="#a9c4f5" stopOpacity="0.12" />
                </radialGradient>
                {/* water: moonlit at the top edge, deeper below; its leading edge is soft as it runs in */}
                <linearGradient id={`${id}field`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#d4e0ff" stopOpacity="0.56" />
                  <stop offset="0.38" stopColor="#9fb9ee" stopOpacity="0.26" />
                  <stop offset="1" stopColor="#7d9be0" stopOpacity="0.08" />
                </linearGradient>
                <linearGradient id={`${id}edge`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#fff" />
                  <stop offset="0.84" stopColor="#fff" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <mask id={`${id}lead`} maskContentUnits="objectBoundingBox">
                  <rect width="1" height="1" fill={`url(#${id}edge)`} />
                </mask>
                {/* rice seedlings in rows, standing in the field whether it is dry or flooded */}
                <pattern id={`${id}rice`} width="66" height="21" patternUnits="userSpaceOnUse">
                  <path d="M 6 17 l -1.4 -4.4 M 6 17 l 0.3 -5 M 6 17 l 2 -4 M 29 8 l -1.4 -4 M 29 8 l 0.3 -4.6 M 29 8 l 2 -3.6 M 50 19 l -1.2 -3.8 M 50 19 l 0.3 -4.4 M 50 19 l 1.8 -3.4" />
                </pattern>
                {g.terraces.map((t, i) => (
                  <clipPath key={i} id={`${id}t${i}`}><path d={terracePath(t, BEND[i])} /></clipPath>
                ))}
              </defs>

              {/* the spring */}
              <ellipse className="sb__pool-bed" cx={g.pool.x} cy={g.pool.y} rx={g.pool.rx + 8} ry={g.pool.ry + 6} />
              <ellipse className="sb__pool" cx={g.pool.x} cy={g.pool.y} rx={g.pool.rx} ry={g.pool.ry} fill={`url(#${id}pool)`} />
              <ellipse className="sb__ripple" cx={g.pool.x} cy={g.pool.y} rx={g.pool.rx * 0.62} ry={g.pool.ry * 0.62} />

              {/* the canal, then the channels: a dry bed, the water, and a shimmer that runs with the flow */}
              <g className="sb__run sb__run--canal" style={{ ['--w' as string]: g.canalW }}>
                <path className="sb__bed" d={g.canal} />
                <path className="sb__water" d={g.canal} pathLength={1} />
                <path className="sb__glint" d={g.canal} pathLength={1} />
              </g>
              {g.channels.map((d, i) => (
                <g
                  key={i}
                  className={`sb__run sb__run--ch${i === pick ? ' is-pick' : ''}`}
                  style={{ ['--w' as string]: widths(g.canalW)[i], ['--c' as string]: HEIRS[i].color }}
                >
                  <path className="sb__bed" d={d} />
                  <path className="sb__water" d={d} pathLength={1} />
                  <path className="sb__glint" d={d} pathLength={1} />
                </g>
              ))}

              {/* the terraces, each filling from its inlet */}
              {g.terraces.map((t, i) => {
                const w = t.x1 - t.x0;
                return (
                  <g key={i} className={`sb__field${i === pick ? ' is-pick' : ''}`} style={{ ['--c' as string]: HEIRS[i].color }}>
                    <path className="sb__lip" d={terracePath({ ...t, y: t.y + 8 }, BEND[i])} />
                    <path className="sb__earth" d={terracePath(t, BEND[i])} />
                    <g clipPath={`url(#${id}t${i})`}>
                      <g className="sb__fill">
                        <rect x={t.x0} y={t.y - t.h / 2 - 8} width={w * 1.19} height={t.h + 16} fill={`url(#${id}field)`} mask={`url(#${id}lead)`} />
                        <path className="sb__shine" d={shinePath(t, BEND[i])} />
                      </g>
                    </g>
                    <path className="sb__rice" d={terracePath(t, BEND[i])} fill={`url(#${id}rice)`} />
                    <path className="sb__rim" d={rimPath(t, BEND[i])} />
                  </g>
                );
              })}

              {/* the divider: one stone, its openings cut to the shares */}
              {g.wide ? (
                <rect className="sb__divider" x={g.divider.x - 6} y={g.divider.y - 24} width={12} height={48} rx={4} />
              ) : (
                <rect className="sb__divider" x={g.divider.x - 20} y={g.divider.y - 6} width={40} height={12} rx={4} />
              )}
              <Gate g={g} />
            </svg>

            <div className="sb__seed" style={at(g, g.pool)}><Logo size={g.wide ? 44 : 30} /></div>
            <div className="sb__label sb__label--plan" data-align={g.planLabel.align} style={at(g, g.planLabel)}>
              <span className="np__kicker">For your heirs</span>
              <strong className="num">{POT}</strong>
              <span className="np__state">
                {payout ? <Clock3 aria-hidden /> : <Check aria-hidden />}
                {payout ? 'Waiting time passed' : 'Waiting time restarted'}
              </span>
            </div>
            <div className="sb__label sb__label--gate" data-align={g.gateLabel.align} style={at(g, g.gateLabel)}>
              <strong>{payout ? 'One payment opens the gate' : 'The gate stays closed'}</strong>
              <span>{payout ? 'Every heir is paid together' : 'Nothing leaves the plan'}</span>
            </div>
            <p className="sb__label sb__label--divider" data-align={g.dividerLabel.align} style={at(g, g.dividerLabel)}>
              Each channel is as wide{g.wide ? ' ' : <br />}as that heir’s share
            </p>

            <ul className="sb__heirs" aria-label="Heirs">
              {HEIRS.map((h, i) => {
                const t = g.terraces[i];
                return (
                  <li
                    key={h.name}
                    style={{ left: pct(t.x0, g.w), top: pct(t.y - t.h / 2, g.h), width: pct(t.x1 - t.x0, g.w), height: pct(t.h, g.h) }}
                  >
                    <button
                      type="button"
                      className="sb__heir"
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
                );
              })}
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
                  <span className="np__muted">All <span className="num">{POT}</span> stays in the plan, and the heirs wait for the new date.</span>
                </span>
              )}
            </p>
            <p className="np__fee">
              The network fee, about 5,000 satoshis, comes out of the plan itself, so an heir with no BCH can press
              the button, or ask anyone who has the plan link to: each share still goes only to its heir.
            </p>
          </div>
        </div>

      </div>
      <div className="np__tail" aria-hidden />
    </section>
  );
}
