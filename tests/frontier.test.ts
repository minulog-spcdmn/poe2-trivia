// The sparks flying off a veiled picture's seams (lib/frontier.ts) leave
// once the frame that picked them is drawn, not in it (reading where the
// canvas is, in a frame, laid the page out an extra time), and fly just as
// they did from within the frame (frontier.ts at f620318b, hashed: BEFORE):
// as many, from the same places, the same way.
import { fakeModule } from './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

fakeModule('./fx/moments', new URL('./fakeVeilFx.ts', import.meta.url));
fakeModule('./stage', new URL('./fakeVeilFx.ts', import.meta.url));
const { fired } = await import('./fakeVeilFx.ts');

/**
 * The sparks the seam below set off over three seconds, drawn as the page
 * drew them before. Hashed this way, sparks changed on purpose change it:
 * rehash it from the seams as they then are, once they're seen to look right.
 */
const BEFORE = '90da6bdf';

const g = globalThis as Record<string, unknown>;
g.window = g;
g.devicePixelRatio = 3;
let seed = 99;
Math.random = () => {
  const t = (seed = (seed + 0x6d2b79f5) >>> 0);
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
let frames: ((now: number) => void)[] = [];
/** The clock, for the page (performance.now) and its frames alike. */
let clock = 1000;
performance.now = () => clock;
g.requestAnimationFrame = (step: (now: number) => void) => frames.push(step);
g.cancelAnimationFrame = () => {};

/** A 2D context that draws nothing. */
const context = () => ({
  createRadialGradient: () => ({ addColorStop() {} }),
  fillRect() {},
  clearRect() {},
  drawImage() {},
});
g.document = { createElement: () => ({ width: 0, height: 0, getContext: context }) };

/** How many times the canvas's place was read. */
let reads = 0;
const canvas = {
  width: 0,
  height: 0,
  clientWidth: 100,
  isConnected: true,
  getContext: context,
  getBoundingClientRect: () => (reads++, { left: 10, top: 20, width: 100, height: 75 }),
};

test('the seams’ sparks fly once their frame is drawn, as they flew in it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { frontier } = await import('../src/lib/frontier.ts');
  // Patch 0 in, meeting patch 1 (not yet come) all down its right-hand side.
  const edges: number[] = [];
  for (let y = 0; y < 30; y++) edges.push(19, y, 1);
  const patch = { i: 0, x: 0, y: 0, w: 20, h: 30, picture: () => Promise.reject(), edges: new Uint16Array(edges) };
  frontier(canvas as unknown as HTMLCanvasElement, { w: 40, h: 30, burn: 1000, patches: [patch] });
  let inFrames = 0;
  for (; clock < 4000 && frames.length; clock += 16.67) {
    const due = frames;
    frames = [];
    const was = fired.length;
    const read = reads;
    for (const step of due) step(clock);
    inFrames += fired.length - was + reads - read;
    t.mock.timers.tick(0);
  }
  assert.equal(inFrames, 0, 'no spark flies, and no place is read, in a frame');
  assert.ok(fired.length > 20);
  let hash = 0x811c9dc5;
  for (const f of fired) for (const v of f) if (typeof v === 'number') hash = Math.imul(hash ^ Math.round(v * 1000), 16777619) >>> 0;
  assert.equal(hash.toString(16), BEFORE);
});
