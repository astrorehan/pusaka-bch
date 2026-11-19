// "Open a plan link": paste a link or choose the saved file, then go to /plan#…
// Built on the shared Sheet: bottom sheet on phones, centred dialog from 768 px, Escape closes at once.
import { useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleAlert, FileUp } from 'lucide-react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { NETWORK } from '../../lib/networkName';
import { checkPlanLink, MAX_PLAN_FILE_BYTES, type PlanDestination } from './readPlanLink';
import './open-link-dialog.css';

interface OpenLinkDialogProps {
  open: boolean;
  onClose: () => void;
}

const finePointer = () => window.matchMedia('(pointer: fine)').matches;

export function OpenLinkDialog({ open, onClose }: OpenLinkDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ids = { form: useId(), input: useId(), error: useId() };

  // Each opening starts empty.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText('');
      setError(null);
    }
  }

  function go(to: PlanDestination) {
    onClose();
    navigate(to);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const r = checkPlanLink(text, NETWORK);
    if (r.ok) go(r.to);
    else {
      setError(r.error);
      inputRef.current?.focus();
    }
  }

  function onBlur() {
    if (!text.trim()) return; // an empty field is not an error until submit
    const r = checkPlanLink(text, NETWORK);
    if (!r.ok) setError(r.error);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PLAN_FILE_BYTES) {
      setError('This file is too large to be a saved plan link. Choose the file you saved when the plan was made.');
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
    if (r.ok) go(r.to);
    else setError(r.error);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      title="Open a plan link"
      description="Paste the plan link you were sent, or the one you saved when you made your plan. It stays in your browser."
      // With a mouse, start in the field. On touch, don't pop the keyboard over the sheet.
      initialFocus={open && finePointer() ? inputRef : undefined}
      footer={
        <>
          <Button type="submit" form={ids.form} size="lg" block>Open plan</Button>
          <Button type="button" variant="ghost" block icon={<FileUp />} onClick={() => fileRef.current?.click()}>
            Choose the saved file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.html,.htm,.txt,.url,application/json,text/html,text/plain"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </>
      }
    >
      <form id={ids.form} className="olink" onSubmit={submit} noValidate>
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
      </form>
    </Sheet>
  );
}
