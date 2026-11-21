// The end of the landing: a box for heirs who arrive with a plan link, and the closing call to action, where a
// bloom on its lily pad drifts in from the right edge of the screen and floats there.
// Reduced motion: no drift and no float.
import { TRY_IT } from '../../lib/demo';
import { ArrowRight, Link2 } from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { NETWORK } from '../../lib/networkName';
import { SplitWords, useInView } from './motion';
import { BASE } from '../../lib/asset';
import { HEIRS } from './payoutHeirs';

const CTA_TITLE = 'Your family shouldn’t have to guess.';

export function HeirBand({ onOpenLink }: { onOpenLink: () => void }) {
  const [ref, seen] = useInView<HTMLElement>(0.08);
  return (
    <section ref={ref} className="lp-section hb" aria-labelledby="hb-title">
      <div className={`hb-card fade-up${seen ? ' is-seen' : ''}`}>
        <div className="hb-copy">
          <h2 id="hb-title" className="hb-title">Someone made you an heir?</h2>
          <p className="lp-sub">Open the plan link they gave you to see your share, and when it can be sent to you.</p>
          <Button type="button" size="lg" icon={<Link2 />} className="hb-btn pill-fx" onClick={onOpenLink}>
            Open a plan link
          </Button>
        </div>
        <div className="hb-art water-box" aria-hidden>
          <div className="hb-link glass-lite"><Link2 /> <span className="mono">…/plan#Kx9fQ2…</span></div>
          <div className="hb-share glass-lite">
            <span className="hb-share__who"><span className="hb-share__dot" />Your share, {HEIRS[0].name}</span>
            <strong className="num">{HEIRS[0].bch} BCH</strong>
            <span className="hb-share__when">Can be sent after the waiting time and review</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClosingCta() {
  const [ref, seen] = useInView<HTMLElement>(0.08);
  return (
    <section ref={ref} className="cta" aria-labelledby="cta-title">
      <div className="cta__inner">
        <div className="cta__copy">
          <h2 id="cta-title" className="lp-display" aria-label={CTA_TITLE}>
            <SplitWords text={CTA_TITLE} seen={seen} />
          </h2>
          <p className={`lp-sub rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '380ms' }}>
            {NETWORK === 'chipnet'
              ? 'Free to try on Chipnet. No real money involved.'
              : 'Runs directly on Bitcoin Cash. Your coins never sit with us.'}
          </p>
          <div className={`cta__btns rise-in${seen ? ' is-seen' : ''}`} style={{ animationDelay: '480ms' }}>
            <ButtonLink {...(TRY_IT ?? { to: '/new' })} size="lg" className="pill-fx btn--gold-shine">
              {TRY_IT ? 'Try it now' : 'Create a plan'} <span className="home-cta__dot" aria-hidden><ArrowRight /></span>
            </ButtonLink>
            <ButtonLink to={TRY_IT ? '/new' : '/how-it-works'} variant="secondary" size="lg" className="pill-fx">
              {TRY_IT ? 'Create a plan' : 'How it works'}
            </ButtonLink>
          </div>
        </div>
      </div>
      <div className={`cta__art${seen ? ' is-seen' : ''}`} aria-hidden>
        <div className="cta__float">
          <span className="cta__shadow" />
          <img src={`${BASE}landing/cta-bloom.webp`} alt="" width={1156} height={1022} loading="lazy" decoding="async" />
        </div>
      </div>
    </section>
  );
}
