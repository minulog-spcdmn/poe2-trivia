// Player groups (stats.html#groups): how the visitors from a country, or on
// a system or a kind of device, play and come back, set against everyone,
// each mode's games among them too. GoatCounter keeps no visit together with its events,
// but it breaks any set of paths down by country and by system: so each thing
// people do (a group of paths, GROUPS) is read once for each, and a
// country's row across them is that country's visitors. It never breaks a
// country down by system, so a country and a device are never picked
// together. Pure, so the tests can feed it.

import type { Named } from './api.ts';
import { beyondChanceOf, rateBeyondChance, reachedOf } from './insights.ts';
import { DAILY_FROM, MODES, MODE_NAMES, RETURNS, deviceOf, type Counts, type Mode } from './model.ts';

/**
 * What people do, each a set of the paths count.ts sends; `loads` and
 * `asked`, what two of them are shares of, read over the same days as the
 * overview's (insights.ts stepsOf), so a group's figure and everyone's there
 * agree: those who played a game, of the page loads since the steps were
 * counted (visits before); those who answered Today's unique, of the visits
 * on the days it asked.
 */
export type Group = 'visit' | 'loads' | 'asked' | 'new' | 'back' | 'app' | 'played' | Mode | 'daily' | 'join' | 'joined' | 'failed';
export const GROUPS: readonly { group: Group; name: string }[] = [
  { group: 'visit', name: 'Opened the game' },
  { group: 'loads', name: 'Loaded the game, since its steps were counted' },
  { group: 'asked', name: "Opened the game on a day Today's unique asked" },
  { group: 'new', name: 'New to the game' },
  { group: 'back', name: 'Came back' },
  { group: 'app', name: 'Opened the installed app' },
  { group: 'played', name: 'Played a game' },
  { group: 'turns', name: 'Played Take turns' },
  { group: 'race', name: 'Played Race' },
  { group: 'delve', name: 'Played Delve' },
  { group: 'daily', name: "Answered Today's unique" },
  { group: 'join', name: 'Tried to join a room' },
  { group: 'joined', name: 'Joined a room' },
  { group: 'failed', name: 'Met a failure' },
];
export const groupName = (g: Group) => GROUPS.find((x) => x.group === g)?.name ?? g;

/** The steps the overview reads (insights.ts stepsOf), and so the groups' share who played. */
const playedSteps = (c: Counts) => reachedOf(c, ['played', 'finished']);
/** The first day Today's unique asked in the period. */
const askedFrom = (c: Counts) => c.days.find((d) => d >= DAILY_FROM) ?? null;

/** The day a group is read from, where it's not the period's first: those who played and what they're a share of, from the day the steps were counted; the visits Today's unique is a share of, from the day it began. */
export function groupFrom(c: Counts, group: Group): string | null {
  if (group === 'played' || group === 'loads') return playedSteps(c).from;
  if (group === 'asked') return askedFrom(c);
  return null;
}

/** Each group's paths that were counted in the period (asking for one never counted would be turned down). */
export function groupPaths(c: Counts): Record<Group, string[]> {
  const out = Object.fromEntries(GROUPS.map((g) => [g.group, [] as string[]])) as Record<Group, string[]>;
  const any = (vs: number[]) => vs.some((n) => n > 0);
  if (c.visitors.total) out.visit.push('/');
  const steps = playedSteps(c);
  if (steps.from && steps.visitors) out.loads.push(steps.paged ? 'reach/page' : '/');
  const asked = askedFrom(c);
  if (asked && c.visitors.perDay.some((n, i) => n > 0 && c.days[i] >= asked)) out.asked.push('/');
  // New or back, and the installed app: sent with a visit, once a visitor like it.
  if (any(c.visits.new)) out.new.push('visit/new');
  for (const r of RETURNS) if (any(c.visits[r])) out.back.push(`visit/${r}`);
  if (any(c.visits.app)) out.app.push('visit/app');
  // Counted on every device in a game, guests' too, once a visit (count.ts countReach).
  if (any(c.reach.played)) out.played.push('reach/played');
  // Under every name its games were counted by in the period (model.ts currentName).
  for (const r of c.games.rows) if (r.started) out[r.mode].push(...r.paths);
  if (c.daily.right) out.daily.push('daily/right');
  if (c.daily.wrong) out.daily.push('daily/wrong');
  for (const j of c.joins) {
    if (j.tried) out.join.push(`join/${j.via}`);
    if (j.joined) out.joined.push(`joined/${j.via}`);
  }
  // Joining's and opening a room's: the scripts' errors aren't met for being somewhere.
  for (const f of c.failures) if (!f.script) out.failed.push(`error/${f.key}`);
  return out;
}

/** The two ways GoatCounter breaks paths down. */
export type Dim = 'locations' | 'systems';

/** A period's groups, each broken down by country and by system. */
export interface Slices {
  /** 4: with what those who played and answered are shares of, over the overview's days. */
  v: 4;
  span: number;
  /** The period's first day: slices of another (read the day before) are read again. */
  from: string;
  at: number;
  locations: Partial<Record<Group, Named[]>>;
  systems: Partial<Record<Group, Named[]>>;
  /** Delve's runs by the ten depths they ended in ("delve/depth-20-29"), each broken down the same two ways, keyed by the range's first depth: how deep a group's runs go. Two calls for each ten depths, so read only once a group is picked with Delve, to the same time as the rest (`at`). */
  depths?: Partial<Record<Dim, Record<number, Named[]>>>;
}

/** Those in a country, or on a system or a kind of device. */
export type Kind = 'place' | 'system' | 'device';
export interface Who {
  kind: Kind;
  name: string;
}
/** What the groups' view picks out: those in a country or on a device (never both: GoatCounter counts the two apart), and the games of a mode; either may be left open. */
export interface Sel {
  who: Who | null;
  mode: Mode | null;
}

export const unknown = (name: string) => name || 'Unknown';
/** The list a kind of group is counted in. */
export const dimOf = (kind: Kind): Dim => (kind === 'place' ? 'locations' : 'systems');

/** #groups, #groups/place/Germany, #groups/mode/race or both (#groups/place/Germany/mode/race): the view with what it picks out. */
export function hashOf(sel: Partial<Sel> | null): string {
  const who = sel?.who ? `/${sel.who.kind}/${encodeURIComponent(sel.who.name)}` : '';
  return `#groups${who}${sel?.mode ? `/mode/${sel.mode}` : ''}`;
}
/** What a #groups hash picks out (a mode once read `did/race`); null for nothing, or anything it can't read. */
export function selOf(hash: string): Sel | null {
  const m = /^#groups\/(.+)$/.exec(hash);
  if (!m) return null;
  const parts = m[1].split('/');
  if (parts.length % 2) return null;
  const sel: Sel = { who: null, mode: null };
  for (let i = 0; i < parts.length; i += 2) {
    let name: string;
    try {
      name = decodeURIComponent(parts[i + 1]);
    } catch {
      return null;
    }
    const kind = parts[i];
    if ((kind === 'place' || kind === 'system' || kind === 'device') && !sel.who) sel.who = { kind, name };
    else if ((kind === 'mode' || kind === 'did') && !sel.mode && MODES.includes(name as Mode)) sel.mode = name as Mode;
    else return null;
  }
  return sel;
}

/** Where a name in a list leads: its player group. */
export const placeLink = (name: string) => hashOf({ who: { kind: 'place', name } });
export const systemLink = (name: string) => hashOf({ who: { kind: 'system', name } });
export const deviceLink = (name: string) => hashOf({ who: { kind: 'device', name } });
export function modeLink(label: string): string | null {
  const mode = MODES.find((m) => MODE_NAMES[m] === label);
  return mode ? hashOf({ mode }) : null;
}

const sum = (list: Named[] | undefined, take: (n: Named) => boolean = () => true) => (list ?? []).reduce((n, x) => n + (take(x) ? x.count : 0), 0);

/**
 * Each group's count among those a place, system or kind of device picks
 * out; everyone with none, added up by `by` (country or system: GoatCounter's
 * two lists can differ by a few, so a table compares within its own).
 */
export function countsIn(s: Slices, who: Who | null, by: Dim = 'locations'): Record<Group, number> {
  const dim: Dim = who ? dimOf(who.kind) : by;
  const from = s[dim];
  return Object.fromEntries(GROUPS.map((g) => [g.group, sum(from[g.group], among(who))])) as Record<Group, number>;
}

/** Whether a row of GoatCounter's lists is among those `who` picks out (all, with none). */
const among = (who: Who | null) => (n: Named) => !who || (who.kind === 'device' ? deviceOf(n.name) === who.name : unknown(n.name) === who.name);

/**
 * A group's Delve runs by the ten depths they ended in, from 0 to the
 * deepest anyone reached (model.ts Counts.delve's shape); everyone's with
 * none. Null where the depths weren't read.
 */
export function depthsIn(s: Slices, who: Who | null, by: Dim = 'locations'): { from: number; count: number }[] | null {
  const list = s.depths?.[who ? dimOf(who.kind) : by];
  if (!list) return null;
  const froms = Object.keys(list).map(Number);
  if (!froms.length) return [];
  return Array.from({ length: Math.max(...froms) / 10 + 1 }, (_, i) => ({ from: i * 10, count: sum(list[i * 10], among(who)) }));
}

/** The depth calls a slice read makes: each ten depths a Delve run ended in during the period, by country and by system. */
export function depthCalls(c: Counts): { from: number; dim: Dim; paths: string[]; start: string }[] {
  return c.delve.ranges
    .filter((r) => r.count > 0)
    .flatMap((r) => (['locations', 'systems'] as const).map((dim) => ({ from: r.from, dim, paths: [`delve/depth-${r.from}-${r.from + 9}`], start: c.days[0] })));
}

/** How a group of players plays: their visits, and the rest set against them. */
export interface Profile {
  visitors: number;
  /** Of their page loads since the steps were counted (visits before), the share who played a game, as a guest or not (at most 100), as the overview reads it; null where it wasn't counted. */
  played: number | null;
  /** Games started on their devices: a game counts where it's run (the host's, or one screen's), so a guest's adds none. */
  games: number;
  /** Games started for each visitor. */
  perVisitor: number | null;
  /** Each mode's share of their games, as a whole percent. */
  modes: { mode: Mode; count: number; share: number }[];
  /** Of their visits on the days Today's unique asked, the share who answered it (at most 100). */
  daily: number | null;
  /** Of their tries to join, the share let in. */
  joins: number | null;
  tried: number;
  /** Failures they met (joining, or opening a room) for each 100 visitors. */
  failures: number | null;
  failed: number;
  /** Of their visits that found a save on the device or none, the share that found one; of their visitors, the share who opened the installed app. Null where it wasn't counted. */
  back: number | null;
  app: number | null;
  /** Their visits that found a save or none (a visit within 8 hours of the last play says neither). */
  told: number;
}

/** `played`: whether those who played a game were counted (they weren't before count.ts counted them). */
export function profileOf(n: Record<Group, number>, played = true): Profile {
  const games = MODES.reduce((t, m) => t + n[m], 0);
  const told = n.new + n.back;
  return {
    visitors: n.visit,
    played: played && n.loads ? Math.min(100, (100 * n.played) / n.loads) : null,
    games,
    perVisitor: n.visit ? games / n.visit : null,
    modes: MODES.map((mode) => ({ mode, count: n[mode], share: games ? Math.round((100 * n[mode]) / games) : 0 })),
    daily: n.asked ? Math.min(100, (100 * n.daily) / n.asked) : null,
    // Joins let in can run past those tried by a hair, where a try counted one day lets in the next.
    joins: n.join ? Math.min(100, (100 * n.joined) / n.join) : null,
    tried: n.join,
    failures: n.visit ? (100 * n.failed) / n.visit : null,
    failed: n.failed,
    // Of those told new or back, not of every visitor: the period may begin before visits were told apart.
    back: told ? (100 * n.back) / told : null,
    // (Sent with every visit from it: of every visitor in the period, so a share only where visits were told apart from its first day, insights.ts toldFromStart.)
    app: told && n.visit ? Math.min(100, (100 * n.app) / n.visit) : null,
    told,
  };
}

/** Whether these groups know who played a game (read since count.ts counted it). */
export const knowsPlayed = (s: Slices) => !!(s.locations.played?.length || s.systems.played?.length);

/** A group's profile; everyone's with none, `by` the list a table compares within. */
export const profileIn = (s: Slices, who: Who | null, by: Dim = 'locations') => profileOf(countsIn(s, who, by), knowsPlayed(s));

/** One row of a "by country" (or system, or device) table. */
export interface SegmentRow {
  who: Who;
  profile: Profile;
  /** Each group's count among them, a mode's games with the rest. */
  counts: Record<Group, number>;
}

/** The countries (or systems) with the most visitors, each with its profile; devices, the two kinds there are. */
export function segments(s: Slices, kind: Kind, top = 10): SegmentRow[] {
  const names =
    kind === 'device'
      ? [...new Set((s.systems.visit ?? []).map((n) => deviceOf(n.name)))]
      : [...(kind === 'place' ? s.locations.visit : s.systems.visit) ?? []].sort((a, b) => b.count - a.count).map((n) => unknown(n.name));
  return [...new Set(names)]
    .map((name) => {
      const counts = countsIn(s, { kind, name });
      return { who: { kind, name }, counts, profile: profileOf(counts, knowsPlayed(s)) };
    })
    .filter((r) => r.profile.visitors > 0)
    .sort((a, b) => b.profile.visitors - a.profile.visitors)
    .slice(0, top);
}

/** Of those who did something, one country's (or system's) count and share, against its share of all visitors. */
export interface WhereRow {
  name: string;
  count: number;
  /** Its share of those who did it, and of everyone who opened the game, as percents. */
  share: number;
  visitShare: number;
}

/** Where those who did `group` come from (or what they play on): each against how many of all visitors it is. `devices`: systems as phones and computers. */
export function whereOf(s: Slices, group: Group, dim: Dim, devices = false): WhereRow[] {
  const name = (n: Named) => (devices ? deviceOf(n.name) : unknown(n.name));
  const tally = (list: Named[] | undefined) => {
    const out = new Map<string, number>();
    for (const n of list ?? []) out.set(name(n), (out.get(name(n)) ?? 0) + n.count);
    return out;
  };
  const did = tally(s[dim][group]);
  const all = tally(s[dim].visit);
  const didTotal = [...did.values()].reduce((a, b) => a + b, 0);
  const allTotal = [...all.values()].reduce((a, b) => a + b, 0);
  return [...did]
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count, share: (100 * count) / didTotal, visitShare: allTotal ? (100 * (all.get(name) ?? 0)) / allTotal : 0 }))
    .sort((a, b) => b.count - a.count);
}

/** Of the games of `mode` (every mode's, with none), the share started on a phone or tablet, as a percent. */
export function phoneShare(s: Slices, mode: Mode | null): number {
  let phone = 0;
  let all = 0;
  for (const m of mode ? [mode] : MODES)
    for (const n of s.systems[m] ?? []) {
      all += n.count;
      if (deviceOf(n.name) === 'Phone or tablet') phone += n.count;
    }
  return all ? (100 * phone) / all : 0;
}

/** The paths a slice read asks about, that the API takes as one call each: a group and a way to break it down, from `from` (the period's first day, unless groupFrom says another). */
export function sliceCalls(c: Counts): { group: Group; dim: Dim; paths: string[]; from: string }[] {
  const paths = groupPaths(c);
  return GROUPS.flatMap(({ group }) =>
    paths[group].length ? (['locations', 'systems'] as const).map((dim) => ({ group, dim, paths: paths[group], from: groupFrom(c, group) ?? c.days[0] })) : [],
  );
}

/** The groups looked at for what stands out: the biggest countries, both kinds of device, the biggest systems. */
export function lookedAt(s: Slices): SegmentRow[] {
  const known = (r: SegmentRow) => r.who.name !== 'Unknown' && r.who.name !== 'Other';
  return [...segments(s, 'place', 8), ...segments(s, 'device'), ...segments(s, 'system', 5)].filter(known);
}

/** Something a group does unlike everyone, said in a line (GroupsView words it). */
export interface Standout {
  who: Who;
  what: 'mode' | 'played' | 'games' | 'daily' | 'back' | 'joins' | 'failures';
  mode?: Mode;
  /** The group's figure and everyone's: a mode's share of games, a percent of visitors, games for 100 visitors, a percent of joins, failures for 100 visitors. */
  mine: number;
  all: number;
  /** Better for the game (more play, more answers, joins that work), worse, or neither (a mode played more). */
  tone: 'up' | 'down' | 'flat';
  /** How much it stands out: the size of the difference, weighed by how many it rests on. */
  score: number;
}

/** Each figure a group is set against everyone by: whether it's apart from the rest's by more than chance. */
export interface Apart {
  played: boolean;
  games: boolean;
  daily: boolean;
  back: boolean;
  app: boolean;
  joins: boolean;
  failures: boolean;
  /** A mode's part of the group's games, and its games for their visits. */
  part: Record<Mode, boolean>;
  rate: Record<Mode, boolean>;
}

/**
 * Whether `who`'s figures are apart from the rest of their list's (everyone
 * less them: a country's against the other countries') by more than chance
 * makes: a share by how many it's of (insights.ts rateBeyondChance), a
 * count for the visits (games, failures) by its size against the group's
 * part of everyone's. With a few dozen visits a group's figures swing far
 * by chance alone.
 */
export function apartFrom(s: Slices, who: Who): Apart {
  const c = countsIn(s, who);
  const t = countsIn(s, null, dimOf(who.kind));
  /** The group's `k` of `n` against the rest's, `K` of `N` being everyone's. */
  const share = (k: number, n: number, K: number, N: number) => n > 0 && N > n && rateBeyondChance((100 * k) / n, n, (100 * (K - k)) / (N - n), N - n);
  /** The group's count against its visits' part of everyone's. */
  const count = (k: number, K: number) => t.visit > 0 && beyondChanceOf(k, (K * c.visit) / t.visit);
  const games = (n: Record<Group, number>) => MODES.reduce((g, m) => g + n[m], 0);
  return {
    played: share(c.played, c.loads, t.played, t.loads),
    games: count(games(c), games(t)),
    daily: share(c.daily, c.asked, t.daily, t.asked),
    back: share(c.back, c.new + c.back, t.back, t.new + t.back),
    app: share(c.app, c.visit, t.app, t.visit),
    joins: share(c.joined, c.join, t.joined, t.join),
    failures: count(c.failed, t.failed),
    part: Object.fromEntries(MODES.map((m) => [m, share(c[m], games(c), t[m], games(t))])) as Record<Mode, boolean>,
    rate: Object.fromEntries(MODES.map((m) => [m, count(c[m], t[m])])) as Record<Mode, boolean>,
  };
}

/**
 * What stands out among the groups, most first: a mode far more of their
 * games, more or fewer playing at all, many more or fewer games started,
 * Today's unique answered more or less, more or fewer coming back (of those
 * told new or back), joins that fail more, far more
 * failures met. Only groups big enough that a handful of players can't make it up
 * (`min` visitors, and enough games or tries behind the figure), and only
 * a difference from the rest of everyone that chance couldn't have made
 * (a share by how many it's of, a count for the visits by its size).
 */
export function standouts(s: Slices, top = 6, min = 30): Standout[] {
  const floor = Math.max(min, profileIn(s, null).visitors * 0.03);
  const out: Standout[] = [];
  const weigh = (mine: number, theirs: number, n: number) => Math.abs(Math.log(mine / theirs)) * Math.sqrt(n);
  for (const { who, profile: p } of lookedAt(s)) {
    if (p.visitors < floor) continue;
    // Set against everyone in the same list: a system's against all systems'.
    const all = profileIn(s, null, dimOf(who.kind));
    const sure = apartFrom(s, who);
    for (const m of p.modes) {
      const a = all.modes.find((x) => x.mode === m.mode)!;
      if (p.games >= 20 && a.share >= 5 && m.share >= a.share * 1.3 && sure.part[m.mode]) out.push({ who, what: 'mode', mode: m.mode, mine: m.share, all: a.share, tone: 'flat', score: weigh(m.share, a.share, m.count) });
    }
    if (p.played !== null && all.played && p.played > 0) {
      const r = p.played / all.played;
      if ((r >= 1.2 || r <= 0.83) && sure.played) out.push({ who, what: 'played', mine: p.played, all: all.played, tone: r > 1 ? 'up' : 'down', score: weigh(p.played, all.played, p.visitors) });
    }
    const games = (g: Profile) => (100 * g.games) / g.visitors;
    if (all.visitors && p.games >= 20) {
      const r = games(p) / games(all);
      if ((r >= 1.25 || r <= 0.8) && sure.games) out.push({ who, what: 'games', mine: games(p), all: games(all), tone: r > 1 ? 'up' : 'down', score: weigh(games(p), games(all), p.games) });
    }
    if (p.daily !== null && all.daily && p.daily > 0) {
      const r = p.daily / all.daily;
      if ((r >= 1.25 || r <= 0.8) && sure.daily) out.push({ who, what: 'daily', mine: p.daily, all: all.daily, tone: r > 1 ? 'up' : 'down', score: weigh(p.daily, all.daily, p.visitors) });
    }
    if (p.back !== null && all.back && p.back > 0 && p.told >= floor) {
      const r = p.back / all.back;
      if ((r >= 1.2 || r <= 0.83) && sure.back) out.push({ who, what: 'back', mine: p.back, all: all.back, tone: r > 1 ? 'up' : 'down', score: weigh(p.back, all.back, p.told) });
    }
    if (p.joins !== null && all.joins !== null && p.tried >= 20 && Math.abs(p.joins - all.joins) >= 8 && sure.joins)
      out.push({ who, what: 'joins', mine: p.joins, all: all.joins, tone: p.joins > all.joins ? 'up' : 'down', score: weigh(Math.max(1, 100 - p.joins), Math.max(1, 100 - all.joins), p.tried) });
    // Only more: a group meeting fewer failures is no news.
    if (p.failures !== null && all.failures && p.failed >= 10 && p.failures / all.failures >= 1.4 && sure.failures)
      out.push({ who, what: 'failures', mine: p.failures, all: all.failures, tone: 'down', score: weigh(p.failures, all.failures, p.failed) });
  }
  // A mix of findings: at most two of a kind, and two about one group; but
  // a problem (joins failing, failures met) is never left out for a group's
  // other findings, which can always wait.
  const kinds = new Map<string, number>();
  const groups = new Map<string, number>();
  const problem = (f: Standout) => f.tone === 'down' && (f.what === 'joins' || f.what === 'failures');
  return out
    .sort((a, b) => Number(problem(b)) - Number(problem(a)) || b.score - a.score)
    .filter((f) => {
      const g = `${f.who.kind}/${f.who.name}`;
      if ((kinds.get(f.what) ?? 0) >= 2 || (groups.get(g) ?? 0) >= 2) return false;
      kinds.set(f.what, (kinds.get(f.what) ?? 0) + 1);
      groups.set(g, (groups.get(g) ?? 0) + 1);
      return true;
    })
    .slice(0, top)
    .sort((a, b) => b.score - a.score);
}
