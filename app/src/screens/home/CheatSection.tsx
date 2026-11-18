// "What if someone tries to cheat?": pick a trick and see the app, then the network, refuse it. On the light
// sheet after the three steps, at every width, over a patch of the paddy.
import { SplitWords, useInView } from './motion';
import { CheatBlock } from './paddyParts';

export function CheatSection() {
  const [ref, seen] = useInView<HTMLElement>(0.1);
  return (
    <section ref={ref} className="lp-section cheat-stacked" aria-labelledby="safety">
      <header className="lp-head">
        <h2 id="safety" className="lp-h2" aria-label="What if someone tries to cheat?">
          <SplitWords text="What if someone tries to cheat?" seen={seen} />
        </h2>
        <p className={`lp-sub rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '300ms' }}>
          Your rules live on the Bitcoin Cash network, not on this website. A trick has to get past Pusaka, then past
          the network.
        </p>
      </header>
      <div className={`rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '380ms' }}>
        <CheatBlock tone="page" />
      </div>
    </section>
  );
}
