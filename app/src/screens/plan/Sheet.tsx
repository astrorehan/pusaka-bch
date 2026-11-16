// A bottom sheet on phones and a centred dialog from 768 px. Traps focus, closes on Escape when allowed.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './sheet.css';

interface Props {
  open: boolean;
  /** false while the wallet or network is working: no close button, Escape and the backdrop do nothing */
  closable: boolean;
  onClose(): void;
  labelledBy: string;
  children: ReactNode;
}

const LEAVE_MS = 200;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, closable, onClose, labelledBy, children }: Props) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      restore.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const id = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
      restore.current?.focus?.();
    }, LEAVE_MS);
    return () => clearTimeout(id);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- only the open flag drives the animation

  // Focus the panel on open, lock page scroll while mounted.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ?? panel.current;
    first?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  if (!mounted) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (closable) onClose();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return createPortal(
    <div className={`sheet${leaving ? ' is-leaving' : ''}`} onKeyDown={onKeyDown}>
      <div className="sheet__scrim" onClick={() => closable && onClose()} aria-hidden />
      <div className="sheet__panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        <span className="sheet__grabber" aria-hidden />
        {closable && (
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
