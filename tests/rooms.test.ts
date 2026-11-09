// The public room list with no server of its own (lib/rooms.ts), against a
// signalling server in memory (tests/fakePeerjs.ts): a scan stops after a
// batch of slots nobody holds and lists no more than its most, never
// connects to a slot (one that answers no ping is held, and unheard), fails
// where the server stops answering, an invite takes only its own room's
// word, and a hosted room holds the lowest free slot and moves down when a
// lower one frees up.
import { fakeModule } from './asVite.ts';
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

fakeModule('peerjs', new URL('./fakePeerjs.ts', import.meta.url));
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
const { default: Peer, net } = await import('./fakePeerjs.ts');
const { Beacon, MAX_LISTED, ProbeDesk, answerProbes, probeRoom, scanRooms, slotId } = await import('../src/lib/rooms.ts');
const { PEER_PREFIX } = await import('../src/lib/peer.ts');
const { KEEP_UNHEARD_MS, LastHeard } = await import('../src/lib/roomRefresh.ts');
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
const SLOTS = slotId(0).slice(0, -1);
const slotOf = (id: string) => Number(id.slice(SLOTS.length));
/** The slots pinged, in order (not the id nobody holds that a scan asks after beside each batch). */
const slotsPinged = () => net.pinged.filter((id) => id.startsWith(SLOTS)).map(slotOf);
/** A scan under way: the rooms it finds, the slot of each, and the slots that answered none of its pings. */
async function scanning() {
  const found: RoomInfo[] = [];
  const slots: number[] = [];
  const unheard = await scanRooms(
    (r, slot) => {
      found.push(r);
      slots.push(slot);
    },
    () => false,
  );
  return { found, slots, unheard };
}
/** A scan, through. */
const scanned = () => settle(scanning());
const scan = async () => (await scanned()).found;
/** What a scan failed with (null: it didn't). */
const failure = (p: Promise<unknown>) => settle(p.then(() => null, (e: unknown) => String(e)));

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
  const { found, slots, unheard } = await scanned();
  assert.deepEqual(found.map((r) => r.code), [1, 2, 3, 12].map(codeOf));
  assert.deepEqual(slots, [1, 2, 3, 12], 'each with the slot it holds');
  assert.deepEqual(unheard, []);
  // Slot 12 kept it going past the second batch; the third, empty, ended it.
  assert.equal(Math.max(...slotsPinged()), 30);
  assert.deepEqual(net.connected, [], 'nobody connected to');
});

test('a slot held by someone who answers no ping keeps the scan going, is asked twice and never connected to, and counts as a room unheard', async () => {
  silent(1);
  listed(11);
  const { found, unheard } = await scanned();
  assert.deepEqual(found.map((r) => r.code), [codeOf(11)]);
  assert.equal(net.pinged.filter((id) => id === slotId(1)).length, 2);
  assert.deepEqual(net.connected, [], 'nobody connected to');
  assert.deepEqual(unheard, [1]);
});

test('a room past its share of pings is connected to by nobody: the scans it lets go count it as held, and unheard', async () => {
  listed(1);
  listed(11);
  // Seventy start pages scanning within the same ten seconds: the room answers sixty pings in ten (probeDesk.ts).
  const scans = await settle(Promise.all(Array.from({ length: 70 }, scanning)));
  const heard = scans.filter((s) => s.found.some((r) => r.code === codeOf(1)));
  assert.equal(heard.length, 60);
  assert.ok(heard.every((s) => s.unheard.length === 0));
  const letGo = scans.filter((s) => !heard.includes(s));
  assert.ok(letGo.every((s) => String(s.unheard) === '1'), 'each knows which slot it missed');
  assert.ok(scans.every((s) => s.found.some((r) => r.code === codeOf(11))), 'and went on past it to the next batch');
  // Each asked the slot once more, 5.5 s on, and left it at that.
  assert.equal(net.pinged.filter((id) => id === slotId(1)).length, 70 + 10);
  assert.deepEqual(net.connected, [], 'the host sets up no connection for any of them');
});

test('a whole batch of slots that answer no ping is gone past like one of them, while the server answers: the rooms beyond are found', async () => {
  for (let n = 1; n <= 10; n++) silent(n);
  listed(11);
  const { found, unheard } = await scanned();
  assert.deepEqual(found.map((r) => r.code), [codeOf(11)]);
  assert.deepEqual(unheard, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(net.connected, []);
});

test('the id nobody holds is asked after once a batch, and no more once the batch is through', async () => {
  for (let n = 1; n <= 10; n++) listed(n);
  // As the real server, whose word that nobody holds an id comes seconds later (tests/peerServerFree.test.ts).
  net.freeIn = 6000;
  const { found } = await scanned();
  assert.equal(found.length, 10);
  const nobody = net.pinged.filter((id) => !id.startsWith(SLOTS));
  assert.equal(new Set(nobody).size, 2, 'an id of its own beside each batch');
  // The first batch, all rooms, is through at once, and its id is let go of. The second, all free, waits out the server, and asks again 5.5 s in like its slots.
  assert.equal(nobody.length, 3);
});

test("on a slow link a free slot isn't taken for a held one: the scan waits for the server's word on the id nobody holds before it calls a slot silent", async () => {
  silent(1);
  listed(2);
  listed(11);
  // The server's word that nobody holds an id, five to six seconds in the making, takes a round trip of two more.
  net.freeIn = 8000;
  const { found, unheard } = await scanned();
  assert.deepEqual(found.map((r) => r.code), [codeOf(2), codeOf(11)]);
  assert.deepEqual(unheard, [1], 'the one slot that is held and says nothing; none of the free ones');
  assert.equal(Math.max(...slotsPinged()), 30, 'and the rooms end where the server says a whole batch is free');
});

test('a scan the server stops answering fails: the silence is read neither as rooms nor as their end', async () => {
  listed(1);
  // What the scan sends gets nowhere and nothing comes back, though its socket stays up.
  net.lost = true;
  assert.match((await failure(scanning())) ?? '', /stopped answering/);
  assert.equal(Math.max(...slotsPinged()), 10, 'asked no further');
});

test('a scan cut off from the server on the way fails too', async () => {
  silent(1);
  listed(2);
  const failed = failure(scanning());
  await run(1000);
  // (The scan's own peer: the last made.)
  net.made.at(-1)!.disconnected = true;
  assert.match((await failed) ?? '', /stopped answering/);
  assert.deepEqual(net.connected, []);
});

test('scan after scan, a room that answers no ping stays as last heard, ten minutes at most, and one that closed goes at once', async () => {
  const [busy, closing] = [listed(1), listed(2)];
  listed(3);
  // As the list keeps them (components/OpenRooms.svelte).
  const last = new LastHeard();
  let rooms: RoomInfo[] = [];
  const refreshed = async () => {
    const found = new Map<string, RoomInfo>();
    const heard = (r: RoomInfo, slot: number) => {
      found.set(r.code, r);
      last.heard(r.code, slot, Date.now());
    };
    // (null: the scan failed.)
    const unheard = await settle(scanRooms(heard, () => false).catch(() => null));
    rooms = last.after(rooms, found, unheard, Date.now());
    return rooms.map((r) => r.code).sort();
  };
  assert.deepEqual(await refreshed(), [1, 2, 3].map(codeOf));
  // Room 1 is asked too often to answer; room 2, heard as lately, closes.
  busy.destroy();
  silent(1);
  closing.destroy();
  assert.deepEqual(await refreshed(), [1, 3].map(codeOf));
  mock.timers.tick(KEEP_UNHEARD_MS / 2);
  assert.deepEqual(await refreshed(), [1, 3].map(codeOf));
  mock.timers.tick(KEEP_UNHEARD_MS / 2);
  assert.deepEqual(await refreshed(), [3].map(codeOf));
  // The server can't be reached: what the list shows stays as last heard, and no longer than that either.
  net.down = true;
  assert.deepEqual(await refreshed(), [3].map(codeOf));
  mock.timers.tick(KEEP_UNHEARD_MS);
  assert.deepEqual(await refreshed(), []);
  assert.deepEqual(net.connected, []);
});

test('a scan takes one socket on the signalling server, and lets it go', async () => {
  listed(1);
  const before = net.made.length;
  await scan();
  const mine = net.made.slice(before);
  assert.equal(mine.length, 1);
  assert.ok(mine[0].destroyed);
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
  assert.equal(Math.max(...slotsPinged()), MAX_LISTED);
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
  // Nothing listed after it was left, and nothing asked past the batch in flight then, nor asked again.
  assert.equal(found.length, 5);
  assert.deepEqual(slotsPinged().sort((a, b) => a - b), Array.from({ length: 10 }, (_, i) => i + 1));
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
