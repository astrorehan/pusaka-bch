import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '../../components/Button';
import type * as api from '../../lib/chain/v2';
import { demoTxids } from '../../lib/demo';
import { altExplorerTxUrl, explorerTxUrl, formatDate, formatDuration } from '../../lib/format';
import { NETWORK, OTHER_APP } from '../../lib/networkName';
import type { PrepareAction } from './PlanOverview';
import { Card } from './WalletUi';

type Step = { title: string; detail: ReactNode; state: 'done' | 'now' | 'later'; txid?: string; action?: ReactNode };

function TxLink({ txid }: { txid: string }) {
  const alt = altExplorerTxUrl(txid, NETWORK);
  return (
    <>
      <a href={explorerTxUrl(txid, NETWORK)} target="_blank" rel="noreferrer">
        View transaction <ExternalLink size={12} aria-hidden />
      </a>
      {alt && (
        <>
          {' '}
          <a className="pw-story-alt" href={alt} target="_blank" rel="noreferrer">
            or here <ExternalLink size={12} aria-hidden />
          </a>
        </>
      )}
    </>
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
  exhausted,
  onNext,
}: {
  metadata: api.PusakaV2PlanMetadata;
  data: api.LoadedPlan;
  busy: boolean;
  prepare: PrepareAction;
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
  const { created, claim } = demoTxids(metadata.planCategoryHex);
  const short = (
    <p className="pw-fine">
      This example doesn’t have enough BCH left to cover the fee.{' '}
      {!exhausted && (
        <button type="button" className="pw-link-button" onClick={onNext}>
          Try another example <ArrowRight aria-hidden size={14} />
        </button>
      )}
    </p>
  );

  const steps: Step[] = [
    {
      title: 'Plan created',
      detail: `On ${formatDate(BigInt(metadata.createdAtLocktime))}, the owner picked ${heirs} heirs and 3 trusted contacts.`,
      state: 'done',
      txid: created,
    },
    {
      title: 'Owner went quiet',
      detail: paid || reviewing || overdue
        ? `They didn’t send anything for ${waiting}. We kept it short for the demo. A real plan waits months.`
        : `The wait ends on ${formatDate(BigInt(state.deadline))}.`,
      state: paid || reviewing || overdue ? 'done' : 'later',
    },
    {
      title: overdue ? 'Your turn: open the claim' : 'Claim opened',
      detail: overdue
        ? 'Anyone can do this, no wallet needed. The owner can still stop it during the review.'
        : 'Once the wait was over, anyone could open a claim. Someone did.',
      state: paid || reviewing ? 'done' : overdue ? 'now' : 'later',
      // While the claim is open, its anchor sits at the opening transaction; after the payout, the record has it.
      txid: reviewing ? state.anchorUtxo?.txid ?? claim : paid ? claim : undefined,
      action: overdue && (canAct
        ? <Button type="button" disabled={busy} onClick={() => void prepare('open', { selfFunded: true })}>Open the claim</Button>
        : short),
    },
    {
      title: 'Review ended',
      detail: paid || ready
        ? `The owner had ${reviewTime} to stop the claim, and didn’t.`
        : reviewing
          ? review?.confirmed
            ? `About ${formatDuration(BigInt(Math.max(0, review.required - review.age)))} to go. Until then, the network won’t let anyone pay out.`
            : 'The review starts once the claim makes it into a block.'
          : `The owner will get ${reviewTime} to stop the claim.`,
      state: paid || ready ? 'done' : reviewing ? 'now' : 'later',
    },
    {
      title: paid ? 'Heirs paid' : ready ? 'Your turn: pay the heirs' : 'Heirs get paid',
      detail: paid
        ? `All ${heirs} heirs got their share in one transaction.`
        : ready
          ? `You’ll see what each heir gets before anything is sent. It’s one real ${mainnet ? 'BCH' : 'test BCH'} transaction, and the plan pays the fee.`
          : 'All in one transaction, split by their shares.',
      state: paid ? 'done' : ready ? 'now' : 'later',
      // The payout moved the plan's state on: its current location is the payout transaction.
      txid: paid ? state.planUtxo?.txid : undefined,
      action: ready && !paid && (canAct
        ? <Button type="button" disabled={busy} icon={<ArrowUpRight />} onClick={() => void prepare('finalize', { selfFunded: true })}>Pay the heirs</Button>
        : short),
    },
  ];

  return (
    <Card className="pw-story" aria-labelledby="pw-story-title">
      <header className="pw-story-heading">
        <span className="pw-story-eyebrow">
          {mainnet ? 'Live on Bitcoin Cash' : 'Live on Chipnet · test BCH'}
        </span>
        <h2 id="pw-story-title">{paid ? `All ${heirs} heirs have been paid` : 'Pay out a real inheritance'}</h2>
        <p>
          The family is made up, but the {mainnet ? 'BCH is real' : 'plan is real'}. The owner stopped using this wallet,
          so now the heirs can be paid. You don’t need a wallet, and the plan covers the fee.
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
      {!paid && !ready && mainnet && OTHER_APP && (
        <p className="pw-fine">
          Every ready example was just used, and this one needs a few more minutes. Want to pay out right now
          instead?{' '}
          <a href={`${OTHER_APP}wallet/demo`}>
            Try it on Chipnet <ArrowUpRight aria-hidden size={14} />
          </a>
        </p>
      )}
      {paid && (
        <p className="pw-story-next">
          {!exhausted ? (
            <Button type="button" variant="secondary" icon={<ArrowRight />} onClick={onNext}>
              Open the next example
            </Button>
          ) : (
            <>
              <span>All the examples have been paid out.</span>
              <Button type="button" variant="secondary" icon={<RefreshCw />} onClick={() => window.location.reload()}>
                Check for new ones
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
          Want to try it from the start?{' '}
          <Link to="/wallet/new">Create your own plan</Link> with Paytaca or Cashonize.
        </span>
        <Link to="/wallet">
          Exit demo <ArrowRight aria-hidden size={14} />
        </Link>
      </footer>
    </Card>
  );
}
