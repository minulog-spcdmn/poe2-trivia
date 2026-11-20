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
// twice as often), short of having some context's answers missed more
// often than every time (`scoreOf`). With it, a 90% interval for the
// score: the scores under which its misses are no surprise, each answer
// missed at the score times its context's rate (`interval`). Sorted by
// that interval's lower end, the items surely missed most first; or,
// easiest first, by its upper end, the items surely missed least first.
// The filters apply before the rates, so `first` compares first meetings
// with first meetings.

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

/** An item's answers in one context, and how often every item is missed there. */
export interface Asked {
  n: number;
  p: number;
}

/**
 * The 90% interval for an item's score from its answers in each context
 * (`asked`) and its misses: every score s under which those misses are no
 * surprise, each context's answers missed at s times its rate (all of them
 * at most) and the misses within Z standard deviations of the number that
 * makes, with half an answer to spare (in one context, Wilson's interval
 * with its continuity correction). A miss share near a half then counts as
 * the evidence it is, where a Poisson interval on the misses alone was
 * about half again as wide; and no score past the one that misses every
 * answer is in it.
 */
export function interval(asked: readonly Asked[], miss: number): [number, number] {
  const live = liveOf(asked);
  if (!live.length) return [0, Infinity];
  const n = live.reduce((t, a) => t + a.n, 0);
  const at = (s: number, by = 0) => made(live, s, by);
  // Past this every answer is missed: no higher score makes any more.
  const top = topOf(live);
  /** Where the misses a score makes first reach `k` (they only grow with it). */
  const reach = (k: number) => halve(0, top, (s) => at(s) >= k);
  // Lower end: the least score whose misses, Z deviations up, reach these less half an answer (from `reach` on they always do).
  const low = miss <= 0 ? 0 : scan(0, reach(miss - 0.5), (s) => at(s, Z) >= miss - 0.5);
  // Upper end: the greatest score whose misses, Z deviations down, stay within these plus half an answer, scanned down from `top`.
  const high = miss >= n ? top : top - scan(0, top - reach(miss + 0.5), (d) => at(top - d, -Z) <= miss + 0.5);
  return [low, high];
}

/**
 * An item's score from its answers in each context (`asked`) and its
 * misses: its misses over those expected, unless that would have some
 * context's answers missed more often than every time (its rate times the
 * score past 1); then the score at which, as in `interval`, those are all
 * missed and the rest's answers, missed at the score times their rates,
 * make up its other misses. So it never falls outside its interval. Null
 * where nothing is expected of it.
 */
export function scoreOf(asked: readonly Asked[], miss: number): number | null {
  const live = liveOf(asked);
  if (!live.length) return null;
  const s = miss / live.reduce((t, a) => t + a.n * a.p, 0);
  // (No context's answers missed past all of them at it: the plain ratio.)
  if (s * Math.max(...live.map((a) => a.p)) <= 1) return s;
  return halve(0, topOf(live), (x) => made(live, x) >= miss);
}

/** The contexts that bear on a score: a context nobody missed in adds no misses at any score, so it can't move one. */
const liveOf = (asked: readonly Asked[]) => asked.filter((a) => a.n > 0 && a.p > 0);

/** The score past which every answer is missed, so no higher one makes any more misses. */
const topOf = (live: readonly Asked[]) => 1 / Math.min(...live.map((a) => a.p));

/** The misses score `s` makes over `live`, each context's answers missed at `s` times its rate (all of them at most), and that `by` standard deviations away. */
function made(live: readonly Asked[], s: number, by = 0): number {
  let m = 0;
  let v = 0;
  for (const a of live) {
    const q = Math.min(1, s * a.p);
    m += a.n * q;
    v += a.n * q * (1 - q);
  }
  return m + by * Math.sqrt(v);
}

/** The first s in [a, b] where `ok` holds, `ok(b)` holding and `ok(a)` not, by halving: right where `ok` holds from that s on. */
function halve(a: number, b: number, ok: (s: number) => boolean): number {
  for (let i = 0; i < 60; i++) {
    const mid = (a + b) / 2;
    if (ok(mid)) b = mid;
    else a = mid;
  }
  return b;
}

/** The first s in [a, b] where `ok` holds, `ok(b)` holding: a scan first, so a condition that turns back once (as several contexts' can) isn't missed, then halving. */
function scan(a: number, b: number, ok: (s: number) => boolean): number {
  const STEPS = 200;
  for (let i = 1; i <= STEPS; i++) {
    const s = a + ((b - a) * i) / STEPS;
    if (ok(s)) return halve(a + ((b - a) * (i - 1)) / STEPS, s, ok);
  }
  return b;
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
  // Per item, its sums, and its answers in each context (first meetings and repeats in one, as they share its rate).
  const items = new Map<string, { item: string; n: number; miss: number; expected: number; asked: Map<string, Asked> }>();
  for (const x of kept) {
    const key = `${x.form} ${x.ctx}`;
    const c = rate.get(key)!;
    const s = items.get(x.item) ?? { item: x.item, n: 0, miss: 0, expected: 0, asked: new Map() };
    const p = c.n ? c.w / c.n : 0;
    s.n += x.r + x.w;
    s.miss += x.w;
    s.expected += (x.r + x.w) * p;
    const a = s.asked.get(key) ?? { n: 0, p };
    a.n += x.r + x.w;
    s.asked.set(key, a);
    items.set(x.item, s);
  }
  const list = [...items.values()]
    .filter((s) => s.n >= (o.min ?? 1))
    .map(({ asked, ...s }): Ranked => {
      // (Nothing expected: every answer in its contexts was right, so no score can be had.)
      if (!s.expected) return { ...s, score: null, low: 0, high: Infinity };
      const by = [...asked.values()];
      const [low, high] = interval(by, s.miss);
      return { ...s, score: scoreOf(by, s.miss), low, high };
    });
  return { v, list: sortRanked(list, o.order) };
}

/** Sorts `list` in place in `order` (hardest first by default), as `rank` does: the Items view re-sorts with it, so a change of order doesn't work every interval out again. */
export function sortRanked(list: Ranked[], order: RankOrder = 'hardest'): Ranked[] {
  // (Those with no score last, below any with one, however many answers they have: either way they tell nothing.)
  const none = (a: Ranked, b: Ranked) => Number(a.score === null) - Number(b.score === null);
  if (order === 'easiest') return list.sort((a, b) => none(a, b) || a.high - b.high || (a.score ?? 0) - (b.score ?? 0) || b.n - a.n);
  return list.sort((a, b) => none(a, b) || b.low - a.low || (b.score ?? 0) - (a.score ?? 0) || b.n - a.n);
}
