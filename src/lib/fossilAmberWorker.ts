// Paints a fossil's amber (lib/fossilAmber's paintAmber) away from the
// page's main thread: a few hundred thousand pixels, each worked out in
// linear light, as a fossil's card is dealt (lib/amberTexture.ts).

import { paintAmber, type AmberJob } from './fossilAmber.ts';

/** A job, and its answer: the amber as a PNG, or its pixels where no OffscreenCanvas can make one here. */
export type AmberAsk = { id: number; job: AmberJob };
export type AmberAnswer = { id: number; png?: Blob; pixels?: Uint8ClampedArray<ArrayBuffer> };

self.onmessage = async ({ data }: MessageEvent<AmberAsk>) => {
  const { id, job } = data;
  const pixels = new Uint8ClampedArray(new ArrayBuffer(job.w * job.h * 4));
  paintAmber(job, pixels);
  if (typeof OffscreenCanvas === 'undefined') {
    self.postMessage({ id, pixels } satisfies AmberAnswer, { transfer: [pixels.buffer] });
    return;
  }
  const c = new OffscreenCanvas(job.w, job.h);
  c.getContext('2d')!.putImageData(new ImageData(pixels, job.w, job.h), 0, 0);
  // (A PNG, which keeps every level the dither set, shown in an <img>: lib/artShadow.ts says why not a canvas.)
  self.postMessage({ id, png: await c.convertToBlob({ type: 'image/png' }) } satisfies AmberAnswer);
};
