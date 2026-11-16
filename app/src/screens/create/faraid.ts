// Islamic inheritance (faraid) for the common family: spouse, parents, sons, daughters and full siblings.
// Input: who is alive. Output: exact integer shares over one common total, for the contract.
// Rules (majority Sunni view): fixed shares (fard) from An-Nisa 4:11, 4:12, 4:176; sons take twice a
// daughter; the father takes 1/6 with a son, 1/6 plus the rest with only daughters, the rest with no
// children; the mother 1/6 with children or 2+ siblings, else 1/3 (1/3 of the rest in the two Umar cases);
// siblings are excluded by a son or the father; awl when fixed shares pass the whole; radd (not to the
// spouse) when nobody takes the rest. Anything else is reported as not covered.

export interface Family {
  spouse: 'none' | 'husband' | 'wife';
  /** 1 to 4, used when spouse is 'wife' */
  wives: number;
  father: boolean;
  mother: boolean;
  sons: number;
  daughters: number;
  /** full brothers and sisters (same father and mother) */
  brothers: number;
  sisters: number;
}

export const EMPTY_FAMILY: Family = { spouse: 'none', wives: 1, father: false, mother: false, sons: 0, daughters: 0, brothers: 0, sisters: 0 };

export type Relation = 'husband' | 'wife' | 'father' | 'mother' | 'son' | 'daughter' | 'brother' | 'sister';

export interface FaraidHeir {
  /** stable key, e.g. 'son-2', so typed names survive family changes */
  key: string;
  relation: Relation;
  /** "Son 2" */
  label: string;
  share: bigint;
  /** plain reason for the share, e.g. "1/8, as there are children" */
  reason: string;
}

export interface FaraidExcluded { label: string; reason: string }

export type FaraidResult =
  | { ok: true; heirs: FaraidHeir[]; total: bigint; excluded: FaraidExcluded[]; adjustment: 'none' | 'awl' | 'radd' }
  | { ok: false; kind: 'empty' | 'unsupported' | 'too-many'; message: string };

export const FARAID_MAX_HEIRS = 10;

// ------------------------------------------------------------ exact fractions

interface Frac { n: bigint; d: bigint }
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const lcm = (a: bigint, b: bigint) => (a / gcd(a, b)) * b;
const frac = (n: bigint, d: bigint = 1n): Frac => { const g = gcd(n, d) || 1n; return { n: n / g, d: d / g }; };
const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
const cmp = (a: Frac, b: Frac) => { const x = a.n * b.d - b.n * a.d; return x > 0n ? 1 : x < 0n ? -1 : 0; };
const ZERO = frac(0n);
const ONE = frac(1n);

// ------------------------------------------------------------ groups

interface Group {
  relation: Relation;
  count: number;
  /** fixed share of the whole group, if any */
  fard: Frac;
  /** weight per person in the residue, if this group takes the rest */
  restWeight: number;
  reason: string;
}

const NAMES: Record<Relation, [string, string]> = {
  husband: ['Husband', 'Husbands'], wife: ['Wife', 'Wives'], father: ['Father', 'Father'], mother: ['Mother', 'Mother'],
  son: ['Son', 'Sons'], daughter: ['Daughter', 'Daughters'], brother: ['Brother', 'Brothers'], sister: ['Sister', 'Sisters'],
};

function clampCount(n: number, max: number) { return Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : 0))); }

export function faraid(input: Family): FaraidResult {
  const f: Family = {
    ...input,
    wives: input.spouse === 'wife' ? Math.max(1, clampCount(input.wives, 4)) : 0,
    sons: clampCount(input.sons, 20), daughters: clampCount(input.daughters, 20),
    brothers: clampCount(input.brothers, 20), sisters: clampCount(input.sisters, 20),
  };
  const children = f.sons + f.daughters > 0;
  const siblings = f.brothers + f.sisters;
  const groups: Group[] = [];
  const excluded: FaraidExcluded[] = [];

  if (f.spouse === 'none' && !f.father && !f.mother && !children && siblings === 0) {
    return { ok: false, kind: 'empty', message: 'Add the family members who would inherit.' };
  }

  // Spouse
  let spouseFard = ZERO;
  if (f.spouse === 'husband') {
    spouseFard = children ? frac(1n, 4n) : frac(1n, 2n);
    groups.push({ relation: 'husband', count: 1, fard: spouseFard, restWeight: 0, reason: children ? '1/4, as there are children' : '1/2, as there are no children' });
  } else if (f.spouse === 'wife') {
    spouseFard = children ? frac(1n, 8n) : frac(1n, 4n);
    const shared = f.wives > 1 ? `, shared by ${f.wives} wives` : '';
    groups.push({ relation: 'wife', count: f.wives, fard: spouseFard, restWeight: 0, reason: (children ? '1/8, as there are children' : '1/4, as there are no children') + shared });
  }

  // Father
  if (f.father) {
    if (f.sons > 0) groups.push({ relation: 'father', count: 1, fard: frac(1n, 6n), restWeight: 0, reason: '1/6, as there is a son' });
    else if (f.daughters > 0) groups.push({ relation: 'father', count: 1, fard: frac(1n, 6n), restWeight: 1, reason: '1/6 and the rest, as there are daughters but no son' });
    else groups.push({ relation: 'father', count: 1, fard: ZERO, restWeight: 1, reason: 'The rest, as there are no children' });
  }

  // Mother
  if (f.mother) {
    if (children) groups.push({ relation: 'mother', count: 1, fard: frac(1n, 6n), restWeight: 0, reason: '1/6, as there are children' });
    else if (siblings >= 2) groups.push({ relation: 'mother', count: 1, fard: frac(1n, 6n), restWeight: 0, reason: '1/6, as there are two or more brothers or sisters' });
    else if (f.father && f.spouse !== 'none') {
      // The two Umar cases: spouse, father and mother only. Mother takes 1/3 of what the spouse leaves.
      const m = div(sub(ONE, spouseFard), frac(3n));
      groups.push({ relation: 'mother', count: 1, fard: m, restWeight: 0, reason: `1/3 of what is left after the ${f.spouse === 'husband' ? "husband's" : "wife's"} share` });
    } else groups.push({ relation: 'mother', count: 1, fard: frac(1n, 3n), restWeight: 0, reason: '1/3, as there are no children' });
  }

  // Children
  if (f.sons > 0) {
    groups.push({ relation: 'son', count: f.sons, fard: ZERO, restWeight: 2, reason: f.daughters > 0 ? 'The rest. A son gets twice a daughter' : f.sons > 1 ? 'The rest, shared equally by sons' : 'The rest' });
    if (f.daughters > 0) groups.push({ relation: 'daughter', count: f.daughters, fard: ZERO, restWeight: 1, reason: "The rest. A daughter gets half a son's share" });
  } else if (f.daughters === 1) {
    groups.push({ relation: 'daughter', count: 1, fard: frac(1n, 2n), restWeight: 0, reason: '1/2, as the only child' });
  } else if (f.daughters > 1) {
    groups.push({ relation: 'daughter', count: f.daughters, fard: frac(2n, 3n), restWeight: 0, reason: `2/3, shared by ${f.daughters} daughters` });
  }

  // Full brothers and sisters
  if (siblings > 0) {
    const blocker = f.sons > 0 ? (f.father ? 'a son and the father come first' : 'a son comes first') : f.father ? 'the father comes first' : '';
    if (blocker) {
      if (f.brothers > 0) excluded.push({ label: NAMES.brother[f.brothers > 1 ? 1 : 0], reason: blocker });
      if (f.sisters > 0) excluded.push({ label: NAMES.sister[f.sisters > 1 ? 1 : 0], reason: blocker });
    } else if (f.brothers > 0) {
      groups.push({ relation: 'brother', count: f.brothers, fard: ZERO, restWeight: 2, reason: f.sisters > 0 ? 'The rest. A brother gets twice a sister' : 'The rest' });
      if (f.sisters > 0) groups.push({ relation: 'sister', count: f.sisters, fard: ZERO, restWeight: 1, reason: "The rest. A sister gets half a brother's share" });
    } else if (f.daughters > 0) {
      groups.push({ relation: 'sister', count: f.sisters, fard: ZERO, restWeight: 1, reason: 'The rest, as there are daughters' });
    } else {
      groups.push({ relation: 'sister', count: f.sisters, fard: f.sisters === 1 ? frac(1n, 2n) : frac(2n, 3n), restWeight: 0, reason: f.sisters === 1 ? '1/2, as the only sister' : `2/3, shared by ${f.sisters} sisters` });
    }
  }

  const people = groups.reduce((n, g) => n + g.count, 0);
  if (people > FARAID_MAX_HEIRS) {
    return { ok: false, kind: 'too-many', message: `This family has ${people} heirs. Pusaka can pay at most ${FARAID_MAX_HEIRS} heirs in one plan.` };
  }

  // Shares per group
  const fardSum = groups.reduce((s, g) => add(s, g.fard), ZERO);
  const restGroups = groups.filter((g) => g.restWeight > 0);
  let adjustment: 'none' | 'awl' | 'radd' = 'none';
  const groupShare = new Map<Group, Frac>();

  if (cmp(fardSum, ONE) > 0) {
    // Awl: fixed shares pass the whole, every fixed share shrinks in proportion; nothing is left for the rest.
    adjustment = 'awl';
    for (const g of groups) groupShare.set(g, div(g.fard, fardSum));
  } else {
    const rest = sub(ONE, fardSum);
    for (const g of groups) groupShare.set(g, g.fard);
    if (cmp(rest, ZERO) > 0) {
      if (restGroups.length > 0) {
        const units = restGroups.reduce((u, g) => u + g.count * g.restWeight, 0);
        for (const g of restGroups) groupShare.set(g, add(groupShare.get(g)!, mul(rest, frac(BigInt(g.count * g.restWeight), BigInt(units)))));
      } else {
        // Radd: the rest goes back to the fixed heirs other than the spouse, in proportion.
        const back = groups.filter((g) => g.relation !== 'husband' && g.relation !== 'wife' && g.fard.n > 0n);
        if (back.length === 0) {
          return {
            ok: false, kind: 'unsupported',
            message: `With only a ${f.spouse === 'husband' ? 'husband' : 'wife'}, scholars differ on who receives the rest. Ask a scholar, then use Custom %.`,
          };
        }
        adjustment = 'radd';
        const backSum = back.reduce((s, g) => add(s, g.fard), ZERO);
        for (const g of back) groupShare.set(g, add(g.fard, mul(rest, div(g.fard, backSum))));
      }
    }
  }

  // Per person, then one common total.
  const persons: { g: Group; i: number; share: Frac }[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) persons.push({ g, i, share: div(groupShare.get(g)!, frac(BigInt(g.count))) });
  }
  const paid = persons.filter((p) => p.share.n > 0n);
  const total = paid.reduce((t, p) => lcm(t, p.share.d), 1n);
  const heirs: FaraidHeir[] = paid.map(({ g, i, share }) => ({
    key: `${g.relation}-${i + 1}`,
    relation: g.relation,
    label: g.count > 1 ? `${NAMES[g.relation][0]} ${i + 1}` : NAMES[g.relation][0],
    share: (share.n * total) / share.d,
    reason: g.reason,
  }));
  for (const g of groups) {
    if (groupShare.get(g)!.n === 0n) excluded.push({ label: NAMES[g.relation][g.count > 1 ? 1 : 0], reason: 'the fixed shares already use the whole' });
  }

  return { ok: true, heirs, total, excluded, adjustment };
}
