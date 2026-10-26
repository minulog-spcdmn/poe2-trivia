import './asVite.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';

// The copy a tab keeps of its save (lib/keptCopy.ts), for a tab the browser
// kills in the background and brings back with its sessionStorage empty.
// Each tab here has a keeper of its own and a sessionStorage of its own;
// they share localStorage and the locks, as tabs of one browser do.

const local = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(local);
/** The tab whose sessionStorage the app's code sees now. */
let current: Tab;
Object.defineProperty(globalThis, 'sessionStorage', { get: () => current.session, configurable: true });

const { keeper, restoredHere, KEEP_HERE_MS, KEEP_ONLINE_MS, MAX_COPIES } = await import('../src/lib/keptCopy.ts');
const { readStored, storeKey } = await import('../src/lib/storage.ts');

/** The locks every tab shares: who holds each, and a way to kill a tab (its locks go with it). */
const held = new Map<string, string>();
const releases = new Map<string, (() => void)[]>();
function locksOf(tab: string): LockManager {
  return {
    request: (async (name: string, opts: LockOptions, cb: (lock: Lock | null) => unknown) => {
      await Promise.resolve();
      if (held.has(name) && opts.ifAvailable) return cb(null);
      assert.ok(!held.has(name), 'only ifAvailable requests here');
      held.set(name, tab);
      const done = cb({ name, mode: 'exclusive' } as Lock);
      const free = () => {
        if (held.get(name) === tab) held.delete(name);
      };
      releases.set(tab, [...(releases.get(tab) ?? []), free]);
      await done;
      free();
    }) as LockManager['request'],
    query: async () => ({}),
  };
}

interface Tab {
  name: string;
  session: ReturnType<typeof memoryStorage>;
  store: Map<string, string>;
  k: ReturnType<typeof keeper>;
}
let tabs = 0;
/** A page: `back` when it was brought back (reloaded or restored), not opened anew; `from` a tab whose sessionStorage it starts with (duplicated). */
function page({ back = false, from, store = new Map(from?.store) }: { back?: boolean; from?: Tab; store?: Map<string, string> } = {}): Tab {
  const name = `tab${++tabs}`;
  return { name, store, session: memoryStorage(store), k: keeper(locksOf(name), () => back) };
}
/** The browser killed the tab: its page's locks go, its sessionStorage too (as Android Chrome's does). */
function kill(tab: Tab) {
  for (const free of releases.get(tab.name) ?? []) free();
  releases.delete(tab.name);
}
/** The same tab reloaded: a new page, its sessionStorage kept. */
function reload(tab: Tab) {
  kill(tab);
  return page({ back: true, store: tab.store });
}
const settle = () => new Promise((r) => setImmediate(r));
async function on<T>(tab: Tab, fn: (k: Tab['k']) => T): Promise<Awaited<T>> {
  current = tab;
  const out = await fn(tab.k);
  await settle();
  return out;
}
const save = (n: number) => JSON.stringify({ mode: 'local', state: { version: n } });
const yes = () => true;

beforeEach(() => {
  local.clear();
  held.clear();
  releases.clear();
});

test('a tab killed in the background and brought back picks up its game', async () => {
  const a = page();
  await on(a, (k) => k.keepCopy(save(1), false));
  await on(a, (k) => k.keepCopy(save(2), false));
  kill(a);
  const back = page({ back: true });
  const took = await on(back, (k) => k.takeCopy(yes));
  assert.deepEqual(took, { save: save(2), alive: null }, 'the last save, as it was');
  // It goes on keeping the game in the same slot, and holds it.
  await on(back, (k) => k.keepCopy(save(3), false));
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null, 'picked up once only');
  kill(back);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(3));
});

test('a tab opened anew never picks up a game, its tab gone or not', async () => {
  const a = page();
  await on(a, (k) => k.keepCopy(save(1), false));
  assert.equal(await on(page(), (k) => k.takeCopy(yes)), null, 'a second tab while the first plays');
  kill(a);
  assert.equal(await on(page(), (k) => k.takeCopy(yes)), null, 'the site opened again after the tab went');
  assert.ok(await on(page({ back: true }), (k) => k.takeCopy(yes)), 'still there for the tab when it comes back');
});

test('a page brought back never takes over a game another page still has', async () => {
  // A tab frozen in the background still holds its lock.
  const a = page();
  await on(a, (k) => k.keepCopy(save(1), false));
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  // A plain reload keeps its own sessionStorage (and its slot), so it takes nothing either: session.svelte.ts resumes from the save.
  const a2 = reload(a);
  await on(a2, (k) => k.keepCopy(save(2), false));
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null, 'the reloaded page holds the slot again');
  assert.equal([...local.keys()].filter((k) => k.startsWith(storeKey('kept.'))).length, 1, 'one copy for the tab, through its reloads');
});

test('a duplicated tab keeps its game apart, never over the first one’s', async () => {
  const a = page();
  await on(a, (k) => k.keepCopy(save(1), false));
  const dup = page({ from: a });
  await on(dup, (k) => k.keepCopy(save(9), false));
  assert.notEqual(dup.store.get(storeKey('session.slot')), a.store.get(storeKey('session.slot')), 'a slot of its own');
  kill(dup);
  kill(a);
  const saves = [];
  for (let i = 0; i < 3; i++) saves.push((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save ?? null);
  assert.deepEqual(saves.sort(), [save(1), save(9), null].sort(), 'each game once');
});

test('a game left is not picked up', async () => {
  const a = page();
  await on(a, (k) => k.keepCopy(save(1), false));
  await on(a, (k) => k.dropCopy());
  kill(a);
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  assert.deepEqual([...local.keys()], [], 'nothing left in localStorage');
});

test('a reloaded page that leaves before saving again clears its tab’s copy', async () => {
  const a = page();
  await on(a, (k) => k.keepCopy(save(1), false));
  const a2 = reload(a);
  await on(a2, (k) => k.dropCopy());
  kill(a2);
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
});

test('a page that started something meanwhile picks nothing up, and leaves the copy for its own tab', async () => {
  const a = page();
  await on(a, (k) => k.keepCopy(save(1), false));
  kill(a);
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(() => false)), null);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(1));
});

test('the newest game is picked up first', async () => {
  const old = page();
  await on(old, (k) => k.keepCopy(save(1), false));
  await settle();
  const t0 = Date.now();
  while (Date.now() === t0) await settle();
  const newer = page();
  await on(newer, (k) => k.keepCopy(save(2), true));
  kill(old);
  kill(newer);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(2));
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(1));
});

test('a host’s last moment comes back with its room', async () => {
  const a = page();
  const room = JSON.stringify({ mode: 'host', code: 'ABCD', state: { version: 1 } });
  await on(a, (k) => k.keepCopy(room, true));
  await on(a, (k) => k.keepAlive('12345'));
  kill(a);
  assert.deepEqual(await on(page({ back: true }), (k) => k.takeCopy(yes)), { save: room, alive: '12345' });
});

/** Stores a copy as a tab killed `ago` ms before now left it. */
function leftAgo(slot: string, ago: number, online: boolean) {
  local.set(storeKey(`kept.${slot}`), `{"at":${Date.now() - ago},"online":${online},"save":${save(1)}}`);
}

test('a game on this device is kept for a day, a room online for an hour', async () => {
  leftAgo('here', KEEP_HERE_MS - 60_000, false);
  leftAgo('online', KEEP_ONLINE_MS - 60_000, true);
  leftAgo('stale', KEEP_ONLINE_MS + 60_000, true);
  leftAgo('old', KEEP_HERE_MS + 60_000, false);
  const got = [];
  for (let i = 0; i < 3; i++) got.push(await on(page({ back: true }), (k) => k.takeCopy(yes)));
  assert.equal(got.filter(Boolean).length, 2);
  assert.equal(readStored('kept.stale'), null, 'let go of');
  assert.equal(readStored('kept.old'), null);
});

test('a host still pinging keeps its room fresh past its last save', async () => {
  leftAgo('host', KEEP_ONLINE_MS + 60_000, true);
  local.set(storeKey('keptAlive.host'), String(Date.now() - 60_000));
  assert.ok(await on(page({ back: true }), (k) => k.takeCopy(yes)));
});

test('a guest’s copy is as old as the time since its page was left, not since it joined', async () => {
  const a = page();
  const guest = JSON.stringify({ mode: 'client', code: 'ABCD', name: 'Ann' });
  await on(a, (k) => k.keepCopy(guest, true));
  // Joined well over an hour ago (the copy as its join left it), playing since.
  const name = storeKey(`kept.${a.store.get(storeKey('session.slot'))}`);
  local.set(name, local.get(name)!.replace(/"at":\d+/, `"at":${Date.now() - KEEP_ONLINE_MS - 60_000}`));
  await on(a, (k) => k.leaving());
  kill(a);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, guest);
});

test('only the newest few copies are kept', async () => {
  for (let i = 0; i < MAX_COPIES + 2; i++) leftAgo(`s${i}`, i * 1000, false);
  const a = page();
  await on(a, (k) => k.keepCopy(save(1), false));
  const copies = [...local.keys()].filter((k) => k.startsWith(storeKey('kept.')));
  assert.equal(copies.length, MAX_COPIES);
  assert.ok(copies.includes(storeKey(`kept.${a.store.get(storeKey('session.slot'))}`)), 'the new one among them');
});

test('without Web Locks nothing is kept or picked up', async () => {
  const blind = { ...page(), k: keeper(undefined, () => true) };
  await on(blind, (k) => k.keepCopy(save(1), false));
  assert.equal(local.size, 0);
  leftAgo('x', 0, false);
  assert.equal(await on(blind, (k) => k.takeCopy(yes)), null);
});

test('only a page brought back into a tab with nothing of the site’s counts as restored', () => {
  const was = performance.getEntriesByType;
  try {
    for (const [type, tabNew, restored] of [
      ['back_forward', true, true],
      ['reload', true, true],
      ['navigate', true, false],
      ['back_forward', false, false],
      ['reload', false, false],
    ] as const) {
      performance.getEntriesByType = (() => [{ type }]) as unknown as typeof was;
      assert.equal(restoredHere(tabNew), restored, `${type}, ${tabNew ? 'a new' : 'the'} tab`);
    }
  } finally {
    performance.getEntriesByType = was;
  }
});
