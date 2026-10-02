// A veiled tile materialises: its cover burns away in reverse. A glowing
// front creeps out from a random point along a ragged edge; just ahead of it
// the cover chars and heats up, and behind it the art (the <img> under this
// canvas) shows through as a hot golden silhouette that cools into the
// picture. Motes of light lift off the front while it moves.

import { tileIgnites, tileMote, tileSettled } from './fx/moments';

/** How long the front takes to cross a tile, ms. */
const DURATION = 950;
/** Widths of the zones around the front, as fractions of the whole burn. */
const LINE = 0.045;
const RIM = 0.08;
const AFTERGLOW = 0.3;
/** Motes per second while the front is moving. */
const MOTES = 60;
/** Burns at once; past this (a picture arriving with many tiles already up) tiles just fade in. */
const MAX_BURNING = 10;

const HOT = [255, 246, 222];
const GOLD = [255, 196, 104];
const EMBER = [255, 122, 36];

const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let burning = 0;

/**
 * The cover plate, drawn to match `.cell::after` in QuestionView: inset 1px,
 * a dark 155deg gradient, a thin gold border, a bevel and an inner shadow.
 * `s` is canvas pixels per CSS pixel.
 */
function drawCover(ctx: CanvasRenderingContext2D, W: number, H: number, s: number) {
  const x = s;
  const y = s;
  const w = W - 2 * s;
  const h = H - 2 * s;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 2 * s);
  ctx.clip();
  const a = (155 * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
  g.addColorStop(0, '#221c14');
  g.addColorStop(0.7, '#0d0b08');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // Inset shadows, bottom one first: CSS paints the first listed on top.
  const m = 40 * s;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 14 * s;
  ctx.beginPath();
  ctx.rect(x - m, y - m, w + 2 * m, h + 2 * m);
  ctx.rect(x, y, w, h);
  ctx.fillStyle = '#000';
  ctx.fill('evenodd');
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  const band = (ox: number, oy: number, color: string) => {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.rect(x + s + ox * s, y + s + oy * s, w - 2 * s, h - 2 * s);
    ctx.fillStyle = color;
    ctx.fill('evenodd');
  };
  band(-1, -1, 'rgba(0, 0, 0, 0.6)');
  band(1, 1, 'rgba(232, 205, 150, 0.08)');
  band(0, 0, 'rgba(125, 99, 51, 0.4)');
  ctx.restore();
}

/** Smooth value noise in [0, 1]. */
function noise(x: number, y: number, seed: number): number {
  const hash = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * u;
  const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * u;
  return a + (b - a) * v;
}

/**
 * When each pixel materialises, 0 (first) to 1 (last): distance from a random
 * origin, roughened with noise so the front is ragged rather than a circle.
 */
function burnOrder(W: number, H: number, s: number): { order: Float32Array; ox: number; oy: number } {
  const ox = Math.random() * W;
  const oy = Math.random() * H;
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy)) || 1;
  const seed = (Math.random() * 2 ** 31) | 0;
  const k = 1 / (9 * s);
  const order = new Float32Array(W * H);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = noise(x * k, y * k, seed) * 0.7 + noise(x * k * 2.7 + 17, y * k * 2.7 + 5, seed) * 0.3;
      const v = (Math.hypot(x - ox, y - oy) / far) * 0.65 + n * 0.35;
      order[y * W + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const span = hi - lo || 1;
  for (let i = 0; i < order.length; i++) order[i] = (order[i] - lo) / span;
  return { order, ox, oy };
}

/** The art's alpha at the canvas's size, so the afterglow takes the picture's shape. */
function artAlpha(img: HTMLImageElement, W: number, H: number): Uint8ClampedArray | null {
  try {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const a = new Uint8ClampedArray(W * H);
    for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3];
    return a;
  } catch {
    return null;
  }
}

/** Half linear, half smoothstep: the burn catches straight away and settles at the end. */
const ease = (p: number) => 0.5 * p + 0.5 * p * p * (3 - 2 * p);

/**
 * Svelte action for a veiled tile's <img>: lays a canvas over the cell that
 * starts as the cover and burns away to reveal the image underneath.
 */
export function materialize(img: HTMLImageElement) {
  const cell = img.parentElement;
  if (!cell) return;
  const cssW = cell.clientWidth;
  const cssH = cell.clientHeight;
  if (!cssW || !cssH) return;
  const s = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(1, Math.round(cssW * s));
  const H = Math.max(1, Math.round(cssH * s));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', pointerEvents: 'none' });
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Drawn before the browser paints, so the cell never shows without its cover.
  drawCover(ctx, W, H, s);
  cell.appendChild(canvas);

  let stopped = false;
  let raf = 0;
  const done = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    canvas.remove();
  };

  if (reduce?.matches || burning >= MAX_BURNING) {
    const fade = () => {
      if (stopped) return;
      canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce?.matches ? 300 : 450, easing: 'ease-out' }).finished.then(done, done);
    };
    img.decode().then(fade, fade);
    return { destroy: done };
  }

  burning++;
  const release = () => {
    if (!stopped) burning--;
    img.style.clipPath = '';
    done();
  };

  const cover = ctx.getImageData(0, 0, W, H).data;
  const { order, ox, oy } = burnOrder(W, H, s);
  // The cover is inset 1px, so the art would peek out around it: keep the art
  // inside that margin (the <img> runs 1px past the cell's right and bottom)
  // until the front has passed the cell's whole outline.
  let edge = 0;
  const inset = Math.ceil(s);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= inset && y >= inset && x < W - inset && y < H - inset) x = W - inset - 1;
      else edge = Math.max(edge, order[y * W + x]);
    }
  }
  img.style.clipPath = 'inset(1px 2px 2px 1px)';
  const out = ctx.createImageData(W, H);
  const px = out.data;
  const from = -LINE;
  const to = 1 + AFTERGLOW;
  let alpha: Uint8ClampedArray | null = null;
  let start = 0;
  let last = 0;
  let motes = Math.random();

  const viewport = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (x / W) * r.width, y: r.top + (y / H) * r.height, size: r.width };
  };

  const frame = (now: number) => {
    if (stopped) return;
    if (!canvas.isConnected) return release();
    if (!start) start = last = now;
    const p = Math.min(1, (now - start) / DURATION);
    const t = from + (to - from) * ease(p);
    for (let i = 0, o = 0; i < order.length; i++, o += 4) {
      const d = order[i] - t;
      if (d >= LINE + RIM) {
        // Still covered.
        px[o] = cover[o];
        px[o + 1] = cover[o + 1];
        px[o + 2] = cover[o + 2];
        px[o + 3] = cover[o + 3];
      } else if (d >= LINE) {
        // Just ahead of the front the cover chars and starts to glow.
        const k = 1 - (d - LINE) / RIM;
        const heat = k * k * k;
        const dark = 1 - 0.55 * k;
        px[o] = cover[o] * dark + EMBER[0] * heat * 0.7;
        px[o + 1] = cover[o + 1] * dark + EMBER[1] * heat * 0.7;
        px[o + 2] = cover[o + 2] * dark + EMBER[2] * heat * 0.7;
        px[o + 3] = Math.max(cover[o + 3], 255 * heat);
      } else if (d >= 0) {
        // The front itself: white-hot on the art's side, ember on the cover's.
        const u = d / LINE;
        const c = u < 0.5 ? HOT : GOLD;
        const e = u < 0.5 ? GOLD : EMBER;
        const m = u < 0.5 ? u * 2 : u * 2 - 1;
        px[o] = c[0] + (e[0] - c[0]) * m;
        px[o + 1] = c[1] + (e[1] - c[1]) * m;
        px[o + 2] = c[2] + (e[2] - c[2]) * m;
        px[o + 3] = 255;
      } else {
        // Materialised: the art shows through, a golden silhouette cooling off.
        const g = 1 + d / AFTERGLOW;
        if (g <= 0) {
          px[o + 3] = 0;
          continue;
        }
        const h = g * g;
        px[o] = GOLD[0] + (HOT[0] - GOLD[0]) * h;
        px[o + 1] = GOLD[1] + (HOT[1] - GOLD[1]) * h;
        px[o + 2] = GOLD[2] + (HOT[2] - GOLD[2]) * h;
        px[o + 3] = h * 235 * (alpha ? alpha[i] / 255 : 1);
      }
    }
    ctx.putImageData(out, 0, 0);
    if (t > edge && img.style.clipPath) img.style.clipPath = '';

    // Motes lift off wherever the front is right now.
    // Capped, so a frame that found no front to spawn on doesn't save up a burst.
    motes = Math.min(3, motes + ((now - last) / 1000) * MOTES * (t > 0 && t < 1 ? 1 : 0));
    last = now;
    for (let tries = 0; motes >= 1 && tries < 40; tries++) {
      const i = Math.floor(Math.random() * order.length);
      const d = order[i] - t;
      if (d < 0 || d > LINE) continue;
      motes--;
      const v = viewport(i % W, Math.floor(i / W));
      tileMote(v);
    }

    if (p >= 1) {
      tileSettled(cell);
      return release();
    }
    raf = requestAnimationFrame(frame);
  };

  const begin = () => {
    if (stopped) return;
    alpha = artAlpha(img, W, H);
    const v = viewport(ox, oy);
    tileIgnites(v, v.size);
    raf = requestAnimationFrame(frame);
  };
  img.decode().then(begin, begin);
  return { destroy: release };
}
