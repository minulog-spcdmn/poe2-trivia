// The workers that prepare the host's pictures (lib/prepPool.ts): a worker
// the phone stopped in the background answers nothing, so what it had is
// prepared on the page and a fresh one takes its place; back from a long
// while hidden they all start afresh; one that dies with an error isn't
// replaced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrepPool, HIDDEN_RESTART_MS } from '../src/lib/prepPool.ts';
import type { PrepJob, Prepped } from '../src/lib/prepArt.ts';

/** A worker that keeps what it is sent, answers when told, and notes being let go. */
class FakeWorker {
  sent: { t: string; id?: number }[] = [];
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage(m: { t: string; id?: number }) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  answer(id: number, prepped: unknown) {
    this.onmessage?.({ data: { id, prepped } });
  }
  get jobs() {
    return this.sent.filter((m) => m.t === 'prep').map((m) => m.id!);
  }
}

function pool(size: number, stallMs = 30) {
  const made: FakeWorker[] = [];
  const p = new PrepPool(() => {
    const w = new FakeWorker();
    made.push(w);
    return w as unknown as Worker;
  }, size, stallMs);
  return { p, made };
}

const job = { w: 1, h: 1, most: 2, grayscale: false, mirror: false } as PrepJob;
const file = new Blob([]);
const onPage = { data: new ArrayBuffer(1), w: 1, h: 1, page: true } as unknown as Prepped;
const inWorker = { data: new ArrayBuffer(1), w: 1, h: 1 } as unknown as Prepped;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a picture the worker answers comes from the worker', async () => {
  const { p, made } = pool(1);
  const got = p.prep(file, job, async () => onPage)!;
  made[0].answer(made[0].jobs[0], inWorker);
  assert.equal(await got, inWorker);
  // Nothing in hand: nothing watched, so it isn't let go for idling.
  await wait(60);
  assert.equal(made[0].terminated, false);
});

test("a worker that never answers is let go: its pictures are prepared on the page, and a fresh one takes its place", async () => {
  const { p, made } = pool(1);
  let page = 0;
  const got = p.prep(file, job, async () => (page++, onPage))!;
  assert.equal(await got, onPage);
  assert.equal(page, 1);
  assert.equal(made[0].terminated, true);
  assert.equal(made.length, 2);
  assert.equal(p.count, 1);
  // The fresh one is warmed, and the next picture goes to it.
  assert.deepEqual(made[1].sent, [{ t: 'warm' }]);
  const next = p.prep(file, job, async () => onPage)!;
  made[1].answer(made[1].jobs[0], inWorker);
  assert.equal(await next, inWorker);
});

test('a worker busy with several is watched from its last answer, not from when each went in', async () => {
  const { p, made } = pool(1, 50);
  const w = made[0];
  const a = p.prep(file, job, async () => onPage)!;
  const b = p.prep(file, job, async () => onPage)!;
  await wait(35);
  w.answer(w.jobs[0], inWorker);
  await wait(35);
  // 70 ms since b went in, 35 since the last answer: still in hand.
  assert.equal(w.terminated, false);
  w.answer(w.jobs[1], inWorker);
  assert.equal(await a, inWorker);
  assert.equal(await b, inWorker);
});

test('back after a long while hidden, every worker starts afresh; a short look away changes nothing', async () => {
  const { p, made } = pool(2, 10_000);
  const got = p.prep(file, job, async () => onPage)!;
  p.cameBack(HIDDEN_RESTART_MS - 1);
  assert.equal(made.length, 2);
  p.cameBack(HIDDEN_RESTART_MS);
  assert.ok(made.slice(0, 2).every((w) => w.terminated));
  assert.equal(made.length, 4);
  assert.equal(p.count, 2);
  // What one had in hand is prepared on the page.
  assert.equal(await got, onPage);
});

test('a worker that dies with an error is not replaced', async () => {
  const { p, made } = pool(2);
  const got = p.prep(file, job, async () => onPage)!;
  const busy = made.find((w) => w.jobs.length)!;
  busy.onerror?.();
  assert.equal(await got, onPage);
  assert.equal(p.count, 1);
  assert.equal(made.length, 2);
  // One that stalls later is still replaced, up to the one left.
  const other = made.find((w) => w !== busy)!;
  const next = p.prep(file, job, async () => onPage)!;
  assert.equal(await next, onPage);
  assert.equal(other.terminated, true);
  assert.equal(p.count, 1);
});

test('a dropped picture is let go at once, and its worker no longer watched for it', async () => {
  const { p, made } = pool(1);
  const stop = new AbortController();
  const got = p.prep(file, job, async () => onPage, stop.signal)!;
  stop.abort(new Error('gone'));
  await assert.rejects(got, /gone/);
  assert.deepEqual(made[0].sent.at(-1), { t: 'drop', id: made[0].jobs[0] });
  await wait(60);
  assert.equal(made[0].terminated, false);
});
