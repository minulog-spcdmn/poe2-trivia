// Where the rune circles' plates come from (src/lib/plates). Each is built
// in a worker (plateWorker.ts), so the page's main thread, busy enough with
// the effects, never works one out; kept for the visit, and in the
// browser's cache for the next, under this build of them (VITE_PLATES_VERSION,
// vite.config.ts), so a returning player's device builds none at all until
// they change. Where no worker can run, or one fails, a plate is built on the
// page instead.

import { BETA } from './channel.ts';
import { PLATES, type PlateName } from './plates/index.ts';
import type { PlateAnswer, PlateJob } from './plateWorker';

const ready = new Map<PlateName, unknown>();
const coming = new Map<PlateName, Promise<unknown>>();

/** The plate `name` if it's at hand already, else undefined. */
export const plateOf = (name: PlateName) => ready.get(name);

/** The plate `name`: kept, cached, or built (in the worker, or failing that on the page). */
export function loadPlate(name: PlateName): Promise<unknown> {
  if (ready.has(name)) return Promise.resolve(ready.get(name));
  let p = coming.get(name);
  if (!p) {
    p = (async () => {
      let json = await fromCache(name);
      if (json === null) {
        json = (await fromWorker(name)) ?? JSON.stringify(await PLATES[name]());
        void toCache(name, json);
      }
      const plate = JSON.parse(json);
      ready.set(name, plate);
      return plate;
    })();
    coming.set(name, p);
    // (One that failed may be asked for again.)
    p.catch(() => coming.delete(name));
  }
  return p;
}

/**
 * The plate `name` for a circle as it mounts: `value` is the plate once
 * it's at hand (at once, if it was already), so the circle is put on the
 * page then.
 */
export function usePlate<T>(name: PlateName): { readonly value: T | undefined } {
  let value = $state.raw(plateOf(name) as T | undefined);
  if (value === undefined) loadPlate(name).then((p) => (value = p as T), (e) => console.error(`plate ${name}:`, e));
  return {
    get value() {
      return value;
    },
  };
}

// ---- the worker ----------------------------------------------------------------

let worker: Worker | null | undefined;
/** Plates asked of the worker and not yet answered (resolved with null where it failed). */
const asked = new Map<PlateName, ((json: string | null) => void)[]>();

/** The worker, started on first use; null where it can't run. */
function plateWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./plateWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return (worker = null);
  }
  worker.onmessage = ({ data }: MessageEvent<PlateAnswer>) => answer(data.name, data.json ?? null);
  // (A worker that can't start or load answers nothing: everything asked of it is built on the page.)
  worker.onerror = () => {
    worker = null;
    for (const name of [...asked.keys()]) answer(name, null);
  };
  return worker;
}
const answer = (name: PlateName, json: string | null) => {
  for (const done of asked.get(name) ?? []) done(json);
  asked.delete(name);
};
/** The plate `name` as JSON from the worker, or null if it couldn't build it. */
function fromWorker(name: PlateName): Promise<string | null> {
  const w = plateWorker();
  if (!w) return Promise.resolve(null);
  return new Promise((resolve) => {
    const waiting = asked.get(name);
    if (waiting) waiting.push(resolve);
    else {
      asked.set(name, [resolve]);
      w.postMessage({ name } satisfies PlateJob);
    }
  });
}

// ---- the cache -----------------------------------------------------------------

const VERSION: string | undefined = import.meta.env.VITE_PLATES_VERSION;
/** The beta keeps its own (it shares the live site's origin). */
const CACHE = BETA ? 'plates-beta' : 'plates';
const keyOf = (name: PlateName) => new URL(`/__plates/${VERSION}/${name}.json`, location.origin).href;
/** The cache, once its plates from other builds are cleared out; null where there is none (dev, an insecure page, no room). */
let opened: Promise<Cache | null> | undefined;
const plateCache = () =>
  (opened ??= (async () => {
    if (import.meta.env.DEV || !VERSION || typeof caches === 'undefined') return null;
    try {
      const cache = await caches.open(CACHE);
      for (const req of await cache.keys()) if (!req.url.includes(`/__plates/${VERSION}/`)) void cache.delete(req);
      return cache;
    } catch {
      return null;
    }
  })());
async function fromCache(name: PlateName): Promise<string | null> {
  try {
    const hit = await (await plateCache())?.match(keyOf(name));
    return hit ? await hit.text() : null;
  } catch {
    return null;
  }
}
async function toCache(name: PlateName, json: string) {
  try {
    await (await plateCache())?.put(keyOf(name), new Response(json, { headers: { 'content-type': 'application/json' } }));
  } catch {
    // (No room, or no cache: built again next time.)
  }
}
