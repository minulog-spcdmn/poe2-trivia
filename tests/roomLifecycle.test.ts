// A phone in a room online (lib/wakeLock.ts, session.svelte.ts stayAwake and
// nudge): the screen is kept on while this device is in a room online, asked
// again on coming back and once more on a tap after a refusal, and let go of
// out of the room or playing on this device only; and a guest cut off from
// its host is nudged back into trying on the page's return, a link that's
// fine left alone.
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
mock.timers.enable({ apis: ['setTimeout', 'Date'] });

// ---- a page and its browser's wake locks ------------------------------------

class Page extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
  /** How many pointerup listeners are waiting. */
  taps = 0;
  addEventListener(type: string, f: EventListenerOrEventListenerObject | null, o?: AddEventListenerOptions | boolean) {
    if (type === 'pointerup') this.taps++;
    super.addEventListener(type, f, o);
  }
  removeEventListener(type: string, f: EventListenerOrEventListenerObject | null, o?: EventListenerOptions | boolean) {
    if (type === 'pointerup') this.taps = Math.max(0, this.taps - 1);
    super.removeEventListener(type, f, o);
  }
  show(visible: boolean) {
    this.visibilityState = visible ? 'visible' : 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
  tap() {
    // A once listener is gone after it ran.
    if (this.taps) this.taps--;
    this.dispatchEvent(new Event('pointerup'));
  }
}

class Lock extends EventTarget {
  released = false;
  async release() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

/** A browser's wake locks: granted unless `refuse` says otherwise; every lock it gave out. */
class Locks {
  asked = 0;
  given: Lock[] = [];
  refuse = 0;
  async request(type: 'screen') {
    assert.equal(type, 'screen');
    this.asked++;
    if (this.refuse > 0) {
      this.refuse--;
      throw new DOMException('not allowed', 'NotAllowedError');
    }
    const lock = new Lock();
    this.given.push(lock);
    return lock;
  }
  /** Locks given out and still held. */
  get held() {
    return this.given.filter((l) => !l.released).length;
  }
}

// A window and a page to load the session in, which it listens to for the
// page's return (nudge); the tests after give each their own page.
const window = new EventTarget();
const loadedOn = Object.assign(new Page(), { referrer: '' });
Object.assign(globalThis, { window, location: new URL('https://poe2.quest/') });
Object.defineProperty(globalThis, 'document', { value: loadedOn, configurable: true, writable: true });
const { keepAwake } = await import('../src/lib/wakeLock.ts');
const { session } = await import('../src/lib/session.svelte.ts');
const { default: FakePeer } = await import('./fakePeerjs.ts');

let page: Page;
let locks: Locks;
const settle = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  page = new Page();
  locks = new Locks();
  Object.defineProperty(globalThis, 'document', { value: page, configurable: true, writable: true });
  Object.defineProperty(globalThis.navigator, 'wakeLock', { value: locks, configurable: true, writable: true });
});

test('the screen is kept on until let go of, and asked again each time the page comes back', async () => {
  const sleep = keepAwake();
  await settle();
  assert.equal(locks.asked, 1);
  assert.equal(locks.held, 1);
  // The browser lets go of it as the page hides; nothing is asked while hidden.
  page.show(false);
  void locks.given[0].release();
  await settle();
  assert.equal(locks.asked, 1);
  page.show(true);
  await settle();
  assert.equal(locks.asked, 2);
  assert.equal(locks.held, 1);
  // Shown again while held: not asked twice.
  page.show(true);
  await settle();
  assert.equal(locks.asked, 2);
  sleep();
  await settle();
  assert.equal(locks.held, 0);
  page.show(true);
  await settle();
  assert.equal(locks.asked, 2, 'nothing asked once let go of');
});

test('a refused lock is asked again on the next tap, once', async () => {
  locks.refuse = 2;
  const sleep = keepAwake();
  await settle();
  assert.equal(locks.held, 0);
  assert.equal(page.taps, 1);
  page.tap();
  await settle();
  assert.equal(locks.asked, 2);
  // Refused from the tap too: no more taps asked, until the page comes back.
  assert.equal(page.taps, 0);
  page.tap();
  await settle();
  assert.equal(locks.asked, 2);
  page.show(true);
  await settle();
  assert.equal(locks.asked, 3);
  assert.equal(locks.held, 1);
  sleep();
});

test('a tap waiting to ask is forgotten when let go of, and a lock granted late is handed back', async () => {
  locks.refuse = 1;
  const sleep = keepAwake();
  await settle();
  assert.equal(page.taps, 1);
  sleep();
  assert.equal(page.taps, 0);
  const late = keepAwake();
  late();
  await settle();
  assert.equal(locks.given.length, 1);
  assert.equal(locks.held, 0, 'granted after it was let go of: released at once');
});

test('without wake locks (an older browser, plain http) nothing is asked and nothing breaks', () => {
  Object.defineProperty(globalThis.navigator, 'wakeLock', { value: undefined, configurable: true, writable: true });
  const sleep = keepAwake();
  sleep();
  sleep();
  assert.equal(page.taps, 0);
});

// ---- the session -----------------------------------------------------------

/** What the session keeps to itself, as these tests set it. */
type Inside = {
  peer: unknown;
  retries: number;
  retry: ReturnType<typeof setTimeout> | null;
  attempts: unknown[];
  hereOnly: boolean;
  nudgedAt: number;
  connectToHost(): void;
  startClientPeer(): void;
};
const inside = session as unknown as Inside;

/** A signalling peer: whether it reached the server, and what it was asked. */
function peerOf(disconnected = false) {
  const p = { destroyed: false, disconnected, open: !disconnected, connects: 0, reconnects: 0 };
  return Object.assign(p, {
    connect: () => void p.connects++,
    // As PeerJS: no longer disconnected, but not open till the server answers.
    reconnect: () => {
      p.reconnects++;
      p.disconnected = false;
    },
    destroy: () => void (p.destroyed = true),
  });
}

/** Puts the session in a room as `mode`, at `status`, on `peer`. */
function inRoom(mode: 'client' | 'host', status: 'connecting' | 'ready' | 'lost', peer = peerOf()) {
  session.leave();
  session.mode = mode;
  session.status = status;
  inside.peer = peer;
  inside.attempts = [];
  // A while since the last nudge.
  mock.timers.tick(2000);
  return peer;
}

test('in a room online the screen is kept on, as host, guest or spectator, and let go of out of it', async () => {
  inRoom('client', 'connecting');
  await settle();
  assert.equal(locks.held, 1);
  session.status = 'ready';
  await settle();
  assert.equal(locks.held, 1);
  assert.equal(locks.asked, 1, 'not asked again while held');
  // Cut off from the host: kept on while it's still trying, not once given up.
  session.status = 'lost';
  await settle();
  assert.equal(locks.held, 1);
  session.gaveUp = true;
  await settle();
  assert.equal(locks.held, 0);
  session.leave();
  await settle();
  assert.equal(locks.held, 0);

  inRoom('host', 'ready');
  await settle();
  assert.equal(locks.held, 1);
  // A room that couldn't go online plays on this device only.
  session.hereOnly = true;
  await settle();
  assert.equal(locks.held, 0);
  session.hereOnly = false;
  session.leave();
  await settle();

  // A game on this device only.
  session.startLocal();
  await settle();
  assert.equal(locks.held, 0);
  session.leave();
});

test('opening a room asks for the lock at once, from the tap that opened it', () => {
  session.host('Ash');
  // Asked synchronously, before any effect runs.
  assert.equal(locks.asked, 1);
  session.leave();
});

test('a guest cut off from the host is nudged into a fresh count of retries, trying now', async () => {
  const peer = inRoom('client', 'lost');
  inside.retries = 21;
  session.gaveUp = true;
  session.nudge();
  assert.equal(inside.retries, 0);
  assert.equal(session.gaveUp, false);
  assert.equal(peer.connects, 1, 'an attempt was due');
  assert.notEqual(inside.retry, null, 'the retries go on');
  // The same return seen by another event: counted once.
  inside.retries = 5;
  session.nudge();
  assert.equal(inside.retries, 5);
  assert.equal(peer.connects, 1);
  // A second later it counts again.
  mock.timers.tick(1000);
  session.nudge();
  assert.equal(inside.retries, 0);
  session.leave();
});

test('a nudge while an attempt is still opening leaves it racing instead of starting another', () => {
  const peer = inRoom('client', 'lost');
  inside.attempts = [{ conn: { provider: {}, peerConnection: null, close() {} }, at: Date.now() }];
  session.nudge();
  assert.equal(peer.connects, 0);
  assert.equal(inside.retries, 0);
  session.leave();
});

test('a link that is fine is left alone by a nudge', () => {
  for (const status of ['ready', 'connecting'] as const) {
    const peer = inRoom('client', status);
    inside.retries = 3;
    session.nudge();
    assert.equal(inside.retries, 3, status);
    assert.equal(peer.connects, 0, status);
    assert.equal(peer.reconnects, 0, status);
    session.leave();
  }
  // Nor is a game on this device only.
  session.startLocal();
  session.nudge();
  assert.equal(session.status, 'ready');
  session.leave();
});

test('a signalling link that dropped while away reconnects at once, for a host as for a guest', () => {
  const host = inRoom('host', 'ready', peerOf(true));
  session.nudge();
  assert.equal(host.reconnects, 1);
  assert.equal(host.connects, 0, 'a host reaches nobody');
  session.leave();
  const guest = inRoom('client', 'lost', peerOf(true));
  session.nudge();
  assert.equal(guest.reconnects, 1);
  // An offer sent while signalling is still reconnecting would be dropped unsent.
  assert.equal(guest.connects, 0, 'nothing sent before the server answers');
  assert.equal(inside.attempts.length, 0, 'no dead attempt holding a slot');
  assert.notEqual(inside.retry, null, 'the retries go on');
  // The server answers: its 'open' tries the host.
  guest.open = true;
  inside.connectToHost();
  assert.equal(guest.connects, 1);
  session.leave();
});

test('the page coming back nudges a guest cut off from the host: back online, restored, or shown', () => {
  const back = (name: string, come: () => void) => {
    inRoom('client', 'lost');
    inside.retries = 7;
    come();
    assert.equal(inside.retries, 0, name);
    session.leave();
  };
  back('online', () => window.dispatchEvent(new Event('online')));
  back('pageshow', () => window.dispatchEvent(new Event('pageshow')));
  // The page the session was loaded on is the one it listens to.
  Object.defineProperty(globalThis, 'document', { value: loadedOn, configurable: true, writable: true });
  back('shown', () => loadedOn.show(true));
  inRoom('client', 'lost');
  inside.retries = 7;
  loadedOn.show(false);
  assert.equal(inside.retries, 7, 'hidden: not nudged');
  session.leave();
});

test('a signalling link the page brought back first is not reconnected again by its own wait', async () => {
  // A guest's own peer, as the session makes it, cut off from the host.
  inRoom('client', 'connecting');
  inside.startClientPeer();
  await settle();
  const peer = inside.peer as InstanceType<typeof FakePeer>;
  assert.ok(peer instanceof FakePeer);
  let reconnects = 0;
  // As PeerJS, which throws if asked to reconnect a peer that isn't disconnected.
  peer.reconnect = () => {
    if (!peer.disconnected) throw new Error('not disconnected');
    reconnects++;
    peer.disconnected = false;
  };
  session.status = 'lost';
  // Signalling drops while the page is away; it comes back before the wait is up.
  peer.disconnected = true;
  peer.open = false;
  peer.emit('disconnected');
  session.nudge();
  assert.equal(reconnects, 1);
  mock.timers.tick(1500);
  assert.equal(reconnects, 1, 'not reconnected twice');
  // Dropped and left alone: its wait reconnects it.
  peer.disconnected = true;
  peer.emit('disconnected');
  mock.timers.tick(1500);
  assert.equal(reconnects, 2);
  session.leave();
});
