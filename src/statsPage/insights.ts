// What Analytics reads out of the numbers by itself (the overview's "What
// happened"): days far busier than usual and the site that
// brought them, the sites and countries that brought far more or fewer than
// the period before, how far a visit gets (a game entered, started,
// finished, two and five in one page load; a first visit's own), how long
// it stays, and who comes back.
// Only what the counts bear out: a change has to be well beyond what chance
// moves a count of that size by (a count's chance swing is about its square
// root). Pure, so the tests can feed it.

import type { Named } from './api.ts';
import { siteName } from './chart.ts';
import { FIRSTS, LATER_FIRSTS, RETURNS, VISIT_KINDS, answersPerDay, asked, type Cohort, type Counts, type First, type Reach, type Return } from './model.ts';

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
  /** The median day around it (SPIKE_REACH). */
  usual: number;
}

/** How far either side of a day its usual one is found: a game that grows, or a launch, then moves its usual along with it. */
export const SPIKE_REACH = 14;

/**
 * The days far busier than usual (at least 1.6 times the median of the
 * other whole days within SPIKE_REACH of it, and beyond chance), busiest
 * against usual first, at most `top`. The last day isn't over, so it's
 * never part of a usual one, but it can be a spike already.
 */
export function spikesOf(days: string[], values: number[], top = 3): Spike[] {
  const whole = values.length - 1;
  return days
    .map((day, i) => {
      const around = values.filter((_, k) => k !== i && k < whole && Math.abs(k - i) <= SPIKE_REACH);
      return { day, value: values[i] ?? 0, usual: median(around) };
    })
    .filter((s) => s.usual > 0 && s.value >= s.usual * 1.6 && beyondChance(s.value - s.usual, s.usual))
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

/** How many a name brought before for its change to count in how they all moved (moversOf): a handful swings too much. */
const MOVER_BASE = 5;

/**
 * The biggest rise and the biggest fall in a list against the period
 * before, each against what it would have brought had it moved as most of
 * them did (the middle one's change, of those with enough before to say;
 * typed in moves by itself), and only where it's beyond chance. When every
 * site brings twice as many, none of them is news; when one brings three
 * times as many, the middle isn't dragged along, so it's that one, and not
 * the rest falling behind it.
 */
export function moversOf(now: Named[], before: Named[]): { up: Mover | null; down: Mover | null } {
  const was = new Map(before.map((r) => [r.name, r.count]));
  const is = new Map(now.map((r) => [r.name, r.count]));
  const names = [...new Set([...is.keys(), ...was.keys()])].filter((n) => !typedIn(n));
  const changes = names.filter((name) => (was.get(name) ?? 0) >= MOVER_BASE).map((name) => (is.get(name) ?? 0) / was.get(name)!);
  const scale = changes.length ? median(changes) : 1;
  const moves = names
    .map((name) => ({ name, now: is.get(name) ?? 0, before: was.get(name) ?? 0, expected: (was.get(name) ?? 0) * scale }))
    .filter((m) => beyondChance(m.now - m.expected, m.expected));
  const strip = ({ name, now, before }: Mover): Mover => ({ name, now, before });
  const up = moves.filter((m) => m.now > m.expected * 1.3).sort((a, b) => b.now - b.expected - (a.now - a.expected))[0];
  const down = moves.filter((m) => m.now < m.expected * 0.7).sort((a, b) => a.now - a.expected - (b.now - b.expected))[0];
  return { up: up ? strip(up) : null, down: down ? strip(down) : null };
}

/** How far a visit gets: of the visitors, those who played a game, finished one, and answered Today's unique. */
export interface Steps {
  /** The first day the steps are read from (reachedOf); visits before it don't count here. */
  from: string | null;
  /** Those the steps are a share of: page loads (reach/page) once they were counted, visits before. */
  visitors: number;
  /** Whether `visitors` are page loads: a period's shares compare only with another's of the same kind. */
  paged: boolean;
  played: number;
  finished: number;
  /** Today's unique's answers, against the visitors of the days it asked. */
  answered: number;
  askedVisitors: number;
}

/**
 * The steps a period's visits reached, over the days they're read from
 * (reachedOf), each counted once a visitor in eight hours, so the shares
 * are of people.
 */
export function stepsOf(c: Counts): Steps {
  const r = reachedOf(c, ['played', 'finished']);
  const out: Steps = { from: r.from, visitors: r.visitors, paged: r.paged, played: r.counts.played ?? 0, finished: r.counts.finished ?? 0, answered: 0, askedVisitors: 0 };
  const answers = answersPerDay(c);
  c.days.forEach((day, i) => {
    if (!asked(day)) return;
    out.askedVisitors += c.visitors.perDay[i] ?? 0;
    out.answered += answers[i] ?? 0;
  });
  return out;
}

/** A share as a percent, at most 100 (a step counted late on one day can reach the next), or null with nothing to share. */
export const shareOf = (part: number, whole: number): number | null => (whole > 0 ? Math.min(100, (100 * part) / whole) : null);

const firstDay = (days: string[], counted: (i: number) => boolean) => days.findIndex((_, i) => counted(i));
const sumFrom = (vs: number[], first: number) => vs.slice(first).reduce((n, v) => n + v, 0);

/** How many of a period's visitors reached some steps, over the days since the game counted them. */
export interface Reached {
  /** The first day the steps are read from; null where they weren't counted. */
  from: string | null;
  /** Those the steps are a share of: page loads ("reach/page", reloads too, as the steps are) once those were counted, visits before. */
  visitors: number;
  /** Whether `visitors` are page loads. */
  paged: boolean;
  /** Each step's visitors since then; a step left out wasn't counted then. */
  counts: Partial<Record<Reach, number>>;
}

/** The steps counted before page loads were ("reach/played", "reach/finished"): the only ones that can be set against visits. */
const FIRST_STEPS: readonly Reach[] = ['played', 'finished'];

/**
 * How many reached each of `steps`, set against page loads ("reach/page"),
 * counted as the steps are, reloads included (visits, "/", leave reloads
 * out, so a step could pass them). Read from the first day page loads were
 * counted, which came with every step after the first two: a window from
 * the day a step first happened would leave out the days nobody reached it.
 * Before page loads were counted, the first two steps alone, against visits
 * from the first day either was counted. Over the days together, never a
 * day at a time: a visit crosses midnight.
 */
export function reachedOf(c: Counts, steps: readonly Reach[]): Reached {
  const paged = firstDay(c.days, (i) => (c.reach.page[i] ?? 0) > 0);
  const old = steps.filter((s) => FIRST_STEPS.includes(s));
  const first = paged >= 0 ? paged : firstDay(c.days, (i) => old.some((s) => (c.reach[s][i] ?? 0) > 0));
  if (first < 0) return { from: null, visitors: 0, paged: false, counts: {} };
  const out: Reached = { from: c.days[first], visitors: sumFrom(paged >= 0 ? c.reach.page : c.visitors.perDay, first), paged: paged >= 0, counts: {} };
  for (const s of paged >= 0 ? steps : old) out.counts[s] = sumFrom(c.reach[s], first);
  // Every game started was entered: before entering was counted (late October 2026) only starting was, so entering is never fewer.
  if (out.counts.lobby !== undefined && out.counts.played !== undefined) out.counts.lobby = Math.max(out.counts.lobby, out.counts.played);
  return out;
}

/** A step's share of the visitors it was counted for, or null where it wasn't. */
export const reachedShare = (r: Reached, step: Reach) => (r.counts[step] === undefined ? null : shareOf(r.counts[step]!, r.visitors));

/**
 * A step's share in the period before, to set this period's against: only
 * where both are shares of the same (page loads, or visits), or a step
 * would seem to fall for no more than page loads outnumbering visits.
 */
export const beforeShare = (now: { paged: boolean }, was: Reached, step: Reach) => (now.paged === was.paged ? reachedShare(was, step) : null);

/**
 * How far a visit gets, a step after another. "Entered a game": a room's
 * lobby, or straight into a run (a Delve link's); then started one, saw one
 * decided, two and five in one page load.
 */
export const JOURNEY: readonly { step: Reach; name: string }[] = [
  { step: 'lobby', name: 'Entered a game' },
  { step: 'played', name: 'Started a game' },
  { step: 'finished', name: 'Saw one to its end' },
  { step: 'games-2', name: '2 games or more in one page load' },
  { step: 'games-5', name: '5 games or more in one page load' },
];

/** The journey's steps: all of them once page loads were counted; before, the first two alone (reachedOf). */
export const journeyOf = (c: Counts): Reached => reachedOf(c, JOURNEY.map((j) => j.step));

/** A first visit's steps (a visit that found no save on the device, "new/…"): entered a game (a room's lobby, or straight into a run), started one, saw one to its end. */
export const FIRST_JOURNEY: readonly { step: First; name: string }[] = [
  { step: 'acted', name: 'Pressed a control' },
  { step: 'create', name: 'Tapped New game' },
  { step: 'host', name: 'Asked for a room under a name' },
  { step: 'room', name: 'Had the room open' },
  { step: 'solo', name: 'Began a run alone' },
  { step: 'daily', name: "Answered Today's unique" },
  { step: 'practice', name: 'Answered a practice question' },
  { step: 'identify', name: 'Began a run from the Daily (Identify more)' },
  { step: 'lobby', name: 'Entered a game' },
  { step: 'played', name: 'Started a game' },
  { step: 'finished', name: 'Saw one to its end' },
  { step: 'games-2', name: 'Started a second game in one page load' },
  { step: 'games-5', name: 'Started a fifth game in one page load' },
];

/** How far the visits that found no save got: of them, from the first day those were counted. */
export interface FirstSteps {
  from: string | null;
  /** Visits with no save on the device ("visit/new"). */
  visits: number;
  counts: Record<First, number>;
  /** Each step's own reading: the day it's counted from (LATER_FIRSTS from the day their group was first counted) and the visits with no save since. */
  steps: Record<First, { from: string | null; visits: number }>;
}

/** Read from the first day "visit/new" was counted, which came with the first steps' own ("new/…"): not from the day one first happened. */
export function firstStepsOf(c: Counts): FirstSteps {
  const first = firstDay(c.days, (i) => (c.visits.new[i] ?? 0) > 0);
  const groupFrom = (g: readonly First[]) => firstDay(c.days, (i) => g.some((s) => (c.firsts[s][i] ?? 0) > 0));
  const later = new Map(LATER_FIRSTS.flatMap((g) => g.map((s) => [s, groupFrom(g)] as const)));
  const fromOf = (s: First) => {
    const from = later.get(s);
    return first < 0 || from === -1 ? -1 : from === undefined ? first : Math.max(first, from);
  };
  const counts = Object.fromEntries(FIRSTS.map((s) => [s, fromOf(s) < 0 ? 0 : sumFrom(c.firsts[s], fromOf(s))])) as Record<First, number>;
  // (Entered, as reachedOf: never fewer than started.)
  counts.lobby = Math.max(counts.lobby, counts.played);
  const steps = Object.fromEntries(FIRSTS.map((s) => [s, { from: fromOf(s) < 0 ? null : c.days[fromOf(s)], visits: fromOf(s) < 0 ? 0 : sumFrom(c.visits.new, fromOf(s)) }])) as FirstSteps['steps'];
  return { from: first < 0 ? null : c.days[first], visits: first < 0 ? 0 : sumFrom(c.visits.new, first), counts, steps };
}

/** How long a visit kept the game on screen, in one page load: 2, 10 and 30 minutes. */
export const STAY: readonly { step: Reach; name: string }[] = [
  { step: 'time-2m', name: '2 minutes or more' },
  { step: 'time-10m', name: '10 minutes or more' },
  { step: 'time-30m', name: '30 minutes or more' },
];
/** What else a visit opened: the codex, the achievements. */
export const OPENED: readonly { step: Reach; name: string }[] = [
  { step: 'codex', name: 'The codex' },
  { step: 'achievements', name: 'The achievements' },
];

/**
 * Who came, since the game first told them apart: with no save on their
 * device ("fresh"), or back to one after so long; and in the installed
 * app. A visitor who played less than 8 hours before says neither, so
 * those told apart are fewer than the visitors: new and back are shares of
 * their own sum.
 */
export interface Comers {
  from: string | null;
  /** Every visitor in those days. */
  visitors: number;
  fresh: number;
  back: Record<Return, number>;
  /** All who came back to a save, however long after. */
  returned: number;
  app: number;
}

export function comersOf(c: Counts): Comers {
  const first = firstDay(c.days, (i) => VISIT_KINDS.some((k) => (c.visits[k][i] ?? 0) > 0));
  const sum = (vs: number[]) => (first < 0 ? 0 : sumFrom(vs, first));
  const back = Object.fromEntries(RETURNS.map((r) => [r, sum(c.visits[r])])) as Record<Return, number>;
  return {
    from: first < 0 ? null : c.days[first],
    visitors: sum(c.visitors.perDay),
    fresh: sum(c.visits.new),
    back,
    returned: RETURNS.reduce((n, r) => n + back[r], 0),
    app: sum(c.visits.app),
  };
}

/** Of those told new or back, the share who came back to a save; null before they were told apart. */
export const backShare = (w: Comers) => (w.from ? shareOf(w.returned, w.fresh + w.returned) : null);
/** Of the visitors since visits were told apart, the share who opened the installed app (sent with every visit from it); null before. */
export const appShare = (w: Comers) => (w.from ? shareOf(w.app, w.visitors) : null);
/**
 * Whether visits were told apart from the period's first day: the player
 * groups read the installed app against every visitor of the period, so
 * only then is that a share.
 */
export const toldFromStart = (c: Counts) => !!c.days.length && comersOf(c).from === c.days[0];

/**
 * The cohorts a table of `weeks` columns shows: the latest `rows` whose
 * Monday is within those weeks of the period's last day (`to`), none after
 * it (a device with its clock wrong can name a week years off).
 */
export function recentCohorts(cohorts: Cohort[], to: string, weeks = 8, rows = 8): Cohort[] {
  const since = (c: Cohort) => Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${c.monday}T12:00:00Z`)) / (7 * 86_400_000));
  return cohorts.filter((c) => since(c) >= 0 && since(c) < weeks).slice(-rows);
}

/** A site by its own name, its subdomains with it ("out.reddit.com" is reddit.com): the last two labels, three where those are a country's (co.uk). A name that's no host ("Slack Chat") stays. */
function siteRoot(name: string): string {
  if (/[\s/]/.test(name)) return name;
  const l = name.split('.');
  if (l.length <= 2) return name;
  return l.slice(l[l.length - 1].length === 2 && l[l.length - 2].length <= 3 ? -3 : -2).join('.');
}

/**
 * A list of referrers with each site once: a visit by a tagged link comes
 * without GoatCounter's cleaning of its referrer, so one site can be listed
 * twice ("https://www.reddit.com" and "www.reddit.com"), and a site's
 * subdomains are the site (siteRoot). Each is named as
 * people say it (chart.ts siteName), most first; none ('' or "(unknown)")
 * stays as it is.
 */
export function sameSites(list: Named[]): Named[] {
  const out = new Map<string, number>();
  for (const r of list) {
    // (An app's, "android-app://com.reddit.frontpage", is no host to fold.)
    const name = typedIn(r.name) ? r.name : /^(?![a-z-]+:\/\/)|^https?:\/\//.test(r.name) ? siteRoot(siteName(r.name)) : siteName(r.name);
    out.set(name, (out.get(name) ?? 0) + r.count);
  }
  return [...out].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
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

// (Not the scripts' errors, which have nothing to do with joining.)
const failed = (c: Counts) => c.failures.reduce((n, f) => n + (f.script ? 0 : f.count), 0);
const tries = (c: Counts) => c.joins.reduce((n, j) => n + j.tried, 0);
/** What a failure could happen on: a game started (a room opened, or played at one screen) or a try to join. */
export const chances = (c: Counts) => c.games.started + tries(c);

/** Joining's failures for each 100 games and tries to join, the rate troubleOf weighs; null with neither. */
export const failureRate = (c: Counts): number | null => (chances(c) ? (100 * failed(c)) / chances(c) : null);

/**
 * Whether a change is more than chance would make: `now` against `before`,
 * counts of about that size (a count's chance swing being about its square
 * root). For a rate's change, its counts are what it rests on.
 */
export const beyondChanceOf = (now: number, before: number) => beyondChance(now - before, Math.max(before, 0));

/**
 * Whether two percents differ by more than chance would make, each of `n`
 * and `nBefore` (twice the spread of their difference; a share near 0 or
 * 100 is taken a little in from the edge), and by at least 3 of the
 * smaller side's: 3 of 3 against 0 of 3 is a handful, never sure.
 */
export function rateBeyondChance(pct: number, n: number, pctBefore: number, nBefore: number): boolean {
  if (n <= 0 || nBefore <= 0) return false;
  if ((Math.abs(pct - pctBefore) * Math.min(n, nBefore)) / 100 < 3) return false;
  // (A rate of more than one each, as failures can run to, spreads at least as a share at the edge would.)
  const edge = (v: number) => Math.min(100, Math.max(0, v));
  const p = (edge(pct) * n + 100) / (n + 2) / 100;
  const q = (edge(pctBefore) * nBefore + 100) / (nBefore + 2) / 100;
  const spread = 100 * Math.sqrt((p * (1 - p)) / n + (q * (1 - q)) / nBefore);
  return Math.abs(pct - pctBefore) >= 2 * spread;
}

export function troubleOf(now: Counts, before: Counts): Trouble | null {
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
