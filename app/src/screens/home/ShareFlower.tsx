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
  activeIndex?: number | null;
  onHoverHeir?: (index: number | null) => void;
}

export function ShareFlower({
  heirs,
  size = 96,
  bloom = false,
  delay = 0,
  className = '',
  activeIndex = null,
  onHoverHeir,
}: ShareFlowerProps) {
  const n = heirs.length;
  const max = Math.max(...heirs.map((h) => h.share));
  const hasActive = activeIndex !== null && activeIndex >= 0 && activeIndex < n;
  // Fewer petals get fuller, so three still read as a flower; more than four get narrower so they don't overlap.
  const widthFactor = n < 4 ? 1.12 : n === 4 ? 1 : Math.min(1, 4.4 / n);
  return (
    <svg
      className={`sf${bloom ? ' sf--bloom' : ''}${hasActive ? ' sf--has-active' : ''} ${className}`}
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
        const isHot = activeIndex === i;
        return (
          <g
            key={i}
            transform={`rotate(${petalAngle(i, n)} ${C} ${C})`}
            className={`sf__arm${isHot ? ' is-hot' : ''}`}
            onMouseEnter={onHoverHeir ? () => onHoverHeir(i) : undefined}
            onMouseLeave={onHoverHeir ? () => onHoverHeir(null) : undefined}
            onClick={onHoverHeir ? () => onHoverHeir(isHot ? null : i) : undefined}
            style={onHoverHeir ? { cursor: 'pointer' } : undefined}
          >
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
