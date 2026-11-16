// The front door and landing page (DESIGN.md "Home page").
// First screen: promise, one sentence, the family flower, two buttons. Nothing else above the fold.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Link2, Play, Send, UsersRound } from 'lucide-react';
import type { SplitMode } from '../../lib/types';
import { HeroFlower } from './HeroFlower';
import { ShareFlower } from './ShareFlower';
import { heirColor, type FlowerHeir } from './flowerMath';
import { OpenLinkDialog } from './OpenLinkDialog';
import { HomeFooter } from './HomeFooter';
import { DEMO_VIDEO_URL } from './links';
import '../../components/button.css';
import './home.css';

interface Preset {
  mode: SplitMode;
  title: string;
  line: string;
  example: string;
  heirs: FlowerHeir[];
}

const h = (...shares: number[]): FlowerHeir[] => shares.map((share, i) => ({ name: `Heir ${i + 1}`, share }));

const PRESETS: Preset[] = [
  { mode: 'equal', title: 'Equal', line: 'Everyone gets the same.', example: '3 heirs · 33.3% each', heirs: h(1, 1, 1) },
  { mode: 'custom', title: 'Custom', line: 'You pick each share.', example: '3 heirs · 50%, 30% and 20%', heirs: h(50, 30, 20) },
  {
    mode: 'faraid',
    title: 'Islamic inheritance (faraid)',
    line: 'Shares follow faraid.',
    example: '6 heirs · wife 1/8, parents 1/6 each, children the rest',
    // wife 15, father 20, mother 20, two sons 26 each, daughter 13 (out of 120)
    heirs: h(15, 20, 20, 26, 26, 13),
  },
];

const STEPS = [
  { icon: UsersRound, title: 'Choose heirs', line: 'Add up to 10 people, their BCH addresses and the share each one gets.' },
  { icon: CalendarCheck, title: 'Check in now and then', line: 'Tap “I’m still here” before your waiting time runs out. It starts again from that day.' },
  { icon: Send, title: 'Missed it? They receive their shares', line: 'Once the waiting time has passed, every heir is paid their share in one payment.' },
];

const BUILT_WITH = ['Bitcoin Cash', 'SolidCash', 'WizardConnect', 'Paytaca', 'Cashonize'];

function ShareBar({ heirs }: { heirs: FlowerHeir[] }) {
  return (
    <div className="share-bar" aria-hidden>
      {heirs.map((x, i) => (
        <span key={i} style={{ flexGrow: x.share, background: heirColor(i) }} />
      ))}
    </div>
  );
}

export function HomeScreen() {
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__art">
          <HeroFlower />
        </div>
        <div className="home-hero__text enter">
          <p className="home-eyebrow">Inheritance plans for Bitcoin Cash</p>
          <h1 id="home-title" className="home-hero__title">Leave your BCH to the people you love.</h1>
          <p className="home-hero__lead">
            Choose your heirs and their shares. If you stop checking in, they receive it automatically, with no company
            in between.
          </p>
          <div className="home-hero__ctas">
            <Link to="/try" className="btn btn--primary btn--lg">Try it now</Link>
            <Link to="/new" className="btn btn--secondary btn--lg">Create a plan</Link>
          </div>
          <div className="home-hero__more">
            <button type="button" className="home-textlink" onClick={() => setLinkOpen(true)}>
              Have a plan link? <span className="home-textlink__em">Open it</span>
            </button>
            {DEMO_VIDEO_URL && (
              <a className="home-textlink" href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
                <Play aria-hidden /> <span className="home-textlink__em">Watch the demo</span>
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="home-built" aria-label="Built with">
        <p className="home-label">Built with</p>
        <ul className="home-built__list">
          {BUILT_WITH.map((name) => <li key={name}>{name}</li>)}
        </ul>
      </section>

      <section className="home-section" aria-labelledby="split-title">
        <header className="home-section__head">
          <h2 id="split-title">Choose how to split</h2>
          <p>Every family is different. Start from the split that fits yours, and adjust any share before you sign.</p>
        </header>
        <ul className="split-cards">
          {PRESETS.map((p, i) => (
            <li key={p.mode} className="split-card" style={{ ['--tint' as string]: heirColor(i) }}>
              <div className="split-card__head">
                <div className="split-card__art">
                  <ShareFlower heirs={p.heirs} size="100%" />
                </div>
                <div>
                  <h3 className="split-card__title">{p.title}</h3>
                  <p className="split-card__line">{p.line}</p>
                </div>
              </div>
              <ShareBar heirs={p.heirs} />
              <p className="split-card__example num">{p.example}</p>
              <Link
                to={`/new?split=${p.mode}`}
                className="btn btn--secondary btn--block split-card__btn"
                aria-label={`Start with this: ${p.title}`}
              >
                Start with this
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-section" aria-labelledby="how-title">
        <header className="home-section__head">
          <h2 id="how-title">How it works</h2>
        </header>
        <ol className="home-steps">
          {STEPS.map(({ icon: Icon, title, line }) => (
            <li key={title} className="home-step">
              <span className="home-step__icon" aria-hidden><Icon /></span>
              <h3 className="home-step__title">{title}</h3>
              <p className="home-step__line">{line}</p>
            </li>
          ))}
        </ol>
        <p className="home-section__more">
          <Link to="/how-it-works" className="home-arrowlink">
            Read the full explanation <ArrowRight aria-hidden />
          </Link>
        </p>
      </section>

      <section className="home-section">
        <div className="heir-band">
          <div>
            <h2 className="heir-band__title">Someone made you an heir?</h2>
            <p className="heir-band__line">
              Open the plan link they gave you to see your share, and when it can be sent to you.
            </p>
          </div>
          <button type="button" className="btn btn--secondary btn--lg heir-band__btn" onClick={() => setLinkOpen(true)}>
            <span className="btn__icon" aria-hidden><Link2 /></span>
            <span className="btn__label">Open a plan link</span>
          </button>
        </div>
      </section>

      <HomeFooter />
      <OpenLinkDialog open={linkOpen} onClose={() => setLinkOpen(false)} />
    </div>
  );
}
