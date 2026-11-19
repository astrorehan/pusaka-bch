import { useId, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { NETWORK } from '../../lib/networkName';
import { checkPlanLink, MAX_PLAN_FILE_BYTES } from '../home/readPlanLink';
import { ErrorNotice, WalletSheet } from './WalletUi';

export function PlanImport({
  open,
  close,
}: {
  open: boolean;
  close: () => void;
}) {
  const navigate = useNavigate();
  const formId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reading) return;
    const result = checkPlanLink(text, NETWORK);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setText('');
    setError('');
    close();
    navigate(result.to);
  }

  return (
    <WalletSheet
      open={open}
      onClose={close}
      dismissible={!reading}
      title="Open a saved plan"
      description="Use the link or plan file shared with you. It contains public addresses and rules."
      footer={
        <Button
          type="submit"
          form={formId}
          icon={<ArrowRight />}
          loading={reading}
          disabled={!text.trim()}
        >
          {reading ? 'Reading file…' : 'Open plan'}
        </Button>
      }
    >
      <form className="pw-form" id={formId} onSubmit={submit}>
        <label>
          Plan link or JSON
          <textarea
            rows={4}
            required
            value={text}
            spellCheck={false}
            autoCapitalize="off"
            disabled={reading}
            onChange={(event) => {
              setText(event.target.value);
              setError('');
            }}
            placeholder="Paste your plan link or saved plan data"
          />
        </label>
        <label>
          Or choose saved plan data
          <input
            type="file"
            accept=".json,.html,.htm,.txt,.url,application/json,text/html,text/plain"
            disabled={reading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              if (file.size > MAX_PLAN_FILE_BYTES) {
                setError('This saved plan is too large to open.');
                return;
              }
              setReading(true);
              try {
                setText(await file.text());
                setError('');
              } catch {
                setError(
                  'Could not read the plan file. Choose it again or paste the plan link.',
                );
              } finally {
                setReading(false);
              }
            }}
          />
        </label>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <Link to="/plan" className="pw-card-link">
          Open a legacy plan <ArrowRight size={16} aria-hidden />
        </Link>
      </form>
    </WalletSheet>
  );
}
