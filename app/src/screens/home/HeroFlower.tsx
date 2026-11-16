// Hero illustration: one family, four heirs, their shares. Built from the logo flower.
import { ShareFlower, heirColor, petalAngle, type FlowerHeir } from './ShareFlower';
import './hero-flower.css';

const FAMILY: FlowerHeir[] = [
  { name: 'Sarah', share: 40 },
  { name: 'Daniel', share: 25 },
  { name: 'Mei', share: 20 },
  { name: 'Leo', share: 15 },
];

/** Distance of a name chip from the centre, as a fraction of the stage. */
const CHIP_RADIUS = 0.4;

export function HeroFlower() {
  const n = FAMILY.length;
  return (
    <figure className="hero-flower" aria-label="Example plan: Sarah gets 40%, Daniel 25%, Mei 20% and Leo 15%. Waiting time: 6 months.">
      <div className="hero-flower__stage" aria-hidden>
        {/* The plate's rim is the waiting-time ring the plan page shows: green is the time left. */}
        <svg className="hero-flower__ring" viewBox="0 0 100 100">
          <circle className="hero-flower__plate" cx="50" cy="50" r="49" />
          <circle className="hero-flower__arc" cx="50" cy="50" r="49" pathLength="100" strokeDasharray="68 100" transform="rotate(-90 50 50)" />
        </svg>
        <ShareFlower heirs={FAMILY} size="100%" bloom className="hero-flower__svg" />
        {FAMILY.map((h, i) => {
          const a = (petalAngle(i, n) * Math.PI) / 180;
          const x = Math.sin(a) * CHIP_RADIUS * 100;
          const y = -Math.cos(a) * CHIP_RADIUS * 100;
          return (
            <span
              key={h.name}
              className="hero-chip"
              style={{ ['--x' as string]: `${x}%`, ['--y' as string]: `${y}%`, ['--i' as string]: i }}
            >
              <span className="hero-chip__dot" style={{ background: heirColor(i) }} />
              <span className="hero-chip__name">{h.name}</span>
              <span className="hero-chip__pct num">{h.share}%</span>
            </span>
          );
        })}
        <span className="hero-wait">
          <span className="hero-wait__dot" />
          Waiting time: 6 months
        </span>
      </div>
    </figure>
  );
}
