// The two signalling servers (lib/peer.ts): the PeerJS cloud, where everyone
// it answers meets as before, and the game's own (signal/worker.js) for the
// pages it turns away (every player in Russia). A page meets where it's
// answered; a host's room and its listing are on both; a guest whose room
// isn't on its page's server, but on the other, goes on there; an invite asks
// both. Against two signalling servers in memory (tests/fakePeerjs.ts).
import { fakeModule } from './asVite.ts';
import { registerHooks } from 'node:module';
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';
import { EventEmitter } from 'node:events';

fakeModule('peerjs', new URL('./fakePeerjs.ts', import.meta.url));
// The session imports the item data as Vite does, without saying it's JSON.
registerHooks({
  load: (url, context, nextLoad) => nextLoad(url, url.endsWith('.json') ? { ...context, importAttributes: { type: 'json' } } : context),
});
Object.assign(globalThis, { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
Object.assign(globalThis, { window: new EventTarget(), location: new URL('https://poe2.quest/') });
Object.assign(globalThis, { Image: class { src = ''; }, addEventListener() {}, removeEventListener() {} });
Object.defineProperty(globalThis, 'document', { value: Object.assign(new EventTarget(), { referrer: '', visibilityState: 'visible' }), configurable: true, writable: true });
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
const { session } = await import('../src/lib/session.svelte.ts');
const { default: Peer, net } = await import('./fakePeerjs.ts');
const { PEER_PREFIX, alsoOn, chooseServer, keepFresh, newPeer, pageServer, peerJsNow, peerOptions, serverOf, useServers } = await import('../src/lib/peer.ts');
const { ProbeDesk, answerProbes, probeRoom, slotId } = await import('../src/lib/rooms.ts');
const { ping, pingAnswer } = await import('../src/lib/probeDesk.ts');
const { OWN_SIGNAL_HOST } = await import('../src/lib/signalHost.ts');
type RoomInfo = import('../src/lib/roomInfo.ts').RoomInfo;

/** What each server says to a page's look (lib/peer.ts), never the network: yes, no, never a word, or as a function says each time. */
type Says = boolean | 'never' | (() => boolean);
let answering: { cloud: Says; own: Says } = { cloud: true, own: true };
/** The servers asked, in order. */
const asked: string[] = [];
globalThis.fetch = ((url: string, init?: RequestInit) => {
  const server = new URL(url).host === OWN_SIGNAL_HOST ? 'own' : 'cloud';
  asked.push(server);
  const says = answering[server];
  if (says === 'never') return new Promise((_, fail) => init?.signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError'))));
  return (typeof says === 'function' ? says() : says) ? Promise.resolve(new Response('id')) : Promise.reject(new TypeError('Failed to fetch'));
}) as typeof fetch;

const settle = () => new Promise((r) => setImmediate(r));
async function run(ms: number) {
  for (let left = ms; left > 0; left -= 250) {
    mock.timers.tick(Math.min(250, left));
    await settle();
  }
}
/** Runs the clock on until `p` settles. */
async function until<T>(p: Promise<T>, limit = 60_000): Promise<T> {
  let done = false;
  let out: T;
  void p.then((v) => ((done = true), (out = v)));
  for (let t = 0; !done && t < limit; t += 100) {
    await settle();
    mock.timers.tick(100);
  }
  await settle();
  assert.ok(done, `settled within ${limit} ms`);
  return out!;
}
/** Peers under no room's or listing's id: guests, and on ours the look for a room (watchForRoom), whose ids ours has made in the page. */
const guests = () => net.made.filter((p) => !p.id.startsWith(PEER_PREFIX));
/** The peers a join reached the room from, by server (beside them, a peer on ours that only pings, watchForRoom). */
const joiners = (server: 'cloud' | 'own') => [...new Set(net.connected.filter((id) => id.startsWith('own:') === (server === 'own')))];
const unavailable = (p: InstanceType<typeof Peer>) => p.emit('error', { type: 'peer-unavailable', message: `Could not connect to peer ${PEER_PREFIX}ABCDEF` });
const room = (code: string): RoomInfo => ({ code, host: 'Ash', players: 1, maxPlayers: 12, spectators: 0, maxSpectators: 8, mode: 'turns', difficulty: 'merciless', target: 10, phase: 'lobby' });
/** A room answering pings under its code, on one server. */
function hosted(code: string, server: 'cloud' | 'own') {
  const peer = server === 'own' ? new Peer(PEER_PREFIX + code, { host: OWN_SIGNAL_HOST }) : new Peer(PEER_PREFIX + code);
  (server === 'own' ? net.ownHeld : net.held).set(PEER_PREFIX + code, peer);
  answerProbes(peer as never, new ProbeDesk(() => room(code)));
  return peer;
}

beforeEach(() => {
  session.leave();
  net.reset();
  useServers(true, 'cloud');
  answering = { cloud: true, own: true };
  asked.length = 0;
  // Well past the page's start: a page just shown takes what the server says as about attempts from before (count.ts hiddenSince).
  // And past what the last test's joins heard of where a room is (rooms.ts onlyOn).
  mock.timers.setTime(Date.now() + 200_000);
});

test("a host's room and its listing are on both servers once it opens, and let go of on both as it closes", async () => {
  session.host('Ash');
  await run(2000);
  assert.equal(session.status, 'ready');
  const id = PEER_PREFIX + session.code;
  assert.equal(net.held.get(id)?.destroyed, false, 'on the cloud');
  assert.equal(net.ownHeld.get(id)?.destroyed, false, 'and on ours');
  assert.ok(net.held.has(slotId(1)), 'listed on the cloud');
  assert.ok(net.ownHeld.has(slotId(1)), 'and on ours');
  session.leave();
  await run(1000);
  assert.equal(net.held.size + net.ownHeld.size, 0);
});

test('what reaches the room on our server is answered as on the cloud', async () => {
  session.host('Ash');
  await run(2000);
  const answered: unknown[] = [];
  const asker = new Peer('asker', { host: OWN_SIGNAL_HOST });
  await run(100);
  asker.socket.on('message', (m: unknown) => answered.push(m));
  net.ownHeld.get(PEER_PREFIX + session.code)!.socket.emit('message', {
    type: 'CANDIDATE',
    src: 'asker',
    payload: { candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 }, type: 'data', connectionId: 'dc_x', probe: null },
  });
  await run(100);
  assert.equal(answered.length, 1, 'the ping answered');
});

test("a room's id lost on our server is tried for again, later each time, the room going on meanwhile", async () => {
  session.host('Ash');
  await run(2000);
  const id = PEER_PREFIX + session.code;
  const first = net.ownHeld.get(id)!;
  // Lost while it was off the server, someone else holding it meanwhile (the server tells it so as it comes back).
  const squatter = new Peer(id, { host: OWN_SIGNAL_HOST });
  net.ownHeld.set(id, squatter);
  first.emit('error', { type: 'unavailable-id', message: `ID "${id}" is taken` });
  // Cut off by the server: reconnected, never let go of.
  first.emit('error', { type: 'server-error', message: 'Too many messages' });
  await run(3000);
  assert.equal(first.destroyed, false, 'kept for the guests it carries');
  assert.equal(net.ownHeld.get(id), squatter);
  assert.equal(session.status, 'ready', 'the room goes on');
  assert.equal(net.held.get(id)?.destroyed, false, 'on the cloud as it was');
  squatter.destroy();
  await run(10_000);
  const mirror = net.ownHeld.get(id);
  assert.ok(mirror && mirror !== first && mirror !== squatter && !mirror.destroyed, 'held again once it was free');
  session.leave();
  await run(1000);
  assert.equal(first.destroyed, true, 'let go of as the room closes');
});

test('a page the cloud turns away hosts on ours alone', async () => {
  useServers(true, 'own');
  answering.cloud = false;
  session.host('Ash');
  await run(2000);
  assert.equal(session.status, 'ready');
  const id = PEER_PREFIX + session.code;
  assert.ok(net.ownHeld.has(id));
  assert.ok(net.ownHeld.has(slotId(1)));
  assert.equal(net.held.size, 0, 'nothing on the cloud');
});

test("a guest whose room is on ours alone goes on there where the cloud would say there's no such room", async () => {
  hosted('ABCDEF', 'own');
  session.join('ABCDEF', 'Bram');
  await run(300);
  assert.deepEqual(joiners('cloud'), [PEER_PREFIX + 'ABCDEF'], 'on the cloud first, as before');
  assert.deepEqual(joiners('own'), [], 'ours only pinged');
  const [first] = guests().filter((p) => p.server === 'cloud');
  unavailable(first);
  await run(7500);
  assert.deepEqual(joiners('own'), [], 'not on the cloud’s first word: a host may only be reconnecting');
  unavailable(first);
  await run(300);
  assert.equal(first.destroyed, true);
  assert.deepEqual(joiners('own'), ['own:' + PEER_PREFIX + 'ABCDEF'], 'on ours');
  assert.equal(session.status, 'connecting');
});

test("a cloud host's room the cloud loses for a moment is waited for on the cloud, as before, though it's on ours too", async () => {
  hosted('ABCDEF', 'cloud');
  hosted('ABCDEF', 'own');
  session.join('ABCDEF', 'Bram');
  await run(300);
  const [first] = guests().filter((p) => p.server === 'cloud');
  unavailable(first);
  await run(3000);
  assert.deepEqual(joiners('own'), []);
  assert.equal(first.destroyed, false);
  assert.ok(joiners('cloud').length > 0 && session.status === 'connecting', 'still trying the cloud');
});

test('a join from an invite that found the room on ours, and the cloud saying it has none, goes there at once', async () => {
  hosted('QWNHST', 'own');
  await until(probeRoom('QWNHST'));
  await run(300);
  session.join('QWNHST', 'Bram');
  await run(300);
  assert.deepEqual(joiners('own'), ['own:' + PEER_PREFIX + 'QWNHST'], 'without waiting for the cloud to say so again');
});

test('a room that shows up on ours after the cloud first said it has no such room is gone on to', async () => {
  session.join('ABCDEF', 'Bram');
  await run(300);
  const [first] = guests().filter((p) => p.server === 'cloud');
  unavailable(first);
  await run(1000);
  hosted('ABCDEF', 'own');
  await run(6500);
  unavailable(first);
  await run(300);
  assert.deepEqual(joiners('own'), ['own:' + PEER_PREFIX + 'ABCDEF']);
});

test('a code no room has is told as soon as before, the join never moved to ours, and ours let go of', async () => {
  session.join('ABCDEF', 'Bram');
  await run(300);
  const [first] = guests().filter((p) => p.server === 'cloud');
  unavailable(first);
  await run(7500);
  assert.equal(session.status, 'connecting');
  unavailable(first);
  await run(100);
  assert.equal(session.status, 'idle', 'No such room, on the cloud’s second word, as before');
  assert.equal(guests().filter((p) => p.server === 'cloud').length, 1);
  assert.deepEqual(joiners('own'), [], 'never joined on ours');
  assert.ok(net.pinged.includes(PEER_PREFIX + 'ABCDEF'), 'only looked for there');
  assert.ok(net.made.filter((p) => p.server === 'own').every((p) => p.destroyed), 'and stopped looking');
});

test('a room the cloud has is joined there alone, ours never asked', async () => {
  hosted('ABCDEF', 'cloud');
  hosted('ABCDEF', 'own');
  session.join('ABCDEF', 'Bram');
  await run(3000);
  assert.deepEqual(joiners('cloud'), [PEER_PREFIX + 'ABCDEF']);
  assert.deepEqual(joiners('own'), []);
  assert.deepEqual(guests().filter((p) => p.server === 'own'), [], 'not even looked on');
});

test("a guest the cloud turns away joins on ours, and doesn't look on the cloud", async () => {
  useServers(true, 'own');
  answering.cloud = false;
  session.join('ABCDEF', 'Bram');
  await run(100);
  const [guest] = guests();
  assert.equal(guest.server, 'own');
  unavailable(guest);
  await run(7500);
  unavailable(guest);
  await run(100);
  assert.equal(session.status, 'idle');
  assert.equal(guests().length, 1, 'nothing on the cloud, not even a look');
});

test("an invite finds a room on either server; it's gone only when neither has it", async () => {
  hosted('QWNHST', 'own');
  hosted('CLQUDS', 'cloud');
  const onOurs = await until(probeRoom('QWNHST'));
  assert.equal(onOurs && onOurs !== 'gone' ? onOurs.code : onOurs, 'QWNHST');
  const onCloud = await until(probeRoom('CLQUDS'));
  assert.equal(onCloud && onCloud !== 'gone' ? onCloud.code : onCloud, 'CLQUDS');
  assert.equal(await until(probeRoom('ZZZZZZ')), 'gone');
});

test('without our server (tests, the QA desk, a self-hosted one) everything meets on the cloud, as before', async () => {
  useServers(false);
  assert.equal(alsoOn('cloud'), null);
  session.host('Ash');
  await run(2000);
  assert.equal(session.status, 'ready');
  assert.equal(net.ownHeld.size, 0);
  assert.equal(peerOptions().host, undefined, "PeerJS's own default, the cloud");
});

test("a page meets on the cloud if it answers, on ours if only ours does, and looks again if neither did", async () => {
  useServers(true, null);
  assert.equal(await until(chooseServer()), 'cloud');
  assert.deepEqual([pageServer(), alsoOn(pageServer()), asked], ['cloud', 'own', ['cloud']]);

  useServers(true, null);
  asked.length = 0;
  answering = { cloud: false, own: true };
  assert.equal(await until(chooseServer()), 'own');
  assert.deepEqual([pageServer(), alsoOn(pageServer()), asked], ['own', null, ['cloud', 'own', 'cloud']], 'the cloud asked twice');
  assert.equal(peerOptions().host, OWN_SIGNAL_HOST);

  useServers(true, null);
  answering = { cloud: false, own: false };
  assert.equal(await until(chooseServer()), 'cloud', 'offline: the cloud, as before');
  assert.equal(pageServer(), 'cloud');
  assert.notEqual(peerJsNow(false), null, 'peers made on it for a while');
  // Then looked at again before the next peer is made (a look from page load, the network back since).
  mock.timers.tick(11_000);
  assert.equal(peerJsNow(false), null);
  asked.length = 0;
  answering = { cloud: false, own: true };
  assert.equal(await until(chooseServer()), 'own');
  assert.deepEqual(asked, ['cloud', 'own', 'cloud']);
  assert.equal(pageServer(), 'own');
});

test('one no from the cloud (an error, the network changing) is asked again, and the page stays on it if it answers then', async () => {
  useServers(true, null);
  let refusals = 1;
  answering = { cloud: () => refusals-- <= 0, own: true };
  assert.equal(await until(chooseServer()), 'cloud');
  assert.deepEqual(asked, ['cloud', 'own', 'cloud']);
  assert.equal(pageServer(), 'cloud');
});

test('a cloud slow to answer is waited for 4 s once, peers made on it meanwhile; no word in 15 s, and the page meets on ours', async () => {
  useServers(true, null);
  answering = { cloud: 'never', own: true };
  const at = Date.now();
  assert.equal(await until(chooseServer()), 'cloud');
  assert.ok(Date.now() - at <= 4100, 'waited 4 s at most');
  assert.equal(pageServer(), 'cloud');
  assert.notEqual(peerJsNow(false), null, "the next peer doesn't wait for it again");
  assert.equal(await until(chooseServer()), 'cloud');
  assert.ok(Date.now() - at <= 4400);
  await run(12_000);
  assert.equal(pageServer(), 'own', 'the cloud taken as a no once it had said nothing for 15 s');
  assert.deepEqual(asked, ['cloud', 'own']);
});

test('a page whose server fails it looks again: the cloud gone down, its peers meet on ours; back on the cloud once it answers', async () => {
  const first = newPeer(Peer as never, undefined) as unknown as InstanceType<typeof Peer>;
  answering = { cloud: false, own: true };
  first.emit('error', { type: 'network', message: 'Lost connection to server.' });
  await run(2000);
  assert.equal(pageServer(), 'own');
  // Its server lost again within 10 s: not looked at again so soon.
  asked.length = 0;
  (newPeer(Peer as never, undefined) as unknown as InstanceType<typeof Peer>).emit('error', { type: 'network', message: 'Lost connection to server.' });
  await run(2000);
  assert.deepEqual(asked, []);
  // On ours, a peer made 5 minutes on looks again, and the cloud answers by then.
  answering = { cloud: true, own: true };
  await run(5 * 60_000);
  assert.equal(serverOf(newPeer(Peer as never, undefined)), 'own', 'that peer is still on ours');
  await run(1000);
  assert.equal(pageServer(), 'cloud');
  assert.equal(serverOf(newPeer(Peer as never, undefined)), 'cloud');
});

test('once the cloud has said no, a peer waits for the look to end, not 4 s; a second no slow to come leaves the page where it was', async () => {
  useServers(true, null);
  answering = { cloud: false, own: true };
  // The second ask slow to come back: ours answers meanwhile, and the look isn't cut short at 4 s.
  let asks = 0;
  answering.cloud = () => {
    asks++;
    return false;
  };
  const real = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) =>
    new URL(url).host !== OWN_SIGNAL_HOST && asks >= 1
      ? (asked.push('cloud'), new Promise((_, fail) => init?.signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')))))
      : real(url, init)) as typeof fetch;
  try {
    const at = Date.now();
    const p = chooseServer();
    await run(5000);
    assert.equal(peerJsNow(false), null, 'not made on the cloud that said no');
    assert.equal(await until(p), 'cloud', 'no second no: where it was, the cloud by default');
    assert.ok(Date.now() - at >= 8000, 'waited for the look');
    assert.equal(pageServer(), 'cloud');
  } finally {
    globalThis.fetch = real;
  }
});

test("peers on the cloud that fail before they open, twice, have the next look take the cloud as saying no, though it hands out ids", async () => {
  const lost = () => (newPeer(Peer as never, undefined) as unknown as InstanceType<typeof Peer>).emit('error', { type: 'server-error', message: 'Server has reached its concurrent user limit' });
  // (Peers that never hear back from the server, so they fail before they open.)
  net.silent = true;
  mock.timers.tick(10_000);
  lost();
  await run(3000);
  assert.equal(pageServer(), 'cloud', 'once: the look asked, and the cloud answered');
  mock.timers.tick(10_000);
  asked.length = 0;
  lost();
  await run(3000);
  assert.deepEqual(asked, ['own'], 'twice: the cloud not asked');
  assert.equal(pageServer(), 'own');
});

test("a look that finds neither leaves the page where it meets, and what isn't the page's server failing doesn't look", async () => {
  useServers(true, 'own');
  answering = { cloud: false, own: false };
  const peer = newPeer(Peer as never, undefined) as unknown as InstanceType<typeof Peer>;
  peer.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer x' });
  await run(100);
  assert.deepEqual(asked, [], 'a room not there is no server failing');
  peer.emit('error', { type: 'server-error', message: 'Could not get an ID from the server.' });
  await run(100);
  assert.deepEqual(asked, [], 'not within 10 s of the look that found ours');
  mock.timers.tick(10_000);
  peer.emit('error', { type: 'server-error', message: 'Could not get an ID from the server.' });
  await run(3000);
  assert.deepEqual(asked, ['cloud', 'own', 'cloud']);
  assert.equal(pageServer(), 'own');
});

/** PeerJS's socket (its Socket class, as keepFresh leans on it) over a WebSocket the test opens. */
class PeerJsSocket extends EventEmitter {
  _disconnected = true;
  _messagesQueue: object[] = [];
  _id: string | undefined;
  _socket: { readyState: number; close(code?: number): void } | undefined;
  /** The codes its WebSockets were closed with. */
  closedWith: number[] = [];
  _wsPingTimer: ReturnType<typeof setTimeout> | undefined;
  /** What went over the socket, and what was done to it. */
  wire: string[] = [];
  log: string[] = [];
  start(id: string, token: string) {
    this._id = id;
    if (this._socket || !this._disconnected) return;
    this._socket = { readyState: 0, close: (code?: number) => void this.closedWith.push(code ?? 1005) };
    this._disconnected = false;
    this.log.push(`started ${id} ${token}`);
  }
  /** Its WebSocket opens. */
  opened() {
    this._socket!.readyState = 1;
    this._sendQueuedMessages();
    this._scheduleHeartbeat();
  }
  _scheduleHeartbeat() {
    this._wsPingTimer = setTimeout(() => this._sendHeartbeat(), 25_000);
  }
  _sendHeartbeat() {
    if (!this._wsOpen()) return;
    this.wire.push('HEARTBEAT');
    this._scheduleHeartbeat();
  }
  _wsOpen() {
    return !!this._socket && this._socket.readyState === 1;
  }
  _sendQueuedMessages() {
    const queue = [...this._messagesQueue];
    this._messagesQueue = [];
    for (const m of queue) this.send(m);
  }
  send(data: object) {
    if (this._disconnected) return;
    if (!this._id) return void this._messagesQueue.push(data);
    if (!this._wsOpen()) return;
    this.wire.push((data as { type: string }).type);
  }
  close() {
    if (this._disconnected) return;
    clearTimeout(this._wsPingTimer);
    this._socket = undefined;
    this._disconnected = true;
    this.log.push('closed');
  }
}

/** A peer open on a PeerJS socket, with the server's messages it's handed (an OPEN begins over what's under way). */
function freshPeer() {
  const socket = new PeerJsSocket();
  const peer = { socket, id: 'room', open: true, destroyed: false, options: { token: 'tok' }, connections: {} as Record<string, { open: boolean }[]>, handed: [] as string[] };
  socket.on('message', (m: { type: string }) => peer.handed.push(m.type));
  socket.start('room', 'tok');
  socket.opened();
  socket.emit('message', { type: 'OPEN' });
  socket.log.length = 0;
  keepFresh(peer as never);
  return { socket, peer };
}

test('a peer on ours from a page there takes a fresh socket under its id and token once it has carried 6 KB and gone quiet', () => {
  const { socket, peer } = freshPeer();
  socket.send({ type: 'CANDIDATE', payload: 'x'.repeat(3000) });
  socket.emit('message', { type: 'OFFER', payload: 'y'.repeat(2500) });
  mock.timers.tick(5000);
  assert.deepEqual(socket.log, [], 'not yet');
  socket.emit('message', { type: 'OFFER', payload: 'z'.repeat(1000) });
  mock.timers.tick(500);
  socket.send({ type: 'ANSWER', payload: 'a' });
  mock.timers.tick(900);
  assert.deepEqual(socket.log, [], 'only once quiet');
  mock.timers.tick(200);
  assert.deepEqual(socket.log, ['closed', 'started room tok']);
  assert.deepEqual(socket.closedWith, [4000], 'closed as lost, so ours keeps the id for its token');
  // Sent while the fresh socket opens: kept, and sent once it has.
  socket.send({ type: 'CANDIDATE', payload: 'late' });
  assert.equal(socket.wire.at(-1), 'ANSWER');
  socket.opened();
  assert.equal(socket.wire.at(-1), 'CANDIDATE');
  // The server's OPEN on it isn't handed to the peer, which is open all along; what comes after is.
  socket.emit('message', { type: 'OPEN' });
  socket.emit('message', { type: 'OFFER', payload: 'b' });
  assert.deepEqual(peer.handed, ['OPEN', 'OFFER', 'OFFER', 'OFFER']);
  // Counted afresh.
  mock.timers.tick(5000);
  assert.equal(socket.log.length, 2);
});

test('a socket on ours whose heartbeat goes unechoed is taken as stalled and swapped at once; an echo is for keepFresh alone', () => {
  const { socket, peer } = freshPeer();
  mock.timers.tick(25_000);
  assert.equal(socket.wire.at(-1), 'HEARTBEAT');
  socket.emit('message', { type: 'HEARTBEAT' });
  mock.timers.tick(10_000);
  assert.deepEqual(socket.log, [], 'echoed: alive');
  assert.deepEqual(peer.handed, ['OPEN'], "PeerJS isn't handed the echo");
  mock.timers.tick(15_000);
  assert.equal(socket.wire.filter((w) => w === 'HEARTBEAT').length, 2);
  mock.timers.tick(9_900);
  assert.deepEqual(socket.log, []);
  mock.timers.tick(200);
  assert.deepEqual(socket.log, ['closed', 'started room tok'], 'stalled: swapped, though it carried little');
  // The fresh socket says nothing within 10 s either: lost, as PeerJS takes one that closes (it disconnects, and reconnects later).
  socket.on('disconnected', () => peer.handed.push('lost'));
  mock.timers.tick(9_900);
  assert.deepEqual(peer.handed, ['OPEN']);
  mock.timers.tick(200);
  assert.deepEqual(peer.handed, ['OPEN', 'lost']);
});

test("past 8 KB a steady stream doesn't put the swap off: a second on, quiet or not", () => {
  const { socket } = freshPeer();
  for (let t = 0; t < 4000; t += 400) {
    socket.emit('message', { type: 'CANDIDATE', payload: 'x'.repeat(1000) });
    mock.timers.tick(400);
  }
  assert.deepEqual(socket.log, ['closed', 'started room tok']);
});

test("a listing on ours whose host's page meets there takes a fresh socket every two or three seconds while it answers its share of pings: over twenty requests a minute", () => {
  const { socket } = freshPeer();
  // A scan's peer on ours, its ping's connection id and its challenge, as long as the page makes them.
  const [scanner, connectionId, challenge] = ['s'.repeat(24), `dc_${'c'.repeat(11)}`, 'C'.repeat(22)];
  let swaps = 0;
  // Six pings a second (60 in 10 s, probeDesk.ts), each answered with the room: about 0.65 KB over the socket with what the way adds.
  for (let t = 0; t < 60_000; t += 500) {
    for (let i = 0; i < 3; i++) {
      socket.emit('message', { ...ping(slotId(1), connectionId, challenge), src: scanner });
      socket.send(pingAnswer(scanner, connectionId, room('ABCDEF')));
    }
    mock.timers.tick(500);
    if (socket.log.at(-1) !== 'started room tok') continue;
    swaps++;
    socket.log.length = 0;
    socket.opened();
    socket.emit('message', { type: 'OPEN' });
  }
  assert.ok(swaps >= 20 && swaps <= 26, `${swaps} in a minute`);
});

test('a swap waits while a connection is being set up, to 8 KB', () => {
  const { socket, peer } = freshPeer();
  peer.connections = { guest: [{ open: false }] };
  socket.emit('message', { type: 'OFFER', payload: 'x'.repeat(6500) });
  mock.timers.tick(3000);
  assert.deepEqual(socket.log, [], 'waits for it');
  peer.connections.guest[0].open = true;
  mock.timers.tick(1100);
  assert.deepEqual(socket.log, ['closed', 'started room tok']);
  const again = freshPeer();
  again.peer.connections = { guest: [{ open: false }] };
  again.socket.emit('message', { type: 'OFFER', payload: 'x'.repeat(8500) });
  mock.timers.tick(1100);
  assert.deepEqual(again.socket.log, ['closed', 'started room tok'], 'not past 8 KB');
});

test("peers made on ours have ids from getRandomValues (randomUUID isn't on plain http or older Safari)", () => {
  useServers(true, 'own');
  const uuid = crypto.randomUUID;
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    const peer = newPeer(Peer as never, undefined);
    assert.match(peer.id, /^[A-Za-z0-9]{24}$/);
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: uuid, configurable: true });
  }
});
