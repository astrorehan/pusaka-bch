// The front door and landing page (DESIGN.md "Home page").
// The hero stands in the rice terrace at first light. Below it the page passes through one day on the paddy:
// the family cards, the scroll scene over the water (the plan, then the cheat attempts), the night payout among
// fireflies, a light sheet with the three steps, the heir box, the closing call and the terraces footer.
import { TRY_IT } from '../../lib/demo';
import { useEffect, useState } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { FlowerStage } from './FlowerStage';
import { SealedLetters } from './SealedLetters';
import { TimeScroll } from './TimeScroll';
import { CheatSection } from './CheatSection';
import { SubakPayout } from './SubakPayout';
import { StepsFrame } from './StepsFrame';
import { ClosingCta, HeirBand } from './ClosingSections';
import { OpenLinkDialog } from './OpenLinkDialog';
import { HomeFooter } from './HomeFooter';
import { DEMO_VIDEO_URL, SOLIDCASH_URL } from './links';
import { ButtonLink } from '../../components/Button';
import { BASE } from '../../lib/asset';
import './home.css';
import './home-hero.css';
import './home-landing.css';
import './landing.css';

const BUILT_WITH = [
  { name: 'Bitcoin Cash', logo: `${BASE}brands/bitcoin-cash.svg`, href: 'https://bitcoincash.org' },
  { name: 'SolidCash', logo: `${BASE}brands/solidcash.svg`, href: SOLIDCASH_URL },
  { name: 'WizardConnect', logo: `${BASE}brands/wizardconnect.png`, href: 'https://docs.riftenlabs.com/wizardconnect/' },
];

export function HomeScreen() {
  const [linkOpen, setLinkOpen] = useState(false);
  useEffect(() => { document.title = 'Pusaka: Your BCH. Their future.'; }, []);

  return (
    <div className="home home--studio">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__text enter">
          <p className="home-eyebrow">
            <span lang="id">Pusaka</span>
            <span className="sr-only">: </span>
            <span className="home-eyebrow__meaning">Indonesian for heirloom</span>
          </p>
          <h1 id="home-title" className="home-hero__title">Your BCH. <span>Their future.</span></h1>
          <p className="home-hero__lead">
            A Bitcoin Cash wallet you spend from every day, with your inheritance plan built in. If you go quiet, your family receives their shares.
          </p>
          <div className="home-hero__ctas">
            <ButtonLink {...(TRY_IT ?? { to: '/new' })} size="lg" className="pill-fx">
              {TRY_IT ? 'Try it now' : 'Create a plan'} <span className="home-cta__dot" aria-hidden><ArrowRight /></span>
            </ButtonLink>
            <ButtonLink to={TRY_IT ? '/new' : '/how-it-works'} variant="secondary" size="lg" className="pill-fx">
              {TRY_IT ? 'Create a plan' : 'How it works'}
            </ButtonLink>
          </div>
          <section className="home-built home-built--hero" aria-label="Built with">
            <p className="home-label">Built with</p>
            <ul className="home-built__list">
              {BUILT_WITH.map(({ name, logo, href }) => (
                <li key={name}>
                  <a className="home-built__link" href={href} target="_blank" rel="noreferrer">
                    <img className="home-built__mark" src={logo} alt="" width={20} height={20} />
                    <span>{name}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          {/* Two ways in, nothing else: heirs with a plan link have their own section below, and an owner coming
              back finds "Open your wallet" behind the wallet button. */}
          {DEMO_VIDEO_URL && (
            <div className="home-hero__more">
              <a className="home-textlink" href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
                <Play aria-hidden /> <span className="home-textlink__em">Watch the demo</span>
              </a>
            </div>
          )}
        </div>
        <div className="home-hero__scene"><FlowerStage /></div>
      </section>

      <SealedLetters />
      <TimeScroll />
      <SubakPayout />

      <div className="lp-sheet">
        <StepsFrame />
        <CheatSection />
        <HeirBand onOpenLink={() => setLinkOpen(true)} />
        <ClosingCta />
        <HomeFooter scene />
      </div>

      <OpenLinkDialog open={linkOpen} onClose={() => setLinkOpen(false)} />
    </div>
  );
}
