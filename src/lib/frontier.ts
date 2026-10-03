// Where a veiled item is still missing a part, the edge of what has appeared
// smoulders like burning parchment: a soft ember glow whose hot spots flicker
// and drift along the seam, with embers rising off it. Each patch says where
// it meets other patches (its edges); a seam starts to smoulder as soon as
// its patch begins to fizzle in, and dies down while the patch on its other
// side fizzles in. Only seams between two parts of the item smoulder, never
// the item's own outline, so it shows that something is missing there, not
// what.

import type { ShownPatch } from './media.svelte';
import { valueNoise } from './patches';
import { veilMote } from './fx/moments';

/** A seam glows up over the first part of its patch's fizzle, and dies down over its neighbour's, ms. */
const GROW_MS = 700;
const FADE_MS = 900;
/** Redraws per second. */
const FPS = 30;
/** How far the glow reaches from the seam, in art pixels. */
const REACH = 7;
/** Each seam is drawn this many times with different hot spots, blended over time so they flicker. */
const LAYERS = 3;
/** Embers rising off the seams at once, at most, and seam pixels per ember. */
const MAX_EMBERS = 36;
const PIXELS_PER_EMBER = 7;

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
let sprites: { haze: HTMLCanvasElement; ember: HTMLCanvasElement; spark: HTMLCanvasElement } | null = null;
function lights() {
  sprites ??= {
    haze: sprite(64, [
      [0, 'rgba(255, 96, 24, 1)'],
      [0.45, 'rgba(220, 60, 12, 0.45)'],
      [1, 'rgba(160, 30, 0, 0)'],
    ]),
    ember: sprite(32, [
      [0, 'rgba(255, 200, 110, 1)'],
      [0.35, 'rgba(255, 140, 40, 0.6)'],
      [1, 'rgba(255, 90, 20, 0)'],
    ]),
    spark: sprite(16, [
      [0, 'rgba(255, 236, 190, 1)'],
      [0.4, 'rgba(255, 170, 70, 0.7)'],
      [1, 'rgba(255, 110, 30, 0)'],
    ]),
  };
  return sprites;
}

/** Where one patch meets another: its seam pixels (art pixels, x y pairs) and their glow. */
type Seam = {
  from: number;
  to: number;
  pts: number[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layers: HTMLCanvasElement[] | null;
};

type Ember = { seam: Seam; x: number; y: number; vx: number; vy: number; born: number; life: number; size: number };

export interface FrontierParams {
  /** The art's size in its own pixels. */
  w: number;
  h: number;
  patches: ShownPatch[];
}

/**
 * Svelte action for a canvas laid over the whole veiled picture: makes the
 * seams where the item is still missing a part smoulder.
 */
export function frontier(canvas: HTMLCanvasElement, params: FrontierParams) {
  let cur = params;
  const ctx = canvas.getContext('2d')!;
  /** When each patch was first seen. */
  const arrived = new Map<number, number>();
  const seams = new Map<string, Seam>();
  let W = 0;
  let H = 0;
  /** Canvas pixels per art pixel. */
  let k = 1;
  let embers: Ember[] = [];
  /** The layers of all seams at full glow, and which seams they hold. */
  let base: HTMLCanvasElement[] | null = null;
  let baseKey = '';
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

  /** 0 to 1: how far a patch has come in, easing over `ms` from its arrival. */
  const ramp = (i: number, now: number, ms: number) => {
    const at = arrived.get(i);
    if (at === undefined) return 0;
    const u = Math.min(1, Math.max(0, (now - at) / ms));
    return u * u * (3 - 2 * u);
  };

  /** How strongly a seam smoulders: up with its patch, down with the one across it. */
  const strength = (s: Seam, now: number) => ramp(s.from, now, GROW_MS) * (1 - ramp(s.to, now, FADE_MS));

  /**
   * The seam's glow, drawn once per layer: a wide ember haze and a tighter
   * gold glow along it, each point as bright as that layer's noise says, so
   * every layer has its hot spots in different places.
   */
  const build = (s: Seam): HTMLCanvasElement[] => {
    const { haze, ember } = lights();
    const ox = s.x0 - REACH;
    const oy = s.y0 - REACH;
    const cw = Math.ceil((s.x1 - s.x0 + 1 + 2 * REACH) * k);
    const ch = Math.ceil((s.y1 - s.y0 + 1 + 2 * REACH) * k);
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
        const cx = (x - ox) * k;
        const cy = (y - oy) * k;
        if (j % 6 === 0) {
          const d = REACH * 2 * k * (0.7 + 0.3 * hot);
          g.globalAlpha = 0.09 + 0.2 * hot;
          g.drawImage(haze, cx - d / 2, cy - d / 2, d, d);
        }
        const e = 4.5 * k * (0.6 + 0.4 * hot);
        g.globalAlpha = 0.04 + 0.26 * hot;
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
      seams.set(`${p.i}>${to}`, { from: p.i, to, pts, x0, y0, x1, y1, layers: null });
    }
  };

  const viewport = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (x / cur.w) * r.width, y: r.top + (y / cur.h) * r.height };
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
      const growing = ramp(s.from, now, GROW_MS) < 1;
      const dying = arrived.has(s.to) && ramp(s.to, now, FADE_MS) < 1;
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
      const dx = (s.x0 - REACH) * k;
      const dy = (s.y0 - REACH) * k;
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
        for (const s of steady) g.drawImage(s.layers![layer], (s.x0 - REACH) * k, (s.y0 - REACH) * k);
      });
    }
    if (base && steady.length) {
      for (let layer = 0; layer < LAYERS; layer++) {
        ctx.globalAlpha = Math.min(1, weight(layer) * breath);
        ctx.drawImage(base[layer], 0, 0);
      }
    }

    if (!still && live.length) {
      // Embers rise off the seams, flicker and fade.
      const { spark } = lights();
      const want = Math.min(MAX_EMBERS, Math.ceil(glowing / 2 / PIXELS_PER_EMBER));
      embers = embers.filter((e) => now - e.born < e.life && strength(e.seam, now) > 0);
      while (embers.length < want) {
        const p = pickPoint(live, glowing);
        embers.push({
          ...p,
          vx: (Math.random() - 0.5) * 4,
          vy: -(4 + Math.random() * 10),
          born: now - Math.random() * 300,
          life: 500 + Math.random() * 900,
          size: 1.5 + Math.random() * 2,
        });
      }
      for (const e of embers) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const age = (now - e.born) / e.life;
        ctx.globalAlpha = Math.sin(Math.PI * age) * (0.55 + 0.45 * Math.sin(now / 50 + e.x * 7)) * strength(e.seam, now);
        const d = e.size * k;
        ctx.drawImage(spark, e.x * k - d / 2, e.y * k - d / 2, d, d);
      }
      // And now and then a mote of light drifts up off them.
      motes = Math.min(2, motes + dt * Math.min(8, 1.5 + glowing / 2 / 300));
      for (; motes >= 1; motes--) {
        const p = pickPoint(live, glowing);
        veilMote(viewport(p.x, p.y));
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
    for (const p of fresh) arrived.set(p.i, now);
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
