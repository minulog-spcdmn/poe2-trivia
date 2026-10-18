// Where the rune circles' plates come from (src/lib/plates), as worked out
// in plateStore.svelte.ts, with the worker, the browser's cache and the page
// handed in (so the tests can hand in their own). A plate is kept for the
// visit; kept in the cache under this build of the plates (`version`), so a
// returning device builds none until they change; and otherwise built by
// the worker, or on the page where the worker can't. A cached plate that
// won't read is thrown away and built again. Plates of other builds are
// cleared out of the cache once they have lain a week unused, so a tab left
// open from before a deploy and one opened after never clear out each
// other's.

import type { PlateKey } from './plates/index.ts';

/** Builds a plate as JSON away from the page; null if it can't. */
export type PlateBuilder = (name: PlateKey) => Promise<string | null>;

export type PlateCacheDeps = {
  /** This build of the plates; undefined: nothing is kept between visits. */
  version: string | undefined;
  /** The browser's cache, opened (null where there is none). */
  open: () => Promise<Cache | null>;
  /** The worker. */
  worker: PlateBuilder;
  /** The page, where the worker can't. */
  page: (name: PlateKey) => Promise<unknown>;
  /** Now, in ms (for how long a plate of another build has lain). */
  now?: () => number;
};

/** How long a plate of another build lies in the cache before it's cleared out (ms). */
export const STALE_MS = 7 * 24 * 3600 * 1000;
const STORED = 'x-plate-stored';

export function plateCache({ version, open, worker, page, now = Date.now }: PlateCacheDeps) {
  const ready = new Map<PlateKey, unknown>();
  const coming = new Map<PlateKey, Promise<unknown>>();
  const keyOf = (name: PlateKey) => `https://plates.invalid/${version}/${name}.json`;

  let opened: Promise<Cache | null> | undefined;
  /** The cache, its plates of other builds that have lain a week cleared out; null where there's none. */
  const cache = () =>
    (opened ??= (async () => {
      if (!version) return null;
      try {
        const c = await open();
        if (!c) return null;
        for (const req of await c.keys()) {
          if (req.url.startsWith(`https://plates.invalid/${version}/`)) continue;
          const stored = Number((await c.match(req))?.headers.get(STORED));
          if (!(now() - stored < STALE_MS)) void c.delete(req);
        }
        return c;
      } catch {
        return null;
      }
    })());

  async function fromCache(name: PlateKey): Promise<string | null> {
    try {
      const hit = await (await cache())?.match(keyOf(name));
      return hit ? await hit.text() : null;
    } catch {
      return null;
    }
  }
  async function toCache(name: PlateKey, json: string) {
    try {
      await (await cache())?.put(keyOf(name), new Response(json, { headers: { 'content-type': 'application/json', [STORED]: String(now()) } }));
    } catch {
      // (No room, or no cache: built again next time.)
    }
  }
  async function forget(name: PlateKey) {
    try {
      await (await cache())?.delete(keyOf(name));
    } catch {
      // (Built again next time regardless.)
    }
  }
  /** The plate `name` from the cache, if it's there and reads. */
  async function cached(name: PlateKey): Promise<unknown> {
    const json = await fromCache(name);
    if (json === null) return undefined;
    try {
      return JSON.parse(json);
    } catch {
      await forget(name);
      return undefined;
    }
  }
  /** The plate `name` built afresh (by the worker, or on the page), and kept in the cache. */
  async function built(name: PlateKey): Promise<unknown> {
    const json = (await worker(name)) ?? JSON.stringify(await page(name));
    void toCache(name, json);
    return JSON.parse(json);
  }

  return {
    /** The plate `name` if it's at hand already, else undefined. */
    plateOf: (name: PlateKey) => ready.get(name),
    /** The plate `name`: kept, cached, or built. */
    load(name: PlateKey): Promise<unknown> {
      if (ready.has(name)) return Promise.resolve(ready.get(name));
      let p = coming.get(name);
      if (!p) {
        p = (async () => {
          const plate = (await cached(name)) ?? (await built(name));
          ready.set(name, plate);
          return plate;
        })();
        coming.set(name, p);
        // (One that failed may be asked for again.)
        p.catch(() => coming.delete(name));
      }
      return p;
    },
  };
}
