// Prepares the host's pictures for a question (prepArt.ts: altered, a veiled
// one cut, encoded) away from the page's main thread: done there, the
// decoding, the per-pixel noise and the veil's cut held the page up as each
// question began, just as its pongs and the first of its art were due.

import { prepare, transfers, type PrepJob, type Prepped } from './prepArt.ts';

export type PrepRequest =
  /** One picture from the item's file as fetched (decoded here too); answered with it prepared. */
  | { t: 'prep'; id: number; file: Blob; job: PrepJob }
  /** Gets ready before the first question: a tiny picture through every step, so the first real one runs warm. */
  | { t: 'warm' }
  /** A picture no longer wanted (its question was thrown away): dropped where it is, unanswered. */
  | { t: 'drop'; id: number };

/** A picture prepared, or why it couldn't be here (the page then does it itself). */
export type PrepAnswer = { id: number; prepped?: Prepped; error?: string };

const surface = (w: number, h: number) => new OffscreenCanvas(w, h);
const encode = async (canvas: OffscreenCanvas, type: string, quality: number) => (await canvas.convertToBlob({ type, quality })).arrayBuffer();

/** Jobs in hand, and those of them dropped meanwhile (looked at between steps). */
const running = new Set<number>();
const dropped = new Set<number>();
const DROPPED = 'dropped';

self.onmessage = async ({ data: req }: MessageEvent<PrepRequest>) => {
  if (req.t === 'drop') {
    if (running.has(req.id)) dropped.add(req.id);
    return;
  }
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
  const { id } = req;
  const check = () => {
    if (dropped.has(id)) throw new Error(DROPPED);
  };
  let img: ImageBitmap | null = null;
  running.add(id);
  try {
    img = await createImageBitmap(req.file);
    check();
    // Encoding is the last and longest step: not begun for a picture dropped meanwhile.
    const prepped = await prepare(img, img.width, req.job, surface, (canvas, type, quality) => (check(), encode(canvas, type, quality)));
    check();
    self.postMessage({ id, prepped } satisfies PrepAnswer, { transfer: transfers(prepped) });
  } catch (err) {
    // The page let go of a dropped one already.
    if (!dropped.has(id)) self.postMessage({ id, error: String(err) } satisfies PrepAnswer);
  } finally {
    img?.close();
    running.delete(id);
    dropped.delete(id);
  }
};
