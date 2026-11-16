// The Pusaka flower, inlined so it follows the in-app theme. Petals use --text, the seed --gold.
// `bloom`: 'once' plays the bloom (DESIGN.md "The bloom"), 'loop' repeats it for waiting states.
import './logo.css';

const PETALS = [
  // clockwise from the top right
  'M24.415 7.585A5.2 3.4 -45 0 0 17.061 14.939A5.2 3.4 -45 0 0 24.415 7.585Z',
  'M24.415 24.415A5.2 3.4 45 0 1 17.061 17.061A5.2 3.4 45 0 1 24.415 24.415Z',
  'M7.585 24.415A5.2 3.4 -45 0 0 14.939 17.061A5.2 3.4 -45 0 0 7.585 24.415Z',
  'M7.585 7.585A5.2 3.4 45 0 1 14.939 14.939A5.2 3.4 45 0 1 7.585 7.585Z',
];
const DIRS = ['1,-1', '1,1', '-1,1', '-1,-1'];

interface LogoProps {
  size?: number;
  bloom?: 'none' | 'once' | 'loop';
  /** petal colours, e.g. heir colours on the success screen; defaults to --text */
  petalColors?: string[];
  title?: string;
}

export function Logo({ size = 28, bloom = 'none', petalColors, title }: LogoProps) {
  return (
    <svg
      className={`logo logo--${bloom}`}
      viewBox="6.6 6.6 18.8 18.8"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {PETALS.map((d, i) => {
        const [dx, dy] = DIRS[i].split(',');
        return (
          <path
            key={i}
            className="logo__petal"
            d={d}
            fill={petalColors?.[i % petalColors.length] ?? 'var(--text)'}
            style={{ ['--i' as string]: i, ['--dx' as string]: dx, ['--dy' as string]: dy }}
          />
        );
      })}
      <circle className="logo__seed" cx="16" cy="16" r="1.2" fill="var(--gold)" />
    </svg>
  );
}
