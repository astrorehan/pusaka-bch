import { useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  ShieldCheck,
  ArrowLeftRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Utxo } from "@solidcash/solidcash";
import { Card, Heading, Review, Dialog, useCurrentPlan } from "./WalletApp";
import { useWallet } from "../../lib/wallet";
import * as api from "../../lib/chain/v2";

export function SwapScreen() {
  const { metadata, data, error, refresh } = useCurrentPlan(),
    wallet = useWallet();
  const [amount, setAmount] = useState("0.00005"),
    [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<api.Quote | null>(null),
    [prepared, setPrepared] = useState<api.Prepared | null>(null),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState(""),
    [success, setSuccess] = useState("");
  return (
    <div className="pw-page">
      <Heading
        title="Swap"
        text="Trade from your wallet. Keep the proceeds in your plan."
      />
      <div className="pw-columns">
        <div className="pw-main-column">
          <Card>
            <div className="pw-card-heading">
              <h2>BCH → PSK</h2>
              <span className="pw-badge">Chipnet test pair</span>
            </div>
            <p className="pw-muted">
              A single-pool Cauldron V0 swap. PSK is a test token with no
              monetary value. Mainnet pairs have not been qualified.
            </p>
            {!metadata ? (
              <p>
                <Link to="/wallet">Open or create a Pusaka wallet first.</Link>
              </p>
            ) : metadata.protocolRevision !== "assets-1" ? (
              <div className="pw-error">
                This older wallet supports BCH. Asset support requires a new
                wallet; old funded contracts are kept intact.
              </div>
            ) : (
              <>
                <label className="pw-swap-field">
                  You pay · BCH
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setQuote(null);
                    }}
                  />
                  <small>
                    Available:{" "}
                    {data
                      ? api.bch(data.state.spendableBalanceSats)
                      : "Checking…"}
                  </small>
                </label>
                <div className="pw-swap-arrow">
                  <ArrowDown size={18} />
                </div>
                <div className="pw-swap-field">
                  <span>You receive · PSK base units</span>
                  <strong>{quote ? quote.receive.toString() : "—"}</strong>
                  <small>Sent directly to your protected token vault.</small>
                </div>
                <label className="pw-swap-slippage">
                  Slippage tolerance
                  <select
                    value={slippage}
                    onChange={(e) => {
                      setSlippage(e.target.value);
                      setQuote(null);
                    }}
                  >
                    <option value="0">0%</option>
                    <option value="0.5">0.5%</option>
                    <option value="1">1%</option>
                  </select>
                </label>
                {quote && (
                  <dl className="pw-review">
                    <div>
                      <dt>Minimum return</dt>
                      <dd>{quote.minimum.toString()} PSK</dd>
                    </div>
                    <div>
                      <dt>Liquidity provider fee (included)</dt>
                      <dd>{api.bch(quote.poolFee)}</dd>
                    </div>
                    <div>
                      <dt>Quote</dt>
                      <dd>
                        Valid for 60 seconds; pool state must remain available.
                      </dd>
                    </div>
                  </dl>
                )}
                {(issue || error) && (
                  <div role="alert" className="pw-error">
                    {issue || error}
                  </div>
                )}
                {success && (
                  <p className="pw-success" role="status">
                    Transaction accepted: {success}
                  </p>
                )}
                <button
                  className="pw-btn pw-primary pw-wide"
                  disabled={
                    busy ||
                    !data ||
                    (Boolean(quote) && data.state.status !== "ACTIVE")
                  }
                  onClick={async () => {
                    setBusy(true);
                    setIssue("");
                    try {
                      if (quote && metadata)
                        setPrepared(await api.prepareSwap(metadata, quote));
                      else
                        setQuote(
                          await api.getSwapQuote(
                            api.parseBch(amount),
                            Math.round(Number(slippage) * 100),
                          ),
                        );
                    } catch (e) {
                      setIssue(e instanceof Error ? e.message : String(e));
                      setQuote(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Preparing…" : quote ? "Review swap" : "Get quote"}
                  <ArrowUpRight size={16} />
                </button>
                {!wallet.wallet && (
                  <p className="pw-fine">
                    Connect the owner wallet before requesting approval.
                  </p>
                )}
                {data?.state.status === "REVIEW" && (
                  <p className="pw-fine">
                    Stop the pending claim from Inheritance before swapping.
                  </p>
                )}
              </>
            )}
          </Card>
          {metadata && (
            <TokenAssets metadata={metadata} data={data} refresh={refresh} />
          )}
        </div>
        <aside className="pw-detail-column">
          <Card>
            <ShieldCheck size={25} />
            <h2 style={{ marginTop: 12 }}>Protection follows the return</h2>
            <p className="pw-muted">
              The swap pays tokens straight into a vault bound to your plan
              identity. Policy changes keep that address. After the BCH claim
              finishes, anyone can sponsor the token payout to your current
              heirs.
            </p>
            <p className="pw-fine">
              Token carrier values and fees are reviewed separately. Indivisible
              token units go to the final configured heir. This integration buys
              one fungible token with BCH; arbitrary trading positions and NFTs
              are outside its scope.
            </p>
            <p className="pw-fine">
              Powered by{" "}
              <a
                href="https://docs.riftenlabs.com/cauldron/swap/"
                target="_blank"
                rel="noreferrer"
              >
                Cauldron V0
              </a>
              .
            </p>
          </Card>
        </aside>
      </div>
      {prepared && (
        <Review
          prepared={prepared}
          close={() => setPrepared(null)}
          done={(txid) => {
            setPrepared(null);
            setQuote(null);
            setSuccess(txid);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

export function TokenAssets({
  metadata,
  data,
  refresh,
}: {
  metadata: api.PusakaV2PlanMetadata;
  data: api.LoadedPlan | null;
  refresh: () => Promise<void>;
}) {
  const wallet = useWallet(),
    [prepared, setPrepared] = useState<api.Prepared | null>(null),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<Utxo | null>(null),
    [recipient, setRecipient] = useState(""),
    [units, setUnits] = useState(""),
    [busy, setBusy] = useState(false);
  if (metadata.protocolRevision !== "assets-1") return null;
  const address = data ? api.tokenVault(data.handle).tokenAddress : "";
  return (
    <Card>
      <div className="pw-card-heading">
        <h2>Protected tokens</h2>
        <ArrowLeftRight size={17} />
      </div>
      <p className="pw-muted">
        Each receipt stays under your current plan rules. Amounts below are
        indivisible base units.
      </p>
      {address && (
        <div className="pw-address">
          {address}
          <button
            className="pw-text"
            onClick={() => void navigator.clipboard.writeText(address)}
          >
            Copy token receive address
          </button>
        </div>
      )}
      {data?.tokenReceipts.length ? (
        <div>
          {data.tokenReceipts.map((u) => (
            <div className="pw-token-row" key={`${u.txid}:${u.vout}`}>
              <div>
                <strong>
                  {u.token!.amount.toString()}{" "}
                  {u.token!.category === api.testPair.category
                    ? "PSK"
                    : "units"}
                </strong>
                <small>
                  {u.token!.category.slice(0, 14)}…{u.token!.category.slice(-8)}
                </small>
                <small>Carrier: {api.bch(u.satoshis)}</small>
              </div>
              <div className="pw-actions">
                {wallet.wallet && data.state.status === "ACTIVE" && (
                  <button className="pw-btn" onClick={() => setReceipt(u)}>
                    Send
                  </button>
                )}
                {data.state.status === "PAID_OUT" && (
                  <button
                    className="pw-btn"
                    disabled={busy}
                    onClick={async () => {
                      setError("");
                      setBusy(true);
                      try {
                        setPrepared(await api.prepareTokenPayout(metadata, u));
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Pay heirs
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pw-no-activity">
          <ShieldCheck size={23} />
          <strong>No fungible token receipts yet</strong>
          <p>
            Tokens from supported swaps arrive here automatically. Send BCH to
            your BCH receive address, not this token address.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="pw-error">
          {error}
        </p>
      )}
      {receipt && (
        <Dialog title="Send tokens" close={() => setReceipt(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                setPrepared(
                  await api.prepareTokenSend(
                    metadata,
                    receipt,
                    recipient,
                    BigInt(units),
                  ),
                );
                setReceipt(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="pw-dialog-body">
              <label>
                Recipient address
                <input
                  required
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                />
              </label>
              <label>
                Base units (whole numbers)
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]+"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                />
              </label>
              {error && (
                <p className="pw-error" role="alert">
                  {error}
                </p>
              )}
              <p className="pw-fine">
                Your ordinary use renews activity in this same transaction.
                Protected token change returns to this vault.
              </p>
            </div>
            <footer>
              <button className="pw-btn pw-primary" disabled={busy}>
                Review token payment
              </button>
            </footer>
          </form>
        </Dialog>
      )}
      {prepared && (
        <Review
          prepared={prepared}
          close={() => setPrepared(null)}
          done={() => {
            setPrepared(null);
            void refresh();
          }}
        />
      )}
    </Card>
  );
}
