// What Analytics reads out of the numbers by itself (the overview's "What
// happened"): days far busier than usual and the site that
// brought them, the sites and countries that brought far more or fewer than
// the period before, how far a visit gets (a game entered, started,
// finished, two and five in one page load; a first visit's own), how long
// it stays, and who comes back.
// Only what the counts bear out: a change has to be well beyond what chance
// moves a count of that size by (a count's chance swing is about its square
// root), and where a list is read for its most extreme (the busiest of 30
// days, the biggest mover of 40 sites), beyond what chance makes of one of
// so many (model.ts zFor). Pure, so the tests can feed it.

import type { Named } from './api.ts';
import { siteName } from './chart.ts';
import { DEVICES, type Device } from '../lib/stutter.ts';
import { FIRSTS, LATER_FIRSTS, READIES, RETURNS, START_STEPS, STARTS_FROM, VISIT_KINDS, answersPerDay, asked, zFor, type Cohort, type Counts, type First, type Reach, type Ready, type Return } from './model.ts';

/** Well beyond chance: a change of `d` on a count of `n` known all but exactly (z times its square root, and a few besides, so tiny counts never qualify). */
const beyondChance = (d: number, n: number, z = 2) => Math.abs(d) >= z * Math.sqrt(Math.max(n, 1)) + 3;

/**
 * Whether two counts are apart by more than chance makes: `now` against
 * `before` brought to as many chances (`scale`: twice the games, twice the
 * failures). Both are counts, each swinging by about its square root, so
 * their difference swings by the root of both, not of one as though the
 * period before were exact. `per`: how many each one behind them brings at
 * once (a player's several games), which widens the swing as much; `z`: as
 * many swings as it takes (2, or zFor of a list). A few besides, so tiny
 * counts never qualify.
 */
export function countsApart(now: number, before: number, { z = 2, scale = 1, per = 1 }: { z?: number; scale?: number; per?: number } = {}): boolean {
  return Math.abs(now - scale * before) >= z * Math.sqrt(Math.max(now + scale * scale * before, 1) * Math.max(per, 1)) + 3;
}

/**
 * How much wider than a count's own a count of games swings (countsApart's
 * `per`), from `games` played by `players`: each player plays several, so
 * games come in bunches. A player's games spread as a geometric's do, about
 * 2m − 1 times their mean m; 1 where nobody's known to have played.
 */
export const gamesSpread = (games: number, players: number) => (players > 0 ? Math.max(1, (2 * games) / players - 1) : 1);

/** gamesSpread of the periods' games together, those who played them counted ("reach/played", once a player in eight hours), on the days they were. */
export function gamesSpreadOf(...periods: Counts[]): number {
  let games = 0;
  let players = 0;
  for (const c of periods)
    c.reach.played.forEach((n, i) => {
      if (n <= 0) return;
      players += n;
      games += c.games.perDay[i] ?? 0;
    });
  return gamesSpread(games, players);
}

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
const SPIKE_REACH = 14;

/**
 * The days far busier than usual (at least 1.6 times the median of the
 * other whole days within SPIKE_REACH of it, and beyond chance for one of
 * the period's days: of 30, one passes z = 2 by chance most months),
 * busiest against usual first, at most `top`. The last day isn't over, so
 * it's never part of a usual one, but it can be a spike already.
 */
export function spikesOf(days: string[], values: number[], top = 3): Spike[] {
  const whole = values.length - 1;
  const z = zFor(days.length);
  return days
    .map((day, i) => {
      const around = values.filter((_, k) => k !== i && k < whole && Math.abs(k - i) <= SPIKE_REACH);
      // (A median of k days swings too, about π/2k of a day's own.)
      return { day, value: values[i] ?? 0, usual: median(around), spread: around.length ? 1 + Math.PI / (2 * around.length) : 1 };
    })
    .filter((s) => s.usual > 0 && s.value >= s.usual * 1.6 && beyondChance(s.value - s.usual, s.usual * s.spread, z))
    .sort((a, b) => b.value - a.value)
    .slice(0, top)
    .map(({ day, value, usual }) => ({ day, value, usual }));
}

/** Where a spike's visitors came from: the site that brought the most that day, and its share then and on the period's other days. */
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
 * `period`'s counts hold the day's: its usual share is of the other days,
 * or a big enough spike would lift its own site's usual out of reach.
 */
export function spikeSource(day: Named[], period: Named[]): SpikeSource | null {
  const dayAll = day.reduce((n, r) => n + r.count, 0);
  if (!dayAll) return null;
  const others = period.map((r) => ({ name: r.name, count: Math.max(0, r.count - day.reduce((n, d) => n + (d.name === r.name ? d.count : 0), 0)) }));
  const othersAll = others.reduce((n, r) => n + r.count, 0);
  const usualOf = (name: string) => (othersAll ? (100 * (others.find((r) => r.name === name)?.count ?? 0)) / othersAll : 0);
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
 * typed in moves by itself), and only where it's beyond chance for one of
 * as many names (zFor, a rise and a fall each): of 25 sites at z = 2, one
 * moves by chance most months. When every
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
  const z = zFor(2 * names.length);
  const moves = names
    .map((name) => ({ name, now: is.get(name) ?? 0, before: was.get(name) ?? 0, expected: (was.get(name) ?? 0) * scale }))
    .filter((m) => countsApart(m.now, m.before, { scale, z }));
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
  /** Each step's own reading: the day it's counted from (LATER_FIRSTS from the day their group was first counted, model.ts) and the visits with no save since. */
  steps: Record<First, { from: string | null; visits: number }>;
}

/** Read from the first day "visit/new" was counted, which came with the first steps' own ("new/…"): not from the day one first happened. */
export function firstStepsOf(c: Counts): FirstSteps {
  const first = firstDay(c.days, (i) => (c.visits.new[i] ?? 0) > 0);
  const groupFrom = (from: string) => firstDay(c.days, (i) => c.days[i] >= from);
  const later = new Map(LATER_FIRSTS.flatMap((g) => g.steps.map((s) => [s, groupFrom(g.from)] as const)));
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

/** The start page's steps, every visit's (START_STEPS), named as a first visit's are. */
export const START_JOURNEY: readonly { step: Reach; name: string }[] = START_STEPS.map((step) => ({ step, name: FIRST_JOURNEY.find((f) => f.step === step)!.name }));

/** A count the game began on STARTS_FROM, over the period's days since then: `from` null where it ends before. */
export interface Since {
  from: string | null;
}
const sinceStarts = (c: Counts) => firstDay(c.days, (i) => c.days[i] >= STARTS_FROM);
/** Whether a reading of the period before (`r`, of `c`) was counted from its first day: one from a later day rests on those days alone, and isn't set against. */
export const fromFirstDay = (r: { from: string | null }, c: Counts) => r.from !== null && r.from === c.days[0];

/**
 * Every visit's start-page steps, against the page loads ("reach/page")
 * from STARTS_FROM, when they were first counted, or from the period's
 * first day where it's later; nothing where the period ends before it.
 */
export function startStepsOf(c: Counts): Reached {
  const first = sinceStarts(c);
  if (first < 0) return { from: null, visitors: 0, paged: true, counts: {} };
  const counts: Reached['counts'] = {};
  for (const s of START_STEPS) counts[s] = sumFrom(c.reach[s], first);
  return { from: c.days[first], visitors: sumFrom(c.reach.page, first), paged: true, counts };
}

/** How soon a newcomer's page was usable: the loads timed (those in sight until ready), and those within each mark ("load/ready-…"). */
export interface Readiness extends Since {
  timed: number;
  counts: Record<Ready, number>;
}
export function readinessOf(c: Counts): Readiness {
  const first = sinceStarts(c);
  const counts = Object.fromEntries(READIES.map((r) => [r, first < 0 ? 0 : sumFrom(c.ready[r], first)])) as Record<Ready, number>;
  return { from: first < 0 ? null : c.days[first], timed: READIES.reduce((n, r) => n + counts[r], 0), counts };
}
/** The marks read as a newcomer would wait: ready within 2, 5 and 10 seconds (each holding the ones before), and later. */
export const READY_ROWS: readonly { within: readonly Ready[]; name: string }[] = [
  { within: ['2s'], name: 'Within 2 seconds' },
  { within: ['2s', '5s'], name: 'Within 5 seconds' },
  { within: ['2s', '5s', '10s'], name: 'Within 10 seconds' },
  { within: ['later'], name: 'Later' },
];
export const readyCount = (r: Readiness, within: readonly Ready[]) => within.reduce((n, k) => n + r.counts[k], 0);

/**
 * Today's unique's players who came back to a save ("daily/back"), of all
 * who answered ("reach/daily"), both once a visitor in eight hours. A load
 * whose save wasn't read in time says neither, so back and new together
 * can be a few short of all.
 */
export interface DailyBack extends Since {
  answered: number;
  back: number;
}
export function dailyBackOf(c: Counts): DailyBack {
  const first = sinceStarts(c);
  if (first < 0) return { from: null, answered: 0, back: 0 };
  return { from: c.days[first], answered: sumFrom(c.reach.daily, first), back: sumFrom(c.dailyBack, first) };
}

/** Delve's runs ended, and Share run tapped at their end ("share/delve", each tap, so a run shared twice counts twice). */
export interface DelveShared extends Since {
  ended: number;
  shared: number;
}
export function delveSharedOf(c: Counts): DelveShared {
  const first = sinceStarts(c);
  if (first < 0) return { from: null, ended: 0, shared: 0 };
  return { from: c.days[first], ended: sumFrom(c.delveRuns.ended, first), shared: sumFrom(c.delveRuns.shared, first) };
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
/** The period before's share who came back, only where its visits were told apart from its first day: a share from a later day rests on its early days alone, which read low (VisitorsView's `whole`). */
export const backBeforeOf = (c: Counts) => (toldFromStart(c) ? backShare(comersOf(c)) : null);

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
 * Whether a grid's busiest hour (the most on average, as WeekHours names
 * it) is busier than chance makes of one of so many: its count against
 * what the grid's usual hour brings in as many days as it had (`had`, the
 * days that had each: a month's Thursdays can be five to the rest's four),
 * at zFor its hours. The busiest of 168 passes twice the swing by chance
 * nearly always.
 */
export function busiestStandsOut(grid: number[][], had: number[][]): boolean {
  const cells = grid.flatMap((row, d) => row.map((n, h) => ({ n, had: had[d]?.[h] ?? 0 }))).filter((c) => c.had > 0);
  const total = cells.reduce((n, c) => n + c.n, 0);
  if (!total) return false;
  const rate = total / cells.reduce((n, c) => n + c.had, 0);
  const best = cells.reduce((a, b) => (b.n / b.had > a.n / a.had ? b : a));
  const expected = best.had * rate;
  return best.n > expected && beyondChance(best.n - expected, expected, zFor(cells.length));
}

/**
 * A list with each label once, the counts of those labelled alike added up:
 * labels can come from outside (a failure the page doesn't know is labelled
 * by its own key, which anyone can count), so two can meet, and a list
 * keyed by its labels can't hold both.
 */
export function sameLabels<T extends { label: string; count: number }>(list: T[]): T[] {
  const out = new Map<string, T>();
  for (const b of list) {
    const had = out.get(b.label);
    out.set(b.label, had ? { ...had, count: had.count + b.count } : b);
  }
  return [...out.values()];
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
 * Whether a count is further from a usual one than chance would take it:
 * `now` against `usual`, an average of so many days (Today's against 28)
 * that its own swing is small beside a day's. Two counts each of one period
 * are countsApart.
 */
export const beyondChanceOf = (now: number, usual: number) => beyondChance(now - usual, Math.max(usual, 0));

/**
 * Whether two percents differ by more than chance would make, each of `n`
 * and `nBefore` (`z` times the spread of their difference, twice unless a
 * list asks more; a share near 0 or 100 is taken a little in from the
 * edge), and by at least 3 of the smaller side's (`least`): 3 of 3 against
 * 0 of 3 is a handful, never sure.
 */
export function rateBeyondChance(pct: number, n: number, pctBefore: number, nBefore: number, z = 2, least = 3): boolean {
  if (n <= 0 || nBefore <= 0) return false;
  if ((Math.abs(pct - pctBefore) * Math.min(n, nBefore)) / 100 < least) return false;
  // (A rate of more than one each, as failures can run to, spreads at least as a share at the edge would.)
  const edge = (v: number) => Math.min(100, Math.max(0, v));
  const p = (edge(pct) * n + 100) / (n + 2) / 100;
  const q = (edge(pctBefore) * nBefore + 100) / (nBefore + 2) / 100;
  const spread = 100 * Math.sqrt((p * (1 - p)) / n + (q * (1 - q)) / nBefore);
  return Math.abs(pct - pctBefore) >= z * spread;
}

export function troubleOf(now: Counts, before: Counts): Trouble | null {
  /** Failures `f` well above the `usual` ones brought to as many chances (`scale`), or null: both are counts, each as much chance's. */
  const worse = (f: number, usual: number, scale: number) => (f > usual * scale && countsApart(f, usual, { scale }) ? { failed: f, expected: usual * scale } : null);

  const before_ = chances(before);
  const period = before_ ? worse(failed(now), failed(before), chances(now) / before_) : null;

  const last = now.days.length - 1;
  const failedToday = now.failuresPerDay[last] ?? 0;
  const chancesToday = (now.games.perDay[last] ?? 0) + (now.joinsPerDay.tried[last] ?? 0);
  const restChances = chances(now) - chancesToday;
  const today = restChances > 0 ? worse(failedToday, failed(now) - failedToday, chancesToday / restChances) : null;

  return period || today ? { period, today } : null;
}

/**
 * The game going worse than in the period before, the way a deploy breaks
 * it: its own scripts' errors, or pages missing a part that didn't load,
 * far above the period before's for as many visits; a kind of device that
 * stuttered far more often (stutterBy: for a share of its visits, or of its
 * games until those are counted; `of`, how many the share is of). Each
 * beyond chance for one of them all (zFor), as the overview speaks of any.
 * Null where none is.
 */
export interface Health {
  errors: { key: 'script' | 'chunk'; count: number; expected: number }[];
  stutter: { device: Device; share: number; before: number; of: number; by: StutterBy }[];
}

/** The days of the period before that must have visits' first games counted for stutter to be judged by them (stutterBy): so many, and a third of its days. */
export const VISIT_DAYS = 3;
/**
 * The visits one device can make in a day: GoatCounter's visit is eight
 * hours (stutter.ts VISIT), so a phone played on morning, afternoon and
 * night is three. A day's share of visits is news only from one more than
 * that above the usual (healthOf), or one slow phone among a kind of device
 * that never stuttered would still be.
 */
export const ONE_DEVICE_VISITS = 3;

/**
 * What stutter is judged by. A game is no chance of its own: nothing tells
 * whose it is, and a slow device's five games in a row are that device's
 * speed counted five times, so a share of games moves far beyond what
 * rateBeyondChance allows it whenever one such player has a long evening
 * (the alerts of 7 and 8 November 2026, issues #421 and #422: two phones'
 * 7 games; one computer's 7 in an hour). A visit's first game is one
 * (stutter.ts VISIT: each visitor once), so the share of visits where it
 * stuttered is weighed once it's counted on VISIT_DAYS or more of the
 * period before's days, and a third of them (a month before isn't spoken
 * for by its last three days). Until then, and for periods from before
 * November 2026, by games, each side's taken as resting on as many fewer
 * as games come in bunches (gamesSpreadOf): that quiets a usual evening's
 * run, though not a long one's, which moves the share itself. Never back
 * to games after: a day with no visit of its own (a device's, or
 * everyone's) has nothing to say.
 */
export type StutterBy = 'visits' | 'games';
export function stutterBy(before: Counts): StutterBy {
  const daysWith = (c: Counts) => c.days.filter((_, i) => DEVICES.some((d) => c.frames[d].visits[i] > 0)).length;
  const n = daysWith(before);
  return n >= VISIT_DAYS && n >= before.days.length / 3 ? 'visits' : 'games';
}

/** A kind of device's stutter in a period, as stutterBy says to weigh it: how many visits (or games), and how many of them stuttered. */
export function stutterOf(c: Counts, device: Device, by: StutterBy): { of: number; part: number } {
  const sum = (vs: number[]) => vs.reduce((n, v) => n + v, 0);
  const f = c.frames[device];
  return by === 'visits' ? { of: sum(f.visits), part: sum(f.visitsStuttered) } : { of: sum(f.games), part: sum(f.stuttered) };
}

export function healthOf(now: Counts, before: Counts): Health | null {
  const z = zFor(2 + DEVICES.length);
  const errorsOf = (c: Counts, key: string) => c.failures.find((f) => f.key === key)?.count ?? 0;
  // At most once a page load: as many more visits bring as many more.
  const scale = before.visitors.total ? now.visitors.total / before.visitors.total : 0;
  const errors = scale
    ? (['script', 'chunk'] as const)
        .map((key) => ({ key, count: errorsOf(now, key), was: errorsOf(before, key) }))
        .filter((e) => e.count > e.was * scale && countsApart(e.count, e.was, { scale, z }))
        .map(({ key, count, was }) => ({ key, count, expected: was * scale }))
    : [];
  const by = stutterBy(before);
  // A visit is a chance of its own; games come several a player, so they rest on that many fewer.
  const per = by === 'visits' ? 1 : gamesSpreadOf(now, before);
  // (Visits: more than one device makes in a day, each of the period's days.)
  const least = by === 'visits' ? ONE_DEVICE_VISITS * now.days.length + 1 : 3;
  const stutter = DEVICES.flatMap((device) => {
    const is = stutterOf(now, device, by);
    const had = stutterOf(before, device, by);
    if (!is.of || !had.of) return [];
    const share = (100 * is.part) / is.of;
    const was = (100 * had.part) / had.of;
    return share > was && rateBeyondChance(share, is.of / per, was, had.of / per, z, least) ? [{ device, share, before: was, of: is.of, by }] : [];
  });
  return errors.length || stutter.length ? { errors, stutter } : null;
}
