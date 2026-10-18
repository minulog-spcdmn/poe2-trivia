// Pictures loaded once and kept a while (media.svelte.ts): each asked for
// again is the same load, a failed one is tried again after a hiccup, and
// only the latest few are kept.

/**
 * How many pictures a cache keeps, the latest asked for: a few questions'
 * worth (a "find the art" question has up to ten). Kept for the whole visit,
 * every picture of every game played (decoded, where there's no worker) went
 * on adding up, on a phone short of memory as it is.
 */
export const CACHED = 40;

/** How long after a failed try the next one goes (ms). */
const RETRY_MS = 600;

/**
 * Loads `src` once into `cache`, trying again twice after a hiccup (a
 * dropped request would leave everyone without art); a load that fails for
 * good is let go, so the next ask tries afresh. The cache keeps the `keep`
 * asked for last.
 */
export function loadOnce<T>(cache: Map<string, Promise<T>>, src: string, load: (src: string) => Promise<T>, keep = CACHED, retryMs = RETRY_MS): Promise<T> {
  const had = cache.get(src);
  if (had) {
    // (Asked for again: the latest, so the last to go.)
    cache.delete(src);
    cache.set(src, had);
    return had;
  }
  const attempt = (left: number): Promise<T> =>
    load(src).catch((err) => (left > 0 ? new Promise((r) => setTimeout(r, retryMs)).then(() => attempt(left - 1)) : Promise.reject(err)));
  const p = attempt(2);
  cache.set(src, p);
  p.catch(() => cache.get(src) === p && cache.delete(src));
  for (const old of cache.keys()) {
    if (cache.size <= keep) break;
    cache.delete(old);
  }
  return p;
}
