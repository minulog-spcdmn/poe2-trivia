// The numbers the codex page shows, worked out from the stored codex (and the
// Delve records). Apart from codex.ts so that only the page, loaded when it's
// opened, carries them.

import type { Difficulty, Item, QuestionMode } from './game.ts';
import { RECENT, livesCost, type Codex, type ItemEntry, type Tally } from './codex.ts';
import { DELVE_RULESET } from './delve.ts';
import { tallyOf as runsTally, type DelveRecords, type DelveTally, type Frontier } from './delveRecord.ts';
import { milestoneAt } from './descent.ts';

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

/** The atlas shows every named depth down to here at least, found or not. */
export const ATLAS_DEPTH = 100;
/** How far past a depth to look for the next named one. */
const LOOKAHEAD = 1000;

export interface Zone {
  /** Where it begins (milestoneAt names it). */
  depth: number;
  name: string;
  /** First reached then (this browser's clock); null while undiscovered. */
  at: number | null;
}

/** The named depth a depth lies in: the nearest one at or above it, or null above the first. */
export function zoneOf(depth: number): { depth: number; name: string } | null {
  for (let d = Math.floor(depth); d >= 1; d--) {
    const name = milestoneAt(d);
    if (name) return { depth: d, name };
  }
  return null;
}

/** The next named depth below `depth`, or null if none comes within LOOKAHEAD. */
export function nextZone(depth: number): { depth: number; name: string } | null {
  for (let d = Math.max(1, Math.floor(depth) + 1); d <= depth + LOOKAHEAD; d++) {
    const name = milestoneAt(d);
    if (name) return { depth: d, name };
  }
  return null;
}

/**
 * The named depths from the top, with when each was first reached: every one
 * down to ATLAS_DEPTH or the deepest reached, and always at least one still to find.
 */
export function zoneAtlas(frontier: Frontier[], through = ATLAS_DEPTH): Zone[] {
  const deepest = frontier.at(-1)?.depth ?? 0;
  const out: Zone[] = [];
  for (let d = 1; d <= Math.max(through, deepest); d++) {
    const name = milestoneAt(d);
    if (name) out.push({ depth: d, name, at: frontier.find((f) => f.depth >= d)?.at ?? null });
  }
  if (out.every((z) => z.at !== null)) {
    const next = nextZone(Math.max(through, deepest));
    if (next) out.push({ ...next, at: null });
  }
  return out;
}

export type DelveKind = 'all' | 'solo' | 'group';

export interface DepthCount {
  depth: number;
  /** Runs that ended here (their last life). */
  ends: number;
  /** Earlier lives lost here. */
  lost: number;
}

export interface DelveSummary {
  runs: number;
  solo: number;
  group: number;
  /** Group runs won. */
  wins: number;
  /** Of the depths runs ended at. */
  median: number | null;
  mean: number | null;
  /** Every depth from 1 to the deepest with anything, in order. */
  depths: DepthCount[];
}

/** The counted runs of a kind under a ruleset (this one by default), as the page shows them. */
export function delveSummary(r: DelveRecords, kind: DelveKind = 'all', ruleset = DELVE_RULESET): DelveSummary {
  const solo = runsTally(r, true, ruleset);
  const group = runsTally(r, false, ruleset);
  const count = (t: DelveTally) => Object.values(t.ends).reduce((a, b) => a + b, 0);
  const picked = kind === 'solo' ? [solo] : kind === 'group' ? [group] : [solo, group];
  const ends = new Map<number, number>();
  const lost = new Map<number, number>();
  for (const t of picked) {
    for (const [d, n] of Object.entries(t.ends)) ends.set(+d, (ends.get(+d) ?? 0) + n);
    for (const [d, n] of Object.entries(t.lost)) lost.set(+d, (lost.get(+d) ?? 0) + n);
  }
  const deepest = Math.max(0, ...ends.keys(), ...lost.keys());
  const depths: DepthCount[] = [];
  for (let d = 1; d <= deepest; d++) depths.push({ depth: d, ends: ends.get(d) ?? 0, lost: lost.get(d) ?? 0 });
  const all = [...ends].sort((a, b) => a[0] - b[0]).flatMap(([d, n]) => Array<number>(n).fill(d));
  return {
    runs: all.length,
    solo: count(solo),
    group: count(group),
    wins: group.wins,
    median: median(all),
    mean: all.length ? all.reduce((a, b) => a + b, 0) / all.length : null,
    depths,
  };
}

export interface DelveItemStats {
  /** Every Delve answer. */
  answers: Tally;
  /** The items that cost the most lives, deepest loss first among equals. */
  costly: { item: Item; lives: number; at: number }[];
  /** The items named right at the greatest depths. */
  deepest: { item: Item; depth: number }[];
}

export function delveItemStats(c: Codex, items: Item[], limit = 5): DelveItemStats {
  let answers = noTally();
  const costly: DelveItemStats['costly'] = [];
  const deepest: DelveItemStats['deepest'] = [];
  for (const it of items) {
    const d = c.items[it.id]?.delve;
    if (!d) continue;
    answers = sum(answers, d);
    if (livesCost(d) > 0) costly.push({ item: it, lives: livesCost(d), at: d.lostAt });
    if (d.deepest) deepest.push({ item: it, depth: d.deepest });
  }
  costly.sort((a, b) => b.lives - a.lives || b.at - a.at || a.item.name.localeCompare(b.item.name));
  deepest.sort((a, b) => b.depth - a.depth || a.item.name.localeCompare(b.item.name));
  return { answers, costly: costly.slice(0, limit), deepest: deepest.slice(0, limit) };
}

export interface DepthBand {
  /** The named depth it begins at, or null for the depths above the first. */
  name: string | null;
  from: number;
  /** Its last depth; null for the deepest band, which goes on. */
  to: number | null;
  tally: Tally;
}

/**
 * Delve accuracy by named depth: one band from each named depth to the next
 * (and one above the first), down to the deepest of `deepest` and the answers.
 */
export function depthBands(c: Codex, deepest: number): DepthBand[] {
  const bottom = Math.max(deepest, 1, ...Object.keys(c.byDepth).map(Number));
  const bands: DepthBand[] = [];
  for (let from = 1; from <= bottom; ) {
    const next = nextZone(from);
    const to = next ? next.depth - 1 : null;
    let tally = noTally();
    for (let d = from; d <= (to ?? bottom); d++) if (c.byDepth[d]) tally = sum(tally, c.byDepth[d]);
    bands.push({ name: milestoneAt(from), from, to, tally });
    if (to === null) break;
    from = to + 1;
  }
  return bands;
}

/** The items that cost this player a life in each run, in the order they did, by run id (runs recorded since the codex kept it). */
export function lostTo(c: Codex, items: Item[]): Map<number, { item: Item; depth: number }[]> {
  const byId = new Map(items.map((it) => [it.id, it]));
  const out = new Map<number, { item: Item; depth: number }[]>();
  for (const a of c.log) {
    // A wrong answer a ward took cost no life.
    if (a.ok || a.warded || a.run === undefined || a.depth === undefined) continue;
    const item = byId.get(a.id);
    if (!item) continue;
    const list = out.get(a.run) ?? [];
    list.push({ item, depth: a.depth });
    out.set(a.run, list);
  }
  return out;
}
