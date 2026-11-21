import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Clock3,
  Download,
  HeartPulse,
  Link2,
  RefreshCw,
  ShieldCheck,
  Timer,
  Users,
} from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { CopyButton } from '../../components/CopyButton';
import { Logo } from '../../components/Logo';
import { QrCode } from '../../components/QrCode';
import { formatDuration, shortAddress } from '../../lib/format';
import { p2pkhCashAddressFromPkh } from '../../lib/cashAddress';
import type * as api from '../../lib/chain/v2';
import { NETWORK } from '../../lib/networkName';
import { planLink } from '../../lib/walletData';
import { claimFundingMessage } from './currentPlan';
import { Badge, Card, CardHeading } from './WalletUi';

export type PrepareAction = (
  action: api.Action,
  options?: Parameters<typeof api.prepareAction>[2],
) => Promise<void>;
type Metadata = api.PusakaV2PlanMetadata;
type PlanState = api.LoadedPlan['state'];

const STATUS: Record<
  PlanState['status'],
  { label: string; tone: 'neutral' | 'success' | 'warning' }
> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  REVIEW: { label: 'Under review', tone: 'warning' },
  PAID_OUT: { label: 'Paid to heirs', tone: 'success' },
  CLOSED: { label: 'Funds taken back', tone: 'neutral' },
  UNINITIALIZED: { label: 'Not found', tone: 'neutral' },
};

export function PlanStatus({
  state,
  loading,
  reviewEnded = false,
  payable = true,
}: {
  state?: PlanState;
  loading: boolean;
  /** The review delay has passed. */
  reviewEnded?: boolean;
  /** The plan can pay the payout's network fee itself, so anyone can pay the heirs now. */
  payable?: boolean;
}) {
  const status =
    state?.status === 'REVIEW' && reviewEnded
      ? { label: payable ? 'Ready to pay heirs' : 'Review ended', tone: 'warning' as const }
      : state && STATUS[state.status];
  return (
    <Badge tone={status?.tone} dot>
      {status?.label ?? (loading ? 'Checking network' : 'Status unavailable')}
    </Badge>
  );
}
const formatDeadline = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function ShareBreakdown({ shares }: { shares: number[] }) {
  return (
    <div className="pw-share-bar" aria-hidden>
      {shares.map((share, i) => (
        <span
          key={i}
          style={{ flexGrow: share, background: `var(--heir-${(i % 5) + 1})` }}
        />
      ))}
    </div>
  );
}

function PlanMap({ metadata }: { metadata: Metadata }) {
  const count = metadata.heirs.length;
  const contacts = metadata.contacts.length;
  const shown = metadata.heirs.slice(0, 4);
  return (
    <div className="pw-plan-map">
      <div className="pw-plan-map-visual" aria-hidden>
        <span className="pw-plan-map-root">
          <Logo size={27} />
        </span>
        <div className="pw-plan-map-leaves">
          {shown.map((heir, i) => (
            <span
              key={i}
              title={heir.label || `Heir ${i + 1}`}
              style={{ color: `var(--heir-${i + 1})` }}
            >
              {heir.label?.trim()[0]?.toUpperCase() || <Users size={15} />}
            </span>
          ))}
          {count > shown.length && <span>+{count - shown.length}</span>}
        </div>
      </div>
      <div className="pw-plan-map-counts">
        <span>
          <strong>{count}</strong> {count === 1 ? 'heir' : 'heirs'}
        </span>
        <span>
          <strong>{contacts}</strong> trusted contacts
        </span>
      </div>
    </div>
  );
}

export function PlanRules({
  metadata,
  data,
  loading,
  owner,
  busy,
  prepare,
  planPath,
}: {
  metadata: Metadata;
  data: api.LoadedPlan | null;
  loading: boolean;
  owner: boolean;
  busy: boolean;
  prepare: PrepareAction;
  planPath?: string;
}) {
  const state = data?.state;
  const canCheckIn =
    state && ['ACTIVE', 'REVIEW', 'CLOSED'].includes(state.status);
  return (
    <Card>
      <CardHeading title={planPath ? 'Inheritance plan' : 'Inheritance rules'}>
        <PlanStatus state={state} loading={loading} reviewEnded={Boolean(data?.review?.ready)} payable={Boolean(data?.funding.canSelfFund)} />
      </CardHeading>
      {planPath && <PlanMap metadata={metadata} />}
      <dl className="pw-rules">
        <div>
          <Clock3 aria-hidden />
          <dt>Waiting time</dt>
          <dd>{formatDuration(BigInt(metadata.inactivityPeriodSeconds))}</dd>
        </div>
        <div>
          <ShieldCheck aria-hidden />
          <dt>Claim review</dt>
          <dd>
            About {formatDuration(BigInt(metadata.effectiveReviewSeconds))}
          </dd>
        </div>
        <div>
          <Timer aria-hidden />
          <dt>
            {state?.status === 'PAID_OUT'
              ? 'Last inactivity deadline'
              : state?.deadline && data && data.now > state.deadline
                ? 'Inactivity deadline (passed)'
                : 'Inactivity deadline'}
          </dt>
          <dd>
            {state?.deadline
              ? `About ${formatDeadline.format(state.deadline * 1000)}`
              : loading
                ? 'Checking network…'
                : 'Unavailable'}
          </dd>
        </div>
      </dl>
      {owner && canCheckIn && (
        <p className="pw-fine">
          Press “I’m still here” to start the waiting time again.
        </p>
      )}
      {owner && (
        <Button
          type="button"
          variant="secondary"
          block
          icon={<HeartPulse />}
          disabled={busy || !state?.planUtxo || !canCheckIn}
          onClick={() => void prepare('checkIn')}
        >
          I’m still here
        </Button>
      )}
      {planPath && (
        <Link className="pw-card-link" to={planPath}>
          Manage inheritance <ArrowRight size={16} aria-hidden />
        </Link>
      )}
    </Card>
  );
}

export function PlanStarter() {
  return (
    <Card>
      <CardHeading title="Inheritance plan">
        <Badge>Not set up</Badge>
      </CardHeading>
      <p className="pw-muted">
        Decide who receives the BCH you keep in Pusaka.
      </p>
      <ul className="pw-steps-list">
        <li>
          <span className="pw-symbol">
            <Users size={17} aria-hidden />
          </span>
          <div>
            <strong>Choose your heirs</strong>
            <p>Split the balance among the people you name.</p>
          </div>
        </li>
        <li>
          <span className="pw-symbol">
            <Clock3 size={17} aria-hidden />
          </span>
          <div>
            <strong>Set your waiting time</strong>
            <p>Pick trusted contacts and allow time to stop a claim.</p>
          </div>
        </li>
        <li>
          <span className="pw-symbol">
            <ShieldCheck size={17} aria-hidden />
          </span>
          <div>
            <strong>Review and fund</strong>
            <p>Approve the rules and initial transfer in your wallet.</p>
          </div>
        </li>
      </ul>
      <Link className="pw-card-link" to="/how-it-works">
        How inheritance works <ArrowRight aria-hidden size={16} />
      </Link>
    </Card>
  );
}

export function PlanPeople({
  metadata,
  state,
  editPath,
  contact,
  busy,
  prepare,
}: {
  metadata: Metadata;
  state?: PlanState;
  editPath?: string;
  contact: boolean;
  busy: boolean;
  prepare: PrepareAction;
}) {
  const shares = metadata.heirs.map(
    (heir) => (Number(heir.share) / Number(metadata.totalShares)) * 100,
  );
  return (
    <>
      <Card>
        <CardHeading
          title={editPath ? 'Your heirs' : 'Heirs'}
          description="These shares apply to the BCH and supported tokens held by this plan."
        >
          <Badge>
            {metadata.heirs.length}{' '}
            {metadata.heirs.length === 1 ? 'heir' : 'heirs'}
          </Badge>
        </CardHeading>
        <ShareBreakdown shares={shares} />
        <ul className="pw-rows">
          {metadata.heirs.map((heir, i) => {
            const address = p2pkhCashAddressFromPkh(heir.pkhHex, NETWORK);
            const name = heir.label || `Heir ${i + 1}`;
            return (
              <li className="pw-row" key={i}>
                <span
                  className="pw-symbol pw-heir-avatar"
                  style={{ color: `var(--heir-${(i % 5) + 1})` }}
                  aria-hidden
                >
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <div className="pw-row-main">
                  <strong>{name}</strong>
                  <span className="mono" title={address}>
                    {shortAddress(address)}
                  </span>
                </div>
                <strong className="num">
                  {shares[i].toLocaleString('en-US', {
                    maximumFractionDigits: 2,
                  })}
                  %
                </strong>
                <CopyButton value={address} label={`Copy ${name}’s address`} />
              </li>
            );
          })}
        </ul>
        {editPath && (
          <ButtonLink to={editPath} variant="secondary" className="pw-fit">
            Edit inheritance rules
          </ButtonLink>
        )}
      </Card>
      <Card>
        <CardHeading
          title="Trusted contacts"
          description="Any two can open a claim review. Only the owner can spend or change the plan."
        >
          <Badge>2 of 3 required</Badge>
        </CardHeading>
        <ul className="pw-rows">
          {metadata.contacts.map((pkh, i) => {
            const address = p2pkhCashAddressFromPkh(pkh, NETWORK);
            const confirmed = state?.approvedContactIndices.includes(i);
            return (
              <li className="pw-row" key={pkh}>
                <span className="pw-symbol">
                  <Users aria-hidden size={17} />
                </span>
                <div className="pw-row-main">
                  <strong>Contact {i + 1}</strong>
                  <span className="mono" title={address}>
                    {shortAddress(address)}
                  </span>
                </div>
                {state && (
                  <Badge tone={confirmed ? 'success' : 'neutral'}>
                    {confirmed ? 'Confirmed' : 'No confirmation'}
                  </Badge>
                )}
                <CopyButton
                  value={address}
                  label={`Copy contact ${i + 1} address`}
                />
              </li>
            );
          })}
        </ul>
        {contact && (
          <Button
            type="button"
            variant="secondary"
            className="pw-fit"
            disabled={
              busy || !state || !['ACTIVE', 'CLOSED'].includes(state.status)
            }
            onClick={() => void prepare('approve')}
          >
            Confirm a claim
          </Button>
        )}
      </Card>
    </>
  );
}

export function ReviewReadiness({
  review,
  loading = false,
  onRefresh,
}: {
  review: NonNullable<api.LoadedPlan['review']>;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const remaining = Math.max(0, review.required - review.age);
  const pct = review.confirmed && review.required > 0
    ? Math.min(100, Math.round((review.age / review.required) * 100))
    : 0;
  return (
    <div className="pw-review-meter" role="status" aria-live="polite">
      <div className="pw-review-meter__top">
        <span className="pw-review-meter__label num">
          {review.confirmed
            ? `${pct}% of review elapsed · about ${formatDuration(BigInt(remaining))} left`
            : 'Waiting for first block confirmation'}
        </span>
        {onRefresh && (
          <button
            type="button"
            className="pw-link-button pw-review-meter__refresh"
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCw size={13} className={loading ? 'pw-spin' : undefined} aria-hidden />
            {loading ? 'Checking…' : 'Check now'}
          </button>
        )}
      </div>
      <div
        className={`pw-review-meter__track${!review.confirmed ? ' pw-review-meter__track--pending' : ''}`}
        role="progressbar"
        aria-label="Review period progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span className="pw-review-meter__fill" style={{ width: `${Math.max(review.confirmed ? 4 : 18, pct)}%` }} />
      </div>
      <p className="pw-review-meter__note">
        Auto-checks the network every 30s. Bitcoin Cash follows median block time, so remaining time is approximate.
      </p>
    </div>
  );
}

export function FamilyShareCard({
  metadata,
  compact = false,
}: {
  metadata: Metadata;
  compact?: boolean;
}) {
  const link = planLink(metadata);
  const heirs = metadata.heirs.length;
  const networkLabel = metadata.network === 'mainnet' ? 'Bitcoin Cash Mainnet' : 'Chipnet testnet';
  return (
    <div className={`pw-share-card${compact ? ' pw-share-card--compact' : ''}`}>
      <div className="pw-share-card__head">
        <span className="pw-share-card__brand">
          <Logo size={20} />
          <strong>Pusaka family plan card</strong>
        </span>
        <Badge tone={metadata.network === 'mainnet' ? 'success' : 'warning'}>{networkLabel}</Badge>
      </div>
      <p className="pw-share-card__meta">
        {heirs} {heirs === 1 ? 'heir' : 'heirs'} · {metadata.contacts.length} trusted contacts ·{' '}
        {formatDuration(BigInt(metadata.inactivityPeriodSeconds))} wait · about{' '}
        {formatDuration(BigInt(metadata.effectiveReviewSeconds))} review
      </p>
      <QrCode
        value={link}
        copyValue={link}
        size={compact ? 176 : 196}
        quietZone={10}
        errorCorrection="L"
        label="Family plan link QR code"
        copyHint="Tap QR to copy plan link"
        className="pw-share-card__qr"
      />
      <p className="pw-share-card__note">
        Screenshot and send to your heirs or trusted contacts so they can scan and open this plan. Public rules and
        addresses only, never a private key.
      </p>
    </div>
  );
}

export function PlanShare({
  metadata,
  save,
}: {
  metadata: Metadata;
  save: () => void;
}) {
  return (
    <Card>
      <CardHeading
        title="Share & recovery"
        description="Your heirs and contacts need these plan details to claim. Pusaka keeps no copy, so share the card or link and save the file."
      />
      <FamilyShareCard metadata={metadata} />
      <div className="pw-share-link">
        <span className="pw-symbol" aria-hidden>
          <Link2 size={18} />
        </span>
        <div>
          <strong>Family plan link</strong>
          <p>View balances, heirs, and claim progress.</p>
        </div>
        <CopyButton value={planLink(metadata)} label="Copy plan link" />
      </div>
      <Button
        type="button"
        variant="secondary"
        className="pw-fit"
        icon={<Download />}
        onClick={save}
      >
        Save plan data
      </Button>
    </Card>
  );
}

export function ClaimProgress({
  data,
  busy,
  prepare,
  connected,
  loading = false,
  onRefresh,
}: {
  data: api.LoadedPlan;
  busy: boolean;
  prepare: PrepareAction;
  connected: boolean;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const { state, review, now, funding } = data;
  const hasClaim = state.status === 'REVIEW' || state.status === 'PAID_OUT';
  const paid = state.status === 'PAID_OUT';
  const ready = Boolean(review?.ready);
  const approvals = state.approvedContactIndices.length;
  const canPay = funding.canSelfFund || (connected && funding.canSponsor);
  const steps = [
    {
      title: 'Plan is on the network',
      description: 'The inheritance rules apply to funds this plan holds.',
      done: true,
    },
    {
      title: 'Open a claim',
      description:
        state.status === 'REVIEW'
          ? approvals >= 2
            ? 'Opened by two trusted contacts.'
            : 'Opened after the inactivity deadline passed.'
          : paid
            ? 'A claim was opened and reviewed.'
            : now > state.deadline
              ? 'The waiting time has passed. Anyone can open a claim now.'
              : `About ${formatDuration(BigInt(Math.max(0, state.deadline - now)))} until anyone can open a claim, or two trusted contacts can open one sooner. ${approvals} of 3 have confirmed.`,
      done: hasClaim,
    },
    {
      title: 'Wait through the review period',
      description:
        review?.confirmed && !ready
          ? `About ${formatDuration(BigInt(Math.max(0, review.required - review.age)))} left. The owner can stop the claim until the payout.`
          : 'The owner can stop the claim before the payout.',
      done: paid || ready,
    },
    {
      title: 'Pay the heirs',
      description:
        'Anyone can submit the payout to the listed heirs once the review is complete and the plan has enough BCH.',
      done: paid,
    },
  ];
  const next = steps.findIndex((step) => !step.done);
  return (
    <Card>
      <CardHeading title="Claim progress" />
      <ol className="pw-timeline">
        {steps.map(({ title, description, done }, i) => (
          <li
            key={title}
            className={done ? 'pw-timeline-done' : undefined}
            aria-current={i === next ? 'step' : undefined}
          >
            <span className="pw-timeline-dot" aria-hidden>
              {done ? <Check size={13} /> : i + 1}
            </span>
            <div>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          </li>
        ))}
      </ol>
      {state.status === 'REVIEW' && !ready && review && (
        <ReviewReadiness review={review} loading={loading} onRefresh={onRefresh} />
      )}
      {(state.status === 'ACTIVE' || state.status === 'CLOSED') && (
        <>
          {!funding.canSelfFund && (
            <p className="pw-fine">
              {claimFundingMessage(data, 'open this claim')}
            </p>
          )}
          <Button
            type="button"
            variant={now > state.deadline ? 'primary' : 'secondary'}
            block
            disabled={busy || now <= state.deadline || !canPay}
            onClick={() => void prepare('open')}
          >
            Open inactivity claim
          </Button>
        </>
      )}
      {state.status === 'REVIEW' && (
        <>
          {!funding.canSelfFund && <p className="pw-fine">{claimFundingMessage(data, 'pay the heirs')}</p>}
          <Button
            type="button"
            block
            disabled={busy || !ready || !canPay}
            onClick={() => void prepare('finalize')}
          >
            Pay the heirs
          </Button>
        </>
      )}
      {paid &&
        (canPay ? (
          <Button
            type="button"
            variant="secondary"
            block
            disabled={busy}
            onClick={() => void prepare('late')}
          >
            Pay late receipts
          </Button>
        ) : (
          <p className="pw-fine">
            {funding.canSponsor
              ? claimFundingMessage(data, 'pay late receipts')
              : 'BCH that arrives later at this plan can be paid to the heirs once every share covers the minimum payment.'}
          </p>
        ))}
    </Card>
  );
}
