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
// A canvas handed over shows only what its worker keeps (burnWorker.ts), so
// a worker is let go only once none of the canvases it drew is on the page.

import { Burn, type BurnSetup } from './burn';
import { fxDensity, veilIgnites, veilSpark } from './fx/moments';
import { HIDDEN_CHECK_MS, onShownAgain, PING_MS, PREP_STALL_MS } from './prepPool';
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

/** What the page does with a worker's news of a burn going on there, and if the worker is given no more before it's done. */
interface Burning {
  caught: (at: [number, number]) => void;
  sparks: (s: number[]) => void;
  done: () => void;
  lost: () => void;
}

/** A worker the burns are drawn in. */
interface Burner {
  worker: Worker;
  /** It has said it's there: since it started, or since it was last asked. */
  here: boolean;
  /** Its burns going on, by id. */
  burns: Map<number, Burning>;
  /** Every canvas handed to it, burning or burnt in, that the page hasn't let go of. */
  held: Set<number>;
  /** The wait for its answer, asked whether it's still there. */
  asked?: ReturnType<typeof setTimeout>;
}

/** The worker new burns go to; null where there's none, or none can draw on a canvas handed over to it. */
let current: Burner | null | undefined;
let lastBurn = 0;

/** The worker new burns go to, started on first use. */
function burner(): Burner | null {
  if (current !== undefined) return current;
  current = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  if (typeof HTMLCanvasElement === 'undefined' || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return null;
  try {
    const worker = new Worker(new URL('./burnWorker.ts', import.meta.url), { type: 'module' });
    const b: Burner = { worker, here: false, burns: new Map(), held: new Set() };
    worker.onmessage = ({ data }: MessageEvent<BurnNews>) => hear(b, data);
    // (Failed to load, say, or broke: the burns are drawn here from now on.)
    worker.onerror = () => retire(b, null);
    current = b;
    watch();
  } catch {
    current = null;
  }
  return current;
}

/** Starts the worker ahead of the first patch (a veiled picture on its way), so that one burns there too. */
export const warmBurns = () => void burner();

/** The worker new burns go to, once it has said it's there: a canvas handed to one that never runs would stay blank. */
const ready = () => (current?.here ? current : null);

function hear(b: Burner, news: BurnNews) {
  if (news.t === 'here') {
    b.here = true;
    clearTimeout(b.asked);
  } else if (news.t === 'caught') b.burns.get(news.id)?.caught(news.at);
  else {
    for (const [id, s] of news.sparks) b.burns.get(id)?.sparks(s);
    for (const id of news.done) b.burns.get(id)?.done();
  }
}

/**
 * `b` is given no more burns, `next` taking its place. Those it hasn't
 * finished are lost, drawn whole on the page instead; it is let go once the
 * page has let go of every canvas it drew. (Terminated, it would take them
 * all with it in Chromium, burnt in or not, though it may only be slow.)
 */
function retire(b: Burner, next: null | undefined) {
  if (b !== current) return;
  current = next;
  clearTimeout(b.asked);
  const lost = [...b.burns.values()];
  b.burns.clear();
  for (const l of lost) l.lost();
  release(b);
}

/** The page lets go of canvas `id`, handed to `b`: it's gone from the page. */
function letGo(b: Burner, id: number) {
  b.burns.delete(id);
  if (!b.held.delete(id)) return;
  b.worker.postMessage({ t: 'stop', id } satisfies BurnJob);
  release(b);
}

/** A worker given no more burns is let go once nothing it drew is on the page. */
function release(b: Burner) {
  if (b === current || b.held.size) return;
  b.worker.onmessage = b.worker.onerror = null;
  b.worker.terminate();
}

/**
 * A phone that keeps a page in the background a long while may stop its
 * workers without a word (prepPool.ts). Back after HIDDEN_CHECK_MS, the
 * worker is asked whether it's still there, the burns drawn here until it
 * answers. One that doesn't within PING_MS (PREP_STALL_MS with burns in
 * hand, as it answers only between their frames) is given no more, and a
 * fresh one takes its place.
 */
let watching = false;
function watch() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  onShownAgain(document, (hiddenMs) => {
    const b = current;
    if (hiddenMs < HIDDEN_CHECK_MS || !b?.here) return;
    b.here = false;
    b.worker.postMessage({ t: 'ping' } satisfies BurnJob);
    b.asked = setTimeout(
      () => {
        retire(b, undefined);
        burner();
      },
      b.burns.size ? PREP_STALL_MS : PING_MS,
    );
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
  /** Lets the worker go of the canvas handed to it, burning there or burnt in. */
  let leave: (() => void) | null = null;
  /** The patch's picture laid over its canvas, the burn there lost (cover). */
  let over: HTMLCanvasElement | null = null;
  /** The burn is over: done, or its canvas gone. */
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    if (counted) burning--;
  };
  /** The canvas is gone: what the patch holds besides goes with it. */
  const destroy = () => {
    stop();
    leave?.();
    leave = null;
    over?.remove();
    over = null;
  };

  /** Where a spot on the canvas (its px) is on the page. */
  const onPage = (x: number, y: number, r: DOMRect) => ({ x: r.left + x * (r.width / W), y: r.top + y * (r.width / W) });
  const ignite = ([x, y]: [number, number]) => {
    const r = canvas.getBoundingClientRect();
    veilIgnites(onPage(x, y, r), r.width);
  };
  /**
   * Sparks fly off the front (BurnFrame's sparks). (The worker's news of
   * them comes between the page's frames, when it's laid out already: the
   * canvas's place is read for nothing then, where in a frame it made the
   * page lay itself out an extra time, frontier.ts.)
   */
  const fly = (sparks: number[]) => {
    const r = canvas.getBoundingClientRect();
    for (let k = 0; k + 3 < sparks.length; k += 4) veilSpark(onPage(sparks[k], sparks[k + 1], r), { x: sparks[k + 2], y: sparks[k + 3] }, 1);
  };

  /** Draws the picture on the canvas here (or on `on`, one laid over it). */
  const draw = (img: PatchImage, on = canvas) => {
    on.width = W;
    on.height = H;
    const ctx = on.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, W, H);
    return ctx;
  };

  /**
   * The burn in the worker is lost (retire): the canvas handed over keeps
   * what the worker last drew there, stopped part way with its mist and
   * gold, the whole picture if it was only slow and finished underneath,
   * or nothing, and the page can't draw on it. The patch's picture goes
   * whole on a clone of it laid over it, placed and styled the same, as a
   * burn on the page would end, and the canvas under it is hidden: through
   * the picture's soft rim and glows it would show, more opaque than the
   * picture and tinted for the rest of the question. (So the clone keeps
   * data-shape, and the effects' light, which weighs each piece by its
   * opacity, keeps to the cover alone, fx/effects.ts assemble.)
   */
  const cover = (img: PatchImage) => {
    const c = canvas.cloneNode(false) as HTMLCanvasElement;
    try {
      draw(img, c);
    } catch {
      // (A question already over has let its pictures go: the patch is on its way out.)
      return;
    }
    canvas.after(c);
    canvas.style.opacity = '0';
    over = c;
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
  const burnThere = async (b: Burner, img: ImageBitmap, setup: BurnSetup) => {
    // A copy goes: the question keeps its own till it's over (media.svelte.ts),
    // and with it the patch's picture, should the burn there be lost.
    let picture: ImageBitmap;
    try {
      picture = await createImageBitmap(img);
    } catch {
      return stop();
    }
    if (stopped || ready() !== b) {
      picture.close();
      // (The worker was given no more meanwhile, or asked whether it's still there: it burns here.)
      if (!stopped) burnHere(img, setup);
      return;
    }
    canvas.width = W;
    canvas.height = H;
    const offscreen = canvas.transferControlToOffscreen();
    const id = ++lastBurn;
    b.held.add(id);
    b.burns.set(id, {
      caught: ignite,
      sparks: (s) => (canvas.isConnected ? fly(s) : destroy()),
      // (Burnt in, the canvas is still the worker's to keep, till it's gone: destroy.)
      done: () => {
        b.burns.delete(id);
        stop();
      },
      lost: () => {
        stop();
        cover(img);
      },
    });
    leave = () => letGo(b, id);
    b.worker.postMessage({ t: 'burn', id, canvas: offscreen, picture, setup } satisfies BurnJob, [offscreen, picture]);
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
    const b = ready();
    if (b && typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) void burnThere(b, img, setup);
    else burnHere(img, setup);
  };
  params.picture().then(begin, () => {});

  return { destroy };
}
