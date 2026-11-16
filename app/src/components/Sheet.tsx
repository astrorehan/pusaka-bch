// Sheet: a bottom sheet on phones, a centred dialog from 768 px. Shared by every screen that needs to
// ask or show something on top of the page (review before signing, confirm "Take my BCH back", details…).
//
// API
//   <Sheet
//     open={open}                         controlled; the parent owns the state
//     onClose={(reason) => setOpen(false)} reason: 'close-button' | 'escape' | 'scrim' | 'drag'
//     title="Take your BCH back?"         required; names the dialog for screen readers
//     description="It goes back to …"    optional line under the title
//     footer={<Button block size="lg">…</Button>}   optional; sticks to the bottom, the primary action goes here
//     dismissible={false}                 optional (default true). false: no close button, and Escape, the scrim
//                                         and dragging do nothing but call onDismissAttempt (for gates such as
//                                         "Leave without saving?")
//     onDismissAttempt={() => …}          optional, see above
//     initialFocus={inputRef}             optional; else the sheet itself takes focus (no keyboard pops up)
//     size="sm" | "md"                    optional; desktop width 420 or 560 px (default "md")
//   >
//     …content, scrolls if it is taller than the screen…
//   </Sheet>
//
// Behaviour (DESIGN.md "Motion" and "Accessibility")
//   - Native <dialog> + showModal(): the page behind is inert, so focus stays inside; focus returns to
//     whatever had it before when the sheet closes. The page behind does not scroll.
//   - Phones: slides up from the bottom, 300 ms, --ease-drawer. A grabber on top; drag the top part down to
//     dismiss (a quick flick or past a third of its height), otherwise it springs back.
//   - From 768 px: scales from 0.96 to 1 at the centre, 200 ms.
//   - Pointer closes leave in 150 ms. Escape closes at once, with no animation.
//   - Reduced motion: fades only.
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import './sheet.css';

export type SheetCloseReason = 'close-button' | 'escape' | 'scrim' | 'drag';

export interface SheetProps {
  open: boolean;
  onClose: (reason: SheetCloseReason) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  onDismissAttempt?: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  size?: 'sm' | 'md';
  className?: string;
}

const LEAVE_MS = 150;
const DRAG_OUT_MS = 200;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => window.matchMedia('(max-width: 767.98px)').matches;

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  onDismissAttempt,
  initialFocus,
  size = 'md',
  className = '',
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const ids = { title: useId(), desc: useId() };
  const [leaving, setLeaving] = useState(false);

  // Latest props for event handlers that outlive a render.
  const props = useRef({ open, onClose, dismissible, onDismissAttempt });
  useEffect(() => {
    props.current = { open, onClose, dismissible, onDismissAttempt };
  });

  const instant = useRef(false); // the next close skips the leave animation (Escape, drag)
  const closingByUs = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; v: number; h: number } | null>(null);

  function closeNow() {
    const d = ref.current;
    if (!d?.open) return;
    closingByUs.current = true;
    d.close();
  }

  // Open and close follow the `open` prop.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      d.style.transform = '';
      d.style.transition = '';
      setLeaving(false);
      d.showModal();
      (initialFocus?.current ?? innerRef.current)?.focus({ preventScroll: true });
      return;
    }
    if (!open && d.open) {
      if (instant.current || reducedMotion()) {
        instant.current = false;
        closeNow();
        return;
      }
      setLeaving(true);
      const t = window.setTimeout(() => {
        closeNow();
        setLeaving(false);
      }, LEAVE_MS);
      return () => window.clearTimeout(t);
    }
  }, [open, initialFocus]);

  // The footer gets a divider only when the content scrolls under it.
  useEffect(() => {
    const b = bodyRef.current;
    if (!open || !b) return;
    const check = () => setOverflow(b.scrollHeight > b.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(b);
    for (const c of Array.from(b.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [open, children]);

  function attempt(reason: SheetCloseReason) {
    const p = props.current;
    if (p.dismissible) {
      if (reason === 'escape') instant.current = true;
      p.onClose(reason);
    } else {
      p.onDismissAttempt?.();
    }
  }

  // ---------------------------------------------------------------- drag to dismiss (phones)

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isPhone() || e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    const d = ref.current;
    if (!d) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0, h: d.getBoundingClientRect().height };
    d.style.transition = 'none';
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = drag.current;
    const d = ref.current;
    if (!g || !d) return;
    const dt = Math.max(1, e.timeStamp - g.lastT);
    g.v = (e.clientY - g.lastY) / dt;
    g.lastY = e.clientY;
    g.lastT = e.timeStamp;
    const dy = e.clientY - g.startY;
    // Down follows the finger (slowed when it can't be dismissed); up resists, so it never detaches.
    const offset = dy > 0 ? (props.current.dismissible ? dy : dy * 0.25) : -Math.sqrt(-dy) * 2;
    d.style.transform = `translateY(${offset}px)`;
  }

  function onPointerUp() {
    const g = drag.current;
    const d = ref.current;
    drag.current = null;
    if (!g || !d) return;
    const dy = g.lastY - g.startY;
    const flick = g.v > 0.5 && dy > 10;
    if (props.current.dismissible && (flick || dy > g.h / 3)) {
      d.style.transition = `transform ${DRAG_OUT_MS}ms var(--ease-drawer)`;
      d.style.transform = 'translateY(100%)';
      window.setTimeout(() => {
        instant.current = true;
        props.current.onClose('drag');
        // If the parent kept it open after all, bring it back.
        window.setTimeout(() => {
          if (ref.current?.open && props.current.open) springBack();
        }, 50);
      }, DRAG_OUT_MS);
      return;
    }
    if (dy > 40 && !props.current.dismissible) props.current.onDismissAttempt?.();
    springBack();
  }

  function springBack() {
    const d = ref.current;
    if (!d) return;
    instant.current = false;
    d.style.transition = 'transform var(--dur-sheet) var(--ease-drawer)';
    d.style.transform = '';
  }

  return (
    <dialog
      ref={ref}
      className={`sheet sheet--${size}${leaving ? ' sheet--leaving' : ''}${overflow ? ' sheet--overflow' : ''} ${className}`}
      aria-labelledby={ids.title}
      aria-describedby={description ? ids.desc : undefined}
      onCancel={(e) => {
        e.preventDefault();
        attempt('escape');
      }}
      onClose={() => {
        // Closed by the browser itself (some browsers close on a second Escape even when it was prevented).
        if (!closingByUs.current && props.current.open) {
          if (props.current.dismissible) {
            instant.current = true;
            props.current.onClose('escape');
          } else {
            ref.current?.showModal();
            props.current.onDismissAttempt?.();
            return;
          }
        }
        closingByUs.current = false;
        const back = returnFocus.current;
        returnFocus.current = null;
        if (back && document.contains(back)) back.focus({ preventScroll: true });
      }}
      onClick={(e) => {
        if (e.target === ref.current) attempt('scrim'); // the backdrop
      }}
    >
      <div ref={innerRef} className="sheet__inner" tabIndex={-1}>
        <div
          className="sheet__top"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="sheet__grabber" aria-hidden />
          <div className="sheet__head">
            <h2 id={ids.title} className="sheet__title">{title}</h2>
            {dismissible && (
              <button type="button" className="icon-btn sheet__close" onClick={() => attempt('close-button')} aria-label="Close">
                <X />
              </button>
            )}
          </div>
          {description && <p id={ids.desc} className="sheet__desc">{description}</p>}
        </div>
        {children && <div ref={bodyRef} className="sheet__body">{children}</div>}
        {footer && <div className="sheet__footer">{footer}</div>}
      </div>
    </dialog>
  );
}
