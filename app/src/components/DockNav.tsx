// The desktop header links. Letters near the pointer grow and thicken, like a dock, and glide back when it
// leaves. Each letter's pull comes from where it sits at rest, so the growing word never feeds back into itself.
// Touch screens and reduced motion get the plain links.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { NavLink } from 'react-router-dom';
import { DOCS_URL, REPO_URL } from './banner-config';

/** Pull falls off with horizontal distance from the pointer (px, gaussian width). */
const REACH = 46;
/** Full pull within this many px above or below the links, none beyond REACH_Y more. */
const SLACK_Y = 16;
const REACH_Y = 34;
/** Glide rate: higher settles faster (per second). */
const RATE = 11;

function Letters({ text }: { text: string }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span className="dock__word" aria-hidden>
        {[...text].map((ch, i) => (
          <span key={i} className="dock__ch">{ch === ' ' ? '\u00A0' : ch}</span>
        ))}
      </span>
    </>
  );
}

function useDock(nav: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || calm.matches) return;

    const chars = Array.from(el.querySelectorAll<HTMLElement>('.dock__ch'));
    const rest = new Float64Array(chars.length); // centre x at rest, from the nav's centre
    const pull = new Float64Array(chars.length);
    let px = -1e4, py = -1e4;
    let frame = 0, last = 0;

    function measure() {
      if (!el || pull.some((v) => v > 0.001)) return; // only at rest
      const box = el.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      chars.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        rest[i] = r.left + r.width / 2 - mid;
      });
    }

    function tick(now: number) {
      if (!el) return;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const box = el.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      const dy = Math.abs(py - (box.top + box.height / 2));
      const band = Math.max(0, Math.min(1, 1 - (dy - SLACK_Y) / REACH_Y));
      const k = 1 - Math.exp(-RATE * dt);
      let moving = false;
      for (let i = 0; i < chars.length; i++) {
        const dx = (px - mid - rest[i]) / REACH;
        const goal = band > 0 ? Math.exp(-dx * dx) * band : 0;
        const next = pull[i] + (goal - pull[i]) * k;
        const settled = Math.abs(goal - next) < 0.002;
        const value = settled ? goal : next;
        if (value !== pull[i]) chars[i].style.setProperty('--m', value.toFixed(3));
        pull[i] = value;
        if (!settled) moving = true;
      }
      frame = moving ? requestAnimationFrame(tick) : 0;
      if (!moving) last = 0;
    }

    function wake() {
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function onMove(e: PointerEvent) {
      if (e.pointerType !== 'mouse') return;
      px = e.clientX; py = e.clientY;
      wake();
    }
    function onLeave() {
      px = -1e4; py = -1e4;
      wake();
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    void document.fonts?.ready.then(measure);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      chars.forEach((c) => c.style.removeProperty('--m'));
    };
  }, [nav]);
}

export function DockNav() {
  const ref = useRef<HTMLElement>(null);
  useDock(ref);
  const ext = (href: string, children: ReactNode) => (
    <a href={href} target="_blank" rel="noreferrer">{children}</a>
  );
  return (
    <nav ref={ref} className="header__links dock" aria-label="Main">
      <NavLink to="/how-it-works"><Letters text="How it works" /></NavLink>
      {ext(DOCS_URL, <Letters text="Docs" />)}
      {ext(REPO_URL, <Letters text="GitHub" />)}
    </nav>
  );
}
