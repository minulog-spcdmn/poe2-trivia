// Masks drawn from a copy at about the size they're shown at. A CSS mask
// image shrunk to a third or a quarter of its pixels comes out jagged in
// Chrome: its edge goes in hard stair-steps (measured against the same card
// drawn at 4x and averaged down), and the steps crawl as the card tilts or
// its emblem turns. The emblems' clean masks are baked for the largest
// card on the sharpest screen (lib/iconFit), with steep edges, so on a dpr 1
// screen they're shrunk that far. (Item art masked as it comes, as the
// codex's glyphs are, has soft edges and shrinks smoothly enough.) So each
// is shrunk first, each pixel of the copy the average of the patch of
// the image it covers (as the 4x render averaged down does), to a little
// over the size it's drawn at, in steps of a quarter of an octave so a
// window resized doesn't make a copy for every pixel. The browser then shrinks it by no more than a step and
// the headroom, which it filters smoothly. The copies are made once for
// each image and size, in a worker (lib/fineMaskWorker.ts; here where there's
// none), and the element keeps its own mask until its copy is ready, or if
// one can't be made.

import { layoutZoomOf } from './stage';
import { alphaOf, shrunk, STEPS } from './shrinkMask';
import type { MaskAnswer, MaskAsk } from './fineMaskWorker';

/** Room over the drawn size: a hovered card's emblem grows 1.1, its card 1.04. */
const HEADROOM = 1.15;

/** An image read: its size, its copies made (by steps smaller), and how one is made. */
type Source = { w: number; h: number; sizes: Map<number, Promise<string>>; shrink: (q: number) => Promise<Blob> };
const sources = new Map<string, Promise<Source>>();

let worker: Worker | null | undefined;
let lastJob = 0;
/** What each job sent to the worker does with its answer. */
const answers = new Map<number, (a: MaskAnswer) => void>();

/** The worker the masks are read and shrunk in; null where there's none. */
function maskWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./fineMaskWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<MaskAnswer>) => {
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

/** `job` sent to `w`, its answer back: an empty one at once if `w` has stopped meanwhile. */
function ask(w: Worker, job: MaskAsk): Promise<MaskAnswer> {
  const id = ++lastJob;
  if (w !== worker) return Promise.resolve({ id });
  return new Promise((done) => {
    answers.set(id, done);
    w.postMessage({ ...job, id });
  });
}

/** The image read in the worker, its copies to be made there; null if it can't be. */
async function readThere(url: string): Promise<Source | null> {
  const w = maskWorker();
  if (!w) return null;
  try {
    const image = await (await fetch(url)).blob();
    const { w: iw, h: ih, cant } = await ask(w, { url, image });
    // (A worker that can't read images at all isn't asked again.)
    if (cant && worker === w) {
      w.terminate();
      worker = null;
    }
    if (!iw || !ih) return null;
    // A copy the worker couldn't make (or stopped making) is made here, from the image read here.
    let here: Promise<Source> | undefined;
    const shrink = async (q: number) => {
      const { png } = await ask(w, { url, q });
      return png ?? (await (here ??= readHere(url))).shrink(q);
    };
    return { w: iw, h: ih, sizes: new Map([[0, Promise.resolve(url)]]), shrink };
  } catch {
    return null;
  }
}

/** The image read here, its copies made here. */
async function readHere(url: string): Promise<Source> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const [w, h] = [img.naturalWidth, img.naturalHeight];
  const c = document.createElement('canvas');
  [c.width, c.height] = [w, h];
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const alpha = alphaOf(g.getImageData(0, 0, w, h).data);
  const shrink = (q: number) => {
    const mask = shrunk(alpha, w, h, q);
    const c = document.createElement('canvas');
    [c.width, c.height] = [mask.width, mask.height];
    c.getContext('2d')!.putImageData(mask, 0, 0);
    return new Promise<Blob>((done, fail) => c.toBlob((b) => (b ? done(b) : fail(new Error('no blob')))));
  };
  return { w, h, sizes: new Map([[0, Promise.resolve(url)]]), shrink };
}

function source(url: string): Promise<Source> {
  let s = sources.get(url);
  if (!s) {
    s = readThere(url).then((there) => there ?? readHere(url));
    sources.set(url, s);
    // (Not kept if it fails: tried again on the next look.)
    s.catch(() => sources.delete(url));
  }
  return s;
}

/** The mask `q` steps smaller (STEPS to an octave), as a URL to mask with: white, as opaque as the image averaged over each pixel's patch. */
function sizeAt(s: Source, q: number): Promise<string> {
  let made = s.sizes.get(q);
  if (!made) {
    made = s.shrink(q).then((png) => URL.createObjectURL(png));
    s.sizes.set(q, made);
  }
  return made;
}

/** How many device pixels tall the element's mask image is drawn: its mask-size (px, or contain in its box), zoomed (all of it: a sharp card is drawn at its full zoom, lib/stage), at the screen's density. */
function drawnHeight(node: HTMLElement, s: Source): number {
  const cs = getComputedStyle(node);
  const size = cs.maskSize || cs.getPropertyValue('-webkit-mask-size');
  const px = size.split(' ').map((v) => (v.endsWith('px') ? parseFloat(v) : NaN));
  const h = px.length === 2 && px[1]! > 0 ? px[1]! : Math.min(node.offsetWidth / s.w, node.offsetHeight / s.h) * s.h;
  return h * layoutZoomOf(node) * devicePixelRatio;
}

/**
 * Svelte action: masks `node` with a copy of `url` about the size it's drawn
 * at, through --fine (its CSS masks with `var(--fine, var(--src))`). Looked
 * at again when the window or the element's size changes (a resize, a zoom,
 * another screen).
 */
export function fineMask(node: HTMLElement, url: string) {
  let at = url;
  let run = 0;
  let frame = 0;
  const update = async () => {
    const mine = ++run;
    try {
      const s = await source(at);
      const want = drawnHeight(node, s) * HEADROOM;
      if (!(want > 0)) return;
      // The smallest step still over what's wanted (the image itself, if that's all it has).
      const q = Math.max(0, Math.floor(Math.log2(s.h / want) * STEPS));
      const src = await sizeAt(s, q);
      if (mine === run) node.style.setProperty('--fine', `url('${src}')`);
    } catch {
      if (mine === run) node.style.removeProperty('--fine');
    }
  };
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => void update());
  };
  later();
  addEventListener('resize', later);
  // (Its own size too: an emblem's fit arrives after it's first laid out.)
  const seen = new ResizeObserver(later);
  seen.observe(node);
  return {
    update(next: string) {
      if (next === at) return;
      at = next;
      node.style.removeProperty('--fine');
      later();
    },
    destroy() {
      run++;
      cancelAnimationFrame(frame);
      removeEventListener('resize', later);
      seen.disconnect();
    },
  };
}
