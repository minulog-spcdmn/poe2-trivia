// Where the rune circles' plates come from (src/lib/plates), as plateCache.ts
// works it out: kept for the visit, kept in the browser's cache for the
// next under this build of them (VITE_PLATES_VERSION, vite.config.ts; the
// dev server keeps none), and otherwise built in a worker (plateWorker.ts),
// so the page's main thread, busy enough with the effects, never works one
// out; where no worker can run, or one fails, on the page.

import { BETA } from './channel.ts';
import { plateCache } from './plateCache.ts';
import { PLATES, type PlateName } from './plates/index.ts';
import type { PlateAnswer, PlateJob } from './plateWorker';

const env = (import.meta as ImportMeta & { env?: { VITE_PLATES_VERSION?: string; DEV?: boolean } }).env;

// ---- the worker ----------------------------------------------------------------

let worker: Worker | null | undefined;
/** Plates asked of the worker and not yet answered (resolved with null where it failed). */
const asked = new Map<PlateName, ((json: string | null) => void)[]>();
const answer = (name: PlateName, json: string | null) => {
  for (const done of asked.get(name) ?? []) done(json);
  asked.delete(name);
};
/** The worker, started on first use; null where it can't run, or once it has failed. */
function plateWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./plateWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return (worker = null);
  }
  worker.onmessage = ({ data }: MessageEvent<PlateAnswer>) => answer(data.name, data.json ?? null);
  // (A worker that can't start or load is let go, and everything asked of it is built on the page.)
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    for (const name of [...asked.keys()]) answer(name, null);
  };
  return worker;
}
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

// ---- the store -----------------------------------------------------------------

const store = plateCache({
  version: env?.DEV ? undefined : env?.VITE_PLATES_VERSION,
  // (The beta keeps its own: it shares the live site's origin.)
  open: async () => (typeof caches === 'undefined' ? null : caches.open(BETA ? 'plates-beta' : 'plates')),
  worker: fromWorker,
  page: (name) => PLATES[name](),
});

/** The plate `name` if it's at hand already, else undefined. */
export const plateOf = (name: PlateName) => store.plateOf(name);
/** The plate `name`: kept, cached, or built (in the worker, or failing that on the page). */
export const loadPlate = (name: PlateName) => store.load(name);
/** Has the plate `name` built ahead of its showing (a failure shows when it's needed). */
export const warmPlate = (name: PlateName) => void store.load(name).catch(() => {});

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
