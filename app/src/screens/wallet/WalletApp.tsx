import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Download,
  Ellipsis,
  ExternalLink,
  FileUp,
  History,
  Inbox,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { CopyButton } from '../../components/CopyButton';
import { Logo } from '../../components/Logo';
import type * as api from '../../lib/chain/v2';
import {
  explorerTxUrl,
  formatBch,
  formatDuration,
  parseBch,
} from '../../lib/format';
import { HAS_DEMO } from '../../lib/demo';
import { friendlyError } from '../../lib/chain/errors';
import { NETWORK, OTHER_APP } from '../../lib/networkName';
import { useWallet } from '../../lib/wallet';
import { CURRENT_ASSET_REVISION, encodePusakaV2PlanLink } from '../../lib/protocol/plan-metadata';
import { history, pendingPlanSubmissions, planLink, type PendingPlanSubmission } from '../../lib/walletData';
import {
  claimFundingMessage,
  planAddressHash,
  planAddressPrefix,
  useCurrentPlan,
} from './currentPlan';
import {
  ClaimProgress,
  PlanPeople,
  PlanRules,
  PlanShare,
  PlanStarter,
  type PrepareAction,
} from './PlanOverview';
import { PlanImport } from './PlanImport';
import { isDemoRoute, walletPath } from './paths';
import {
  Address,
  Badge,
  BchMark,
  Card,
  CardHeading,
  DemoNotice,
  EmptyState,
  ErrorNotice,
  PageHeading,
  PlanDataDownload,
  PlanSubmissionDetails,
  TransactionNotice,
  TransactionReview,
  WalletSheet,
} from './WalletUi';
import terraceEngraving from './terrace-engraving.webp';

const TokenAssets = lazy(() =>
  import('./SwapScreen').then((module) => ({ default: module.TokenAssets })),
);

type Dialog = 'receive' | 'send' | 'import' | 'export' | 'more';
type Metadata = api.PusakaV2PlanMetadata;
type PlanState = api.LoadedPlan['state'];

function EmptyWallet({ inherited }: { inherited: boolean }) {
  return (
    <WalletFocus>
      <div className="pw-balance-caption">
        <BchMark size={21} />{' '}
        {inherited ? 'Bitcoin Cash inheritance' : 'Bitcoin Cash wallet'}
      </div>
      <div className="pw-balance-intro">
        <h2>
          {inherited
            ? 'Create your inheritance plan'
            : 'Create your protected wallet'}
        </h2>
        <p>
          {inherited
            ? 'Choose who inherits, how they share the balance, and when a claim can begin.'
            : 'Send and receive BCH from Pusaka. Set an inheritance plan for the balance you leave behind.'}
        </p>
      </div>
      <div className="pw-balance-actions">
        <ButtonLink to="/wallet/new" icon={<ArrowUpRight />}>
          Set up my wallet
        </ButtonLink>
      </div>
    </WalletFocus>
  );
}

function WalletFocus({
  children,
  loading,
}: {
  children: ReactNode;
  loading?: boolean;
}) {
  return (
    <section className="pw-balance" aria-busy={loading || undefined}>
      <img src={terraceEngraving} alt="" className="pw-balance-art" />
      <div className="pw-balance-content">
        <span className="pw-balance-seal">
          <Logo size={40} />
        </span>
        {children}
      </div>
    </section>
  );
}

function Balance({
  data,
  loading,
  owner,
  busy,
  swapPath,
  open,
}: {
  data: api.LoadedPlan | null;
  loading: boolean;
  owner: boolean;
  busy: boolean;
  swapPath: string;
  open: (dialog: Dialog) => void;
}) {
  const state = data?.state;
  const found = state && state.status !== 'UNINITIALIZED';
  const canSend = owner && state && ['ACTIVE', 'REVIEW'].includes(state.status);
  return (
    <WalletFocus loading={loading && !state}>
      <div className="pw-balance-caption">
        <BchMark size={21} /> Protected BCH balance
      </div>
      <div className="pw-balance-value">
        <p className="pw-balance-number num">
          {found ? formatBch(state.spendableBalanceSats) : '—'} <span>BCH</span>
        </p>
        <p className="pw-balance-note">
          {state?.status === 'PAID_OUT' || state?.status === 'CLOSED'
            ? 'Your receive address still follows these inheritance rules.'
            : 'Available to spend, with 1,000 satoshis reserved to keep your wallet active.'}
        </p>
      </div>
      <div className="pw-balance-actions">
        <Button
          type="button"
          variant={canSend ? 'primary' : 'secondary'}
          icon={<ArrowUpRight />}
          disabled={busy || !canSend}
          onClick={() => open('send')}
        >
          Send
        </Button>
        <Button
          type="button"
          variant={canSend ? 'secondary' : 'primary'}
          icon={<ArrowDownLeft />}
          onClick={() => open('receive')}
        >
          Receive
        </Button>
        <ButtonLink to={swapPath} variant="secondary" icon={<ArrowLeftRight />}>
          {NETWORK === 'mainnet' ? 'Tokens' : 'Swap'}
        </ButtonLink>
        <button
          type="button"
          className="pw-icon pw-balance-more"
          aria-label="More wallet actions"
          onClick={() => open('more')}
        >
          <Ellipsis aria-hidden />
        </button>
      </div>
    </WalletFocus>
  );
}

function ActivityList({
  plan,
  preview,
  allPath,
}: {
  plan?: string;
  preview?: boolean;
  allPath?: string;
}) {
  const [all, setAll] = useState(false);
  const entries = history().filter(
    (entry) => all || !plan || entry.plan === plan,
  );
  const visible = preview ? entries.slice(0, 3) : entries;
  return (
    <Card>
      <CardHeading title={preview ? 'Recent activity' : 'Transactions'}>
        {allPath ? (
          <Link to={allPath} className="pw-card-link">
            View activity <ArrowRight size={15} aria-hidden />
          </Link>
        ) : (
          <Badge>This browser</Badge>
        )}
      </CardHeading>
      {!preview && plan && (
        <div
          className="pw-filters"
          role="group"
          aria-label="Filter transactions"
        >
          <button
            type="button"
            aria-pressed={!all}
            onClick={() => setAll(false)}
          >
            This plan
          </button>
          <button type="button" aria-pressed={all} onClick={() => setAll(true)}>
            All plans
          </button>
        </div>
      )}
      {visible.length > 0 ? (
        <ul className="pw-rows">
          {visible.map((entry) => (
            <li key={entry.txid}>
              <a
                className="pw-row pw-row-link"
                href={explorerTxUrl(entry.txid, NETWORK)}
                target="_blank"
                rel="noreferrer"
              >
                <span className="pw-symbol">
                  <ArrowUpRight size={17} aria-hidden />
                </span>
                <div className="pw-row-main">
                  <strong>{entry.title}</strong>
                  <span>
                    {new Date(entry.at).toLocaleString('en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <Badge tone="success">Accepted</Badge>
                <ExternalLink size={15} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<History size={21} />}
          title="No transactions here yet"
          description="Payments, check-ins and claims you submit from this browser will appear here."
        />
      )}
    </Card>
  );
}

function Incoming({
  state,
  busy,
  prepare,
}: {
  state?: PlanState;
  busy: boolean;
  prepare: PrepareAction;
}) {
  if (!state?.inboxUtxos.length) return null;
  return (
    <Card className="pw-inline-card">
      <span className="pw-symbol pw-symbol--accent">
        <Inbox size={19} aria-hidden />
      </span>
      <div>
        <h2>{formatBch(state.inboxBalanceSats)} BCH incoming</h2>
        <p className="pw-muted">
          Collect the receipts at your receive address to make them spendable.
          A small collection may need a connected wallet to pay the network fee.
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => void prepare('sweep')}
      >
        Collect
      </Button>
    </Card>
  );
}

function ClaimNotice({
  data,
  owner,
  connected,
  busy,
  prepare,
}: {
  data: api.LoadedPlan | null;
  owner: boolean;
  connected: boolean;
  busy: boolean;
  prepare: PrepareAction;
}) {
  const state = data?.state;
  if (!data || !state) return null;
  const overdue = (state.status === 'ACTIVE' || state.status === 'CLOSED') && data.now > state.deadline;
  if (state.status !== 'REVIEW' && !overdue) return null;
  const { review, funding } = data;
  const ready = Boolean(review?.ready);
  const canPay = funding.canSelfFund || (connected && funding.canSponsor);
  let heading: string;
  let detail: string;
  if (overdue) {
    heading = owner
      ? 'Your waiting time has run out'
      : 'The owner has been inactive past the deadline';
    detail = owner
      ? 'Anyone can now open a claim. Press “I’m still here”, or send a payment, to start the waiting time again.'
      : 'Anyone can open a claim now, with no wallet of their own. The owner still gets the full review period to stop it.';
    if (!funding.canSelfFund) detail = claimFundingMessage(data, 'open this claim');
  } else if (ready) {
    heading = 'The review period has ended';
    detail = owner
      ? 'Anyone can now pay your heirs. Stop the claim if you are still here.'
      : 'Anyone can pay the heirs now. The plan pays the network fee, and each heir receives their share.';
    if (!funding.canSelfFund) detail = claimFundingMessage(data, 'pay the heirs');
  } else {
    heading = 'A claim is under review';
    detail = review?.confirmed
      ? `About ${formatDuration(BigInt(Math.max(0, review.required - review.age)))} of network review remaining. The owner can stop the claim until then.`
      : 'The review clock starts after the claim confirms on the network.';
  }
  return (
    <div className="pw-claim-banner" role="status">
      <ShieldCheck size={22} aria-hidden />
      <div>
        <strong>{heading}</strong>
        <p>{detail}</p>
      </div>
      <div className="pw-claim-banner-actions">
        {overdue && owner && state.status === 'ACTIVE' && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void prepare('checkIn')}>
            I’m still here
          </Button>
        )}
        {overdue && !owner && canPay && (
          <Button type="button" disabled={busy} onClick={() => void prepare('open')}>
            Open the claim
          </Button>
        )}
        {ready && canPay && (
          <Button type="button" variant={owner ? 'secondary' : 'primary'} disabled={busy} onClick={() => void prepare('finalize')}>
            Pay the heirs
          </Button>
        )}
        {state.status === 'REVIEW' && owner && (
          <Button type="button" variant={ready ? 'primary' : 'secondary'} disabled={busy} onClick={() => void prepare('cancel')}>
            Stop claim
          </Button>
        )}
      </div>
    </div>
  );
}

function ReceiveBch({
  metadata,
  close,
}: {
  metadata: Metadata;
  close: () => void;
}) {
  return (
    <WalletSheet
      open
      onClose={close}
      title="Receive BCH"
      description="BCH sent to this address follows your inheritance plan."
    >
      <div className="pw-sheet-stack">
        <Address
          value={metadata.inboxAddress}
          label="Copy receive address"
          full
        />
        <ButtonLink
          href={metadata.inboxAddress}
          variant="secondary"
          icon={<ArrowUpRight />}
        >
          Open in wallet
        </ButtonLink>
        <p className="pw-fine">
          Use the separate token receive address on {NETWORK === 'mainnet' ? 'Tokens' : 'Swap'} for supported
          CashTokens. Small BCH receipts may need to be collected together.
        </p>
      </div>
    </WalletSheet>
  );
}

function SavePlan({
  metadata,
  close,
}: {
  metadata: Metadata;
  close: () => void;
}) {
  return (
    <WalletSheet
      open
      onClose={close}
      title="Save your plan"
      description="Send this link to your heirs and trusted contacts, and keep the file somewhere safe."
    >
      <p className="pw-fine">
        Nobody can claim or pay out without these plan details, and Pusaka
        keeps no copy. They hold public rules and addresses only, never a key.
        Share them again after every change to the rules.
      </p>
      <div className="pw-sheet-stack">
        <div className="pw-share-link">
          <strong>Family plan link</strong>
          <CopyButton value={planLink(metadata)} label="Copy family link" />
        </div>
        <PlanDataDownload plan={metadata} />
      </div>
    </WalletSheet>
  );
}

function PlanRecovery({ record }: { record: PendingPlanSubmission }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function check() {
    setBusy(true);
    setError('');
    try {
      const { checkPlanSubmission } = await import('../../lib/chain/v2');
      const txid = await checkPlanSubmission(record);
      navigate(encodePusakaV2PlanLink(record.metadata, '/v2/plan'), { state: { txid, savePlan: true } });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeading title="Recover a plan" description="Check whether the network recorded this transaction before using the saved rules." />
      <PlanSubmissionDetails record={record} />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Button className="pw-fit" type="button" loading={busy} onClick={() => void check()}>
        Check submission
      </Button>
    </Card>
  );
}

function PlanLoading() {
  return (
    <div className="pw-columns" aria-busy="true" aria-label="Loading plan">
      <Card className="pw-loading">
        <span />
        <span />
        <span />
      </Card>
      <Card className="pw-loading">
        <span />
        <span />
        <span />
      </Card>
    </div>
  );
}

export function WalletScreen() {
  const location = useLocation();
  return (
    <WalletPage key={location.pathname + location.search + location.hash} />
  );
}

function WalletPage() {
  const location = useLocation();
  // No example plans on this network: the live ones are in the other network's app, so go straight there.
  const forwardDemo = !HAS_DEMO && OTHER_APP && isDemoRoute(location.pathname, location.search)
    ? `${OTHER_APP}${location.pathname.replace(/^\//, '')}${location.search}`
    : '';
  useEffect(() => {
    if (forwardDemo) window.location.replace(forwardDemo);
  }, [forwardDemo]);
  const { wallet } = useWallet();
  const {
    metadata,
    data,
    loading,
    error,
    demo,
    canRefresh,
    refresh,
  } = useCurrentPlan();
  const [dialog, setDialog] = useState<Dialog | null>(() =>
    location.state?.savePlan ? 'export' : null,
  );
  const [review, setReview] = useState<{
    prepared: api.Prepared;
    back: Dialog | null;
  } | null>(null);
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const [txid, setTxid] = useState<string>(() =>
    typeof location.state?.txid === 'string' ? location.state.txid : '',
  );
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const sendId = useId();
  const route = location.pathname.toLowerCase().replace(/\/$/, '');
  const inherited = route.endsWith('/plan');
  const activity = route === '/wallet/activity';
  const recoveries = route === '/wallet' && !demo ? pendingPlanSubmissions() : [];
  const title = activity ? 'Activity' : inherited ? 'Inheritance' : 'Wallet';
  const state = data?.state;
  const connectedHash =
    wallet && metadata ? planAddressHash(wallet.address) : null;
  const owner = Boolean(metadata && connectedHash === metadata.ownerPkhHex);
  const contact = Boolean(
    connectedHash && metadata?.contacts.includes(connectedHash),
  );

  function open(next: Dialog) {
    setIssue('');
    setDialog(next);
  }

  const prepare: PrepareAction = async (action, options) => {
    if (!metadata || busy) return;
    setIssue('');
    setBusy(true);
    try {
      const { prepareAction } = await import('../../lib/chain/v2');
      const prepared = await prepareAction(metadata, action, options);
      setReview({ prepared, back: dialog });
      setDialog(null);
    } catch (err) {
      setIssue(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sats = parseBch(amount);
    if (sats === null || sats <= 0n) {
      setIssue(
        'Enter an amount in BCH greater than zero with up to eight decimal places.',
      );
      return;
    }
    void prepare('send', { address: recipient.trim(), amount: sats });
  }

  let body: ReactNode;
  let inspector: ReactNode;
  let supporting: ReactNode;
  if (!HAS_DEMO && isDemoRoute(location.pathname, location.search)) {
    body = (
      <Card>
        <EmptyState
          icon={<Wallet size={21} />}
          title="The example plans are on the test network"
          description="Try the claim and payout steps there with test BCH, or set up your own protected wallet here."
        >
          {OTHER_APP && (
            <ButtonLink href={`${OTHER_APP}wallet/demo`} icon={<ArrowUpRight />}>
              Open the test-network demo
            </ButtonLink>
          )}
          <ButtonLink to="/wallet" variant="secondary">
            Open your wallet
          </ButtonLink>
        </EmptyState>
      </Card>
    );
  } else if (activity) {
    body = <ActivityList plan={metadata?.planCategoryHex} />;
  } else if (!metadata && loading) {
    body = <PlanLoading />;
  } else if (!metadata && error) {
    body = (
      <Card>
        <EmptyState
          icon={<ShieldCheck size={21} />}
          title="Can’t open this plan"
          description="Check that you have the full link, or choose a saved plan file."
        >
          <ButtonLink to="/wallet" variant="secondary">
            Back to wallet
          </ButtonLink>
        </EmptyState>
      </Card>
    );
  } else if (!metadata) {
    body = <EmptyWallet inherited={inherited} />;
    inspector = <PlanStarter />;
    if (!inherited)
      supporting = <ActivityList preview allPath="/wallet/activity" />;
  } else {
    body = (
      <>
        {metadata.protocolRevision !== CURRENT_ASSET_REVISION && (
          <div className="pw-info" role="note">
            <ShieldCheck size={17} aria-hidden />
            <p>This plan uses the earlier review contract. A payout signed and sponsored by its owner can complete before the review ends.</p>
          </div>
        )}
        <ClaimNotice data={data} owner={owner} connected={Boolean(wallet)} busy={busy} prepare={prepare} />
        {!inherited && (
          <Balance
            data={data}
            loading={loading}
            owner={owner}
            busy={busy}
            swapPath={walletPath('/wallet/swap', demo)}
            open={open}
          />
        )}
        <Incoming state={state} busy={busy} prepare={prepare} />
        {inherited && (
          <>
            <PlanPeople
              metadata={metadata}
              state={state}
              editPath={owner ? walletPath('/wallet/edit', demo) : undefined}
              contact={contact}
              busy={busy}
              prepare={prepare}
            />
            <PlanShare metadata={metadata} save={() => open('export')} />
          </>
        )}
      </>
    );
    if (!inherited) {
      supporting = (
        <>
          <Card className="pw-receive-row">
            <header className="pw-receive-heading">
              <BchMark size={24} />
              <h2>BCH receive address</h2>
            </header>
            <Address
              value={metadata.inboxAddress}
              label="Copy BCH receive address"
            />
          </Card>
          {metadata.protocolRevision && (
            <Suspense
              fallback={
                <Card
                  className="pw-loading"
                  aria-label="Loading protected assets"
                >
                  <span />
                  <span />
                </Card>
              }
            >
              <TokenAssets
                key={metadata.planCategoryHex}
                metadata={metadata}
                data={data}
                refresh={refresh}
              />
            </Suspense>
          )}
          <ActivityList
            plan={metadata.planCategoryHex}
            preview
            allPath={walletPath('/wallet/activity', demo)}
          />
        </>
      );
    }
    inspector = (
      <>
        <PlanRules
          metadata={metadata}
          data={data}
          loading={loading}
          owner={owner}
          busy={busy}
          prepare={prepare}
          planPath={inherited ? undefined : walletPath('/wallet/plan', demo)}
        />
        {inherited && data && state?.status !== 'UNINITIALIZED' && (
          <ClaimProgress data={data} connected={Boolean(wallet)} busy={busy} prepare={prepare} />
        )}
        <div className="pw-footnote">
          <ShieldCheck size={17} aria-hidden />
          <p>
            Inheritance rules apply to the assets held at your Pusaka addresses.
          </p>
        </div>
      </>
    );
  }

  return (
    <div className={`pw-page${inspector ? ' pw-page--inspected' : ''}`}>
      <div className="pw-page-body">
        <PageHeading
          title={title}
          description={
            activity
              ? 'Review transactions submitted from this browser.'
              : inherited
                ? 'Manage who inherits and how claims are reviewed.'
                : 'Manage your BCH and the inheritance plan that protects it.'
          }
        >
          <Button
            type="button"
            variant="secondary"
            icon={<FileUp />}
            onClick={() => open('import')}
          >
            Open a plan
          </Button>
          {canRefresh && !activity && (
            <Button
              type="button"
              variant="secondary"
              loading={loading}
              icon={<RefreshCw className={loading ? 'pw-spin' : undefined} />}
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
          )}
        </PageHeading>
        {demo && <DemoNotice paidOut={data?.state?.status === 'PAID_OUT'} />}
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {issue && !dialog && <ErrorNotice>{issue}</ErrorNotice>}
        {txid && <TransactionNotice txid={txid} dismiss={() => setTxid('')} />}
        {recoveries.map((record) => <PlanRecovery key={record.txid} record={record} />)}
        {body}
      </div>
      {inspector && (
        <aside className="pw-inspector" aria-label="Inheritance overview">
          {inspector}
        </aside>
      )}
      {supporting && <div className="pw-page-support">{supporting}</div>}

      <PlanImport open={dialog === 'import'} close={() => setDialog(null)} />
      {dialog === 'receive' && metadata && (
        <ReceiveBch metadata={metadata} close={() => setDialog(null)} />
      )}
      {dialog === 'export' && metadata && (
        <SavePlan metadata={metadata} close={() => setDialog(null)} />
      )}
      {dialog === 'send' && (
        <WalletSheet
          open
          title="Send BCH"
          description="Review the payment and fees before approving it in your wallet."
          dismissible={!busy}
          onClose={() => setDialog(null)}
          footer={
            <Button
              type="submit"
              form={sendId}
              loading={busy}
              icon={<ArrowRight />}
            >
              {busy ? 'Preparing…' : 'Review payment'}
            </Button>
          }
        >
          <form id={sendId} className="pw-form" onSubmit={send}>
            <label>
              Recipient address
              <input
                required
                value={recipient}
                spellCheck={false}
                autoCapitalize="off"
                disabled={busy}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setIssue('');
                }}
                placeholder={`${planAddressPrefix}…`}
              />
            </label>
            <label>
              Amount in BCH
              <input
                required
                inputMode="decimal"
                value={amount}
                disabled={busy}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setIssue('');
                }}
                placeholder="0.001"
              />
            </label>
            {issue && <ErrorNotice>{issue}</ErrorNotice>}
            <p className="pw-fine">
              Sending renews the waiting time and stops any pending claim in the
              same transaction.
            </p>
          </form>
        </WalletSheet>
      )}
      {dialog === 'more' && (
        <WalletSheet
          open
          title="Wallet actions"
          dismissible={!busy}
          onClose={() => setDialog(null)}
        >
          <div className="pw-sheet-stack">
            <Button
              type="button"
              variant="secondary"
              block
              icon={<Download />}
              disabled={busy}
              onClick={() => setDialog('export')}
            >
              Save plan data
            </Button>
            {owner && state?.status === 'REVIEW' && (
              <p className="pw-fine">Stop the claim before taking BCH back.</p>
            )}
            {owner && (state?.status === 'ACTIVE' || state?.status === 'CLOSED') && (
              <>
                <Button
                  type="button"
                  variant="danger"
                  block
                  loading={busy}
                  onClick={() => void prepare('exit')}
                >
                  Take available BCH back to Paytaca
                </Button>
                <p className="pw-fine">
                  This retires the current BCH balance. Future receipts and the
                  existing token balances remain protected by the plan.
                </p>
              </>
            )}
            {issue && <ErrorNotice>{issue}</ErrorNotice>}
          </div>
        </WalletSheet>
      )}
      {review && (
        <TransactionReview
          prepared={review.prepared}
          close={() => {
            setDialog(review.back);
            setReview(null);
          }}
          done={(id) => {
            setTxid(id);
            setReview(null);
            if (review.back === 'send') {
              setRecipient('');
              setAmount('');
            }
            void refresh();
          }}
        />
      )}
    </div>
  );
}
