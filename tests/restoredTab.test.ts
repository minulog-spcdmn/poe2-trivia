// A run in a tab the phone's browser killed in the background, through the
// whole session (lib/session.svelte.ts with lib/keptCopy.ts): each page is
// the game loaded afresh (asVite's ?page=), as a tab's page is, with the
// sessionStorage of its tab; the pages share localStorage and the locks, as
// a browser's tabs do. The tab brought back finds its sessionStorage empty
// and its game where its copy was kept, and picks it up as a reload would.
import './asVite.ts';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, sharedLocks } from './helpers.ts';

type Session = (typeof import('../src/lib/session.svelte.ts'))['session'];

// No page's timers run: a killed page's would go on writing into the next tab's storage here.
mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
const local = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(local);
/** The sessionStorage of the tab whose page runs now. */
let tab = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', { get: () => memoryStorage(tab), configurable: true });
/** The Web Locks the pages keep their copies by. */
const locks = sharedLocks();

/** The game loaded as page `name`, in a tab whose sessionStorage is `store`, by a navigation of `type`; resumed as the page starts (App.svelte). */
async function open(name: string, store: Map<string, string>, type: NavigationTimingType): Promise<Session> {
  tab = store;
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

test('a run comes back to the tab the browser killed, and to no other', async () => {
  const a = await open('a', new Map(), 'navigate');
  assert.equal(a.mode, null, 'a page opened anew starts fresh');
  a.startLocal();
  assert.ok(a.seatLocal('Ann'));
  a.dispatch({ type: 'start' });
  await settle();
  const was = a.state!;
  assert.notEqual(was.phase, 'lobby', 'under way');

  // While its tab lives (frozen in the background, say), no other page takes the game: not a tab opened anew, nor one brought back.
  assert.equal((await open('second', new Map(), 'navigate')).mode, null);
  assert.equal((await open('stray', new Map(), 'back_forward')).mode, null);

  // Killed in the background: its locks go with it, and the tab comes back with its sessionStorage empty.
  locks.kill('a');
  const restored = new Map<string, string>();
  const b = await open('b', restored, 'back_forward');
  assert.equal(b.mode, 'local');
  assert.equal(b.state?.startedAt, was.startedAt, 'the same game');
  assert.equal(b.state?.phase, was.phase);
  assert.deepEqual(
    b.state?.players.map((p) => p.name),
    ['Ann'],
  );
  assert.ok([...restored.keys()].some((k) => k.endsWith('session.v4')), 'saved in its tab again, for a reload');

  // Picked up once: another page brought back while this one plays finds nothing.
  assert.equal((await open('again', new Map(), 'back_forward')).mode, null);

  // Left on purpose, it stays left, whatever comes back later.
  b.leave();
  await settle();
  locks.kill('b');
  assert.equal((await open('later', new Map(), 'back_forward')).mode, null);
});

test('an iPhone’s home-screen app, opened anew by iOS after letting it go, picks its run up too', async () => {
  // As installedApp.ts tells the app from a tab.
  const standalone = (on: boolean) => Object.defineProperty(navigator, 'standalone', { value: on, configurable: true });
  try {
    standalone(true);
    const app = await open('app', new Map(), 'navigate');
    assert.equal(app.mode, null, 'opened for the first time, it starts fresh');
    app.startLocal();
    assert.ok(app.seatLocal('Ann'));
    app.dispatch({ type: 'start' });
    await settle();
    const was = app.state!;
    locks.kill('app');
    const back = await open('appBack', new Map(), 'navigate');
    assert.equal(back.state?.startedAt, was.startedAt, 'the same game');
    // A tab in the browser opened anew the same way is one opened on purpose: it starts fresh.
    locks.kill('appBack');
    standalone(false);
    assert.equal((await open('tabAnew', new Map(), 'navigate')).mode, null);
  } finally {
    delete (navigator as { standalone?: boolean }).standalone;
  }
});
