// A patch of veiled art fizzles in. Its visible pixels appear grain by grain
// in a noisy order. A scatter of twinkling sparks runs just ahead of where
// grains are appearing; each grain flares up as a hot glint and settles into
// the picture lit from within by golden light, which then slowly cools.
// Motes of light lift off wherever grains are appearing. Transparent pixels
// are never touched, so the magic keeps to the item's own shape.

import { valueNoise } from './patches';
import { patchIgnites, patchMote, patchSettled } from './fx/moments';

/** How long a patch takes to fizzle in, ms. */
const DURATION = 1000;
/**
 * As fractions of the fizzle: how far ahead of the appearing grains sparks
 * twinkle, how long each grain glints, and how long its glow takes to cool.
 */
const AHEAD = 0.16;
const GLINT = 0.07;
const AFTERGLOW = 0.45;
/** Share of the pixels that twinkle as sparks before they appear. */
const SPARKLY = 0.12;
/** Motes per second while grains are appearing. */
const MOTES = 50;
/** Fizzles at once; past this (a picture arriving with many patches in) patches just fade in. */
const MAX_FIZZLING = 10;

const HOT = [255, 250, 236];
/** The inner light, added to the art: pale gold while hot, cooling to amber. */
const LIGHT_HOT = [235, 205, 140];
const LIGHT_COOL = [150, 80, 18];
/** The mist the item gathers out of, and how thick it gets. */
const MIST = [255, 196, 110];
const MIST_ALPHA = 0.4;

const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let fizzling = 0;

/** Half linear, half smoothstep: the fizzle starts straight away and settles at the end. */
const ease = (p: number) => 0.5 * p + 0.5 * p * p * (3 - 2 * p);

/**
 * Svelte action for a veiled patch's <canvas>, sized and placed by CSS: draws
 * the patch from `url` (at screen resolution, capped at twice the art's) and
 * fizzles it in.
 */
export function materialize(canvas: HTMLCanvasElement, url: string) {
  let W = 0;
  let H = 0;
  /** Canvas pixels per CSS pixel. */
  let s = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  let stopped = false;
  let counted = false;
  let raf = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    if (counted) fizzling--;
  };

  /** Viewport position of canvas pixel `i`. */
  const at = (i: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((i % W) / W) * r.width, y: r.top + (((i / W) | 0) / H) * r.height, size: r.width };
  };

  /** Runs the fizzle over the picture already drawn on the canvas. */
  const fizzle = () => {
    const art = ctx.getImageData(0, 0, W, H);
    const src = art.data.slice();
    const px = art.data;
    // Only the visible pixels take part, in the order they appear: a coarse
    // drift across the patch broken up by fine grain, so it sparkles in.
    const vis: number[] = [];
    for (let i = 0; i < W * H; i++) if (src[i * 4 + 3] > 0) vis.push(i);
    if (!vis.length) return stop();
    const seed = (Math.random() * 2 ** 31) | 0;
    const coarse = 1 / (10 * s);
    const fine = 1 / (1.6 * s);
    const ax = Math.random() * 2 - 1;
    const ay = Math.random() * 2 - 1;
    const when = new Float32Array(vis.length);
    let lo = Infinity;
    let hi = -Infinity;
    vis.forEach((i, j) => {
      const x = i % W;
      const y = (i / W) | 0;
      const v =
        valueNoise(x * coarse, y * coarse, seed) * 0.45 +
        valueNoise(x * fine + 50, y * fine + 50, seed) * 0.35 +
        ((x / W) * ax + (y / H) * ay) * 0.2;
      when[j] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    });
    // Sorted by when they appear, so each frame only visits the pixels that
    // are changing: those settled are done, those still to come stay clear.
    const rank = Uint32Array.from(vis.keys()).sort((a, b) => when[a] - when[b]);
    const span = hi - lo || 1;
    const lit = new Uint32Array(vis.length);
    const order = new Float32Array(vis.length);
    rank.forEach((j, r) => {
      lit[r] = vis[j];
      order[r] = (when[j] - lo) / span;
    });
    for (const i of lit) px[i * 4 + 3] = 0;
    ctx.putImageData(art, 0, 0);
    // Some pixels twinkle as sparks before they appear, each at its own pace.
    const twinkle = new Uint8Array(lit.length);
    for (let j = 0; j < lit.length; j++) if (Math.random() < SPARKLY) twinkle[j] = 1 + Math.floor(Math.random() * 255);
    let settled = 0;
    let shown = 0;
    let ahead = 0;

    const end = 1 + GLINT + AFTERGLOW;
    let start = 0;
    let last = 0;
    let motes = Math.random();

    const frame = (now: number) => {
      if (stopped) return;
      if (!canvas.isConnected) return stop();
      if (!start) start = last = now;
      const p = Math.min(1, (now - start) / DURATION);
      const t = end * ease(p);
      // Pixels whose glow has cooled get their final colour once.
      while (settled < lit.length && t - order[settled] >= GLINT + AFTERGLOW) {
        const o = lit[settled++] * 4;
        px[o] = src[o];
        px[o + 1] = src[o + 1];
        px[o + 2] = src[o + 2];
        px[o + 3] = src[o + 3];
      }
      while (shown < lit.length && order[shown] <= t) shown++;
      while (ahead < lit.length && order[ahead] <= t + AHEAD) ahead++;
      // Ahead of the grains a faint golden mist gathers in the item's shape,
      // with sparks twinkling in and out of it, brighter as the grains near.
      for (let j = shown; j < ahead; j++) {
        const o = lit[j] * 4;
        const near = 1 - (order[j] - t) / AHEAD;
        if (twinkle[j]) {
          const tw = 0.5 + 0.5 * Math.sin(now / 38 + twinkle[j]);
          px[o] = HOT[0];
          px[o + 1] = HOT[1];
          px[o + 2] = HOT[2];
          px[o + 3] = src[o + 3] * near * near * tw;
        } else {
          px[o] = MIST[0];
          px[o + 1] = MIST[1];
          px[o + 2] = MIST[2];
          px[o + 3] = src[o + 3] * MIST_ALPHA * near * near;
        }
      }
      for (let j = settled; j < shown; j++) {
        const d = t - order[j];
        const o = lit[j] * 4;
        if (d < GLINT) {
          // Appearing: a hot glint that settles into the lit picture.
          const u = d / GLINT;
          for (let c = 0; c < 3; c++) px[o + c] = HOT[c] + (src[o + c] + LIGHT_HOT[c] - HOT[c]) * u;
          px[o + 3] = src[o + 3] * (0.4 + 0.6 * u);
        } else {
          // In: the picture, lit from within by light that cools from pale
          // gold to amber and fades, so the art's detail shows throughout.
          const g = 1 - (d - GLINT) / AFTERGLOW;
          const k = g * g;
          for (let c = 0; c < 3; c++) px[o + c] = src[o + c] + (LIGHT_COOL[c] + (LIGHT_HOT[c] - LIGHT_COOL[c]) * g) * k;
          px[o + 3] = src[o + 3];
        }
      }
      ctx.putImageData(art, 0, 0);

      // Motes lift off grains that are appearing right now. Capped, so a frame
      // that found none doesn't save up a burst.
      motes = Math.min(3, motes + ((now - last) / 1000) * MOTES * (t < 1 + GLINT ? 1 : 0));
      last = now;
      // The appearing grains are the last ones shown, just before `shown`.
      let glinting = shown;
      while (glinting > settled && t - order[glinting - 1] < GLINT) glinting--;
      for (; motes >= 1 && glinting < shown; motes--) patchMote(at(lit[glinting + Math.floor(Math.random() * (shown - glinting))]));

      if (p >= 1) {
        patchSettled(canvas);
        return stop();
      }
      raf = requestAnimationFrame(frame);
    };

    const f = at(lit[0]);
    patchIgnites(f, f.size);
    raf = requestAnimationFrame(frame);
  };

  const img = new Image();
  img.src = url;
  const begin = () => {
    if (stopped) return;
    // Screen resolution, but no more than twice the art's own: the picture
    // has no finer detail, and every pixel costs work on each frame.
    W = Math.max(1, Math.round(Math.min(canvas.clientWidth * (window.devicePixelRatio || 1), img.naturalWidth * 2)));
    H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth));
    s = W / (canvas.clientWidth || 1);
    canvas.width = W;
    canvas.height = H;
    ctx.drawImage(img, 0, 0, W, H);
    if (reduce?.matches || fizzling >= MAX_FIZZLING) {
      canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce?.matches ? 300 : 450, easing: 'ease-out' });
      return;
    }
    fizzling++;
    counted = true;
    fizzle();
  };
  img.decode().then(begin, () => {});

  return { destroy: stop };
}
