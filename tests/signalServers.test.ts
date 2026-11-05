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
const { PEER_PREFIX, alsoOn, chooseServer, pageServer, peerJsNow, peerOptions, useServers } = await import('../src/lib/peer.ts');
const { ProbeDesk, answerProbes, probeRoom, slotId } = await import('../src/lib/rooms.ts');
const { OWN_SIGNAL_HOST } = await import('../src/lib/signalHost.ts');
type RoomInfo = import('../src/lib/roomInfo.ts').RoomInfo;

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
const guests = () => net.made.filter((p) => p.id.startsWith('anon-'));
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
  // Well past the page's start: a page just shown takes what the server says as about attempts from before (count.ts hiddenSince).
  mock.timers.setTime(Date.now() + 60_000);
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

test("a room on both servers is joined on the cloud alone, ours only looked at", async () => {
  hosted('ABCDEF', 'cloud');
  hosted('ABCDEF', 'own');
  session.join('ABCDEF', 'Bram');
  await run(3000);
  assert.deepEqual(joiners('cloud'), [PEER_PREFIX + 'ABCDEF']);
  assert.deepEqual(joiners('own'), []);
});

test("a guest the cloud turns away joins on ours, and doesn't look on the cloud", async () => {
  useServers(true, 'own');
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
  assert.equal(alsoOn(), null);
  session.host('Ash');
  await run(2000);
  assert.equal(session.status, 'ready');
  assert.equal(net.ownHeld.size, 0);
  assert.equal(peerOptions().host, undefined, "PeerJS's own default, the cloud");
});

test("a page meets on the cloud if it answers, on ours if only ours does, and looks again if neither did", async () => {
  const realFetch = globalThis.fetch;
  let answering = { cloud: true, own: true };
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const own = new URL(url).host === OWN_SIGNAL_HOST;
    asked.push(own ? 'own' : 'cloud');
    if (!answering[own ? 'own' : 'cloud']) throw new TypeError('Failed to fetch');
    return new Response('id');
  }) as typeof fetch;
  try {
    useServers(true, null);
    assert.equal(await chooseServer(), 'cloud');
    assert.deepEqual([pageServer(), alsoOn(), asked], ['cloud', 'own', ['cloud']]);

    useServers(true, null);
    asked.length = 0;
    answering = { cloud: false, own: true };
    assert.equal(await chooseServer(), 'own');
    assert.deepEqual([pageServer(), alsoOn(), asked], ['own', null, ['cloud', 'own']]);
    assert.equal(peerOptions().host, OWN_SIGNAL_HOST);

    useServers(true, null);
    answering = { cloud: false, own: false };
    assert.equal(await chooseServer(), 'cloud', 'offline: the cloud, as before');
    assert.equal(pageServer(), 'cloud');
    assert.notEqual(peerJsNow(false), null, 'peers made on it for a while');
    // Then looked at again before the next peer is made (a look from page load, the network back since).
    mock.timers.tick(11_000);
    assert.equal(peerJsNow(false), null);
    asked.length = 0;
    answering = { cloud: false, own: true };
    assert.equal(await chooseServer(), 'own');
    assert.deepEqual(asked, ['cloud', 'own']);
    assert.equal(pageServer(), 'own');
  } finally {
    globalThis.fetch = realFetch;
    useServers(true, 'cloud');
  }
});
