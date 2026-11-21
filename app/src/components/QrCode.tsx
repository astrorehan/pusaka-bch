// Crisp canvas QR code for addresses and compact family plan links, with optional tap-to-copy.
import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../lib/clipboard';

export interface QrCodeProps {
  value: string;
  size?: number;
  quietZone?: number;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  label: string;
  /** When set, tapping/clicking the QR copies `copyValue ?? value` and shows inline feedback. */
  copyValue?: string;
  copyHint?: string;
  className?: string;
}

export function QrCode({
  value,
  size = 208,
  quietZone = 10,
  errorCorrection = 'L',
  label,
  copyValue,
  copyHint = 'Tap QR to copy link',
  className = '',
}: QrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const matrix = useMemo(() => {
    try {
      const qr = qrcode(0, errorCorrection);
      qr.addData(value);
      qr.make();
      const count = qr.getModuleCount();
      const cells = new Uint8Array(count * count);
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) cells[r * count + c] = 1;
        }
      }
      return { count, cells };
    } catch {
      return null;
    }
  }, [value, errorCorrection]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !matrix) return;
    const { count, cells } = matrix;
    const total = size + quietZone * 2;
    const scale = typeof window !== 'undefined' ? Math.max(2, window.devicePixelRatio || 1) : 2;
    canvas.width = Math.round(total * scale);
    canvas.height = Math.round(total * scale);
    canvas.style.width = `${total}px`;
    canvas.style.height = 'auto';
    canvas.style.aspectRatio = '1 / 1';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, total, total);
    ctx.fillStyle = '#131B33';
    const cell = size / count;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!cells[r * count + c]) continue;
        const x = quietZone + c * cell;
        const y = quietZone + r * cell;
        const w = Math.ceil(x + cell) - Math.floor(x);
        const h = Math.ceil(y + cell) - Math.floor(y);
        ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
      }
    }
  }, [matrix, size, quietZone]);

  if (!matrix) return null;

  const canvas = (
    <span role="img" aria-label={label} className="qr-frame__img">
      <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
    </span>
  );

  if (copyValue === undefined) {
    return <div className={`qr-frame ${className}`}>{canvas}</div>;
  }

  async function onCopy() {
    const ok = await copyText(copyValue ?? value);
    setStatus(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('idle'), 2000);
  }

  return (
    <button
      type="button"
      className={`qr-frame qr-frame--button ${className}`}
      data-copy-state={status}
      onClick={() => void onCopy()}
      aria-label={`Copy ${label.toLowerCase()}`}
    >
      {canvas}
      <span className="qr-frame__hint" aria-live="polite">
        {status === 'copied' ? (
          <>
            <Check size={14} aria-hidden /> Copied link
          </>
        ) : status === 'failed' ? (
          'Could not copy'
        ) : (
          <>
            <Copy size={13} aria-hidden /> {copyHint}
          </>
        )}
      </span>
    </button>
  );
}
