import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Copy, Download, ExternalLink, Link2, Share2 } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/Button';
import { explorerTxUrl, formatBch, formatDate, formatDuration, formatUsd } from '../../lib/format';
import { planUrl } from '../../lib/planLink';
import { heirAmounts, sharePercent } from '../../lib/shares';
import type { PlanData } from '../../lib/types';
import { LeaveDialog } from './LeaveDialog';
import { heirColor } from './model';

interface Props {
  plan: PlanData;
  txid: string;
  amount: bigint;
  usd: number | null;
}

type Saved = null | 'file' | 'shared' | 'copied';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A small, self-contained page an heir can open years from now: the link, and the plan in words. */
function planFile(plan: PlanData, url: string, amount: bigint): string {
  const rows = plan.heirs.map((h) => `<li><strong>${esc(h.name)}</strong>: ${sharePercent(h.share, plan.shareTotal)}%<br><code>${esc(h.address)}</code></li>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pusaka inheritance plan</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#131B33;background:#FAF7F2">
<h1 style="font-weight:500">Pusaka inheritance plan</h1>
<p>This file holds the link to an inheritance plan on Bitcoin Cash. Keep it safe. Without this link nobody can open the plan or send it to the heirs.</p>
<p><a href="${esc(url)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#131B33;color:#FAF7F2;text-decoration:none">Open the plan</a></p>
<h2 style="font-size:18px">Heirs</h2><ul>${rows}</ul>
<p>Amount for the heirs: ${formatBch(amount)} BCH.<br>Waiting time: ${formatDuration(plan.period)} without “I’m still here”.<br>Created: ${formatDate(BigInt(Math.floor(Date.now() / 1000)))}.</p>
<p style="color:#5E574D;font-size:13px">Full link:<br><code style="word-break:break-all">${esc(url)}</code></p>
</body></html>`;
}

export function SuccessScreen({ plan, txid, amount, usd }: Props) {
  const navigate = useNavigate();
  const url = planUrl(plan);
  const path = url.slice(window.location.origin.length);
  const [saved, setSaved] = useState<Saved>(null);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  /** the owner chose "Leave anyway" */
  const [released, setReleased] = useState(false);
  const gated = !saved && !released;
  const gatedRef = useRef(gated);
  useEffect(() => { gatedRef.current = gated; }, [gated]);

  const { amounts } = heirAmounts(amount, plan.heirs.map((h) => h.share), plan.shareTotal);
  const [now] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const end = now + plan.period - 3600n;
  const petals = plan.heirs.slice(0, 4).map((_, i) => heirColor(i));

  const saveFile = useCallback(() => {
    const blob = new Blob([planFile(plan, url, amount)], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pusaka-plan-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setSaved('file');
  }, [plan, url, amount]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setSaved((s) => s ?? 'copied');
    } catch { /* clipboard blocked: the file still works */ }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Pusaka inheritance plan', text: 'My inheritance plan on Pusaka. Keep this link: you need it to receive your share.', url });
        setSaved('shared');
      } catch { /* closed the share sheet: not saved */ }
    } else {
      await copy();
    }
  }

  // The gate: until the link is saved, leaving (links, back button, closing the tab) asks first.
  useEffect(() => {
    if (!gated) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(a.href);
    };
    const onPop = () => {
      if (!gatedRef.current) return;
      window.history.pushState({ ...window.history.state, pusakaGate: true }, '');
      setLeaving('back');
    };
    if (!window.history.state?.pusakaGate) window.history.pushState({ ...window.history.state, pusakaGate: true }, '');
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick, true);
    };
  }, [gated]);

  const stay = useCallback(() => setLeaving(null), []);

  function leave() {
    const target = leaving;
    setLeaving(null);
    setReleased(true);
    setTimeout(() => {
      if (target === 'back') window.history.go(-2);
      else if (target) {
        const u = new URL(target);
        if (u.origin === window.location.origin) navigate(u.pathname + u.search + u.hash);
        else window.location.href = target;
      }
    }, 0);
  }

  const savedText =
    saved === 'file' ? 'Saved. Keep the file somewhere safe, and send the link to your heirs.'
    : saved === 'shared' ? 'Shared. Keep a copy for yourself too.'
    : saved === 'copied' ? 'Link copied. Paste it somewhere safe, and send it to your heirs.'
    : null;

  return (
    <div className="cr-success">
      <div className="cr-success__hero">
        <Logo size={120} bloom="once" petalColors={petals} title="Pusaka" />
        <h1 className="cr-success__title" tabIndex={-1}>Your plan is ready</h1>
        <p className="cr-success__lead">
          <strong className="num">{formatBch(amount)} BCH</strong> is set aside for {plan.heirs.length === 1 ? 'your heir' : `your ${plan.heirs.length} heirs`}.
          If you don't say “I’m still here” for {formatDuration(plan.period)}, they can receive it, from about {formatDate(end)}.
        </p>
      </div>

      <section className="cr-linkcard" aria-labelledby="link-title">
        <h2 id="link-title" className="cr-linkcard__title"><Link2 aria-hidden />Your plan link</h2>
        <p>This link is the only way to open your plan and send it to your heirs. Pusaka keeps no copy. Anyone with it can see your heirs and their shares.</p>
        <div className="cr-linkcard__url">
          <span className="cr-linkcard__text" title={url}>{url.replace(/^https?:\/\//, '')}</span>
          <button type="button" className="cr-iconbtn" onClick={copy} aria-label="Copy plan link">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          </button>
        </div>
        <div className="cr-linkcard__actions">
          {!saved ? (
            <>
              <Button size="lg" block icon={<Download />} onClick={saveFile}>Save plan link</Button>
              <Button size="lg" variant="secondary" block icon={<Share2 />} onClick={share}>Share with my heirs</Button>
            </>
          ) : (
            <>
              <Link to={path} className="btn btn--primary btn--lg btn--block"><span className="btn__label">Open my plan</span></Link>
              <div className="cr-linkcard__more">
                <Button variant="ghost" icon={<Download />} onClick={saveFile}>Save again</Button>
                <Button variant="ghost" icon={<Share2 />} onClick={share}>Share</Button>
              </div>
            </>
          )}
        </div>
        <p className="cr-linkcard__status" role="status" aria-live="polite">
          {savedText && <><Check aria-hidden />{savedText}</>}
        </p>
      </section>

      <section className="cr-card" aria-labelledby="sc-heirs">
        <h2 id="sc-heirs" className="cr-card__title">Who receives what</h2>
        <ul className="cr-legend">
          {plan.heirs.map((h, i) => (
            <li key={i}>
              <span className="cr-dot" style={{ background: heirColor(i) }} aria-hidden />
              <span className="cr-legend__name">{h.name}</span>
              <span className="cr-legend__value num">
                <strong>{formatBch(amounts[i])} BCH</strong>
                <span className="cr-legend__sub">{sharePercent(h.share, plan.shareTotal)}%{usd ? ` · ${formatUsd(amounts[i], usd)}` : ''}</span>
              </span>
            </li>
          ))}
        </ul>
        <a className="cr-explorer" href={explorerTxUrl(txid, plan.network)} target="_blank" rel="noreferrer">
          View on explorer <ExternalLink aria-hidden />
        </a>
      </section>

      {leaving && <LeaveDialog onStay={stay} onSave={() => { setLeaving(null); saveFile(); }} onLeave={leave} />}
    </div>
  );
}
