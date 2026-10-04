// The numbers the codex page shows, worked out from the stored codex. Apart
// from codex.ts so that only the page, loaded when it's opened, carries them.

import type { Difficulty, Item, QuestionMode } from './game.ts';
import { RECENT, type Codex, type ItemEntry, type Tally } from './codex.ts';

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
