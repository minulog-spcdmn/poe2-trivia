// A patch of veiled art fizzles into being, the magic spreading from the
// part of the item already there: a ragged front sweeps across the patch from
// the seam it shares with it (the very first patch catches at a point and
// spreads outward). The front is a band of grains, each flaring up as a hot
// glint and settling into the picture lit from within by golden light that
// slowly cools; ahead of it the item's shape gathers out of a faint golden
// mist with a few sparks twinkling in it. Sparks fly off the front, leaning
// the way it moves. Transparent pixels are never touched, so the magic keeps
// to the item's own shape.
//
// The burn's arithmetic (burn.ts) runs in a worker (burnWorker.ts), which
// draws it on the patch's canvas handed over to it, the page doing no more
// than fly its sparks; on the page itself where there's no worker, or none
// that can draw there (no OffscreenCanvas), and until one has said it's there.

import { Burn, type BurnSetup } from './burn';
import { fxDensity, veilIgnites, veilSpark } from './fx/moments';
import { PING_MS } from './prepPool';
import { zoomOf } from './stage';
import type { BurnJob, BurnNews } from './burnWorker';
import type { PatchImage } from './veilCut';

/** How long the rest of the picture takes to come in once the answer is out, per patch (ms). */
export const FINALE_MS = 400;

/**
 * At most how many pixels per art pixel the veil's effects are drawn with
 * (here and in frontier.ts): about what the largest screens show the art at
 * (1.8 times its size, times the stage's zoom of up to 2.2). A dense screen
 * on top of that (a large Retina one: about 5) gets a little less than its
 * own, as every pixel costs work on each frame.
 */
export const FX_SCALE = 4;

/**
 * How many px wide an effect's canvas is drawn for a picture `artW` art
 * pixels wide: the screen's (the canvas's own px times the stage's zoom,
 * lib/stage.ts, times the screen's density), FX_SCALE per art pixel at
 * most; 0 for a canvas not laid out yet.
 */
export function fxWidth(canvas: HTMLElement, artW: number): number {
  const cw = canvas.clientWidth;
  if (!cw) return 0;
  return Math.min(cw * zoomOf(canvas) * (window.devicePixelRatio || 1), artW * FX_SCALE);
}

/** Burns at once; past this (a picture arriving with many patches in) patches just fade in. */
const MAX_BURNING = 14;

const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let burning = 0;

export interface BurnParams {
  /** The patch's own picture (veilCut.ts patchPicture). */
  picture: () => Promise<PatchImage>;
  /** The patch's size in art pixels (its picture is finer, by the item's artScale). */
  w: number;
  h: number;
  /** The patch's edges: (x, y, patch) triples (see PatchShape.edges). */
  edges: Uint16Array;
  /** Patches already there when this one arrived: the magic spreads in from them. */
  before: number[];
  /** How long the patch takes to burn in, ms (veilPace). */
  burn: number;
  /** The answer is out: come in quickly (FINALE_MS). */
  quick?: boolean;
}

let worker: Worker | null | undefined;
/** The worker has said it's there: since it started, or since the page last came back into view. */
let here = false;
let lastBurn = 0;
/** What the page does with the worker's news of each of its burns. */
const there = new Map<number, { caught: (at: [number, number]) => void; sparks: (s: number[]) => void; done: () => void }>();

/**
 * The worker the burns are drawn in, started on first use; null where
 * there's none, or none can draw on a canvas handed over to it.
 */
function burnWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  if (typeof HTMLCanvasElement === 'undefined' || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return null;
  try {
    const w = new Worker(new URL('./burnWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<BurnNews>) => hear(data);
    // (Failed to load, say: the burns are drawn here from now on.)
    w.onerror = () => lose(w, null);
    worker = w;
    watch();
  } catch {
    worker = null;
  }
  return worker;
}

/** Starts the worker ahead of the first patch (a veiled picture on its way), so that one burns there too. */
export const warmBurns = () => void burnWorker();

/** The worker, once it has said it's there: a canvas handed to one that never runs would stay blank. */
const ready = () => (here ? burnWorker() : null);

function hear(news: BurnNews) {
  if (news.t === 'here') here = true;
  else if (news.t === 'caught') there.get(news.id)?.caught(news.at);
  else {
    for (const [id, s] of news.sparks) there.get(id)?.sparks(s);
    for (const id of news.done) there.get(id)?.done();
  }
}

/** `w` is let go, its burns counted done (their canvases stay as it left them), and `next` takes its place. */
function lose(w: Worker, next: null | undefined) {
  if (w !== worker) return;
  w.terminate();
  worker = next;
  here = false;
  for (const b of [...there.values()]) b.done();
}

/**
 * A phone that keeps a page in the background may stop its workers without
 * a word (prepPool.ts). Back in view, the worker is asked whether it's still
 * there, the burns drawn here until it answers; one that doesn't within
 * PING_MS is replaced.
 */
let watching = false;
function watch() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  document.addEventListener('visibilitychange', () => {
    const w = worker;
    if (document.hidden || !w) return;
    here = false;
    w.postMessage({ t: 'ping' } satisfies BurnJob);
    setTimeout(() => {
      if (here || w !== worker) return;
      lose(w, undefined);
      burnWorker();
    }, PING_MS);
  });
}

/**
 * Svelte action for a veiled patch's <canvas>, sized and placed by CSS: draws
 * the patch and burns it in, at the screen's resolution (FX_SCALE at most),
 * the picture scaled up smoothly into it, so the burn's grains and glints are
 * as fine as the screen however coarse the picture is.
 */
export function materialize(canvas: HTMLCanvasElement, params: BurnParams) {
  let W = 0;
  let H = 0;
  let stopped = false;
  let counted = false;
  let raf = 0;
  /** Tells the worker the burn is done with, while it's burning there. */
  let leave: (() => void) | null = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    leave?.();
    if (counted) burning--;
  };

  /** Where a spot on the canvas (its px) is on the page. */
  const onPage = (x: number, y: number, r: DOMRect) => ({ x: r.left + x * (r.width / W), y: r.top + y * (r.width / W) });
  const ignite = ([x, y]: [number, number]) => {
    const r = canvas.getBoundingClientRect();
    veilIgnites(onPage(x, y, r), r.width);
  };
  /** Sparks fly off the front (BurnFrame's sparks). */
  const fly = (sparks: number[]) => {
    const r = canvas.getBoundingClientRect();
    for (let k = 0; k + 3 < sparks.length; k += 4) veilSpark(onPage(sparks[k], sparks[k + 1], r), { x: sparks[k + 2], y: sparks[k + 3] }, 1);
  };

  /** Draws the picture on the canvas here. */
  const draw = (img: PatchImage) => {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, W, H);
    return ctx;
  };

  /** Burns on the page, on its frames. */
  const burnHere = (img: PatchImage, setup: BurnSetup) => {
    const ctx = draw(img);
    const art = ctx.getImageData(0, 0, W, H);
    const burn = new Burn(art.data, setup);
    if (burn.empty) return stop();
    ctx.putImageData(art, 0, 0);
    const frame = (now: number) => {
      if (stopped) return;
      if (!canvas.isConnected) return stop();
      const f = burn.frame(now);
      if (f.box) ctx.putImageData(art, 0, 0, ...f.box);
      if (f.sparks.length) fly(f.sparks);
      if (f.done) return stop();
      raf = requestAnimationFrame(frame);
    };
    if (burn.origin) ignite(burn.origin);
    raf = requestAnimationFrame(frame);
  };

  /** Burns in the worker, on the canvas handed over to it. */
  const burnThere = async (w: Worker, img: ImageBitmap, setup: BurnSetup) => {
    // A copy goes: the question keeps its own till it's over (media.svelte.ts).
    let picture: ImageBitmap;
    try {
      picture = await createImageBitmap(img);
    } catch {
      return stop();
    }
    if (stopped || w !== worker) {
      picture.close();
      // (The worker was let go meanwhile: it burns here.)
      if (!stopped) burnHere(img, setup);
      return;
    }
    canvas.width = W;
    canvas.height = H;
    const offscreen = canvas.transferControlToOffscreen();
    const id = ++lastBurn;
    there.set(id, {
      caught: ignite,
      sparks: (s) => (canvas.isConnected ? fly(s) : stop()),
      done: () => {
        there.delete(id);
        leave = null;
        stop();
      },
    });
    leave = () => {
      there.delete(id);
      w.postMessage({ t: 'stop', id } satisfies BurnJob);
    };
    w.postMessage({ t: 'burn', id, canvas: offscreen, picture, setup } satisfies BurnJob, [offscreen, picture]);
  };

  const begin = (img: PatchImage) => {
    if (stopped) return;
    // Screen resolution, up to FX_SCALE (fxWidth): every pixel costs work on
    // each frame. The quick ones at the reveal (many at once, for a moment)
    // keep to the picture's own, as does a canvas not laid out yet. Its size
    // in art pixels places the burn.
    const aw = params.w;
    const ah = params.h;
    const screen = fxWidth(canvas, aw);
    W = Math.max(1, Math.round(screen && !params.quick ? screen : Math.min(screen || Infinity, img.width)));
    H = Math.max(1, Math.round((W * ah) / aw));
    if (reduce?.matches || burning >= MAX_BURNING) {
      draw(img);
      canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce?.matches ? 300 : 450, easing: 'ease-out' });
      return;
    }
    burning++;
    counted = true;
    const setup: BurnSetup = {
      W,
      H,
      sx: W / aw,
      sy: H / ah,
      edges: params.edges,
      before: params.before,
      duration: params.quick ? FINALE_MS : params.burn,
      density: fxDensity(),
    };
    // (A picture cut on the page is a canvas: there's no worker for burns either, then.)
    const w = ready();
    if (w && typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) void burnThere(w, img, setup);
    else burnHere(img, setup);
  };
  params.picture().then(begin, () => {});

  return { destroy: stop };
}
