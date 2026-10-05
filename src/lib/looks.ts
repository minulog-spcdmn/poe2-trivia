// Which items' art looks alike, for questions whose wrong pictures (or the
// names of items with such pictures) are picked to resemble the answer.
// The likeness comes from scripts/looks.mjs (shape, edges, colour; mirror-
// blind) and only ranks items within their own group, the pool a question
// draws its options from. Items missing from the data (added since it was
// built) have no look-alikes and fall back to the caller's order.

import data from '../data/looks.json' with { type: 'json' };

export interface Look {
  readonly id: string;
  /** In [0, 1]; 1 would be the same picture. */
  readonly score: number;
}

const table = new Map<string, readonly Look[]>(
  // JSON types its pairs as (string | number)[]: each is [id, score].
  Object.entries(data.looks).map(([id, list]) => [id, Object.freeze(list.map(([other, score]) => Object.freeze({ id: String(other), score: Number(score) })))]),
);

/** Scores by pair, either way round: an item's list only keeps its closest few, so a pair may sit in one list only. */
const pairs = new Map<string, number>();
for (const [id, list] of table) for (const look of list) pairs.set(pairKey(id, look.id), look.score);

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const NONE: readonly Look[] = Object.freeze([]);

/** The items whose art looks most like `id`'s, best first, from its own group. Empty for an unknown item. */
export function looksLike(id: string): readonly Look[] {
  return table.get(id) ?? NONE;
}

/** How alike two items' art looks, in [0, 1]; 0 when the data doesn't rank the pair (another group, or not among either's closest). */
export function lookScore(a: string, b: string): number {
  return pairs.get(pairKey(a, b)) ?? 0;
}

/**
 * Up to `n` of `candidates`, the ones that look most like the answer first.
 * The rest (pairs the data doesn't rank) keep the order they came in, so a
 * caller that wants them random shuffles `candidates` first, which also
 * varies the order among equal scores. Never returns the answer itself.
 */
export function lookalikePool<T extends { readonly id: string }>(answerId: string, candidates: readonly T[], n: number): T[] {
  // Equal (rounded) scores keep the answer's own ranking, which saw the unrounded ones.
  const rank = new Map(looksLike(answerId).map((l, i) => [l.id, i]));
  return candidates
    .filter((it) => it.id !== answerId)
    .map((it, i) => ({ it, i, score: lookScore(answerId, it.id), rank: rank.get(it.id) ?? Infinity }))
    .sort((a, b) => b.score - a.score || a.rank - b.rank || a.i - b.i)
    .slice(0, Math.max(0, n))
    .map((r) => r.it);
}
