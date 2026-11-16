import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/Button';

interface Props {
  onStay(): void;
  onSave(): void;
  onLeave(): void;
}

/** "Leave without saving?" Centred dialog: traps focus, Escape means stay. */
export function LeaveDialog({ onStay, onSave, onLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onStay(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>('button')];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onStay]);

  // Portalled to <body>: the flow column has an enter transform, which would trap a fixed overlay.
  return createPortal(
    <div className="cr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onStay(); }}>
      <div ref={ref} className="cr-dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-text">
        <h2 id="leave-title" className="cr-dialog__title">Leave without saving?</h2>
        <p id="leave-text" className="muted">Your heirs can't claim without this link. Pusaka keeps no copy of it.</p>
        <div className="cr-dialog__actions">
          <Button size="lg" block onClick={onSave}>Save plan link</Button>
          <Button variant="ghost" block className="cr-danger-text" onClick={onLeave}>Leave anyway</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
