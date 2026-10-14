// When the room bot's players are up: each one lives somewhere (a time zone,
// told by their name where it says, as 감자 or まったり do, else drawn), and
// keeps their own hours, all worked out from the name, so a regular is on at
// their own times from one week to the next. Most go to bed around midnight
// and are up for work or school; a fair few are night owls; and some keep
// no hours at all, their sleep drifting round the clock from day to day.
// Any of them stays up late now and then, more often on a Friday or Saturday
// night. Awake, they play more in the evening than in the day on a weekday,
// and as much in the day as in the evening at the weekend.
// Pure functions of a name and a time, so tests can pin them.

import { seededBy } from './identities.ts';

const HOUR = 3600000;
const DAY = 24 * HOUR;

export type Habit = 'early' | 'regular' | 'owl' | 'adrift';

export interface Rhythm {
  /** Hours ahead of UTC where they live. */
  zone: number;
  habit: Habit;
  /** When they usually go to bed, hours after their local midnight before it (24.5: half past midnight). */
  bed: number;
  /** Hours they usually sleep. */
  sleep: number;
  /** Busy in the day on a weekday (a job, school). */
  busy: boolean;
  /** Adrift: how many hours later each day their sleep comes round. */
  drift: number;
}

/** Where people here play from, for a name that doesn't say: hours ahead of UTC, and how many from each (most from Europe and the Americas). */
const ZONES: [number, number][] = [
  [1, 30],
  [2, 12],
  [0, 10],
  [-5, 20],
  [-6, 8],
  [-8, 10],
  [-3, 4],
  [8, 2],
  [10, 2],
];

/** The time zone a name points to, if it does: its script, or letters of a language. */
function zoneHint(name: string): number | null {
  if (/[぀-ヿ]/.test(name)) return 9; // Japanese
  if (/[가-힯]/.test(name)) return 9; // Korean
  if (/[一-鿿]/.test(name)) return 8; // Chinese
  if (/[Ѐ-ӿ]/.test(name)) return 3; // Russian
  if (/[Ạ-ỹ]/.test(name)) return 7; // Vietnamese
  if (/[ãõç]/i.test(name)) return -3; // Brazilian
  return null;
}

function pick<T>(rng: () => number, list: [T, number][]): T {
  let r = rng() * list.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[list.length - 1][0];
}

/** Someone's hours, from their name. */
export function rhythmOf(name: string): Rhythm {
  const rng = seededBy(`${name}:rhythm`);
  const drawn = pick(rng, ZONES);
  const zone = zoneHint(name) ?? drawn;
  const habit = pick<Habit>(rng, [
    ['early', 12],
    ['regular', 50],
    ['owl', 28],
    ['adrift', 10],
  ]);
  const bed = { early: 22.5, regular: 23.75, owl: 26.5, adrift: 24 }[habit] + (rng() - 0.5) * 1.5;
  const sleep = (habit === 'adrift' ? 6 : 6.5) + rng() * (habit === 'adrift' ? 5 : 2);
  // Owls mostly have days of their own; the adrift have none to keep.
  const busy = habit === 'adrift' ? false : rng() < (habit === 'owl' ? 0.45 : 0.8);
  return { zone, habit, bed, sleep, busy, drift: habit === 'adrift' ? 0.5 + rng() * 1.5 : 0 };
}

/** A night that started on local day `day` (days since 1970): when they went to bed and got up (local ms). */
export function nightOf(name: string, r: Rhythm, day: number): { from: number; to: number } {
  const rng = seededBy(`${name}:night:${day}`);
  // Friday and Saturday nights (the weekday of the evening it starts on).
  const weekday = new Date(day * DAY).getUTCDay();
  const weekend = weekday === 5 || weekday === 6;
  let bed = r.bed + (r.habit === 'adrift' ? (day * r.drift) % 24 : 0) + (rng() - 0.5) * 1.5;
  let sleep = r.sleep + (rng() - 0.5) * 1.5;
  // Up late: now and then on a weeknight, more often at the weekend; then a lie-in, if they can.
  if (rng() < (weekend ? 0.35 : 0.12)) {
    const late = 1 + rng() * 3;
    bed += late;
    if (weekend || !r.busy) sleep += late * 0.6;
  }
  // The weekend's mornings are slept in anyway.
  if (weekend && r.habit !== 'adrift') sleep += 1;
  // With work or school in the morning (any night but a Friday's or Saturday's), up in time for it: a short night.
  if (r.busy && !weekend && bed + sleep > 31.5) sleep = Math.max(4.5, 31.5 - bed);
  const from = day * DAY + bed * HOUR;
  return { from, to: from + sleep * HOUR };
}

/** Local ms (as if it were UTC) at `at` for someone `zone` hours ahead. */
const local = (at: number, zone: number) => at + zone * HOUR;

/** The night they're in at `at` (local ms), if they're asleep. */
function asleepIn(name: string, r: Rhythm, at: number) {
  const day = Math.floor(at / DAY);
  for (let d = day - 2; d <= day; d++) {
    const n = nightOf(name, r, d);
    if (at >= n.from && at < n.to) return n;
  }
  return null;
}

/**
 * How likely they are to be on at `at` (0 to 1): 0 asleep; awake, more in
 * the evening, less in a busy weekday's working hours and first thing.
 */
export function activity(name: string, at: number, r = rhythmOf(name)): number {
  const t = local(at, r.zone);
  if (asleepIn(name, r, t)) return 0;
  const hour = (t % DAY) / HOUR;
  const weekday = new Date(t).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  if (r.habit === 'adrift') return 0.8;
  // Off to bed soon: still on, less so.
  if (minutesAwake(name, at, r) < 45) return 0.5;
  if (r.busy && !weekend && hour >= 8 && hour < 17) return 0.12;
  if (hour >= 6 && hour < 12) return weekend ? 0.55 : 0.3;
  if (hour >= 12 && hour < 18) return weekend ? 0.85 : 0.6;
  return 1;
}

/** Minutes until they go to bed, from `at` (0 when asleep). */
export function minutesAwake(name: string, at: number, r = rhythmOf(name)): number {
  const t = local(at, r.zone);
  if (asleepIn(name, r, t)) return 0;
  const day = Math.floor(t / DAY);
  for (let d = day - 1; d <= day + 2; d++) {
    const n = nightOf(name, r, d);
    if (n.from > t) return (n.from - t) / 60000;
  }
  return 24 * 60;
}
