// Made-up numbers for Analytics (stats.html?demo), on the dev server and
// the beta only: every view filled without the owner's key or a call to
// GoatCounter, so its layout can be looked at and tried. Each day's numbers
// come from the day itself, so a day reads the same in every period, and
// they're shaped like the real ones: more in the evening and at weekends,
// slowly growing, Today's unique only from the day it began.

import type { Named } from './api.ts';
import { keptChanges } from './changes.ts';
import { DAILY_FROM, countsOf, daysBetween, modesOf, type PathCount } from './model.ts';
import type { Read } from './read.ts';
import { GROUPS, type Group, type Slices } from './slices.ts';
import { addDays, dayIn, midnight } from './zone.ts';

/** The zone the made-up account cuts its days in. */
const ZONE = 'Europe/Berlin';

/** A seeded stream of numbers in [0, 1) (mulberry32). */
function stream(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

/** A count around `mean`, as random as real ones are. */
function around(mean: number, rnd: () => number): number {
  if (mean <= 0) return 0;
  if (mean < 30) {
    // Knuth's: how many arrivals in a stretch that expects `mean`.
    const limit = Math.exp(-mean);
    let k = 0;
    for (let p = rnd(); p > limit; p *= rnd()) k++;
    return k;
  }
  const normal = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  return Math.max(0, Math.round(mean + normal * Math.sqrt(mean)));
}

/** Of `n` tries, how many came off, each with chance `p`. */
const ofThem = (n: number, p: number, rnd: () => number) => Array.from({ length: n }, rnd).filter((r) => r < p).length;

/** How a day's visits spread over its hours: quiet at night, busiest in the evening. */
const HOURS = [3, 2, 1.4, 1, 0.8, 0.8, 1.2, 2, 2.8, 3.2, 3.6, 4, 4.6, 4.8, 4.6, 4.8, 5.4, 6.4, 7.6, 8.8, 9.4, 8.6, 6.6, 4.6];
const HOUR_SUM = HOURS.reduce((n, v) => n + v, 0);

const GAMES = [
  { key: 'race-online', share: 0.15, sizes: [2, 3, 4, 5, 6, 8] },
  { key: 'race-hotseat', share: 0.03, sizes: [2, 3, 4] },
  { key: 'turns-online', share: 0.07, sizes: [2, 3, 4, 5] },
  { key: 'turns-hotseat', share: 0.03, sizes: [2, 3] },
  { key: 'delve-online', share: 0.06, sizes: [1, 2, 3, 4] },
  { key: 'delve-hotseat', share: 0.04, sizes: [1, 2] },
];

/** One day's made-up counts, each path with its 24 hours (from the day's midnight in ZONE); `upTo`: the hours counted so far (today). */
function dayCounts(day: string, upTo = 24): Map<string, number[]> {
  const rnd = stream(seedOf(day));
  const out = new Map<string, number[]>();
  const add = (path: string, h: number, n: number) => {
    if (!n || h >= upTo) return;
    const hours = out.get(path) ?? Array<number>(24).fill(0);
    hours[h] += n;
    out.set(path, hours);
  };
  const t = (Date.parse(day) - Date.parse('2026-01-01')) / 86_400_000;
  const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()) ? 1.35 : 1;
  const visitors = (28 + t * 0.11) * weekend * (0.85 + rnd() * 0.3);
  const daily = day >= DAILY_FROM;
  // How hard the day's item was: the share who name it.
  const named = 0.3 + rnd() * 0.55;
  for (let h = 0; h < 24; h++) {
    const v = (visitors * HOURS[h]) / HOUR_SUM;
    add('/', h, around(v, rnd));
    for (const g of GAMES) {
      const started = around(v * g.share, rnd);
      add(`play/${g.key}`, h, started);
      for (let i = 0; i < started; i++) {
        // Bigger parties are rarer.
        const size = g.sizes[Math.floor(rnd() ** 1.6 * g.sizes.length)];
        add(`size/${g.key}-${size}p`, h, 1);
        if (rnd() >= 0.78) continue;
        add(`end/${g.key}`, h, 1);
        // Most runs end shallow, a few go far down.
        const depth = Math.floor(rnd() ** 2.2 * 6) * 10;
        if (g.key.startsWith('delve')) add(`delve/depth-${depth}-${depth + 9}`, h, 1);
      }
      if (g.key.endsWith('online')) {
        const invites = around(started * 0.9, rnd);
        add('open/invite-link', h, invites);
        add('join/invite-link', h, invites);
        add('joined/invite-link', h, ofThem(invites, 0.9, rnd));
      }
    }
    add('open/delve-link', h, around(v * 0.01, rnd));
    const codes = around(v * 0.03, rnd);
    add('join/code', h, codes);
    add('joined/code', h, ofThem(codes, 0.8, rnd));
    const rooms = around(v * 0.05, rnd);
    add('join/open-rooms', h, rooms);
    add('joined/open-rooms', h, ofThem(rooms, 0.94, rnd));
    if (daily) {
      const answers = around(v * 0.32, rnd);
      const right = ofThem(answers, named, rnd);
      add('daily/right', h, right);
      add('daily/wrong', h, answers - right);
    }
    if (rnd() < 0.04) add('error/join-no-answer', h, 1);
    if (rnd() < 0.015) add('error/join-no-such-room', h, 1);
    if (rnd() < 0.01) add('error/host-no-connection', h, 1);
    if (rnd() < 0.006) add('error/join-version-mismatch', h, 1);
  }
  return out;
}

/** Every path counted over `days`, as GoatCounter's /stats/hits would give them; the last day counted up to `lastHours`. */
function pathsOf(days: string[], lastHours: number): PathCount[] {
  const byPath = new Map<string, PathCount>();
  days.forEach((day, i) => {
    for (const [path, hours] of dayCounts(day, i === days.length - 1 ? lastHours : 24)) {
      const p = byPath.get(path) ?? { path, event: path !== '/', count: 0, days: {}, hours: {} };
      const n = hours.reduce((s, v) => s + v, 0);
      p.count += n;
      p.days[day] = n;
      p.hours![day] = hours;
      byPath.set(path, p);
    }
  });
  // A path has every day of the span, as GoatCounter gives them.
  for (const p of byPath.values())
    for (const day of days) {
      p.days[day] ??= 0;
      p.hours![day] ??= Array<number>(24).fill(0);
    }
  return [...byPath.values()];
}

/** `shares` of `total` (scaled to fill it), each a whole number, largest first; with `rest`, a few unknown (GoatCounter's ''), as it lists those it couldn't place. */
function split(total: number, shares: [string, number][], rest = true): Named[] {
  const scale = (rest ? 0.97 : 1) / shares.reduce((n, [, s]) => n + s, 0);
  const named = shares.map(([name, s]) => ({ name, count: Math.round(total * s * scale) })).filter((n) => n.count > 0);
  const left = total - named.reduce((n, x) => n + x.count, 0);
  return rest && left > 0 ? [...named, { name: '', count: left }] : named;
}

/** A made-up read of the last `days` days, against the same many before, as Analytics' load() makes from GoatCounter's. */
export function demoRead(days: number, at = new Date()): Read {
  const today = dayIn(ZONE, at);
  const from = addDays(today, -(days - 1));
  const fromBefore = addDays(from, -days);
  const toBefore = addDays(today, -days);
  const hoursSoFar = Math.floor((at.getTime() - midnight(ZONE, today).getTime()) / 3_600_000) + 1;
  const nowPaths = pathsOf(daysBetween(from, today), hoursSoFar);
  const visitors = nowPaths.find((p) => p.path === '/')?.count ?? 0;
  return {
    v: 4,
    span: days,
    from,
    to: today,
    fromBefore,
    toBefore,
    zone: ZONE,
    now: countsOf(nowPaths, daysBetween(from, today), ZONE),
    before: countsOf(pathsOf(daysBetween(fromBefore, toBefore), hoursSoFar), daysBetween(fromBefore, toBefore), ZONE),
    systems: split(visitors, [
      ['Windows', 0.52],
      ['Android', 0.17],
      ['iOS', 0.13],
      ['macOS', 0.08],
      ['Linux', 0.07],
      ['Chrome OS', 0.01],
    ]),
    countries: split(visitors, [
      ['United States', 0.24],
      ['Germany', 0.15],
      ['United Kingdom', 0.08],
      ['Canada', 0.06],
      ['Poland', 0.05],
      ['Brazil', 0.05],
      ['France', 0.04],
      ['Australia', 0.04],
      ['Russia', 0.03],
      ['Netherlands', 0.03],
      ['Sweden', 0.02],
      ['Korea, Republic of', 0.02],
    ]),
    refs: split(visitors, [
      ['(unknown)', 0.46],
      ['https://www.reddit.com', 0.22],
      ['https://www.google.com', 0.1],
      ['https://www.youtube.com', 0.06],
      ['https://discord.com', 0.05],
      ['https://www.twitch.tv', 0.03],
      ['https://poe2db.tw', 0.02],
    ], false),
    at: at.getTime(),
    complete: true,
  };
}

/** A made-up read as an update would find it: with what the hour before it brought in. */
export function demoUpdate(days: number, at = new Date()): Read {
  const now = demoRead(days, at);
  return { ...now, changes: keptChanges(demoRead(days, new Date(at.getTime() - 3_600_000)), now) };
}

/** How each country and system plays, against everyone: more of one mode, fewer answers, more joins that fail. */
const TILTS: Record<string, Partial<Record<Group | 'success', number>>> = {
  'United States': { race: 1.3, turns: 0.8, daily: 0.9 },
  Germany: { delve: 1.7, race: 0.8, daily: 1.25 },
  'United Kingdom': { turns: 1.3 },
  Poland: { delve: 1.4, join: 1.3 },
  Brazil: { turns: 1.5, daily: 0.6, success: 0.8, failed: 2 },
  France: { race: 0.6, daily: 1.4 },
  Russia: { race: 1.4, success: 0.85, failed: 1.6 },
  'Korea, Republic of': { race: 1.7, daily: 1.5 },
  Android: { daily: 1.5, race: 0.7, success: 0.9, failed: 1.3 },
  iOS: { daily: 1.6, race: 0.6, delve: 1.2 },
  Linux: { delve: 1.4, join: 1.4 },
  macOS: { turns: 1.3 },
};

/** Made-up player groups (slices.ts) for a made-up read: its totals spread over its countries and systems, each leaning its own way. */
export function demoSlices(read: Read): Slices {
  const c = read.now;
  const played = new Map(modesOf(c.games.rows).map((m) => [m.mode, m.started]));
  const total: Record<Group, number> = {
    visit: c.visitors.total,
    turns: played.get('turns') ?? 0,
    race: played.get('race') ?? 0,
    delve: played.get('delve') ?? 0,
    daily: c.daily.right + c.daily.wrong,
    join: c.joins.reduce((n, j) => n + j.tried, 0),
    joined: c.joins.reduce((n, j) => n + j.joined, 0),
    failed: c.failures.reduce((n, f) => n + f.count, 0),
  };
  const spread = (list: Named[]): Partial<Record<Group, Named[]>> => {
    const all = list.reduce((n, x) => n + x.count, 0) || 1;
    const out: Partial<Record<Group, Named[]>> = {};
    for (const { group } of GROUPS) {
      if (group === 'visit') {
        out.visit = list;
        continue;
      }
      if (group === 'joined') continue;
      const weight = list.map((x) => (x.count / all) * (TILTS[x.name]?.[group] ?? 1));
      const sum = weight.reduce((a, b) => a + b, 0) || 1;
      out[group] = list.map((x, i) => ({ name: x.name, count: Math.round((total[group] * weight[i]) / sum) })).filter((x) => x.count > 0);
    }
    const success = total.join ? total.joined / total.join : 0;
    out.joined = (out.join ?? []).map((x) => ({ name: x.name, count: Math.round(x.count * Math.min(1, success * (TILTS[x.name]?.success ?? 1))) })).filter((x) => x.count > 0);
    return out;
  };
  return { v: 1, span: read.span, from: read.from, at: read.at, locations: spread(read.countries), systems: spread(read.systems) };
}
