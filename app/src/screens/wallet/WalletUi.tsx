import {
  useLayoutEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  FlaskConical,
  X,
} from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { CopyButton } from '../../components/CopyButton';
import { Sheet } from '../../components/Sheet';
import { friendlyError, StaleReviewError, UncertainSubmission, UnconfirmedPlanSubmission } from '../../lib/chain/errors';
import { explorerTxUrl } from '../../lib/format';
import type { Prepared } from '../../lib/chain/v2';
import { NETWORK, OTHER_APP } from '../../lib/networkName';
import type { PusakaV2PlanMetadata } from '../../lib/protocol/plan-metadata';
import type { PendingPlanSubmission } from '../../lib/walletData';
import './wallet-app.css';

export function Card({
  className = '',
  ...props
}: ComponentPropsWithoutRef<'section'>) {
  return <section className={`pw-card ${className}`} {...props} />;
}

/**
 * `paidOut`: the example on screen has paid its heirs. `exhausted`: so has every other example, so the
 * mainnet notice points to Chipnet. Otherwise `onNext` opens the example with the most left to do.
 */
export function DemoNotice({ paidOut = false, exhausted = true, onNext }: { paidOut?: boolean; exhausted?: boolean; onNext?: () => void }) {
  const elsewhere = paidOut && exhausted && NETWORK === 'mainnet' && OTHER_APP;
  const next = paidOut && !exhausted && onNext;
  return (
    <div className="pw-info" role="note">
      <FlaskConical size={17} aria-hidden />
      <p>
        {NETWORK === 'mainnet'
          ? 'Live example plan on Bitcoin Cash. Anyone can open its claim or pay its heirs, with no wallet of your own. The plan pays the network fee from its real BCH.'
          : 'Live example plan on Chipnet, the Bitcoin Cash test network. Anyone can open its claim or pay its heirs, with no wallet of your own.'}
        {next && (
          <>
            {' '}This example has paid its heirs.{' '}
            <button type="button" className="pw-link-button" onClick={onNext}>
              Open the next example <ArrowRight aria-hidden size={14} />
            </button>
          </>
        )}
        {elsewhere && (
          <>
            {' '}All the mainnet examples have paid their heirs.{' '}
            <a href={`${OTHER_APP}wallet/demo`}>
              Try the steps on Chipnet <ArrowUpRight aria-hidden size={14} />
            </a>
          </>
        )}
      </p>
      <Link to="/wallet">
        Exit demo <ArrowRight aria-hidden size={14} />
      </Link>
    </div>
  );
}

export function WalletSheet({
  open,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof Sheet>, 'className'>) {
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = document.activeElement;
    const label = trigger instanceof HTMLButtonElement ? trigger.textContent : null;
    return () => {
      // Some actions unmount the sheet immediately, and a re-render can replace the button that opened it.
      // Native focus restoration needs a fallback then: the same button, or one with the same label.
      window.setTimeout(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        const target =
          trigger instanceof HTMLElement && trigger.isConnected
            ? trigger
            : label
              ? Array.from(document.querySelectorAll('button')).find((button) => button.textContent === label)
              : undefined;
        target?.focus({ preventScroll: true });
      }, 0);
    };
  }, [open]);
  return <Sheet {...props} open={open} className="pw-sheet" />;
}

export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="pw-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="pw-actions">{children}</div>}
    </header>
  );
}

export function CardHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="pw-card-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning';
  dot?: boolean;
}) {
  return (
    <span className={`pw-badge pw-badge--${tone}`}>
      {dot && <i aria-hidden />}
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="pw-empty-state">
      <span className="pw-symbol" aria-hidden>
        {icon}
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="pw-error" role="alert">
      <CircleAlert size={17} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function TransactionNotice({
  txid,
  dismiss,
}: {
  txid: string;
  dismiss?: () => void;
}) {
  return (
    <div className="pw-success" role="status">
      <Check size={18} aria-hidden />
      <div>
        Transaction accepted by the network.{' '}
        <a href={explorerTxUrl(txid, NETWORK)} target="_blank" rel="noreferrer">
          View transaction <ExternalLink size={12} aria-hidden />
        </a>
      </div>
      {dismiss && (
        <button
          type="button"
          className="pw-icon"
          onClick={dismiss}
          aria-label="Dismiss transaction notice"
        >
          <X aria-hidden />
        </button>
      )}
    </div>
  );
}

export function Address({
  value,
  label,
  full = false,
}: {
  value: string;
  label: string;
  full?: boolean;
}) {
  return (
    <div className={`pw-address${full ? ' pw-address--full' : ''}`}>
      <code className="pw-address-value mono" title={value}>
        {full ? (
          value
        ) : (
          <>
            <span className="pw-address-start">{value.slice(0, -8)}</span>
            <span>{value.slice(-8)}</span>
          </>
        )}
      </code>
      <CopyButton
        value={value}
        label={label}
        className="pw-address-copy"
        showText
      />
    </div>
  );
}

export function BchMark({ size = 28 }: { size?: number }) {
  return (
    <img
      className="pw-bch-mark"
      src={`${import.meta.env.BASE_URL}brands/bitcoin-cash.svg`}
      alt=""
      width={size}
      height={size}
    />
  );
}

export function Details({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="pw-details">
      {rows.map(([label, value], i) => (
        <div key={i}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PlanDataDownload({ plan }: { plan: PusakaV2PlanMetadata }) {
  return (
    <ButtonLink
      variant="secondary"
      href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(plan, null, 2))}`}
      download={`pusaka-${plan.planCategoryHex.slice(0, 8)}.json`}
      icon={<Download />}
    >
      Download plan data
    </ButtonLink>
  );
}

export function PlanSubmissionDetails({ record }: { record: PendingPlanSubmission }) {
  return (
    <div className="pw-sheet-stack">
      <p className="pw-fine">
        {record.title} · <a href={explorerTxUrl(record.txid, NETWORK)} target="_blank" rel="noreferrer">
          View transaction <ExternalLink size={12} aria-hidden />
        </a>
      </p>
      <PlanDataDownload plan={record.metadata} />
    </div>
  );
}

export function TransactionReview({
  prepared,
  close,
  done,
}: {
  prepared: Prepared;
  close: () => void;
  done: (txid: string, transaction: Prepared) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revised, setRevised] = useState<Prepared | null>(null);
  const [stale, setStale] = useState(false);
  const [recovery, setRecovery] = useState<PendingPlanSubmission | null>(null);
  // The refreshed review could not be built (the step was already done by someone else): only Back is left.
  const [ended, setEnded] = useState(false);
  // Sent, but the reply was lost: the transaction to check before sending again.
  const [uncertain, setUncertain] = useState('');
  const transaction = revised ?? prepared;
  const rebuild = stale && !ended ? transaction.rebuild : undefined;
  const walletApproval = transaction.walletApproval ?? true;
  const actionLabel = walletApproval ? 'Approve in wallet' : 'Send transaction';

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (rebuild) {
        setRevised(await rebuild());
        setStale(false);
      } else {
        const api = await import('../../lib/chain/v2');
        const txid = recovery ? await api.checkPlanSubmission(recovery) : await api.submit(transaction);
        done(txid, transaction);
      }
    } catch (err) {
      if (err instanceof StaleReviewError && !walletApproval && transaction.rebuild) {
        // Nothing to sign: rebuild at once. Usually someone else just sent this step, and the rebuild says so.
        try {
          setRevised(await transaction.rebuild());
          setError('This plan changed a moment ago, so we updated the details. Take another look before sending.');
        } catch (rebuildError) {
          setEnded(true);
          setError(friendlyError(rebuildError));
        }
        return;
      }
      if (err instanceof StaleReviewError) setStale(true);
      if (err instanceof UnconfirmedPlanSubmission) setRecovery(err.record);
      setUncertain(err instanceof UncertainSubmission ? err.txid : '');
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WalletSheet
      open
      title={transaction.title}
      description={
        walletApproval
          ? 'Check the details before approving this transaction in your wallet.'
          : 'Check the details and network fee before sending this transaction.'
      }
      dismissible={!busy}
      onClose={close}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={close}
          >
            Back
          </Button>
          <Button
            type="button"
            loading={busy}
            disabled={(stale && !rebuild) || ended}
            icon={<ArrowUpRight />}
            onClick={() => void approve()}
          >
            {rebuild ? 'Refresh transaction review' : recovery ? 'Check submission' : busy
              ? walletApproval ? 'Waiting for wallet or network…' : 'Sending to network…'
              : actionLabel}
          </Button>
        </>
      }
    >
      <div className="pw-sheet-stack">
        <Details rows={transaction.rows} />
        {transaction.warning && <p className="pw-fine" role="note">{transaction.warning}</p>}
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {uncertain && (
          <p className="pw-fine">
            <a href={explorerTxUrl(uncertain, NETWORK)} target="_blank" rel="noreferrer">
              Check this transaction <ExternalLink size={12} aria-hidden />
            </a>
          </p>
        )}
        {recovery && <PlanSubmissionDetails record={recovery} />}
        <p className="pw-fine">
          {NETWORK === 'chipnet'
            ? 'This uses test BCH.'
            : 'This transaction uses real BCH.'}{' '}
          Confirmation follows after the network includes it in a block.
        </p>
      </div>
    </WalletSheet>
  );
}
