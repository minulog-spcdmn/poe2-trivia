// An item picture's drop shadow (ArtImage) as a picture of its own, under
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
//
// It comes as a PNG, shown in an <img> decoded before it goes on the page,
// not as a canvas: Chromium always gives a canvas that shows a bitmap
// (`bitmaprenderer`) a compositor layer of its own, and WebKit may too. Then
// the picture over it needs one as well, and so does whatever overlaps the
// shadow's spill into the tiles round it, and each fading box round a
// picture and its shadow gets drawn offscreen on every frame of its fade.
// An <img> is painted with the rest of its box, once.

import { castBox, shadowOf } from './castShadow';
import type { CastAnswer, CastJob } from './artShadowWorker';

/** A picture's shadow, for it drawn `w` x `h` (CSS px): an <img>, decoded, `cw` x `ch` CSS px, the picture `pad` in from its top and left. */
export type Cast = { image: HTMLImageElement; w: number; h: number; pad: number; cw: number; ch: number };

let worker: Worker | null | undefined;
let lastJob = 0;
/** What each job sent to the worker does with its answer. */
const answers = new Map<number, (a: CastAnswer) => void>();

/**
 * Lets `w` go and does here from now on what it was doing: every job it
 * hasn't answered gets an empty answer now. A terminated worker's messages
 * never arrive, even ones already sent, so a job left waiting would wait
 * for ever.
 */
function stop(w: Worker) {
  w.terminate();
  if (worker === w) worker = null;
  for (const [id, done] of answers) done({ id });
  answers.clear();
}

/** The worker the shadows are made in, made the first time it's wanted (warmCasts, ahead of need); null where there's none. */
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
    w.onerror = () => stop(w);
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * The worker made, and so loaded and warmed (lib/artShadowWorker.ts), ahead
 * of the first picture that waits for its shadow: Game calls it as a game
 * opens. Made at the first shadow, its script was fetched, over the network
 * on a first visit, and its first blurs run cold while the pictures of the
 * game's first question with art waited for them, up to CAST_WAIT
 * (ArtImage), and the art is the clue: a player who came by an invite link
 * had seen none before (Home's DailyUnique is the only other).
 */
export const warmCasts = () => void castWorker();

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
function castHere(img: HTMLImageElement, w: number, h: number): Promise<Blob> {
  const { pad, cw, ch } = castBox(w, h);
  const c = document.createElement('canvas');
  [c.width, c.height] = [cw, ch];
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, pad, pad, w, h);
  const px = g.getImageData(0, 0, cw, ch);
  shadowOf(px.data, cw, ch);
  g.putImageData(px, 0, 0);
  return new Promise<Blob>((done, fail) => c.toBlob((b) => (b ? done(b) : fail(new Error('no blob'))), 'image/png'));
}

/**
 * Let go of each shadow's PNG once nothing holds its <img> any more. Not
 * sooner: a copy of the <img> (lib/blastAway.ts clones the question it
 * blows apart) loads it again by its URL.
 */
const unheld = typeof FinalizationRegistry === 'undefined' ? null : new FinalizationRegistry<string>((url) => URL.revokeObjectURL(url));

/** The PNG in an <img>, decoded, so it shows as it goes on the page. */
async function shown(png: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(png);
  const image = new Image();
  image.alt = '';
  image.src = url;
  try {
    await image.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  if (unheld) unheld.register(image, url);
  // (Where nothing tells when it's gone, let go now: the <img> itself keeps what it decoded.)
  else URL.revokeObjectURL(url);
  return image;
}

/** A shadow made ahead (castAhead), for the picture at `src` drawn `w` x `h`. */
type Ahead = { w: number; h: number; cast: Promise<Cast | null> };
/** Shadows made ahead of the ArtImage that shows them, by their pictures' src, each until it takes it. */
const ahead = new Map<string, Ahead>();

/**
 * The shadow of `img` (loaded and decoded) for `w` x `h` (CSS px), set out
 * to be made now, before the picture's ArtImage is on the page: its
 * castFor, for the same picture at that size, gets this one (once: the
 * shadow's <img> can be in one place only). QuestionView makes the full
 * art's ahead of a Delve reveal, so that the veil hands over to it as it
 * comes in, not a shadow's making later. `drop` lets it go if nothing took
 * it (the question moved on).
 */
export function castAhead(img: HTMLImageElement, w: number, h: number): { cast: Promise<Cast | null>; drop: () => void } {
  const kept: Ahead = { w, h, cast: castFor(img, w, h) };
  const src = img.src;
  ahead.set(src, kept);
  return { cast: kept.cast, drop: () => void (ahead.get(src) === kept && ahead.delete(src)) };
}

/**
 * How long each shadow took, from being asked for to shown (and of that,
 * the worker's own work, `worked`), on the page's timeline as "art shadow":
 * what a run on a phone reads back (performance.getEntriesByName) to see
 * whether the last of a find-the-art reveal's six, one after another in
 * the worker, come near CAST_WAIT (ArtImage).
 */
function timed(start: number, detail: { w: number; h: number; where: 'worker' | 'page'; worked?: number }) {
  try {
    performance.measure('art shadow', { start, detail });
  } catch {
    // (A browser without User Timing's options: nothing to see by, the same shadow.)
  }
}

/** The shadow of `img` (loaded and decoded) drawn `w` x `h` (CSS px); null if it can't be made. */
export async function castFor(img: HTMLImageElement, w: number, h: number): Promise<Cast | null> {
  if (!(w > 0 && h > 0) || typeof createImageBitmap === 'undefined') return null;
  const kept = ahead.get(img.src);
  if (kept && Math.abs(kept.w - w) < 0.5 && Math.abs(kept.h - h) < 0.5) {
    ahead.delete(img.src);
    return kept.cast;
  }
  const start = performance.now();
  try {
    let png: Blob | undefined;
    let worked: number | undefined;
    const there = castWorker();
    if (there) {
      const answer = await castThere(there, img, w, h);
      // (A worker that can't draw at all isn't asked again, nor waited on for the jobs sent it since.)
      if (answer.cant) stop(there);
      ({ png, worked } = answer);
    }
    const where = png ? 'worker' : 'page';
    png ??= await castHere(img, w, h);
    const cast: Cast = { image: await shown(png), w, h, ...castBox(w, h) };
    timed(start, { w, h, where, worked });
    return cast;
  } catch {
    return null;
  }
}
