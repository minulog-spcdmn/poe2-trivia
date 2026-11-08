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

const DAY_MS = 86_400_000;

/** A YYYY-MM-DD day as its UTC day number (lib/daily.ts utcDay's). */
export const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/**
 * How hard the games lean to a release's items `age` days after the first
 * of them came to the site: 1 for NEW_HALF_DAYS (half the answers one of
 * them: newBoost), easing to 0 over NEW_FADE_DAYS (as likely as any other).
 * A clock behind takes them for new.
 */
export const NEW_HALF_DAYS = 7;
export const NEW_FADE_DAYS = 21;
export function newStrength(age: number): number {
  if (age < NEW_HALF_DAYS) return 1;
  return Math.max(0, 1 - (age - NEW_HALF_DAYS) / NEW_FADE_DAYS);
}

/** The most a lean multiplies a new item's weight by: a card with fewer than one new item in thirteen asks them less than half the time (a lone new ring among 39, about a quarter). */
export const NEW_MAX_BOOST = 12;

/**
 * The share of a draw a lean at `strength` (newStrength) gives new items that
 * are `own` of it: at 1 half (the games'), or with `twice` twice their own
 * (Today's unique past its week), up to half; at 0 their own.
 */
export function newShare(own: number, strength: number, twice = false): number {
  return twice ? Math.min(0.5, own * (1 + strength)) : own + (0.5 - own) * strength;
}

/**
 * How many times an old item's weight a new one's is, for `fresh` new items
 * among `other` old ones at `strength` (newStrength): as many as make their
 * share of the weight newShare's, and never more than NEW_MAX_BOOST. Worked
 * out over the items a draw is from (a category's, a question's wrong
 * options: game.ts weightsOf), so a card with many of them asks one about
 * every other time, not nearly every time, and a card with a few as near
 * that as the cap lets it.
 */
export function newBoost(fresh: number, other: number, strength: number, twice = false): number {
  if (strength <= 0 || !fresh || !other) return 1;
  const own = fresh / (fresh + other);
  if (own >= 0.5) return 1;
  const share = newShare(own, strength, twice);
  return Math.min(NEW_MAX_BOOST, (share / (1 - share)) * (other / fresh));
}

/**
 * Delve's lean to a release's items: the full lean (newStrength's 1, half
 * the answers) for each player's first DELVE_FULL_DAYS days from their own
 * first Delve run since the items came (`own` days ago, 0 on that day), then
 * twice their share (newShare) as the games' eases, `age` days after the
 * first of them came; for anyone, nothing once the games' is over. Most
 * players come once, for a few runs, whenever they come (some after playing
 * the release's first week in the game itself): they meet as many of the
 * items as those who came on its day. The few who come back learn them in
 * about three days of play, and a lean to items they know would make their
 * runs deeper than they'll be again, bests that stand all league.
 */
export const DELVE_FULL_DAYS = 3;
export function delveLean(age: number, own: number): { strength: number; twice: boolean } {
  const strength = newStrength(age);
  if (strength <= 0) return { strength: 0, twice: false };
  return own < DELVE_FULL_DAYS ? { strength: 1, twice: false } : { strength, twice: true };
}

/**
 * A lean to a release's items: which they are, and how hard the games lean
 * to them now (newStrength; `twice`: newShare's). `delve`, Delve's in their
 * place (delveLean); without it Delve leans as the rest.
 */
export interface Lean<T> {
  isNew: (it: T) => boolean;
  strength: () => number;
  twice?: boolean;
  delve?: () => { strength: number; twice: boolean };
}

/** The newest release's items' ids, and the UTC day the first of them came (null with none). */
export function newestCame<T extends { id: string; added?: string }>(items: readonly T[], releases: readonly Release[] = RELEASES): { ids: ReadonlySet<string>; first: number } | null {
  const came = newestItems(items, releases);
  if (!came.length) return null;
  return { ids: new Set(came.map((it) => it.id)), first: Math.min(...came.map((it) => dayNumber(it.added!))) };
}

/** The newest release's name while any of its items are among `items` (null with none): what a player's first Delve run since they came is kept under (delveRecord.ts `since`). */
export function newestRelease(items: readonly { id: string; added?: string }[], releases: readonly Release[] = RELEASES): string | null {
  return newestItems(items, releases).length ? releases.at(-1)!.name : null;
}

/**
 * The games' lean to the newest release's items, among `items`, by the clock
 * `now` (ms); undefined with none. With `firstDelve` (when this player's
 * first Delve run since a release's items came was, ms, by its name; null
 * for none yet), Delve's own (delveLean).
 */
export function newestLean<T extends { id: string; added?: string }>(
  items: readonly T[],
  now: () => number = Date.now,
  firstDelve?: (release: string) => number | null,
): Lean<T> | undefined {
  const came = newestCame(items);
  if (!came) return undefined;
  const today = () => Math.floor(now() / DAY_MS);
  const name = RELEASES.at(-1)!.name;
  const delve = () => {
    const day = today();
    const first = firstDelve!(name);
    // None yet: this run is their first. One noted before the items came counts from their first day.
    return delveLean(day - came.first, first === null ? 0 : day - Math.max(came.first, Math.floor(first / DAY_MS)));
  };
  return { isNew: (it) => came.ids.has(it.id), strength: () => newStrength(today() - came.first), ...(firstDelve && { delve }) };
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
