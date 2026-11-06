// Path of Exile 2's full release (1.0), as Grinding Gear Games announced it,
// and how long until then: the hourglass at the top of the start page and in
// the header (LaunchCountdown.svelte). GGG gave the day in Pacific time
// ("December 11 (PST)", in their forum post and on Steam), December 12 in
// Japan's (their Japanese post), and no hour yet. The days go by the
// player's own calendar: until the hour is named, to the first day the launch
// can fall on there (by those two posts), never a guessed hour; once it is,
// `LAUNCH_AT` takes it, and the last two days count down in hours, the last
// two hours in minutes, the last two minutes in seconds. A week after the
// launch it goes.

/** The day, Pacific time. */
export const LAUNCH_DAY = '2026-12-11';
/**
 * While the hour isn't named, the moments it can be between, by GGG's own
 * posts: December 11 in Pacific time, December 12 in Japan's, so from 07:00
 * that day in Pacific time (Japan's midnight) to its end.
 */
export const LAUNCH_WINDOW = { from: Date.parse('2026-12-12T00:00:00+09:00'), to: Date.parse('2026-12-12T00:00:00-08:00') };
/** The moment (ms since 1970), once GGG names the hour; null until they do. Write it with its zone, December's Pacific being -08:00: `Date.parse('2026-12-11T12:00:00-08:00')` (tests/launch.test.ts holds it inside `LAUNCH_WINDOW`). */
export const LAUNCH_AT: number | null = null;
/** The day GGG announced it (their forum post of August 25, 2026): the hourglass's sand runs from here to the launch. */
export const ANNOUNCED_DAY = '2026-08-25';
/** GGG's announcement, which a click on the counter opens. */
export const LAUNCH_SOURCE = 'https://www.pathofexile.com/forum/view-thread/3999366';
/** After the launch, the counter says it's out for this long, then goes. */
export const OUT_FOR_DAYS = 7;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** What the counter says. `left`: the time to go, while the hour is known. */
export type Countdown =
  | { kind: 'days'; days: number }
  | { kind: 'tomorrow' }
  | { kind: 'today' }
  | { kind: 'left'; ms: number }
  | { kind: 'out' };

const dates = new Map<string, Intl.DateTimeFormat>();

/** The calendar day it is at `t` in a time zone (the device's own when none is named), as days since 1970. */
export function dayIn(t: number, zone?: string): number {
  // (The device's zone looked up each time: it changes when the device travels, and a formatter keeps the one it was made in.)
  zone ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
  let f = dates.get(zone);
  if (!f) dates.set(zone, (f = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' })));
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day) / DAY;
}

const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

/**
 * What the counter says at `now`, or null once it's long out; the days by
 * the player's own calendar (`zone`, the device's). With no hour, the days to
 * the first day the launch can fall on there (December 11 in California and
 * Berlin, the 12th in Tokyo), then tomorrow and today, and out once it can't
 * still be to come (the end of December 11, Pacific time). With the hour, the
 * days to its day while two or more are left, then the time left; out from
 * the moment itself. Naming the hour changes no count where the window's
 * first moment and the hour fall on the same day (the Americas, Europe, Japan
 * and on east for an afternoon hour in California).
 */
export function countdown(now: number, at = LAUNCH_AT, zone?: string, window = LAUNCH_WINDOW): Countdown | null {
  if (at !== null) {
    const ms = at - now;
    if (ms <= 0) return now - at < OUT_FOR_DAYS * DAY ? { kind: 'out' } : null;
    return ms >= 2 * DAY ? { kind: 'days', days: dayIn(at, zone) - dayIn(now, zone) } : { kind: 'left', ms };
  }
  if (now >= window.to) return now - window.to < OUT_FOR_DAYS * DAY ? { kind: 'out' } : null;
  const days = dayIn(window.from, zone) - dayIn(now, zone);
  return days >= 2 ? { kind: 'days', days } : days === 1 ? { kind: 'tomorrow' } : { kind: 'today' };
}

/**
 * The words under the hourglass: a number and what it counts (`days until`),
 * or none (`launches today`, `is out`). The time left in hours while two or
 * more are left, then in minutes while two or more are, then in seconds (so
 * never "1 hour" with nearly two to go), the seconds rounded up first, so it
 * never says 0 before the moment.
 */
export function figure(c: Countdown): { n: number | null; until: string } {
  const of = (n: number, unit: string) => ({ n, until: `${unit}${n === 1 ? '' : 's'} until` });
  switch (c.kind) {
    case 'days':
      return of(c.days, 'day');
    case 'tomorrow':
      return of(1, 'day');
    case 'left': {
      const s = Math.ceil(c.ms / 1000);
      return s >= 2 * 3600 ? of(Math.floor(s / 3600), 'hour') : s >= 2 * 60 ? of(Math.floor(s / 60), 'minute') : of(s, 'second');
    }
    case 'today':
      return { n: null, until: 'launches today' };
    case 'out':
      return { n: null, until: 'is out' };
  }
}

/**
 * How far the Shadow has come out of the hourglass's shadow, 0 to 1: across
 * the last day, by the hour, once GGG has named it (looked at again as often
 * as the figure changes); with the day alone known, partly the day before,
 * most of the way on the day; wholly from the launch.
 */
export function dawn(c: Countdown): number {
  switch (c.kind) {
    case 'days':
      return 0;
    case 'tomorrow':
      return 0.35;
    case 'today':
      return 0.85;
    case 'left':
      return Math.max(0, 1 - c.ms / DAY);
    case 'out':
      return 1;
  }
}

/**
 * How far it has come from the announcement to the launch, 0 to 1: by the
 * player's calendar while the day alone is known (to the day the counter
 * counts to), then by the clock (from the announced day's midnight in
 * California).
 */
export function progress(now: number, at = LAUNCH_AT, zone?: string, from = ANNOUNCED_DAY, window = LAUNCH_WINDOW): number {
  const share =
    at === null
      ? (dayIn(now, zone) - dayOf(from)) / (dayIn(window.from, zone) - dayOf(from))
      : (now - Date.parse(`${from}T07:00:00Z`)) / (at - Date.parse(`${from}T07:00:00Z`));
  return Math.max(0, Math.min(1, share));
}

/**
 * How long until what the counter says next changes, give or take a few ms:
 * in the last two days just past the figure's next step (the next whole hour
 * left, then minute, then second, as `figure` counts them), else just past
 * each minute of the clock (a day's turn falls on one, in any time zone).
 */
export function untilChange(now: number, at = LAUNCH_AT): number {
  const ms = at === null ? 0 : at - now;
  if (ms > 0 && ms < 2 * DAY) {
    const s = Math.ceil(ms / 1000);
    const unit = s >= 2 * 3600 ? 3600 : s >= 2 * 60 ? 60 : 1;
    // It steps down once the seconds left, rounded up, fall under the figure's whole units.
    return ms - (Math.floor(s / unit) * unit - 1) * 1000 + 20;
  }
  return MINUTE - (((now % MINUTE) + MINUTE) % MINUTE) + 20;
}

/**
 * The launch in words, for the counter's note: the day in Pacific time, or
 * with the hour, the moment in the player's own zone. In the site's English,
 * the hour as the player's clock shows one (14:00 or 2:00 pm).
 */
export function launchWhen(day = LAUNCH_DAY, at = LAUNCH_AT): string {
  const date = { weekday: 'long', month: 'long', day: 'numeric' } as const;
  if (at === null) return `${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { ...date, timeZone: 'UTC' })} (Pacific time)`;
  const { hourCycle } = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
  const d = new Date(at);
  return `${d.toLocaleDateString('en-GB', date)} at ${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle })}, your time`;
}
