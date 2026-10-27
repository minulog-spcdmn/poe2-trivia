// A veiled patch burning in (lib/materialize.ts), its arithmetic in burn.ts:
// on the page, and in the worker (lib/burnWorker.ts, run here in this
// process), whose boxes the page puts on the patch's canvas as they come, it
// draws every frame's pixels and flies every spark exactly as the page drew
// them before the worker took the burns over (materialize.ts at f620318b,
// hashed: BEFORE). A page slower than the worker, its frames slow or its
// main thread busy, has one frame at a time, a box put for each of its own
// at most with all that changed since the last in it, and ends on the same
// picture with the same sparks flown. A burn whose canvas goes stops in the
// worker too. Until the worker has said it's there, and while it doesn't
// answer back from a long while in the background, the page burns them; one
// that doesn't answer is given no more and let go, those it hadn't finished
// drawn whole on their canvases.
import { fakeModule } from './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

fakeModule('./fx/moments', new URL('./fakeVeilFx.ts', import.meta.url));
fakeModule('./stage', new URL('./fakeVeilFx.ts', import.meta.url));
const { fired } = await import('./fakeVeilFx.ts');
const { materialize, warmBurns } = await import('../src/lib/materialize.ts');
const { HIDDEN_CHECK_MS, PING_MS, PREP_STALL_MS } = await import('../src/lib/prepPool.ts');
type BurnParams = import('../src/lib/materialize.ts').BurnParams;

/**
 * What the page drew and set off for the three burns below (`run`) before the
 * worker: a patch spreading in from a seam, one catching at a point, and a
 * quick one at the reveal. Hashed this way, a burn changed on purpose
 * changes it: rehash it from the burn as it then is, once it's seen to look right.
 */
const BEFORE = 'd3faae1f';

const g = globalThis as Record<string, unknown>;
g.window = g;
g.devicePixelRatio = 3;
/** Math.random, seeded (mulberry32): each run of the burns rolls the same. */
let seed = 0;
Math.random = () => {
  const t = (seed = (seed + 0x6d2b79f5) >>> 0);
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
/** One display's frames, for the page and the worker alike. */
let frames: ((now: number) => void)[] = [];
g.requestAnimationFrame = (step: (now: number) => void) => frames.push(step);
g.cancelAnimationFrame = () => {};
/** The wall clock, wound on by hand: how long the page was hidden is timed by it (prepPool.ts onShownAgain). */
let away = 0;
const wallClock = Date.now;
Date.now = () => wallClock() + away;

/** FNV-1a over everything drawn: each box put on a canvas and its pixels. */
let hash = 0;
const mix = (v: number) => {
  hash = Math.imul(hash ^ (v & 0xff), 16777619) >>> 0;
  hash = Math.imul(hash ^ ((v >>> 8) & 0xff), 16777619) >>> 0;
};

/** Pixels as a canvas gives and takes them. */
class FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}
g.ImageData = FakeImageData;

/** What a kind of canvas did: pictures drawn on it and boxes put. */
interface Tally {
  drawn: number;
  puts: number;
}

/** A 2D context drawing any picture as the same item: a disc with a soft rim, coloured by place. */
function fakeContext(where: Tally) {
  let W = 0;
  let H = 0;
  let px = new Uint8ClampedArray(0);
  return {
    imageSmoothingQuality: 'low',
    /** Pictures drawn on it. */
    drawn: 0,
    size(w: number, h: number) {
      [W, H] = [w, h];
      px = new Uint8ClampedArray(w * h * 4);
    },
    drawImage(_img: unknown, _x: number, _y: number, w: number, h: number) {
      this.drawn++;
      where.drawn++;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          const r = ((x + 0.5) / w - 0.5) ** 2 + ((y + 0.5) / h - 0.5) ** 2;
          px[o] = (x * 7) & 255;
          px[o + 1] = (y * 5) & 255;
          px[o + 2] = (x * y) & 255;
          px[o + 3] = r < 0.2 ? 255 : r < 0.23 ? 120 : 0;
        }
    },
    getImageData: () => new FakeImageData(px.slice(), W, H),
    /** What it shows. */
    pixels: () => px,
    /** The box of `img` from (x0, y0), w × h (the whole of it by default), put at (dx, dy) on and after it: hashed as where it lands and what it brings. */
    putImageData(img: FakeImageData, dx: number, dy: number, x0 = 0, y0 = 0, w = img.width, h = img.height) {
      where.puts++;
      for (const v of [dx + x0, dy + y0, w, h]) mix(v);
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++)
          for (let c = 0; c < 4; c++) {
            const v = img.data[(y * img.width + x) * 4 + c];
            mix(v);
            px[((dy + y) * W + dx + x) * 4 + c] = v;
          }
    },
  };
}

/** What each kind of canvas drew: the page's own, and those the worker reads the pictures' pixels on. */
const page: Tally = { drawn: 0, puts: 0 };
const offscreen: Tally = { drawn: 0, puts: 0 };

/** What the tests read of a patch's canvas. */
interface FakeCanvas {
  width: number;
  height: number;
  getContext(): { drawn: number; pixels(): Uint8ClampedArray };
}

/** A patch's <canvas>, 100 CSS px wide on a 3x screen. */
function fakeCanvas(): FakeCanvas {
  const ctx = fakeContext(page);
  let [w, h] = [0, 0];
  return {
    clientWidth: 100,
    isConnected: true,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 75 }),
    animate: () => void fired.push(['fade']),
    get width() {
      return w;
    },
    set width(v) {
      w = v;
      ctx.size(w, h);
    },
    get height() {
      return h;
    },
    set height(v) {
      h = v;
      ctx.size(w, h);
    },
  } as FakeCanvas;
}

/** A picture as the veil's worker makes them. */
class FakeBitmap {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  close() {}
}

const settle = async () => {
  for (let k = 0; k < 20; k++) await Promise.resolve();
};

/** Plays the display's frames, 60 a second, till nothing asks for another. */
let now = 1000;
async function play(most = Infinity) {
  for (let n = 0; frames.length && n < most; n++) {
    const due = frames;
    frames = [];
    now += 16.67;
    for (const step of due) step(now);
    // (The worker's news, and its next frame asked for.)
    await settle();
  }
}

const edges: number[] = [];
for (let y = 0; y < 30; y++) edges.push(0, y, 7);
const patch = (more: Partial<BurnParams>): BurnParams => ({
  picture: () => Promise.resolve(new FakeBitmap(80, 60) as unknown as ImageBitmap),
  w: 40,
  h: 30,
  edges: new Uint16Array(edges),
  before: [7],
  burn: 2000,
  ...more,
});

/** A patch put on the page (its canvas and destroy), its picture on its way. */
async function show(more: Partial<BurnParams> = {}) {
  const canvas = fakeCanvas();
  const { destroy } = materialize(canvas as unknown as HTMLCanvasElement, patch(more));
  await settle();
  return { canvas, destroy };
}

/** The three burns, one after another, and the hash of all they drew and set off. */
async function run() {
  hash = 0x811c9dc5;
  now = 1000;
  seed = 12345;
  fired.length = 0;
  for (const p of [{}, { before: [], burn: 1500 }, { quick: true }]) {
    const { destroy } = await show(p);
    await play();
    destroy();
  }
  for (const f of fired) for (const v of f) if (typeof v === 'number') mix(Math.round(v * 1000));
  return hash.toString(16);
}

test('on the page, a patch burns in as it did before the worker', async () => {
  assert.equal(await run(), BEFORE);
  assert.ok(page.puts > 100);
  assert.ok(fired.some((f) => f[0] === 'spark') && fired.some((f) => f[0] === 'ignite'));
});

// ---- the worker ----------------------------------------------------------

/** The worker's side of the line: its module's onmessage, and what it says to whichever worker is current. */
const scope: { onmessage?: (e: { data: unknown }) => void; postMessage?: (m: unknown) => void; requestAnimationFrame?: unknown } = {};
const made: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  /** Answers nothing (a phone stopped it in the background). */
  deaf = false;
  terminated = false;
  /** What it was told (only what: a picture sent isn't kept here). */
  sent: { t: string }[] = [];
  /** The page's answers to its frames, held back till `answer` (a page slower than the worker); null: they go at once. */
  late: { t: string }[] | null = null;
  /** Its frames with the page not put yet, and the most there were at once. */
  out = 0;
  most = 0;
  constructor() {
    made.push(this);
    void import('../src/lib/burnWorker.ts').then(() => {
      // (Only the first loads it: the module says it's there once. A fresh
      // one has no frame with the page, as the last may have had, unput.)
      if (made.length > 1) {
        scope.onmessage!({ data: { t: 'put', back: [] } });
        scope.onmessage!({ data: { t: 'ping' } });
      }
    });
  }
  postMessage(data: { t: string }) {
    this.sent.push({ t: data.t });
    if (data.t === 'put' && this.late) this.late.push(data);
    else this.tell(data);
  }
  /** The answers held back go. */
  answer() {
    for (const data of this.late?.splice(0) ?? []) this.tell(data);
  }
  tell(data: { t: string }) {
    if (this.deaf || this.terminated) return;
    if (data.t === 'put') this.out--;
    queueMicrotask(() => scope.onmessage!({ data }));
  }
  terminate() {
    this.terminated = true;
  }
}
scope.postMessage = (news) => {
  const w = made.findLast((m) => !m.terminated);
  if (!w || w.deaf) return;
  if ((news as { t: string }).t === 'frame') w.most = Math.max(w.most, ++w.out);
  queueMicrotask(() => w.onmessage?.({ data: news }));
};
/** The worker's display frames, apart from the page's while those come slower (burnFor). */
let ticks: ((now: number) => void)[] | null = null;
scope.requestAnimationFrame = (step: (now: number) => void) => (ticks ?? frames).push(step);
const listeners: (() => void)[] = [];
const doc = { hidden: false, addEventListener: (_: string, f: () => void) => listeners.push(f) };
/** Burns sent to a worker, all told. */
const sentBurns = () => made.reduce((n, w) => n + w.sent.filter((s) => s.t === 'burn').length, 0);
/** What `w` was last told, the page's answers to its frames aside. */
const told = (w: FakeWorker) => w.sent.findLast((s) => s.t !== 'put')!.t;

function useWorkers() {
  g.self = scope;
  g.Worker = FakeWorker;
  g.OffscreenCanvas = class {
    ctx = fakeContext(offscreen);
    constructor(w: number, h: number) {
      this.ctx.size(w, h);
    }
    getContext() {
      return this.ctx;
    }
  };
  g.ImageBitmap = FakeBitmap;
  g.createImageBitmap = (img: FakeBitmap) => Promise.resolve(new FakeBitmap(img.width, img.height));
  g.document = doc;
}

/** The page hidden for `ms` by the wall clock, and shown again. */
function hideFor(ms: number) {
  doc.hidden = true;
  for (const f of listeners) f();
  away += ms;
  doc.hidden = false;
  for (const f of listeners) f();
}

test('in the worker, its boxes put on the page, it burns in the same, frame by frame and spark by spark', async () => {
  useWorkers();
  warmBurns();
  await settle();
  const before = { ...page };
  assert.equal(await run(), BEFORE);
  assert.equal(sentBurns(), 3);
  assert.equal(offscreen.drawn, 3, 'each picture read in the worker');
  assert.equal(offscreen.puts, 0);
  assert.equal(page.drawn, before.drawn, 'the page drew no picture itself');
  assert.ok(page.puts > before.puts + 100, 'it put the worker’s boxes');
  assert.equal(made[0].most, 1, 'one frame at a time');
});

/**
 * A patch spreading in from a seam, burnt in the worker at 60 frames a
 * second, the page's own frames coming on every `pageEvery` of them (its
 * main thread idle, its frames slow) and its answers held back till every
 * `answerEvery` (its main thread busy): what its canvas ended on, what it
 * set off, the boxes it put and the frames it had, and the most frames it
 * had at once from the worker.
 */
async function burnFor(pageEvery: number, answerEvery: number) {
  const w = made[0];
  w.late = answerEvery > 1 ? [] : null;
  ticks = pageEvery > 1 ? [] : null;
  w.most = 0;
  now = 1000;
  seed = 12345;
  fired.length = 0;
  const puts = page.puts;
  let pageFrames = 0;
  const { canvas, destroy } = await show();
  for (let n = 1; frames.length || ticks?.length || w.late?.length; n++) {
    now += 16.67;
    if (ticks) {
      const due = ticks;
      ticks = [];
      for (const step of due) step(now);
      await settle();
    }
    if (n % pageEvery === 0 || !ticks?.length) {
      const due = frames;
      frames = [];
      pageFrames += due.length ? 1 : 0;
      for (const step of due) step(now);
      await settle();
    }
    if (n % answerEvery === 0 || !(ticks ?? frames).length) w.answer();
    await settle();
  }
  w.late = ticks = null;
  const ended = canvas.getContext().pixels().slice();
  destroy();
  return { ended, fired: fired.splice(0), puts: page.puts - puts, pageFrames, most: w.most };
}

test('a page slower than the worker puts a frame of it at most for each of its own, all that changed in it: it ends on the same picture, every spark flown', async () => {
  const prompt = await burnFor(1, 1);
  assert.ok(prompt.ended.some((v) => v > 0));
  for (const [pageEvery, answerEvery] of [
    [3, 1],
    [1, 4],
  ]) {
    const slow = await burnFor(pageEvery, answerEvery);
    assert.equal(slow.most, 1, 'one frame at a time');
    assert.ok(slow.puts <= slow.pageFrames + 1, `a box put a frame (${slow.puts} in ${slow.pageFrames})`);
    assert.ok(slow.puts < prompt.puts / 2, `fewer boxes put (${slow.puts} against ${prompt.puts})`);
    assert.deepEqual(slow.ended, prompt.ended, 'the same picture at the end');
    assert.deepEqual(slow.fired, prompt.fired, 'the same sparks');
  }
});

test('a burn whose canvas goes stops in the worker too', async () => {
  const { destroy } = await show();
  await play(10);
  const put = page.puts;
  assert.ok(put > 0);
  destroy();
  await settle();
  assert.equal(told(made[0]), 'stop');
  await play();
  assert.equal(page.puts, put);
});

test('burnt in, nothing more is said of it when its canvas goes', async () => {
  const { destroy } = await show();
  await play();
  destroy();
  assert.equal(told(made[0]), 'burn');
});

test('back after a short while, the worker isn’t asked, and burns the next patch', async () => {
  hideFor(HIDDEN_CHECK_MS - 1000);
  assert.notEqual(told(made[0]), 'ping');
  const sent = sentBurns();
  const { destroy } = await show();
  assert.equal(sentBurns(), sent + 1);
  await play();
  destroy();
});

test('back after a long while, the page burns them till the worker answers; one that doesn’t is given no more, and let go', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = made[0];
  first.deaf = true;
  hideFor(HIDDEN_CHECK_MS);
  assert.equal(told(first), 'ping');
  const sent = sentBurns();
  const meanwhile = await show();
  assert.equal(sentBurns(), sent, 'burnt on the page');
  await play();
  t.mock.timers.tick(PING_MS);
  assert.equal(made.length, 2, 'a fresh one');
  assert.ok(first.terminated);
  await settle();
  const next = await show();
  assert.equal(sentBurns(), sent + 1, 'the new worker burns it');
  assert.equal(told(made[1]), 'burn');
  await play();
  meanwhile.destroy();
  next.destroy();
});

test('with a burn in hand it has longer to answer; one lost is drawn whole on its canvas', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const second = made[1];
  const { canvas, destroy } = await show();
  await play(5);
  second.deaf = true;
  hideFor(HIDDEN_CHECK_MS);
  assert.equal(told(second), 'ping');
  t.mock.timers.tick(PING_MS);
  assert.equal(made.length, 2, 'still waiting');
  assert.equal(canvas.getContext().drawn, 0);
  t.mock.timers.tick(PREP_STALL_MS - PING_MS);
  assert.equal(made.length, 3, 'given no more');
  assert.ok(second.terminated);
  assert.equal(canvas.getContext().drawn, 1, 'its picture drawn whole');
  assert.deepEqual([canvas.width, canvas.height], [160, 120], 'at the burn’s own size');
  const put = page.puts;
  await settle();
  // (What the worker in this process still had in hand burns out, heard by no one.)
  await play();
  assert.equal(page.puts, put, 'and nothing put over it');
  destroy();
});

test('one the worker can’t begin is drawn whole on its canvas', async () => {
  const third = made[2];
  // (Its picture can't be read there.)
  const OffscreenCanvas = g.OffscreenCanvas;
  g.OffscreenCanvas = class {
    getContext() {
      return null;
    }
  };
  const { canvas, destroy } = await show();
  g.OffscreenCanvas = OffscreenCanvas;
  assert.equal(told(third), 'burn');
  assert.equal(canvas.getContext().drawn, 1);
  assert.ok(!third.terminated, 'the worker kept: it may yet read the next');
  destroy();
});

test('a worker that breaks is given no more: what it hadn’t finished is drawn whole, and the page burns from then on', async () => {
  const third = made[2];
  const { canvas, destroy } = await show();
  await play(5);
  assert.equal(told(third), 'burn');
  third.onerror!();
  assert.ok(third.terminated);
  assert.equal(canvas.getContext().drawn, 1);
  const sent = sentBurns();
  const after = await show();
  assert.equal(sentBurns(), sent, 'burnt on the page');
  assert.equal(made.length, 3, 'and no other worker');
  await play();
  destroy();
  after.destroy();
});
