import './asVite.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, sharedLocks } from './helpers.ts';

// The copy a tab keeps of its save (lib/keptCopy.ts), for a tab the browser
// kills in the background and brings back with its sessionStorage empty.
// Each tab here has a keeper of its own and a sessionStorage of its own;
// they share localStorage and the locks, as tabs of one browser do. A page
// is driven as the session drives it: every game it starts or picks up
// begins with reset(), which lets go of what was kept, before its first save
// (`start`). The whole session's way back is in tests/restoredTab.test.ts.

const local = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(local);
/** The tab whose sessionStorage the app's code sees now. */
let current: Tab;
Object.defineProperty(globalThis, 'sessionStorage', { get: () => current.session, configurable: true });

const { keeper, restoredHere, KEEP_HERE_MS, KEEP_ONLINE_MS, MAX_COPIES } = await import('../src/lib/keptCopy.ts');
const { readStored, storeKey } = await import('../src/lib/storage.ts');

/** The name the save goes under (session.svelte.ts SAVE). */
const SAVE = 'session.v4';

/** The locks every tab shares. */
const locks = sharedLocks();

interface Tab {
  name: string;
  session: ReturnType<typeof memoryStorage>;
  store: Map<string, string>;
  k: ReturnType<typeof keeper>;
}
let tabs = 0;
/**
 * A page: `back` when it was brought back (reloaded or restored), not opened
 * anew; `from` a tab whose sessionStorage it starts with (duplicated);
 * `standalone` when it is an iPhone's home-screen app.
 */
function page({
  back = false,
  from,
  store = new Map(from?.store),
  standalone = false,
}: { back?: boolean; from?: Tab; store?: Map<string, string>; standalone?: boolean } = {}): Tab {
  const name = `tab${++tabs}`;
  return { name, store, session: memoryStorage(store), k: keeper(locks.of(name), () => back, () => standalone, SAVE) };
}
/** The browser killed the tab: its page's locks go, its sessionStorage too (as Android Chrome's does). No pagehide. */
const kill = (tab: Tab) => locks.kill(tab.name);
/** The page went for good (its tab closed, a reload): a pagehide not for the back/forward cache, then its locks go. */
function close(tab: Tab) {
  current = tab;
  tab.k.pageHidden(false);
  kill(tab);
}
/** The same tab reloaded: a new page, its sessionStorage kept. */
function reload(tab: Tab) {
  close(tab);
  return page({ back: true, store: tab.store });
}
const settle = () => new Promise((r) => setImmediate(r));
async function on<T>(tab: Tab, fn: (k: Tab['k']) => T): Promise<Awaited<T>> {
  current = tab;
  const out = await fn(tab.k);
  await settle();
  return out;
}
/** A save's room, as the session names it for its copy (writeSaved). */
function roomOf(raw: string) {
  const { mode, code } = JSON.parse(raw) as { mode: string; code?: string };
  return mode !== 'local' && code ? `${mode} ${code}` : null;
}
/** A save written on the page: its copy kept, as the session keeps it. */
const keep = (k: Tab['k'], raw: string) => k.keepCopy(raw, roomOf(raw));
/** A game started (or picked up) on the page: reset() lets go of what was kept, and the first save keeps the game, in one go. */
function start(k: Tab['k'], raw: string) {
  k.dropCopy();
  keep(k, raw);
}
const save = (n: number) => JSON.stringify({ mode: 'local', state: { version: n } });
const guest = (code: string) => JSON.stringify({ mode: 'client', code, name: 'Ann' });
const hosting = (code: string) => JSON.stringify({ mode: 'host', code, state: { version: 1 } });
const yes = () => true;
const copiesLeft = () => [...local.keys()].filter((k) => k.startsWith(storeKey('kept.')));
const slotOf = (tab: Tab) => tab.store.get(storeKey('session.slot'));
/** Whether the tab's page holds its slot's lock. */
const holds = (tab: Tab) => locks.held.get(storeKey(`kept.${slotOf(tab)}`)) === tab.name;
/** Lets a moment pass, for what a page lets go of in one (an emptied slot's lock). */
const moment = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  local.clear();
  locks.clear();
});

test('a tab killed in the background and brought back picks up its game', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  await on(a, (k) => keep(k, save(2)));
  kill(a);
  const back = page({ back: true });
  const took = await on(back, (k) => k.takeCopy(yes));
  assert.deepEqual(took, { save: save(2), alive: null }, 'the last save, as it was');
  // Picked up as a reload picks it up (resume: reset, then the game saved again), in the same slot, held.
  await on(back, (k) => start(k, took!.save));
  await on(back, (k) => keep(k, save(3)));
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null, 'picked up once only');
  assert.equal(slotOf(back), slotOf(a), 'the tab’s slot taken over');
  assert.equal(copiesLeft().length, 1);
  kill(back);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(3));
});

test('a page whose reset settled before its first save still keeps its game', async () => {
  // A fresh tab's reset has no slot and nothing to keep: it must not leave the page unable to get one.
  const a = page();
  await on(a, (k) => k.dropCopy());
  await on(a, (k) => keep(k, save(1)));
  await on(a, (k) => keep(k, save(2)));
  assert.ok(slotOf(a), 'a slot got');
  assert.equal(copiesLeft().length, 1);
  kill(a);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(2));
});

test('a restored page whose reset came first can still pick up its game', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  kill(a);
  const back = page({ back: true });
  await on(back, (k) => k.dropCopy());
  assert.equal((await on(back, (k) => k.takeCopy(yes)))?.save, save(1));
});

test('a tab opened anew never picks up a game, its tab gone or not', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  assert.equal(await on(page(), (k) => k.takeCopy(yes)), null, 'a second tab while the first plays');
  kill(a);
  assert.equal(await on(page(), (k) => k.takeCopy(yes)), null, 'the site opened again after the tab went');
  assert.ok(await on(page({ back: true }), (k) => k.takeCopy(yes)), 'still there for the tab when it comes back');
});

test('a page brought back never takes over a game another page still has', async () => {
  // A tab frozen in the background still holds its lock.
  const a = page();
  await on(a, (k) => start(k, save(1)));
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  // A plain reload keeps its own sessionStorage (and its slot), so it takes nothing either: session.svelte.ts resumes from the save.
  const a2 = reload(a);
  await on(a2, (k) => start(k, save(2)));
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null, 'the reloaded page holds the slot again');
  assert.equal(copiesLeft().length, 1, 'one copy for the tab, through its reloads');
  // Its copy went as the old page did, and the game resumed kept one again.
  kill(a2);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(2));
});

test('a duplicated tab keeps its game apart, never over the first one’s', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  const dup = page({ from: a });
  await on(dup, (k) => start(k, save(9)));
  assert.notEqual(slotOf(dup), slotOf(a), 'a slot of its own');
  kill(dup);
  kill(a);
  const saves = [];
  for (let i = 0; i < 3; i++) saves.push((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save ?? null);
  assert.deepEqual(saves.sort(), [save(1), save(9), null].sort(), 'each game once');
});

test('a game left is not picked up', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  await on(a, (k) => k.dropCopy());
  kill(a);
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  assert.deepEqual([...local.keys()], [], 'nothing left in localStorage');
});

test('a game whose tab the player closed is never picked up by another', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  await on(a, (k) => k.leaving());
  close(a);
  // A tab of the site without a game, killed in the background and restored later.
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  assert.deepEqual([...local.keys()], [], 'nothing left in localStorage');
});

test('a room whose tab the player closed is left for good, older tabs’ copies of it too', async () => {
  const a = page();
  await on(a, (k) => start(k, guest('ROOM')));
  kill(a);
  await later();
  const b = page();
  await on(b, (k) => start(k, guest('ROOM')));
  await on(b, (k) => k.leaving());
  close(b);
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  assert.deepEqual(copiesLeft(), []);
});

test('a page that closes keeps nothing after, whatever is saved as it goes', async () => {
  const a = page();
  await on(a, (k) => start(k, hosting('HOST')));
  await on(a, (k) => {
    k.closing();
    keep(k, hosting('HOST'));
    k.keepAlive(String(Date.now()));
  });
  kill(a);
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  assert.deepEqual([...local.keys()], []);
});

test('a tab’s page that unloads leaves nothing to pick up once its tab is gone', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  await on(a, (k) => k.pageHidden(false));
  kill(a);
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  assert.deepEqual(copiesLeft(), []);
});

test('a home-screen app’s page that unloads leaves its run for the app to come back to', async () => {
  // The player swiped the app away: iOS unloads its one window, and opens it anew later.
  const a = page({ standalone: true });
  await on(a, (k) => start(k, save(1)));
  await on(a, (k) => k.pageHidden(false));
  kill(a);
  assert.equal((await on(page({ back: true, standalone: true }), (k) => k.takeCopy(yes)))?.save, save(1));
});

test('a page put in the back/forward cache still gives its game back if its tab is killed there', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  await on(a, (k) => k.pageHidden(true));
  kill(a);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(1));
});

test('a reloaded page that leaves before saving again clears its tab’s copy', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  const a2 = reload(a);
  await on(a2, (k) => k.dropCopy());
  await moment();
  assert.ok(!holds(a2), 'its slot’s lock taken to clear it, and let go of again');
  kill(a2);
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
});

test('a page that started something meanwhile picks nothing up, and leaves the copy for its own tab', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  kill(a);
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(() => false)), null);
  // A game started while it looked: its own slot is being got, and nothing is taken over it.
  const busy = page({ back: true });
  const looked = await on(busy, (k) => {
    const took = k.takeCopy(yes);
    start(k, save(5));
    return took;
  });
  assert.equal(looked, null);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(1));
});

/** Lets the clock move on, so the next copy is newer than the last. */
async function later() {
  const t0 = Date.now();
  while (Date.now() === t0) await settle();
}

test('the newest game is picked up first', async () => {
  const old = page();
  await on(old, (k) => start(k, save(1)));
  await later();
  const newer = page();
  await on(newer, (k) => start(k, save(2)));
  kill(old);
  kill(newer);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(2));
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(1));
});

test('a page holds its slot’s lock only while it has a game to keep', async () => {
  // Chrome keeps a page holding a lock out of its back/forward cache: the start page after a game must not hold one.
  const a = page();
  await on(a, (k) => start(k, save(1)));
  const slot = slotOf(a);
  // Another game started at once (its reset and first save in one go): held all along.
  await on(a, (k) => start(k, save(2)));
  await moment();
  assert.ok(holds(a));
  await on(a, (k) => k.dropCopy());
  await moment();
  assert.ok(!holds(a), 'let go of with the game');
  assert.deepEqual(copiesLeft(), []);
  // A room opened later (it saves only once it's online, a while after its reset): the tab's slot taken again then.
  await on(a, (k) => keep(k, hosting('ROOM')));
  assert.equal(slotOf(a), slot);
  assert.ok(holds(a));
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null, 'still its own while it plays');
  kill(a);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, hosting('ROOM'));
});

test('a page brought back looks for a game to pick up once, as it starts', async () => {
  const a = page();
  await on(a, (k) => start(k, save(1)));
  kill(a);
  await later();
  const b = page();
  await on(b, (k) => start(k, save(2)));
  kill(b);
  const back = page({ back: true });
  const took = await on(back, (k) => k.takeCopy(yes));
  assert.equal(took?.save, save(2));
  await on(back, (k) => start(k, took!.save));
  await on(back, (k) => k.dropCopy());
  await moment();
  assert.equal(await on(back, (k) => k.takeCopy(yes)), null, 'its own game left, it never goes on into another tab’s');
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, save(1), 'still there for its own tab');
});

test('a host’s last moment comes back with its room', async () => {
  const a = page();
  await on(a, (k) => start(k, hosting('ABCD')));
  await on(a, (k) => k.keepAlive('12345'));
  kill(a);
  assert.deepEqual(await on(page({ back: true }), (k) => k.takeCopy(yes)), { save: hosting('ABCD'), alive: '12345' });
});

test('a seat the player took again from a new tab stays there when the old tab comes back', async () => {
  // A guest's tab killed; the player opened a new tab and joined the room again, as the same player.
  const a = page();
  await on(a, (k) => start(k, guest('ROOM')));
  kill(a);
  const b = page();
  await on(b, (k) => start(k, guest('ROOM')));
  // The old tab switched to later: its game went on in the new one, which keeps it.
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  assert.deepEqual(copiesLeft(), [storeKey(`kept.${slotOf(b)}`)], 'the old tab’s copy let go of, never to rejoin over the new one');
  // The new tab's own game still comes back if it is killed in turn.
  kill(b);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, guest('ROOM'));
});

test('a host’s room is so too, but not a room others in this browser are only in', async () => {
  // Another page hosting the same room (a duplicate that couldn't reopen it while the first had it).
  const a = page();
  await on(a, (k) => start(k, hosting('ROOM')));
  kill(a);
  const dup = page();
  await on(dup, (k) => start(k, hosting('ROOM')));
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  kill(dup);
  local.clear();
  // A guest of the room in another tab is waiting for its host; a game on this device elsewhere is no room.
  const host = page();
  await on(host, (k) => start(k, hosting('ROOM')));
  kill(host);
  await on(page(), (k) => start(k, guest('ROOM')));
  await on(page(), (k) => start(k, save(1)));
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, hosting('ROOM'));
});

test('a room left from a newer tab is never gone back into by an older one', async () => {
  // A guest's tab killed, its room joined again from a new tab, and left there (or the player was removed, or the room closed).
  const a = page();
  await on(a, (k) => start(k, guest('ROOM')));
  kill(a);
  const elsewhere = page();
  await on(elsewhere, (k) => start(k, guest('OTHER')));
  kill(elsewhere);
  await later();
  const b = page();
  await on(b, (k) => start(k, guest('ROOM')));
  await on(b, (k) => k.dropCopy());
  // The old tab switched to later: the room was left, so it starts fresh.
  const back = page({ back: true });
  assert.equal((await on(back, (k) => k.takeCopy(yes)))?.save, guest('OTHER'), 'only the other room’s copy is still there');
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
});

test('a tab moved out of its seat by a newer one leaves the newer one’s copy be', async () => {
  // A guest's tab frozen in the background; the player joined again from a new tab, and the host moved the seat there.
  const a = page();
  await on(a, (k) => start(k, guest('ROOM')));
  await on(a, (k) => k.leaving());
  await later();
  const b = page();
  await on(b, (k) => start(k, guest('ROOM')));
  // The old tab thawed and told it moved to another tab: its reset lets go of its game, and only its own.
  await on(a, (k) => k.dropCopy());
  assert.deepEqual(copiesLeft(), [storeKey(`kept.${slotOf(b)}`)]);
  kill(b);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, guest('ROOM'));
});

/** Stores a copy as a tab killed `ago` ms before now left it, kept under `v`. */
function leftAgo(slot: string, ago: number, room: string | null, v = SAVE) {
  local.set(storeKey(`kept.${slot}`), `{"v":"${v}","at":${Date.now() - ago},"room":${JSON.stringify(room)},"save":${save(1)}}`);
}

test('a game on this device is kept for a day, a room online for an hour', async () => {
  leftAgo('here', KEEP_HERE_MS - 60_000, null);
  leftAgo('online', KEEP_ONLINE_MS - 60_000, 'client ROOM');
  leftAgo('stale', KEEP_ONLINE_MS + 60_000, 'client ROOM');
  leftAgo('old', KEEP_HERE_MS + 60_000, null);
  const got = [];
  for (let i = 0; i < 3; i++) got.push(await on(page({ back: true }), (k) => k.takeCopy(yes)));
  assert.equal(got.filter(Boolean).length, 2);
  assert.equal(readStored('kept.stale'), null, 'let go of');
  assert.equal(readStored('kept.old'), null);
});

test('a copy kept under another save name is never picked up', async () => {
  // As a build whose save format changed (SAVE renamed) finds the last build's.
  leftAgo('before', 60_000, null, 'session.v3');
  assert.equal(await on(page({ back: true }), (k) => k.takeCopy(yes)), null);
  assert.equal(readStored('kept.before'), null, 'let go of');
  // And the copies this keeper writes carry its name.
  const a = page();
  await on(a, (k) => start(k, save(1)));
  assert.equal(JSON.parse(local.get(copiesLeft()[0])!).v, SAVE);
});

test('a host still pinging keeps its room fresh past its last save', async () => {
  leftAgo('host', KEEP_ONLINE_MS + 60_000, 'host ROOM');
  local.set(storeKey('keptAlive.host'), String(Date.now() - 60_000));
  assert.ok(await on(page({ back: true }), (k) => k.takeCopy(yes)));
});

test('a guest’s copy is as old as the time since its page was left, not since it joined', async () => {
  const a = page();
  await on(a, (k) => start(k, guest('ABCD')));
  // Joined well over an hour ago (the copy as its join left it), playing since.
  const name = storeKey(`kept.${slotOf(a)}`);
  local.set(name, local.get(name)!.replace(/"at":\d+/, `"at":${Date.now() - KEEP_ONLINE_MS - 60_000}`));
  await on(a, (k) => k.leaving());
  kill(a);
  assert.equal((await on(page({ back: true }), (k) => k.takeCopy(yes)))?.save, guest('ABCD'));
});

test('only the newest few copies are kept', async () => {
  for (let i = 0; i < MAX_COPIES + 2; i++) leftAgo(`s${i}`, i * 1000, null);
  const a = page();
  await on(a, (k) => start(k, save(1)));
  const copies = copiesLeft();
  assert.equal(copies.length, MAX_COPIES);
  assert.ok(copies.includes(storeKey(`kept.${slotOf(a)}`)), 'the new one among them');
});

test('without Web Locks nothing is kept or picked up', async () => {
  const blind = { ...page(), k: keeper(undefined, () => true, () => false, SAVE) };
  await on(blind, (k) => start(k, save(1)));
  assert.equal(local.size, 0);
  leftAgo('x', 0, null);
  assert.equal(await on(blind, (k) => k.takeCopy(yes)), null);
});

test('only a page brought back into a tab with nothing of the site’s counts as restored', () => {
  const was = performance.getEntriesByType;
  try {
    // (`standalone`: an iPhone's home-screen app, which iOS brings back by opening it anew.)
    for (const [type, tabNew, standalone, restored] of [
      ['back_forward', true, false, true],
      ['reload', true, false, true],
      ['navigate', true, false, false],
      ['back_forward', false, false, false],
      ['reload', false, false, false],
      ['navigate', true, true, true],
      ['reload', true, true, true],
      ['navigate', false, true, false],
      ['reload', false, true, false],
    ] as const) {
      performance.getEntriesByType = (() => [{ type }]) as unknown as typeof was;
      assert.equal(restoredHere(tabNew, standalone), restored, `${type}, ${tabNew ? 'a new' : 'the'} tab${standalone ? ', home-screen app' : ''}`);
    }
  } finally {
    performance.getEntriesByType = was;
  }
});
