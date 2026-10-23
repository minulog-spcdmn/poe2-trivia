// The host's art for a question, made ready to go out (media.svelte.ts
// prepareMedia): each item drawn lightly altered, a veiled one cut into its
// patches, and the picture encoded. Shared by the worker that does it away
// from the page's main thread (prepWorker.ts) and the page itself, where no
// worker can: done on the page, the alteration's per-pixel noise and the
// veil's cut held it up for a second or more as each question began.

import { labelPatches, litMask, packLabels, patchShapes, seededRandom, spreadOrder, veilSchedule, visibleBox, type PatchShape, type VeilPlan } from './patches.ts';

/** One picture to prepare: the item's art and how to draw it. */
export interface PrepJob {
  /** The art's size in art pixels (Item.w, Item.h). */
  w: number;
  h: number;
  /** At most how many pixels per art pixel it goes out with (media.svelte.ts SHARP, LIGHT). */
  most: number;
  grayscale: boolean;
  /** Flipped left to right. */
  mirror: boolean;
  /** Veiled: cut into `size` × `size`-ish patches on `seed`, paced as `plan` has it (cutArt). */
  veil?: { size: number; seed: number; plan: VeilPlan };
  /**
   * Craft: drawn the same way every time for `seed` (so its patches fall in
   * the same places from one look to the next), and with `share` of its
   * patches cut out (the ones a veil would uncover last), before it is
   * encoded: what is hidden never leaves the host.
   */
  hide?: { size: number; seed: number; share: number };
}

/** A veiled picture's cut (cutArt), in art pixels. */
export interface ArtCut {
  w: number;
  h: number;
  /** How long each patch takes to burn in (ms, whole). */
  burn: number;
  count: number;
  /** Where the item is: x, y, w, h of its visible pixels. */
  box: [number, number, number, number];
  /** Which patch each art pixel falls in, as it goes out (packLabels). */
  labels: ArrayBuffer;
  /** The patches, as labelPatches numbers them (patchShapes), and where the art pixels are visible (litMask). */
  shapes: PatchShape[];
  lit: Uint8Array;
  /** The patches in the order they uncover, and (veilSchedule) when each goes out, the gap up to the half, and each one's area in that order. */
  order: number[];
  delays: number[];
  gap: number;
  areas: number[];
}

/** A picture prepared: its size in art pixels, encoded; a veiled one with its cut and its pixels as encoded (for the host's own device). */
export interface Prepped {
  w: number;
  h: number;
  data: ArrayBuffer;
  cut?: ArtCut & { pixels: ImageData };
}


/** How many pixels per art pixel a picture goes out with: as many as its file has (its width over the art's), but no more than `most`. */
export const artScale = (fileWidth: number, artWidth: number, most: number) => Math.max(1, Math.min(most, Math.round(fileWidth / artWidth)));

/**
 * Noise on every visible pixel of RGBA `d` (a few levels either way), so the
 * picture matches no file byte for byte; `grayscale` turns it gray too.
 * Transparent pixels are left alone.
 */
export function addNoise(d: Uint8ClampedArray, grayscale: boolean, random: () => number = Math.random) {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (random() - 0.5) * 6;
    if (grayscale) {
      const g = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] + n;
      d[i] = d[i + 1] = d[i + 2] = g;
    } else {
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
  }
}

/**
 * A veiled picture cut into `size` × `size`-ish patches (labelPatches on
 * `seed`), from its W × H RGBA pixels at one pixel per art pixel: their
 * shapes, the order they uncover in (spreadOrder), paced for the patches it
 * really has and their areas (veilSchedule, as `plan` has it), where the item
 * is, and the labels as they go out.
 */
export function cutArt(pixels: Uint8ClampedArray, W: number, H: number, { size, seed, plan }: { size: number; seed: number; plan: VeilPlan }): ArtCut {
  const lit = litMask(pixels, W, H);
  const label = labelPatches(W, H, size, seed, lit);
  const shapes = patchShapes(label, W, H);
  const order = spreadOrder(shapes, seed);
  const areas = order.map((i) => shapes[i].area);
  const schedule = veilSchedule(areas, plan);
  return {
    w: W,
    h: H,
    burn: Math.round(schedule.burn),
    count: shapes.length,
    box: visibleBox(pixels, W, H),
    labels: packLabels(label).buffer as ArrayBuffer,
    shapes,
    lit,
    order,
    delays: schedule.delays,
    gap: schedule.gap,
    areas,
  };
}

type Surface = HTMLCanvasElement | OffscreenCanvas;
type Ctx = Pick<
  CanvasRenderingContext2D,
  'drawImage' | 'getImageData' | 'putImageData' | 'translate' | 'scale' | 'setTransform' | 'filter' | 'imageSmoothingQuality'
>;

function context(canvas: Surface): Ctx {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as unknown as Ctx | null;
  if (!ctx) throw new Error('no 2d canvas');
  return ctx;
}

/**
 * Prepares one picture from the item's file (`img`, `fileWidth` pixels wide):
 * draws it with small random changes (and flipped if `job.mirror`), so it
 * matches no file byte for byte, on a canvas with artScale pixels per art
 * pixel and a whole number of art pixels in size. The changes keep clear of
 * the art's sharpness: it is shifted by whole pixels and not turned, only its
 * size is resampled. A veiled one is cut in art pixels (a copy scaled down to
 * them), so its patches' shapes, seams and areas are what they always were;
 * the picture still goes out whole, at full resolution. `surface` makes the
 * canvases; `encode` encodes one (WebP, at `quality`).
 */
export async function prepare<S extends Surface>(
  img: CanvasImageSource,
  fileWidth: number,
  job: PrepJob,
  surface: (w: number, h: number) => S,
  encode: (canvas: S, type: string, quality: number) => Promise<ArrayBuffer>,
): Promise<Prepped> {
  const S = artScale(fileWidth, job.w, job.most);
  // Craft's pictures are drawn alike on their seed; every other one by chance.
  const random = job.hide ? seededRandom(job.hide.seed ^ 0x2f6b) : Math.random;
  const rand = (min: number, max: number) => min + random() * (max - min);
  const scale = rand(0.9, 1.0);
  const w = Math.round(job.w * scale);
  const h = Math.round(job.h * scale);
  const pad = Math.round(rand(2, 8));
  const canvas = surface((w + pad * 2) * S, (h + pad * 2) * S);
  const ctx = context(canvas);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(Math.round(canvas.width / 2 + rand(-1.5, 1.5) * S), Math.round(canvas.height / 2 + rand(-1.5, 1.5) * S));
  if (job.mirror) ctx.scale(-1, 1);
  ctx.filter = `brightness(${rand(0.97, 1.03)}) saturate(${rand(0.96, 1.04)})`;
  ctx.drawImage(img, (-w / 2) * S, (-h / 2) * S, w * S, h * S);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  addNoise(pixels.data, job.grayscale);
  ctx.putImageData(pixels, 0, 0);
  const W = canvas.width / S;
  const H = canvas.height / S;
  if (job.hide && job.hide.share > 0) {
    const small = surface(W, H);
    const sg = context(small);
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(canvas, 0, 0, W, H);
    const label = labelPatches(W, H, job.hide.size, job.hide.seed, litMask(sg.getImageData(0, 0, W, H).data, W, H));
    const order = spreadOrder(patchShapes(label, W, H), job.hide.seed);
    const hidden = new Set(order.slice(order.length - Math.round(order.length * Math.min(1, job.hide.share))));
    const d = pixels.data;
    const row = canvas.width * 4;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!hidden.has(label[y * W + x])) continue;
        for (let yy = y * S; yy < (y + 1) * S; yy++) for (let xx = x * S; xx < (x + 1) * S; xx++) d[yy * row + xx * 4 + 3] = 0;
      }
    ctx.putImageData(pixels, 0, 0);
  }
  // A quality that keeps the upscaled art's detail.
  const data = await encode(canvas, 'image/webp', rand(0.92, 0.95));
  if (!job.veil) return { w: W, h: H, data };

  const small = surface(W, H);
  const sg = context(small);
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(canvas, 0, 0, W, H);
  const cut = cutArt(sg.getImageData(0, 0, W, H).data, W, H, job.veil);
  // The picture as encoded, for the host's own device to cut its patches' pictures from (veilCut.ts OwnVeil).
  return { w: W, h: H, data, cut: { ...cut, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height) } };
}

/** Everything a prepared picture holds that can be handed to another thread rather than copied. */
export function transfers({ data, cut }: Prepped): ArrayBuffer[] {
  if (!cut) return [data];
  const out: ArrayBuffer[] = [data, cut.labels, cut.lit.buffer as ArrayBuffer, cut.pixels.data.buffer as ArrayBuffer];
  for (const s of cut.shapes) out.push(s.mask.buffer as ArrayBuffer, s.own.buffer as ArrayBuffer, s.edges.buffer as ArrayBuffer);
  return out;
}
