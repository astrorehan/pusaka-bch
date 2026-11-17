// Inverse hover for pill buttons (class "pill-fx", styles in button.css): the swapped fill wipes in from the side
// the mouse enters and out toward the side it leaves. This only records the side; CSS does the motion.
// One listener pair on the document serves every pill. Mouse only; touch and keyboard keep the plain button.
import { useEffect } from 'react';

const SELECTOR = '.pill-fx';

function pillOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(SELECTOR) : null;
}

function sideOf(el: HTMLElement, x: number): 'left' | 'right' {
  const r = el.getBoundingClientRect();
  return x < r.left + r.width / 2 ? 'left' : 'right';
}

export function usePillFx() {
  useEffect(() => {
    function onOver(e: PointerEvent) {
      if (e.pointerType !== 'mouse') return;
      const el = pillOf(e.target);
      if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
      if ((el as HTMLButtonElement).disabled) return;
      const side = sideOf(el, e.clientX);
      if (el.dataset.fxFrom !== side && !el.hasAttribute('data-fx-on')) {
        // Move the hidden layer to the entry side without animating, then wipe in from there.
        el.dataset.fxFrom = side;
        el.setAttribute('data-fx-snap', '');
        void getComputedStyle(el, '::before').clipPath;
        el.removeAttribute('data-fx-snap');
      }
      el.setAttribute('data-fx-on', '');
    }
    function onOut(e: PointerEvent) {
      const el = pillOf(e.target);
      if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
      el.dataset.fxFrom = sideOf(el, e.clientX);
      el.removeAttribute('data-fx-on');
    }
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
    };
  }, []);
}
