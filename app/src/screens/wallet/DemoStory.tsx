import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '../../components/Button';
import type * as api from '../../lib/chain/v2';
import { demoCreatedTxid } from '../../lib/demo';
import { explorerTxUrl, formatDate, formatDuration } from '../../lib/format';
import { NETWORK, OTHER_APP } from '../../lib/networkName';
import type { PrepareAction } from './PlanOverview';
import { Card } from './WalletUi';

type Step = { title: string; detail: ReactNode; state: 'done' | 'now' | 'later'; txid?: string; action?: ReactNode };

function TxLink({ txid }: { txid: string }) {
  return (
    <a href={explorerTxUrl(txid, NETWORK)} target="_blank" rel="noreferrer">
      View transaction <ExternalLink size={12} aria-hidden />
    </a>
  );
}

/**
 * The demo's first screen: what already happened to this example plan, step by step with its real
 * transactions, and the one step left for the visitor. The visitor plays the family, so they start at the end.
 */
export function DemoStory({
  metadata,
  data,
  busy,
  prepare,
  txid,
  exhausted,
  onNext,
}: {
  metadata: api.PusakaV2PlanMetadata;
  data: api.LoadedPlan;
  busy: boolean;
  prepare: PrepareAction;
  /** A payout this visitor sent from this page. */
  txid: string;
  exhausted: boolean;
  onNext: () => void;
}) {
  const { state, review, now, funding } = data;
  const heirs = metadata.heirs.length;
  const mainnet = NETWORK === 'mainnet';
  const paid = state.status === 'PAID_OUT';
  const reviewing = state.status === 'REVIEW';
  const overdue = (state.status === 'ACTIVE' || state.status === 'CLOSED') && now > state.deadline;
  const ready = Boolean(review?.ready);
  const canAct = funding.canSelfFund;
  const waiting = formatDuration(BigInt(metadata.inactivityPeriodSeconds));
  const reviewTime = formatDuration(BigInt(metadata.effectiveReviewSeconds));
  const created = demoCreatedTxid(metadata.planCategoryHex);
  const short = (
    <p className="pw-fine">
      This example no longer holds enough BCH to pay its own network fee.{' '}
      {!exhausted && (
        <button type="button" className="pw-link-button" onClick={onNext}>
          Open another example <ArrowRight aria-hidden size={14} />
        </button>
      )}
    </p>
  );

  const steps: Step[] = [
    {
      title: 'The owner made a plan',
      detail: `On ${formatDate(BigInt(metadata.createdAtLocktime))}: ${heirs} heirs with their shares, three trusted contacts, a waiting time and a review period.`,
      state: 'done',
      txid: created,
    },
    {
      title: 'The owner went quiet',
      detail: paid || reviewing || overdue
        ? `No payment or check-in for the whole waiting time. It is ${waiting} in this example so you can see the end; a real plan waits months.`
        : `The waiting time runs until ${formatDate(BigInt(state.deadline))}.`,
      state: paid || reviewing || overdue ? 'done' : 'later',
    },
    {
      title: overdue ? 'Your turn: open the claim' : 'A claim was opened',
      detail: overdue
        ? 'Anyone may open it now, without a wallet. It starts the review; the owner can still stop it.'
        : 'Once the waiting time ran out, anyone could open it. That started the review.',
      state: paid || reviewing ? 'done' : overdue ? 'now' : 'later',
      txid: reviewing ? state.anchorUtxo?.txid : undefined,
      action: overdue && (canAct
        ? <Button type="button" disabled={busy} onClick={() => void prepare('open', { selfFunded: true })}>Open the claim</Button>
        : short),
    },
    {
      title: 'The review ended',
      detail: paid || ready
        ? `The owner had ${reviewTime} to press Stop claim and did not. The network enforced that time.`
        : reviewing
          ? review?.confirmed
            ? `About ${formatDuration(BigInt(Math.max(0, review.required - review.age)))} left. The network refuses a payout before then.`
            : 'The review clock starts once the claim is confirmed in a block.'
          : `The owner gets ${reviewTime} to stop the claim.`,
      state: paid || ready ? 'done' : reviewing ? 'now' : 'later',
    },
    {
      title: paid ? 'The heirs were paid' : ready ? 'Your turn: pay the heirs' : 'The heirs are paid',
      detail: paid
        ? `One transaction paid each of the ${heirs} heirs their share.`
        : ready
          ? `Press Pay the heirs to review each heir’s amount, then Send transaction. One real ${mainnet ? 'BCH' : 'test BCH'} transaction; the plan pays the fee.`
          : 'In one transaction, by their shares.',
      state: paid ? 'done' : ready ? 'now' : 'later',
      txid: paid ? txid || state.planUtxo?.txid : undefined,
      action: ready && !paid && (canAct
        ? <Button type="button" disabled={busy} icon={<ArrowUpRight />} onClick={() => void prepare('finalize', { selfFunded: true })}>Pay the heirs</Button>
        : short),
    },
  ];

  return (
    <Card className="pw-story" aria-labelledby="pw-story-title">
      <header className="pw-story-heading">
        <span className="pw-story-eyebrow">
          {mainnet ? 'Live demo · Bitcoin Cash mainnet' : 'Live demo · Chipnet, the test network'}
        </span>
        <h2 id="pw-story-title">{paid ? `This plan paid its ${heirs} heirs` : `Pay ${heirs} heirs from a real inheritance plan`}</h2>
        <p>
          A sample family’s plan, live on {mainnet ? 'Bitcoin Cash' : 'Chipnet'}. Its owner set it up, then went quiet.
          You play the family. No wallet needed{mainnet ? ': the plan pays the network fee from its own BCH' : ''}.
        </p>
      </header>
      <ol className="pw-story-steps">
        {steps.map((step) => (
          <li key={step.title} className={`pw-story-step pw-story-step--${step.state}`} aria-current={step.state === 'now' ? 'step' : undefined}>
            <span className="pw-story-mark" aria-hidden>{step.state === 'done' ? <Check size={14} /> : null}</span>
            <div>
              <strong>{step.title}</strong>
              <p>
                {step.detail}
                {step.txid && <> <TxLink txid={step.txid} /></>}
              </p>
              {step.action && <div className="pw-story-action">{step.action}</div>}
            </div>
          </li>
        ))}
      </ol>
      {paid && (
        <p className="pw-story-next">
          {!exhausted ? (
            <Button type="button" variant="secondary" icon={<ArrowRight />} onClick={onNext}>
              Open the next example
            </Button>
          ) : (
            <>
              <span>Every example here has paid its heirs.</span>
              <Button type="button" variant="secondary" icon={<RefreshCw />} onClick={() => window.location.reload()}>
                Check for new examples
              </Button>
              {mainnet && OTHER_APP && (
                <a href={`${OTHER_APP}wallet/demo`}>
                  Try it on Chipnet <ArrowUpRight aria-hidden size={14} />
                </a>
              )}
            </>
          )}
        </p>
      )}
      <footer className="pw-story-footer">
        <span>
          Want to start from the beginning?{' '}
          <Link to="/wallet/new">Create your own plan</Link> with Paytaca or Cashonize.
        </span>
        <Link to="/wallet">
          Exit demo <ArrowRight aria-hidden size={14} />
        </Link>
      </footer>
    </Card>
  );
}
