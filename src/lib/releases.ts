// The game's releases, and which items came with the newest. A refresh
// (npm run fetch-data) stamps each item it lists for the first time with
// that run's UTC day, `added` in items.json (scripts/refresh-plan.mjs
// firstSeen), and an item keeps its day through every later refresh, a
// rename too; the items listed before the stamps began have none. So an
// item came with the newest release here when its day is on or after the
// release's: no list of items is kept by hand, only this list of days.
//
// A new league's refresh adds the league's row here first (oldest first),
// so its items count as its own, not the release before's
// (docs/development.md, "Refreshing item data").

export interface Release {
  /** As players call it: "1.0". */
  name: string;
  /** Its first day (UTC, YYYY-MM-DD): an item first listed on it or after came with it. */
  from: string;
}

export const RELEASES: readonly Release[] = [{ name: '1.0', from: '2026-12-11' }];

/** The newest release's items, of `items`: those first listed on its day or after. */
export function newestItems<T extends { added?: string }>(items: readonly T[], releases: readonly Release[] = RELEASES): T[] {
  const newest = releases.at(-1);
  return newest ? items.filter((it) => !!it.added && it.added >= newest.from) : [];
}

/**
 * What the start page's Codex line says of the newest release: its name and
 * how many items came with it, while any of them is still to meet (`met`:
 * the codex's items, by id). Null when none came with it, or all are met.
 */
export function releaseNote(items: readonly { id: string; added?: string }[], met: Readonly<Record<string, unknown>>, releases: readonly Release[] = RELEASES): { name: string; count: number } | null {
  const came = newestItems(items, releases);
  if (!came.length || came.every((it) => met[it.id])) return null;
  return { name: releases.at(-1)!.name, count: came.length };
}
