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
 * slowly, full after a year.
 */
export const DAILY_FULL = 365;

/** How hard a run of `days` burns, 0 to 1: a little more each day, on a log curve. */
export function dailyHeatOf(days: number): number {
  if (days < 1) return 0;
  return Math.min(1, Math.log1p(days) / Math.log1p(DAILY_FULL));
}

/** One step of the daily fire's colours: from which day, and how it burns. */
export interface DailyFlame {
  from: number;
  name: string;
  /** The game's blue fire (as at seven in a row), rather than its orange or a tint. */
  blue: boolean;
  /** A colour of its own (lib/fx/effects fire), as linear RGB 0 to 1. */
  tint?: [number, number, number];
  /** The badge's colour, as CSS "r, g, b". */
  css: string;
}

/**
 * The fire changes colour at each milestone, starting as the game's does
 * (orange, then blue at seven: BLUE_FROM) and ending, after a year, in gold.
 */
export const DAILY_LADDER: readonly DailyFlame[] = [
  { from: 1, name: 'orange', blue: false, css: '255, 110, 30' },
  { from: BLUE_FROM, name: 'blue', blue: true, css: '70, 140, 255' },
  { from: 14, name: 'ice', blue: false, tint: [0.62, 0.95, 1.0], css: '158, 242, 255' },
  { from: 30, name: 'chaos', blue: false, tint: [0.42, 1.0, 0.36], css: '107, 255, 92' },
  { from: 60, name: 'violet', blue: false, tint: [0.62, 0.36, 1.0], css: '158, 92, 255' },
  { from: 100, name: 'crimson', blue: false, tint: [1.0, 0.16, 0.2], css: '255, 41, 51' },
  { from: DAILY_FULL, name: 'gold', blue: false, tint: [1.0, 0.88, 0.52], css: '255, 224, 133' },
];

/** The colour a run of `days` burns in (the first step for no run at all). */
export function dailyFlameOf(days: number): DailyFlame {
  let flame = DAILY_LADDER[0];
  for (const f of DAILY_LADDER) if (days >= f.from) flame = f;
  return flame;
}
