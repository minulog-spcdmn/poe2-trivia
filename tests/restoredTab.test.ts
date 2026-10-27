// A run in a tab the phone's browser killed in the background, through the
// whole session (lib/session.svelte.ts with lib/keptCopy.ts): each page is
// the game loaded afresh (asVite's ?page=), as a tab's page is, with the
// sessionStorage and the history of its tab; the pages share localStorage
// and the locks, as a browser's tabs do. The tab brought back finds its
// history as it was but its sessionStorage empty, and its game where its
// copy was kept, and picks it up as a reload would.
import './asVite.ts';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { memoryHistory, memoryStorage, sharedLocks } from './helpers.ts';

type Session = (typeof import('../src/lib/session.svelte.ts'))['session'];

// No page's timers run: a killed page's would go on writing into the next tab's storage here.
mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
const local = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(local);
/** A browser's tab: its sessionStorage and its history. */
interface Tab {
  store: Map<string, string>;
  history: ReturnType<typeof memoryHistory>;
}
const newTab = (): Tab => ({ store: new Map(), history: memoryHistory() });
/** The tab the browser killed, brought back: its history as it was, its entries' states and all, its sessionStorage empty. */
const restored = (tab: Tab): Tab => ({ store: new Map(), history: tab.history.copy() });
/** The tab whose page runs now. */
let tab = newTab();
Object.defineProperty(globalThis, 'sessionStorage', { get: () => memoryStorage(tab.store), configurable: true });
Object.defineProperty(globalThis, 'history', { get: () => tab.history, configurable: true });
/** The Web Locks the pages keep their copies by. */
const locks = sharedLocks();

/** The game loaded as page `name`, in tab `t`, by a navigation of `type`; resumed as the page starts (App.svelte). */
async function open(name: string, t: Tab, type: NavigationTimingType): Promise<Session> {
  tab = t;
  Object.defineProperty(navigator, 'locks', { value: locks.of(name), configurable: true });
  performance.getEntriesByType = (() => [{ type }]) as unknown as typeof performance.getEntriesByType;
  const { session } = (await import(`../src/lib/session.svelte.ts?page=${name}`)) as typeof import('../src/lib/session.svelte.ts');
  session.resume();
  await settle();
  return session;
}
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};
/** A game at one screen started on the page, under way. */
async function play(s: Session) {
  s.startLocal();
  assert.ok(s.seatLocal('Ann'));
  s.dispatch({ type: 'start' });
  await settle();
  assert.notEqual(s.state!.phase, 'lobby', 'under way');
  return s.state!;
}

test('a run comes back to the tab the browser killed, and to no other', async () => {
  const first = newTab();
  const a = await open('a', first, 'navigate');
  assert.equal(a.mode, null, 'a page opened anew starts fresh');
  const was = await play(a);

  // While its tab lives (frozen in the background, say), no other page takes the game: not a tab opened anew, nor one brought back naming its slot.
  assert.equal((await open('second', newTab(), 'navigate')).mode, null);
  assert.equal((await open('stray', restored(first), 'back_forward')).mode, null);

  // Killed in the background: its locks go with it, and the tab comes back with its history but its sessionStorage empty.
  locks.kill('a');
  const back = restored(first);
  const b = await open('b', back, 'back_forward');
  assert.equal(b.mode, 'local');
  assert.equal(b.state?.startedAt, was.startedAt, 'the same game');
  assert.equal(b.state?.phase, was.phase);
  assert.deepEqual(
    b.state?.players.map((p) => p.name),
    ['Ann'],
  );
  assert.ok([...back.store.keys()].some((k) => k.endsWith('session.v4')), 'saved in its tab again, for a reload');

  // Picked up once: another page brought back while this one plays finds nothing.
  assert.equal((await open('again', restored(first), 'back_forward')).mode, null);

  // Left on purpose, it stays left, whatever comes back later.
  b.leave();
  await settle();
  locks.kill('b');
  assert.equal((await open('later', restored(back), 'back_forward')).mode, null);
});

test('after a kill the tab in front never takes the game of the tab behind it, which gets it back', async () => {
  const gameTab = newTab();
  const was = await play(await open('game', gameTab, 'navigate'));
  // The codex in a tab of its own, in front.
  const codexTab = newTab();
  await open('codex', codexTab, 'navigate');
  locks.kill('game');
  locks.kill('codex');
  // Every tab comes back with its sessionStorage empty: the one in front at once, the other when switched to.
  assert.equal((await open('codexBack', restored(codexTab), 'back_forward')).mode, null, 'still the codex’s tab');
  const back = await open('gameBack', restored(gameTab), 'back_forward');
  assert.equal(back.state?.startedAt, was.startedAt, 'the game back in its own tab');
});

test('an iPhone’s home-screen app, opened anew by iOS after letting it go, picks its run up too', async () => {
  // As installedApp.ts tells the app from a tab.
  const standalone = (on: boolean) => Object.defineProperty(navigator, 'standalone', { value: on, configurable: true });
  try {
    standalone(true);
    const app = await open('app', newTab(), 'navigate');
    assert.equal(app.mode, null, 'opened for the first time, it starts fresh');
    const was = await play(app);
    locks.kill('app');
    // Opened anew, with no history of the last time.
    const back = await open('appBack', newTab(), 'navigate');
    assert.equal(back.state?.startedAt, was.startedAt, 'the same game');
    // A tab in the browser opened anew the same way is one opened on purpose: it starts fresh.
    locks.kill('appBack');
    standalone(false);
    assert.equal((await open('tabAnew', newTab(), 'navigate')).mode, null);
  } finally {
    delete (navigator as { standalone?: boolean }).standalone;
  }
});
