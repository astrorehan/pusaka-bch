// The hackathon banner (organiser's rule: top of every page, never dismissible).
// Wide screens: one quiet line of grouped links. Phones: one line that opens a panel with every link.
// Values live in banner-config.ts; an empty value hides its entry.
import { useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { BANNER } from './banner-config';
import { CopyButton } from './CopyButton';
import { Popover } from './Popover';
import { shortAddress } from '../lib/format';
import './banner.css';

interface Item { label: string; href: string; aria: string }
interface Group { title: string; items: Item[] }

function groups(): Group[] {
  const g: Group[] = [
    { title: 'Presentation', items: BANNER.slidesUrl ? [{ label: 'Slides', href: BANNER.slidesUrl, aria: 'Presentation slides' }] : [] },
    {
      title: 'Before BLAZE',
      items: [
        BANNER.before.codeUrl && { label: 'Code', href: BANNER.before.codeUrl, aria: 'Code before BLAZE' },
        BANNER.before.demoUrl && { label: 'Demo', href: BANNER.before.demoUrl, aria: 'Demo before BLAZE' },
      ].filter(Boolean) as Item[],
    },
    {
      title: 'Now',
      items: [
        BANNER.now.codeUrl && { label: 'Code', href: BANNER.now.codeUrl, aria: 'Code now' },
        BANNER.now.demoUrl && { label: 'Demo', href: BANNER.now.demoUrl, aria: 'Demo now (this app)' },
      ].filter(Boolean) as Item[],
    },
  ];
  return g.filter((x) => x.items.length > 0);
}

function BannerLink({ item, className }: { item: Item; className: string }) {
  if (item.href.startsWith('/')) {
    return <Link to={item.href} className={className} aria-label={item.aria}>{item.label}</Link>;
  }
  return <a href={item.href} className={className} aria-label={item.aria} target="_blank" rel="noreferrer">{item.label}</a>;
}

function Donations() {
  const a = BANNER.cashTokensAddress;
  if (!a) return null;
  return (
    <span className="blaze__addr">
      <span className="mono" title={a}>{shortAddress(a, 4, 5)}</span>
      <CopyButton value={a} label="Copy donation address (accepts CashTokens)" size="sm" />
    </span>
  );
}

export function Banner() {
  const list = groups();
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Close the phone panel when the page changes.
  const [pageKey, setPageKey] = useState(location.key);
  if (pageKey !== location.key) {
    setPageKey(location.key);
    setOpen(false);
  }

  const event = <a className="blaze__event" href={BANNER.eventUrl} target="_blank" rel="noreferrer">{BANNER.event} entry</a>;

  return (
    <div className="blaze" role="region" aria-label={`${BANNER.event} hackathon entry`}>
      {/* wide: one line */}
      <ul className="blaze__wide">
        <li className="blaze__group">{event}</li>
        {list.map((g) => (
          <li key={g.title} className="blaze__group">
            {g.title !== 'Presentation' && <span className="blaze__label">{g.title}</span>}
            {g.items.map((it) => <BannerLink key={it.label} item={it} className="blaze__link" />)}
          </li>
        ))}
        {BANNER.cashTokensAddress && (
          <li className="blaze__group">
            <span className="blaze__label">Donations</span>
            <Donations />
          </li>
        )}
      </ul>

      {/* phones: one line, opens a panel */}
      <div className="blaze__narrow">
        <button
          ref={trigger}
          type="button"
          className="blaze__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="blaze__toggle-event">{BANNER.event} entry</span>
          <span className="blaze__toggle-summary">Code and demos</span>
          <ChevronDown aria-hidden className="blaze__chev" />
        </button>
        <Popover id={panelId} open={open} onClose={() => setOpen(false)} anchorRef={trigger} align="stretch" label={`${BANNER.event} links`} className="blaze__panel">
          <p className="blaze__panel-intro">
            Pusaka existed before{' '}
            <a href={BANNER.eventUrl} target="_blank" rel="noreferrer">{BANNER.event}</a>. These links show what it was,
            and what was built during the hackathon.
          </p>
          <dl className="blaze__rows">
            {list.map((g) => (
              <div key={g.title} className="blaze__row">
                <dt>{g.title}</dt>
                <dd>
                  {g.items.map((it) => <BannerLink key={it.label} item={it} className="blaze__chip" />)}
                </dd>
              </div>
            ))}
            {BANNER.cashTokensAddress && (
              <div className="blaze__row blaze__row--addr">
                <dt>Donations</dt>
                <dd><Donations /></dd>
              </div>
            )}
          </dl>
        </Popover>
      </div>
    </div>
  );
}
