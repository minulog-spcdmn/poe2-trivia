// Days in the GoatCounter account's time zone: GoatCounter gives its days
// there (at the offset the zone has when asked, which onClock puts right), so
// Analytics cuts its periods at that zone's midnights, not this browser's,
// and every day it asks for lines up with a day it gets back.

/** The IANA zone in GoatCounter's setting ("DE.Europe/Berlin": country, a dot, the zone), or UTC when it isn't one this browser knows. */
export function zoneOf(setting: string | undefined | null): string {
  const zone = (setting ?? '').slice((setting ?? '').indexOf('.') + 1) || 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

const HOUR = 3_600_000;

/** One formatter a zone: making one costs far more than using it, and a read works out tens of thousands of times. */
const formatters = new Map<string, Intl.DateTimeFormat>();
const parts = (zone: string, at: Date) => {
  let f = formatters.get(zone);
  if (!f) formatters.set(zone, (f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })));
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
};

/** The day (YYYY-MM-DD) it is in `zone` at `at`. */
export function dayIn(zone: string, at: Date): string {
  const p = parts(zone, at);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/**
 * The hours `today` (in `zone`) has had by `at`, a part of the one it's in
 * too: by the clock there, as a day's 24 hours are once on the clock
 * (onClock), so on the day the clocks change it's the hour on the clock,
 * not the time gone since midnight. 0 before the day, 24 after it.
 */
export function hoursIn(zone: string, today: string, at: Date): number {
  const day = dayIn(zone, at);
  if (day !== today) return day < today ? 0 : 24;
  const p = parts(zone, at);
  return p.h + p.min / 60 + (at.getUTCSeconds() + at.getUTCMilliseconds() / 1000) / 3600;
}

/** `day` moved by `n` days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** How far `zone` is ahead of UTC at `at`, in minutes. */
function offset(zone: string, at: Date): number {
  const p = parts(zone, at);
  return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000;
}

const midnights = new Map<string, number>();
/**
 * The moment `day` begins in `zone`: worked out twice, for a day a clock
 * change falls on, then moved on to the day's first hour where the clocks
 * jump past midnight itself (Santiago, Havana: that day has no 00:00).
 * Kept, as a read asks it for every path's every day.
 */
export function midnight(zone: string, day: string): Date {
  const key = `${zone}|${day}`;
  let at = midnights.get(key);
  if (at === undefined) {
    const guess = Date.parse(`${day}T00:00:00Z`);
    const first = guess - offset(zone, new Date(guess)) * 60_000;
    at = guess - offset(zone, new Date(first)) * 60_000;
    for (let i = 0; i < 4 && dayIn(zone, new Date(at)) < day; i++) at += HOUR;
    midnights.set(key, at);
  }
  return new Date(at);
}

const starts = new Map<string, number[]>();
/**
 * When each hour on the clock of `day` begins in `zone` (ms), and at 24 the
 * next day's midnight. On the night the clocks go back, 02:00 from when it
 * first shows (it lasts two hours); one they jump past, from the hour after
 * it (it lasts none).
 */
export function hourStarts(zone: string, day: string): number[] {
  const key = `${zone}|${day}`;
  let s = starts.get(key);
  if (s) return s;
  const from = midnight(zone, day).getTime();
  const to = midnight(zone, addDays(day, 1)).getTime();
  s = Array.from({ length: 25 }, (_, h) => (h === 24 ? to : from + h * HOUR));
  if (to - from !== 24 * HOUR) {
    const seen = Array<number>(24).fill(NaN);
    for (let t = from; t < to; t += HOUR) {
      const h = parts(zone, new Date(t)).h;
      if (Number.isNaN(seen[h])) seen[h] = t;
    }
    for (let h = 23; h >= 0; h--) s[h] = Number.isNaN(seen[h]) ? s[h + 1] : seen[h];
  }
  starts.set(key, s);
  return s;
}

const shifts = new Map<string, number[]>();
/** How far each hour of GoatCounter's `day` (labelled at `asked`, the zone's offset when it was asked) is from the clock then, in minutes. */
function shiftOf(zone: string, asked: number, day: string): number[] {
  const key = `${zone}|${asked}|${day}`;
  let s = shifts.get(key);
  if (s) return s;
  const first = Date.parse(`${day}T00:00:00Z`) - asked * 60_000;
  const at = (h: number) => offset(zone, new Date(first + h * HOUR)) - asked;
  const a = at(0);
  // A clock change inside the day: each hour on its own; else all of them alike.
  s = a === at(23) ? Array<number>(24).fill(a) : Array.from({ length: 24 }, (_, h) => at(h));
  shifts.set(key, s);
  return s;
}

/**
 * GoatCounter's hours of each day (YYYY-MM-DD: its 24) put onto `zone`'s
 * clock, with each day's count from them. It labels every hour it kept
 * with the zone's offset as it is when asked (`at`), one for all days, so a
 * day across a clock change from then sits an hour off its own midnight
 * (and an hour of it comes as a day of its own, in front of the span or
 * after it). Its hour h of a day is the UTC hour of the day's 00:00, plus
 * h, less that offset: here it goes to the day and hour it was on the clock
 * then, the doubled hour of the night the clocks go back added up, the one
 * they skip left empty. Then every day starts at its midnight, as the
 * page's periods do, and its hours are the clock's, as hoursIn's are.
 */
export function onClock(hours: Record<string, number[]>, zone: string, at: Date): { days: Record<string, number>; hours: Record<string, number[]> } {
  const asked = offset(zone, at);
  const out: Record<string, number[]> = {};
  for (const [day, cells] of Object.entries(hours)) {
    out[day] ??= Array<number>(24).fill(0);
    const shift = shiftOf(zone, asked, day);
    cells.forEach((n, h) => {
      if (!n) return;
      const k = Math.floor((h * 60 + shift[h]) / 60);
      const d = k < 0 ? addDays(day, -1) : k >= 24 ? addDays(day, 1) : day;
      (out[d] ??= Array<number>(24).fill(0))[(k + 24) % 24] += n;
    });
  }
  return { days: Object.fromEntries(Object.entries(out).map(([d, hs]) => [d, hs.reduce((a, b) => a + b, 0)])), hours: out };
}
