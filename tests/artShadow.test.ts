// An item picture's shadow is made in a worker (lib/artShadow.ts), and on
// the page where the worker can't. A worker let go of never answers again,
// not even what it had already sent: every job it held must still be made,
// or its picture keeps the CSS filter the shadow is there to replace. The
// worker is there before the first picture waits on it, and a shadow made
// ahead of its picture is the one the picture gets. One that falls silent
// (a phone stopped it in the background) is let go, what it held made on
// the page, and a fresh one takes its place; back from a long while in the
// background, an idle one is asked whether it's still there first. Run here
// against stand-ins for the browser's Worker, canvas, <img> and document.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

type Answer = { id: number; png?: Blob; worked?: number; cant?: boolean };
/** Workers made, each answering as `answer` says (after a turn, as a real one would), and silent once terminated, as a real one is. */
const workers: FakeWorker[] = [];
let answer: (w: FakeWorker, job: { id: number }) => void = () => {};
class FakeWorker {
  onmessage: ((e: { data: Answer }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  jobs = 0;
  constructor() {
    workers.push(this);
  }
  postMessage(job: { id: number }) {
    this.jobs++;
    setTimeout(() => answer(this, job));
  }
  reply(data: Answer) {
    if (!this.terminated) this.onmessage?.({ data });
  }
  terminate() {
    this.terminated = true;
  }
}

/** Shadows made on the page, on its canvases. */
let madeHere = 0;
const canvas = () => ({
  width: 0,
  height: 0,
  getContext: () => ({
    drawImage() {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  }),
  toBlob(done: (b: Blob) => void) {
    madeHere++;
    done(new Blob(['png'], { type: 'image/png' }));
  },
});
/** The page's document, hidden and shown again (hideFor). */
const listeners: (() => void)[] = [];
const doc = { hidden: false, createElement: canvas, addEventListener: (_: string, f: () => void) => listeners.push(f) };
/** The wall clock, wound on by hand: how long the page was hidden is timed by it (prepPool.ts onShownAgain). */
let away = 0;
const wallClock = Date.now;
Date.now = () => wallClock() + away;
const flip = (hidden: boolean) => {
  doc.hidden = hidden;
  for (const f of listeners) f();
};
/** The page hidden for `ms` by the wall clock, and shown again. */
function hideFor(ms: number) {
  flip(true);
  away += ms;
  flip(false);
}
Object.assign(globalThis, {
  Worker: FakeWorker,
  createImageBitmap: async () => ({ close() {} }),
  document: doc,
  Image: class {
    alt = '';
    src = '';
    decode = async () => {};
  },
});

const picture = {} as HTMLImageElement;
/** lib/artShadow.ts loaded afresh (the query makes it a module of its own), its worker not made yet. */
const shadows = (fresh: string) => import(`../src/lib/artShadow.ts?${fresh}`) as Promise<typeof import('../src/lib/artShadow.ts')>;
/** All of `casts`, or what of them had come when the test gave up waiting. */
const settled = async <T>(casts: Promise<T>[]) => {
  const got: (T | 'waiting')[] = casts.map(() => 'waiting');
  casts.forEach((c, i) => c.then((v) => (got[i] = v)));
  await Promise.race([Promise.all(casts), new Promise((done) => setTimeout(done, 500))]);
  return got;
};

test('a worker that can’t draw: every job sent it before it said so is made on the page', async () => {
  const { castFor } = await shadows('cant');
  workers.length = 0;
  madeHere = 0;
  answer = (w, job) => w.reply({ id: job.id, cant: true });
  // (A find-the-art question's six tiles, all sent before the first answer comes.)
  const got = await settled(Array.from({ length: 6 }, () => castFor(picture, 120, 90)));
  assert.equal(workers.length, 1);
  assert.equal(workers[0]!.jobs, 6, 'all six went to the worker');
  assert.ok(workers[0]!.terminated, 'the worker is let go');
  for (const cast of got) assert.ok(cast !== 'waiting' && cast !== null, 'each shadow is made all the same');
  assert.equal(madeHere, 6, 'on the page');
  // (And it isn't asked again.)
  assert.ok(await castFor(picture, 120, 90));
  assert.equal(workers.length, 1);
  assert.equal(workers[0]!.jobs, 6);
  assert.equal(madeHere, 7);
});

test('a worker that fails: every job it held is made on the page', async () => {
  const { castFor } = await shadows('error');
  workers.length = 0;
  madeHere = 0;
  answer = (w) => w.onerror?.();
  const got = await settled(Array.from({ length: 6 }, () => castFor(picture, 120, 90)));
  assert.ok(workers[0]!.terminated);
  for (const cast of got) assert.ok(cast !== 'waiting' && cast !== null);
  assert.equal(madeHere, 6);
});

test('the shadow comes as an <img>, decoded, the size castBox gives it', async () => {
  const { castFor } = await shadows('shown');
  const { castBox } = await import('../src/lib/castShadow.ts');
  answer = (w, job) => w.reply({ id: job.id, cant: true });
  const cast = await castFor(picture, 120, 90);
  assert.ok(cast);
  assert.equal(cast.image.alt, '');
  assert.match(cast.image.src, /^blob:/);
  assert.deepEqual({ pad: cast.pad, cw: cast.cw, ch: cast.ch }, castBox(120, 90));
  assert.equal(await castFor(picture, 0, 90), null, 'none for a box with no size');
});

/** The worker makes every shadow, as the browser's does. */
const fromWorker = (w: FakeWorker, job: { id: number }) => w.reply({ id: job.id, png: new Blob(['png'], { type: 'image/png' }), worked: 4 });

test('warmCasts makes the worker before any shadow is asked for, and that one makes them', async () => {
  const { castFor, warmCasts } = await shadows('warm');
  workers.length = 0;
  answer = fromWorker;
  warmCasts();
  assert.equal(workers.length, 1, 'made at once');
  assert.equal(workers[0]!.jobs, 0);
  assert.ok(await castFor(picture, 120, 90));
  warmCasts();
  assert.equal(workers.length, 1, 'and only once');
  assert.equal(workers[0]!.jobs, 1);
});

test('a shadow made ahead is the one castFor gives its picture at that size, once', async () => {
  const { castAhead, castFor } = await shadows('ahead');
  workers.length = 0;
  madeHere = 0;
  answer = fromWorker;
  const full = { src: 'https://poe2.quest/art/full.webp' } as HTMLImageElement;
  // (ArtImage's own <img> of the same file: the same src, another element.)
  const own = { src: full.src } as HTMLImageElement;
  const made = castAhead(full, 240, 180);
  const cast = await made.cast;
  assert.ok(cast);
  // (Within half a px, as ArtImage takes a shadow for its size.)
  assert.equal(await castFor(own, 240.3, 179.8), cast, 'the one made ahead');
  assert.equal(workers[0]!.jobs, 1, 'made once');
  const again = await castFor(own, 240, 180);
  assert.ok(again && again !== cast, 'taken, it is not given again: its <img> is in one place only');
  assert.equal(workers[0]!.jobs, 2);

  const other = castAhead(full, 240, 180);
  const resized = await castFor(own, 300, 225);
  assert.ok(resized && resized !== (await other.cast), 'at another size, a shadow of its own');
  assert.equal(resized.w, 300);
  other.drop();
  assert.notEqual(await castFor(own, 240, 180), await other.cast, 'dropped, it is no one’s');
  assert.equal(madeHere, 0);
});

test('each shadow is timed on the page’s timeline, with the worker’s own part', async () => {
  const { castFor } = await shadows('timed');
  answer = fromWorker;
  const before = performance.getEntriesByName('art shadow').length;
  await castFor(picture, 120, 90);
  const entries = performance.getEntriesByName('art shadow') as PerformanceMeasure[];
  assert.equal(entries.length, before + 1);
  assert.deepEqual(entries.at(-1)!.detail, { w: 120, h: 90, where: 'worker', worked: 4 });
  assert.ok(entries.at(-1)!.duration >= 0);
});

const { HIDDEN_CHECK_MS, PING_MS, PREP_STALL_MS } = await import('../src/lib/prepPool.ts');
/** Every promise and posted job run its course (setImmediate isn't among the timers mocked). */
const turn = async (t: { mock: { timers: { tick: (ms: number) => void } } }) => {
  for (let k = 0; k < 4; k++) {
    await new Promise((done) => setImmediate(done));
    t.mock.timers.tick(1);
  }
};

test('a worker that falls silent: what it held is made on the page, and a fresh one takes its place', async (t) => {
  const { castFor } = await shadows('silent');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const before = workers.length;
  madeHere = 0;
  answer = fromWorker;
  const first = castFor(picture, 120, 90);
  await turn(t);
  assert.ok(await first);
  const silent = workers[before]!;
  // (Stopped by the phone, say: no error, no answer.)
  answer = (w, job) => (w === silent ? undefined : fromWorker(w, job));
  const casts = Array.from({ length: 6 }, () => castFor(picture, 120, 90));
  await turn(t);
  t.mock.timers.tick(PREP_STALL_MS - 10);
  await turn(t);
  assert.equal(madeHere, 0, 'waited on');
  t.mock.timers.tick(10);
  for (const cast of await Promise.all(casts)) assert.ok(cast, 'each made all the same');
  assert.equal(madeHere, 6, 'on the page');
  assert.ok(silent.terminated, 'let go');
  assert.equal(workers.length, before + 2, 'a fresh one, at once');
  const next = castFor(picture, 120, 90);
  await turn(t);
  assert.ok(await next);
  assert.equal(workers.at(-1)!.jobs, 1, 'the fresh one makes the next');
  assert.equal(madeHere, 6);
});

test('back after a long while, an idle worker is asked whether it’s still there; one that doesn’t say is replaced before a picture waits on it', async (t) => {
  const { castFor } = await shadows('asked');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const before = workers.length;
  madeHere = 0;
  /** Pings sent, and to whom. */
  const pinged: FakeWorker[] = [];
  const answers = (deaf: FakeWorker | null) => (w: FakeWorker, job: { id: number } | { ping: true }) => {
    if ('ping' in job) pinged.push(w);
    if (w === deaf) return;
    if ('ping' in job) w.reply({ id: 0 });
    else fromWorker(w, job);
  };
  answer = answers(null);
  const first = castFor(picture, 120, 90);
  await turn(t);
  assert.ok(await first);
  const mine = workers[before]!;
  hideFor(HIDDEN_CHECK_MS - 1000);
  await turn(t);
  assert.ok(!pinged.includes(mine), 'not after a short while');
  hideFor(HIDDEN_CHECK_MS);
  await turn(t);
  assert.ok(pinged.includes(mine), 'asked');
  t.mock.timers.tick(PING_MS);
  assert.ok(!mine.terminated, 'it said so, and stays');

  answer = answers(mine);
  hideFor(HIDDEN_CHECK_MS);
  await turn(t);
  t.mock.timers.tick(PING_MS);
  assert.ok(mine.terminated, 'silent, let go');
  const fresh = workers.at(-1)!;
  assert.notEqual(fresh, mine);
  const next = castFor(picture, 120, 90);
  await turn(t);
  assert.ok(await next);
  assert.equal(fresh.jobs, 1, 'the fresh one makes it');
  assert.equal(madeHere, 0);
});

const { START_MS } = await import('../src/lib/prepPool.ts');

test('a worker that never says a word: let go after START_MS, what it held made on the page, and no other made', async (t) => {
  const { castFor } = await shadows('mute');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const before = workers.length;
  madeHere = 0;
  answer = () => {};
  const casts = Array.from({ length: 2 }, () => castFor(picture, 120, 90));
  await turn(t);
  t.mock.timers.tick(START_MS - 10);
  await turn(t);
  assert.equal(madeHere, 0, 'its script may be on its way');
  t.mock.timers.tick(10);
  for (const cast of await Promise.all(casts)) assert.ok(cast, 'each made all the same');
  assert.equal(madeHere, 2, 'on the page');
  assert.ok(workers[before]!.terminated);
  assert.ok(await castFor(picture, 120, 90));
  assert.equal(workers.length, before + 1, 'none made after it: it won’t start');
  assert.equal(madeHere, 3);
});

test('one that says it’s there as it loads, then answers nothing: PREP_STALL_MS from its word, and a fresh one takes its place', async (t) => {
  const { castFor } = await shadows('hello');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const before = workers.length;
  madeHere = 0;
  answer = () => {};
  const cast = castFor(picture, 120, 90);
  await turn(t);
  const w = workers[before]!;
  // (Its word as it loads, after the job was sent.)
  w.reply({ id: 0 });
  t.mock.timers.tick(PREP_STALL_MS - 10);
  await turn(t);
  assert.equal(madeHere, 0, 'waited on');
  t.mock.timers.tick(10);
  assert.ok(await cast);
  assert.equal(madeHere, 1, 'made on the page');
  assert.ok(w.terminated);
  assert.equal(workers.length, before + 2, 'it had started: a fresh one');
});

test('frozen with the page, however briefly, its watch coming due as the page thaws, a worker is waited on again, not let go', async (t) => {
  const { castFor } = await shadows('frozen');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const before = workers.length;
  madeHere = 0;
  answer = fromWorker;
  const first = castFor(picture, 120, 90);
  await turn(t);
  assert.ok(await first);
  const w = workers[before]!;
  /** Jobs it holds, answered once the page thaws. */
  const held: { id: number }[] = [];
  answer = (_w, job) => void held.push(job);
  const casts = Array.from({ length: 3 }, () => castFor(picture, 120, 90));
  await turn(t);
  // (A switch to another app: the watch comes due as the page thaws, before it hears it's shown again.)
  flip(true);
  t.mock.timers.tick(PREP_STALL_MS);
  flip(false);
  assert.ok(!w.terminated, 'not let go');
  t.mock.timers.tick(PREP_STALL_MS);
  assert.ok(!w.terminated, 'its whole time again, shown');
  for (const job of held) fromWorker(w, job);
  for (const cast of await Promise.all(casts)) assert.ok(cast);
  assert.equal(madeHere, 0, 'all made in the worker');
});

test('back after a long while with jobs in hand, it is asked whether it’s still there, and has PREP_STALL_MS from then', async (t) => {
  const { castFor } = await shadows('asked-busy');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const before = workers.length;
  madeHere = 0;
  answer = fromWorker;
  const first = castFor(picture, 120, 90);
  await turn(t);
  assert.ok(await first);
  const w = workers[before]!;
  const pinged: unknown[] = [];
  // (It answers nothing now; the other tests' workers answer as before.)
  answer = (x, job) => {
    if (x === w) return void ('ping' in job && pinged.push(job));
    if ('ping' in job) x.reply({ id: 0 });
    else fromWorker(x, job);
  };
  const casts = Array.from({ length: 2 }, () => castFor(picture, 120, 90));
  await turn(t);
  hideFor(HIDDEN_CHECK_MS);
  await turn(t);
  assert.equal(pinged.length, 1, 'asked');
  t.mock.timers.tick(PING_MS);
  assert.ok(!w.terminated, 'with jobs in hand it has longer');
  t.mock.timers.tick(PREP_STALL_MS - PING_MS);
  for (const cast of await Promise.all(casts)) assert.ok(cast, 'each made all the same');
  assert.ok(w.terminated, 'silent, let go');
  assert.equal(madeHere, 2, 'on the page');
});
