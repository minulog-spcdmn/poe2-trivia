// Player groups (stats.html#groups): how a country, a system or a kind of
// device plays, set against everyone, and where the players of a mode come
// from and on what. GoatCounter keeps no visit together with its events, but
// it breaks any set of paths down by country and by system: so each thing
// people do (a group of paths, GROUPS) is read once for each, and a country's
// row across them is that country's players. Pure, so the tests can feed it.

import type { Named } from './api.ts';
import { MODES, MODE_NAMES, deviceOf, type Counts, type Mode } from './model.ts';

/** What people do, each a set of the paths count.ts sends. */
export type Group = 'visit' | Mode | 'daily' | 'join' | 'joined' | 'failed';
export const GROUPS: readonly { group: Group; name: string }[] = [
  { group: 'visit', name: 'Opened the game' },
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
  v: 1;
  span: number;
  /** The period's first day: slices of another (read the day before) are read again. */
  from: string;
  at: number;
  locations: Partial<Record<Group, Named[]>>;
  systems: Partial<Record<Group, Named[]>>;
}

/** Who is picked out: those in a country, on a system or a kind of device, or those who did something. */
export type Sel = { kind: 'place' | 'system' | 'device'; name: string } | { kind: 'did'; group: Group };

export const unknown = (name: string) => name || 'Unknown';

/** #groups, or #groups/place/Germany: the view with whoever it picks out. */
export function hashOf(sel: Sel | null): string {
  if (!sel) return '#groups';
  return `#groups/${sel.kind}/${encodeURIComponent(sel.kind === 'did' ? sel.group : sel.name)}`;
}
export function selOf(hash: string): Sel | null {
  const m = /^#groups\/(place|system|device|did)\/(.+)$/.exec(hash);
  if (!m) return null;
  let name: string;
  try {
    name = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  if (m[1] !== 'did') return { kind: m[1] as 'place' | 'system' | 'device', name };
  return GROUPS.some((g) => g.group === name) ? { kind: 'did', group: name as Group } : null;
}

/** Where a name in a list leads: its player group. */
export const placeLink = (name: string) => hashOf({ kind: 'place', name });
export const systemLink = (name: string) => hashOf({ kind: 'system', name });
export const deviceLink = (name: string) => hashOf({ kind: 'device', name });
export function modeLink(label: string): string | null {
  const mode = MODES.find((m) => MODE_NAMES[m] === label);
  return mode ? hashOf({ kind: 'did', group: mode }) : null;
}

/** "Germany", "Windows", "Played Delve". */
export const selName = (sel: Sel) => (sel.kind === 'did' ? groupName(sel.group) : sel.name);

const sum = (list: Named[] | undefined, take: (n: Named) => boolean = () => true) => (list ?? []).reduce((n, x) => n + (take(x) ? x.count : 0), 0);

/**
 * Each group's count among those a place, system or kind of device picks
 * out; everyone with none, added up by `by` (country or system: GoatCounter's
 * two lists can differ by a few, so a table compares within its own).
 */
export function countsIn(s: Slices, sel: Exclude<Sel, { kind: 'did' }> | null, by: Dim = 'locations'): Record<Group, number> {
  const dim: Dim = sel ? (sel.kind === 'place' ? 'locations' : 'systems') : by;
  const take = (n: Named) => !sel || (sel.kind === 'device' ? deviceOf(n.name) === sel.name : unknown(n.name) === sel.name);
  const from = s[dim];
  return Object.fromEntries(GROUPS.map((g) => [g.group, sum(from[g.group], take)])) as Record<Group, number>;
}

/** How a group of players plays: their visits, and the rest set against them. */
export interface Profile {
  visitors: number;
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
  failed: number;
}

export function profileOf(n: Record<Group, number>): Profile {
  const games = MODES.reduce((t, m) => t + n[m], 0);
  return {
    visitors: n.visit,
    games,
    perVisitor: n.visit ? games / n.visit : null,
    modes: MODES.map((mode) => ({ mode, count: n[mode], share: games ? Math.round((100 * n[mode]) / games) : 0 })),
    daily: n.visit ? Math.min(100, (100 * n.daily) / n.visit) : null,
    // Joins let in can run past those tried by a hair, where a try counted one day lets in the next.
    joins: n.join ? Math.min(100, (100 * n.joined) / n.join) : null,
    tried: n.join,
    failed: n.failed,
  };
}

/** One row of a "by country" (or system, or device) table. */
export interface SegmentRow {
  sel: Exclude<Sel, { kind: 'did' }>;
  profile: Profile;
}

/** The countries (or systems) with the most visitors, each with its profile; devices, the two kinds there are. */
export function segments(s: Slices, kind: 'place' | 'system' | 'device', top = 10): SegmentRow[] {
  const names =
    kind === 'device'
      ? [...new Set((s.systems.visit ?? []).map((n) => deviceOf(n.name)))]
      : [...(kind === 'place' ? s.locations.visit : s.systems.visit) ?? []].sort((a, b) => b.count - a.count).map((n) => unknown(n.name));
  return [...new Set(names)]
    .map((name) => ({ sel: { kind, name }, profile: profileOf(countsIn(s, { kind, name })) }))
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

/** The paths a slice read asks about, that the API takes as one call each: a group and a way to break it down. */
export function sliceCalls(c: Counts): { group: Group; dim: Dim; paths: string[] }[] {
  const paths = groupPaths(c);
  return GROUPS.flatMap(({ group }) => (paths[group].length ? (['locations', 'systems'] as const).map((dim) => ({ group, dim, paths: paths[group] })) : []));
}

/** The groups looked at for what stands out: the biggest countries, both kinds of device, the biggest systems. */
export function lookedAt(s: Slices): SegmentRow[] {
  const known = (r: SegmentRow) => r.sel.name !== 'Unknown' && r.sel.name !== 'Other';
  return [...segments(s, 'place', 8), ...segments(s, 'device'), ...segments(s, 'system', 5)].filter(known);
}

/** Something a group does unlike everyone, said in a line (GroupsView words it). */
export interface Standout {
  sel: Exclude<Sel, { kind: 'did' }>;
  what: 'mode' | 'games' | 'daily' | 'joins';
  mode?: Mode;
  /** The group's figure and everyone's: a mode's share of games, games for 100 visitors, a percent of visitors, a percent of joins. */
  mine: number;
  all: number;
  /** Better for the game (more play, more answers, joins that work), worse, or neither (a mode played more). */
  tone: 'up' | 'down' | 'flat';
  /** How much it stands out: the size of the difference, weighed by how many it rests on. */
  score: number;
}

/**
 * What stands out among the groups, most first: a mode played far more, many
 * more or fewer games, Today's unique answered more or less, joins that fail
 * more. Only groups big enough that a handful of players can't make it up
 * (`min` visitors, and enough games or tries behind the figure).
 */
export function standouts(s: Slices, top = 6, min = 30): Standout[] {
  const all = profileOf(countsIn(s, null));
  const floor = Math.max(min, all.visitors * 0.03);
  const out: Standout[] = [];
  const weigh = (mine: number, theirs: number, n: number) => Math.abs(Math.log(mine / theirs)) * Math.sqrt(n);
  for (const { sel, profile: p } of lookedAt(s)) {
    if (p.visitors < floor) continue;
    for (const m of p.modes) {
      const a = all.modes.find((x) => x.mode === m.mode)!;
      if (p.games >= 20 && a.share >= 5 && m.share >= a.share * 1.3) out.push({ sel, what: 'mode', mode: m.mode, mine: m.share, all: a.share, tone: 'flat', score: weigh(m.share, a.share, m.count) });
    }
    const games = (g: Profile) => (100 * g.games) / g.visitors;
    if (all.visitors && p.games >= 20) {
      const r = games(p) / games(all);
      if (r >= 1.25 || r <= 0.8) out.push({ sel, what: 'games', mine: games(p), all: games(all), tone: r > 1 ? 'up' : 'down', score: weigh(games(p), games(all), p.games) });
    }
    if (p.daily !== null && all.daily && p.daily > 0) {
      const r = p.daily / all.daily;
      if (r >= 1.25 || r <= 0.8) out.push({ sel, what: 'daily', mine: p.daily, all: all.daily, tone: r > 1 ? 'up' : 'down', score: weigh(p.daily, all.daily, p.visitors) });
    }
    if (p.joins !== null && all.joins !== null && p.tried >= 20 && Math.abs(p.joins - all.joins) >= 8)
      out.push({ sel, what: 'joins', mine: p.joins, all: all.joins, tone: p.joins > all.joins ? 'up' : 'down', score: weigh(Math.max(1, 100 - p.joins), Math.max(1, 100 - all.joins), p.tried) });
  }
  // A mix of findings: at most two of a kind, and two about one group.
  const kinds = new Map<string, number>();
  const groups = new Map<string, number>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((f) => {
      const g = `${f.sel.kind}/${f.sel.name}`;
      if ((kinds.get(f.what) ?? 0) >= 2 || (groups.get(g) ?? 0) >= 2) return false;
      kinds.set(f.what, (kinds.get(f.what) ?? 0) + 1);
      groups.set(g, (groups.get(g) ?? 0) + 1);
      return true;
    })
    .slice(0, top);
}
