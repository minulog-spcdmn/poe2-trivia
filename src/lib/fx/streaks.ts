// Consecutive correct answers per player, as this device has seen them.
// Effects grow with a streak (and the result line mentions it). Purely
// cosmetic: a guest who joins mid-game simply starts counting from there.

const streaks = new Map<string, number>();
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
