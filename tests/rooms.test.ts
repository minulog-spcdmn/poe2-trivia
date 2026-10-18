// The public room list with no server of its own (lib/rooms.ts), against a
// signalling server in memory (tests/fakePeerjs.ts): a scan stops after a
// batch of slots nobody holds and lists no more than its most, an invite
// takes only its own room's word, and a hosted room holds the lowest free
// slot and moves down when a lower one frees up.
import { fakeModule } from './asVite.ts';
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

fakeModule('peerjs', new URL('./fakePeerjs.ts', import.meta.url));
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
const { default: Peer, net } = await import('./fakePeerjs.ts');
const { Beacon, MAX_LISTED, ProbeDesk, answerProbes, probeRoom, scanRooms, slotId } = await import('../src/lib/rooms.ts');
const { PEER_PREFIX } = await import('../src/lib/peer.ts');
const { CODE_ALPHABET } = await import('../src/lib/roomCode.ts');
type RoomInfo = import('../src/lib/roomInfo.ts').RoomInfo;

const room = (code: string, host = 'Ash'): RoomInfo => ({
  code,
  host,
  players: 1,
  maxPlayers: 12,
  spectators: 0,
  maxSpectators: 8,
  mode: 'turns',
  difficulty: 'merciless',
  target: 10,
  phase: 'lobby',
});
/** A room code for slot n (from the codes' own letters, CODE_ALPHABET). */
const codeOf = (n: number) => `ROOM${CODE_ALPHABET[Math.floor(n / 32)]}${CODE_ALPHABET[n % 32]}`.replaceAll('O', 'Q');

/** A room holding slot n that answers pings with its info. */
function listed(n: number, info = room(codeOf(n))) {
  const peer = Peer.hold(slotId(n));
  answerProbes(peer as never, new ProbeDesk(() => info));
  return peer;
}
/** Someone holding slot n who answers no ping (an older version). */
const silent = (n: number) => Peer.hold(slotId(n));

const flush = () => new Promise((r) => setImmediate(r));
/** Runs the clock on until `p` settles (at most `limit` ms), letting everything waiting on it run between steps. */
async function settle<T>(p: Promise<T>, limit = 120_000): Promise<T> {
  let done = false;
  let out: T;
  void p.then((v) => ((done = true), (out = v)));
  for (let t = 0; !done && t < limit; t += 100) {
    await flush();
    mock.timers.tick(100);
  }
  await flush();
  assert.ok(done, `settled within ${limit} ms`);
  return out!;
}
/** Lets the clock run for `ms`. */
async function run(ms: number) {
  for (let t = 0; t < ms; t += 100) {
    await flush();
    mock.timers.tick(100);
  }
  await flush();
}
const slotOf = (id: string) => Number(id.slice(slotId(0).length - 1));
const scan = async () => {
  const found: RoomInfo[] = [];
  await settle(scanRooms((r) => found.push(r), () => false));
  return found;
};

const beacons: InstanceType<typeof Beacon>[] = [];
/** A hosted room's beacon, started; stopped after the test whatever happens. */
function hosting(code: string) {
  const b = new Beacon(() => room(code));
  beacons.push(b);
  b.start();
  return b;
}

beforeEach(() => net.reset());
afterEach(() => beacons.splice(0).forEach((b) => b.stop()));

test('a scan lists every room and stops after the first batch of slots nobody holds', async () => {
  for (const n of [1, 2, 3, 12]) listed(n);
  const found = await scan();
  assert.deepEqual(found.map((r) => r.code).sort(), [1, 2, 3, 12].map(codeOf));
  // Slot 12 kept it going past the second batch; the third, empty, ended it.
  assert.equal(Math.max(...net.pinged.map(slotOf)), 30);
  assert.deepEqual(net.connected, [], 'nobody connected to');
});

test('a slot held by someone who answers no ping keeps the scan going, is connected to after the second ping, and lists nothing', async () => {
  silent(1);
  listed(11);
  const found = await scan();
  assert.deepEqual(found.map((r) => r.code), [codeOf(11)]);
  assert.equal(net.pinged.filter((id) => id === slotId(1)).length, 2);
  assert.deepEqual(net.connected, [slotId(1)]);
});

test('a room under an offensive name holds its slot for the scan but is never listed', async () => {
  listed(1, room(codeOf(1), 'nigger'));
  listed(11);
  const found = await scan();
  assert.deepEqual(found.map((r) => r.code), [codeOf(11)]);
});

test('the list stops at its most rooms and asks no further', async () => {
  for (let n = 1; n <= MAX_LISTED + 15; n++) listed(n);
  const found = await scan();
  assert.equal(found.length, MAX_LISTED);
  assert.equal(Math.max(...net.pinged.map(slotOf)), MAX_LISTED);
});

test('a scan that is left stops asking', async () => {
  for (let n = 1; n <= 40; n++) listed(n);
  let left = false;
  const found: RoomInfo[] = [];
  await settle(
    scanRooms(
      (r) => {
        found.push(r);
        if (found.length === 5) left = true;
      },
      () => left,
    ),
  );
  assert.ok(found.length <= 10, `${found.length} listed`);
  assert.ok(Math.max(...net.pinged.map(slotOf)) <= 10);
});

test("an invite's probe takes the room's own word, 'gone' when nobody has the code, and nothing passed on from another room", async () => {
  const mine = Peer.hold(PEER_PREFIX + 'ABCDEF');
  answerProbes(mine as never, new ProbeDesk(() => room('ABCDEF')));
  const r = await settle(probeRoom('ABCDEF'));
  assert.equal(r && r !== 'gone' ? r.code : r, 'ABCDEF');
  assert.equal(await settle(probeRoom('ZZZZZZ')), 'gone');
  // A room answering under another room's code (signed for the held name, it would show as theirs).
  const other = Peer.hold(PEER_PREFIX + 'QQQQQQ');
  answerProbes(other as never, new ProbeDesk(() => room('ABCDEF')));
  assert.equal(await settle(probeRoom('QQQQQQ')), null);
});

test('a hosted room takes the lowest free slot, lets go of the others it tried, and is found by a scan', async () => {
  silent(1);
  silent(2);
  const beacon = hosting('BEACQN');
  await run(1000);
  const held = [...net.held.keys()].map(slotOf).sort((a, b) => a - b);
  assert.deepEqual(held, [1, 2, 3], 'slots 4 and 5, tried beside 3, let go of');
  const found = await scan();
  assert.deepEqual(found.map((r) => r.code), ['BEACQN']);
  beacon.stop();
  assert.equal(net.held.has(slotId(3)), false);
});

test('a hosted room that could not reach the server tries again from the first slot later', async () => {
  net.down = true;
  const beacon = hosting('BEACQN');
  await run(1000);
  assert.equal(net.held.size, 0);
  net.down = false;
  await run(8000);
  assert.equal(net.held.size, 0, 'not before ten seconds');
  await run(2000);
  assert.deepEqual([...net.held.keys()], [slotId(1)]);
  beacon.stop();
});

test('a hosted room moves down to a lower slot the server says is free, never to one held by someone silent', async () => {
  const holders = new Map<number, InstanceType<typeof Peer>>();
  for (let n = 1; n <= 12; n++) holders.set(n, n === 3 || n === 5 ? silent(n) : listed(n));
  const beacon = hosting('BEACQN');
  await run(1000);
  assert.ok(net.held.has(slotId(13)));
  // Slot 3's holder answers nothing but stays; slot 7's room closes.
  holders.get(7)!.destroy();
  // Compacting comes round within 35 s, and waits out the silent slots' second pings.
  await run(50_000);
  const found = await scan();
  assert.ok(found.some((r) => r.code === 'BEACQN'));
  assert.equal(net.held.has(slotId(13)), false, 'its old slot let go of');
  assert.ok(net.held.has(slotId(7)));
  assert.equal(net.held.get(slotId(3)), holders.get(3), 'the silent slot left to its holder');
  assert.equal(net.held.get(slotId(5)), holders.get(5));
  beacon.stop();
  assert.equal(net.held.has(slotId(7)), false);
});
