// Footer for the home and How it works pages: links, donation address, licence, and the
// before/after note the README promises (what existed before BCH BLAZE 2026).
import { TRY_IT } from '../../lib/demo';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { shortAddress } from '../../lib/format';
import {
  BLAZE_START_URL,
  CONTRACT_URL,
  DOCS_URL,
  DONATION_ADDRESS,
  LICENSE_URL,
  OLD_DEMO_URL,
  OLD_REPO_URL,
  CODE_URL,
  SOLIDCASH_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
  TESTS_URL,
} from './links';
import { BASE } from '../../lib/asset';
import './home-footer.css';

function CopyAddress({ address }: { address: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  }

  return (
    <div className="copy-addr">
      <span className="copy-addr__text mono" title={address}>{shortAddress(address, 4, 4)}</span>
      <button type="button" className="copy-addr__btn" onClick={copy} aria-label={`Copy donation address ${address}`}>
        <span className="copy-addr__icon" data-on={state !== 'copied' || undefined}><Copy aria-hidden /></span>
        <span className="copy-addr__icon" data-on={state === 'copied' || undefined}><Check aria-hidden /></span>
      </button>
      <span className="copy-addr__status" aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy. Select the address to copy it." : ''}
      </span>
    </div>
  );
}

function Brand() {
  return (
    <div className="hfoot__brand">
      <Link to="/" className="hfoot__logo" aria-label="Pusaka home">
        <Logo size={24} />
        <span>Pusaka</span>
      </Link>
      <p className="hfoot__tag">Inheritance plans for Bitcoin Cash.</p>
      <p className="hfoot__tag">
        Open source, <a href={LICENSE_URL} target="_blank" rel="noreferrer">MIT</a>.
      </p>
    </div>
  );
}

function Columns() {
  return (
    <nav className="hfoot__cols" aria-label="Footer">
      <div className="hfoot__col">
        <p className="hfoot__label">Product</p>
        {TRY_IT && ('to' in TRY_IT ? <Link to={TRY_IT.to}>Try it now</Link> : <a href={TRY_IT.href}>Try it now</a>)}
        <Link to="/new">Create a plan</Link>
        <Link to="/how-it-works">How it works</Link>
      </div>
      <div className="hfoot__col">
        <p className="hfoot__label">Resources</p>
        <a href={DOCS_URL}>Docs</a>
        <a href={CODE_URL} target="_blank" rel="noreferrer">GitHub</a>
        <a href={CONTRACT_URL} target="_blank" rel="noreferrer">Source code</a>
        <a href={TESTS_URL} target="_blank" rel="noreferrer">Test suite</a>
        <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" title={`Message ${TELEGRAM_HANDLE} on Telegram`}>
          Need help? Telegram
        </a>
      </div>
      <div className="hfoot__col">
        <p className="hfoot__label">Built on</p>
        <a href="https://bitcoincash.org" target="_blank" rel="noreferrer">Bitcoin Cash</a>
        <a href={SOLIDCASH_URL} target="_blank" rel="noreferrer">SolidCash</a>
        <a href="https://docs.riftenlabs.com/wizardconnect/" target="_blank" rel="noreferrer">WizardConnect</a>
      </div>
    </nav>
  );
}

function Donate() {
  return (
    <div className="hfoot__donate">
      <p className="hfoot__label">Donations</p>
      <CopyAddress address={DONATION_ADDRESS} />
    </div>
  );
}

function History() {
  return (
    <p className="hfoot__history">
      Built during BCH BLAZE 2026 (14 to 22 November). Before it, Pusaka ran on Monad:{' '}
      <a href={OLD_REPO_URL} target="_blank" rel="noreferrer">old code</a> and{' '}
      <a href={OLD_DEMO_URL} target="_blank" rel="noreferrer">old demo</a>. Reused from it: the idea, the faraid share
      calculator and the flower logo. Everything after the{' '}
      <a href={BLAZE_START_URL} target="_blank" rel="noreferrer">blaze-start</a> tag is new.
    </p>
  );
}

/**
 * `scene` (the home page): the footer sits on the rice terraces, with the sky cut out so the hills rise straight
 * from the page. Links sit on the page above the terraces at every width. The night picture follows the dark theme.
 */
export function HomeFooter({ scene = false }: { scene?: boolean }) {
  if (scene) {
    return (
      <footer className="hfoot hfoot--scene">
        <div className="hfoot__page">
          <Brand />
          <Columns />
          <Donate />
        </div>
        <div className="hfoot__meadow">
          <img
            className="hfoot__img hfoot__img--day"
            src={`${BASE}landing/footer-terraces-1600.webp`}
            srcSet={`${BASE}landing/footer-terraces-1600.webp 1600w, ${BASE}landing/footer-terraces.webp 2400w`}
            sizes="100vw"
            alt="Green rice terraces below a volcano, with a timber hut, coconut palms and a bloom on a lily pad."
            width={2400}
            height={800}
            loading="lazy"
            decoding="async"
          />
          <img
            className="hfoot__img hfoot__img--night"
            src={`${BASE}landing/footer-terraces-night-1600.webp`}
            srcSet={`${BASE}landing/footer-terraces-night-1600.webp 1600w, ${BASE}landing/footer-terraces-night.webp 2400w`}
            sizes="100vw"
            alt="The same terraces by moonlight, the hut's window lit, fireflies and a bloom on a lily pad."
            width={2400}
            height={800}
            loading="lazy"
            decoding="async"
          />
          <div className="hfoot__bottom">
            <History />
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="hfoot">
      <div className="hfoot__inner">
        <Brand />
        <Columns />
        <Donate />
      </div>
      <History />
    </footer>
  );
}
