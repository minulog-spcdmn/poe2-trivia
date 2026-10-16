// Taking turns: a run through a few things (the rune circles behind the
// questions and today's unique) that shows each once in every few,
// shuffled, and never the same one twice running, worked out from where in
// the run it is alone, so everyone at the same place sees the same one.

/** A whole number from `a` and `b`, well stirred. */
const mix = (a: number, b: number) => {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
};
/** The things of `from` in the order they come round in block `block` of a run seeded `seed`. */
const blockOf = <T>(from: T[], seed: number, block: number) => {
  const order = [...from];
  let h = mix(seed, block);
  for (let i = order.length - 1; i > 0; i--) {
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
    h = mix(h, i);
  }
  return order;
};
/**
 * The `n`th turn in a run of `from` seeded `seed`: each one once in every
 * block of as many turns as there are things, shuffled, and never the same
 * twice running.
 */
export function turnOf<T>(n: number, from: T[], seed = 0): T {
  const size = from.length;
  const block = Math.floor(n / size);
  const order = blockOf(from, seed, block);
  // (A block's first is never the last before it: swapping its first two
  // leaves its own last where it was, so each block's last is its own.)
  if (size > 2 && order[0] === blockOf(from, seed, block - 1)[size - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order[((n % size) + size) % size];
}
