// How a streak of correct answers shows: from three in a row a player's
// scoreboard entry burns, hotter with every answer, and blue at the top.
// The streaks themselves are counted by the host (Player.streak in
// lib/game.ts), so every screen agrees and a reload keeps them.

/** A player burns from this many in a row. */
export const ABLAZE_FROM = 3;
/** ...and the fire grows with every answer until this many. */
export const ABLAZE_FULL = 10;
/**
 * At this many in a row the fire turns blue, and stays blue while the streak
 * lasts (still growing until ABLAZE_FULL). Early enough to reach in a game to 10.
 */
export const BLUE_FROM = 7;

/**
 * Delve runs go on for dozens of depths: there the fire grows over a longer
 * streak, and only turns blue at a streak that can't come before the depth
 * where the backdrop's embers start turning blue too.
 */
export const DELVE_ABLAZE_FULL = 25;
export const DELVE_BLUE_FROM = 21;

/** A player's current streak (0 from hosts that don't count them yet). */
export function streakOf(p: { streak?: number } | undefined): number {
  return p?.streak ?? 0;
}

/**
 * How hard a streak burns: 0 below ABLAZE_FROM, then a step up with every
 * answer, from a faint 1/8 at three in a row to 1 at ABLAZE_FULL (Delve:
 * DELVE_ABLAZE_FULL).
 */
export function heatOf(streak: number, delve = false): number {
  if (streak < ABLAZE_FROM) return 0;
  const full = delve ? DELVE_ABLAZE_FULL : ABLAZE_FULL;
  return Math.min(1, (streak - ABLAZE_FROM + 1) / (full - ABLAZE_FROM + 1));
}

/** Whether a fire burning at `heat` (heatOf, with the same `delve`) burns blue. */
export function burnsBlue(heat: number, delve = false): boolean {
  return heat > 0 && heat >= heatOf(delve ? DELVE_BLUE_FROM : BLUE_FROM, delve);
}

/**
 * Today's unique (the start page): a run of days burns with the same fire,
 * lit from the very first day and growing with every day after, quickly at
 * first (the first week is when a habit is won or lost) and ever more
 * slowly, full after a year. It turns blue at a month and stays blue.
 */
export const DAILY_FULL = 365;
export const DAILY_BLUE_FROM = 30;

/** How hard a run of `days` burns, 0 to 1: a little more each day, on a log curve. */
export function dailyHeatOf(days: number): number {
  if (days < 1) return 0;
  return Math.min(1, Math.log1p(days) / Math.log1p(DAILY_FULL));
}

/** Whether a run of `days` burns blue. */
export const dailyBurnsBlue = (days: number) => days >= DAILY_BLUE_FROM;
