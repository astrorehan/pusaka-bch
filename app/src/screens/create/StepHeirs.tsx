import { CircleAlert, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { MAX_HEIR_NAME_LENGTH } from '../../lib/planPayload';
import { MAX_HEIRS } from '../../lib/shares';
import type { SplitMode } from '../../lib/types';
import { FARAID_MAX_HEIRS, type Family } from './faraid';
import { Field } from './Field';
import { ShareBar } from './ShareBar';
import { Notice, Stepper, Toggle } from './Bits';
import { equalPercents, fieldId, formatHundredths, heirColor, newHeir, percentOf, resolve, type Draft, type Resolved } from './model';
import type { Vis } from './CreateScreen';

interface Props {
  draft: Draft;
  update(fn: (d: Draft) => Draft): void;
  resolved: Resolved;
  vis: Vis;
  usd: number | null;
  network: 'mainnet' | 'chipnet';
  onContinue(): void;
}

const MODES: { id: SplitMode; label: string; about: string }[] = [
  { id: 'equal', label: 'Equal', about: 'Everyone gets the same share.' },
  { id: 'custom', label: 'Custom %', about: 'You choose each share, in percent.' },
  { id: 'faraid', label: 'Faraid', about: 'Islamic inheritance (faraid). Tell us who is in your family, and the shares follow faraid.' },
];

const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

export function StepHeirs({ draft, update, resolved, vis, usd, network, onContinue }: Props) {
  const { mode } = draft;
  const fr = resolved.faraid;

  function setMode(m: SplitMode) {
    update((d) => {
      if (m === 'custom') {
        const sum = d.heirs.reduce((s, h) => s + (Number(h.percent) || 0), 0);
        if (Math.abs(sum - 100) > 0.001 || d.heirs.some((h) => !h.percent.trim())) {
          const p = equalPercents(d.heirs.length);
          return { ...d, mode: m, heirs: d.heirs.map((h, i) => ({ ...h, percent: p[i] })) };
        }
      }
      return { ...d, mode: m };
    });
  }

  function setHeir(id: string, field: 'name' | 'address' | 'percent', value: string) {
    vis.edit(`${id}.${field}`);
    update((d) => {
      if (d.mode === 'faraid') {
        const c = d.contacts[id] ?? { name: '', address: '' };
        return { ...d, contacts: { ...d.contacts, [id]: { ...c, [field]: value } } };
      }
      return { ...d, heirs: d.heirs.map((h) => (h.id === id ? { ...h, [field]: value } : h)) };
    });
  }

  /** Custom % still at the equal split (untouched)? Then adding or removing an heir re-splits equally. */
  const isEqualSplit = (d: Draft) => d.heirs.map((h) => h.percent.trim()).join('|') === equalPercents(d.heirs.length).join('|');

  function addHeir() {
    update((d) => {
      const heirs = [...d.heirs, newHeir()];
      if (d.mode !== 'custom') return { ...d, heirs };
      if (isEqualSplit(d)) { const p = equalPercents(heirs.length); return { ...d, heirs: heirs.map((h, i) => ({ ...h, percent: p[i] })) }; }
      const sum = resolve(d).customSum ?? 0n;
      if (sum < 10000n) heirs[heirs.length - 1].percent = formatHundredths(10000n - sum);
      return { ...d, heirs };
    });
  }

  function removeHeir(id: string) {
    update((d) => {
      const heirs = d.heirs.filter((h) => h.id !== id);
      if (d.mode === 'custom' && isEqualSplit(d)) { const p = equalPercents(heirs.length); return { ...d, heirs: heirs.map((h, i) => ({ ...h, percent: p[i] })) }; }
      return { ...d, heirs };
    });
  }

  function setFamily(patch: Partial<Family>) {
    update((d) => ({ ...d, family: { ...d.family, ...patch } }));
  }

  async function paste(id: string) {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) { setHeir(id, 'address', t); vis.blur(`${id}.address`); }
    } catch { /* permission refused: the field still takes a normal paste */ }
  }

  const about = MODES.find((m) => m.id === mode)!.about;
  const totalError = vis.show('total');
  const fam = draft.family;

  return (
    <form className="cr-stack" noValidate onSubmit={(e) => { e.preventDefault(); onContinue(); }}>
      <div>
        <div className="cr-tabs" role="radiogroup" aria-label="How to split">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              aria-label={m.id === 'faraid' ? 'Islamic inheritance (faraid)' : undefined}
              className="cr-tabs__tab"
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="cr-tabs__about">{about}</p>
      </div>

      {mode === 'faraid' && (
        <fieldset className="cr-card cr-family">
          <legend className="cr-card__title">Who is in your family?</legend>
          <p className="cr-card__sub">Count the people living today who would inherit from you.</p>
          <div className="cr-rows">
            <div className="cr-row">
              <span className="cr-row__text"><span className="cr-row__label" id="fam-spouse">Husband or wife</span></span>
              <div className="cr-seg" role="radiogroup" aria-labelledby="fam-spouse">
                {(['none', 'husband', 'wife'] as const).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={fam.spouse === s} onClick={() => setFamily({ spouse: s })}>
                    {s === 'none' ? 'None' : s === 'husband' ? 'Husband' : 'Wife'}
                  </button>
                ))}
              </div>
            </div>
            {fam.spouse === 'wife' && <Stepper id="fam-wives" label="Wives" one="wife" value={fam.wives} min={1} max={4} onValue={(n) => setFamily({ wives: n })} />}
            <Toggle label="Father" checked={fam.father} onChange={(v) => setFamily({ father: v })} />
            <Toggle label="Mother" checked={fam.mother} onChange={(v) => setFamily({ mother: v })} />
            <Stepper id="fam-sons" label="Sons" one="son" value={fam.sons} max={FARAID_MAX_HEIRS} onValue={(n) => setFamily({ sons: n })} />
            <Stepper id="fam-daughters" label="Daughters" one="daughter" value={fam.daughters} max={FARAID_MAX_HEIRS} onValue={(n) => setFamily({ daughters: n })} />
            <Stepper id="fam-brothers" label="Brothers" one="brother" sub="Same mother and father" value={fam.brothers} max={FARAID_MAX_HEIRS} onValue={(n) => setFamily({ brothers: n })} />
            <Stepper id="fam-sisters" label="Sisters" one="sister" sub="Same mother and father" value={fam.sisters} max={FARAID_MAX_HEIRS} onValue={(n) => setFamily({ sisters: n })} />
          </div>
        </fieldset>
      )}

      {mode === 'faraid' && fr && !fr.ok && fr.kind !== 'empty' && (
        <div data-problem><Notice
          tone="danger"
          title={fr.kind === 'too-many' ? 'Too many heirs for one plan' : 'This family is outside what Pusaka can work out'}
          action={<Button type="button" variant="secondary" onClick={() => setMode('custom')}>Use Custom % instead</Button>}
        >
          {fr.message}
        </Notice></div>
      )}

      {mode === 'faraid' && fr?.ok && (fr.adjustment !== 'none' || fr.excluded.length > 0) && (
        <Notice title="How the shares were worked out">
          {fr.adjustment === 'awl' && <p>The fixed shares add up to more than the whole, so each one is made smaller in proportion (awl).</p>}
          {fr.adjustment === 'radd' && <p>Something is left after the fixed shares, so it goes back to the heirs other than the husband or wife, in proportion (radd).</p>}
          {fr.excluded.map((x) => <p key={x.label}>{x.label} {x.label.endsWith('s') ? "don't" : "doesn't"} inherit here: {x.reason}.</p>)}
        </Notice>
      )}

      {mode === 'faraid' && fr && !fr.ok && fr.kind === 'empty' ? (
        <div className="cr-empty">
          <p className="cr-empty__title">Add your family above</p>
          <p className="muted">Each heir's share appears here as you go.</p>
        </div>
      ) : resolved.heirs.length > 0 && (
        <div className="cr-card">
          <ShareBar
            caption="Shares"
            compact
            heirs={resolved.heirs}
            total={resolved.total}
            usd={usd}
            assigned={mode === 'custom' ? resolved.customSum : undefined}
          />
        </div>
      )}

      {resolved.heirs.map((h, i) => {
        const percentKey = `${h.id}.percent`;
        const draftHeir = draft.heirs.find((x) => x.id === h.id);
        return (
          <section key={h.id} className="cr-card cr-heir enter" aria-labelledby={`heir-${h.id}`}>
            <header className="cr-heir__head">
              <span className="cr-dot cr-dot--lg" style={{ background: heirColor(i) }} aria-hidden />
              <h3 id={`heir-${h.id}`} className="cr-heir__title">{h.label}</h3>
              {mode !== 'custom' && <span className="cr-pill num">{percentOf(h.share, resolved.total)}%</span>}
              {mode === 'custom' && draftHeir && (
                <Field
                  className="cr-field--share" fkey={percentKey} quietLabel label={`Share for ${h.name.trim() || h.label}, in percent`}
                  value={draftHeir.percent} suffix="%" inputMode="decimal" placeholder="0" autoComplete="off"
                  onValue={(v) => setHeir(h.id, 'percent', v)} onBlur={() => vis.blur(percentKey)} error={vis.show(percentKey)} messageElsewhere
                />
              )}
              {mode !== 'faraid' && draft.heirs.length > 1 && (
                <button type="button" className="cr-iconbtn cr-heir__remove" onClick={() => removeHeir(h.id)} aria-label={`Remove ${h.name.trim() || h.label}`}>
                  <Trash2 aria-hidden />
                </button>
              )}
            </header>
            {h.reason && <p className="cr-heir__reason">{h.reason}</p>}
            <div className="cr-heir__fields">
              <Field
                fkey={`${h.id}.name`} label="Name" value={h.name} autoComplete="off" placeholder={h.relation ? `Your ${h.label.toLowerCase().replace(/ \d+$/, '')}'s name` : 'Their name'}
                maxLength={MAX_HEIR_NAME_LENGTH}
                onValue={(v) => setHeir(h.id, 'name', v)} onBlur={() => vis.blur(`${h.id}.name`)} error={vis.show(`${h.id}.name`)}
              />
              <Field
                fkey={`${h.id}.address`} label="BCH address" mono value={h.address}
                placeholder={network === 'chipnet' ? 'bchtest:q…' : 'bitcoincash:q…'}
                autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                onValue={(v) => setHeir(h.id, 'address', v)} onBlur={() => vis.blur(`${h.id}.address`)}
                error={vis.show(`${h.id}.address`)} hint={vis.hint(`${h.id}.address`)}
                trailing={canPaste && (
                  <button type="button" className="cr-iconbtn" onClick={() => paste(h.id)} aria-label="Paste address">
                    <ClipboardPaste aria-hidden />
                  </button>
                )}
              />
              {mode === 'custom' && vis.show(percentKey) && (
                <p className="cr-field__error cr-heir__shareerr" id={`${fieldId(percentKey)}-msg`}><CircleAlert aria-hidden />{vis.show(percentKey)}</p>
              )}
            </div>
          </section>
        );
      })}

      {mode !== 'faraid' && (
        <div className="cr-add">
          <Button type="button" variant="secondary" block icon={<Plus />} onClick={addHeir} disabled={draft.heirs.length >= MAX_HEIRS}>Add heir</Button>
          {draft.heirs.length >= MAX_HEIRS && <p className="cr-small muted">Pusaka can pay up to {MAX_HEIRS} heirs in one plan.</p>}
        </div>
      )}

      {mode === 'custom' && resolved.customSum !== undefined && (
        totalError ? (
          <div role="alert" data-problem><Notice tone="danger">{totalError}</Notice></div>
        ) : (
          <p className="cr-total num" aria-live="polite">
            <span>Total</span>
            <span>
              {formatHundredths(resolved.customSum)}% of 100%
              {resolved.customSum < 10000n && <span className="muted"> · {formatHundredths(10000n - resolved.customSum)}% left</span>}
              {resolved.customSum > 10000n && <span className="muted"> · {formatHundredths(resolved.customSum - 10000n)}% too much</span>}
            </span>
          </p>
        )
      )}

      {mode === 'faraid' && (
        <p className="cr-small muted">
          Covers a husband or wife, parents, children, and brothers and sisters with the same parents. For grandchildren,
          grandparents or half-siblings, ask a scholar and use Custom %.
        </p>
      )}

      {vis.show('family') && !(fr && !fr.ok && fr.kind !== 'empty') && <div role="alert" data-problem><Notice tone="danger">{vis.show('family')}</Notice></div>}

      <div className="cr-actions">
        <Button size="lg" block type="submit">Continue</Button>
      </div>
    </form>
  );
}
