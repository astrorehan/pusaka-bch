// "Open a plan link": paste a link or choose the saved file, then go to /plan#…
// A native <dialog>: focus stays inside and Escape closes it. Bottom sheet on phones.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleAlert, FileUp, X } from 'lucide-react';
import { Button } from '../../components/Button';
import { NETWORK } from '../../components/AppShell';
import { checkPlanLink } from './readPlanLink';
import './open-link-dialog.css';

interface OpenLinkDialogProps {
  open: boolean;
  onClose: () => void;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_FILE_BYTES = 1_000_000;

export function OpenLinkDialog({ open, onClose }: OpenLinkDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const ids = { title: useId(), desc: useId(), input: useId(), error: useId() };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setText('');
      setError(null);
      setClosing(false);
      d.showModal();
      // With a mouse, start in the field. On touch, don't pop the keyboard over the sheet.
      if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  /** Close with the leave animation (pointer); Escape closes at once (native). */
  function requestClose() {
    if (closing) return;
    if (reducedMotion()) {
      ref.current?.close();
      return;
    }
    setClosing(true);
    window.setTimeout(() => {
      ref.current?.close();
      setClosing(false);
    }, 150);
  }

  function go(fragment: string) {
    ref.current?.close();
    navigate(`/plan#${fragment}`);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const r = checkPlanLink(text, NETWORK);
    if (r.ok) go(r.fragment);
    else setError(r.error);
  }

  function onBlur() {
    if (!text.trim()) return; // an empty field is not an error until submit
    const r = checkPlanLink(text, NETWORK);
    if (!r.ok) setError(r.error);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("This file is too large to be a saved plan link. Choose the file you saved when the plan was made.");
      return;
    }
    let content = '';
    try {
      content = await file.text();
    } catch {
      setError("This file couldn't be read. Try choosing it again, or paste the link instead.");
      return;
    }
    const r = checkPlanLink(content, NETWORK, 'file');
    if (r.ok) go(r.fragment);
    else setError(r.error);
  }

  return (
    <dialog
      ref={ref}
      className="olink"
      data-closing={closing || undefined}
      aria-labelledby={ids.title}
      aria-describedby={ids.desc}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) requestClose(); // backdrop
      }}
    >
      <div className="olink__body">
        <div className="olink__grabber" aria-hidden />
        <div className="olink__head">
          <h2 id={ids.title} className="olink__title">Open a plan link</h2>
          <button type="button" className="icon-btn olink__close" onClick={requestClose} aria-label="Close">
            <X />
          </button>
        </div>
        <p id={ids.desc} className="olink__desc">
          Paste the plan link you were sent, or the one you saved when you made your plan. It stays in your browser.
        </p>

        <form onSubmit={submit} noValidate>
          <label htmlFor={ids.input} className="olink__label">Plan link</label>
          <input
            ref={inputRef}
            id={ids.input}
            className="olink__input"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="https://…/plan#…"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            onBlur={onBlur}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.error : undefined}
          />
          <p id={ids.error} className="olink__error" role="alert" hidden={!error}>
            {error && (
              <>
                <CircleAlert aria-hidden />
                <span>{error}</span>
              </>
            )}
          </p>

          <div className="olink__actions">
            <Button type="submit" size="lg" block>Open plan</Button>
            <Button type="button" variant="ghost" block icon={<FileUp />} onClick={() => fileRef.current?.click()}>
              Choose the saved file
            </Button>
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </form>
      </div>
    </dialog>
  );
}
