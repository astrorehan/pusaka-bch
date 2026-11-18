import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Coins,
  FlaskConical,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { Utxo } from '@solidcash/solidcash';
import { Button, ButtonLink } from '../../components/Button';
import * as api from '../../lib/chain/v2';
import { formatBch } from '../../lib/format';
import { useWallet } from '../../lib/wallet';
import { planAddressHash, useCurrentPlan } from './currentPlan';
import { walletPath } from './paths';
import {
  Address,
  Badge,
  BchMark,
  Card,
  CardHeading,
  DemoNotice,
  Details,
  EmptyState,
  ErrorNotice,
  PageHeading,
  TransactionNotice,
  TransactionReview,
  WalletSheet,
} from './WalletUi';

type Metadata = api.PusakaV2PlanMetadata;

export function SwapScreen() {
  const { data, metadata, demo, loading, refresh, error } = useCurrentPlan();
  const supported = api.NETWORK === 'chipnet' && Boolean(api.testPair.category);

  return (
    <div className="pw-page">
      <PageHeading
        title="Swap"
        description="Swap BCH for a supported token that stays under your inheritance rules."
      >
        <ButtonLink
          to={walletPath('/wallet', demo)}
          variant="secondary"
          icon={<Wallet />}
        >
          Back to wallet
        </ButtonLink>
      </PageHeading>
      {demo && <DemoNotice />}
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="pw-columns">
        <div className="pw-column">
          <Card>
            <CardHeading
              title="Swap BCH for PSK"
              description={
                supported
                  ? 'PSK is a test token with no monetary value.'
                  : 'Exchange BCH directly from Pusaka.'
              }
            >
              {supported && (
                <Badge tone="warning">
                  <FlaskConical size={13} aria-hidden /> Test pair
                </Badge>
              )}
            </CardHeading>
            {!supported ? (
              <EmptyState
                icon={<ArrowLeftRight size={21} />}
                title="No mainnet swap pairs yet"
                description="The PSK test pair is available in the Chipnet app."
              />
            ) : !metadata ? (
              <EmptyState
                icon={<Wallet size={21} />}
                title={
                  loading ? 'Loading your wallet' : 'Open a wallet to swap'
                }
                description="A Pusaka wallet holds the BCH you spend and the tokens you receive."
              >
                {!loading && <ButtonLink to="/wallet">Go to wallet</ButtonLink>}
              </EmptyState>
            ) : metadata.protocolRevision !== 'assets-1' ? (
              <EmptyState
                icon={<Coins size={21} />}
                title="This wallet supports BCH"
                description="Protected tokens require a new Pusaka wallet. Your existing wallet can still hold and send BCH."
              />
            ) : (
              <SwapForm
                key={metadata.planCategoryHex}
                metadata={metadata}
                data={data}
                loading={loading}
                refresh={refresh}
              />
            )}
          </Card>
          {metadata?.protocolRevision === 'assets-1' && (
            <TokenAssets
              key={metadata.planCategoryHex}
              metadata={metadata}
              data={data}
              refresh={refresh}
            />
          )}
        </div>
        <aside className="pw-column">
          <Card>
            <CardHeading title="Protected after the swap">
              <span className="pw-symbol pw-symbol--accent">
                <ShieldCheck size={19} aria-hidden />
              </span>
            </CardHeading>
            <p className="pw-muted">
              Tokens go to a receive address tied to this plan. If a claim
              completes, they follow the same shares as your BCH.
            </p>
            <div className="pw-footnote">
              <Coins aria-hidden size={16} />
              <p>
                Token amounts are whole base units. Any remainder goes to the
                last listed heir.
              </p>
            </div>
            <a
              className="pw-card-link"
              href="https://docs.riftenlabs.com/cauldron/swap/"
              target="_blank"
              rel="noreferrer"
            >
              About Cauldron swaps <ArrowUpRight size={15} aria-hidden />
            </a>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SwapForm({
  metadata,
  data,
  loading,
  refresh,
}: {
  metadata: Metadata;
  data: api.LoadedPlan | null;
  loading: boolean;
  refresh: () => Promise<void>;
}) {
  const { wallet } = useWallet();
  const [amount, setAmount] = useState('0.00005');
  const [slippage, setSlippage] = useState('0.5');
  const [quote, setQuote] = useState<api.Quote | null>(null);
  const [prepared, setPrepared] = useState<api.Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [txid, setTxid] = useState('');
  const state = data?.state;
  const owner =
    wallet && planAddressHash(wallet.address) === metadata.ownerPkhHex;
  let reviewBlocked = '';
  if (state?.status === 'REVIEW')
    reviewBlocked = 'Stop the pending claim in Inheritance before swapping.';
  else if (state && state.status !== 'ACTIVE')
    reviewBlocked = 'The plan must be active to approve a swap.';
  else if (!owner)
    reviewBlocked =
      'Connect the wallet that owns this plan to approve the swap.';
  else if (state && quote && quote.supply > state.spendableBalanceSats)
    reviewBlocked = 'The BCH amount exceeds your spendable balance.';

  useEffect(() => {
    if (!quote) return;
    const timer = window.setTimeout(
      () => {
        setQuote(null);
        setIssue('This quote expired. Get a new quote to continue.');
      },
      Math.max(0, quote.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [quote]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || busy || (quote && reviewBlocked)) return;
    setBusy(true);
    setIssue('');
    try {
      if (quote) setPrepared(await api.prepareSwap(metadata, quote));
      else {
        const sats = api.parseBch(amount.trim());
        if (sats <= 0n)
          throw new Error('Enter a BCH amount greater than zero.');
        setQuote(
          await api.getSwapQuote(sats, Math.round(Number(slippage) * 100)),
        );
      }
    } catch (error) {
      setIssue(error instanceof Error ? error.message : String(error));
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }

  function clearQuote() {
    setQuote(null);
    setIssue('');
  }

  return (
    <>
      <form className="pw-form pw-swap-form" onSubmit={submit}>
        <div className="pw-swap-pair">
          <div className="pw-swap-field">
            <label htmlFor="pw-swap-amount">You pay</label>
            <div className="pw-swap-value">
              <input
                id="pw-swap-amount"
                inputMode="decimal"
                required
                value={amount}
                disabled={busy}
                onChange={(event) => {
                  setAmount(event.target.value);
                  clearQuote();
                }}
              />
              <span className="pw-currency">
                <BchMark size={23} /> BCH
              </span>
            </div>
            <small>
              {state
                ? `Available: ${formatBch(state.spendableBalanceSats)} BCH`
                : loading
                  ? 'Checking balance…'
                  : 'Balance unavailable'}
            </small>
          </div>
          <div className="pw-swap-arrow" aria-hidden>
            <ArrowDown size={17} />
          </div>
          <div className="pw-swap-field">
            <span>You receive</span>
            <div className="pw-swap-value">
              <output htmlFor="pw-swap-amount" className="num">
                {quote ? quote.receive.toLocaleString('en-US') : '—'}
              </output>
              <span className="pw-currency">
                <span className="pw-token-mark">
                  <Coins size={14} aria-hidden />
                </span>{' '}
                PSK
              </span>
            </div>
            <small>Base units sent to your protected token address</small>
          </div>
        </div>
        <label className="pw-swap-slippage">
          Slippage tolerance
          <select
            value={slippage}
            disabled={busy}
            onChange={(event) => {
              setSlippage(event.target.value);
              clearQuote();
            }}
          >
            <option value="0">0%</option>
            <option value="0.5">0.5%</option>
            <option value="1">1%</option>
          </select>
        </label>
        {quote && (
          <Details
            rows={[
              [
                'Minimum return',
                `${quote.minimum.toLocaleString('en-US')} PSK`,
              ],
              ['Liquidity fee included', `${formatBch(quote.poolFee)} BCH`],
              ['Quote validity', '60 seconds while liquidity is available'],
            ]}
          />
        )}
        {issue && <ErrorNotice>{issue}</ErrorNotice>}
        {txid && <TransactionNotice txid={txid} dismiss={() => setTxid('')} />}
        {reviewBlocked && <p className="pw-fine">{reviewBlocked}</p>}
        <Button
          type="submit"
          block
          loading={busy}
          disabled={!state || Boolean(quote && reviewBlocked)}
          icon={<ArrowRight />}
        >
          {busy ? 'Preparing…' : quote ? 'Review swap' : 'Get quote'}
        </Button>
      </form>
      {prepared && (
        <TransactionReview
          prepared={prepared}
          close={() => setPrepared(null)}
          done={(id) => {
            setPrepared(null);
            setQuote(null);
            setTxid(id);
            void refresh();
          }}
        />
      )}
    </>
  );
}

export function TokenAssets({
  metadata,
  data,
  refresh,
}: {
  metadata: Metadata;
  data: api.LoadedPlan | null;
  refresh: () => Promise<void>;
}) {
  const { wallet } = useWallet();
  const formId = useId();
  const [prepared, setPrepared] = useState<api.Prepared | null>(null);
  const [receipt, setReceipt] = useState<Utxo | null>(null);
  const [recipient, setRecipient] = useState('');
  const [units, setUnits] = useState('');
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');
  const [busy, setBusy] = useState(false);
  if (metadata.protocolRevision !== 'assets-1') return null;
  const address = data ? api.tokenVault(data.handle).tokenAddress : null;
  const owner =
    wallet && planAddressHash(wallet.address) === metadata.ownerPkhHex;

  async function prepare(next: () => Promise<api.Prepared>) {
    setBusy(true);
    setError('');
    try {
      setPrepared(await next());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeading
        title="Protected tokens"
        description="Receipts follow your plan. Token amounts are shown in whole base units."
      >
        <span className="pw-symbol">
          <Coins size={18} aria-hidden />
        </span>
      </CardHeading>
      {address && (
        <Address value={address} label="Copy token receive address" />
      )}
      {data?.tokenReceipts.length ? (
        <ul className="pw-rows">
          {data.tokenReceipts.map((utxo) => (
            <li
              className="pw-row pw-token-row"
              key={`${utxo.txid}:${utxo.vout}`}
            >
              <span className="pw-symbol pw-symbol--accent">
                <Coins size={17} aria-hidden />
              </span>
              <div className="pw-row-main">
                <strong className="num">
                  {utxo.token!.amount.toLocaleString('en-US')}{' '}
                  {utxo.token!.category === api.testPair.category
                    ? 'PSK'
                    : 'units'}
                </strong>
                <span className="mono" title={utxo.token!.category}>
                  {utxo.token!.category.slice(0, 12)}…
                  {utxo.token!.category.slice(-8)}
                </span>
                <span>Carrier: {formatBch(utxo.satoshis)} BCH</span>
              </div>
              {owner && data.state.status === 'ACTIVE' && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    setReceipt(utxo);
                  }}
                >
                  Send
                </Button>
              )}
              {data.state.status === 'PAID_OUT' && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void prepare(() => api.prepareTokenPayout(metadata, utxo))
                  }
                >
                  Pay heirs
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Coins size={21} />}
          title={data ? 'No token receipts yet' : 'Token balance unavailable'}
          description={
            data
              ? 'Tokens from supported swaps will appear here.'
              : 'The network must return the plan before its token receipts can be shown.'
          }
        />
      )}
      {error && !receipt && <ErrorNotice>{error}</ErrorNotice>}
      {txid && <TransactionNotice txid={txid} dismiss={() => setTxid('')} />}
      {receipt && !prepared && (
        <WalletSheet
          open
          title="Send tokens"
          description="The next step shows your token payment, protected change, and network fee."
          dismissible={!busy}
          onClose={() => setReceipt(null)}
          footer={
            <Button
              type="submit"
              form={formId}
              loading={busy}
              icon={<ArrowRight />}
            >
              Review token payment
            </Button>
          }
        >
          <form
            id={formId}
            className="pw-form"
            onSubmit={(event) => {
              event.preventDefault();
              void prepare(async () => {
                const amount = BigInt(units.trim());
                if (amount <= 0n)
                  throw new Error(
                    'Enter a positive whole number of token units.',
                  );
                return api.prepareTokenSend(
                  metadata,
                  receipt,
                  recipient.trim(),
                  amount,
                );
              });
            }}
          >
            <label>
              Recipient address
              <input
                required
                value={recipient}
                disabled={busy}
                spellCheck={false}
                onChange={(event) => setRecipient(event.target.value)}
              />
            </label>
            <label>
              Base units (whole numbers)
              <input
                required
                inputMode="numeric"
                pattern="[0-9]+"
                value={units}
                disabled={busy}
                onChange={(event) => setUnits(event.target.value)}
              />
            </label>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <p className="pw-fine">
              Sending tokens renews the waiting time in the same transaction.
            </p>
          </form>
        </WalletSheet>
      )}
      {prepared && (
        <TransactionReview
          prepared={prepared}
          close={() => setPrepared(null)}
          done={(id) => {
            setPrepared(null);
            setReceipt(null);
            setRecipient('');
            setUnits('');
            setTxid(id);
            void refresh();
          }}
        />
      )}
    </Card>
  );
}
