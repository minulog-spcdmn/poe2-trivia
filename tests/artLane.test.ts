import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeLaneMsg,
  encodeLaneMsg,
  LANE_FRAME_BYTES,
  LANE_HIGH_BYTES,
  LANE_LOW_BYTES,
  LANE_OPEN_MS,
  LaneReceiver,
  LaneSender,
  MAX_LANE_MESSAGE,
  parseFakeLink,
  type LaneChannel,
} from '../src/lib/artLane.ts';
import { parseHostMsg } from '../src/lib/protocol.ts';

/** A data channel that keeps what it was sent, and drains when told to. */
class FakeChannel implements LaneChannel {
  readyState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType = 'arraybuffer';
  sent: ArrayBuffer[] = [];
  private listeners = new Map<string, ((e: { data?: unknown }) => void)[]>();
  send(data: Uint8Array) {
    this.sent.push(data.slice().buffer);
    this.bufferedAmount += data.byteLength;
  }
  addEventListener(type: string, listener: (e: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  /** The network took everything; the browser says the buffer is low. */
  drain() {
    this.bufferedAmount = 0;
    for (const l of this.listeners.get('bufferedamountlow') ?? []) l({});
  }
  fire(type: string) {
    for (const l of this.listeners.get(type) ?? []) l({});
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.fire('close');
  }
}

const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255).buffer;

test('a message comes through whole: its fields and its bytes', () => {
  const msg = { t: 'veil', qid: 1790642896195, tile: 2, w: 212, h: 316, burn: 900, count: 40, box: [1, 2, 3, 4], data: bytes(5000), labels: bytes(400, 7) };
  const back = decodeLaneMsg(encodeLaneMsg(msg))!;
  assert.deepEqual({ ...back, data: undefined, labels: undefined }, { ...msg, data: undefined, labels: undefined });
  assert.deepEqual(new Uint8Array(back.data as ArrayBuffer), new Uint8Array(msg.data));
  assert.deepEqual(new Uint8Array(back.labels as ArrayBuffer), new Uint8Array(msg.labels));
  assert.ok(parseHostMsg(back), 'what comes out passes the same check as media on the main channel');
});

test('a big picture goes out in frames and is put together again', () => {
  const ch = new FakeChannel();
  const sender = new LaneSender(ch);
  const got: Record<string, unknown>[] = [];
  const receiver = new LaneReceiver((m) => got.push(m));
  const picture = { t: 'art', qid: 5, w: 212, h: 212, data: bytes(300_000) };
  const patch = { t: 'patch', qid: 5, i: 3 };
  sender.send(picture);
  sender.send(patch);
  while (ch.sent.length || sender.backlog) {
    for (const f of ch.sent.splice(0)) {
      assert.ok(f.byteLength <= LANE_FRAME_BYTES);
      assert.ok(receiver.take(f));
    }
    ch.drain();
  }
  assert.equal(got.length, 2);
  assert.deepEqual(new Uint8Array(got[0].data as ArrayBuffer), new Uint8Array(picture.data));
  assert.deepEqual(got[1], patch);
});

test('the lane never holds much more than its high mark: the rest waits', () => {
  const ch = new FakeChannel();
  const sender = new LaneSender(ch);
  sender.send({ t: 'art', qid: 5, w: 1, h: 1, data: bytes(400_000) });
  assert.ok(ch.bufferedAmount < LANE_HIGH_BYTES + LANE_FRAME_BYTES);
  assert.ok(sender.backlog > 300_000, 'what is left is still counted');
  assert.equal(ch.bufferedAmountLowThreshold, LANE_LOW_BYTES);
  ch.drain();
  assert.ok(ch.bufferedAmount > 0, 'more goes out once the buffer is low');
});

test('nothing goes out before the lane opens, and all of it once it does', () => {
  const ch = new FakeChannel();
  ch.readyState = 'connecting';
  const sender = new LaneSender(ch);
  sender.send({ t: 'patch', qid: 5, i: 1 });
  assert.equal(ch.sent.length, 0);
  assert.ok(sender.backlog > 0);
  ch.readyState = 'open';
  ch.fire('open');
  assert.equal(ch.sent.length, 1);
});

test("what hasn't gone yet of a question gone by is dropped, and the next one's art still comes through whole", () => {
  const ch = new FakeChannel();
  const sender = new LaneSender(ch);
  const got: Record<string, unknown>[] = [];
  const receiver = new LaneReceiver((m) => got.push(m));
  sender.send({ t: 'sealed', kid: '5-a', iv: bytes(12), data: bytes(300_000) });
  // Some of it is on its way already: the guest has the start of it.
  for (const f of ch.sent.splice(0)) assert.ok(receiver.take(f));
  ch.drain();
  for (const f of ch.sent.splice(0)) assert.ok(receiver.take(f));
  assert.ok(sender.backlog > 100_000);
  sender.clear();
  assert.equal(sender.backlog, ch.bufferedAmount, 'only what the lane holds is left');
  const next = { t: 'sealed', kid: '6-b', iv: bytes(12), data: bytes(40_000, 3) };
  sender.send(next);
  while (ch.sent.length || sender.backlog) {
    for (const f of ch.sent.splice(0)) assert.ok(receiver.take(f), 'a message cut short gives way to the next');
    ch.drain();
  }
  assert.equal(got.length, 1);
  assert.equal(got[0].kid, '6-b');
  assert.deepEqual(new Uint8Array(got[0].data as ArrayBuffer), new Uint8Array(next.data));
});

test("a race's next question sent ahead stays when what is left of the one before is dropped", () => {
  const ch = new FakeChannel();
  const sender = new LaneSender(ch);
  const got: Record<string, unknown>[] = [];
  const receiver = new LaneReceiver((m) => got.push(m));
  sender.send({ t: 'sealed', kid: '5-a', iv: bytes(12), data: bytes(300_000) });
  sender.send({ t: 'patch', qid: 5, i: 2 });
  for (const f of ch.sent.splice(0)) assert.ok(receiver.take(f));
  // The next question's art, drawn ahead, goes behind it.
  const from = sender.mark;
  const ahead = [
    { t: 'sealed', kid: '6-b', iv: bytes(12), data: bytes(90_000, 3) },
    { t: 'sealed', kid: '6-b', iv: bytes(12), data: bytes(20_000, 4) },
  ];
  for (const m of ahead) sender.send(m);
  const before = sender.backlog;
  // The next question is asked: only the question gone by makes way.
  sender.clearBefore(from);
  assert.ok(sender.backlog < before);
  assert.ok(sender.backlog >= 110_000, "the next one's art is all still to go");
  while (ch.sent.length || sender.backlog) {
    for (const f of ch.sent.splice(0)) assert.ok(receiver.take(f), 'a message cut short gives way to the next');
    ch.drain();
  }
  assert.deepEqual(
    got.map((m) => m.kid),
    ['6-b', '6-b'],
  );
  assert.deepEqual(new Uint8Array(got[0].data as ArrayBuffer), new Uint8Array(ahead[0].data));
  assert.deepEqual(new Uint8Array(got[1].data as ArrayBuffer), new Uint8Array(ahead[1].data));
  // With nothing of the one before left, it drops nothing.
  sender.send({ t: 'patch', qid: 6, i: 1 });
  const m = sender.mark;
  sender.send({ t: 'patch', qid: 7, i: 1 });
  sender.clearBefore(m);
  assert.equal(ch.sent.length, 2, 'what the lane had room for went at once');
});

test('a lane that closes lets go of what it held, says so once, and takes nothing more', () => {
  const ch = new FakeChannel();
  let dead = 0;
  const sender = new LaneSender(ch, null, () => dead++);
  sender.send({ t: 'art', qid: 5, w: 1, h: 1, data: bytes(300_000) });
  assert.ok(sender.backlog > 200_000);
  ch.close();
  assert.equal(dead, 1);
  assert.equal(sender.backlog, 0, 'nothing is left waiting on it: the clock waits for nobody on a dead lane');
  assert.equal(sender.usable, false, 'what comes next goes the main channel');
  ch.fire('close');
  assert.equal(dead, 1);
});

test("a lane that never opens is closed in time, and what waited on it given up", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ch = new FakeChannel();
  ch.readyState = 'connecting';
  let dead = 0;
  const sender = new LaneSender(ch, null, () => dead++);
  sender.send({ t: 'patch', qid: 5, i: 1 });
  t.mock.timers.tick(LANE_OPEN_MS - 1);
  assert.equal(dead, 0);
  t.mock.timers.tick(1);
  assert.equal(dead, 1);
  assert.equal(ch.readyState, 'closed');
  assert.equal(sender.backlog, 0);
});

test('a question drawn ahead and thrown away: only its own frames go', () => {
  const ch = new FakeChannel();
  const sender = new LaneSender(ch);
  const got: Record<string, unknown>[] = [];
  const receiver = new LaneReceiver((m) => got.push(m));
  sender.send({ t: 'art', qid: 5, w: 1, h: 1, data: bytes(100_000) });
  const from = sender.mark;
  sender.send({ t: 'sealed', kid: '6-b', iv: bytes(12), data: bytes(90_000, 3) });
  const to = sender.mark;
  sender.send({ t: 'patch', qid: 5, i: 1 });
  sender.drop(from, to);
  while (ch.sent.length || sender.backlog) {
    for (const f of ch.sent.splice(0)) assert.ok(receiver.take(f));
    ch.drain();
  }
  assert.deepEqual(
    got.map((m) => m.t),
    ['art', 'patch'],
  );
});

test('frames no real host sends are turned down', () => {
  const r = new LaneReceiver(() => assert.fail('nothing should come out'));
  const frame = (n: number, total: number, at: number, body = 0) => {
    const f = new Uint8Array(12 + body);
    const v = new DataView(f.buffer);
    v.setUint32(0, n);
    v.setUint32(4, total);
    v.setUint32(8, at);
    return f.buffer;
  };
  assert.equal(r.take('text'), false);
  assert.equal(r.take(new ArrayBuffer(4)), false);
  assert.equal(r.take(new ArrayBuffer(LANE_FRAME_BYTES + 1)), false);
  assert.equal(r.take(frame(1, MAX_LANE_MESSAGE + 1, 0, 10)), false, 'too big a message');
  assert.equal(r.take(frame(1, 100, 50, 10)), false, 'a middle with no start');
  assert.ok(r.take(frame(2, 100, 0, 10)));
  assert.equal(r.take(frame(2, 100, 20, 10)), false, 'a gap');
  assert.ok(r.take(frame(3, 100, 0, 10)), 'a new message starts over');
  assert.equal(r.take(frame(4, 100, 10, 10)), false, 'another message mid-way');
  assert.equal(decodeLaneMsg(new Uint8Array([0, 0, 0, 2, 123, 125, 9])), null, 'bytes left over');
  assert.equal(decodeLaneMsg(new Uint8Array([0, 0, 0, 9, 1])), null, 'a head longer than the message');
});

test('a fake far link is read from "<round trip>,<KB/s>" and nothing else', () => {
  assert.deepEqual(parseFakeLink('350,40'), { delayMs: 175, bytesPerSec: 40 * 1024 });
  assert.deepEqual(parseFakeLink(' 300 , 30 '), { delayMs: 150, bytesPerSec: 30 * 1024 });
  for (const v of [null, '', '350', '350,0', 'fast', '-1,40']) assert.equal(parseFakeLink(v), null, String(v));
});

test('on a fake far link frames trickle out at its rate, and still count as waiting', async () => {
  const ch = new FakeChannel();
  const sender = new LaneSender(ch, { delayMs: 20, bytesPerSec: 1024 * 1024 });
  sender.send({ t: 'art', qid: 5, w: 1, h: 1, data: bytes(40_000) });
  assert.equal(ch.sent.length, 0, 'nothing before half the round trip');
  assert.ok(sender.backlog >= 40_000);
  await new Promise((r) => setTimeout(r, 120));
  ch.drain();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(sender.backlog, ch.bufferedAmount);
  assert.equal(ch.sent.reduce((n, f) => n + f.byteLength, 0) > 40_000, true);
});
