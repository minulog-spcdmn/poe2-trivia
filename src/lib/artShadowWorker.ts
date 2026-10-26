// Works out item pictures' drop shadows (lib/artShadow.ts) away from the
// page's main thread: six at a find-the-art question's start, six more at
// its reveal, each a blur over tens of thousands of pixels.

import { castBox, shadowOf } from './castShadow';

/** A picture, to be drawn `w` x `h` (CSS px). */
export type CastJob = { id: number; image: ImageBitmap; w: number; h: number };
/** Its shadow (castBox's size); nothing if it couldn't be made here, and `cant` if nothing can (no OffscreenCanvas). */
export type CastAnswer = { id: number; bitmap?: ImageBitmap; cant?: boolean };

self.onmessage = ({ data: job }: MessageEvent<CastJob>) => {
  const answer: CastAnswer = { id: job.id };
  if (typeof OffscreenCanvas === 'undefined') {
    job.image.close();
    self.postMessage({ ...answer, cant: true } satisfies CastAnswer);
    return;
  }
  try {
    const { pad, cw, ch } = castBox(job.w, job.h);
    const c = new OffscreenCanvas(cw, ch);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(job.image, pad, pad, job.w, job.h);
    const px = g.getImageData(0, 0, cw, ch);
    shadowOf(px.data, cw, ch);
    g.putImageData(px, 0, 0);
    answer.bitmap = c.transferToImageBitmap();
  } catch {
    // (Answered with nothing, and the page does it.)
  }
  job.image.close();
  self.postMessage(answer, { transfer: answer.bitmap ? [answer.bitmap] : [] });
};
