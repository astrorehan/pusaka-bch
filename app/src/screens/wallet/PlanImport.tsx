import { useId, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import * as api from '../../lib/chain/v2';
import { useCurrentPlan } from './currentPlan';
import { ErrorNotice, WalletSheet } from './WalletUi';

export function PlanImport({
  open,
  close,
}: {
  open: boolean;
  close: () => void;
}) {
  const { selectPlan } = useCurrentPlan();
  const navigate = useNavigate();
  const formId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const plan = api.importPlan(text);
      const data = await api.loadPlan(plan);
      if (data.state.status === 'UNINITIALIZED')
        throw new Error(
          'This plan could not be found on the network. Check that you have the latest link or file.',
        );
      selectPlan(plan, data);
      setText('');
      close();
      navigate('/wallet/plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WalletSheet
      open={open}
      onClose={close}
      dismissible={!busy}
      title="Open a saved plan"
      description="Use the link or plan file shared with you. It contains public addresses and rules."
      footer={
        <Button
          type="submit"
          form={formId}
          icon={<ArrowRight />}
          loading={busy}
          disabled={!text.trim()}
        >
          {busy ? 'Checking plan…' : 'Open plan'}
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
            disabled={busy}
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
            accept="application/json,.json"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                setText(await file.text());
                setError('');
              } catch {
                setError(
                  'Could not read the plan file. Choose it again or paste the plan link.',
                );
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
