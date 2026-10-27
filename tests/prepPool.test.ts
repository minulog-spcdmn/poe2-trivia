// The workers that prepare the host's pictures (lib/prepPool.ts): a worker
// the phone stopped in the background answers nothing, so a fresh one takes
// its place and what it had goes on to another (then to the page); one whose
// script is still on its way is given longer; back from a long while hidden,
// each is asked whether it is still there and only the silent ones replaced;
// one that won't start isn't replaced. A stall watch that comes due only as
// a frozen page thaws waits again rather than let a worker go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrepPool, HIDDEN_CHECK_MS, onShownAgain, stallWatch } from '../src/lib/prepPool.ts';
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
  say(data: unknown) {
    this.onmessage?.({ data });
  }
  /** Warmed up: it has said a word. */
  ready() {
    this.say({ t: 'ready' });
  }
  answer(id: number, prepped: unknown) {
    this.say({ t: 'prep', id, prepped });
  }
  get jobs() {
    return this.sent.filter((m) => m.t === 'prep').map((m) => m.id!);
  }
  got(t: string) {
    return this.sent.filter((m) => m.t === t).length;
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

test('every worker warms up as it starts, and a picture it answers comes from it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { p, made } = pool(2);
  assert.ok(made.every((w) => w.got('warm') === 1));
  made.forEach((w) => w.ready());
  const got = p.prep(file, job, async () => onPage)!;
  const w = made.find((x) => x.jobs.length)!;
  w.answer(w.jobs[0], inWorker);
  assert.equal(await got, inWorker);
  // Nothing in hand: nothing watched, so it isn't let go for idling.
  t.mock.timers.tick(60);
  assert.ok(made.every((x) => !x.terminated));
});

test('a worker that stops answering is replaced, and what it had goes to the fresh one', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { p, made } = pool(1);
  made[0].ready();
  const got = p.prep(file, job, async () => onPage)!;
  t.mock.timers.tick(60);
  assert.equal(made[0].terminated, true);
  assert.equal(made.length, 2);
  assert.equal(p.count, 1);
  assert.equal(made[1].got('warm'), 1);
  assert.equal(made[1].jobs.length, 1);
  made[1].answer(made[1].jobs[0], inWorker);
  assert.equal(await got, inWorker);
});

test('a picture two workers in a row sat on is prepared on the page', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { p, made } = pool(1);
  made[0].ready();
  let page = 0;
  const got = p.prep(file, job, async () => (page++, onPage))!;
  t.mock.timers.tick(40);
  // The fresh one starts, then goes quiet too.
  made[1].ready();
  t.mock.timers.tick(30);
  assert.equal(await got, onPage);
  assert.equal(page, 1);
  assert.equal(made[1].terminated, true);
});

test('a worker still starting (its script on a slow link) is given longer than the stall', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { p, made } = pool(1, 30);
  const got = p.prep(file, job, async () => onPage)!;
  t.mock.timers.tick(80);
  assert.equal(made[0].terminated, false);
  // Once it speaks, the usual watch applies to what it still has.
  made[0].ready();
  made[0].answer(made[0].jobs[0], inWorker);
  assert.equal(await got, inWorker);
});

test('a worker busy with several is watched from its last answer, not from when each went in', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { p, made } = pool(1, 50);
  const w = made[0];
  w.ready();
  const a = p.prep(file, job, async () => onPage)!;
  const b = p.prep(file, job, async () => onPage)!;
  t.mock.timers.tick(35);
  w.answer(w.jobs[0], inWorker);
  t.mock.timers.tick(35);
  // 70 ms since b went in, 35 since the last answer: still in hand.
  assert.equal(w.terminated, false);
  w.answer(w.jobs[1], inWorker);
  assert.equal(await a, inWorker);
  assert.equal(await b, inWorker);
});

test('back after a long while hidden, each worker is asked; only one that keeps quiet is replaced', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { p, made } = pool(2, 30);
  made.forEach((w) => w.ready());
  p.cameBack(HIDDEN_CHECK_MS - 1);
  assert.ok(made.every((w) => w.got('ping') === 0));
  p.cameBack(HIDDEN_CHECK_MS);
  assert.ok(made.every((w) => w.got('ping') === 1));
  made[0].say({ t: 'pong' });
  t.mock.timers.tick(60);
  assert.equal(made[0].terminated, false);
  assert.equal(made[1].terminated, true);
  assert.equal(made.length, 3);
  assert.equal(p.count, 2);
});

test('back from the background, one busy with a picture (answering only between its steps) has the full stall to answer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { p, made } = pool(1, 5000);
  made[0].ready();
  const got = p.prep(file, job, async () => onPage)!;
  p.cameBack(HIDDEN_CHECK_MS);
  t.mock.timers.tick(4000);
  assert.equal(made[0].terminated, false);
  made[0].say({ t: 'pong' });
  made[0].answer(made[0].jobs[0], inWorker);
  assert.equal(await got, inWorker);
});

test("one that won't start is not replaced; what it had goes to another", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { p, made } = pool(2, 10_000);
  const got = p.prep(file, job, async () => onPage)!;
  const busy = made.find((w) => w.jobs.length)!;
  const other = made.find((w) => w !== busy)!;
  busy.onerror?.();
  assert.equal(p.count, 1);
  assert.equal(made.length, 2);
  other.ready();
  other.answer(other.jobs[0], inWorker);
  assert.equal(await got, inWorker);
});

test('one that ran and then died is replaced', () => {
  const { p, made } = pool(1);
  made[0].ready();
  made[0].onerror?.();
  assert.equal(p.count, 1);
  assert.equal(made.length, 2);
});

test('a dropped picture is let go at once, and its worker no longer watched for it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { p, made } = pool(1);
  made[0].ready();
  const stop = new AbortController();
  const got = p.prep(file, job, async () => onPage, stop.signal)!;
  stop.abort(new Error('gone'));
  await assert.rejects(got, /gone/);
  assert.deepEqual(made[0].sent.at(-1), { t: 'drop', id: made[0].jobs[0] });
  t.mock.timers.tick(60);
  assert.equal(made[0].terminated, false);
});

test('the page shown again says how long it was hidden, once for each time', () => {
  const doc = new EventTarget() as EventTarget & { hidden: boolean };
  doc.hidden = false;
  let t = 1000;
  const backs: number[] = [];
  onShownAgain(doc as unknown as Document, (ms) => backs.push(ms), () => t);
  const flip = (hidden: boolean) => {
    doc.hidden = hidden;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  // Shown without having been hidden (as the page first shows): nothing.
  flip(false);
  flip(true);
  t += 45_000;
  flip(false);
  flip(false);
  flip(true);
  t += 2000;
  flip(false);
  assert.deepEqual(backs, [45_000, 2000]);
});

test('a stall watch: silent once its time is up; late by far (the page was frozen meanwhile), it waits as long again', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let clock = 0;
  const now = () => clock;
  let silent = 0;
  const pass = (ms: number) => {
    clock += ms;
    t.mock.timers.tick(ms);
  };
  stallWatch(5000, () => silent++, now);
  pass(5000);
  assert.equal(silent, 1, 'on time');

  stallWatch(5000, () => silent++, now);
  // (Frozen a minute: the wall clock runs on, and the timer comes due as the page thaws.)
  clock += 60_000;
  t.mock.timers.tick(5000);
  assert.equal(silent, 1, 'waited on again');
  pass(4999);
  assert.equal(silent, 1);
  pass(1);
  assert.equal(silent, 2, 'silent all that while after');

  const answered = stallWatch(5000, () => silent++, now);
  clock += 60_000;
  t.mock.timers.tick(5000);
  answered();
  pass(5000);
  assert.equal(silent, 2, 'an answer cancels it, waiting again or not');
});
