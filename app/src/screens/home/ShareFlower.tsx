// The Pusaka flower drawn as a family: the seed is the owner's BCH, each petal one heir.
// A petal's area is proportional to the heir's share. With four heirs the petals sit on the
// diagonals, exactly like the logo. Colours always come with names elsewhere on screen.
import { heirColor, petalAngle, petalScale, type FlowerHeir } from './flowerMath';
import './share-flower.css';

// Logo geometry (viewBox 0 0 32 32): seed at 16,16; petals are 5.2 x 3.4 ellipses whose inner end sits 1.5 from the seed.
const C = 16;
const GAP = 1.5;
const LEN = 5.2;
const WIDTH = 3.4;

interface ShareFlowerProps {
  heirs: FlowerHeir[];
  size?: number | string;
  bloom?: boolean;
  /** extra delay before the bloom starts, in ms */
  delay?: number;
  className?: string;
}

export function ShareFlower({ heirs, size = 96, bloom = false, delay = 0, className = '' }: ShareFlowerProps) {
  const n = heirs.length;
  const max = Math.max(...heirs.map((h) => h.share));
  // Fewer petals get fuller, so three still read as a flower; more than four get narrower so they don't overlap.
  const widthFactor = n < 4 ? 1.12 : n === 4 ? 1 : Math.min(1, 4.4 / n);
  return (
    <svg
      className={`sf${bloom ? ' sf--bloom' : ''} ${className}`}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      style={{ ['--sf-delay' as string]: `${delay}ms` }}
    >
      {heirs.map((h, i) => {
        const k = petalScale(h.share, max);
        const ry = LEN * k;
        const rx = WIDTH * k * widthFactor;
        return (
          <g key={i} transform={`rotate(${petalAngle(i, n)} ${C} ${C})`}>
            <ellipse
              className="sf__petal"
              cx={C}
              cy={C - GAP - ry}
              rx={rx}
              ry={ry}
              fill={heirColor(i)}
              style={{ ['--i' as string]: i }}
            />
          </g>
        );
      })}
      <circle className="sf__seed" cx={C} cy={C} r={1.2} fill="var(--gold)" />
    </svg>
  );
}
