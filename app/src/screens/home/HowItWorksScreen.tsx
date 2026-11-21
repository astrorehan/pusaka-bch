// "How it works": the plain-words life of a Pusaka wallet, what happens if this website disappears, the honest
// limits, and one section for the technical reader. The only page allowed to say "contract".
import { TRY_IT } from '../../lib/demo';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Hourglass, Send, ShieldCheck, Undo2, UsersRound, WalletCards } from 'lucide-react';
import { planService } from '../../lib/planService';
import { formatUsd } from '../../lib/format';
import { MAX_HEIRS } from '../../lib/shares';
import { HomeFooter } from './HomeFooter';
import { CONTRACT_URL, DX_LOG_URL, PLAN_CONTRACT_URL, PROOF_URL, CODE_URL, SOLIDCASH_URL, TESTS_URL } from './links';
import { ButtonLink } from '../../components/Button';
import './how-it-works.css';

/** Measured on Chipnet: opening a claim or paying the heirs is a 4 to 5 KB transaction at 1 satoshi per byte. */
const FEE_LOW = 4_000n;
const FEE_HIGH = 5_000n;

function useUsdPerBch(): number | null {
  const [usd, setUsd] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    planService.usdPerBch().then((v) => live && setUsd(v)).catch(() => {});
    return () => { live = false; };
  }, []);
  return usd;
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="hiw-ext">
      {children}
      <ExternalLink aria-hidden />
    </a>
  );
}

const CODE = `// PusakaV2ReviewAnchor: the review period, kept by the network itself
function finalize() {
  require(tx.version >= 2, "BIP68 needs version 2");
  require(this.age >= reviewSequence, "review delay has not elapsed");
}

// PusakaAssetPlan.finalizeClaim: every heir, exactly their share
for (int i = 0; i < heirCount; i++) {
  bytes entry = heirsSlice.slice(i * 24, i * 24 + 24);
  bytes pkhBytes, bytes shareBytes = entry.split(20);
  int expected = (pot * int(shareBytes)) / totalShares;
  require(expected >= 546, "heir share below dust");
  require(tx.outputs[1 + i].lockingBytecode ==
    new LockingBytecodeP2PKH(unsafe_bytes20(pkhBytes)), "wrong heir address");
  require(tx.outputs[1 + i].value == expected, "wrong heir amount");
}`;

export function HowItWorksScreen() {
  const usd = useUsdPerBch();
  useEffect(() => {
    document.title = 'How it works · Pusaka';
    return () => { document.title = 'Pusaka'; };
  }, []);
  const feeUsd = formatUsd(FEE_HIGH, usd);
  const fee = (
    <>
      {FEE_LOW.toLocaleString('en-US')} to {FEE_HIGH.toLocaleString('en-US')} satoshis
      {feeUsd && <> ({feeUsd} at most)</>}
    </>
  );

  return (
    <div className="hiw">
      <article className="hiw__col">
        <header className="hiw__intro enter">
          <p className="hiw-eyebrow">How it works</p>
          <h1>What happens to your BCH, step by step</h1>
          <p className="hiw__lead">
            Pusaka is a Bitcoin Cash wallet with your inheritance plan built in. You spend and receive as usual. If you
            go quiet, a claim can open, you get time to stop it, and then each heir receives their share. The Bitcoin
            Cash network holds the coins and keeps the rules, not us.
          </p>
        </header>

        {/* ------------------------------------------------ lifecycle */}
        <section className="hiw-section" aria-labelledby="hiw-life">
          <h2 id="hiw-life" className="sr-only">The life of a Pusaka wallet</h2>
          <ol className="timeline">
            <li className="timeline__step">
              <span className="timeline__icon" aria-hidden><UsersRound /></span>
              <div>
                <h3>1. Set up your wallet</h3>
                <p>
                  Choose your heirs (up to {MAX_HEIRS}) and how they share: equally, your own split, or Islamic faraid.
                  Name three <strong>trusted contacts</strong>, and pick a waiting time and a review period. Your BCH
                  moves into your Pusaka wallet. You get a <strong>plan link</strong>: save it, and share it with your
                  family.
                </p>
              </div>
            </li>
            <li className="timeline__step">
              <span className="timeline__icon" aria-hidden><WalletCards /></span>
              <div>
                <h3>2. Use it like any wallet</h3>
                <p>
                  Send and receive from Pusaka. <strong>Every payment you send</strong>, or a tap on{' '}
                  <strong>I'm still here</strong>, starts the waiting time again. BCH that others send you arrives at
                  your receive address and follows the same rules.
                </p>
              </div>
            </li>
            <li className="timeline__step">
              <span className="timeline__icon" aria-hidden><Hourglass /></span>
              <div>
                <h3>3. A claim opens</h3>
                <p>
                  If the waiting time runs out, anyone can open a claim. Two of your three trusted contacts can open
                  one sooner, for example after an accident. Opening a claim moves nothing: your BCH stays put.
                </p>
              </div>
            </li>
            <li className="timeline__step">
              <span className="timeline__icon" aria-hidden><ShieldCheck /></span>
              <div>
                <h3>4. The review period</h3>
                <p>
                  The claim then waits through a review period, a week for example. On plans made since 20 November the
                  network itself enforces it: a payout sent early is refused. If you are still here, <strong>Stop claim</strong>, or any payment you
                  send, ends the claim.
                </p>
              </div>
            </li>
            <li className="timeline__step">
              <span className="timeline__icon timeline__icon--done" aria-hidden><Send /></span>
              <div>
                <h3>5. Pay the heirs</h3>
                <p>
                  After the review, anyone with the plan link can press <strong>Pay the heirs</strong>: an heir, a
                  friend, a lawyer. One payment pays every heir their share at the same moment, and the plan pays the
                  network fee. Nobody, not even the person who presses, can change who gets what.
                </p>
              </div>
            </li>
          </ol>

          <div className="anytime">
            <span className="timeline__icon" aria-hidden><Undo2 /></span>
            <div>
              <h3>At any time before that: change the plan, or take your BCH back</h3>
              <p>
                Changed your mind, or your family changed? Edit the heirs, shares, contacts and times, or take the
                available BCH back to your own wallet. Each change needs your wallet's approval, and nobody else's.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ if pusaka disappears */}
        <section className="hiw-section" aria-labelledby="hiw-gone">
          <h2 id="hiw-gone">If the Pusaka website disappears</h2>
          <p className="hiw-section__lead">Your plan keeps working. Pusaka is a website, not a company holding your coins.</p>
          <ul className="facts">
            <li>
              <h3>Your BCH is not with us</h3>
              <p>It sits in contracts on the Bitcoin Cash network, which only follow the rules of your plan.</p>
            </li>
            <li>
              <h3>The plan link carries everything</h3>
              <p>
                Heirs, shares, contacts and times: it's all inside the link, after the <code>#</code>. Browsers never
                send that part to a server, so we never see it.
              </p>
            </li>
            <li>
              <h3>Anyone can run the code</h3>
              <p>
                The app is open source. Anyone can host a copy, open the plan link there, open the claim and pay your
                heirs.
              </p>
            </li>
          </ul>
        </section>

        {/* ------------------------------------------------ limits */}
        <section className="hiw-section" aria-labelledby="hiw-limits">
          <h2 id="hiw-limits">Good to know</h2>
          <p className="hiw-section__lead">The honest limits, before you trust it with your savings.</p>
          <ul className="limits">
            <li>
              <strong>Keep the plan link.</strong> Without it, nobody can open a claim or pay your heirs. Give it to
              your heirs and contacts, and share it again after every change.
            </li>
            <li>
              <strong>Opening a claim and paying the heirs each cost a network fee</strong> of about {fee}, taken from
              the plan itself, so an heir needs no BCH of their own. Your own payments and changes cost a similar fee
              from your wallet.
            </li>
            <li>
              <strong>Pusaka takes no fee of its own today.</strong> You see every amount before your wallet asks you
              to sign.
            </li>
            <li>
              <strong>Trusted contacts can start a claim, never take your BCH.</strong> Each needs their own wallet with
              a little BCH to confirm. Any payment you send ends their claim.
            </li>
            <li>
              <strong>A lost key doesn't mean lost coins.</strong> If you can no longer sign, two of your contacts can
              open a claim, and after the review the plan pays the people you named. Add a second wallet of your own
              among them, and that share comes back to you.
            </li>
            <li>
              <strong>Dates are right to about an hour.</strong> The Bitcoin Cash network's clock runs about an hour
              behind real time, and the plan follows the network's clock.
            </li>
            <li>
              <strong>Up to {MAX_HEIRS} heirs per plan.</strong> Each heir needs a BCH address, and each share must be
              at least 546 satoshis when it is paid. 1,000 satoshis always stay in the plan to carry its rules.
            </li>
            <li>
              <strong>Islamic inheritance (faraid)</strong> shares are worked out in your browser from the family you
              describe. The network then enforces those numbers; it does not check the rules of faraid itself.
            </li>
            <li>
              <strong>It is not a legal will.</strong> It only moves the BCH and tokens held by the plan.
            </li>
          </ul>
        </section>

        {/* ------------------------------------------------ technical */}
        <section className="hiw-section hiw-tech" aria-labelledby="hiw-tech">
          <p className="hiw-eyebrow">For the technical reader</p>
          <h2 id="hiw-tech">Under the hood</h2>
          <p className="hiw-section__lead">
            Each wallet is a small set of <Ext href={SOLIDCASH_URL}>SolidCash</Ext> contracts: Solidity-style source,
            compiled to native Bitcoin Cash script. No server, no oracle, no admin key.
          </p>

          <dl className="tech">
            <div>
              <dt>State</dt>
              <dd>
                A CashTokens NFT that never leaves the plan carries 51 bytes of state: status, claim round, contact
                approvals, deadline, waiting time and a hash of the policy. The policy itself (heirs, shares, contacts,
                fee budget) travels in the plan link, and every claim transaction is checked against that hash.
              </dd>
            </div>
            <div>
              <dt>Your wallet</dt>
              <dd>
                <code>PusakaAssetPlan</code> holds the BCH. <code>send</code>, <code>checkIn</code>,{' '}
                <code>cancelClaim</code>, <code>updatePolicy</code> and <code>ownerExit</code> need the owner's own
                ordinary coin in the same transaction, so any WizardConnect wallet can sign them. Each one moves the
                deadline and cancels a pending claim.
              </dd>
            </div>
            <div>
              <dt>Receiving</dt>
              <dd>
                <code>PusakaV2Inbox</code> is the receive address. Anyone may collect its coins, but only into the plan,
                with the plan's state unchanged and a capped fee.
              </dd>
            </div>
            <div>
              <dt>Claims</dt>
              <dd>
                <code>openClaimByInactivity</code> needs <code>tx.time &gt;= deadline</code>.{' '}
                <code>contactApprove</code> records a distinct registered contact; the second one opens the claim. Both
                mint a claim marker to <code>PusakaV2ReviewAnchor</code>.
              </dd>
            </div>
            <div>
              <dt>The review period</dt>
              <dd>
                The marker can pay out only once <code>this.age &gt;= reviewSequence</code>: a time-based relative lock
                (BIP68) the network enforces. On Chipnet the network refused an early payout as non-final, then
                accepted it after the review.
              </dd>
            </div>
            <div>
              <dt>Where the shares are enforced</dt>
              <dd>
                In <code>finalizeClaim</code> itself, which loops over the heirs in the policy. Each gets{' '}
                <code>pot × share ÷ total</code>, rounded down, and every node checks each output's address and amount.
                A payout that is early, pays any heir one satoshi less, or swaps an address never confirms.
              </dd>
            </div>
            <div>
              <dt>Time, not blocks</dt>
              <dd>
                The waiting time is counted in seconds and the review in 512-second steps. Bitcoin Cash moves to
                one-minute blocks in May 2027; a timer counted in blocks would then run out ten times too early.
              </dd>
            </div>
            <div>
              <dt>Tested</dt>
              <dd>
                72 tests in SolidHat run under the 2026 network limits. On 19 November 2026 the whole lifecycle ran on
                Chipnet: create, receive, collect, send, two contacts open a claim, an early payout refused, the owner
                stops it, a second claim, and the payout to three heirs.
              </dd>
            </div>
          </dl>

          <figure className="code">
            <figcaption>The review period and the payout, from <code>PusakaV2ReviewAnchor.scash</code> and <code>PusakaAssetPlan.scash</code></figcaption>
            <pre tabIndex={0}><code>{CODE}</code></pre>
          </figure>

          <ul className="tech-links">
            <li><Ext href={PLAN_CONTRACT_URL}>Plan contract</Ext></li>
            <li><Ext href={CONTRACT_URL}>All contracts</Ext></li>
            <li><Ext href={TESTS_URL}>Tests</Ext></li>
            <li><Ext href={PROOF_URL}>On-chain proof</Ext></li>
            <li><Ext href={DX_LOG_URL}>What we learned building on SolidCash</Ext></li>
            <li><Ext href={CODE_URL}>Repository</Ext></li>
          </ul>
        </section>

        <section className="hiw-cta">
          <h2>See it work</h2>
          <p>{TRY_IT ? 'Open a live example plan, then open its claim or pay its heirs yourself. No wallet needed.' : 'Set up a protected wallet with your own inheritance rules.'}</p>
          <div className="hiw-cta__btns">
            {TRY_IT && <ButtonLink {...TRY_IT} size="lg">Try it now</ButtonLink>}
            <Link to="/new" className="hiw-cta__link">
              Create a plan <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
      </article>
      <HomeFooter />
    </div>
  );
}
