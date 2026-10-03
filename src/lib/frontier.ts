// Where a veiled item is still missing a part, the edge of what has appeared
// glows and fizzles. Each patch says where it meets other patches (its
// edges); a seam glows while the patch on its other side hasn't come yet, and
// goes dark when that patch fizzles in. Only seams between two parts of the
// item glow, never the item's own outline, so the glow shows that something
// is missing there, not what.

import type { ShownPatch } from './media.svelte';
import { veilMote } from './fx/moments';

/** A new patch's own seams light up once it has mostly fizzled in, ms. */
const SETTLE_MS = 650;
/** Seams fade in and out over this long, ms. */
const FADE_MS = 400;
/** Redraws per second: the glow drifts slowly, so this is plenty. */
const FPS = 30;
/** Sparkles along the seams at once, at most, and how many seam pixels each one gets. */
const MAX_SPARKS = 40;
const PIXELS_PER_SPARK = 6;

const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

type Spark = { x: number; y: number; born: number; life: number; size: number };

/** A soft round light to stamp sparkles with. */
let sprite: HTMLCanvasElement | null = null;
function spark(): HTMLCanvasElement {
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const c = sprite.getContext('2d')!;
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255, 252, 240, 1)');
  g.addColorStop(0.18, 'rgba(255, 226, 160, 0.9)');
  g.addColorStop(0.5, 'rgba(255, 170, 60, 0.25)');
  g.addColorStop(1, 'rgba(255, 140, 30, 0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  return sprite;
}

export interface FrontierParams {
  /** The art's size in its own pixels. */
  w: number;
  h: number;
  patches: ShownPatch[];
}

/**
 * Svelte action for a canvas laid over the whole veiled picture: draws the
 * glow along the seams where the item is still missing a part.
 */
export function frontier(canvas: HTMLCanvasElement, params: FrontierParams) {
  let cur = params;
  const ctx = canvas.getContext('2d')!;
  /** When each patch was first seen. */
  const arrived = new Map<number, number>();
  let W = 0;
  let H = 0;
  /** Canvas pixels per art pixel. */
  let k = 1;

  /** Open seam pixels (art pixels, x y pairs), and the glow drawn from them. */
  let points: number[] = [];
  let glow: HTMLCanvasElement | null = null;
  let fading: { glow: HTMLCanvasElement | null; since: number } | null = null;
  let key = '';
  let dirty = true;
  let nextChange = Infinity;
  let sparks: Spark[] = [];
  let motes = 0;
  let raf = 0;
  let last = 0;
  let stopped = false;

  const size = () => {
    if (W) return true;
    const cw = canvas.clientWidth;
    if (!cw) return false;
    W = Math.max(1, Math.round(Math.min(cw * (window.devicePixelRatio || 1), cur.w * 2)));
    H = Math.max(1, Math.round((W * cur.h) / cur.w));
    k = W / cur.w;
    canvas.width = W;
    canvas.height = H;
    return true;
  };

  /** Which seams are open now: those of settled patches whose other side hasn't come. */
  const collect = (now: number) => {
    const here = new Set(cur.patches.map((p) => p.i));
    const pts: number[] = [];
    const settled: number[] = [];
    nextChange = Infinity;
    for (const p of cur.patches) {
      const at = arrived.get(p.i) ?? now;
      if (now - at < SETTLE_MS) {
        nextChange = Math.min(nextChange, at + SETTLE_MS);
        continue;
      }
      settled.push(p.i);
      const e = p.edges;
      for (let j = 0; j + 2 < e.length; j += 3) if (!here.has(e[j + 2])) pts.push(p.x + e[j], p.y + e[j + 1]);
    }
    return { pts, key: `${settled.sort((a, b) => a - b).join(',')}|${[...here].sort((a, b) => a - b).join(',')}` };
  };

  /** The glow along the given seam pixels: a wide amber haze, a gold band and a pale core. */
  const build = (pts: number[]): HTMLCanvasElement | null => {
    if (!pts.length) return null;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const path = (grow: number) => {
      g.beginPath();
      for (let j = 0; j < pts.length; j += 2) g.rect((pts[j] + 0.5 - grow / 2) * k, (pts[j + 1] + 0.5 - grow / 2) * k, grow * k, grow * k);
    };
    const pass = (grow: number, blur: number, color: string) => {
      path(grow);
      g.shadowBlur = blur * k;
      g.shadowColor = color;
      g.fillStyle = color;
      g.fill();
    };
    pass(2.4, 14, 'rgba(255, 110, 25, 0.5)');
    pass(1.6, 6, 'rgba(255, 150, 50, 0.65)');
    pass(1.1, 2.5, 'rgba(255, 200, 110, 0.75)');
    pass(0.6, 0.8, 'rgba(255, 245, 220, 0.8)');
    return c;
  };

  const viewport = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (x / cur.w) * r.width, y: r.top + (y / cur.h) * r.height };
  };

  const frame = (now: number) => {
    raf = 0;
    if (stopped || !canvas.isConnected) return;
    if (!size()) {
      raf = requestAnimationFrame(frame);
      return;
    }
    if (dirty || now >= nextChange) {
      dirty = false;
      const c = collect(now);
      if (c.key !== key) {
        key = c.key;
        points = c.pts;
        fading = { glow, since: now };
        glow = build(points);
        // Sparkles start over on the new seams (they fade in, so this doesn't jump).
        sparks = [];
      }
    }
    const still = reduce?.matches;
    if (!still && now - last < 1000 / FPS - 2) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    ctx.clearRect(0, 0, W, H);
    const pulse = still ? 1 : 0.78 + 0.14 * Math.sin(now / 420) + 0.08 * Math.sin(now / 167);
    const f = fading && !still ? Math.min(1, (now - fading.since) / FADE_MS) : 1;
    if (fading?.glow && f < 1) {
      ctx.globalAlpha = (1 - f) * pulse;
      ctx.drawImage(fading.glow, 0, 0);
    }
    if (glow) {
      ctx.globalAlpha = f * pulse;
      ctx.drawImage(glow, 0, 0);
    }
    if (f >= 1) fading = null;

    if (!still && points.length) {
      // Sparkles twinkle along the seams, each for a moment.
      const want = Math.min(MAX_SPARKS, Math.ceil(points.length / 2 / PIXELS_PER_SPARK));
      sparks = sparks.filter((s) => now - s.born < s.life);
      while (sparks.length < want) {
        const j = 2 * Math.floor((Math.random() * points.length) / 2);
        sparks.push({
          x: points[j] + 0.5 + (Math.random() - 0.5) * 2,
          y: points[j + 1] + 0.5 + (Math.random() - 0.5) * 2,
          born: now - Math.random() * 200,
          life: 300 + Math.random() * 700,
          size: 2 + Math.random() * 4,
        });
      }
      ctx.globalCompositeOperation = 'lighter';
      const img = spark();
      for (const s of sparks) {
        const a = Math.sin((Math.PI * (now - s.born)) / s.life);
        if (a <= 0) continue;
        ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(now / 45 + s.x * 3.1));
        const d = s.size * k;
        ctx.drawImage(img, s.x * k - d / 2, s.y * k - d / 2, d, d);
      }
      ctx.globalCompositeOperation = 'source-over';
      // And now and then a mote drifts up off them.
      motes = Math.min(2, motes + dt * Math.min(10, 2 + points.length / 400));
      for (; motes >= 1; motes--) {
        const j = 2 * Math.floor((Math.random() * points.length) / 2);
        veilMote(viewport(points[j] + 0.5, points[j + 1] + 0.5));
      }
    }
    ctx.globalAlpha = 1;

    // Keep going while something glows, fades or is about to change.
    if ((points.length && !still) || fading || nextChange < Infinity) raf = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (!raf && !stopped) raf = requestAnimationFrame(frame);
  };

  const update = (next: FrontierParams) => {
    cur = next;
    const now = performance.now();
    for (const p of next.patches) if (!arrived.has(p.i)) arrived.set(p.i, now);
    dirty = true;
    wake();
  };

  update(params);
  return {
    update,
    destroy() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}
