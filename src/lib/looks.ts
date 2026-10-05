// Which items' art looks alike, for questions whose wrong pictures (or the
// names of items with such pictures) are picked to resemble the answer.
// The likeness comes from scripts/looks.mjs (shape, edges, colour; mirror-
// blind) and only ranks items within their own group, the pool a question
// draws its options from. Items missing from the data (added since it was
// built) have no look-alikes and fall back to the caller's order.
//
// The table is only wanted deep in Delve, and only by whoever builds the
// questions, so it isn't bundled with the game: loadLooks() fetches it when a
// run gets near, and readLooks() reads a copy at hand (tests, scripts).

export interface Look {
  readonly id: string;
  /** In [0, 1]; 1 would be the same picture. */
  readonly score: number;
}

/** src/data/looks.json: each item's closest look-alikes, as [id, score] pairs. */
export interface LooksData {
  readonly looks: Readonly<Record<string, readonly (readonly (string | number)[])[]>>;
}

/** The look-alike table, read. */
export interface Looks {
  /** The items whose art looks most like `id`'s, best first, from its own group. Empty for an unknown item. */
  looksLike(id: string): readonly Look[];
  /** How alike two items' art looks, in [0, 1]; 0 when the data doesn't rank the pair (another group, or not among either's closest). */
  lookScore(a: string, b: string): number;
  /**
   * Up to `n` of `candidates`, the ones that look most like the answer first.
   * The rest (pairs the data doesn't rank) keep the order they came in, so a
   * caller that wants them random shuffles `candidates` first, which also
   * varies the order among equal scores. Never returns the answer itself.
   */
  lookalikePool<T extends { readonly id: string }>(answerId: string, candidates: readonly T[], n: number): T[];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const NONE: readonly Look[] = Object.freeze([]);

/** Reads the look-alike table. Its functions stand alone, so they can be taken out of it. */
export function readLooks(data: LooksData): Looks {
  const table = new Map<string, readonly Look[]>(
    Object.entries(data.looks).map(([id, list]) => [id, Object.freeze(list.map(([other, score]) => Object.freeze({ id: String(other), score: Number(score) })))]),
  );

  /** Scores by pair, either way round: an item's list only keeps its closest few, so a pair may sit in one list only. */
  const pairs = new Map<string, number>();
  for (const [id, list] of table) for (const look of list) pairs.set(pairKey(id, look.id), look.score);

  const looksLike = (id: string) => table.get(id) ?? NONE;
  const lookScore = (a: string, b: string) => pairs.get(pairKey(a, b)) ?? 0;
  function lookalikePool<T extends { readonly id: string }>(answerId: string, candidates: readonly T[], n: number): T[] {
    // Equal (rounded) scores keep the answer's own ranking, which saw the unrounded ones.
    const rank = new Map(looksLike(answerId).map((l, i) => [l.id, i]));
    return candidates
      .filter((it) => it.id !== answerId)
      .map((it, i) => ({ it, i, score: lookScore(answerId, it.id), rank: rank.get(it.id) ?? Infinity }))
      .sort((a, b) => b.score - a.score || a.rank - b.rank || a.i - b.i)
      .slice(0, Math.max(0, n))
      .map((r) => r.it);
  }
  return { looksLike, lookScore, lookalikePool };
}

let loading: Promise<Looks> | null = null;

/**
 * The table from src/data/looks.json, fetched once (its own chunk, about
 * 26 KiB gzipped). A failed fetch (offline) is forgotten, so a later call
 * tries again.
 */
export function loadLooks(): Promise<Looks> {
  loading ??= import('../data/looks.json', { with: { type: 'json' } }).then(
    (m) => readLooks(m.default as LooksData),
    (err: unknown) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}
