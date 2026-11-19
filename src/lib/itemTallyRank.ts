// Which items players miss more than the others asked under the same rules,
// from the item tally's sums (signal/worker.js Tally, lib/itemTally.ts):
// the stats page's Items view and scripts/item-tally.mjs both rank by this.
// Plain, with no imports, so the script loads it under Node as it is.
//
// Not a raw share missed: a depth-40 item would always look harder than a
// depth-2 one. For each version, form and context (d1..d20 Delve alone by
// band of ten depths, g1..g20 together, t-<difficulty> Take turns,
// r-<difficulty> Race, practice, daily) the expected miss rate is every
// item's misses there over every item's answers there; an item's expected
// misses are its answers in each context times that context's rate, summed;
// its score is its misses over those expected (1: as missed as the rest, 2:
// twice as often). With it, a 90% interval for the score, from a Poisson
// interval on the observed misses (Byar's approximation of the exact one)
// over the expected. Sorted by that interval's lower end, the items surely
// missed most first; or, easiest first, by its upper end, the items surely
// missed least first. The filters apply before the rates, so `first`
// compares first meetings with first meetings.

/** One sum as the Worker keeps it: an item's right and wrong answers in one form, context and first-or-not, under a tally version. */
export interface TallyRow {
  v: number;
  item: string;
  form: 'n' | 'a';
  ctx: string;
  first: 0 | 1;
  r: number;
  w: number;
}

/** Which rules the answers were given under (lib/itemTally.ts sends it): bumped when what a context means changes, so answers given after don't mix with these. */
export const TALLY_VERSION = 1;

/** The Worker's cap on sums kept (signal/worker.js TALLY_ROWS). */
export const TALLY_ROWS = 200_000;

/** The modes the tally can be narrowed to, and which contexts each keeps. */
export const TALLY_MODES = {
  delve: (c: string) => /^d\d+$/.test(c),
  together: (c: string) => /^g\d+$/.test(c),
  turns: (c: string) => c.startsWith('t-'),
  race: (c: string) => c.startsWith('r-'),
  practice: (c: string) => c === 'practice',
  daily: (c: string) => c === 'daily',
} as const;
export type TallyMode = keyof typeof TALLY_MODES;

/** What the ranking is narrowed to: a form, a mode, first meetings only, the fewest answers an item needs, a version (this build's by default); and which end comes first (the hardest by default). */
export interface RankOptions {
  form?: 'n' | 'a';
  mode?: TallyMode;
  first?: boolean;
  min?: number;
  v?: number;
  order?: RankOrder;
}

/** Hardest first: by the interval's lower end, highest first. Easiest first: by its upper end, lowest first. */
export type RankOrder = 'hardest' | 'easiest';

/** An item's answers, misses, the misses expected of it, its score (null where nothing was expected) and the score's 90% interval. */
export interface Ranked {
  item: string;
  n: number;
  miss: number;
  expected: number;
  score: number | null;
  low: number;
  high: number;
}

/** The z for a two-sided 90% interval. */
const Z = 1.645;

/** The 90% Poisson interval for an observed count `k` (Byar's approximation). */
export function poisson(k: number): [number, number] {
  const low = k === 0 ? 0 : k * (1 - 1 / (9 * k) - Z / (3 * Math.sqrt(k))) ** 3;
  const k1 = k + 1;
  const high = k1 * (1 - 1 / (9 * k1) + Z / (3 * Math.sqrt(k1))) ** 3;
  return [Math.max(0, low), high];
}

/**
 * Per item, its answers, misses, the misses expected of it, its score and
 * the score's interval, from the rows kept, as the options filter them:
 * sorted by the interval's lower end, most missed first, or (`order`
 * 'easiest') by its upper end, least missed first.
 */
export function rank(rows: readonly TallyRow[], o: RankOptions = {}): { v: number; list: Ranked[] } {
  // (This build's, not the newest tallied: a newer build's sums, under rules this one doesn't know, never mix with or hide these.)
  const v = o.v ?? TALLY_VERSION;
  const keeps = o.mode ? TALLY_MODES[o.mode] : null;
  const kept = rows.filter((x) => x.v === v && (!o.form || x.form === o.form) && (!o.first || x.first === 1) && (!keeps || keeps(x.ctx)));
  // Each context's miss rate, over every item.
  const rate = new Map<string, { n: number; w: number }>();
  for (const x of kept) {
    const key = `${x.form} ${x.ctx}`;
    const s = rate.get(key) ?? { n: 0, w: 0 };
    s.n += x.r + x.w;
    s.w += x.w;
    rate.set(key, s);
  }
  const items = new Map<string, { item: string; n: number; miss: number; expected: number }>();
  for (const x of kept) {
    const c = rate.get(`${x.form} ${x.ctx}`)!;
    const s = items.get(x.item) ?? { item: x.item, n: 0, miss: 0, expected: 0 };
    s.n += x.r + x.w;
    s.miss += x.w;
    s.expected += c.n ? ((x.r + x.w) * c.w) / c.n : 0;
    items.set(x.item, s);
  }
  const list = [...items.values()]
    .filter((s) => s.n >= (o.min ?? 1))
    .map((s): Ranked => {
      // (Nothing expected: every answer in its contexts was right, so no score can be had.)
      if (!s.expected) return { ...s, score: null, low: 0, high: Infinity };
      const [low, high] = poisson(s.miss);
      return { ...s, score: s.miss / s.expected, low: low / s.expected, high: high / s.expected };
    });
  // (Those with no score last, below any with one, however many answers they have: either way they tell nothing.)
  const none = (a: Ranked, b: Ranked) => Number(a.score === null) - Number(b.score === null);
  if (o.order === 'easiest') list.sort((a, b) => none(a, b) || a.high - b.high || (a.score ?? 0) - (b.score ?? 0) || b.n - a.n);
  else list.sort((a, b) => b.low - a.low || none(a, b) || (b.score ?? 0) - (a.score ?? 0) || b.n - a.n);
  return { v, list };
}
