// The owner closing someone else's room (session.svelte.ts closeAsOwner): the
// host heeds the close message only from the seat its game has as the
// owner's, tells everyone the owner closed it, and leaves the room.
import { fakeModule } from './asVite.ts';
import { registerHooks } from 'node:module';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';
import { PROTOCOL_VERSION, type HostMsg } from '../src/lib/protocol.ts';

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

/** A guest's link as the host holds it: what it was sent, and a way to send it something. */
class Link {
  open = true;
  serialization = 'binary';
  sent: HostMsg[] = [];
  private handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  readonly peer: string;
  constructor(peer: string) {
    this.peer = peer;
  }
  on(event: string, f: (...a: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), f]);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const f of this.handlers.get(event) ?? []) f(...args);
  }
  send(msg: HostMsg) {
    this.sent.push(msg);
  }
  close() {
    this.open = false;
    this.emit('close');
  }
  _handleDataMessage() {}
  _handleChunk() {}
  get playerId() {
    const w = this.sent.find((m) => m.t === 'welcome');
    return w && w.t === 'welcome' ? w.playerId : null;
  }
}

const inside = session as unknown as { acceptConnection(conn: Link): void; guests: Map<Link, { signed?: boolean }> };

function joins(name: string, n: number) {
  const link = new Link(`peer-${n}`);
  inside.acceptConnection(link);
  link.emit('open');
  link.emit('data', { t: 'hello', secret: `secret-of-${name}-0123456789abc`, name, v: PROTOCOL_VERSION, seal: true });
  assert.ok(link.playerId, `${name} is let in (sent ${JSON.stringify(link.sent)})`);
  return link;
}

test('only the owner’s seat, on a link that signed for it, closes the room, and everyone is told the owner closed it', async (t) => {
  t.after(() => session.leave());
  session.host('Ash');
  // The room opens once its peer reaches the (fake) server.
  await new Promise((r) => setImmediate(r));
  assert.ok(session.state, 'the room is open');
  const bram = joins('Bram', 1);
  const cass = joins('Cass', 2);
  // The owner's seat, taken back with its token alone (no signature on this link): it may not close the room.
  session.state = { ...session.state!, owner: { id: cass.playerId! } };
  cass.emit('data', { t: 'close' });
  mock.timers.tick(1);
  assert.equal(session.mode, 'host', 'a seat without the signature on its link closes nothing');

  bram.emit('data', { t: 'close' });
  mock.timers.tick(1);
  assert.equal(session.mode, 'host', 'a guest who isn’t the owner closes nothing');
  assert.ok(!bram.sent.some((m) => m.t === 'closed'));

  // As the host's check of a signature under the held name would have it, on this link.
  inside.guests.get(cass)!.signed = true;
  cass.emit('data', { t: 'close' });
  mock.timers.tick(1);
  assert.equal(session.mode, null, 'the host has left the room');
  for (const link of [bram, cass]) assert.deepEqual(link.sent.at(-1), { t: 'closed', owner: true });
  mock.timers.tick(1000);
  assert.ok(!bram.open && !cass.open, 'the links are let go of');
});
