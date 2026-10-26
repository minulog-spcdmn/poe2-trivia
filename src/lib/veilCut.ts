// A veiled picture's patches cut out on this device (media.svelte.ts Shown):
// their shapes from the labels the host sent (patchShapes), and each one's
// own picture from the whole one (patchPicture). Shared by the worker that
// does it away from the page's main thread (veilWorker.ts) and the page
// itself, where no worker can (veilCutter.ts).

import { patchCoverage, patchShapes, unpackLabels, visibleBox, type PatchShape } from './patches';

/** A patch's own picture: a canvas when cut on the page, a bitmap from the worker. */
export type PatchImage = HTMLCanvasElement | ImageBitmap;

/** A patch's place in its picture, in art pixels, and its edges: all the page needs of its shape. */
export type PatchPlace = Pick<PatchShape, 'x' | 'y' | 'w' | 'h' | 'edges'>;

/** A veiled picture as a guest gets it: W × H art pixels, its picture encoded, its labels packed (packLabels). */
export interface VeilWire {
  w: number;
  h: number;
  data: ArrayBuffer;
  labels: Uint16Array;
}

/** What the host cut a veiled picture into, and its pixels: nothing to decode or work out again. */
export interface OwnVeil {
  shapes: PatchShape[];
  /** Where its art pixels are visible (litMask). */
  lit: Uint8Array;
  /** The picture at full resolution, as encoded (left out once handed to the worker). */
  pixels?: ImageData;
}

/** The patches a picture's packed labels make, and where its art pixels are visible; null if the labels don't fit the picture. */
export function shapesOf({ w, h, labels }: VeilWire): { shapes: PatchShape[]; lit: Uint8Array } | null {
  const label = unpackLabels(labels, w * h);
  if (!label) return null;
  const lit = new Uint8Array(label.length);
  for (let i = 0; i < label.length; i++) if (label[i] >= 0) lit[i] = 1;
  return { shapes: patchShapes(label, w, h), lit };
}

/** A shape as the page needs it (PatchPlace). */
export const placeOf = ({ x, y, w, h, edges }: PatchShape): PatchPlace => ({ x, y, w, h, edges });

type Surface = HTMLCanvasElement | OffscreenCanvas;
type Ctx = Pick<CanvasRenderingContext2D, 'drawImage' | 'getImageData' | 'putImageData' | 'imageSmoothingQuality'>;

/** Where the visible pixels are in `img` drawn over the whole of `canvas` (visibleBox), as the host measures a veiled picture. */
export function drawnBox(img: CanvasImageSource, canvas: Surface): [number, number, number, number] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as unknown as Ctx | null;
  if (!ctx) throw new Error('no 2d canvas');
  const { width: W, height: H } = canvas;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, W, H);
  return visibleBox(ctx.getImageData(0, 0, W, H).data, W, H);
}

/**
 * A patch's own picture, at the veiled picture's resolution (`img`, of W × H
 * art pixels): its part of the picture, as much of each pixel as
 * patchCoverage says (smooth edges through its ring, not art pixels' steps;
 * `lit`: where the art pixels are visible), as the host's patches were when
 * each went out on its own. `surface` makes the canvas it's drawn on.
 */
export function patchPicture<S extends Surface>(img: ImageBitmap, W: number, H: number, lit: Uint8Array, p: PatchShape, surface: (w: number, h: number) => S): S {
  const S = Math.max(1, Math.round(img.width / W));
  const canvas = surface(p.w * S, p.h * S);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as unknown as Ctx | null;
  if (!ctx) throw new Error('no 2d canvas');
  ctx.drawImage(img, p.x * S, p.y * S, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // One 32-bit word per pixel, so each one clears in one go.
  const px = new Uint32Array(data.data.buffer);
  const bytes = data.data;
  const cover = patchCoverage(p, lit, W, H, S);
  for (let o = 0; o < px.length; o++) {
    const c = cover[o];
    if (!c) px[o] = 0;
    else if (c < 1) bytes[o * 4 + 3] = Math.round(bytes[o * 4 + 3] * c);
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/**
 * A veiled picture's patches, cut where this runs: its shapes worked out when
 * first asked for (or the host's own), its picture decoded once, and each
 * patch's picture made when asked for.
 */
export class VeilCut<S extends Surface> {
  private made: { shapes: PatchShape[]; lit: Uint8Array } | null | undefined;
  private image: Promise<ImageBitmap> | null = null;

  constructor(
    private wire: VeilWire,
    private surface: (w: number, h: number) => S,
    own?: OwnVeil,
  ) {
    if (own) this.made = own;
    if (own?.pixels) this.image = createImageBitmap(own.pixels);
  }

  /** Its patches' shapes, in the cut's order; null if its labels don't fit it. */
  shapes() {
    if (this.made === undefined) this.made = shapesOf(this.wire);
    return this.made?.shapes ?? null;
  }

  /** Decodes its picture now rather than when the first patch is asked for. */
  decode() {
    return (this.image ??= createImageBitmap(new Blob([this.wire.data])));
  }

  async picture(i: number): Promise<S> {
    const p = this.shapes()?.[i];
    if (!p || !this.made) throw new Error(`no patch ${i}`);
    return patchPicture(await this.decode(), this.wire.w, this.wire.h, this.made.lit, p, this.surface);
  }
}
