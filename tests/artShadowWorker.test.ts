// The worker that makes the pictures' shadows (lib/artShadowWorker.ts)
// makes one as it loads, of nothing, so that its first blur, run cold, is
// out of the way before a question's pictures wait for theirs; and a job
// is still answered with castShadow's own shadow of the picture, and how
// long it took. Run here against stand-ins for the worker's scope and its
// OffscreenCanvas.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Every canvas made, its size, what it was asked to draw and read, and what was put back in it. */
type Made = { w: number; h: number; drawn: unknown[]; put: Uint8ClampedArray | null; png: boolean };
const canvases: Made[] = [];
/** The pixels a canvas reads back: a square of the picture, opaque, in a clear field, as a tile's would be. */
const pixels = (w: number, h: number) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = Math.floor(h / 3); y < (2 * h) / 3; y++) for (let x = Math.floor(w / 3); x < (2 * w) / 3; x++) data[(y * w + x) * 4 + 3] = 255;
  return data;
};
class FakeOffscreenCanvas {
  made: Made;
  constructor(w: number, h: number) {
    this.made = { w, h, drawn: [], put: null, png: false };
    canvases.push(this.made);
  }
  getContext() {
    const made = this.made;
    return {
      imageSmoothingQuality: 'low',
      drawImage: (image: unknown) => void made.drawn.push(image),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: pixels(w, h) }),
      putImageData: (px: { data: Uint8ClampedArray }) => void (made.put = px.data),
    };
  }
  async convertToBlob() {
    this.made.png = true;
    return new Blob(['png'], { type: 'image/png' });
  }
}
const sent: unknown[] = [];
const scope = { onmessage: null as ((e: { data: unknown }) => Promise<void>) | null, postMessage: (m: unknown) => void sent.push(m) };
Object.assign(globalThis, { self: scope, OffscreenCanvas: FakeOffscreenCanvas });

const { castBox, shadowOf } = await import('../src/lib/castShadow.ts');
await import('../src/lib/artShadowWorker.ts');

test('the worker makes a shadow as it loads, a tile’s size, before any job', async () => {
  const tile = castBox(110, 110);
  // (Drawn from a blank canvas of its own, a px across.)
  const warm = canvases.filter((c) => c.w > 1);
  assert.equal(warm.length, 1);
  assert.deepEqual({ w: warm[0]!.w, h: warm[0]!.h }, { w: tile.cw, h: tile.ch });
  assert.ok(warm[0]!.put, 'blurred before anything else runs');
  await new Promise((done) => setTimeout(done));
  assert.ok(warm[0]!.png, 'and encoded');
  assert.deepEqual(sent, [{ id: 0 }], 'saying only that it’s there');
});

test('asked whether it’s still there, it says so', async () => {
  const before = canvases.length;
  await scope.onmessage!({ data: { ping: true } });
  assert.deepEqual(sent.at(-1), { id: 0 });
  assert.equal(canvases.length, before, 'drawing nothing');
});

test('a job is answered with castShadow’s shadow of the picture, and how long it took', async () => {
  let closed = 0;
  const image = { close: () => closed++ };
  await scope.onmessage!({ data: { id: 7, image, w: 120, h: 90 } });
  const made = canvases.at(-1)!;
  const { pad, cw, ch } = castBox(120, 90);
  assert.deepEqual({ w: made.w, h: made.h }, { w: cw, h: ch });
  assert.deepEqual(made.drawn, [image]);
  assert.deepEqual(made.put, shadowOf(pixels(cw, ch), cw, ch), 'the shadow castShadow makes');
  assert.ok(pad > 0);
  const answer = sent.at(-1) as { id: number; png?: Blob; worked?: number };
  assert.equal(answer.id, 7);
  assert.ok(answer.png instanceof Blob);
  assert.equal(typeof answer.worked, 'number');
  assert.equal(closed, 1, 'the picture let go');
});
