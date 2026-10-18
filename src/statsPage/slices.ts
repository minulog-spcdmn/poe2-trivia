// Player groups (stats.html#groups): how the visitors from a country, or on
// a system or a kind of device, play, set against everyone, each mode's
// games among them too. GoatCounter keeps no visit together with its events,
// but it breaks any set of paths down by country and by system: so each thing
// people do (a group of paths, GROUPS) is read once for each, and a
// country's row across them is that country's visitors. It never breaks a
// country down by system, so a country and a device are never picked
// together. Pure, so the tests can feed it.

import type { Named } from './api.ts';
import { MODES, MODE_NAMES, deviceOf, type Counts, type Mode } from './model.ts';

/** What people do, each a set of the paths count.ts sends. */
export type Group = 'visit' | 'played' | Mode | 'daily' | 'join' | 'joined' | 'failed';
export const GROUPS: readonly { group: Group; name: string }[] = [
  { group: 'visit', name: 'Opened the game' },
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

/** Each group's paths that were counted in the period (asking for one never counted would be turned down). */
export function groupPaths(c: Counts): Record<Group, string[]> {
  const out = Object.fromEntries(GROUPS.map((g) => [g.group, [] as string[]])) as Record<Group, string[]>;
  if (c.visitors.total) out.visit.push('/');
  // Counted on every device in a game, guests' too, once a visit (count.ts countReach).
  if (c.reach.playedPerDay.some((n) => n > 0)) out.played.push('reach/played');
  for (const r of c.games.rows) if (r.started) out[r.mode].push(`play/${r.mode}-${r.where}`);
  if (c.daily.right) out.daily.push('daily/right');
  if (c.daily.wrong) out.daily.push('daily/wrong');
  for (const j of c.joins) {
    if (j.tried) out.join.push(`join/${j.via}`);
    if (j.joined) out.joined.push(`joined/${j.via}`);
  }
  for (const f of c.failures) out.failed.push(`error/${f.key}`);
  return out;
}

/** The two ways GoatCounter breaks paths down. */
export type Dim = 'locations' | 'systems';

/** A period's groups, each broken down by country and by system. */
export interface Slices {
  /** 2: with those who played a game. */
  v: 2;
  span: number;
  /** The period's first day: slices of another (read the day before) are read again. */
  from: string;
  at: number;
  locations: Partial<Record<Group, Named[]>>;
  systems: Partial<Record<Group, Named[]>>;
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
  const take = (n: Named) => !who || (who.kind === 'device' ? deviceOf(n.name) === who.name : unknown(n.name) === who.name);
  const from = s[dim];
  return Object.fromEntries(GROUPS.map((g) => [g.group, sum(from[g.group], take)])) as Record<Group, number>;
}

/** How a group of players plays: their visits, and the rest set against them. */
export interface Profile {
  visitors: number;
  /** Of their visitors, the share who played a game, as a guest or not (at most 100); null where it wasn't counted. */
  played: number | null;
  /** Games started on their devices: a game counts where it's run (the host's, or one screen's), so a guest's adds none. */
  games: number;
  /** Games started for each visitor. */
  perVisitor: number | null;
  /** Each mode's share of their games, as a whole percent. */
  modes: { mode: Mode; count: number; share: number }[];
  /** Of their visitors, the share who answered Today's unique (at most 100). */
  daily: number | null;
  /** Of their tries to join, the share let in. */
  joins: number | null;
  tried: number;
  /** Failures they met (joining, or opening a room) for each 100 visitors. */
  failures: number | null;
  failed: number;
}

/** `played`: whether those who played a game were counted (they weren't before count.ts counted them). */
export function profileOf(n: Record<Group, number>, played = true): Profile {
  const games = MODES.reduce((t, m) => t + n[m], 0);
  return {
    visitors: n.visit,
    played: played && n.visit ? Math.min(100, (100 * n.played) / n.visit) : null,
    games,
    perVisitor: n.visit ? games / n.visit : null,
    modes: MODES.map((mode) => ({ mode, count: n[mode], share: games ? Math.round((100 * n[mode]) / games) : 0 })),
    daily: n.visit ? Math.min(100, (100 * n.daily) / n.visit) : null,
    // Joins let in can run past those tried by a hair, where a try counted one day lets in the next.
    joins: n.join ? Math.min(100, (100 * n.joined) / n.join) : null,
    tried: n.join,
    failures: n.visit ? (100 * n.failed) / n.visit : null,
    failed: n.failed,
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

/** The paths a slice read asks about, that the API takes as one call each: a group and a way to break it down. */
export function sliceCalls(c: Counts): { group: Group; dim: Dim; paths: string[] }[] {
  const paths = groupPaths(c);
  return GROUPS.flatMap(({ group }) => (paths[group].length ? (['locations', 'systems'] as const).map((dim) => ({ group, dim, paths: paths[group] })) : []));
}

/** The groups looked at for what stands out: the biggest countries, both kinds of device, the biggest systems. */
export function lookedAt(s: Slices): SegmentRow[] {
  const known = (r: SegmentRow) => r.who.name !== 'Unknown' && r.who.name !== 'Other';
  return [...segments(s, 'place', 8), ...segments(s, 'device'), ...segments(s, 'system', 5)].filter(known);
}

/** Something a group does unlike everyone, said in a line (GroupsView words it). */
export interface Standout {
  who: Who;
  what: 'mode' | 'played' | 'games' | 'daily' | 'joins' | 'failures';
  mode?: Mode;
  /** The group's figure and everyone's: a mode's share of games, a percent of visitors, games for 100 visitors, a percent of joins, failures for 100 visitors. */
  mine: number;
  all: number;
  /** Better for the game (more play, more answers, joins that work), worse, or neither (a mode played more). */
  tone: 'up' | 'down' | 'flat';
  /** How much it stands out: the size of the difference, weighed by how many it rests on. */
  score: number;
}

/**
 * What stands out among the groups, most first: a mode far more of their
 * games, more or fewer playing at all, many more or fewer games started,
 * Today's unique answered more or less, joins that fail more, far more
 * failures met. Only groups big enough that a handful of players can't make it up
 * (`min` visitors, and enough games or tries behind the figure).
 */
export function standouts(s: Slices, top = 6, min = 30): Standout[] {
  const floor = Math.max(min, profileIn(s, null).visitors * 0.03);
  const out: Standout[] = [];
  const weigh = (mine: number, theirs: number, n: number) => Math.abs(Math.log(mine / theirs)) * Math.sqrt(n);
  for (const { who, profile: p } of lookedAt(s)) {
    if (p.visitors < floor) continue;
    // Set against everyone in the same list: a system's against all systems'.
    const all = profileIn(s, null, dimOf(who.kind));
    for (const m of p.modes) {
      const a = all.modes.find((x) => x.mode === m.mode)!;
      if (p.games >= 20 && a.share >= 5 && m.share >= a.share * 1.3) out.push({ who, what: 'mode', mode: m.mode, mine: m.share, all: a.share, tone: 'flat', score: weigh(m.share, a.share, m.count) });
    }
    if (p.played !== null && all.played && p.played > 0) {
      const r = p.played / all.played;
      if (r >= 1.2 || r <= 0.83) out.push({ who, what: 'played', mine: p.played, all: all.played, tone: r > 1 ? 'up' : 'down', score: weigh(p.played, all.played, p.visitors) });
    }
    const games = (g: Profile) => (100 * g.games) / g.visitors;
    if (all.visitors && p.games >= 20) {
      const r = games(p) / games(all);
      if (r >= 1.25 || r <= 0.8) out.push({ who, what: 'games', mine: games(p), all: games(all), tone: r > 1 ? 'up' : 'down', score: weigh(games(p), games(all), p.games) });
    }
    if (p.daily !== null && all.daily && p.daily > 0) {
      const r = p.daily / all.daily;
      if (r >= 1.25 || r <= 0.8) out.push({ who, what: 'daily', mine: p.daily, all: all.daily, tone: r > 1 ? 'up' : 'down', score: weigh(p.daily, all.daily, p.visitors) });
    }
    if (p.joins !== null && all.joins !== null && p.tried >= 20 && Math.abs(p.joins - all.joins) >= 8)
      out.push({ who, what: 'joins', mine: p.joins, all: all.joins, tone: p.joins > all.joins ? 'up' : 'down', score: weigh(Math.max(1, 100 - p.joins), Math.max(1, 100 - all.joins), p.tried) });
    // Only more: a group meeting fewer failures is no news.
    if (p.failures !== null && all.failures && p.failed >= 10 && p.failures / all.failures >= 1.4)
      out.push({ who, what: 'failures', mine: p.failures, all: all.failures, tone: 'down', score: weigh(p.failures, all.failures, p.failed) });
  }
  // A mix of findings: at most two of a kind, and two about one group.
  const kinds = new Map<string, number>();
  const groups = new Map<string, number>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((f) => {
      const g = `${f.who.kind}/${f.who.name}`;
      if ((kinds.get(f.what) ?? 0) >= 2 || (groups.get(g) ?? 0) >= 2) return false;
      kinds.set(f.what, (kinds.get(f.what) ?? 0) + 1);
      groups.set(g, (groups.get(g) ?? 0) + 1);
      return true;
    })
    .slice(0, top);
}
