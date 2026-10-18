// What Analytics reads out of the numbers by itself (the overview's "What
// happened"): days far busier than usual and the site that
// brought them, the sites and countries that brought far more or fewer than
// the period before, and how far a visit gets (played a game, finished one).
// Only what the counts bear out: a change has to be well beyond what chance
// moves a count of that size by (a count's chance swing is about its square
// root). Pure, so the tests can feed it.

import type { Named } from './api.ts';
import { asked, type Counts } from './model.ts';

/** Well beyond chance: a change of `d` on a count of `n` (twice its square root, and a few besides, so tiny counts never qualify). */
const beyondChance = (d: number, n: number) => Math.abs(d) >= 2 * Math.sqrt(Math.max(n, 1)) + 3;

const median = (vs: number[]) => {
  const s = [...vs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** A day far busier than the period's usual one. */
export interface Spike {
  day: string;
  value: number;
  /** The period's median day. */
  usual: number;
}

/**
 * The days far busier than usual (at least 1.6 times the median day, and
 * beyond chance), busiest against usual first, at most `top`. The last day
 * isn't over, so it's never the usual one, but it can be a spike already.
 */
export function spikesOf(days: string[], values: number[], top = 3): Spike[] {
  const usual = median(values.slice(0, -1));
  if (usual <= 0) return [];
  return days
    .map((day, i) => ({ day, value: values[i] ?? 0, usual }))
    .filter((s) => s.value >= usual * 1.6 && beyondChance(s.value - usual, usual))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

/** Where a spike's visitors came from: the site that brought the most that day, and its share then and on the period as a whole. */
export interface SpikeSource {
  name: string;
  share: number;
  usualShare: number;
}

const typedIn = (name: string) => !name || name === '(unknown)';

/**
 * The site behind a spike: of that day's referrers, the one most above its
 * usual share (and bringing at least a fifth of the day's visitors). None
 * when the day's visitors came the usual ways, or without a referrer.
 */
export function spikeSource(day: Named[], period: Named[]): SpikeSource | null {
  const dayAll = day.reduce((n, r) => n + r.count, 0);
  const periodAll = period.reduce((n, r) => n + r.count, 0);
  if (!dayAll) return null;
  const usualOf = (name: string) => (periodAll ? (100 * (period.find((r) => r.name === name)?.count ?? 0)) / periodAll : 0);
  const best = day
    .filter((r) => !typedIn(r.name))
    .map((r) => ({ name: r.name, share: (100 * r.count) / dayAll, usualShare: usualOf(r.name) }))
    .filter((r) => r.share >= 20 && r.share >= r.usualShare * 1.5)
    .sort((a, b) => b.share - b.usualShare - (a.share - a.usualShare))[0];
  return best ?? null;
}

/** A site or country that brought far more, or far fewer, than the period before. */
export interface Mover {
  name: string;
  now: number;
  before: number;
}

/** The biggest rise and the biggest fall in a list against the period before, each only where it's beyond chance (by how much it moved). */
export function moversOf(now: Named[], before: Named[]): { up: Mover | null; down: Mover | null } {
  const was = new Map(before.map((r) => [r.name, r.count]));
  const is = new Map(now.map((r) => [r.name, r.count]));
  const names = [...new Set([...is.keys(), ...was.keys()])].filter((n) => !typedIn(n));
  const moves = names.map((name) => ({ name, now: is.get(name) ?? 0, before: was.get(name) ?? 0 })).filter((m) => beyondChance(m.now - m.before, m.before));
  const up = moves.filter((m) => m.now > m.before * 1.3).sort((a, b) => b.now - b.before - (a.now - a.before))[0] ?? null;
  const down = moves.filter((m) => m.now < m.before * 0.7).sort((a, b) => a.now - a.before - (b.now - b.before))[0] ?? null;
  return { up, down };
}

/** How far a visit gets: of the visitors, those who played a game, finished one, and answered Today's unique. */
export interface Steps {
  /** The first day the game marked the steps (count.ts countReach); visits before it don't count here. */
  from: string | null;
  visitors: number;
  played: number;
  finished: number;
  /** Today's unique's answers, against the visitors of the days it asked. */
  answered: number;
  askedVisitors: number;
}

/**
 * The steps a period's visits reached, over the days the game marked them
 * (from the first day with a step counted), visits and steps each counted
 * once a visitor in eight hours, so the shares are of people.
 */
export function stepsOf(c: Counts): Steps {
  const first = c.days.findIndex((_, i) => (c.reach.playedPerDay[i] ?? 0) + (c.reach.finishedPerDay[i] ?? 0) > 0);
  const out: Steps = { from: first < 0 ? null : c.days[first], visitors: 0, played: 0, finished: 0, answered: 0, askedVisitors: 0 };
  c.days.forEach((day, i) => {
    const v = c.visitors.perDay[i] ?? 0;
    if (first >= 0 && i >= first) {
      out.visitors += v;
      out.played += c.reach.playedPerDay[i] ?? 0;
      out.finished += c.reach.finishedPerDay[i] ?? 0;
    }
    if (asked(day)) {
      out.askedVisitors += v;
      out.answered += (c.daily.rightPerDay[i] ?? 0) + (c.daily.wrongPerDay[i] ?? 0);
    }
  });
  return out;
}

/**
 * Joining going worse than usual: failures (joining a room, or opening
 * one) against what the usual rate would give for as many games and tries
 * to join, each only beyond chance. `period`: the period's against the
 * period before's rate; `today`: today's so far against the rest of the
 * period's. Null where neither is.
 */
export interface Trouble {
  period: { failed: number; expected: number } | null;
  today: { failed: number; expected: number } | null;
}

export function troubleOf(now: Counts, before: Counts): Trouble | null {
  const failed = (c: Counts) => c.failures.reduce((n, f) => n + f.count, 0);
  const tries = (c: Counts) => c.joins.reduce((n, j) => n + j.tried, 0);
  /** What a failure could happen on: a game started (a room opened, or played at one screen) or a try to join. */
  const chances = (c: Counts) => c.games.started + tries(c);
  /** Failures well above `expected`, or null. */
  const worse = (f: number, expected: number) => (f > expected && beyondChance(f - expected, expected) ? { failed: f, expected } : null);

  const before_ = chances(before);
  const period = before_ ? worse(failed(now), (chances(now) * failed(before)) / before_) : null;

  const last = now.days.length - 1;
  const failedToday = now.failuresPerDay[last] ?? 0;
  const chancesToday = (now.games.perDay[last] ?? 0) + (now.joinsPerDay.tried[last] ?? 0);
  const restChances = chances(now) - chancesToday;
  const today = restChances > 0 ? worse(failedToday, (chancesToday * (failed(now) - failedToday)) / restChances) : null;

  return period || today ? { period, today } : null;
}
