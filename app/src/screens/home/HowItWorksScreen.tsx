// "How it works": the plain-words lifecycle, what happens if this website disappears, the honest
// limits, and one section for the technical reader. The only page allowed to say "contract".
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Hand, Hourglass, Send, Undo2, UsersRound } from 'lucide-react';
import { planService } from '../../lib/planService';
import { formatUsd } from '../../lib/format';
import { MAX_HEIRS } from '../../lib/shares';
import { HomeFooter } from './HomeFooter';
import { CONTRACT_URL, DX_LOG_URL, REPO_URL, SOLIDCASH_URL, TESTS_URL } from './links';
import { ButtonLink } from '../../components/Button';
import './how-it-works.css';

/** Measured on Chipnet: every plan action is a 9 to 12 KB transaction at about 1 satoshi per byte. */
const FEE_LOW = 9_000n;
const FEE_HIGH = 12_000n;

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

const CODE = `function distribute() public {
  require(tx.time >= this.deadline);
  int pot = this.balance - feeBudget;
  payHeir(0, pot);
  // … one slot per heir, up to payHeir(9, pot)
}

function payHeir(int i, int pot) internal {
  if (i < int(this.heirs.length)) {
    this.transfer(
      new LockingBytecodeP2PKH(this.heirs[i].pkh),
      pot * this.heirs[i].share / totalShares
    );
  }
}`;

export function HowItWorksScreen() {
  const usd = useUsdPerBch();
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
            A Pusaka plan holds your BCH on the Bitcoin Cash network, not with us. It waits for you to say you're still
            here. If you stop, it sends each heir their share.
          </p>
        </header>

        {/* ------------------------------------------------ lifecycle */}
        <section className="hiw-section" aria-labelledby="hiw-life">
          <h2 id="hiw-life" className="sr-only">The life of a plan</h2>
          <ol className="timeline">
            <li className="timeline__step">
              <span className="timeline__icon" aria-hidden><UsersRound /></span>
              <div>
                <h3>1. Make a plan</h3>
                <p>
                  Add your heirs (up to {MAX_HEIRS}), choose their shares and a waiting time, for example six months.
                  Your BCH moves from your wallet into the plan. You get a <strong>plan link</strong>: save it, and
                  share it with your heirs.
                </p>
              </div>
            </li>
            <li className="timeline__step">
              <span className="timeline__icon" aria-hidden><Hand /></span>
              <div>
                <h3>2. I'm still here</h3>
                <p>
                  Now and then, open your plan and tap <strong>I'm still here</strong>. Your wallet signs, and the
                  waiting time starts again from that moment. Nothing else changes.
                </p>
              </div>
            </li>
            <li className="timeline__step">
              <span className="timeline__icon" aria-hidden><Hourglass /></span>
              <div>
                <h3>3. The waiting time runs out</h3>
                <p>
                  If you don't tap it in time, the waiting time ends. Until then, only you can move the BCH in your plan.
                </p>
              </div>
            </li>
            <li className="timeline__step">
              <span className="timeline__icon timeline__icon--done" aria-hidden><Send /></span>
              <div>
                <h3>4. Send to heirs</h3>
                <p>
                  Now anyone with the plan link can press <strong>Send to heirs</strong>: an heir, a friend, a lawyer.
                  One payment pays every heir their share at the same moment. Nobody, not even the person who presses,
                  can change who gets what.
                </p>
              </div>
            </li>
          </ol>

          <div className="anytime">
            <span className="timeline__icon" aria-hidden><Undo2 /></span>
            <div>
              <h3>At any time before that: take my BCH back</h3>
              <p>
                Changed your mind, or your family changed? Until the BCH is sent to your heirs, you can take all of it
                back to your wallet, and make a new plan if you like.
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
              <p>It sits in a contract on the Bitcoin Cash network, which only follows the rules of your plan.</p>
            </li>
            <li>
              <h3>The plan link carries everything</h3>
              <p>
                Heirs, shares, waiting time: it's all inside the link, after the <code>#</code>. Browsers never send
                that part to a server, so we never see it.
              </p>
            </li>
            <li>
              <h3>Anyone can run the code</h3>
              <p>
                The app is open source. Anyone can host a copy, open the plan link there and send the BCH to your
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
              <strong>Keep the plan link.</strong> Without it, nobody can find your plan to send it. Give it to your
              heirs, or keep it where they will look.
            </li>
            <li>
              <strong>Every action has a network fee</strong> of about {fee}, paid by whoever presses the button.
              That includes Send to heirs, so whoever sends needs a little BCH in their own wallet.
            </li>
            <li>
              <strong>Making a plan has a small Pusaka fee</strong> of about $1, paid once. You see it, with every
              other amount, before your wallet asks you to sign.
            </li>
            <li>
              <strong>Dates are right to about an hour.</strong> The Bitcoin Cash network's clock runs about an hour
              behind real time, and the plan follows the network's clock.
            </li>
            <li>
              <strong>Up to {MAX_HEIRS} heirs per plan.</strong> Each heir needs a BCH address, and each share must be
              at least 546 satoshis.
            </li>
            <li>
              <strong>Shares are fixed when you make the plan.</strong> If your family changes, take your BCH back and
              make a new plan.
            </li>
            <li>
              <strong>Islamic inheritance (faraid)</strong> shares are worked out in your browser from the family you
              describe. The network then enforces those numbers; it does not check the rules of faraid itself.
            </li>
            <li>
              <strong>It is not a legal will.</strong> It only moves the BCH in the plan.
            </li>
          </ul>
        </section>

        {/* ------------------------------------------------ technical */}
        <section className="hiw-section hiw-tech" aria-labelledby="hiw-tech">
          <p className="hiw-eyebrow">For the technical reader</p>
          <h2 id="hiw-tech">Under the hood</h2>
          <p className="hiw-section__lead">
            Each plan is its own <Ext href={SOLIDCASH_URL}>SolidCash</Ext> contract: Solidity-style source, compiled to
            native Bitcoin Cash script. No server, no oracle, no admin key.
          </p>

          <dl className="tech">
            <div>
              <dt>State</dt>
              <dd>
                <code>deadline</code> in unix seconds, and <code>heirs[]</code>, each a public key hash and a share. The
                owner, the waiting time, the share total and a fee budget are fixed when the plan is made.
              </dd>
            </div>
            <div>
              <dt>I'm still here</dt>
              <dd>
                <code>checkIn()</code>. The owner's own ordinary coin must be spent in the same transaction
                (<code>tx.origin</code>), so any WizardConnect wallet can sign it. It sets{' '}
                <code>deadline = tx.locktime + period</code>.
              </dd>
            </div>
            <div>
              <dt>Take my BCH back</dt>
              <dd><code>withdraw()</code>. Same owner check; everything goes to the owner's address.</dd>
            </div>
            <div>
              <dt>Send to heirs</dt>
              <dd>
                <code>distribute()</code>. Needs no signature, only <code>tx.time &gt;= deadline</code>. Each heir gets{' '}
                <code>pot × share ÷ total</code>, rounded down; leftover satoshis go to the network fee.
              </dd>
            </div>
            <div>
              <dt>Where the shares are enforced</dt>
              <dd>
                In <code>distribute()</code> itself. Every node checks the payment's outputs against the heirs in the
                contract's state. A payment that is early, pays any heir one satoshi less, or swaps an address is
                invalid and never confirms.
              </dd>
            </div>
            <div>
              <dt>Time, not blocks</dt>
              <dd>
                The waiting time is counted in seconds. Bitcoin Cash moves to one-minute blocks in May 2027; a timer
                counted in blocks would then run out ten times too early.
              </dd>
            </div>
            <div>
              <dt>Why {MAX_HEIRS} heirs</dt>
              <dd>
                In SolidCash 0.50 a payout loop can't be combined with a time check, so the payout uses ten unrolled
                slots. A ten-heir payout is about a 12 KB transaction.
              </dd>
            </div>
            <div>
              <dt>Tested</dt>
              <dd>
                Tests in solidhat run under the real 2026 network limits. On 15 November 2026 the whole lifecycle ran
                on Chipnet: create, I'm still here, take back, and a payout to six heirs in one 11,896-byte
                transaction.
              </dd>
            </div>
          </dl>

          <figure className="code">
            <figcaption>The payout, from <code>Pusaka.scash</code></figcaption>
            <pre tabIndex={0}><code>{CODE}</code></pre>
          </figure>

          <ul className="tech-links">
            <li><Ext href={CONTRACT_URL}>Contract source</Ext></li>
            <li><Ext href={TESTS_URL}>Tests</Ext></li>
            <li><Ext href={DX_LOG_URL}>What we learned porting it to SolidCash</Ext></li>
            <li><Ext href={REPO_URL}>Repository</Ext></li>
          </ul>
        </section>

        <section className="hiw-cta">
          <h2>See it work</h2>
          <p>Open a sample plan whose waiting time has passed, and send it to its heirs.</p>
          <div className="hiw-cta__btns">
            <ButtonLink to="/try" size="lg">Try it now</ButtonLink>
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
