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
  ExternalLink,
  FlaskConical,
  X,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { CopyButton } from '../../components/CopyButton';
import { Sheet } from '../../components/Sheet';
import { explorerTxUrl, shortAddress } from '../../lib/format';
import type { Prepared } from '../../lib/chain/v2';
import { NETWORK } from '../../lib/networkName';
import './wallet-app.css';

export function Card({
  className = '',
  ...props
}: ComponentPropsWithoutRef<'section'>) {
  return <section className={`pw-card ${className}`} {...props} />;
}

export function DemoNotice() {
  return (
    <div className="pw-info" role="note">
      <FlaskConical size={17} aria-hidden />
      <p>
        Live Chipnet proof wallet. Balances and claim status come from the test
        network.
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
    return () => {
      // Some actions unmount the sheet immediately. Native focus restoration needs a fallback then.
      queueMicrotask(() => {
        if (
          trigger instanceof HTMLElement &&
          trigger.isConnected &&
          document.activeElement === document.body
        ) {
          trigger.focus({ preventScroll: true });
        }
      });
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
        <a
          href={explorerTxUrl(txid, NETWORK)}
          target="_blank"
          rel="noreferrer"
        >
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
      <span className="mono" title={value}>
        {full ? value : shortAddress(value, 5, 5)}
      </span>
      <CopyButton value={value} label={label} />
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

export function TransactionReview({
  prepared,
  close,
  done,
}: {
  prepared: Prepared;
  close: () => void;
  done: (txid: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const walletApproval = prepared.walletApproval ?? true;
  const actionLabel = walletApproval ? 'Approve in wallet' : 'Send transaction';

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { submit } = await import('../../lib/chain/v2');
      done(await submit(prepared));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <WalletSheet
      open
      title={prepared.title}
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
            icon={<ArrowUpRight />}
            onClick={() => void approve()}
          >
            {busy
              ? walletApproval
                ? 'Waiting for wallet or network…'
                : 'Sending to network…'
              : actionLabel}
          </Button>
        </>
      }
    >
      <div className="pw-sheet-stack">
        <Details rows={prepared.rows} />
        {error && <ErrorNotice>{error}</ErrorNotice>}
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
