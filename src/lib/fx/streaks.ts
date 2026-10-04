// Consecutive correct answers per player, as this device has seen them.
// Effects grow with a streak: from three in a row a player's scoreboard
// entry burns, hotter with every answer (and the result line mentions it).
// Purely cosmetic: a guest who joins mid-game simply starts counting from there.

import { SvelteMap } from 'svelte/reactivity';

const streaks = new SvelteMap<string, number>();
const counted = new Set<number>();

/** Clears all streaks (a new game). */
export function resetStreaks() {
  streaks.clear();
  counted.clear();
}

/**
 * Records one revealed question (once per `askedAt`, however often the
 * reveal re-renders): `scorer` got it right; everyone in `missed` got it
 * wrong. Returns the scorer's streak.
 */
export function recordReveal(askedAt: number, scorer: string | null, missed: string[]): number {
  if (!counted.has(askedAt)) {
    counted.add(askedAt);
    for (const id of missed) streaks.set(id, 0);
    if (scorer) streaks.set(scorer, (streaks.get(scorer) ?? 0) + 1);
  }
  return scorer ? (streaks.get(scorer) ?? 0) : 0;
}

/** A player's current streak (reactive). */
export function streakOf(id: string): number {
  return streaks.get(id) ?? 0;
}

/** A player burns from this many in a row. */
export const ABLAZE_FROM = 3;
/** ...and the fire is at its biggest from this many. */
export const ABLAZE_FULL = 8;

/** How hard a streak burns: 0 below ABLAZE_FROM, then rising to 1 at ABLAZE_FULL. */
export function heatOf(streak: number): number {
  if (streak < ABLAZE_FROM) return 0;
  return Math.min(1, (streak - ABLAZE_FROM + 1) / (ABLAZE_FULL - ABLAZE_FROM + 1));
}
