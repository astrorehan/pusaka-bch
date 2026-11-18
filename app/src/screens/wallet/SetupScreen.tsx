import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import * as api from '../../lib/chain/v2';
import { formatBch } from '../../lib/format';
import type { SplitMode } from '../../lib/types';
import { useWallet } from '../../lib/wallet';
import { EMPTY_FAMILY, faraid, type Family } from '../create/faraid';
import {
  planAddressHash,
  planAddressPrefix,
  useCurrentPlan,
} from './currentPlan';
import { ShareBreakdown } from './PlanOverview';
import { walletPath } from './paths';
import {
  Card,
  CardHeading,
  Details,
  EmptyState,
  ErrorNotice,
  PageHeading,
  TransactionNotice,
  TransactionReview,
} from './WalletUi';
import './setup.css';

const DAY = 86_400;
const SPLITS = [
  {
    id: 'equal',
    title: 'Equal shares',
    description: 'Every heir gets the same share.',
    Icon: Users,
  },
  {
    id: 'custom',
    title: 'Custom shares',
    description: 'Set how much each heir receives.',
    Icon: SlidersHorizontal,
  },
  {
    id: 'faraid',
    title: 'Faraid',
    description: 'Calculate shares using Islamic inheritance rules.',
    Icon: Scale,
  },
] as const;

type Metadata = api.PusakaV2PlanMetadata;
type Person = { name: string; address: string };
type Heir = Person & { id: string; share: string };

function initialHeir(id: number): Heir {
  return { id: `heir-${id}`, name: '', address: '', share: '1' };
}

function shareUnits(value: string) {
  return /^\d+$/.test(value) && value.length < 11 ? BigInt(value) : 0n;
}

function daySeconds(value: string, max: number, previous?: number) {
  const days = Number(value);
  const seconds = Math.round(days * DAY);
  if (
    seconds === previous ||
    (Number.isFinite(days) && days >= 1 && days <= max)
  )
    return seconds;
  return null;
}

export function SetupScreen({ edit = false }: { edit?: boolean }) {
  const { metadata } = useCurrentPlan();
  if (edit && !metadata) {
    return (
      <div className="pw-page">
        <PageHeading
          title="Edit inheritance rules"
          description="Update the people and timings on an existing plan."
        />
        <Card>
          <EmptyState
            icon={<ShieldCheck size={21} />}
            title="Open your plan first"
            description="Create or open your wallet before editing its inheritance rules."
          >
            <ButtonLink to="/wallet">Go to wallet</ButtonLink>
          </EmptyState>
        </Card>
      </div>
    );
  }
  return (
    <SetupForm
      key={edit ? metadata?.planCategoryHex : 'new'}
      existing={edit ? metadata : null}
    />
  );
}

function SetupForm({ existing }: { existing: Metadata | null }) {
  const wallet = useWallet();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { demo, selectPlan } = useCurrentPlan();
  const formId = useId();
  const titleId = useId();
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(existing?.heirs.length ?? 2);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<SplitMode>(() => {
    const preset = new URLSearchParams(search).get('split');
    return existing || preset === 'custom'
      ? 'custom'
      : preset === 'faraid'
        ? 'faraid'
        : 'equal';
  });
  const [manualHeirs, setManualHeirs] = useState<Heir[]>(() =>
    existing
      ? existing.heirs.map((heir, i) => ({
          id: `heir-${i}`,
          name: heir.label ?? '',
          address: api.p2pkhCashAddressFromPkh(heir.pkhHex, api.NETWORK),
          share: heir.share,
        }))
      : [initialHeir(0), initialHeir(1)],
  );
  const [family, setFamily] = useState<Family>(EMPTY_FAMILY);
  const [familyPeople, setFamilyPeople] = useState<
    Partial<Record<string, Person>>
  >({});
  const [contacts, setContacts] = useState(() =>
    existing
      ? existing.contacts.map((pkh) =>
          api.p2pkhCashAddressFromPkh(pkh, api.NETWORK),
        )
      : ['', '', ''],
  );
  const [days, setDays] = useState(
    existing ? String(existing.inactivityPeriodSeconds / DAY) : '90',
  );
  const [reviewDays, setReviewDays] = useState(
    existing ? String(existing.effectiveReviewSeconds / DAY) : '7',
  );
  const [amount, setAmount] = useState('0.001');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState(false);
  const [prepared, setPrepared] = useState<api.Prepared | null>(null);
  const [preparationTx, setPreparationTx] = useState('');

  const familyResult = faraid(family);
  const heirs: Heir[] =
    mode === 'faraid'
      ? familyResult.ok
        ? familyResult.heirs.map((heir) => ({
            id: heir.key,
            name: heir.label,
            address: '',
            ...familyPeople[heir.key],
            share: heir.share.toString(),
          }))
        : []
      : manualHeirs;
  const shares = heirs.map((heir) =>
    mode === 'equal' ? 1n : shareUnits(heir.share),
  );
  const totalShares = shares.reduce((total, share) => total + share, 0n);
  const activeSplit = SPLITS.find((split) => split.id === mode);
  const waitingSeconds = daySeconds(
    days,
    3650,
    existing?.inactivityPeriodSeconds,
  );
  const reviewSeconds = daySeconds(
    reviewDays,
    365,
    existing?.effectiveReviewSeconds,
  );
  const walletHash = wallet.wallet
    ? planAddressHash(wallet.wallet.address)
    : null;
  const wrongWallet = Boolean(
    wallet.wallet &&
    (!walletHash || (existing && walletHash !== existing.ownerPkhHex)),
  );
  const stepLabels = [
    'Heirs',
    'Safety & timing',
    existing ? 'Review changes' : 'Review & fund',
  ];
  const back = walletPath(existing ? '/wallet/plan' : '/wallet', demo);
  const previousStep = useRef(step);

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    stepTitle.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function go(next: number) {
    setError('');
    setStep(next);
  }

  function changeHeir(
    heir: Heir,
    field: 'name' | 'address' | 'share',
    value: string,
  ) {
    setError('');
    if (mode === 'faraid' && field !== 'share') {
      setFamilyPeople((people) => ({
        ...people,
        [heir.id]: { name: heir.name, address: heir.address, [field]: value },
      }));
    } else {
      setManualHeirs((people) =>
        people.map((person) =>
          person.id === heir.id ? { ...person, [field]: value } : person,
        ),
      );
    }
  }

  function validateHeirs() {
    if (mode === 'faraid' && !familyResult.ok) return familyResult.message;
    const invalid = heirs.findIndex((heir) => !planAddressHash(heir.address));
    if (invalid !== -1)
      return `Enter a valid ${api.NETWORK === 'chipnet' ? 'testnet ' : ''}BCH address for ${heirs[invalid].name.trim() || `heir ${invalid + 1}`}.`;
    if (
      shares.some((share) => share <= 0n) ||
      totalShares >= BigInt(api.MAX_INT32)
    )
      return 'Use positive whole numbers for the shares and reduce any unusually large values.';
    return '';
  }

  function validateSafety() {
    const hashes = contacts.map(planAddressHash);
    const invalid = hashes.indexOf(null);
    if (invalid !== -1)
      return `Enter a valid ${api.NETWORK === 'chipnet' ? 'testnet ' : ''}BCH address for trusted contact ${invalid + 1}.`;
    if (
      new Set(hashes).size !== 3 ||
      (walletHash && hashes.includes(walletHash))
    )
      return 'Use three different trusted contact addresses. Each must be different from the owner’s address.';
    if (waitingSeconds === null || reviewSeconds === null)
      return 'Choose a waiting time of 1 to 3,650 days and a review period of 1 to 365 days.';
    return '';
  }

  async function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const issue =
      (step !== 1 ? validateHeirs() : '') ||
      (step !== 0 ? validateSafety() : '');
    if (issue) {
      setError(issue);
      return;
    }
    if (step < 2) {
      go(step + 1);
      return;
    }
    if (
      !wallet.wallet ||
      wrongWallet ||
      waitingSeconds === null ||
      reviewSeconds === null
    )
      return;
    setBusy(true);
    setError('');
    try {
      const policy: api.PusakaV2PolicyInput = {
        inactivityPeriodSeconds: waitingSeconds,
        reviewPeriodSeconds: reviewSeconds,
        feeBudget: existing ? BigInt(existing.feeBudget) : 5000n,
        contacts: contacts.map((address) => address.trim()) as [
          string,
          string,
          string,
        ],
        heirs: heirs.map((heir, i) => ({
          pkh: heir.address.trim(),
          share: shares[i],
          label: heir.name.trim(),
        })),
      };
      if (existing)
        setPrepared(await api.prepareAction(existing, 'policy', { policy }));
      else {
        const deposit = api.parseBch(amount.trim());
        if (deposit < api.MIN_PLAN_CARRIER_SATS)
          throw new Error(
            `The starting transfer must be at least ${formatBch(api.MIN_PLAN_CARRIER_SATS)} BCH.`,
          );
        setPrepared(await api.prepareCreate(policy, deposit));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function gather() {
    setBusy(true);
    setError('');
    try {
      setPrepared(await api.prepareGather());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pw-page pw-setup">
      <PageHeading
        title={
          existing ? 'Edit inheritance rules' : 'Set up your Pusaka wallet'
        }
        description={
          existing
            ? 'Update your heirs, trusted contacts, or waiting time.'
            : 'Choose your heirs and set the rules that protect your BCH.'
        }
      >
        <ButtonLink to={back} variant="ghost" icon={<ArrowLeft />}>
          {existing ? 'Back to inheritance' : 'Back to wallet'}
        </ButtonLink>
      </PageHeading>
      <nav className="pw-stepper" aria-label="Setup steps">
        <ol>
          {stepLabels.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                aria-current={step === i ? 'step' : undefined}
                data-complete={step > i || undefined}
                disabled={step < i || busy}
                onClick={() => go(i)}
              >
                <span aria-hidden>
                  {step > i ? <Check size={14} /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {error && (
        <div className="pw-setup-error" tabIndex={-1} ref={errorRef}>
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      )}
      {preparationTx && (
        <TransactionNotice
          txid={preparationTx}
          dismiss={() => setPreparationTx('')}
        />
      )}
      <form
        id={formId}
        className="pw-setup-form"
        onSubmit={advance}
        noValidate
        aria-labelledby={titleId}
      >
        <div className="pw-columns pw-setup-columns">
          <div className="pw-column" key={step}>
            {step === 0 && (
              <>
                <Card>
                  <div className="pw-card-heading">
                    <div>
                      <h2 id={titleId} tabIndex={-1} ref={stepTitle}>
                        Who should inherit?
                      </h2>
                      <p>Choose how your BCH is divided among your heirs.</p>
                    </div>
                  </div>
                  <div
                    className="pw-split-options"
                    role="group"
                    aria-label="Share calculation"
                  >
                    {SPLITS.map(({ id, title, description, Icon }) => (
                      <button
                        type="button"
                        key={id}
                        aria-pressed={mode === id}
                        aria-label={title}
                        onClick={() => {
                          setMode(id);
                          setError('');
                        }}
                      >
                        <span className="pw-split-top">
                          <span className="pw-symbol">
                            <Icon size={18} aria-hidden />
                          </span>
                          {mode === id && <Check size={16} aria-hidden />}
                        </span>
                        <strong>{title}</strong>
                        <span className="pw-muted">{description}</span>
                      </button>
                    ))}
                  </div>
                </Card>
                {mode === 'faraid' && (
                  <Card>
                    <CardHeading
                      title="Family members"
                      description="This estimate covers common Sunni family cases. Verify the shares for your family before approving."
                    />
                    <FamilyFields
                      family={family}
                      setFamily={(next) => {
                        setFamily(next);
                        setError('');
                      }}
                    />
                    {!familyResult.ok && (
                      <p className="pw-fine" aria-live="polite">
                        {familyResult.message}
                      </p>
                    )}
                  </Card>
                )}
                {heirs.length > 0 && (
                  <Card>
                    <CardHeading
                      title="Heir details"
                      description="Use a BCH receive address for each person."
                    />
                    <div className="pw-heir-fields">
                      {heirs.map((heir, i) => (
                        <fieldset key={heir.id}>
                          <legend>{`Heir ${i + 1}`}</legend>
                          <div className="pw-heir-input">
                            <label>
                              Name
                              <input
                                value={heir.name}
                                placeholder={`Heir ${i + 1}`}
                                onChange={(event) =>
                                  changeHeir(heir, 'name', event.target.value)
                                }
                              />
                            </label>
                            <label>
                              BCH address
                              <input
                                required
                                value={heir.address}
                                spellCheck={false}
                                autoCapitalize="off"
                                placeholder={`${planAddressPrefix}…`}
                                onChange={(event) =>
                                  changeHeir(
                                    heir,
                                    'address',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            {mode === 'custom' && (
                              <label>
                                Share units
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={heir.share}
                                  onChange={(event) =>
                                    changeHeir(
                                      heir,
                                      'share',
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                            )}
                            {mode !== 'faraid' && heirs.length > 1 && (
                              <button
                                type="button"
                                className="pw-icon"
                                title="Remove heir"
                                aria-label={`Remove heir ${i + 1}`}
                                onClick={() => {
                                  setManualHeirs((rows) =>
                                    rows.filter((row) => row.id !== heir.id),
                                  );
                                  setError('');
                                }}
                              >
                                <Trash2 size={16} aria-hidden />
                              </button>
                            )}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                    {mode === 'custom' && (
                      <p className="pw-fine">
                        Shares are relative. For example, 2 and 1 give one heir
                        two thirds and the other one third.
                      </p>
                    )}
                    {mode !== 'faraid' && heirs.length < api.MAX_HEIRS && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="pw-fit"
                        icon={<Plus />}
                        onClick={() => {
                          const heir = initialHeir(nextId.current++);
                          setManualHeirs((rows) => [...rows, heir]);
                        }}
                      >
                        Add heir
                      </Button>
                    )}
                  </Card>
                )}
              </>
            )}
            {step === 1 && (
              <>
                <Card>
                  <div className="pw-card-heading">
                    <div>
                      <h2 id={titleId} tabIndex={-1} ref={stepTitle}>
                        People who can look out for you
                      </h2>
                      <p>
                        Choose three trusted contacts. Any two can start a claim
                        review. Only the owner can spend the BCH.
                      </p>
                    </div>
                  </div>
                  <div className="pw-form">
                    {contacts.map((address, i) => (
                      <label key={i}>
                        Trusted contact {i + 1}
                        <input
                          required
                          spellCheck={false}
                          autoCapitalize="off"
                          value={address}
                          placeholder={`${planAddressPrefix}…`}
                          onChange={(event) => {
                            setContacts((rows) =>
                              rows.map((value, j) =>
                                j === i ? event.target.value : value,
                              ),
                            );
                            setError('');
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </Card>
                <Card>
                  <CardHeading
                    title="Waiting and review periods"
                    description="The review period gives you time to stop a claim after it opens."
                  />
                  <div className="pw-field-grid">
                    <label>
                      Waiting time (days)
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={days}
                        onChange={(event) => {
                          setDays(event.target.value);
                          setError('');
                        }}
                      />
                    </label>
                    <label>
                      Claim review (days)
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={reviewDays}
                        onChange={(event) => {
                          setReviewDays(event.target.value);
                          setError('');
                        }}
                      />
                    </label>
                  </div>
                  <p className="pw-fine">
                    Sending a payment or pressing “I’m still here” starts the
                    waiting time again. Receiving BCH leaves the clock
                    unchanged. The network rounds the review period up to its
                    next time increment.
                  </p>
                </Card>
              </>
            )}
            {step === 2 && (
              <>
                <Card>
                  <div className="pw-card-heading">
                    <div>
                      <h2 id={titleId} tabIndex={-1} ref={stepTitle}>
                        {existing ? 'Review the new rules' : 'Fund your wallet'}
                      </h2>
                      <p>
                        {existing
                          ? 'The new rules keep your receive address and clear previous contact confirmations.'
                          : 'Your first transfer creates a dedicated receive address and funds your spendable balance.'}
                      </p>
                    </div>
                  </div>
                  {!existing && (
                    <label>
                      Starting transfer (BCH)
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => {
                          setAmount(event.target.value);
                          setError('');
                        }}
                      />
                    </label>
                  )}
                  <div className="pw-setup-hint">
                    <Wallet size={19} aria-hidden />
                    <p>
                      {existing
                        ? 'Save and share the updated plan after approval.'
                        : 'The transfer keeps 1,000 satoshis reserved inside Pusaka. Keep at least 600 satoshis in Paytaca to authorize later actions.'}
                    </p>
                  </div>
                  {!existing && wallet.wallet && !wrongWallet && (
                    <Button
                      type="button"
                      className="pw-fit"
                      variant="secondary"
                      loading={busy}
                      onClick={() => void gather()}
                    >
                      Prepare wallet
                    </Button>
                  )}
                  {wrongWallet && (
                    <ErrorNotice>
                      {existing
                        ? 'Connect the wallet that owns this plan to make changes.'
                        : 'Connect a wallet on this Bitcoin Cash network.'}
                    </ErrorNotice>
                  )}
                  {connectError && !wallet.wallet && (
                    <p className="pw-fine" role="status">
                      Wallet connection cancelled. You can try again when you’re
                      ready.
                    </p>
                  )}
                </Card>
              </>
            )}
          </div>
          <aside className="pw-column pw-setup-side">
            <Card>
              <CardHeading title="Plan summary">
                <span className="pw-symbol pw-symbol--accent">
                  <ShieldCheck size={18} aria-hidden />
                </span>
              </CardHeading>
              <Details
                rows={[
                  ['Share method', activeSplit?.title],
                  ['Heirs', heirs.length],
                  [
                    'Trusted contacts',
                    `${contacts.filter((address) => address.trim()).length} of 3 entered`,
                  ],
                  [
                    'Waiting time',
                    waitingSeconds === null
                      ? 'Choose a duration'
                      : `${Number(days).toLocaleString('en-US', { maximumFractionDigits: 3 })} days`,
                  ],
                  [
                    'Claim review',
                    reviewSeconds === null
                      ? 'Choose a duration'
                      : `${Number(reviewDays).toLocaleString('en-US', { maximumFractionDigits: 3 })} days`,
                  ],
                ]}
              />
              {totalShares > 0n && (
                <div className="pw-setup-distribution">
                  <ShareBreakdown shares={shares.map(Number)} />
                  <ul>
                    {heirs.map((heir, i) => (
                      <li key={heir.id}>
                        <span>
                          <i
                            style={{ background: `var(--heir-${(i % 5) + 1})` }}
                            aria-hidden
                          />
                          {heir.name.trim() || `Heir ${i + 1}`}
                        </span>
                        <strong className="num">
                          {(
                            (Number(shares[i]) / Number(totalShares)) *
                            100
                          ).toLocaleString('en-US', {
                            maximumFractionDigits: 2,
                          })}
                          %
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </aside>
        </div>
      </form>
      <footer className="pw-setup-footer">
        <div className="pw-setup-back">
          {step > 0 ? (
            <Button
              type="button"
              variant="ghost"
              icon={<ArrowLeft />}
              disabled={busy}
              onClick={() => go(step - 1)}
            >
              Back
            </Button>
          ) : (
            <Link to={back} className="pw-card-link">
              Cancel
            </Link>
          )}
          <span>
            Step {step + 1} of {stepLabels.length}
          </span>
        </div>
        {step === 2 && !wallet.wallet ? (
          <Button
            type="button"
            icon={<Wallet />}
            loading={wallet.status === 'connecting'}
            onClick={async () => {
              setConnectError(false);
              setConnectError(!(await wallet.connect()));
            }}
          >
            {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
          </Button>
        ) : (
          <Button
            type="submit"
            form={formId}
            loading={busy}
            disabled={step === 2 && wrongWallet}
            icon={<ArrowRight />}
          >
            {busy ? 'Preparing…' : step < 2 ? 'Continue' : 'Review transaction'}
          </Button>
        )}
      </footer>
      {prepared && (
        <TransactionReview
          prepared={prepared}
          close={() => setPrepared(null)}
          done={(txid) => {
            const plan = prepared.metadata;
            setPrepared(null);
            if (plan) {
              selectPlan(plan);
              navigate(api.encodePusakaV2PlanLink(plan, '/v2/plan'), {
                state: { txid, savePlan: true },
              });
            } else setPreparationTx(txid);
          }}
        />
      )}
    </div>
  );
}

function FamilyFields({
  family,
  setFamily,
}: {
  family: Family;
  setFamily: (next: Family) => void;
}) {
  return (
    <div className="pw-family">
      <label>
        Spouse
        <select
          value={family.spouse}
          onChange={(event) =>
            setFamily({
              ...family,
              spouse: event.target.value as Family['spouse'],
            })
          }
        >
          <option value="none">None</option>
          <option value="wife">Wife</option>
          <option value="husband">Husband</option>
        </select>
      </label>
      {family.spouse === 'wife' && (
        <label>
          Wives
          <input
            type="number"
            min="1"
            max="4"
            value={family.wives}
            onChange={(event) =>
              setFamily({ ...family, wives: Number(event.target.value) })
            }
          />
        </label>
      )}
      {(
        [
          ['sons', 'Sons'],
          ['daughters', 'Daughters'],
          ['brothers', 'Brothers'],
          ['sisters', 'Sisters'],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min="0"
            max="10"
            value={family[key]}
            onChange={(event) =>
              setFamily({ ...family, [key]: Number(event.target.value) })
            }
          />
        </label>
      ))}
      <div className="pw-family-parents">
        <label>
          <input
            type="checkbox"
            checked={family.father}
            onChange={(event) =>
              setFamily({ ...family, father: event.target.checked })
            }
          />{' '}
          Father is living
        </label>
        <label>
          <input
            type="checkbox"
            checked={family.mother}
            onChange={(event) =>
              setFamily({ ...family, mother: event.target.checked })
            }
          />{' '}
          Mother is living
        </label>
      </div>
    </div>
  );
}
