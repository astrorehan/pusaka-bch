// The pieces that float on the paddy water: Pusaka's reminder bubble, the plan card (a working preview of
// "I'm still here"), and the "What if someone tries to cheat?" block with its two layers. The pinned scene
// (PaddyScroll, desktop) lays them on the photo; phones and reduced motion stack them over crops of it.
import { useId, useMemo, useState } from 'react';
import { AlertCircle, Ban, Check, Clock3, Hand, Undo2 } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { formatDay } from '../plan/time';
import { CHEAT_SCENARIOS } from './cheatScenarios';
import { HEIR_NAMES, POT } from './payoutHeirs';

const DAY_MS = 86_400_000;
const LEFT_DAYS = 142;
const PERIOD_DAYS = 180;

/** Pusaka's quiet reminder, like a message beside the plan. */
export function PlanBubble({ glass = 'glass-water' }: { glass?: string }) {
  return (
    <div className="pb">
      <div className="pb__from">
        <span className="pb__avatar"><Logo size={16} /></span>
        <span className="pb__name">Pusaka</span>
      </div>
      <p className={`pb__text ${glass}`}>
        Your plan has {LEFT_DAYS} days left. Press “I’m still here” whenever you like and it starts again.
      </p>
    </div>
  );
}

/** A working preview: "I'm still here" restarts the waiting time; nothing is sent. Money never animates. */
export function ScenePlanCard({ glass = 'glass-water' }: { glass?: string }) {
  const [restarted, setRestarted] = useState(false);
  const [backHint, setBackHint] = useState(false);
  const days = restarted ? PERIOD_DAYS : LEFT_DAYS;
  const [now] = useState(() => Date.now());
  const deadline = useMemo(() => formatDay(now + days * DAY_MS), [now, days]);
  const note = restarted
    ? 'Waiting time restarted. A preview, so nothing was sent.'
    : backHint
      ? `In a real plan, this sends the ${POT} back to your wallet.`
      : '';

  return (
    <div className={`pc ${glass}`}>
      <div className="pc__top">
        <span className="pc__label">Family plan</span>
        <span className="pc__badge" data-tone={restarted ? 'ok' : 'wait'}>
          {restarted ? <Check aria-hidden /> : <Clock3 aria-hidden />}
          {restarted ? 'Restarted' : 'Waiting'}
        </span>
      </div>
      <p className="pc__big">
        <span className="num">{days}</span>
        <span className="pc__unit">days left</span>
      </p>
      <p className="pc__line">
        Then {HEIR_NAMES} can receive <b className="num">{POT}</b>.
      </p>
      <p className="pc__meta">
        <span>6-month waiting time</span>
        <span className="num">About {deadline}</span>
      </p>
      <div className="pc__actions">
        <button type="button" className="pc__btn pc__btn--ghost" onClick={() => { setBackHint((v) => !v); setRestarted(false); }}>
          <Undo2 aria-hidden /> Take my BCH back
        </button>
        <button type="button" className="pc__btn pc__btn--primary" onClick={() => { setRestarted(true); setBackHint(false); }}>
          {restarted ? <Check aria-hidden /> : <Hand aria-hidden />} I’m still here
        </button>
      </div>
      <p className="pc__note" role="status">{note}</p>
    </div>
  );
}

/** "What if someone tries to cheat?": pick a trick, see both layers refuse it. */
export function CheatBlock({ tone, headingId }: { tone: 'scene' | 'page'; headingId?: string }) {
  const id = useId();
  const [activeId, setActiveId] = useState(CHEAT_SCENARIOS[0].id);
  const s = CHEAT_SCENARIOS.find((x) => x.id === activeId) ?? CHEAT_SCENARIOS[0];
  const Attempt = s.icon;
  const glass = tone === 'scene' ? 'glass-water' : 'glass-lite';

  return (
    <div className={`cb cb--${tone}`}>
      {tone === 'scene' && (
        <div className="cb__head">
          <h2 id={headingId} className="cb__title">What if someone tries to cheat?</h2>
          <p className="cb__sub">
            Your rules live on the Bitcoin Cash network, not on this website. A trick has to get past Pusaka, then past
            the network.
          </p>
        </div>
      )}
      <div className="cb__pills" role="tablist" aria-label="Pick a trick to try">
        {CHEAT_SCENARIOS.map((x) => {
          const Icon = x.icon;
          return (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={`${id}-${x.id}`}
              aria-controls={`${id}-panel`}
              aria-selected={x.id === s.id}
              className={`cb__pill ${glass}`}
              onClick={() => setActiveId(x.id)}
            >
              <Icon aria-hidden /> {x.label}
            </button>
          );
        })}
      </div>
      <div className="cb__grid" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${s.id}`}>
        <article className={`cb__layer ${glass}`}>
          <p className="cb__layer-head"><span className="cb__num">1</span>Stopped in the app</p>
          <div className="cb__inner">
            <Attempt className="cb__icon" aria-hidden />
            <p>
              <b>{s.attemptTitle}</b>
              <br />
              <span className="cb__muted">{s.attemptLine}</span>
            </p>
          </div>
          <div className="cb__inner cb__inner--col">
            <p className="cb__row">
              <span className="cb__strong">{s.networkSummary}</span>
              <span className="cb__badge cb__badge--warn"><AlertCircle aria-hidden />{s.appBadge}</span>
            </p>
            <p className="cb__muted">{s.appReason}</p>
          </div>
        </article>
        <article className={`cb__layer ${glass}`}>
          <p className="cb__layer-head"><span className="cb__num">2</span>Skip the website? Still refused</p>
          <div className="cb__inner cb__inner--col">
            <p className="cb__row cb__row--start">
              <span className="cb__stop" aria-hidden><Ban /></span>
              <span>
                <b>{s.networkHeadline}</b>
                <br />
                <span className="cb__muted">{s.networkReason}</span>
              </span>
            </p>
            <ul className="cb__proofs">
              {s.proofs.map((p) => (
                <li key={p}><Check aria-hidden /> {p}</li>
              ))}
            </ul>
          </div>
        </article>
      </div>
    </div>
  );
}
