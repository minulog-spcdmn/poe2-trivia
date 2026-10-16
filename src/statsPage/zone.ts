// Days in the GoatCounter account's time zone: GoatCounter buckets its days
// there, so the ledger cuts its periods at that zone's midnights, not this
// browser's, and every day it asks for lines up with a day it gets back.

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

const parts = (zone: string, at: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
};

/** The day (YYYY-MM-DD) it is in `zone` at `at`. */
export function dayIn(zone: string, at: Date): string {
  const p = parts(zone, at);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
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

/**
 * The moment `day` begins in `zone`: worked out twice, for a day a clock
 * change falls on, then moved on to the day's first hour where the clocks
 * jump past midnight itself (Santiago, Havana: that day has no 00:00).
 */
export function midnight(zone: string, day: string): Date {
  const guess = Date.parse(`${day}T00:00:00Z`);
  const first = guess - offset(zone, new Date(guess)) * 60_000;
  let at = guess - offset(zone, new Date(first)) * 60_000;
  for (let i = 0; i < 4 && dayIn(zone, new Date(at)) < day; i++) at += 3_600_000;
  return new Date(at);
}
