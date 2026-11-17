// The front door and landing page (DESIGN.md "Home page").
// The hero stands in the rice terrace at first light. Below it the page passes through one day on the paddy:
// the family cards, the scroll scene over the water (the plan, then the cheat attempts), the night payout among
// fireflies, a light sheet with the three steps, the heir box, the closing call and the terraces footer.
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { FlowerStage } from './FlowerStage';
import { FamilyCards } from './FamilyCards';
import { PaddyScroll } from './PaddyScroll';
import { NightPayout } from './NightPayout';
import { StepsFrame } from './StepsFrame';
import { ClosingCta, HeirBand } from './ClosingSections';
import { OpenLinkDialog } from './OpenLinkDialog';
import { HomeFooter } from './HomeFooter';
import { DEMO_VIDEO_URL, SOLIDCASH_URL } from './links';
import { useGlide } from './useGlide';
import { ButtonLink } from '../../components/Button';
import './home.css';
import './home-hero.css';
import './home-landing.css';
import './landing.css';

const BUILT_WITH = [
  { name: 'Bitcoin Cash', logo: '/brands/bitcoin-cash.svg', href: 'https://bitcoincash.org' },
  { name: 'SolidCash', logo: '/brands/solidcash.svg', href: SOLIDCASH_URL },
  { name: 'WizardConnect', logo: '/brands/wizardconnect.png', href: 'https://docs.riftenlabs.com/wizardconnect/' },
];

export function HomeScreen() {
  const [linkOpen, setLinkOpen] = useState(false);
  const hero = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  useGlide(copy, hero);
  useEffect(() => { document.title = 'Pusaka: Your BCH. Their future.'; }, []);

  return (
    <div className="home home--studio">
      <section ref={hero} className="home-hero" aria-labelledby="home-title">
        <div ref={copy} className="home-hero__text enter">
          <p className="home-eyebrow">
            <span lang="id">Pusaka</span>
            <span className="sr-only">: </span>
            <span className="home-eyebrow__meaning">Indonesian for heirloom</span>
          </p>
          <h1 id="home-title" className="home-hero__title">Your BCH. <span>Their future.</span></h1>
          <p className="home-hero__lead">
            Choose who gets your Bitcoin Cash. If you stop checking in, your family can receive their shares.
          </p>
          <div className="home-hero__ctas">
            <ButtonLink to="/try" size="lg" className="pill-fx">
              Try it now <span className="home-cta__dot" aria-hidden><ArrowRight /></span>
            </ButtonLink>
            <ButtonLink to="/new" variant="secondary" size="lg" className="pill-fx">Create a plan</ButtonLink>
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
        <div className="home-hero__scene"><FlowerStage /></div>
      </section>

      <FamilyCards />
      <PaddyScroll />
      <NightPayout />

      <div className="lp-sheet">
        <StepsFrame />
        <HeirBand onOpenLink={() => setLinkOpen(true)} />
        <ClosingCta />
        <HomeFooter scene />
      </div>

      <OpenLinkDialog open={linkOpen} onClose={() => setLinkOpen(false)} />
    </div>
  );
}
