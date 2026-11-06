// Getting a room online and getting into one, through what a phone's network
// and its browser do to a page (session.svelte.ts openRoom, armConnectTimeout):
// a new room rides out a signalling blip and waits on a slow link, trying
// until HOST_GIVE_UP_MS before it plays on this device; a reopened room
// whose server never answers is given up; and a join or a new room whose
// page was in the background gets its while afresh on the page's return
// (nudge), for time it never got to try in, while a page that never comes
// back still gives up.
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
// What the page does on the side as rooms open and close (count.ts's beacon, listeners on the page) goes nowhere; the paths counted are noted.
const counted: string[] = [];
class Beacon {
  set src(url: string) {
    counted.push(new URL(url).searchParams.get('p') ?? '');
  }
}
Object.assign(globalThis, { Image: Beacon, addEventListener() {}, removeEventListener() {} });
Object.defineProperty(globalThis, 'document', { value: Object.assign(new EventTarget(), { referrer: '', visibilityState: 'visible' }), configurable: true, writable: true });
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
const { session } = await import('../src/lib/session.svelte.ts');
const { toasts } = await import('../src/lib/toasts.svelte.ts');
const { default: Peer, net } = await import('./fakePeerjs.ts');
const { PEER_PREFIX } = await import('../src/lib/peer.ts');

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
/** The page goes out of sight, or comes back, as a browser tells it (count.ts and the session listen). */
function sight(shown: boolean) {
  Object.assign(document, { hidden: !shown, visibilityState: shown ? 'visible' : 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
}
/** A page stopped out of sight for `ms` (a phone's browser in the background): the clock runs on, its timers don't. */
const frozen = (ms: number) => mock.timers.setTime(Date.now() + ms);

beforeEach(() => {
  session.leave();
  net.reset();
  shownToasts.length = 0;
  if (document.hidden) sight(true);
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

test('a new room on a slow link waits for its server, however long the socket takes within its while', async () => {
  net.answerIn = 12_000;
  session.host('Ash');
  await settle();
  await run(11_000);
  assert.equal(roomPeers().length, 1);
  assert.equal(roomPeers()[0].destroyed, false, 'a slow try is not given up on');
  await run(1500);
  assert.equal(session.status, 'ready');
  assert.equal(session.hereOnly, false, 'online, not played on this device');
  assert.equal(roomPeers().length, 1);
  assert.ok(session.code);
});

test('a new room whose server never answers plays here once its while is up, not left opening for ever', async () => {
  net.silent = true;
  session.host('Ash');
  await settle();
  await run(19_000);
  assert.equal(session.hereOnly, false, 'still waiting 19 s in');
  await run(2000);
  assert.equal(session.hereOnly, true);
  assert.equal(session.status, 'ready');
  assert.match(lastToast()?.message ?? '', /matchmaking server \(timeout\)/);
});

test('a new room whose try hangs as the network goes tries afresh once it is back online, not waiting out its while', async () => {
  // Create tapped as the Wi-Fi went: the socket waits on a dead route, with no error.
  net.silent = true;
  session.host('Ash');
  await settle();
  await run(5000);
  assert.equal(session.status, 'connecting');
  // The phone is on mobile data now: the hung try makes way for a fresh one, which gets through.
  net.silent = false;
  session.nudge(true);
  await run(2000);
  assert.equal(session.status, 'ready');
  assert.equal(session.hereOnly, false, 'online, not played on this device');
  assert.equal(roomPeers().length, 2, 'the hung try, then one fresh one');
  assert.equal(roomPeers()[0].destroyed, true);
});

test('a room that has opened isn’t torn down by the network coming back', async () => {
  net.answerIn = 3000;
  session.host('Ash');
  await settle();
  await run(3500);
  assert.equal(session.status, 'ready');
  session.nudge(true);
  await run(2000);
  assert.equal(roomPeers().length, 1, 'an open room keeps its try');
  assert.equal(roomPeers()[0].destroyed, false);
});

test('a new room whose page was away (Create tapped, then off to share the code) keeps trying on its return', async () => {
  net.down = true;
  session.host('Ash');
  await settle();
  await run(2000);
  sight(false);
  // Stopped 40 s: its timers run, late, as it thaws, before its return is heard.
  frozen(40_000);
  await run(1);
  sight(true);
  await run(1);
  assert.equal(session.hereOnly, false, 'not given up for time it never had');
  assert.equal(session.status, 'connecting');
  net.down = false;
  await run(2000);
  assert.equal(session.status, 'ready');
  assert.ok(session.code);
});

test('a new room whose page comes back before its while was up gets the whole while again', async () => {
  net.down = true;
  session.host('Ash');
  await settle();
  await run(2000);
  sight(false);
  frozen(16_000);
  sight(true);
  await run(5000);
  assert.equal(session.hereOnly, false, 'still trying past its first 20 s');
  await run(16_000);
  assert.equal(session.hereOnly, true, 'given up 20 s after its return');
});

test('a reopened room whose server never answers is given up, kept for a refresh to try again', async () => {
  session.host('Ash');
  await settle();
  const code = session.code;
  assert.ok(code);
  // The page reloads (picking the room up from its save) on a server that never answers.
  net.silent = true;
  session.resume();
  await settle();
  assert.equal(session.status, 'connecting');
  await run(19_000);
  assert.equal(session.status, 'connecting');
  await run(2000);
  assert.equal(session.status, 'idle');
  assert.equal(lastToast()?.title, 'Room not reopened');
  assert.match(lastToast()?.message ?? '', new RegExp(`\\(timeout\\).*Refresh to try reopening room ${code}`));
  // Still saved: the next try reopens it.
  net.silent = false;
  session.resume();
  await settle();
  assert.equal(session.status, 'ready');
  assert.equal(session.code, code);
});

test('a room that opened stays open through a later blip (its reconnects are its own)', async () => {
  session.host('Ash');
  await settle();
  assert.equal(session.status, 'ready');
  const code = session.code;
  const [room] = roomPeers();
  net.down = true;
  // The open peer loses its socket, as PeerJS tells it: an error, then off the server.
  room.open = false;
  room.disconnected = true;
  room.emit('error', { type: 'network', message: 'Lost connection to server.' });
  room.emit('disconnected', room.id);
  await run(30_000);
  assert.equal(roomPeers().length, 1, 'no fresh try made for a room already open');
  assert.equal(room.destroyed, false);
  assert.equal(session.code, code);
  assert.equal(session.hereOnly, false);
});

test('a join whose page was away comes back still trying, with a fresh while to get in', async () => {
  session.join('ABCDEF', 'Bram');
  await settle();
  assert.equal(session.status, 'connecting');
  // The page goes to the background 2 s in and comes back 45 s later: its
  // timers run, late, as it thaws, before its return is heard.
  mock.timers.tick(2000);
  sight(false);
  frozen(45_000);
  await run(1);
  sight(true);
  await run(2000);
  assert.equal(session.status, 'connecting', 'not failed for time it never had');
  assert.equal(session.mode, 'client');
  // Left running this time, it gives up as it always did.
  await run(29_000);
  assert.equal(session.status, 'idle');
  assert.ok(lastToast()?.title, 'and says why');
});

test('a join whose page comes back before its while was up gets the whole while again', async () => {
  session.join('ABCDEF', 'Bram');
  await settle();
  // Off to check the code 2 s in, back at 27 s: before its 30 s were up.
  mock.timers.tick(2000);
  sight(false);
  frozen(25_000);
  sight(true);
  await run(10_000);
  assert.equal(session.status, 'connecting', 'not failed 3 s after its return');
  await run(21_000);
  assert.equal(session.status, 'idle', 'given up 30 s after its return');
});

test('a page out of sight that never comes back still gives up (a hidden tab, its timers held back)', async () => {
  session.join('ABCDEF', 'Bram');
  await settle();
  mock.timers.tick(2000);
  sight(false);
  // A hidden tab's timers run, late (a computer's browser holds them back up to a minute).
  for (let i = 0; i < 3; i++) {
    frozen(60_000);
    await run(1500);
  }
  assert.equal(session.status, 'idle', 'the join given up');

  net.down = true;
  session.host('Ash');
  await settle();
  for (let i = 0; i < 3; i++) {
    frozen(60_000);
    await run(1500);
  }
  assert.equal(session.hereOnly, true, 'the new room played on this device');
});

test('a join back from away isn’t told the room is missing by what the server said before it went', async () => {
  session.join('ABCDEF', 'Bram');
  await settle();
  const guest = net.made.find((p) => p.id.startsWith('anon-'));
  assert.ok(guest);
  const missing = () => guest.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer' });
  // The server says the room isn't there (once: the host may only be reconnecting).
  missing();
  mock.timers.tick(500);
  sight(false);
  frozen(25_000);
  // Another such answer, held up while the page was stopped, comes in as it
  // thaws: about attempts from before it went, not a second word on the room.
  missing();
  assert.equal(session.status, 'connecting', 'not failed as it thaws');
  sight(true);
  await run(7500);
  // One about an attempt since its return starts the count again.
  missing();
  assert.equal(session.status, 'connecting', 'what was heard before the return counts for nothing');
});

test('a return seen before joining isn’t taken for one by the network coming back mid-join', async () => {
  // Off to copy the code on the start page, back 10 s later, then the join.
  sight(false);
  frozen(10_000);
  sight(true);
  session.join('ABCDEF', 'Bram');
  await settle();
  await run(20_000);
  // Back online (a phone between networks): the join's while runs on from when it began.
  session.nudge();
  await run(9000);
  assert.equal(session.status, 'connecting');
  await run(2000);
  assert.equal(session.status, 'idle', 'given up 30 s after the join, not 30 s after the nudge');
});

test('a join left running gives up after its while, as before', async () => {
  session.join('ABCDEF', 'Bram');
  await settle();
  await run(29_000);
  assert.equal(session.status, 'connecting');
  await run(2000);
  assert.equal(session.status, 'idle');
});

test('a join the room was found for and never linked counts what the relay was doing beside its failure; one for a missing room counts none', async (t) => {
  // Each attempt's connection as a browser makes it: no relay login (no Worker in tests), the host's answer come.
  const connect = Peer.prototype.connect;
  t.after(() => void (Peer.prototype.connect = connect));
  Peer.prototype.connect = function (this: InstanceType<typeof Peer>, id: string) {
    const conn = connect.call(this, id);
    if (!conn) return conn;
    const pc = Object.assign(new EventTarget(), { remoteDescription: null as object | null, getConfiguration: () => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }) });
    Object.assign(conn, { peerConnection: pc });
    queueMicrotask(() => {
      pc.remoteDescription = { type: 'answer' };
      pc.dispatchEvent(new Event('signalingstatechange'));
    });
    return conn;
  };
  const failed = async (code: string, missing = false) => {
    counted.length = 0;
    session.join(code, 'Bram', false, 'code');
    await settle();
    await run(25_000);
    // The server says the room isn't there, late in the join's while.
    if (missing) net.made.find((p) => p.id.startsWith('anon-'))!.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer' });
    await run(6000);
    assert.equal(session.status, 'idle');
    // What was counted, gone out one at a time.
    await run(5000);
    return counted.filter((p) => p.startsWith('error/') || p.startsWith('relay/'));
  };
  // The room's host is there (its id held), and no link comes.
  Peer.hold(PEER_PREFIX + 'ABCDEF');
  assert.deepEqual((await failed('ABCDEF')).sort(), ['error/join-no-answer', 'relay/no-login-unreached']);
  assert.equal(lastToast()?.title, 'Couldn’t connect');
  session.leave();
  net.reset();
  // The server says nobody holds it: the room is missing, its failure counted alone.
  assert.deepEqual(await failed('QQQQQQ', true), ['error/join-no-answer']);
  assert.equal(lastToast()?.title, 'No answer');
});
