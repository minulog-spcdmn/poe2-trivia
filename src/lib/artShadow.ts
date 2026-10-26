// An item picture's drop shadow (ArtImage) as a bitmap of its own, under
// the picture, in place of `filter: drop-shadow()` on it. Whatever draws a
// filter draws it again each time: WebKit paints one, blurring the
// picture's alpha at the screen's pixels, whenever the layer it is in is
// painted (a find-the-art reveal swaps six pictures, twelve fades on twelve
// layers, so twelve such blurs at once, and more as the tiles round them
// change), and hands one on a layer of its own to Core Animation, which
// works it out again on every frame. With the filter alone taken off, an
// iPhone ran that reveal, and Next into such a question, at 51 to 59 fps,
// against 26 to 38 with it. Worked out once for each picture and size
// (lib/castShadow.ts), in a worker (lib/artShadowWorker.ts; here where
// there's none), the shadow is a picture like any other to draw. ArtImage
// keeps the CSS filter for a picture whose shadow couldn't be made.

import { castBox, shadowOf } from './castShadow';
import type { CastAnswer, CastJob } from './artShadowWorker';

/** A picture's shadow, for it drawn `w` x `h` (CSS px): its bitmap, `cw` x `ch` texels (one a CSS px), the picture `pad` in from its top and left. */
export type Cast = { bitmap: ImageBitmap; w: number; h: number; pad: number; cw: number; ch: number };

let worker: Worker | null | undefined;
let lastJob = 0;
/** What each job sent to the worker does with its answer. */
const answers = new Map<number, (a: CastAnswer) => void>();

/** The worker the shadows are made in; null where there's none. */
function castWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  try {
    const w = new Worker(new URL('./artShadowWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<CastAnswer>) => {
      answers.get(data.id)?.(data);
      answers.delete(data.id);
    };
    // (Failed to load, say: what it was doing comes back undone, and is done here from now on.)
    w.onerror = () => {
      w.terminate();
      worker = null;
      for (const [id, done] of answers) done({ id });
      answers.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** The shadow made in `w`, from the picture's pixels; an empty answer if it couldn't. */
async function castThere(w: Worker, img: HTMLImageElement, width: number, height: number): Promise<CastAnswer> {
  const id = ++lastJob;
  // (Its pixels as the page decoded them, handed over without a copy.)
  const image = await createImageBitmap(img);
  if (w !== worker) {
    image.close();
    return { id };
  }
  return new Promise((done) => {
    answers.set(id, done);
    w.postMessage({ id, image, w: width, h: height } satisfies CastJob, [image]);
  });
}

/** The shadow made here, on the page. */
function castHere(img: HTMLImageElement, w: number, h: number): Promise<ImageBitmap> {
  const { pad, cw, ch } = castBox(w, h);
  const c = document.createElement('canvas');
  [c.width, c.height] = [cw, ch];
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, pad, pad, w, h);
  const px = g.getImageData(0, 0, cw, ch);
  shadowOf(px.data, cw, ch);
  g.putImageData(px, 0, 0);
  return createImageBitmap(c);
}

/** The shadow of `img` (loaded and decoded) drawn `w` x `h` (CSS px); null if it can't be made. */
export async function castFor(img: HTMLImageElement, w: number, h: number): Promise<Cast | null> {
  if (!(w > 0 && h > 0) || typeof createImageBitmap === 'undefined') return null;
  try {
    let bitmap: ImageBitmap | undefined;
    const there = castWorker();
    if (there) {
      const answer = await castThere(there, img, w, h);
      // (A worker that can't draw at all isn't asked again.)
      if (answer.cant && worker === there) {
        there.terminate();
        worker = null;
      }
      bitmap = answer.bitmap;
    }
    bitmap ??= await castHere(img, w, h);
    return { bitmap, w, h, ...castBox(w, h) };
  } catch {
    return null;
  }
}
