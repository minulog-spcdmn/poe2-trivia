// Works out item pictures' drop shadows (lib/artShadow.ts) away from the
// page's main thread: six at a find-the-art question's start, six more at
// its reveal, each a blur over tens of thousands of pixels.

import { castBox, shadowOf } from './castShadow';

/** A picture, to be drawn `w` x `h` (CSS px). */
export type CastJob = { id: number; image: ImageBitmap; w: number; h: number };
/**
 * Its shadow as a PNG (castBox's size), and how long making it took here
 * (`worked`, ms); nothing if it couldn't be made here, and `cant` if
 * nothing can (no OffscreenCanvas).
 */
export type CastAnswer = { id: number; png?: Blob; worked?: number; cant?: boolean };
/** Asks whether it's still there (lib/artShadow.ts): answered `{ id: 0 }`, as it says once it has loaded. */
export type CastPing = { ping: true };

/** The shadow of `image` drawn `w` x `h` (CSS px), as a PNG. */
async function cast(image: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const { pad, cw, ch } = castBox(w, h);
  const c = new OffscreenCanvas(cw, ch);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(image, pad, pad, w, h);
  const px = g.getImageData(0, 0, cw, ch);
  shadowOf(px.data, cw, ch);
  g.putImageData(px, 0, 0);
  // (A PNG, which keeps every level of the blur, for the page to show in an <img>: lib/artShadow.ts says why not a canvas.)
  return c.convertToBlob({ type: 'image/png' });
}

// Made ahead of need (artShadow.ts, warmCasts), it makes a shadow once as
// it loads, of nothing, a find-the-art tile's size: the first blur, its
// code not yet compiled, took ten times as long as the ones after it on a
// PC (40 to 54 ms against 4 for a 120 x 90 tile, in Node; after this one,
// 4 for the first too), and the first question's pictures waited for it.
// Its part up to the PNG runs before any job is taken.
if (typeof OffscreenCanvas !== 'undefined') cast(new OffscreenCanvas(1, 1), 110, 110).catch(() => {});
// (It's there: the page waits on it from now on with that in mind.)
self.postMessage({ id: 0 } satisfies CastAnswer);

self.onmessage = async ({ data: job }: MessageEvent<CastJob | CastPing>) => {
  if ('ping' in job) {
    self.postMessage({ id: 0 } satisfies CastAnswer);
    return;
  }
  const answer: CastAnswer = { id: job.id };
  if (typeof OffscreenCanvas === 'undefined') {
    job.image.close();
    self.postMessage({ ...answer, cant: true } satisfies CastAnswer);
    return;
  }
  const start = performance.now();
  try {
    answer.png = await cast(job.image, job.w, job.h);
    answer.worked = performance.now() - start;
  } catch {
    // (Answered with nothing, and the page does it.)
  }
  job.image.close();
  self.postMessage(answer satisfies CastAnswer);
};
