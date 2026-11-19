import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Clock3,
  Download,
  HeartPulse,
  Link2,
  ShieldCheck,
  Timer,
  Users,
} from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { CopyButton } from '../../components/CopyButton';
import { formatDuration, shortAddress } from '../../lib/format';
import { p2pkhCashAddressFromPkh } from '../../lib/cashAddress';
import type * as api from '../../lib/chain/v2';
import { NETWORK } from '../../lib/networkName';
import { planLink } from '../../lib/walletData';
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
}: {
  state?: PlanState;
  loading: boolean;
}) {
  const status = state && STATUS[state.status];
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
  return (
    <Card>
      <CardHeading title="Inheritance rules">
        {planPath ? (
          <span className="pw-symbol pw-symbol--accent">
            <ShieldCheck aria-hidden size={19} />
          </span>
        ) : (
          <PlanStatus state={state} loading={loading} />
        )}
      </CardHeading>
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
          <dt>Inactivity deadline</dt>
          <dd>
            {state?.deadline
              ? `About ${formatDeadline.format(state.deadline * 1000)}`
              : loading
                ? 'Checking network…'
                : 'Unavailable'}
          </dd>
        </div>
      </dl>
      <p className="pw-fine">
        Sending BCH or pressing “I’m still here” starts the waiting time again.
      </p>
      {owner && (
        <Button
          type="button"
          variant="secondary"
          block
          icon={<HeartPulse />}
          disabled={
            busy ||
            !state?.planUtxo ||
            !['ACTIVE', 'REVIEW', 'CLOSED'].includes(state.status)
          }
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
        <span className="pw-symbol pw-symbol--accent">
          <ShieldCheck aria-hidden size={19} />
        </span>
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
          title="Your heirs"
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
            const address = p2pkhCashAddressFromPkh(
              heir.pkhHex,
              NETWORK,
            );
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
        description="Your heirs and contacts need these plan details to claim. Pusaka keeps no copy, so share the link and save the file."
      />
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
}: {
  data: api.LoadedPlan;
  busy: boolean;
  prepare: PrepareAction;
}) {
  const { state, review, now } = data;
  const hasClaim = state.status === 'REVIEW' || state.status === 'PAID_OUT';
  const paid = state.status === 'PAID_OUT';
  const steps = [
    {
      title: 'Plan is on the network',
      description: 'The inheritance rules apply to funds this plan holds.',
      done: true,
    },
    {
      title: 'Open a claim',
      description: `After inactivity or 2 contact confirmations. ${state.approvedContactIndices.length} of 3 contacts have confirmed.`,
      done: hasClaim,
    },
    {
      title: 'Wait through the review period',
      description: 'The owner can stop the claim before the payout.',
      done: paid || Boolean(review?.ready),
    },
    {
      title: 'Pay the heirs',
      description: 'Anyone can submit the payout to the listed heirs.',
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
      {['ACTIVE', 'CLOSED'].includes(state.status) && (
        <Button
          type="button"
          variant="secondary"
          block
          disabled={busy || now <= state.deadline}
          onClick={() => void prepare('open')}
        >
          Open inactivity claim
        </Button>
      )}
      {state.status === 'REVIEW' && (
        <Button
          type="button"
          block
          disabled={busy || !review?.ready}
          onClick={() => void prepare('finalize')}
        >
          Pay the heirs
        </Button>
      )}
      {paid && (
        <Button
          type="button"
          variant="secondary"
          block
          disabled={busy}
          onClick={() => void prepare('late')}
        >
          Pay late receipts
        </Button>
      )}
    </Card>
  );
}
