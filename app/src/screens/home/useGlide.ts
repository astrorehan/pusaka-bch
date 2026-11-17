// The hero copy drifts toward the mouse and glides there, a little behind it. The hook publishes the smoothed
// pointer position as --gx and --gy (each -1 to 1, 0 at the centre of the hero) on the element; the CSS turns
// them into one shift for the whole block.
// Touch screens and reduced motion: nothing moves.
import { useEffect, type RefObject } from 'react';

/** Glide rate: higher catches up faster (per second). Low, so the copy trails the mouse. */
const RATE = 3.2;

export function useGlide(ref: RefObject<HTMLElement | null>, area: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    const zone = area.current;
    if (!el || !zone) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || calm.matches) return;

    let tx = 0, ty = 0, x = 0, y = 0;
    let frame = 0, last = 0;

    function tick(now: number) {
      if (!el) return;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const k = 1 - Math.exp(-RATE * dt);
      x += (tx - x) * k;
      y += (ty - y) * k;
      const done = Math.abs(tx - x) < 0.0005 && Math.abs(ty - y) < 0.0005;
      if (done) { x = tx; y = ty; }
      el.style.setProperty('--gx', x.toFixed(4));
      el.style.setProperty('--gy', y.toFixed(4));
      if (done) { frame = 0; last = 0; } else frame = requestAnimationFrame(tick);
    }
    function aim(nx: number, ny: number) {
      tx = nx; ty = ny;
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function onMove(e: PointerEvent) {
      if (e.pointerType !== 'mouse' || !zone) return;
      const r = zone.getBoundingClientRect();
      if (e.clientY > r.bottom || e.clientY < r.top - 120) return aim(0, 0);
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      aim(clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2)), clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
    }
    const rest = () => aim(0, 0);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', rest);
    window.addEventListener('blur', rest);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', rest);
      window.removeEventListener('blur', rest);
      el.style.removeProperty('--gx');
      el.style.removeProperty('--gy');
    };
  }, [ref, area]);
}
