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

/** A player's current streak (0 from hosts that don't count them yet). */
export function streakOf(p: { streak?: number } | undefined): number {
  return p?.streak ?? 0;
}

/**
 * How hard a streak burns: 0 below ABLAZE_FROM, then a step up with every
 * answer, from a faint 1/8 at three in a row to 1 at ABLAZE_FULL.
 */
export function heatOf(streak: number): number {
  if (streak < ABLAZE_FROM) return 0;
  return Math.min(1, (streak - ABLAZE_FROM + 1) / (ABLAZE_FULL - ABLAZE_FROM + 1));
}

/** Whether a fire burning at `heat` (heatOf) burns blue. */
export function burnsBlue(heat: number): boolean {
  return heat > 0 && heat >= heatOf(BLUE_FROM);
}
