// A veiled patch burning in (lib/materialize.ts), its arithmetic in burn.ts:
// on the page, and in the worker (lib/burnWorker.ts, run here in this
// process) on the canvas handed over to it, it draws every frame's pixels and
// flies every spark exactly as the page drew them before the worker took the
// burns over (materialize.ts at f620318b, hashed: BEFORE). A burn whose
// canvas goes stops in the worker too; until the worker has said it's there,
// and while it doesn't answer back from the background, the page burns them.
import { fakeModule } from './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

fakeModule('./fx/moments', new URL('./fakeVeilFx.ts', import.meta.url));
fakeModule('./stage', new URL('./fakeVeilFx.ts', import.meta.url));
const { fired } = await import('./fakeVeilFx.ts');
const { materialize, warmBurns } = await import('../src/lib/materialize.ts');
const { PING_MS } = await import('../src/lib/prepPool.ts');
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

/** FNV-1a over everything drawn: each box put on a canvas and its pixels. */
let hash = 0;
const mix = (v: number) => {
  hash = Math.imul(hash ^ (v & 0xff), 16777619) >>> 0;
  hash = Math.imul(hash ^ ((v >>> 8) & 0xff), 16777619) >>> 0;
};

/** A 2D context drawing any picture as the same item: a disc with a soft rim, coloured by place. */
function fakeContext(where: { puts: number }) {
  let W = 0;
  let H = 0;
  let px = new Uint8ClampedArray(0);
  return {
    imageSmoothingQuality: 'low',
    size(w: number, h: number) {
      [W, H] = [w, h];
      px = new Uint8ClampedArray(w * h * 4);
    },
    drawImage(_img: unknown, _x: number, _y: number, w: number, h: number) {
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
    getImageData: () => ({ data: px.slice(), width: W, height: H }),
    putImageData(img: { data: Uint8ClampedArray }, _x: number, _y: number, x0 = 0, y0 = 0, w = W, h = H) {
      where.puts++;
      for (const v of [x0, y0, w, h]) mix(v);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) for (let c = 0; c < 4; c++) mix(img.data[(y * W + x) * 4 + c]);
    },
  };
}

/** What each kind of canvas drew: the page's own, and those handed to the worker. */
const page = { puts: 0 };
const offscreen = { puts: 0, handed: 0 };

/** A patch's <canvas>, 100 CSS px wide on a 3x screen; handed over, it draws in its offscreen context. */
function fakeCanvas() {
  let ctx = fakeContext(page);
  let [w, h] = [0, 0];
  const canvas = {
    clientWidth: 100,
    isConnected: true,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 75 }),
    animate: () => void fired.push(['fade']),
    transferControlToOffscreen() {
      offscreen.handed++;
      ctx = fakeContext(offscreen);
      ctx.size(w, h);
      return { getContext: () => ctx };
    },
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
  };
  return canvas;
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

/** The three burns, one after another, and the hash of all they drew and set off. */
async function run() {
  hash = 0x811c9dc5;
  now = 1000;
  seed = 12345;
  fired.length = 0;
  for (const p of [patch({}), patch({ before: [], burn: 1500 }), patch({ quick: true })]) {
    materialize(fakeCanvas() as unknown as HTMLCanvasElement, p);
    await settle();
    await play();
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
  sent: { t: string }[] = [];
  constructor() {
    made.push(this);
    void import('../src/lib/burnWorker.ts').then(() => {
      // (Only the first loads it: the module says it's there once.)
      if (made.length > 1) scope.onmessage!({ data: { t: 'ping' } });
    });
  }
  postMessage(data: { t: string }) {
    this.sent.push(data);
    if (!this.deaf && !this.terminated) queueMicrotask(() => scope.onmessage!({ data }));
  }
  terminate() {
    this.terminated = true;
  }
}
scope.postMessage = (news) => {
  const w = made.findLast((m) => !m.terminated);
  if (w && !w.deaf) queueMicrotask(() => w.onmessage?.({ data: news }));
};
scope.requestAnimationFrame = g.requestAnimationFrame;
const listeners: (() => void)[] = [];
const doc = { hidden: false, addEventListener: (_: string, f: () => void) => listeners.push(f) };

function useWorkers() {
  g.self = scope;
  g.Worker = FakeWorker;
  g.OffscreenCanvas = class {};
  g.ImageBitmap = FakeBitmap;
  g.createImageBitmap = (img: FakeBitmap) => Promise.resolve(new FakeBitmap(img.width, img.height));
  g.HTMLCanvasElement = class {
    transferControlToOffscreen() {}
  };
  g.document = doc;
}

test('in the worker, on the canvas handed over, it burns in the same, frame by frame and spark by spark', async () => {
  useWorkers();
  warmBurns();
  await settle();
  const before = page.puts;
  assert.equal(await run(), BEFORE);
  assert.equal(offscreen.handed, 3);
  assert.equal(page.puts, before, 'the page drew nothing itself');
});

test('a burn whose canvas goes stops in the worker too', async () => {
  const canvas = fakeCanvas();
  const { destroy } = materialize(canvas as unknown as HTMLCanvasElement, patch({}));
  await settle();
  await play(10);
  const drawn = offscreen.puts;
  assert.ok(drawn > 0);
  destroy();
  await settle();
  assert.equal(made[0].sent.at(-1)!.t, 'stop');
  await play();
  assert.equal(offscreen.puts, drawn);
});

test('back in view, the page burns them till the worker answers, and one that doesn’t is replaced', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = made[0];
  first.deaf = true;
  for (const f of listeners) f();
  assert.equal(first.sent.at(-1)!.t, 'ping');
  const handed = offscreen.handed;
  materialize(fakeCanvas() as unknown as HTMLCanvasElement, patch({}));
  await settle();
  assert.equal(offscreen.handed, handed, 'burnt on the page');
  await play();
  t.mock.timers.tick(PING_MS);
  assert.ok(first.terminated);
  assert.equal(made.length, 2);
  await settle();
  materialize(fakeCanvas() as unknown as HTMLCanvasElement, patch({}));
  await settle();
  assert.equal(offscreen.handed, handed + 1, 'the new worker burns it');
  await play();
});
