// The numbers the codex page shows, worked out from the stored codex (and the
// Delve records). Apart from codex.ts so that only the page, loaded when it's
// opened, carries them.

import type { Difficulty, Item, QuestionMode } from './game.ts';
import { RECENT, answerLives, answerWards, livesCost, type Answer, type Codex, type ItemEntry, type Tally } from './codex.ts';
import { DELVE_RULESET, type FindKind, type ItemKind } from './delve.ts';
import { MAX_DEPTH, bestKey, tallyOf as runsTally, type DelveRecords, type DelveRun, type DelveTally, type Frontier } from './delveRecord.ts';
import { stratumName } from './descent.ts';

/** Fewer answers than this don't make an item a nemesis. */
export const NEMESIS_MIN = 2;

const noTally = (): Tally => ({ n: 0, ok: 0 });
const add = (t: Tally, ok: boolean): Tally => ({ n: t.n + 1, ok: t.ok + (ok ? 1 : 0) });

export const tallyOf = (e: ItemEntry): Tally => ({ n: e.name.n + e.art.n, ok: e.name.ok + e.art.ok });
/** Share of right answers, or null without any. */
export const accuracy = (t: Tally) => (t.n ? t.ok / t.n : null);
const sum = (a: Tally, b: Tally): Tally => ({ n: a.n + b.n, ok: a.ok + b.ok });

export interface GroupStats extends Tally {
  group: string;
  total: number;
  seen: number;
}
export interface CategoryStats extends GroupStats {
  category: string;
  groups: GroupStats[];
}

export interface CodexStats extends Tally {
  total: number;
  seen: number;
  /** The latest RECENT answers. */
  recent: Tally;
  streak: number;
  best: number;
  /** Median time of the right answers in the log. */
  medianMs: number | null;
  fastest: { ms: number; item: Item } | null;
  byMode: Record<QuestionMode, Tally>;
  byDifficulty: Partial<Record<Difficulty, Tally>>;
  /** In the order the categories are given. */
  categories: CategoryStats[];
  /** Lowest accuracy first, at least NEMESIS_MIN answers. */
  nemeses: { item: Item; tally: Tally }[];
  /** Items whose art was taken for another's name, most often first. */
  confusions: { answer: Item; picked: Item; n: number }[];
  fooled: { name: string; of: Item | undefined; n: number }[];
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Everything the codex page shows, for the items the game has now. */
export function codexStats(c: Codex, items: Item[], categories: string[], limit = 5): CodexStats {
  const byId = new Map(items.map((it) => [it.id, it]));
  let all = noTally();
  let seen = 0;
  const byMode = { name: noTally(), art: noTally() };
  const cats = new Map<string, CategoryStats>(
    categories.map((category) => [category, { category, group: category, total: 0, seen: 0, n: 0, ok: 0, groups: [] }]),
  );
  const nemeses: CodexStats['nemeses'] = [];
  const confusions: CodexStats['confusions'] = [];
  for (const it of items) {
    const cat = cats.get(it.category);
    if (!cat) continue;
    let group = cat.groups.find((g) => g.group === it.group);
    if (!group) cat.groups.push((group = { group: it.group, total: 0, seen: 0, n: 0, ok: 0 }));
    cat.total++;
    group.total++;
    const e = c.items[it.id];
    if (!e) continue;
    const t = tallyOf(e);
    seen++;
    cat.seen++;
    group.seen++;
    all = sum(all, t);
    Object.assign(cat, sum(cat, t));
    Object.assign(group, sum(group, t));
    byMode.name = sum(byMode.name, e.name);
    byMode.art = sum(byMode.art, e.art);
    if (t.n >= NEMESIS_MIN && t.ok < t.n) nemeses.push({ item: it, tally: t });
    for (const [id, n] of Object.entries(e.mixed)) {
      const picked = byId.get(id);
      if (picked) confusions.push({ answer: it, picked, n });
    }
  }
  for (const cat of cats.values()) cat.groups.sort((a, b) => a.group.localeCompare(b.group));
  nemeses.sort((a, b) => a.tally.ok / a.tally.n - b.tally.ok / b.tally.n || b.tally.n - a.tally.n || a.item.name.localeCompare(b.item.name));
  confusions.sort((a, b) => b.n - a.n || a.answer.name.localeCompare(b.answer.name));
  const recent = c.log.slice(-RECENT).reduce((t, a) => add(t, a.ok), noTally());
  const fastItem = c.fastest && byId.get(c.fastest.id);
  return {
    ...all,
    total: items.length,
    seen,
    recent,
    streak: c.streak,
    best: c.best,
    medianMs: median(c.log.flatMap((a) => (a.ok && a.ms ? [a.ms] : []))),
    fastest: c.fastest && fastItem ? { ms: c.fastest.ms, item: fastItem } : null,
    byMode,
    byDifficulty: c.byDifficulty,
    categories: [...cats.values()],
    nemeses: nemeses.slice(0, limit),
    confusions: confusions.slice(0, limit),
    fooled: Object.entries(c.fooled)
      .map(([name, f]) => ({ name, of: byId.get(f.of), n: f.n, last: f.last }))
      .sort((a, b) => b.n - a.n || b.last - a.last)
      .slice(0, limit)
      .map(({ name, of, n }) => ({ name, of, n })),
  };
}

// ---- Delve -------------------------------------------------------------------
//
// What every number on the Delve page means. All of them are under the
// current rules (DELVE_RULESET) and of one kind of run, alone or together;
// runs under other rules, or resumed across a change of rules, are only
// listed, apart, with their own bests.
// - A run is counted once it ends: it fell (its third life went), or it was
//   left standing (see delveRecord.ts). Both count as runs that got that deep.
// - A best is the deepest fall; a run left never is one.
// - The typical depth is the median depth runs fell at, from MIN_RUNS falls.
// - Where you fall: lives lost in a zone, and the runs that reached it (alone
//   and together as one, mergeTallies: they are your lives either way).
// - What kills you: lives lost and answers, from every Delve answer (alone or
//   together: the codex keeps answers by item, not by run), a cave-in two.

/** Most stats wait for this many runs: fewer say little. */
export const MIN_RUNS = 3;
/** A zone's death rate is shown once this many runs reached it. */
export const ZONE_MIN_RUNS = 5;
/** An item's death rate is shown from this many answers. */
export const ITEM_MIN = 2;
/** A category's death rate is shown from this many answers. */
export const CATEGORY_MIN = 5;
/** Depths in a zone (a stratum of the descent). */
export const ZONE_SIZE = 10;

export type DelveKind = 'solo' | 'group';

export interface Zone {
  /** The stratum: 0 for depths 1 to 10. */
  k: number;
  /** Its first and last depth. */
  depth: number;
  to: number;
  /** Its biome, numbered from its second time round past 100 ("Frozen Hollow II"). */
  name: string;
}

function roman(n: number): string {
  const parts: [number, string][] = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of parts) for (; n >= v; n -= v) out += s;
  return out;
}

const LAST_ZONE = Math.floor((MAX_DEPTH - 1) / ZONE_SIZE);
const zoneNames: string[] = [];
/** Zone `k`, named as the descent names its stratum. */
export function zone(k: number): Zone {
  const at = Math.max(0, Math.min(LAST_ZONE, Math.floor(k)));
  for (let j = zoneNames.length; j <= at; j++) {
    const biome = stratumName(j);
    let seen = 0;
    for (let i = 0; i < j; i++) if (stratumName(i) === biome) seen++;
    zoneNames.push(seen ? `${biome} ${roman(seen + 1)}` : biome);
  }
  return { k: at, depth: at * ZONE_SIZE + 1, to: (at + 1) * ZONE_SIZE, name: zoneNames[at] };
}

/** The zone a depth lies in (depths 1 to 10: the first). */
export const zoneOf = (depth: number): Zone => zone(Math.floor((Math.max(1, Math.floor(depth)) - 1) / ZONE_SIZE));

/** From a depth toward the next zone: how many depths are left, and how far through its own zone it is (0 to 1). */
export function toward(depth: number): { here: Zone; next: Zone; left: number; share: number } {
  const here = zoneOf(depth);
  const next = zone(here.k + 1);
  return { here, next, left: next.depth - depth, share: (depth - here.depth + 1) / (ZONE_SIZE + 1) };
}

/** The median of values given as counts by value, without spelling them out. */
export function medianOfCounts(m: Record<number, number>): number | null {
  const entries = Object.entries(m)
    .map(([k, n]) => [Number(k), n] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (!total) return null;
  const at = (i: number) => {
    let seen = 0;
    for (const [v, n] of entries) if ((seen += n) > i) return v;
    return entries.at(-1)![0];
  };
  return (at((total - 1) >> 1) + at(total >> 1)) / 2;
}

const sumOf = (m: Record<number, number> | undefined) => Object.values(m ?? {}).reduce((a, b) => a + b, 0);

export interface DelveSummary {
  /** Runs counted: fallen and left. */
  runs: number;
  fell: number;
  left: number;
  /** Group runs won. */
  wins: number;
  /** The median depth runs fell at; null before MIN_RUNS falls. */
  median: number | null;
  best: DelveRun | null;
  /** The deepest fall: the best's, or (if the best was lost, records written by a broken build) the tally's. */
  deepest: number | null;
}

/** The counted runs of a kind under a ruleset (this one by default). */
export function delveSummary(r: DelveRecords, kind: DelveKind, ruleset = DELVE_RULESET): DelveSummary {
  const t = runsTally(r, kind === 'solo', ruleset);
  const fell = sumOf(t.ends);
  const left = sumOf(t.left);
  const best = r.bests[bestKey(ruleset, kind === 'solo')] ?? null;
  return {
    runs: fell + left,
    fell,
    left,
    wins: t.wins,
    median: fell >= MIN_RUNS ? medianOfCounts(t.ends) : null,
    best,
    deepest: best?.depth ?? (fell ? Math.max(...Object.keys(t.ends).map(Number)) : null),
  };
}

/** Tallies as one: runs alone and together counted together. */
export function mergeTallies(...ts: DelveTally[]): DelveTally {
  const add = (into: Record<number, number>, m: Record<number, number> | undefined) => {
    for (const [d, n] of Object.entries(m ?? {})) into[Number(d)] = (into[Number(d)] ?? 0) + n;
  };
  const out: DelveTally = { wins: 0, ends: {}, lost: {} };
  const left: Record<number, number> = {};
  for (const t of ts) {
    out.wins += t.wins;
    add(out.ends, t.ends);
    add(out.lost, t.lost);
    add(left, t.left);
  }
  return Object.keys(left).length ? { ...out, left } : out;
}

/** Lives a tally's runs lost: each fall's last, and every one before it (runs from before losses were kept count only their last). */
export const livesLost = (t: DelveTally) => sumOf(t.ends) + sumOf(t.lost);

/** Climbs as one: each step deeper than every one before it, from any of them, oldest first. */
export function mergeClimbs(...cs: Frontier[][]): Frontier[] {
  const out: Frontier[] = [];
  for (const f of cs.flat().sort((a, b) => a.at - b.at || a.depth - b.depth)) if (f.depth > (out.at(-1)?.depth ?? 0)) out.push(f);
  return out;
}

/** A climb's depths to show in a line, the first and the latest few: [6, null, 20, 35, 43] (null for those left out). */
export function milestones(climb: Frontier[], max = 5): (number | null)[] {
  const ds = climb.map((f) => f.depth);
  if (ds.length <= max) return ds;
  return [ds[0], null, ...ds.slice(-(max - 1))];
}

export interface ZoneRisk extends Zone {
  /** Runs that got this deep. */
  reached: number;
  /** Lives they lost in it. */
  lives: number;
  /** Lives lost per run that reached it. */
  rate: number;
}

/** Lives lost in each zone per run that reached it, from the top, while at least `min` runs got there. */
export function zoneRisks(t: DelveTally, min = ZONE_MIN_RUNS): ZoneRisk[] {
  const stopped = new Map<number, number>();
  const lives = new Map<number, number>();
  const into = (m: Map<number, number>, d: string, n: number) => {
    const k = zoneOf(Number(d)).k;
    m.set(k, (m.get(k) ?? 0) + n);
  };
  for (const [d, n] of Object.entries(t.ends)) {
    into(stopped, d, n);
    into(lives, d, n);
  }
  for (const [d, n] of Object.entries(t.left ?? {})) into(stopped, d, n);
  for (const [d, n] of Object.entries(t.lost)) into(lives, d, n);
  let reached = sumOf(Object.fromEntries(stopped));
  const out: ZoneRisk[] = [];
  for (let k = 0; reached >= min && reached > 0; k++) {
    const z = zone(k);
    const n = lives.get(k) ?? 0;
    out.push({ ...z, reached, lives: n, rate: n / reached });
    reached -= stopped.get(k) ?? 0;
  }
  return out;
}

export interface ZoneReached extends Zone {
  /** When a run first got this deep. */
  at: number;
}

export interface ZoneProgress {
  /** From the top down. */
  reached: ZoneReached[];
  /** Distinct biomes among them. */
  biomes: number;
  /** The next zone, still to find. */
  next: Zone | null;
}

/** The zones a climb of bests got to, each dated by the run that first did. */
export function zonesReached(climb: Frontier[]): ZoneProgress {
  const deepest = climb.at(-1)?.depth ?? 0;
  if (!deepest) return { reached: [], biomes: 0, next: null };
  const last = zoneOf(deepest).k;
  const reached: ZoneReached[] = [];
  for (let k = 0; k <= last; k++) {
    const z = zone(k);
    reached.push({ ...z, at: climb.find((f) => f.depth >= z.depth)?.at ?? climb.at(-1)!.at });
  }
  const biomes = new Set(reached.map((z) => stratumName(z.k))).size;
  return { reached, biomes, next: last < LAST_ZONE ? zone(last + 1) : null };
}

/** The listed runs of a kind under a ruleset (this one by default), its rules kept to, newest first. */
export function runsOf(r: DelveRecords, kind: DelveKind, ruleset = DELVE_RULESET): DelveRun[] {
  return r.runs.filter((x) => x.ruleset === ruleset && !x.mixed && x.players < 2 === (kind === 'solo')).reverse();
}

export interface RulesGroup {
  /** The ruleset, or null for runs whose rules changed as they were resumed. */
  ruleset: number | null;
  /** Newest first. */
  runs: DelveRun[];
  /** Its own bests, alone and together (none for runs whose rules changed). */
  solo: number | null;
  group: number | null;
}

/** The listed runs under other rules, each ruleset apart (newest first), then those whose rules changed mid-run. */
export function otherRules(r: DelveRecords, ruleset = DELVE_RULESET): RulesGroup[] {
  const out = new Map<number | null, RulesGroup>();
  const group = (rs: number | null) => {
    let g = out.get(rs);
    if (!g) out.set(rs, (g = { ruleset: rs, runs: [], solo: rs === null ? null : (r.bests[bestKey(rs, true)]?.depth ?? null), group: rs === null ? null : (r.bests[bestKey(rs, false)]?.depth ?? null) }));
    return g;
  };
  for (const run of [...r.runs].reverse()) if (run.mixed || run.ruleset !== ruleset) group(run.mixed ? null : run.ruleset).runs.push(run);
  // Bests under other rules whose runs have all left the list still show.
  for (const k of Object.keys(r.bests)) {
    const rs = Number(k.split(':')[0]);
    if (rs !== ruleset) group(rs);
  }
  return [...out.values()].sort((a, b) => (a.ruleset === null ? 1 : b.ruleset === null ? -1 : b.ruleset - a.ruleset));
}

export interface DeathRate {
  /** Answers, and the lives they cost. */
  n: number;
  lives: number;
  /** Lives per answer. */
  rate: number;
}

export interface DelveDeaths {
  answers: Tally;
  lives: number;
  /** Wards that broke in place of a life. */
  warded: number;
  /** Questions a stick of dynamite went off on. */
  blasted: number;
  /** Categories by lives per answer, from CATEGORY_MIN answers, the deadliest first. */
  categories: (DeathRate & { category: string })[];
  /** Items by lives per answer, from ITEM_MIN answers that cost any, the deadliest first. */
  items: (DeathRate & { item: Item })[];
}

/** What costs lives in Delve, by category and by item (an item's category comes from its id). */
export function delveDeaths(c: Codex, items: Item[], limit = 5): DelveDeaths {
  let answers = noTally();
  let lives = 0;
  let warded = 0;
  let blasted = 0;
  const cats = new Map<string, { n: number; lives: number }>();
  const worst: DelveDeaths['items'] = [];
  for (const it of items) {
    const d = c.items[it.id]?.delve;
    if (!d) continue;
    const cost = livesCost(d);
    answers = sum(answers, d);
    lives += cost;
    warded += d.warded ?? 0;
    blasted += d.blasted ?? 0;
    const cat = cats.get(it.category) ?? { n: 0, lives: 0 };
    cats.set(it.category, { n: cat.n + d.n, lives: cat.lives + cost });
    if (d.n >= ITEM_MIN && cost > 0) worst.push({ item: it, n: d.n, lives: cost, rate: cost / d.n });
  }
  const byRate = (a: DeathRate, b: DeathRate) => b.rate - a.rate || b.lives - a.lives || b.n - a.n;
  worst.sort((a, b) => byRate(a, b) || a.item.name.localeCompare(b.item.name));
  return {
    answers,
    lives,
    warded,
    blasted,
    categories: [...cats]
      .filter(([, t]) => t.n >= CATEGORY_MIN)
      .map(([category, t]) => ({ category, ...t, rate: t.lives / t.n }))
      .sort((a, b) => byRate(a, b) || a.category.localeCompare(b.category)),
    items: worst.slice(0, limit),
  };
}

export interface FindTally {
  /** Questions taken from this find. */
  taken: number;
  /** Answered right. */
  ok: number;
  /** What the right answers earned. */
  gained: Partial<Record<ItemKind, number>>;
  /** Lives and wards the wrong answers took. */
  lives: number;
  wards: number;
}

export interface FindStats {
  finds: Record<FindKind, FindTally>;
  /** Azurite Wards that broke, each in place of a life. */
  wardsBroke: number;
  flaresBurnt: number;
}

const noFind = (): FindTally => ({ taken: 0, ok: 0, gained: {}, lives: 0, wards: 0 });

/** Finds taken and how they ended, wards that saved a life and flares burnt, over these answers. */
export function findStats(answers: Iterable<Answer>): FindStats {
  const out: FindStats = { finds: { azurite: noFind(), flare: noFind(), dynamite: noFind() }, wardsBroke: 0, flaresBurnt: 0 };
  for (const a of answers) {
    if (a.depth === undefined) continue;
    out.wardsBroke += answerWards(a);
    if (a.flared) out.flaresBurnt++;
    if (!a.find) continue;
    const f = out.finds[a.find];
    f.taken++;
    if (a.ok) {
      f.ok++;
      if (a.gained) f.gained[a.gained] = (f.gained[a.gained] ?? 0) + 1;
    } else {
      f.lives += answerLives(a);
      f.wards += answerWards(a);
    }
  }
  return out;
}

/** This player's Delve answers by run (its id), oldest first. */
export function answersByRun(c: Codex): Map<number, Answer[]> {
  const out = new Map<number, Answer[]>();
  for (const a of c.log) {
    if (a.run === undefined || a.depth === undefined) continue;
    const list = out.get(a.run);
    if (list) list.push(a);
    else out.set(a.run, [a]);
  }
  return out;
}

export interface LifeLost {
  depth: number;
  zone: Zone;
  /** The item whose answer cost it; null when none is logged (a pick that ran out, a run from before). */
  item: Item | null;
  /** Lost to a cave-in, with another life. */
  caveIn: boolean;
}

export interface RunStory {
  lives: LifeLost[];
  finds: FindStats;
  /** Answers logged for it. */
  answers: number;
}

/** Where each of a run's lives went and what took it, and the finds it took, from the answers logged for it. */
export function runStory(run: DelveRun, answers: Answer[], byId: Map<string, Item>): RunStory {
  const slots = answers.flatMap((a) => {
    const n = answerLives(a);
    return Array.from({ length: n }, () => ({ depth: a.depth!, id: a.id, caveIn: n > 1, used: false }));
  });
  const lives = (run.losses ?? (run.left ? [] : [run.depth])).map((depth) => {
    const slot = slots.find((s) => !s.used && s.depth === depth);
    if (slot) slot.used = true;
    return { depth, zone: zoneOf(depth), item: (slot && byId.get(slot.id)) || null, caveIn: !!slot?.caveIn };
  });
  return { lives, finds: findStats(answers), answers: answers.length };
}

