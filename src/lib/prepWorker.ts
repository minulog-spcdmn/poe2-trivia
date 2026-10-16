// Prepares the host's pictures for a question (prepArt.ts: altered, a veiled
// one cut, encoded) away from the page's main thread: done there, the
// decoding, the per-pixel noise and the veil's cut held the page up as each
// question began, just as its pongs and the first of its art were due.

import { prepare, transfers, type PrepJob, type Prepped } from './prepArt.ts';

export type PrepRequest =
  /** One picture from the item's file as fetched (decoded here too); answered with it prepared. */
  | { t: 'prep'; id: number; file: Blob; job: PrepJob }
  /** Gets ready before the first question: a tiny picture through every step, so the first real one runs warm. */
  | { t: 'warm' };

/** A picture prepared, or why it couldn't be here (the page then does it itself). */
export type PrepAnswer = { id: number; prepped?: Prepped; error?: string };

const surface = (w: number, h: number) => new OffscreenCanvas(w, h);
const encode = async (canvas: OffscreenCanvas, type: string, quality: number) => (await canvas.convertToBlob({ type, quality })).arrayBuffer();

self.onmessage = async ({ data: req }: MessageEvent<PrepRequest>) => {
  if (req.t === 'warm') {
    const img = new OffscreenCanvas(8, 8);
    const ctx = img.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#c84';
    ctx.fillRect(1, 1, 6, 6);
    const plan = { ms: 4000, halfBy: 3000, endBy: 3500 };
    await prepare(img, 8, { w: 4, h: 4, most: 2, grayscale: false, mirror: false, veil: { size: 3, seed: 1, plan } }, surface, encode).catch(() => {});
    return;
  }
  let img: ImageBitmap | null = null;
  try {
    img = await createImageBitmap(req.file);
    const prepped = await prepare(img, img.width, req.job, surface, encode);
    self.postMessage({ id: req.id, prepped } satisfies PrepAnswer, { transfer: transfers(prepped) });
  } catch (err) {
    self.postMessage({ id: req.id, error: String(err) } satisfies PrepAnswer);
  } finally {
    img?.close();
  }
};
