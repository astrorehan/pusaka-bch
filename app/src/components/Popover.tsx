// A small panel that drops from its trigger: the phone menu, the wallet panel, the banner on phones.
//
//   const [open, setOpen] = useState(false);
//   const trigger = useRef<HTMLButtonElement>(null);
//   <div style={{ position: 'relative' }}>
//     <button ref={trigger} aria-expanded={open} aria-controls="menu" onClick={() => setOpen(!open)}>Menu</button>
//     <Popover id="menu" open={open} onClose={() => setOpen(false)} anchorRef={trigger} align="end">…</Popover>
//   </div>
//
// Disclosure pattern (not role="menu"): the panel follows its trigger in the DOM, so Tab walks into it.
// Closes on Escape (at once, focus back on the trigger), on a click outside, and when focus leaves.
// Motion: scale 0.96 -> 1 from the trigger's corner, 150 ms in and out (DESIGN.md "Motion").
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import './popover.css';

interface PopoverProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** the trigger; clicks on it are not "outside" (it toggles itself) */
  anchorRef: RefObject<HTMLElement | null>;
  /** which edge of the positioned parent the panel lines up with; 'stretch' spans it */
  align?: 'start' | 'end' | 'stretch';
  /** accessible name for the panel */
  label?: string;
  className?: string;
  children: ReactNode;
}

const LEAVE_MS = 150;

export function Popover({ id, open, onClose, anchorRef, align = 'end', label, className = '', children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [instant, setInstant] = useState(false); // the next close skips the leave animation (Escape)
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Mount on open; on close, keep it mounted for the leave animation unless it was a keyboard close.
  if (open && !mounted) setMounted(true);
  if (open && leaving) setLeaving(false);
  if (!open && mounted && !leaving) {
    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMounted(false);
      setInstant(false);
    } else {
      setLeaving(true);
    }
  }
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    if (!open) return;
    const inside = (n: EventTarget | null) =>
      n instanceof Node && (ref.current?.contains(n) || anchorRef.current?.contains(n));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setInstant(true);
      close.current();
      anchorRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!inside(e.target)) close.current();
    };
    const onFocus = (e: FocusEvent) => {
      if (!inside(e.target)) close.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open, anchorRef]);

  if (!mounted) return null;
  return (
    <div
      ref={ref}
      id={id}
      role="region"
      aria-label={label}
      className={`popover popover--${align}${leaving ? ' popover--leaving' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
