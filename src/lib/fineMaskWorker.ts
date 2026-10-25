// Shrinks the cards' emblem masks (lib/fineMask.ts) away from the page's main
// thread: on an iPhone, the emblems of a new hand of cards held the page for
// 400 ms there, the frame the cards dealt in.

import { alphaOf, shrunk } from './shrinkMask';

/** An image to read (its file), or a copy of one read before to make, `q` steps smaller. */
export type MaskAsk = { url: string } & ({ image: Blob } | { q: number });
export type MaskJob = MaskAsk & { id: number };
/** The image's size once read, or the copy as a PNG; nothing if it couldn't be done here, and `cant` if nothing can (no OffscreenCanvas). */
export type MaskAnswer = { id: number; w?: number; h?: number; png?: Blob; cant?: boolean };

const read = new Map<string, { w: number; h: number; alpha: Uint8Array }>();

self.onmessage = async ({ data: job }: MessageEvent<MaskJob>) => {
  const answer: MaskAnswer = { id: job.id };
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    self.postMessage({ ...answer, cant: true } satisfies MaskAnswer);
    return;
  }
  try {
    if ('image' in job) {
      const img = await createImageBitmap(job.image);
      const [w, h] = [img.width, img.height];
      const g = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      img.close();
      read.set(job.url, { w, h, alpha: alphaOf(g.getImageData(0, 0, w, h).data) });
      answer.w = w;
      answer.h = h;
    } else {
      const s = read.get(job.url)!;
      const mask = shrunk(s.alpha, s.w, s.h, job.q);
      const c = new OffscreenCanvas(mask.width, mask.height);
      c.getContext('2d')!.putImageData(mask, 0, 0);
      answer.png = await c.convertToBlob();
    }
  } catch {
    // (No OffscreenCanvas, say: answered with nothing, and the page does it.)
  }
  self.postMessage(answer);
};
