// Small helpers for the plan page (kept out of component files so fast refresh works).
import { useEffect, useState } from 'react';

/** Re-renders every `ms` so countdowns tick. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Heir colour for the i-th heir; repeats after five. */
export const heirColor = (i: number) => `var(--heir-${(i % 5) + 1})`;

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
