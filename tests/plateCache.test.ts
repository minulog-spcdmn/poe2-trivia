import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateCache, STALE_MS } from '../src/lib/plateCache.ts';
import type { PlateName } from '../src/lib/plates/index.ts';

/** The browser's cache, as far as the store uses it: keys, match, put, delete. */
class FakeCache {
  entries = new Map<string, { body: string; headers: Headers }>();
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }) as Request);
  }
  async match(key: string | Request) {
    const e = this.entries.get(typeof key === 'string' ? key : key.url);
    return e ? new Response(e.body, { headers: e.headers }) : undefined;
  }
  async put(key: string, res: Response) {
    this.entries.set(key, { body: await res.text(), headers: res.headers });
  }
  async delete(key: string | Request) {
    return this.entries.delete(typeof key === 'string' ? key : key.url);
  }
}

const PLATE = { layers: ['a plate'] };
/** A store over `cache`, counting what it builds where. */
const storeOf = (cache: FakeCache | null, { version = 'v1', worker = true, now = 0 } = {}) => {
  const built = { worker: 0, page: 0 };
  const store = plateCache({
    version,
    open: async () => cache as unknown as Cache,
    worker: async () => (worker ? (built.worker++, JSON.stringify(PLATE)) : null),
    page: async () => (built.page++, PLATE),
    now: () => now,
  });
  return { store, built };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

test('a plate is built once by the worker, kept for the visit, and cached for the next', async () => {
  const cache = new FakeCache();
  const { store, built } = storeOf(cache);
  assert.equal(store.plateOf('rose'), undefined);
  const [a, b] = await Promise.all([store.load('rose'), store.load('rose')]);
  assert.deepEqual(a, PLATE);
  assert.equal(a, b, 'two asking at once share one build');
  assert.equal(store.plateOf('rose'), a);
  assert.equal(built.worker, 1);
  await settle();
  // The next visit reads it from the cache and builds nothing.
  const next = storeOf(cache);
  assert.deepEqual(await next.store.load('rose'), PLATE);
  assert.deepEqual(next.built, { worker: 0, page: 0 });
});

test('where the worker cannot build a plate, the page does; with no cache, nothing is kept', async () => {
  const { store, built } = storeOf(null, { worker: false });
  assert.deepEqual(await store.load('eye'), PLATE);
  assert.deepEqual(built, { worker: 0, page: 1 });
});

test('a cached plate that will not read is thrown away and built again', async () => {
  const cache = new FakeCache();
  await storeOf(cache).store.load('moth');
  await settle();
  const key = [...cache.entries.keys()][0];
  cache.entries.get(key)!.body = '{"layers": [trunc';
  const { store, built } = storeOf(cache);
  assert.deepEqual(await store.load('moth'), PLATE);
  assert.equal(built.worker, 1);
  await settle();
  assert.deepEqual(JSON.parse(cache.entries.get(key)!.body), PLATE, 'and kept again, whole');
});

test("plates of another build are cleared out only once they've lain a week", async () => {
  const cache = new FakeCache();
  const names: PlateName[] = ['rose', 'monad'];
  await Promise.all(names.map((n) => storeOf(cache, { version: 'old', now: 0 }).store.load(n)));
  await settle();
  // A tab on the new build, a day on: the old build's plates stay (a tab may still be on it).
  await storeOf(cache, { version: 'new', now: STALE_MS / 7 }).store.load('eye');
  await settle();
  assert.equal([...cache.entries.keys()].filter((k) => k.includes('/old/')).length, 2);
  // A week on, they go; the new build's stay.
  await storeOf(cache, { version: 'new', now: STALE_MS + 1 }).store.load('eye');
  await settle();
  assert.deepEqual([...cache.entries.keys()].map((k) => k.split('/').slice(-2).join('/')), ['new/eye.json']);
});
