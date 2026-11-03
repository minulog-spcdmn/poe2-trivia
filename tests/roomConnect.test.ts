// Getting a room online and getting into one, through what a phone's network
// and its browser do to a page (session.svelte.ts openRoom, armConnectTimeout):
// a new room rides out a signalling blip and a socket that never answers,
// trying again until HOST_GIVE_UP_MS before it plays on this device; and a
// join whose page was in the background isn't failed the moment it comes
// back, for time it never got to try in.
import { fakeModule } from './asVite.ts';
import { registerHooks } from 'node:module';
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';

fakeModule('peerjs', new URL('./fakePeerjs.ts', import.meta.url));
// The session imports the item data as Vite does, without saying it's JSON.
registerHooks({
  load: (url, context, nextLoad) => nextLoad(url, url.endsWith('.json') ? { ...context, importAttributes: { type: 'json' } } : context),
});
Object.assign(globalThis, { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
Object.assign(globalThis, { window: new EventTarget(), location: new URL('https://poe2.quest/') });
// What the page does on the side as rooms open and close (count.ts's beacon, listeners on the page) goes nowhere.
Object.assign(globalThis, { Image: class { src = ''; }, addEventListener() {}, removeEventListener() {} });
Object.defineProperty(globalThis, 'document', { value: Object.assign(new EventTarget(), { referrer: '', visibilityState: 'visible' }), configurable: true, writable: true });
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
const { session } = await import('../src/lib/session.svelte.ts');
const { toasts } = await import('../src/lib/toasts.svelte.ts');
const { net } = await import('./fakePeerjs.ts');

const settle = () => new Promise((r) => setImmediate(r));
/**
 * Lets `ms` go by on a page that's running: in short steps, each timer
 * firing on time (a mocked timer sees the clock at the step's end) and
 * what it set off (the fake server answers in a microtask) done before the
 * next.
 */
async function run(ms: number) {
  for (let left = ms; left > 0; left -= 250) {
    mock.timers.tick(Math.min(250, left));
    await settle();
  }
}
/** The peers made for the room's own id (not a guest's, nor a public room's listing slot, rooms.ts slotId). */
const roomPeers = () => net.made.filter((p) => !p.id.startsWith('anon-') && !p.id.includes('-pub-'));
/** Every notice shown, as it was shown (an info one is gone again in a few seconds). */
const shownToasts: { message: string; title?: string }[] = [];
const show = toasts.show.bind(toasts);
toasts.show = (message, kind, opts) => {
  shownToasts.push({ message, title: opts?.title });
  return show(message, kind, opts);
};
const lastToast = () => shownToasts.at(-1);

beforeEach(() => {
  session.leave();
  net.reset();
  shownToasts.length = 0;
});

test('a new room that hits a signalling blip tries again, and opens once the server answers', async () => {
  net.down = true;
  session.host('Ash');
  await settle();
  assert.equal(session.hereOnly, false, 'not played on this device at the first error');
  assert.equal(session.status, 'connecting');
  // Back a few seconds later: the next try gets through.
  await run(3000);
  net.down = false;
  await run(1500);
  assert.equal(session.status, 'ready');
  assert.equal(session.hereOnly, false);
  assert.ok(session.code, 'the room has its code');
  assert.ok(session.state, 'and its game');
  assert.ok(roomPeers().length >= 3, 'tried more than once');
});

test('a new room whose server stays out of reach opens on this device, once it has tried for a while', async () => {
  net.down = true;
  session.host('Ash');
  await settle();
  await run(15_000);
  assert.equal(session.hereOnly, false, 'still trying 15 s in');
  await run(10_000);
  assert.equal(session.hereOnly, true, 'given up by then');
  assert.equal(session.status, 'ready');
  assert.match(lastToast()?.message ?? '', /matchmaking server \(network\)/);
});

test('a new room whose socket never hears back gives it up for a fresh one, and plays here in the end', async () => {
  net.silent = true;
  session.host('Ash');
  await settle();
  assert.equal(roomPeers().length, 1);
  await run(10_500);
  assert.ok(roomPeers()[0].destroyed, 'the stalled try given up');
  // The fresh try, which the server answers, opens the room.
  net.silent = false;
  await run(1500);
  assert.equal(roomPeers().length, 2);
  assert.equal(session.status, 'ready');
  assert.equal(session.hereOnly, false);
  assert.ok(session.code);

  session.leave();
  net.reset();
  net.silent = true;
  session.host('Ash');
  await settle();
  await run(25_000);
  assert.equal(session.hereOnly, true, 'a server that never answers: played on this device, not left opening for ever');
  assert.match(lastToast()?.message ?? '', /matchmaking server \(timeout\)/);
});

test('a new room whose page was away (Create tapped, then off to share the code) keeps trying on its return', async () => {
  net.down = true;
  session.host('Ash');
  await settle();
  await run(2000);
  // Its timers held up for 40 s, and run, late, as it comes back.
  mock.timers.setTime(Date.now() + 40_000);
  await run(1);
  assert.equal(session.hereOnly, false, 'not given up for time it never had');
  assert.equal(session.status, 'connecting');
  net.down = false;
  await run(2000);
  assert.equal(session.status, 'ready');
  assert.ok(session.code);
});

test('a room that opened stays open through a later blip (its reconnects are its own)', async () => {
  session.host('Ash');
  await settle();
  assert.equal(session.status, 'ready');
  const code = session.code;
  net.down = true;
  await run(30_000);
  assert.equal(session.code, code);
  assert.equal(session.hereOnly, false);
});

test('a join whose page was away comes back still trying, with a fresh while to get in', async () => {
  session.join('ABCDEF', 'Bram');
  await settle();
  assert.equal(session.status, 'connecting');
  // The page goes to the background 2 s in and comes back 45 s later: its
  // timers didn't run meanwhile, and run, late, as it returns.
  mock.timers.tick(2000);
  mock.timers.setTime(Date.now() + 45_000);
  await run(1);
  assert.equal(session.status, 'connecting', 'not failed for time it never had');
  assert.equal(session.mode, 'client');
  // Left running this time, it gives up as it always did.
  await run(31_000);
  assert.equal(session.status, 'idle');
  assert.ok(lastToast()?.title, 'and says why');
});

test('a join left running gives up after its while, as before', async () => {
  session.join('ABCDEF', 'Bram');
  await settle();
  await run(29_000);
  assert.equal(session.status, 'connecting');
  await run(2000);
  assert.equal(session.status, 'idle');
});
