// Full-area states: no link, broken link, plan not found, other network, offline or network error. And the loading skeleton.
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleAlert, CloudOff, FileUp, Link2, Link2Off, Network, SearchX, WifiOff } from 'lucide-react';
import { Button } from '../../components/Button';
import { StateMessage } from '../../components/StateMessage';
import { NETWORK } from '../../components/AppShell';
import { checkPlanLink } from '../home/readPlanLink';

export type MessageKind = 'empty' | 'broken' | 'missing' | 'other-network' | 'offline' | 'error';

interface Props {
  kind: MessageKind;
  /** the network the plan link is for (other-network only) */
  planNetwork?: 'mainnet' | 'chipnet';
  onRetry?(): void;
}

const netName = (n: 'mainnet' | 'chipnet') => (n === 'mainnet' ? 'main network' : 'test network');

export function PlanMessage({ kind, planNetwork, onRetry }: Props) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(kind === 'empty');

  let icon: ReactNode, title: string, text: string;
  switch (kind) {
    case 'empty':
      icon = <Link2 />; title = 'Open a plan link'; text = 'Paste the plan link you saved, or the one someone shared with you. It stays in your browser.'; break;
    case 'broken':
      icon = <Link2Off />; title = "This plan link doesn't work";
      text = 'Part of the link may be missing. Copy the whole link again, or ask the person who shared it to send it once more.'; break;
    case 'missing':
      icon = <SearchX />; title = "We can't find this plan";
      text = "The link is complete, but there is no plan like it on the network. It may never have been sent, or it was made for a different plan."; break;
    case 'other-network': {
      const other = planNetwork ?? 'mainnet';
      icon = <Network />; title = `This plan is on the ${netName(other)}`;
      text = `This copy of Pusaka works on the ${netName(other === 'mainnet' ? 'chipnet' : 'mainnet')}. Open the link in the Pusaka app for the ${netName(other)}.`; break;
    }
    case 'offline':
      icon = <WifiOff />; title = "You're offline"; text = 'Pusaka reads plans straight from the Bitcoin Cash network. Connect to the internet, then try again.'; break;
    default:
      icon = <CloudOff />; title = "Can't reach the network";
      text = "Pusaka reads plans straight from the Bitcoin Cash network, and it didn't answer. Your plan is safe. Try again in a moment.";
  }

  const retry = kind === 'offline' || kind === 'error';

  return (
    <StateMessage
      icon={icon}
      title={title}
      text={text}
      actions={
        <>
          {retry && <Button size="lg" onClick={onRetry}>Try again</Button>}
          {!retry && !opening && <Button size="lg" onClick={() => setOpening(true)}>Open another link</Button>}
          <Button variant="secondary" size="lg" onClick={() => navigate('/new')}>Create a plan</Button>
        </>
      }
    >
      {opening && <OpenLink autoFocus={kind !== 'empty'} onOpen={(hash) => navigate({ pathname: '/plan', hash })} />}
    </StateMessage>
  );
}

/** Paste a plan link or choose the saved file. Same checks and words as the home page's "Open a plan link". */
function OpenLink({ onOpen, autoFocus }: { onOpen(hash: string): void; autoFocus: boolean }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const id = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const r = checkPlanLink(value, NETWORK);
    if (!r.ok) {
      setError(r.error);
      input.current?.focus();
      return;
    }
    setError('');
    onOpen('#' + r.fragment);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    let content = '';
    try { content = f.size > 1_000_000 ? '' : await f.text(); } catch { content = ''; }
    const r = checkPlanLink(content, NETWORK, 'file');
    if (r.ok) onOpen('#' + r.fragment);
    else setError(r.error);
  }

  return (
    <form className="pl-open" onSubmit={submit} noValidate>
      <label htmlFor={id} className="sr-only">Plan link</label>
      <div className="pl-open__row">
        <input
          ref={input}
          id={id}
          className="pl-open__input"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="https://…/plan#…"
          value={value}
          onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? id + '-err' : undefined}
          autoFocus={autoFocus}
        />
        <Button type="submit" size="lg">Open</Button>
      </div>
      {error && <p id={id + '-err'} className="pl-open__error" role="alert"><CircleAlert aria-hidden />{error}</p>}
      <Button type="button" variant="ghost" block className="pl-open__file" icon={<FileUp />} onClick={() => file.current?.click()}>
        Choose the saved file
      </Button>
      <input
        ref={file}
        type="file"
        accept=".html,.htm,.txt,.url,text/html,text/plain"
        hidden
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }}
      />
    </form>
  );
}

export function PlanSkeleton() {
  return (
    <div className="pl pl--skeleton" aria-busy="true" aria-label="Loading the plan">
      <div className="pl-hero">
        <span className="sk sk--pill" />
        <span className="sk sk--title" />
        <span className="sk sk--line" style={{ width: '92%' }} />
        <span className="sk sk--line" style={{ width: '70%' }} />
        <span className="sk sk--ring" />
        <span className="sk sk--line" style={{ width: '60%', margin: '0 auto' }} />
        <span className="sk sk--button" />
      </div>
      <div className="pl-side">
        <div className="pl-card">
          <span className="sk sk--line" style={{ width: '40%' }} />
          <span className="sk sk--bar" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sk-row"><span className="sk sk--dot" /><span className="sk sk--line" style={{ width: '45%' }} /><span className="sk sk--line" style={{ width: '25%', marginLeft: 'auto' }} /></div>
          ))}
        </div>
      </div>
    </div>
  );
}
