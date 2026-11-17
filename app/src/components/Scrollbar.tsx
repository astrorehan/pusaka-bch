// Overlay viewport scrollbar: hides the native browser gutter and floats a draggable pill over the page.
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import './scrollbar.css';

const TRACK_INSET = 6;
const MIN_THUMB = 32;

export function Scrollbar() {
  const { pathname } = useLocation();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const metricsRef = useRef({ maxScroll: 0, travel: 1, thumbH: MIN_THUMB });
  const dragRef = useRef<{ pointerId: number; startY: number; startScroll: number } | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    let raf = 0;

    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const viewH = window.innerHeight;
      const scrollH = doc.scrollHeight;
      const maxScroll = scrollH - viewH;
      const locked =
        getComputedStyle(doc).overflowY === 'hidden' ||
        getComputedStyle(document.body).overflowY === 'hidden' ||
        document.querySelector('.sheet[open]') !== null;

      if (locked || maxScroll <= 1) {
        track.dataset.visible = 'false';
        return;
      }

      const trackH = Math.max(MIN_THUMB, viewH - TRACK_INSET * 2);
      const thumbH = Math.max(MIN_THUMB, Math.round((viewH / scrollH) * trackH));
      const travel = Math.max(1, trackH - thumbH);
      const ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      const y = TRACK_INSET + ratio * travel;

      metricsRef.current = { maxScroll, travel, thumbH };
      thumb.style.height = `${thumbH}px`;
      thumb.style.transform = `translate3d(0, ${y}px, 0)`;
      track.dataset.visible = 'true';
    };

    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });

    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    ro.observe(document.body);

    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['open', 'style', 'class'] });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const thumb = thumbRef.current;
    if (!thumb) return;
    thumb.setPointerCapture(e.pointerId);
    thumb.dataset.dragging = 'true';
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY, startScroll: window.scrollY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const { maxScroll, travel } = metricsRef.current;
    if (maxScroll <= 0 || travel <= 0) return;
    const delta = e.clientY - drag.startY;
    const nextScroll = drag.startScroll + (delta / travel) * maxScroll;
    window.scrollTo({ top: nextScroll, behavior: 'instant' });
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    const thumb = thumbRef.current;
    if (thumb) {
      delete thumb.dataset.dragging;
      if (thumb.hasPointerCapture(e.pointerId)) thumb.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div ref={trackRef} className="scrollbar" data-visible="false" aria-hidden="true">
      <div
        ref={thumbRef}
        className="scrollbar__thumb"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}
