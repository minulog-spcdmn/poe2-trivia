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
