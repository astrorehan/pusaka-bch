import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  HeartPulse,
  History,
  Inbox,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Logo } from "../../components/Logo";
import { Banner } from "../../components/Banner";
import { WalletButton } from "../../components/AppShell";
import { useWallet } from "../../lib/wallet";
import { pkhOfAddress, binToHex } from "../../lib/chain/network";
import * as api from "../../lib/chain/v2";
import { faraid, EMPTY_FAMILY, type Family } from "../create/faraid";
import "./wallet-app.css";
import demoPlan from "../../lib/protocol/demo-plan.json";
const TokenAssets = lazy(() =>
  import("./SwapScreen").then((m) => ({ default: m.TokenAssets })),
);

const short = (text: string) => `${text.slice(0, 12)}…${text.slice(-7)}`;
const when = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
const duration = (seconds: number) => {
  const [value, unit] =
    seconds < 3600
      ? [Math.ceil(seconds / 60), "minute"]
      : seconds < 86400
        ? [Math.ceil(seconds / 3600), "hour"]
        : [Math.ceil(seconds / 86400), "day"];
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
};
const explorer = (txid: string) =>
  `https://${api.NETWORK === "chipnet" ? "chipnet." : ""}chaingraph.cash/tx/${txid}`;

export function WalletLayout() {
  const [folded, setFolded] = useState(
    () => localStorage.getItem("pusaka.sidebar.folded") === "1",
  );
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  const navigation = [
    ["/wallet", "Wallet", Wallet],
    ["/wallet/swap", "Swap", ArrowLeftRight],
    ["/wallet/plan", "Inheritance", ShieldCheck],
    ["/wallet/activity", "Activity", History],
  ] as const;
  const fold = () => {
    localStorage.setItem("pusaka.sidebar.folded", folded ? "0" : "1");
    setFolded(!folded);
  };
  return (
    <div className={`pw-app ${folded ? "pw-folded" : ""}`}>
      <a className="pw-skip" href="#wallet-main">
        Skip to content
      </a>
      {open && (
        <button
          className="pw-shade"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`pw-sidebar ${open ? "pw-sidebar-open" : ""}`}>
        <div className="pw-brand">
          <Link to="/wallet" aria-label="Pusaka wallet">
            <Logo size={28} />
            <span>Pusaka</span>
          </Link>
          <button
            className="pw-icon pw-fold"
            onClick={fold}
            aria-label={folded ? "Expand sidebar" : "Fold sidebar"}
          >
            {folded ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
          <button
            className="pw-icon pw-mobile"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>
        <div className="pw-wallet-card">
          <span className="pw-avatar">
            <Logo size={23} />
          </span>
          <div>
            <strong>My Pusaka</strong>
            <small>Personal wallet</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <nav aria-label="Wallet navigation">
          {navigation.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/wallet"}
              title={folded ? label : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="pw-sidebar-bottom">
          <div className="pw-help">
            <ShieldCheck size={20} />
            <strong>Your money. Your rules.</strong>
            <p>Use it today. Leave what remains to the people you choose.</p>
          </div>
          <Link to="/" className="pw-home">
            About Pusaka <ExternalLink size={13} />
          </Link>
          <span className="pw-network">
            <i />
            {api.NETWORK === "chipnet"
              ? "Chipnet · test money"
              : "Bitcoin Cash · mainnet"}
          </span>
        </div>
      </aside>
      <div className="pw-workspace">
        <Banner />
        <header className="pw-topbar">
          <button
            className="pw-icon pw-mobile"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <span className="pw-breadcrumb">
            Personal <ChevronRight size={13} />
            <strong>
              {location.pathname.includes("activity")
                ? "Activity"
                : location.pathname.includes("plan")
                  ? "Inheritance"
                  : "Wallet"}
            </strong>
          </span>
          <WalletButton pill={false} />
        </header>
        <main id="wallet-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`pw-card ${className}`}>{children}</section>;
}
function Heading({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="pw-heading">
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {children && <div className="pw-actions">{children}</div>}
    </div>
  );
}
function CopyText({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="pw-copy"
      title={text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {label || short(text)} {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="pw-dialog"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="pw-icon" onClick={close} aria-label="Close dialog">
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Review({
  prepared,
  close,
  done,
}: {
  prepared: api.Prepared;
  close: () => void;
  done: (txid: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      title={prepared.title}
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="pw-dialog-body">
        <p>
          Check the details. Your wallet asks you to approve the exact
          transaction.
        </p>
        <dl className="pw-review">
          {prepared.rows.map(([k, v], i) => (
            <div key={i}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {error && (
          <div className="pw-error" role="alert">
            {error}
          </div>
        )}
        <p className="pw-fine">
          {api.NETWORK === "chipnet"
            ? "Chipnet uses test BCH. "
            : "This spends real BCH. "}
          Network acceptance appears first; confirmation follows when a block
          includes it.
        </p>
      </div>
      <footer>
        <button className="pw-btn" disabled={busy} onClick={close}>
          Back
        </button>
        <button
          className="pw-btn pw-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              done(await api.submit(prepared));
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "Waiting for wallet / network…" : "Approve in wallet"}
          <ArrowUpRight size={16} />
        </button>
      </footer>
    </Dialog>
  );
}

function useCurrentPlan() {
  const route = useLocation();
  const [metadata, setMetadata] = useState<api.PusakaV2PlanMetadata | null>(
    () => {
      try {
        return route.pathname === "/wallet/demo" && api.NETWORK === "chipnet"
          ? (demoPlan as api.PusakaV2PlanMetadata)
          : location.hash
            ? api.importPlan(location.hash)
            : api.savedPlans()[0] || null;
      } catch {
        return null;
      }
    },
  );
  const [data, setData] = useState<api.LoadedPlan | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!metadata) return;
    setLoading(true);
    setError("");
    try {
      const d = await api.loadPlan(metadata);
      setData(d);
      api.savePlan(metadata);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [metadata]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  return { metadata, setMetadata, data, error, loading, refresh };
}

export function WalletScreen() {
  const location = useLocation(),
    navigate = useNavigate();
  const wallet = useWallet();
  const { metadata, setMetadata, data, error, loading, refresh } =
    useCurrentPlan();
  const [dialog, setDialog] = useState<
    "receive" | "send" | "import" | "export" | "more" | null
  >(null);
  const [prepared, setPrepared] = useState<api.Prepared | null>(null),
    [actionError, setActionError] = useState(""),
    [preparing, setPreparing] = useState(false),
    [success, setSuccess] = useState("");
  const [recipient, setRecipient] = useState(""),
    [amount, setAmount] = useState(""),
    [importText, setImportText] = useState("");
  const inherited =
    location.pathname.includes("plan") || location.pathname === "/v2/plan";
  const activityOnly = location.pathname.includes("activity");
  const owner = Boolean(
    metadata &&
    wallet.wallet &&
    binToHex(pkhOfAddress(wallet.wallet.address)) === metadata.ownerPkhHex,
  );
  const contact = Boolean(
    data &&
    wallet.wallet &&
    data.handle.policy.contacts.some(
      (c) => binToHex(c) === binToHex(pkhOfAddress(wallet.wallet!.address)),
    ),
  );
  async function act(
    action: api.Action,
    options: Parameters<typeof api.prepareAction>[2] = {},
  ) {
    if (!metadata) return;
    setPreparing(true);
    setActionError("");
    try {
      setPrepared(await api.prepareAction(metadata, action, options));
      setDialog(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreparing(false);
    }
  }
  const state = data?.state;
  return (
    <div className="pw-page">
      {location.pathname === "/wallet/demo" && (
        <div className="pw-success" role="note">
          Live Chipnet proof wallet. The displayed balance and claim status come
          from the network. Its fixture owner is separate from your connected
          wallet.
        </div>
      )}
      <Heading
        title={activityOnly ? "Activity" : inherited ? "Inheritance" : "Wallet"}
        text={
          activityOnly
            ? "Transactions submitted from this browser. Your network is the source of truth."
            : inherited
              ? "The people you choose. The rules you can change."
              : "Spend today. Keep tomorrow in good hands."
        }
      >
        <button className="pw-btn" onClick={() => setDialog("import")}>
          <Download size={16} /> Open a plan
        </button>
        {metadata ? (
          <button
            className="pw-btn"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "pw-spin" : ""} /> Refresh
          </button>
        ) : (
          <Link className="pw-btn pw-primary" to="/wallet/new">
            <Plus size={17} /> Set up wallet
          </Link>
        )}
      </Heading>
      {(error || actionError) && (
        <div className="pw-error" role="alert">
          {error || actionError}
        </div>
      )}
      {success && (
        <div className="pw-success" role="status">
          <Check size={18} />
          <div>
            Transaction accepted by the network.{" "}
            <a href={explorer(success)} target="_blank" rel="noreferrer">
              View transaction <ExternalLink size={12} />
            </a>
          </div>
          <button
            className="pw-icon"
            onClick={() => setSuccess("")}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!metadata ? (
        <Card className="pw-empty">
          <div className="pw-empty-flower">
            <Logo size={50} />
          </div>
          <span className="pw-eyebrow">A wallet with a future</span>
          <h2>
            Make room for the people
            <br />
            who matter.
          </h2>
          <p>
            Use a BCH balance from Pusaka. What remains can pass to your heirs,
            with trusted contacts and time for you to stop a mistaken claim.
          </p>
          <Link className="pw-btn pw-primary" to="/wallet/new">
            Set up my wallet <ArrowUpRight size={17} />
          </Link>
          <button className="pw-text" onClick={() => setDialog("import")}>
            Already have a plan? Open it here
          </button>
          <small>
            A new receive address and an initial transfer are part of setup.
          </small>
        </Card>
      ) : (
        !activityOnly && (
          <>
            {state?.status === "REVIEW" && (
              <div className="pw-claim-banner">
                <ShieldCheck />
                <div>
                  <strong>A claim is under review</strong>
                  <p>
                    {data?.review?.confirmed
                      ? `${duration(Math.max(0, data.review.required - data.review.age))} of network review remaining.`
                      : "The review clock starts after the claim anchor confirms."}{" "}
                    You can stop this claim with an owner action.
                  </p>
                </div>
                {owner && (
                  <button
                    className="pw-btn pw-primary"
                    disabled={preparing}
                    onClick={() => void act("cancel")}
                  >
                    Stop claim
                  </button>
                )}
              </div>
            )}
            <div className="pw-columns">
              <div className="pw-main-column">
                {!inherited && (
                  <Card className="pw-balance">
                    <div className="pw-balance-top">
                      <span className="pw-eyebrow">Protected BCH balance</span>
                      <span
                        className={`pw-badge ${state?.status === "REVIEW" ? "pw-warning" : ""}`}
                      >
                        <i />
                        {state
                          ? {
                              ACTIVE: "Active",
                              REVIEW: "Under review",
                              PAID_OUT: "Paid to heirs",
                              CLOSED: "Funds taken back",
                              UNINITIALIZED: "Not found",
                            }[state.status]
                          : "Loading"}
                      </span>
                    </div>
                    <div className="pw-balance-number">
                      {state
                        ? (Number(state.spendableBalanceSats) / 1e8).toFixed(8)
                        : "—"}{" "}
                      <span>BCH</span>
                    </div>
                    <p className="pw-muted">
                      {state && ["PAID_OUT", "CLOSED"].includes(state.status)
                        ? "Retained reserve and later receipts. Your inheritance rules remain attached to the receive address."
                        : "Available to spend. Your remaining balance follows your inheritance rules."}
                    </p>
                    <div className="pw-balance-actions">
                      <button
                        className="pw-btn pw-primary"
                        disabled={
                          !owner ||
                          !state ||
                          preparing ||
                          !["ACTIVE", "REVIEW"].includes(state.status)
                        }
                        onClick={() => setDialog("send")}
                      >
                        <ArrowUpRight size={17} /> Send
                      </button>
                      <button
                        className="pw-btn"
                        onClick={() => setDialog("receive")}
                      >
                        <ArrowDownLeft size={17} /> Receive
                      </button>
                      <Link className="pw-btn" to="/wallet/swap">
                        <ArrowLeftRight size={17} /> Swap
                      </Link>
                      <button
                        className="pw-icon"
                        onClick={() => setDialog("more")}
                        aria-label="More wallet actions"
                      >
                        <Ellipsis />
                      </button>
                    </div>
                    <div className="pw-balance-note">
                      <ShieldCheck size={16} />
                      <span>
                        1,000 sats keep your wallet identity alive. Fees are
                        shown before you approve.
                      </span>
                    </div>
                  </Card>
                )}
                {state && state.inboxUtxos.length > 0 && (
                  <Card className="pw-incoming">
                    <Inbox />
                    <div>
                      <strong>
                        {api.bch(state.inboxBalanceSats)} incoming
                      </strong>
                      <p>
                        Already protected at your receive address. Collect it to
                        make it spendable. Receiving never counts as being
                        active.
                      </p>
                    </div>
                    <button
                      className="pw-btn"
                      disabled={preparing}
                      onClick={() => void act("sweep")}
                    >
                      Collect
                    </button>
                  </Card>
                )}
                {inherited && (
                  <Card>
                    <div className="pw-card-heading">
                      <h2>Your heirs</h2>
                      <span className="pw-muted">
                        {metadata.heirs.length} people
                      </span>
                    </div>
                    <p className="pw-muted">
                      The same shares apply to covered assets. Integer rounding
                      stays protected for a later payout.
                    </p>
                    <div className="pw-people">
                      {metadata.heirs.map((heir, i) => (
                        <div className="pw-person" key={i}>
                          <span
                            className="pw-person-avatar"
                            style={{
                              background: [
                                "#e8ede4",
                                "#ede7d9",
                                "#e8e5ed",
                                "#e3e9ec",
                              ][i % 4],
                            }}
                          >
                            {(heir.label || `Heir ${i + 1}`)
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>
                          <div>
                            <strong>{heir.label || `Heir ${i + 1}`}</strong>
                            <small>
                              {short(
                                api.p2pkhCashAddressFromPkh(
                                  heir.pkhHex,
                                  api.NETWORK,
                                ),
                              )}
                            </small>
                          </div>
                          <strong>
                            {(
                              (Number(heir.share) /
                                Number(metadata.totalShares)) *
                              100
                            ).toFixed(2)}
                            %
                          </strong>
                        </div>
                      ))}
                    </div>
                    {owner && (
                      <Link className="pw-btn" to="/wallet/edit">
                        Edit inheritance rules
                      </Link>
                    )}
                  </Card>
                )}
                {inherited && (
                  <Card>
                    <div className="pw-card-heading">
                      <h2>Trusted contacts</h2>
                      <span className="pw-badge">2 of 3 to open review</span>
                    </div>
                    <p className="pw-muted">
                      Contacts can ask for a claim review. They cannot spend
                      your money or change your heirs.
                    </p>
                    <div className="pw-people">
                      {metadata.contacts.map((pkh, i) => (
                        <div className="pw-person" key={pkh}>
                          <span className="pw-person-avatar">
                            <Users size={18} />
                          </span>
                          <div>
                            <strong>Contact {i + 1}</strong>
                            <small>
                              {short(
                                api.p2pkhCashAddressFromPkh(pkh, api.NETWORK),
                              )}
                            </small>
                          </div>
                          <span className="pw-muted">
                            {state?.approvedContactIndices.includes(i)
                              ? "Confirmed"
                              : "No confirmation"}
                          </span>
                        </div>
                      ))}
                    </div>
                    {contact && (
                      <button
                        className="pw-btn"
                        disabled={
                          preparing ||
                          !state ||
                          !["ACTIVE", "CLOSED"].includes(state.status)
                        }
                        onClick={() => void act("approve")}
                      >
                        Confirm a claim
                      </button>
                    )}
                  </Card>
                )}
                {!inherited && (
                  <Suspense fallback={<Card>Loading protected assets…</Card>}>
                    <TokenAssets
                      metadata={metadata}
                      data={data}
                      refresh={refresh}
                    />
                  </Suspense>
                )}
                {!inherited && <ActivityList plan={metadata.planCategoryHex} />}
                {inherited && (
                  <Card>
                    <h2>Share & recovery</h2>
                    <p className="pw-muted">
                      Save the plan data and share a link with your family. It
                      contains public addresses and rules, never a spending key.
                    </p>
                    <div className="pw-actions">
                      <CopyText
                        text={api.planLink(metadata)}
                        label="Copy plan link"
                      />
                      <button
                        className="pw-btn"
                        onClick={() => setDialog("export")}
                      >
                        <Download size={15} /> Save plan data
                      </button>
                    </div>
                  </Card>
                )}
              </div>
              <aside className="pw-detail-column">
                <Card>
                  <div className="pw-card-heading">
                    <h2>Your inheritance rules</h2>
                    <ShieldCheck size={19} />
                  </div>
                  <div className="pw-rule">
                    <span>When you’re inactive</span>
                    <strong>
                      {duration(metadata.inactivityPeriodSeconds)}
                    </strong>
                    <small>
                      Owner Send or “I’m still here” renews this clock.
                    </small>
                  </div>
                  <div className="pw-rule">
                    <span>Review period</span>
                    <strong>{duration(metadata.effectiveReviewSeconds)}</strong>
                    <small>Enforced by the network after a claim opens.</small>
                  </div>
                  <div className="pw-rule">
                    <span>Next inactivity deadline</span>
                    <strong>
                      {state ? when(state.deadline) : "Checking network…"}
                    </strong>
                    <small>
                      Measured using the network clock, which can lag behind
                      your phone.
                    </small>
                  </div>
                  <Link className="pw-text" to="/wallet/plan">
                    See your people & rules <ChevronRight size={14} />
                  </Link>
                  {owner && (
                    <button
                      className="pw-btn pw-wide"
                      disabled={preparing || !state}
                      onClick={() => void act("checkIn")}
                    >
                      <HeartPulse size={16} /> I’m still here
                    </button>
                  )}
                </Card>
                {inherited && state && (
                  <Card>
                    <h2>Claim progress</h2>
                    <ol className="pw-timeline">
                      <li className="pw-done">
                        <strong>Plan is on the network</strong>
                        <small>
                          Balance and family rules are enforced by contracts.
                        </small>
                      </li>
                      <li
                        className={
                          state.status === "REVIEW" ||
                          state.status === "PAID_OUT"
                            ? "pw-done"
                            : ""
                        }
                      >
                        <strong>Inactivity or 2 contact confirmations</strong>
                        <small>
                          {state.approvedContactIndices.length} of 3 contacts
                          confirmed this round.
                        </small>
                      </li>
                      <li
                        className={
                          data?.review?.ready || state.status === "PAID_OUT"
                            ? "pw-done"
                            : ""
                        }
                      >
                        <strong>Full review period</strong>
                        <small>
                          {duration(metadata.effectiveReviewSeconds)} after
                          anchor confirmation. Owner can stop it.
                        </small>
                      </li>
                      <li
                        className={state.status === "PAID_OUT" ? "pw-done" : ""}
                      >
                        <strong>Pay all heirs</strong>
                        <small>
                          Anyone can submit. Recipients cannot be changed.
                        </small>
                      </li>
                    </ol>
                    {["ACTIVE", "CLOSED"].includes(state.status) && (
                      <button
                        className="pw-btn pw-wide"
                        disabled={
                          preparing || !data || data.now <= state.deadline
                        }
                        onClick={() => void act("open")}
                      >
                        Open inactivity claim
                      </button>
                    )}
                    {state.status === "REVIEW" && (
                      <button
                        className="pw-btn pw-primary pw-wide"
                        disabled={preparing || !data?.review?.ready}
                        onClick={() => void act("finalize")}
                      >
                        Pay the heirs
                      </button>
                    )}
                    {state.status === "PAID_OUT" && (
                      <button
                        className="pw-btn pw-wide"
                        disabled={preparing}
                        onClick={() => void act("late")}
                      >
                        Pay late receipts
                      </button>
                    )}
                  </Card>
                )}
                <div className="pw-footnote">
                  <ShieldCheck size={15} />
                  <p>
                    Ordinary Paytaca funds are separate. Only assets held at
                    your Pusaka addresses follow these rules.
                  </p>
                </div>
              </aside>
            </div>
          </>
        )
      )}
      {activityOnly && <ActivityList plan={metadata?.planCategoryHex} />}
      {dialog === "receive" && metadata && (
        <Dialog title="Receive BCH" close={() => setDialog(null)}>
          <div className="pw-dialog-body">
            <div className="pw-receive-mark">
              <ArrowDownLeft size={38} />
            </div>
            <p>
              Send BCH to your permanent Pusaka receive address. New receipts
              follow this plan, including while a claim is under review.
            </p>
            <div className="pw-address">{metadata.inboxAddress}</div>
            <CopyText
              text={metadata.inboxAddress}
              label="Copy receive address"
            />
            <a className="pw-btn" href={metadata.inboxAddress}>
              Open in wallet
            </a>
            <p className="pw-fine">
              BCH only at this address. Use the token address shown in Swap for
              the supported CashToken. Small receipts may need batching or
              sponsored collection.
            </p>
          </div>
        </Dialog>
      )}
      {dialog === "send" && (
        <Dialog title="Send BCH" close={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act("send", {
                address: recipient.trim(),
                amount: api.parseBch(amount),
              }).catch((e) => setActionError(String(e)));
            }}
          >
            <div className="pw-dialog-body">
              <label>
                Recipient address
                <input
                  required
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder={
                    api.NETWORK === "chipnet" ? "bchtest:…" : "bitcoincash:…"
                  }
                />
              </label>
              <label>
                Amount in BCH
                <input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.001"
                  pattern="[0-9]+(\.[0-9]{1,8})?"
                />
              </label>
              <p className="pw-fine">
                Your payment renews activity and stops any pending claim in the
                same transaction. The next screen shows fees and protected
                change.
              </p>
            </div>
            <footer>
              <button className="pw-btn pw-primary" disabled={preparing}>
                {preparing ? "Preparing…" : "Review payment"}
                <ArrowUpRight size={16} />
              </button>
            </footer>
          </form>
        </Dialog>
      )}
      {dialog === "import" && (
        <Dialog title="Open a saved plan" close={() => setDialog(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setActionError("");
              try {
                const plan = api.importPlan(importText);
                await api.loadPlan(plan);
                api.savePlan(plan);
                setMetadata(plan);
                setDialog(null);
                navigate("/wallet/plan");
              } catch (e) {
                setActionError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <div className="pw-dialog-body">
              <label>
                Plan link or JSON
                <textarea
                  rows={6}
                  required
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste your plan link or saved public plan data"
                />
              </label>
              <label>
                Or choose saved plan data
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setImportText(await f.text());
                  }}
                />
              </label>
              {actionError && (
                <p role="alert" className="pw-error">
                  {actionError}
                </p>
              )}
              <p className="pw-fine">
                Have a v1 plan?{" "}
                <Link to="/plan">Open the legacy plan screen</Link>. Existing
                plans remain separate.
              </p>
            </div>
            <footer>
              <button className="pw-btn pw-primary">Open plan</button>
            </footer>
          </form>
        </Dialog>
      )}
      {dialog === "export" && metadata && (
        <Dialog title="Save your plan" close={() => setDialog(null)}>
          <div className="pw-dialog-body">
            <p>
              Keep this public plan data somewhere your family can find it. Save
              an updated copy after changing the rules.
            </p>
            <a
              className="pw-btn pw-primary"
              download={`pusaka-${metadata.planCategoryHex.slice(0, 8)}.json`}
              href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(metadata, null, 2))}`}
            >
              <Download size={16} /> Download plan JSON
            </a>
            <CopyText text={api.planLink(metadata)} label="Copy family link" />
          </div>
        </Dialog>
      )}
      {dialog === "more" && (
        <Dialog title="Wallet actions" close={() => setDialog(null)}>
          <div className="pw-dialog-body">
            <button
              className="pw-btn pw-wide"
              onClick={() => setDialog("export")}
            >
              Save plan data
            </button>
            {owner && (
              <>
                <button
                  className="pw-btn pw-wide"
                  disabled={preparing}
                  onClick={() => void act("exit")}
                >
                  Take available BCH back to Paytaca
                </button>
                <p className="pw-fine">
                  This retires the current balance. Your issued receive address
                  stays protected for future receipts. Token balances remain
                  under the plan.
                </p>
              </>
            )}
          </div>
        </Dialog>
      )}
      {prepared && (
        <Review
          prepared={prepared}
          close={() => setPrepared(null)}
          done={(txid) => {
            if (prepared.metadata) setMetadata(prepared.metadata);
            setSuccess(txid);
            setPrepared(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function ActivityList({ plan }: { plan?: string }) {
  const entries = api.history().filter((e) => !plan || e.plan === plan);
  return (
    <Card>
      <div className="pw-card-heading">
        <h2>Recent activity</h2>
        <span className="pw-muted">This browser</span>
      </div>
      {entries.length ? (
        <div className="pw-activity">
          {entries.map((e) => (
            <a
              href={explorer(e.txid)}
              key={e.txid}
              target="_blank"
              rel="noreferrer"
            >
              <span className="pw-activity-icon">
                <ArrowUpRight size={17} />
              </span>
              <div>
                <strong>{e.title}</strong>
                <small>{new Date(e.at).toLocaleString()}</small>
              </div>
              <span className="pw-badge">Accepted</span>
              <ExternalLink size={14} />
            </a>
          ))}
        </div>
      ) : (
        <div className="pw-no-activity">
          <History size={24} />
          <strong>No transactions submitted here yet</strong>
          <p>
            Payments, check-ins and claims you submit from this browser appear
            here. Importing a plan does not import its history.
          </p>
        </div>
      )}
    </Card>
  );
}

type HeirRow = { name: string; address: string; share: string };
export function SetupScreen({ edit = false }: { edit?: boolean }) {
  const wallet = useWallet(),
    navigate = useNavigate();
  const route = useLocation();
  const [existing] = useState(() => (edit ? api.savedPlans()[0] : undefined));
  const [step, setStep] = useState(0),
    [heirs, setHeirs] = useState<HeirRow[]>(() =>
      existing
        ? existing.heirs.map((h) => ({
            name: h.label || "",
            address: api.p2pkhCashAddressFromPkh(h.pkhHex, api.NETWORK),
            share: h.share,
          }))
        : [
            { name: "", address: "", share: "1" },
            { name: "", address: "", share: "1" },
          ],
    );
  const [contacts, setContacts] = useState(() =>
    existing
      ? existing.contacts.map((p) =>
          api.p2pkhCashAddressFromPkh(p, api.NETWORK),
        )
      : ["", "", ""],
  );
  const [mode, setMode] = useState<"equal" | "custom" | "faraid">(() =>
      existing
        ? "custom"
        : new URLSearchParams(route.search).get("split") === "faraid"
          ? "faraid"
          : new URLSearchParams(route.search).get("split") === "custom"
            ? "custom"
            : "equal",
    ),
    [family, setFamily] = useState<Family>(EMPTY_FAMILY);
  const [days, setDays] = useState(
      existing ? String(existing.inactivityPeriodSeconds / 86400) : "90",
    ),
    [reviewDays, setReviewDays] = useState(
      existing ? String(existing.effectiveReviewSeconds / 86400) : "7",
    ),
    [amount, setAmount] = useState("0.001");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [prepared, setPrepared] = useState<api.Prepared | null>(null);
  const familyResult = faraid(family);
  function applyFamily(next: Family) {
    setFamily(next);
    const result = faraid(next);
    if (result.ok)
      setHeirs(
        result.heirs.map((h) => ({
          name: h.label,
          address: "",
          share: h.share.toString(),
        })),
      );
  }
  function policy(): api.PusakaV2PolicyInput {
    if (!wallet.wallet) throw new Error("Connect your Paytaca wallet.");
    if (
      !Number.isFinite(Number(days)) ||
      Number(days) < 1 ||
      Number(days) > 3650 ||
      !Number.isFinite(Number(reviewDays)) ||
      Number(reviewDays) < 1 ||
      Number(reviewDays) > 365
    )
      throw new Error(
        "Choose inactivity from 1 to 3,650 days and review from 1 to 365 days.",
      );
    const prefix = api.NETWORK === "chipnet" ? "bchtest:" : "bitcoincash:";
    if (
      [...heirs.map((h) => h.address), ...contacts].some(
        (a) => !a.startsWith(prefix),
      )
    )
      throw new Error(
        "Every heir and contact needs an address on this network.",
      );
    if (mode === "faraid" && !familyResult.ok)
      throw new Error(familyResult.message);
    return {
      inactivityPeriodSeconds: Math.round(Number(days) * 86400),
      reviewPeriodSeconds: Math.round(Number(reviewDays) * 86400),
      feeBudget: 5000n,
      contacts: contacts as [string, string, string],
      heirs: heirs.map((h) => ({
        pkh: h.address,
        share: mode === "equal" ? 1n : BigInt(h.share),
        label: h.name,
      })),
    };
  }
  async function review() {
    setError("");
    setBusy(true);
    try {
      const p = policy();
      const next =
        edit && existing
          ? await api.prepareAction(existing, "policy", { policy: p })
          : await api.prepareCreate(p, api.parseBch(amount));
      setPrepared(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pw-page pw-setup">
      <Heading
        title={edit ? "Edit inheritance rules" : "Set up your Pusaka wallet"}
        text="A little planning. A lot of peace of mind."
      />
      <div className="pw-stepper">
        {["Your people", "Safety & timing", "Review & fund"].map((label, i) => (
          <button
            key={label}
            className={
              step === i ? "pw-current" : step > i ? "pw-complete" : ""
            }
            onClick={() => setStep(i)}
          >
            <span>{step > i ? <Check size={13} /> : i + 1}</span>
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" className="pw-error">
          {error}
        </div>
      )}
      <Card>
        {step === 0 && (
          <>
            <div className="pw-card-heading">
              <div>
                <h2>Who should inherit?</h2>
                <p className="pw-muted">
                  You can change these rules later with your wallet.
                </p>
              </div>
            </div>
            <div
              className="pw-tabs"
              role="group"
              aria-label="Share calculation"
            >
              {(["equal", "custom", "faraid"] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {m === "equal"
                    ? "Equal shares"
                    : m === "custom"
                      ? "Custom shares"
                      : "Faraid"}
                </button>
              ))}
            </div>
            {mode === "faraid" && (
              <div className="pw-family">
                <p>
                  Common Sunni family calculation. Verify the result for your
                  family before approving.
                </p>
                <label>
                  Spouse
                  <select
                    value={family.spouse}
                    onChange={(e) =>
                      applyFamily({
                        ...family,
                        spouse: e.target.value as Family["spouse"],
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="wife">Wife</option>
                    <option value="husband">Husband</option>
                  </select>
                </label>
                {(
                  ["sons", "daughters", "wives", "brothers", "sisters"] as const
                ).map((k) => (
                  <label key={k}>
                    {k}
                    <input
                      type="number"
                      min={k === "wives" ? 1 : 0}
                      max={k === "wives" ? 4 : 8}
                      value={family[k]}
                      onChange={(e) =>
                        applyFamily({ ...family, [k]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
                {(["father", "mother"] as const).map((k) => (
                  <label className="pw-checkbox" key={k}>
                    <input
                      type="checkbox"
                      checked={family[k]}
                      onChange={(e) =>
                        applyFamily({ ...family, [k]: e.target.checked })
                      }
                    />
                    {k} living
                  </label>
                ))}
                {!familyResult.ok && <p role="alert">{familyResult.message}</p>}
              </div>
            )}
            <div className="pw-heir-inputs">
              {heirs.map((h, i) => (
                <div className="pw-heir-input" key={i}>
                  <label>
                    Name
                    <input
                      required
                      value={h.name}
                      onChange={(e) =>
                        setHeirs(
                          heirs.map((r, j) =>
                            j === i ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                      placeholder={`Heir ${i + 1}`}
                    />
                  </label>
                  <label>
                    BCH address
                    <input
                      required
                      value={h.address}
                      onChange={(e) =>
                        setHeirs(
                          heirs.map((r, j) =>
                            j === i
                              ? { ...r, address: e.target.value.trim() }
                              : r,
                          ),
                        )
                      }
                      placeholder={
                        api.NETWORK === "chipnet"
                          ? "bchtest:…"
                          : "bitcoincash:…"
                      }
                    />
                  </label>
                  {mode !== "equal" && (
                    <label>
                      Share units
                      <input
                        type="number"
                        min="1"
                        readOnly={mode === "faraid"}
                        value={h.share}
                        onChange={(e) =>
                          setHeirs(
                            heirs.map((r, j) =>
                              j === i ? { ...r, share: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                  {mode !== "faraid" && heirs.length > 1 && (
                    <button
                      className="pw-icon"
                      onClick={() => setHeirs(heirs.filter((_, j) => j !== i))}
                      aria-label={`Remove heir ${i + 1}`}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {mode !== "faraid" && heirs.length < 10 && (
              <button
                className="pw-btn"
                onClick={() =>
                  setHeirs([...heirs, { name: "", address: "", share: "1" }])
                }
              >
                <Plus size={15} /> Add heir
              </button>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <h2>People who can look out for you</h2>
            <p className="pw-muted">
              Two of these three contacts can open a claim review. Contacts
              cannot take your funds. Use three distinct addresses, different
              from yours.
            </p>
            {contacts.map((address, i) => (
              <label key={i}>
                Trusted contact {i + 1}
                <input
                  value={address}
                  onChange={(e) =>
                    setContacts(
                      contacts.map((a, j) =>
                        j === i ? e.target.value.trim() : a,
                      ),
                    )
                  }
                  placeholder="BCH address"
                />
              </label>
            ))}
            <div className="pw-field-grid">
              <label>
                Inactive for (days)
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </label>
              <label>
                Claim review (days)
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={reviewDays}
                  onChange={(e) => setReviewDays(e.target.value)}
                />
              </label>
            </div>
            <p className="pw-fine">
              Review time rounds upward to 512-second network units. A payment
              or check-in stops a pending claim. Receiving funds does not renew
              activity.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <h2>
              {edit
                ? "Review the new rules"
                : "Your daily wallet, with inheritance built in"}
            </h2>
            <p className="pw-muted">
              {edit
                ? "This keeps your receive address and invalidates old contact approvals. Save the updated plan link after approval."
                : "Pusaka creates a new receive address. The initial transfer is a usable balance: you can send it and swap it while you’re active."}
            </p>
            <dl className="pw-review">
              <div>
                <dt>Heirs</dt>
                <dd>{heirs.map((h) => h.name || "Unnamed heir").join(", ")}</dd>
              </div>
              <div>
                <dt>Contact quorum</dt>
                <dd>2 of 3</dd>
              </div>
              <div>
                <dt>Inactivity</dt>
                <dd>{days} days</dd>
              </div>
              <div>
                <dt>Review</dt>
                <dd>At least {reviewDays} days</dd>
              </div>
            </dl>
            {!edit && (
              <label>
                Initial BCH in Pusaka (includes 0.00001 BCH identity carrier)
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            )}
            <p className="pw-fine">
              Keep at least 600 sats in ordinary Paytaca funds for
              authorization. Network fees can come from your protected BCH.
              Ordinary wallet funds are not automatically inherited.
            </p>
            {!wallet.wallet ? (
              <button
                className="pw-btn pw-primary"
                onClick={() => void wallet.connect()}
              >
                Connect wallet
              </button>
            ) : (
              <div className="pw-actions">
                {!edit && (
                  <button
                    className="pw-btn"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        setPrepared(await api.prepareGather());
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Prepare wallet
                  </button>
                )}
                <button
                  className="pw-btn pw-primary"
                  disabled={busy}
                  onClick={() => void review()}
                >
                  {busy ? "Preparing…" : "Review transaction"}
                  <ArrowUpRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
        <div className="pw-setup-footer">
          {step > 0 ? (
            <button className="pw-btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <Link className="pw-text" to="/wallet">
              Cancel
            </Link>
          )}
          {step < 2 && (
            <button
              className="pw-btn pw-primary"
              onClick={() => setStep(step + 1)}
            >
              Continue
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </Card>
      {prepared && (
        <Review
          prepared={prepared}
          close={() => setPrepared(null)}
          done={() => {
            const meta = prepared.metadata;
            setPrepared(null);
            if (meta) {
              api.savePlan(meta);
              navigate(api.encodePusakaV2PlanLink(meta, "/v2/plan"));
            } else
              setError(
                "Wallet preparation accepted. You can now review wallet creation.",
              );
          }}
        />
      )}
    </div>
  );
}

export { Card, Heading, Dialog, Review, useCurrentPlan };
