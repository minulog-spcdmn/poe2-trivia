// Delve's dynamite, the page's part of it (lib/blastAway.ts): what of the
// explosion is drawn on a canvas in the blast's layer. Always the smoke
// rolling in after it, which darkens what it rolls over (the effects overlay
// only adds light, so it can't); and without that overlay the fire, the
// shockwave, the rock chips and the sparks too.
//
// Everything moves as the overlay's particles do (fx/particles.ts): thrown,
// slowed by drag, pulled down by gravity or lifted by its heat, and the smoke
// carried by the air's own stir (flowAt), so neighbouring billows drift
// together. A billow is noise over a soft body, lit on the side the fire is,
// and the fire's glow on it dies as it rolls away. Its pictures are made
// once, while the page is idle. The canvas is dithered as it's drawn, so
// soft edges this big never band (CLAUDE.md).

import { flowAt } from './fx/particles';

/** A billow's picture, px square, and how many different ones. */
const SPRITE = 192;
const VARIANTS = 3;

type Sprites = { soot: HTMLCanvasElement[]; glow: HTMLCanvasElement[]; fire: HTMLCanvasElement[]; dither: HTMLCanvasElement };
let made: Sprites | null = null;

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s);
  const b = hash(ix + 1, iy, s);
  const c = hash(ix, iy + 1, s);
  const d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
/** Three octaves of value noise: 0 to about 0.88, about 0.44 on average. */
function fbm(x: number, y: number, s: number): number {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 3; i++) {
    v += a * vnoise(x, y, s + i * 17);
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.2;
    a *= 0.5;
  }
  return v;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mixRgb = (stops: [number, number, number, number][], x: number): [number, number, number] => {
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1][0]) i++;
  const [x0, r0, g0, b0] = stops[i];
  const [x1, r1, g1, b1] = stops[i + 1];
  const k = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return [r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k];
};
const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/**
 * The billows' pictures, each lit from the right (+x; drawn mirrored for a
 * blast from the left): soot, the fire's glow on it, and (for the fire
 * itself) the same billow burning. Made from the same noise, so the glow
 * lies on its soot's lobes. And a tile of dither.
 */
function sprites(): Sprites {
  if (made) return made;
  const out: Sprites = { soot: [], glow: [], fire: [], dither: canvas(64, 64) };
  const n = SPRITE * SPRITE;
  for (let v = 0; v < VARIANTS; v++) {
    const soot = new ImageData(SPRITE, SPRITE);
    const glow = new ImageData(SPRITE, SPRITE);
    const fire = new ImageData(SPRITE, SPRITE);
    const seed = 101 + v * 37;
    for (let i = 0; i < n; i++) {
      // q runs -2 to 2 across: the body reaches about 1.6.
      const qx = ((i % SPRITE) + 0.5) * (4 / SPRITE) - 2;
      const qy = (Math.floor(i / SPRITE) + 0.5) * (4 / SPRITE) - 2;
      const r = Math.hypot(qx, qy);
      if (r > 1.95) continue;
      const nx = qx * 0.85;
      const ny = qy * 0.85;
      const nz = fbm(nx, ny, seed);
      const body = Math.exp(-r * r * 0.55);
      const dens = smooth(0, 0.3, body - (0.62 - nz) * 1.3) * (1 - smooth(1.3, 1.95, r));
      if (dens <= 0) continue;
      // Lit from +x: its side toward the light, and each lobe's face that rises toward it.
      const rise = fbm(nx + 0.12, ny - 0.06, seed) - nz;
      const lum = Math.min(1, Math.max(0, 0.36 + 0.36 * qx + 1.3 * (nz - 0.44) + 3 * rise));
      const o = i * 4;
      const [sr, sg, sb] = mixRgb([[0, 20, 16, 14], [0.55, 58, 47, 39], [1, 118, 95, 76]], lum);
      soot.data.set([sr, sg, sb, 255 * dens * 0.86], o);
      const l2 = lum * lum;
      glow.data.set([255, 128 + 60 * l2, 50 + 40 * l2, 255 * dens * l2], o);
      const heat = Math.min(1, Math.max(0, body * 1.15 + (nz - 0.44) * 1.3 - 0.12));
      const [fr, fg, fb] = mixRgb([[0, 96, 26, 10], [0.35, 214, 86, 30], [0.65, 255, 172, 84], [1, 255, 246, 220]], heat);
      fire.data.set([fr, fg, fb, 255 * dens], o);
    }
    for (const [list, img] of [[out.soot, soot], [out.glow, glow], [out.fire, fire]] as const) {
      const c = canvas(SPRITE, SPRITE);
      c.getContext('2d')?.putImageData(img, 0, 0);
      list.push(c);
    }
  }
  // Black at 0 to 6/255, a different one each pixel: drawn destination-out,
  // it thins what's drawn by up to 2.4% at random, a level or two, so what
  // would be a band rounds up or down from pixel to pixel instead.
  const d = new ImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) d.data[i * 4 + 3] = Math.floor(Math.random() * 7);
  out.dither.getContext('2d')?.putImageData(d, 0, 0);
  made = out;
  return out;
}

/** Made while the page is idle, before the first blast needs them. */
export function prepareBlastSmoke() {
  if (made || typeof document === 'undefined') return;
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(() => sprites(), { timeout: 4000 });
  else setTimeout(() => sprites(), 1500);
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

type Billow = { x: number; y: number; vx: number; vy: number; s0: number; s1: number; age: number; life: number; v: number; flipY: number; drag: number; lift: number; stir: number };
type Chip = { x: number; y: number; vx: number; vy: number; rot: number; spin: number; size: number; age: number; life: number; hot: boolean; pts: number[] };
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number };

export type BlastSmoke = {
  /** The layer it's drawn in, and its size in the layer's px. */
  layer: HTMLElement;
  W: number;
  H: number;
  /** The layer's zoom (stage.ts): the canvas is as sharp as the screen, up to twice the layer's px. */
  Z: number;
  /** The screen edge it bursts in from, and its height there (layer px). */
  side: -1 | 1;
  y: number;
  /** The fireball's size (layer px). */
  S: number;
  /** No effects overlay: the fire, the shockwave, the chips and the sparks are drawn here too. */
  whole: boolean;
  phone: boolean;
  /** Seconds it runs: then it calls `done`. */
  seconds: number;
  done: () => void;
};

/** Starts the blast's canvas in `o.layer` (see the top of this file). */
export function blastSmoke(o: BlastSmoke) {
  const sp = sprites();
  const { W, H, side, S } = o;
  const k = Math.min(2, Math.max(1, devicePixelRatio * o.Z));
  const cv = canvas(Math.round(W * k), Math.round(H * k));
  Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
  o.layer.append(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return void setTimeout(o.done, o.seconds * 1000);
  ctx.imageSmoothingQuality = 'high';
  const dither = ctx.createPattern(sp.dither, 'repeat');
  const edgeX = side > 0 ? W : 0;
  const inward = -side;

  // The smoke, rolling in off the edge after the fire and spreading as it
  // slows, lifting a little; the new question comes through it as it clears.
  const smoke: Billow[] = [];
  for (let i = 0; i < (o.phone ? 9 : 13); i++) {
    const s0 = S * rand(0.4, 0.75);
    const drag = rand(1.5, 2.1);
    smoke.push({
      x: edgeX + side * s0 * 0.1,
      y: o.y + rand(-0.55, 0.55) * Math.min(H * 0.45, S * 0.6),
      vx: inward * W * rand(0.3, 0.8) * drag,
      vy: rand(-80, 30),
      s0,
      s1: s0 * rand(1.6, 2.3),
      age: -rand(0.05, 0.22),
      life: rand(1.4, 2),
      v: Math.floor(Math.random() * VARIANTS),
      flipY: Math.random() < 0.5 ? -1 : 1,
      drag,
      lift: rand(20, 60),
      stir: 160,
    });
  }
  // Without the overlay: the fire, billowing in off the edge, burning out as it slows.
  const fire: Billow[] = [];
  const chips: Chip[] = [];
  const sparks: Spark[] = [];
  if (o.whole) {
    for (let i = 0; i < (o.phone ? 6 : 9); i++) {
      const core = i < 3;
      const s0 = S * (core ? rand(0.5, 0.65) : rand(0.3, 0.5));
      fire.push({
        x: edgeX + side * s0 * 0.15,
        y: o.y + (core ? rand(-0.1, 0.1) : rand(-0.35, 0.35)) * S,
        vx: inward * S * (core ? rand(0.6, 1.1) : rand(0.9, 1.8)),
        vy: rand(-0.3, 0.2) * S,
        s0,
        s1: s0 * rand(1.4, 1.8),
        age: -(core ? 0 : rand(0.02, 0.08)),
        life: rand(0.5, 0.85),
        v: i % VARIANTS,
        flipY: Math.random() < 0.5 ? -1 : 1,
        drag: 3,
        lift: 120,
        stir: 0,
      });
    }
    for (let i = 0; i < (o.phone ? 10 : 16); i++) {
      const a = (side > 0 ? Math.PI : 0) + rand(-0.6, 0.6);
      const v = W * rand(0.8, 1.8);
      const pts: number[] = [];
      for (let c = 0; c < 5; c++) {
        const t = ((c + rand(-0.35, 0.35)) / 5) * Math.PI * 2;
        const r = rand(0.6, 1);
        pts.push(Math.cos(t) * r, Math.sin(t) * r * 0.7);
      }
      chips.push({ x: edgeX, y: o.y + rand(-0.25, 0.25) * S, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(60, 220), rot: rand(0, 6.3), spin: rand(-12, 12), size: rand(3, o.phone ? 6 : 7.5), age: -rand(0, 0.07), life: rand(0.8, 1.3), hot: Math.random() < 0.3, pts });
    }
    for (let i = 0; i < (o.phone ? 22 : 36); i++) {
      const a = (side > 0 ? Math.PI : 0) + rand(-0.6, 0.6);
      const v = rand(600, 1700);
      sparks.push({ x: edgeX, y: o.y + rand(-0.2, 0.2) * S, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(40, 200), age: -rand(0, 0.09), life: rand(0.3, 0.75) });
    }
  }
  const R = Math.hypot(W, H) * 1.1;

  const move = (b: { x: number; y: number; vx: number; vy: number }, dt: number, drag: number, gravity: number, stir: number, t: number) => {
    if (stir) {
      const f = flowAt(b.x, b.y, t);
      b.vx += f[0] * stir * dt;
      b.vy += f[1] * stir * dt;
    }
    b.vy += gravity * dt;
    const keep = Math.exp(-drag * dt);
    b.vx *= keep;
    b.vy *= keep;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  };
  // A billow grows fast as it bursts out and slower as it slows, by its life's end s1.
  const sizeOf = (b: Billow) => b.s0 + (b.s1 - b.s0) * ((1 - Math.exp(-2.4 * b.age)) / (1 - Math.exp(-2.4 * b.life)));
  const drawBillow = (b: Billow, img: HTMLCanvasElement, alpha: number) => {
    if (alpha <= 0.002) return;
    const s = sizeOf(b);
    ctx.globalAlpha = Math.min(1, alpha);
    // Mirrored for a blast from the left, so it's lit from the fire's side.
    ctx.setTransform(k * side, 0, 0, k * b.flipY, b.x * k, b.y * k);
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
  };

  let t = 0;
  let last = performance.now();
  const frame = (now: number) => {
    if (!cv.isConnected) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cv.width, cv.height);

    // The fire, its light added.
    ctx.globalCompositeOperation = 'lighter';
    for (const b of fire) {
      b.age += dt;
      if (b.age < 0 || b.age > b.life) continue;
      move(b, dt, b.drag, -b.lift, 0, t);
      const u = b.age / b.life;
      drawBillow(b, sp.fire[b.v], Math.min(1, u / 0.08) * Math.pow(1 - u, 1.5));
    }
    // The shockwave: the front of a ring far bigger than the screen, running across from the edge.
    if (o.whole && t < 0.76) {
      const u = t / 0.76;
      const r = R * (0.02 + 0.98 * (1 - Math.pow(1 - u, 2.6)));
      const a = 1 - u;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.globalAlpha = 1;
      for (const [w, c] of [[26, `rgba(255, 150, 70, ${0.07 * a})`], [10, `rgba(255, 180, 100, ${0.22 * a})`], [2, `rgba(255, 238, 205, ${0.85 * a})`]] as const) {
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.arc(edgeX, o.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Sparks: streaks along their flight, a white-hot head on an orange trail.
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineCap = 'round';
    for (const p of sparks) {
      p.age += dt;
      if (p.age < 0 || p.age > p.life) continue;
      move(p, dt, 1.3, 420, 0, t);
      const a = Math.pow(1 - p.age / p.life, 1.2);
      ctx.globalAlpha = a;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgb(255, 170, 80)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
      ctx.strokeStyle = 'rgb(255, 246, 225)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.008, p.y - p.vy * 0.008);
      ctx.stroke();
    }
    // Rock chips, tumbling: a face of each catches the light as it turns.
    ctx.globalCompositeOperation = 'source-over';
    for (const c of chips) {
      c.age += dt;
      if (c.age < 0 || c.age > c.life) continue;
      move(c, dt, 1.1, 950, 0, t);
      c.rot += c.spin * dt;
      const u = c.age / c.life;
      ctx.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      const cos = Math.cos(c.rot);
      const sin = Math.sin(c.rot);
      ctx.setTransform(k * cos * c.size, k * sin * c.size, -k * sin * c.size, k * cos * c.size, c.x * k, c.y * k);
      const glow = c.hot ? Math.max(0, 1 - u * 1.6) : 0;
      ctx.beginPath();
      ctx.moveTo(c.pts[0], c.pts[1]);
      for (let i = 2; i < 10; i += 2) ctx.lineTo(c.pts[i], c.pts[i + 1]);
      ctx.closePath();
      ctx.fillStyle = glow ? `rgb(${120 + 135 * glow}, ${50 + 90 * glow}, ${24 + 30 * glow})` : 'rgb(46, 34, 26)';
      ctx.fill();
      // One face, from a ridge near the middle to two corners, lit as it turns toward the light (up and left).
      const lit = Math.max(0, Math.cos(c.rot + 2.1));
      ctx.beginPath();
      ctx.moveTo(0.15, -0.1);
      ctx.lineTo(c.pts[0], c.pts[1]);
      ctx.lineTo(c.pts[2], c.pts[3]);
      ctx.lineTo(c.pts[4], c.pts[5]);
      ctx.closePath();
      ctx.fillStyle = glow ? `rgba(255, 236, 190, ${0.5 * lit})` : `rgba(168, 134, 104, ${0.35 + 0.6 * lit})`;
      ctx.fill();
    }
    // The smoke, rolling over it all, then the fire's glow on it, dying as it rolls away.
    for (const b of smoke) {
      b.age += dt;
      if (b.age < 0 || b.age > b.life) continue;
      move(b, dt, b.drag, -b.lift, b.stir, t);
      const u = b.age / b.life;
      drawBillow(b, sp.soot[b.v], Math.min(1, u / 0.12) * Math.pow(1 - u, 1.1) * 0.82);
    }
    ctx.globalCompositeOperation = 'source-atop';
    for (const b of smoke) {
      if (b.age < 0 || b.age > b.life) continue;
      drawBillow(b, sp.glow[b.v], Math.min(1, b.age / (b.life * 0.12)) * Math.exp(-b.age * 3.2) * 0.75);
    }
    // Dithered, last, over all of it.
    if (dither) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = dither;
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    if (t < o.seconds) requestAnimationFrame(frame);
    else o.done();
  };
  requestAnimationFrame(frame);
}
