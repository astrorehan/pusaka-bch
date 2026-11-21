// The create flow's draft, its validation and the PlanData it becomes. Pure functions, no React.
import type { Heir, NetworkName, PlanData, SplitMode } from '../../lib/types';
import { DUST, formatBch, formatUsd } from '../../lib/format';
import { MAX_HEIR_NAME_LENGTH } from '../../lib/planPayload';
import { MAX_HEIRS, equalShares, heirAmounts } from '../../lib/shares';
import { faraid, EMPTY_FAMILY, type Family, type FaraidResult } from './faraid';
import { checkAddress } from './cashaddr';

/**
 * A small amount that stays in the plan for good. The SolidCash contract may not be left holding less than the
 * network's minimum (576 satoshis) after a payout, so the plan keeps this back from the heirs' pot.
 * (Whoever sends to heirs pays the network fee from their own wallet.)
 */
export const FEE_BUDGET = 1_000n;
/** Rough network fee for creating the plan, used only to warn early about the wallet balance. */
export const CREATE_FEE_ESTIMATE = 5_000n;
/** Later actions (I'm still here, take my BCH back, send to heirs), measured on Chipnet. */
export const ACTION_FEE_RANGE = [9_000n, 12_000n] as const;

export type Step = 1 | 2 | 3 | 4; // 4 = review
export type PeriodChoice = '6m' | '1y' | '2y' | 'custom';
export type PeriodUnit = 'days' | 'months' | 'years';

export interface HeirDraft { id: string; name: string; address: string; percent: string }
export interface Contact { name: string; address: string }

export interface Draft {
  step: Step;
  mode: SplitMode;
  /** heirs for Equal and Custom % */
  heirs: HeirDraft[];
  /** family and per-relation contacts for faraid */
  family: Family;
  contacts: Record<string, Contact>;
  amount: string;
  period: PeriodChoice;
  customCount: string;
  customUnit: PeriodUnit;
}

let seq = 0;
export const newId = () => `h${Date.now().toString(36)}${(seq++).toString(36)}`;
export const newHeir = (): HeirDraft => ({ id: newId(), name: '', address: '', percent: '' });

export function emptyDraft(mode: SplitMode = 'equal'): Draft {
  const heir = newHeir();
  if (mode === 'custom') heir.percent = '100';
  return { step: 1, mode, heirs: [heir], family: { ...EMPTY_FAMILY }, contacts: {}, amount: '', period: '1y', customCount: '', customUnit: 'months' };
}

// ------------------------------------------------------------ draft storage (survives a tab reload mid-flow)

const KEY = 'pusaka-create-draft';
export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!Array.isArray(d.heirs) || !d.family) return null;
    return { ...emptyDraft(), ...d, family: { ...EMPTY_FAMILY, ...d.family } };
  } catch { return null; }
}
export function saveDraft(d: Draft) { try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode */ } }
export function clearDraft() { try { sessionStorage.removeItem(KEY); } catch { /* private mode */ } }

// ------------------------------------------------------------ shares

export interface ResolvedHeir {
  id: string;
  /** "Heir 2", "Son 1" */
  label: string;
  name: string;
  address: string;
  share: bigint;
  relation?: string;
  reason?: string;
}

export interface Resolved {
  heirs: ResolvedHeir[];
  total: bigint;
  /** Custom %: sum of entered percentages in hundredths (10000 = 100%) */
  customSum?: bigint;
  faraid?: FaraidResult;
}

/** "33.33" -> 3333n hundredths; null if not a number with up to 2 decimals. */
export function parsePercent(s: string): bigint | null {
  const t = s.trim().replace(',', '.').replace(/\s*%$/, '');
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  return BigInt(w) * 100n + BigInt(f.padEnd(2, '0'));
}

export function formatHundredths(h: bigint): string {
  const w = h / 100n, f = (h % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return f ? `${w}.${f}` : `${w}`;
}

/** Equal split written as percentages that add up to exactly 100 (first heirs take the extra hundredths). */
export function equalPercents(n: number): string[] {
  const base = 10000n / BigInt(n), extra = Number(10000n % BigInt(n));
  return Array.from({ length: n }, (_, i) => formatHundredths(base + (i < extra ? 1n : 0n)));
}

export function resolve(d: Draft): Resolved {
  if (d.mode === 'faraid') {
    const r = faraid(d.family);
    if (!r.ok) return { heirs: [], total: 1n, faraid: r };
    return {
      heirs: r.heirs.map((h) => ({ id: h.key, label: h.label, name: d.contacts[h.key]?.name ?? '', address: d.contacts[h.key]?.address ?? '', share: h.share, relation: h.relation, reason: h.reason })),
      total: r.total,
      faraid: r,
    };
  }
  if (d.mode === 'custom') {
    const shares = d.heirs.map((h) => parsePercent(h.percent) ?? 0n);
    const sum = shares.reduce((a, b) => a + b, 0n);
    return { heirs: d.heirs.map((h, i) => ({ id: h.id, label: `Heir ${i + 1}`, name: h.name, address: h.address, share: shares[i] })), total: 10000n, customSum: sum };
  }
  const { shares, total } = equalShares(d.heirs.length);
  return { heirs: d.heirs.map((h, i) => ({ id: h.id, label: `Heir ${i + 1}`, name: h.name, address: h.address, share: shares[i] })), total };
}

/** Share as a percentage string with up to 2 decimals: "12.5". */
export function percentOf(share: bigint, total: bigint): string {
  if (total === 0n) return '0';
  return formatHundredths((share * 10000n + total / 2n) / total);
}

// ------------------------------------------------------------ validation

export type Errors = Record<string, string>;

export function validateHeirs(d: Draft, network: NetworkName, ownerAddress?: string): { errors: Errors; hints: Errors } {
  const errors: Errors = {};
  const hints: Errors = {};
  const r = resolve(d);
  if (d.mode === 'faraid' && r.faraid && !r.faraid.ok) errors.family = r.faraid.message;
  if (r.heirs.length > MAX_HEIRS) errors.family = `Pusaka can pay at most ${MAX_HEIRS} heirs in one plan.`;

  const seen = new Map<string, string>();
  r.heirs.forEach((h) => {
    const name = h.name.trim();
    if (!name) errors[`${h.id}.name`] = 'Add a name, so you and your heirs know who this is.';
    else if (name.length > MAX_HEIR_NAME_LENGTH) errors[`${h.id}.name`] = `Use a name with at most ${MAX_HEIR_NAME_LENGTH} characters.`;
    const a = checkAddress(h.address, network);
    if (!a.ok) {
      errors[`${h.id}.address`] =
        a.why === 'empty' ? 'Add a Bitcoin Cash address for this heir.'
        : a.why === 'wrong-network' ? (network === 'chipnet'
          ? 'This is a real-money address. On the test network, use one that starts with bchtest:.'
          : 'This is a test network address. Use one that starts with bitcoincash:.')
        : "This isn't a valid Bitcoin Cash address. Check it, or paste it again from the heir's wallet.";
    } else {
      const other = seen.get(a.address);
      if (other !== undefined) errors[`${h.id}.address`] = `${other} already uses this address. Each heir needs their own.`;
      else seen.set(a.address, h.name.trim() || h.label);
      if (ownerAddress && a.address === ownerAddress.toLowerCase()) hints[`${h.id}.address`] = 'This is the wallet you sign with, so a lost key loses it too. For a backup, add a second wallet of your own.';
    }
    if (d.mode === 'custom') {
      const p = parsePercent(d.heirs.find((x) => x.id === h.id)?.percent ?? '');
      if (p === null || p < 1n || p > 10000n) errors[`${h.id}.percent`] = 'Enter a share between 0.01% and 100%.';
    }
  });
  if (d.mode === 'custom' && r.customSum !== undefined && r.customSum !== 10000n) {
    errors.total = `Shares add up to ${formatHundredths(r.customSum)}%. Change them so they add up to 100%.`;
  }
  return { errors, hints };
}

/** Smallest amount for which every heir gets at least the dust limit. */
export function minimumAmount(shares: bigint[], total: bigint): bigint {
  let min = 0n;
  for (const s of shares) {
    if (s <= 0n) continue;
    const need = (DUST * total + s - 1n) / s;
    if (need > min) min = need;
  }
  return min;
}

/** "0,5" (comma decimal, as typed in much of the world) and "1,000.5" both work. */
export function normalizeAmount(s: string): string {
  const t = s.trim().replace(/\s/g, '');
  if (t.includes(',') && !t.includes('.') && /^\d*,\d+$/.test(t)) return t.replace(',', '.');
  return t.replace(/,/g, '');
}

export function parseAmount(s: string): bigint | null {
  const t = normalizeAmount(s);
  if (!/^\d*(\.\d{0,8})?$/.test(t) || t === '' || t === '.') return null;
  const [w, f = ''] = t.split('.');
  return BigInt(w || '0') * 100_000_000n + BigInt(f.padEnd(8, '0'));
}

export function validateAmount(d: Draft, usd: number | null, balance?: bigint): string | null {
  if (!d.amount.trim()) return 'Enter how much BCH goes into the plan.';
  if (/^\d*\.\d{9,}$/.test(normalizeAmount(d.amount))) return 'BCH has at most 8 decimals. Shorten the amount.';
  const a = parseAmount(d.amount);
  if (a === null) return 'Enter an amount in BCH, for example 0.1.';
  if (a === 0n) return 'Enter an amount above zero.';
  const r = resolve(d);
  const min = minimumAmount(r.heirs.map((h) => h.share), r.total);
  if (a < min) {
    const dustUsd = formatUsd(DUST, usd);
    return `This amount is too small. Each heir must get at least 546 satoshis${dustUsd ? ` (${dustUsd.replace('≈ ', 'about ')})` : ''}. Put in at least ${formatBch(min)} BCH.`;
  }
  if (balance !== undefined && a + FEE_BUDGET + CREATE_FEE_ESTIMATE > balance) {
    return `Your wallet has ${formatBch(balance)} BCH. Lower the amount so the fees fit too (about ${formatBch(FEE_BUDGET + CREATE_FEE_ESTIMATE)} BCH).`;
  }
  return null;
}

// ------------------------------------------------------------ waiting time

const DAY = 86_400n;
const MONTH = 2_629_746n; // average Gregorian month
const YEAR = 31_556_952n; // average Gregorian year
const UNIT: Record<PeriodUnit, bigint> = { days: DAY, months: MONTH, years: YEAR };

export function periodSeconds(d: Draft): bigint | null {
  if (d.period === '6m') return 6n * MONTH;
  if (d.period === '1y') return YEAR;
  if (d.period === '2y') return 2n * YEAR;
  const t = d.customCount.trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  return BigInt(t) * UNIT[d.customUnit];
}

export function validatePeriod(d: Draft): string | null {
  if (d.period !== 'custom') return null;
  const s = periodSeconds(d);
  if (s === null) return 'Enter a whole number of days, months or years.';
  if (s < DAY) return 'The waiting time must be at least 1 day.';
  if (s > 20n * YEAR) return 'The waiting time can be at most 20 years.';
  return null;
}

export function periodWords(d: Draft): string {
  if (d.period === '6m') return '6 months';
  if (d.period === '1y') return '1 year';
  if (d.period === '2y') return '2 years';
  const n = Number(d.customCount.trim() || 0);
  const unit = n === 1 ? d.customUnit.slice(0, -1) : d.customUnit;
  return `${n} ${unit}`;
}

// ------------------------------------------------------------ the plan

export function buildPlan(d: Draft, network: NetworkName, ownerAddress: string): PlanData {
  const r = resolve(d);
  const heirs: Heir[] = r.heirs.map((h) => {
    const a = checkAddress(h.address, network);
    return { name: h.name.trim(), address: a.ok ? a.address : h.address.trim(), share: h.share, ...(h.relation ? { relation: h.relation } : {}) };
  });
  return {
    version: 1,
    network,
    ownerAddress,
    heirs,
    shareTotal: r.total,
    splitMode: d.mode,
    period: periodSeconds(d) ?? YEAR,
    feeBudget: FEE_BUDGET,
  };
}

export function heirPayouts(d: Draft): { amounts: bigint[]; leftover: bigint } | null {
  const a = parseAmount(d.amount);
  if (a === null || a === 0n) return null;
  const r = resolve(d);
  if (r.heirs.length === 0) return null;
  return heirAmounts(a, r.heirs.map((h) => h.share), r.total);
}

export const heirColor = (i: number) => `var(--heir-${(i % 5) + 1})`;

/** DOM id of a field, from its key ("h1.address" -> "f-h1-address"). */
export const fieldId = (key: string) => `f-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`;
