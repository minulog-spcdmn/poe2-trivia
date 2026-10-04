// Where a veiled item is still missing a part, the edge of what has appeared
// stays alive with magic: a thin golden glow whose hot spots flicker and
// drift along the seam, grains twinkling on it, and little sparks flying up
// and out of it towards the missing part. Each patch says where it meets
// other patches (its edges). A seam lights up as the magic coming into its
// patch reaches it, and dies down as the magic moves on into the patch on its
// other side. Only seams between two parts of the item glow, never the item's
// own outline, so it shows that something is missing there, not what.

import type { ShownPatch } from './media.svelte';
import { valueNoise } from './patches';
import { FINALE_MS } from './materialize';
import { fxDensity, veilSpark } from './fx/moments';

/**
 * As fractions of a patch's burn: a seam catches when the fire gets there
 * (glowing up from GROW_AT to GROW_END), and dies down over the first FADE of
 * the burn that carries the fire on across it.
 */
const GROW_AT = 0.35;
const GROW_END = 0.9;
const FADE = 0.35;
/** Redraws per second. */
const FPS = 30;
/** How far the glow reaches from the seam, in art pixels. */
const REACH = 4;
/** How far the glow leans out of its patch towards the missing part, in art pixels. */
const PUSH = 1.5;
/** Room around each seam's glow: its reach plus the lean. */
const PAD = REACH + PUSH + 1;
/** Each seam is drawn this many times with different hot spots, blended over time so they flicker. */
const LAYERS = 3;
/** Sparks off the seams per second, at most, and per seam pixel. */
const MAX_SPARKS = 80;
const SPARKS_PER_PIXEL = 0.45;
/** Grains twinkling on the seams at once, at most, and seam pixels per grain. */
const MAX_TWINKLES = 60;
const PIXELS_PER_TWINKLE = 5;

const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** A soft round light, `size` px across, fading out through the given colour stops. */
function sprite(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}
let sprites: { haze: HTMLCanvasElement; ember: HTMLCanvasElement; grain: HTMLCanvasElement } | null = null;
function lights() {
  sprites ??= {
    haze: sprite(64, [
      [0, 'rgba(255, 150, 50, 1)'],
      [0.45, 'rgba(230, 100, 20, 0.4)'],
      [1, 'rgba(180, 60, 0, 0)'],
    ]),
    ember: sprite(32, [
      [0, 'rgba(255, 210, 130, 1)'],
      [0.35, 'rgba(255, 150, 50, 0.6)'],
      [1, 'rgba(255, 100, 20, 0)'],
    ]),
    grain: sprite(16, [
      [0, 'rgba(255, 252, 238, 1)'],
      [0.35, 'rgba(255, 220, 150, 0.8)'],
      [1, 'rgba(255, 170, 70, 0)'],
    ]),
  };
  return sprites;
}

/** Where one patch meets another: its seam pixels (art pixels, x y pairs) and their glow. */
type Seam = {
  from: number;
  to: number;
  pts: number[];
  /** Out of its patch, towards the missing part (a unit vector). */
  out: { x: number; y: number };
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layers: HTMLCanvasElement[] | null;
};

type Twinkle = { seam: Seam; x: number; y: number; born: number; life: number; size: number };

export interface FrontierParams {
  /** The art's size in its own pixels. */
  w: number;
  h: number;
  /** How long each patch takes to burn in, ms (veilPace). */
  burn: number;
  /** The answer is out: patches from now on come in quickly (FINALE_MS). */
  quick?: boolean;
  patches: ShownPatch[];
}

/**
 * Svelte action for a canvas laid over the whole veiled picture: makes the
 * seams where the item is still missing a part smoulder.
 */
export function frontier(canvas: HTMLCanvasElement, params: FrontierParams) {
  let cur = params;
  const ctx = canvas.getContext('2d')!;
  /** When each patch was first seen, and how long it takes to come in. */
  const arrived = new Map<number, { at: number; ms: number }>();
  const seams = new Map<string, Seam>();
  let W = 0;
  let H = 0;
  /** Canvas pixels per art pixel. */
  let k = 1;
  /** The layers of all seams at full glow, and which seams they hold. */
  let base: HTMLCanvasElement[] | null = null;
  let baseKey = '';
  let sparks = 0;
  let twinkles: Twinkle[] = [];
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

  /** 0 to 1, easing, between fractions `a` and `b` of patch i's burn. */
  const ramp = (i: number, now: number, a: number, b: number) => {
    const got = arrived.get(i);
    if (!got) return 0;
    const u = Math.min(1, Math.max(0, (now - got.at - a * got.ms) / ((b - a) * got.ms)));
    return u * u * (3 - 2 * u);
  };
  const grown = (s: Seam, now: number) => ramp(s.from, now, GROW_AT, GROW_END);
  const faded = (s: Seam, now: number) => ramp(s.to, now, 0, FADE);

  /** How strongly a seam burns: up as the fire reaches it, down as it moves on. */
  const strength = (s: Seam, now: number) => grown(s, now) * (1 - faded(s, now));

  /**
   * The seam's glow, drawn once per layer: a wide ember haze and a tighter
   * gold glow along it, each point as bright as that layer's noise says, so
   * every layer has its hot spots in different places.
   */
  const build = (s: Seam): HTMLCanvasElement[] => {
    const { haze, ember } = lights();
    const ox = s.x0 - PAD;
    const oy = s.y0 - PAD;
    const cw = Math.ceil((s.x1 - s.x0 + 1 + 2 * PAD) * k);
    const ch = Math.ceil((s.y1 - s.y0 + 1 + 2 * PAD) * k);
    const out: HTMLCanvasElement[] = [];
    for (let layer = 0; layer < LAYERS; layer++) {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const g = c.getContext('2d')!;
      g.globalCompositeOperation = 'lighter';
      const seed = (s.from * 131 + s.to * 17 + layer * 7919) | 0;
      for (let j = 0; j < s.pts.length; j += 2) {
        const x = s.pts[j] + 0.5;
        const y = s.pts[j + 1] + 0.5;
        const n = valueNoise(x / 6, y / 6, seed) * 0.7 + valueNoise(x / 2.5, y / 2.5, seed + 1) * 0.3;
        const v = Math.max(0, (n - 0.3) / 0.6);
        const hot = Math.min(1, v * v);
        // Pushed a little out of the patch, so the glow spills into the gap.
        const cx = (x + s.out.x * PUSH - ox) * k;
        const cy = (y + s.out.y * PUSH - oy) * k;
        if (j % 6 === 0) {
          const d = REACH * 2 * k * (0.7 + 0.3 * hot);
          g.globalAlpha = 0.06 + 0.14 * hot;
          g.drawImage(haze, cx - d / 2, cy - d / 2, d, d);
        }
        const e = 2.6 * k * (0.7 + 0.3 * hot);
        g.globalAlpha = 0.05 + 0.3 * hot;
        g.drawImage(ember, cx - e / 2, cy - e / 2, e, e);
      }
      out.push(c);
    }
    return out;
  };

  /** Notes the seams of a patch seen for the first time (those whose other side hasn't come). */
  const learn = (p: ShownPatch) => {
    const byOther = new Map<number, number[]>();
    const e = p.edges;
    for (let j = 0; j + 2 < e.length; j += 3) {
      let pts = byOther.get(e[j + 2]);
      if (!pts) byOther.set(e[j + 2], (pts = []));
      pts.push(p.x + e[j], p.y + e[j + 1]);
    }
    for (const [to, pts] of byOther) {
      if (arrived.has(to)) continue;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let j = 0; j < pts.length; j += 2) {
        x0 = Math.min(x0, pts[j]);
        x1 = Math.max(x1, pts[j]);
        y0 = Math.min(y0, pts[j + 1]);
        y1 = Math.max(y1, pts[j + 1]);
      }
      const ox = (x0 + x1) / 2 - (p.x + p.w / 2);
      const oy = (y0 + y1) / 2 - (p.y + p.h / 2);
      const len = Math.hypot(ox, oy) || 1;
      seams.set(`${p.i}>${to}`, { from: p.i, to, pts, out: { x: ox / len, y: oy / len }, x0, y0, x1, y1, layers: null });
    }
  };

  /** A random seam pixel, seams weighted by how much of them is glowing. */
  const pickPoint = (live: { seam: Seam; a: number }[], glowing: number) => {
    let r = Math.random() * glowing;
    const pick = live.find((l) => (r -= l.a * l.seam.pts.length) <= 0) ?? live[0];
    const pts = pick.seam.pts;
    const j = 2 * Math.floor((Math.random() * pts.length) / 2);
    return { seam: pick.seam, x: pts[j] + 0.5, y: pts[j + 1] + 0.5 };
  };

  const frame = (now: number) => {
    raf = 0;
    if (stopped || !canvas.isConnected) return;
    if (!size() || now - last < 1000 / FPS - 2) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const still = !!reduce?.matches;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    let changing = false;
    let glowing = 0;
    let builds = 0;
    const live: { seam: Seam; a: number }[] = [];
    const steady: Seam[] = [];
    // The layers take turns, so the hot spots flare and wander; a slow
    // breath under it all keeps it from looking mechanical.
    const weight = (layer: number) =>
      still ? 1 / LAYERS : (0.5 + 0.5 * Math.sin(now / 260 + (layer * 2 * Math.PI) / LAYERS)) * (2 / LAYERS);
    const breath = still ? 1 : 0.85 + 0.15 * Math.sin(now / 900);
    for (const [key, s] of seams) {
      const growing = grown(s, now) < 1;
      const dying = arrived.has(s.to) && faded(s, now) < 1;
      if (growing || dying) changing = true;
      const a = strength(s, now);
      if (a <= 0) {
        // Its other side has fully come in: this seam is done for good.
        if (arrived.has(s.to) && !dying) seams.delete(key);
        continue;
      }
      live.push({ seam: s, a });
      glowing += a * s.pts.length;
      // Drawing a seam's glow takes a moment, so only a couple per frame;
      // the rest start a frame or two later, while they're still faint.
      if (!s.layers) {
        if (builds >= 2) {
          changing = true;
          continue;
        }
        builds++;
        s.layers = build(s);
      }
      if (a >= 1) {
        steady.push(s);
        continue;
      }
      const dx = (s.x0 - PAD) * k;
      const dy = (s.y0 - PAD) * k;
      for (let layer = 0; layer < LAYERS; layer++) {
        ctx.globalAlpha = Math.min(1, a * weight(layer) * breath);
        ctx.drawImage(s.layers[layer], dx, dy);
      }
    }
    // Seams at full glow share one set of layers, redrawn only when that set
    // changes, so however many there are it costs a few draws per frame.
    const key = steady.map((s) => `${s.from}>${s.to}`).join(',');
    if (key !== baseKey) {
      baseKey = key;
      base ??= Array.from({ length: LAYERS }, () => Object.assign(document.createElement('canvas'), { width: W, height: H }));
      base.forEach((c, layer) => {
        const g = c.getContext('2d')!;
        g.clearRect(0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        for (const s of steady) g.drawImage(s.layers![layer], (s.x0 - PAD) * k, (s.y0 - PAD) * k);
      });
    }
    if (base && steady.length) {
      for (let layer = 0; layer < LAYERS; layer++) {
        ctx.globalAlpha = Math.min(1, weight(layer) * breath);
        ctx.drawImage(base[layer], 0, 0);
      }
    }

    if (!still && live.length) {
      // Grains twinkle on the seams, each for a moment.
      const want = Math.min(MAX_TWINKLES, Math.ceil(glowing / 2 / PIXELS_PER_TWINKLE));
      twinkles = twinkles.filter((g) => now - g.born < g.life && strength(g.seam, now) > 0);
      while (twinkles.length < want) {
        const p = pickPoint(live, glowing);
        twinkles.push({ ...p, born: now - Math.random() * 150, life: 150 + Math.random() * 450, size: 1 + Math.random() * 1.6 });
      }
      const { grain } = lights();
      for (const g of twinkles) {
        const a = Math.sin((Math.PI * (now - g.born)) / g.life);
        if (a <= 0) continue;
        ctx.globalAlpha = a * strength(g.seam, now);
        const d = g.size * k;
        ctx.drawImage(grain, g.x * k - d / 2, g.y * k - d / 2, d, d);
      }
      // And little sparks fly up off them, leaning out towards the missing part.
      const rate = Math.min(MAX_SPARKS, 6 + (glowing / 2) * SPARKS_PER_PIXEL) * fxDensity();
      sparks = Math.min(4, sparks + dt * rate);
      for (; sparks >= 1; sparks--) {
        const p = pickPoint(live, glowing);
        const r = canvas.getBoundingClientRect();
        veilSpark(
          { x: r.left + (p.x / cur.w) * r.width, y: r.top + (p.y / cur.h) * r.height },
          { x: p.seam.out.x * 25, y: p.seam.out.y * 25 },
          0.75,
        );
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Keep going while something smoulders, or a seam is still glowing up or dying down.
    if ((live.length && !still) || changing) raf = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (!raf && !stopped) raf = requestAnimationFrame(frame);
  };

  const update = (next: FrontierParams) => {
    cur = next;
    const now = performance.now();
    const fresh = next.patches.filter((p) => !arrived.has(p.i));
    const ms = next.quick ? FINALE_MS : next.burn;
    for (const p of fresh) arrived.set(p.i, { at: now, ms });
    for (const p of fresh) learn(p);
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
