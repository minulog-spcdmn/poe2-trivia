// Ranking many numbers fast: a veiled patch's pixels by when each burns in
// (materialize.ts), tens of thousands at once as the patch arrives, where a
// sort with a comparison function took tens of ms.

const BITS = 11;
const BUCKETS = 1 << BITS;

/**
 * The indices of `keys` in ascending order of their values, equal ones in
 * their own order: the same as sorting the indices by `keys[a] - keys[b]`
 * (but -0 before 0). A radix sort, three passes over the floats' bits.
 */
export function rankAscending(keys: Float32Array): Uint32Array {
  const n = keys.length;
  // Each float's bits, turned so they order as the floats do: a positive's
  // with its sign bit set, a negative's all flipped.
  const bits = new Uint32Array(keys.buffer, keys.byteOffset, n);
  let key = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const b = bits[i];
    key[i] = b & 0x80000000 ? ~b >>> 0 : (b | 0x80000000) >>> 0;
  }
  let idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  let key2 = new Uint32Array(n);
  let idx2 = new Uint32Array(n);
  const count = new Uint32Array(BUCKETS);
  for (let shift = 0; shift < 32; shift += BITS) {
    count.fill(0);
    for (let i = 0; i < n; i++) count[(key[i] >>> shift) & (BUCKETS - 1)]++;
    for (let d = 0, at = 0; d < BUCKETS; d++) {
      const c = count[d];
      count[d] = at;
      at += c;
    }
    for (let i = 0; i < n; i++) {
      const at = count[(key[i] >>> shift) & (BUCKETS - 1)]++;
      key2[at] = key[i];
      idx2[at] = idx[i];
    }
    [key, key2] = [key2, key];
    [idx, idx2] = [idx2, idx];
  }
  return idx;
}
