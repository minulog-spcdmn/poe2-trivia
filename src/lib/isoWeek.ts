// ISO weeks, in UTC: the game names the week a player first played by them
// ("cohort/2026-W43", count.ts) and Analytics finds each one's Monday again
// (src/statsPage). One set of rules for both, so a week named one way is
// always read back the same, New Year's weeks too. Nothing else in here:
// the stats page can take it without the game's modules.

const DAY_MS = 86_400_000;

/** The ISO week a time falls in, UTC ("2026-W43"): the week's Thursday decides its year. */
export function isoWeek(ms: number): string {
  const d = new Date(ms);
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const year = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY_MS));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** A day's ISO week ("2026-10-21" → "2026-W43"). */
export const isoWeekOfDay = (day: string) => isoWeek(Date.parse(`${day}T12:00:00Z`));

/** The Monday an ISO week ("2026-W43") begins (YYYY-MM-DD), or null for a name that isn't one, or a week its year doesn't have. */
export function weekMonday(week: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return null;
  const year = Number(m[1]);
  // Week 1 holds January 4th.
  const jan4 = Date.UTC(year, 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS + (Number(m[2]) - 1) * 7 * DAY_MS;
  const day = new Date(monday).toISOString().slice(0, 10);
  return isoWeek(monday) === week ? day : null;
}
