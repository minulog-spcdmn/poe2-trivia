// Effect building blocks for the FX overlay. Each takes an anchor (point,
// rect or element) and a few knobs; moments.ts composes them into the game's
// big beats. Colours are HDR: values above 1 bloom and burn toward white.

import { Shape } from './particles';
import { FIRE_REACH, ShapeType, type Silhouette } from './renderer';
import { cornerPx } from '../corner';
import { opacityOf } from '../opacity';
import { after, boxOf, budget, currentFrame, detached, fxActive, particle, shape, task, type Anchor, type Box, type Handle, type Point, type Vec3 } from './core';
import { zoomOf } from '../stage';

// ---------- palette ----------

export const C = {
  ember: [3.2, 1.15, 0.3],
  emberDeep: [1.6, 0.35, 0.06],
  gold: [2.7, 1.95, 0.85],
  goldPale: [2.4, 2.1, 1.4],
  whiteHot: [3.2, 2.8, 2.2],
  crimson: [3.0, 0.32, 0.16],
  blood: [1.2, 0.08, 0.05],
  good: [1.1, 2.7, 1.0],
  goodPale: [1.6, 2.6, 1.3],
  /** A right answer: a muted green that leans gold. */
  right: [1.25, 1.75, 0.85],
  rightPale: [1.75, 1.95, 1.3],
  /** A wrong answer: a muted ember red, softer than the deathmatch's crimson. */
  wrong: [1.9, 0.5, 0.28],
  portal: [0.55, 1.35, 3.2],
  portalPale: [1.6, 2.2, 3.2],
  ash: [0.5, 0.42, 0.36],
  chaos: [1.6, 0.5, 2.6],
  /** Delve's life essence (the phial's light): a warm rose red, and its pale heart. */
  life: [2.7, 0.62, 0.5],
  lifePale: [3.0, 2.0, 1.55],
  /** zoe_arcana's magic (aura.ts): a deep ruby, set off with gold. */
  ruby: [2.3, 0.3, 0.42],
  rubyPale: [2.6, 1.0, 1.05],
  /** Delve's Azurite Wards: a deep crystal blue, and the pale light inside it. */
  azurite: [0.5, 1.15, 3.1],
  azuritePale: [1.7, 2.4, 3.3],
} satisfies Record<string, Vec3>;

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const scale = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** A random point inside a box (or on its edge when `edge`). */
function pointIn(b: Box, edge = false): Point {
  if (!edge || (!b.w && !b.h)) return { x: b.x + (Math.random() - 0.5) * b.w, y: b.y + (Math.random() - 0.5) * b.h };
  const per = 2 * (b.w + b.h);
  let d = Math.random() * per;
  const l = b.x - b.w / 2;
  const t = b.y - b.h / 2;
  if (d < b.w) return { x: l + d, y: t };
  d -= b.w;
  if (d < b.h) return { x: l + b.w, y: t + d };
  d -= b.h;
  if (d < b.w) return { x: l + b.w - d, y: t + b.h };
  d -= b.w;
  return { x: l, y: t + b.h - d };
}

// ---------- particles ----------

export type SparkOpts = {
  count?: number;
  /** px/s range. */
  speed?: [number, number];
  /** Emission direction (radians, 0 = right, -PI/2 = up) and spread; spread 2*PI is all round. */
  angle?: number;
  spread?: number;
  colors?: Vec3[];
  /** Colour the sparks cool to. */
  cool?: Vec3;
  life?: [number, number];
  size?: [number, number];
  gravity?: number;
  drag?: number;
  stretch?: number;
  /** Spawn over the anchor's area (or its outline) instead of its centre. */
  area?: 'centre' | 'fill' | 'edge';
  delay?: number;
};

/** Hot, motion-blurred sparks thrown out of `at`. */
export function sparks(at: Anchor, o: SparkOpts = {}) {
  if (!fxActive() || detached(at)) return;
  const b = boxOf(at);
  const n = budget(o.count ?? 24);
  const [s0, s1] = o.speed ?? [180, 620];
  const colors = o.colors ?? [C.ember, C.gold, C.whiteHot];
  for (let i = 0; i < n; i++) {
    const a = (o.angle ?? 0) + (o.spread ?? Math.PI * 2) * (Math.random() - 0.5);
    const v = rand(s0, s1) * (0.35 + 0.65 * Math.random());
    const p = o.area === 'fill' ? pointIn(b) : o.area === 'edge' ? pointIn(b, true) : { x: b.x, y: b.y };
    const c = pick(colors);
    particle({
      x: p.x,
      y: p.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: rand(...(o.life ?? [0.35, 0.9])),
      size: rand(...(o.size ?? [0.7, 1.5])),
      color: c,
      colorEnd: o.cool ?? scale(C.emberDeep, 0.6),
      gravity: o.gravity ?? 520,
      drag: o.drag ?? 2.2,
      shape: Shape.Spark,
      stretch: o.stretch ?? 0.045,
      delay: o.delay,
    });
  }
}

export type EmberOpts = {
  count?: number;
  colors?: Vec3[];
  life?: [number, number];
  size?: [number, number];
  /** Upward speed range, px/s. */
  rise?: [number, number];
  /** Sideways scatter, px/s. */
  scatter?: number;
  area?: 'centre' | 'fill' | 'edge' | 'top';
  turbulence?: number;
  delay?: [number, number];
  gravity?: number;
};

/** Glowing embers that drift up and flicker out. */
export function embers(at: Anchor, o: EmberOpts = {}) {
  if (!fxActive() || detached(at)) return;
  const b = boxOf(at);
  const n = budget(o.count ?? 10);
  const colors = o.colors ?? [C.ember, C.gold];
  for (let i = 0; i < n; i++) {
    let p: Point;
    if (o.area === 'top') p = { x: b.x + (Math.random() - 0.5) * b.w, y: b.y - b.h / 2 };
    else if (o.area === 'edge') p = pointIn(b, true);
    else if (o.area === 'centre') p = { x: b.x, y: b.y };
    else p = pointIn(b);
    const [r0, r1] = o.rise ?? [30, 110];
    const sc = o.scatter ?? 40;
    particle({
      x: p.x,
      y: p.y,
      vx: (Math.random() - 0.5) * sc * 2,
      vy: -rand(r0, r1),
      life: rand(...(o.life ?? [0.9, 2.2])),
      size: rand(...(o.size ?? [1.2, 2.6])),
      sizeEnd: 0.4,
      color: pick(colors),
      colorEnd: scale(C.emberDeep, 0.5),
      gravity: o.gravity ?? -25,
      drag: 0.6,
      shape: Shape.Ember,
      flicker: 0.55,
      fadeIn: 0.12,
      turbulence: o.turbulence ?? 140,
      delay: o.delay ? rand(...o.delay) : 0,
    });
  }
}

/** Glowing shards that break outward and fall (a wrong answer shattering). */
export function shards(at: Anchor, o: { count?: number; colors?: Vec3[]; cool?: Vec3; speed?: [number, number]; size?: [number, number]; area?: 'fill' | 'centre' } = {}) {
  if (!fxActive() || detached(at)) return;
  const b = boxOf(at);
  const n = budget(o.count ?? 16);
  const [s0, s1] = o.speed ?? [80, 360];
  const colors = o.colors ?? [C.crimson, scale(C.crimson, 0.6), C.ember];
  for (let i = 0; i < n; i++) {
    const p = o.area === 'centre' ? { x: b.x, y: b.y } : pointIn(b);
    const a = Math.atan2(p.y - b.y + (Math.random() - 0.5) * 8, p.x - b.x + (Math.random() - 0.5) * 8) + (Math.random() - 0.5) * 0.8;
    const v = rand(s0, s1);
    particle({
      x: p.x,
      y: p.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - rand(40, 160),
      life: rand(0.6, 1.3),
      size: rand(...(o.size ?? [2.5, 6])),
      sizeEnd: 1.2,
      color: pick(colors),
      colorEnd: o.cool ?? scale(C.blood, 0.5),
      gravity: 900,
      drag: 1.2,
      shape: Shape.Shard,
      spin: rand(-12, 12),
      fadeIn: 0.02,
    });
  }
}

/** Twinkling four-point stars, scattered over `at`. */
export function glints(at: Anchor, o: { count?: number; color?: Vec3; size?: [number, number]; life?: [number, number]; area?: 'fill' | 'edge' | 'centre'; delay?: [number, number] } = {}) {
  if (!fxActive() || detached(at)) return;
  const b = boxOf(at);
  const n = budget(o.count ?? 5);
  for (let i = 0; i < n; i++) {
    const p = o.area === 'centre' ? { x: b.x, y: b.y } : pointIn(b, o.area === 'edge');
    particle({
      x: p.x,
      y: p.y,
      life: rand(...(o.life ?? [0.45, 0.9])),
      size: rand(...(o.size ?? [3, 7])),
      sizeEnd: 0.5,
      color: o.color ?? C.goldPale,
      shape: Shape.Glint,
      rot: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
      spin: rand(-0.8, 0.8),
      fadeIn: 0.35,
      delay: o.delay ? rand(...o.delay) : 0,
    });
  }
}

/** Soft glow puffs (dust of light), mostly for impacts. */
export function puffs(at: Anchor, o: { count?: number; color?: Vec3; size?: [number, number]; speed?: [number, number]; life?: [number, number]; area?: 'fill' | 'edge' | 'centre'; angle?: number; spread?: number } = {}) {
  if (!fxActive() || detached(at)) return;
  const b = boxOf(at);
  const n = budget(o.count ?? 8);
  const [s0, s1] = o.speed ?? [20, 120];
  for (let i = 0; i < n; i++) {
    const p = o.area === 'centre' ? { x: b.x, y: b.y } : pointIn(b, o.area === 'edge');
    const a = (o.angle ?? 0) + (o.spread ?? Math.PI * 2) * (Math.random() - 0.5);
    const v = rand(s0, s1);
    particle({
      x: p.x,
      y: p.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: rand(...(o.life ?? [0.4, 0.9])),
      size: rand(...(o.size ?? [6, 16])),
      sizeEnd: rand(14, 30),
      color: o.color ?? scale(C.ember, 0.18),
      drag: 3,
      shape: Shape.Glow,
      fadeIn: 0.1,
    });
  }
}

/** Particles pulled into a point from around it (charging up). */
export function implode(at: Anchor, o: { count?: number; radius?: number; color?: Vec3; life?: number } = {}) {
  if (!fxActive() || detached(at)) return;
  const b = boxOf(at);
  const n = budget(o.count ?? 18);
  const R = o.radius ?? Math.max(60, Math.max(b.w, b.h) * 0.7);
  const life = o.life ?? 0.55;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = R * rand(0.7, 1.15);
    const x = b.x + Math.cos(a) * r;
    const y = b.y + Math.sin(a) * r * (b.h && b.w ? Math.min(1, b.h / b.w + 0.3) : 1);
    particle({
      x,
      y,
      vx: (b.x - x) / life,
      vy: (b.y - y) / life,
      life: life * rand(0.85, 1),
      size: rand(0.8, 1.6),
      color: o.color ?? C.gold,
      shape: Shape.Spark,
      stretch: 0.05,
      fadeIn: 0.5,
    });
  }
}

// ---------- shapes ----------

/** An expanding shockwave ring. */
export function ring(
  at: Anchor,
  o: { radius?: number; from?: number; thickness?: number; life?: number; color?: Vec3; breakup?: number; fill?: number; delay?: number; intensity?: number; behind?: boolean } = {},
) {
  const R = o.radius ?? 120;
  const R0 = o.from ?? 0;
  const th = o.thickness ?? 10;
  return shape({
    type: ShapeType.Ring,
    at,
    life: o.life ?? 0.6,
    delay: o.delay,
    behind: o.behind,
    color: o.color ?? C.gold,
    update(f, t) {
      const e = easeOut(t);
      const r = R0 + (R - R0) * e;
      const thick = th * (1 - 0.6 * t) + 1;
      f.hw = f.hh = r + thick * 3;
      f.k = (o.intensity ?? 1) * (1 - t) * (1 - t) * Math.min(1, t * 12);
      f.q[0] = r;
      f.q[1] = thick;
      f.q[2] = o.breakup ?? 0.5;
      f.q[3] = o.fill ?? 0.4;
    },
  });
}

/** What effects shine from behind: an element, or a function asked every frame (for a picture about to be swapped for another). */
export type Clear = Element | null | (() => Element | null);

/** The element `clear` names now, if it's on the page. */
function clearing(clear: Clear | undefined): Element | null {
  const el = (typeof clear === 'function' ? clear() : clear) ?? null;
  return el?.isConnected ? el : null;
}

/** The picture `clear` names now, if it's one, for an effect to shine from behind its outline. */
function silhouetteFor(clear: Clear | undefined): Silhouette | null {
  const el = clearing(clear);
  return el && isPicture(el) ? silhouetteOf(el) : null;
}

/** A lens flare: hot core plus an anamorphic streak. With a picture as `clear`, from behind it. */
export function flare(at: Anchor, o: { size?: number; streak?: number; life?: number; color?: Vec3; spikes?: number; delay?: number; intensity?: number; clear?: Clear } = {}) {
  const size = o.size ?? 26;
  const streak = o.streak ?? 260;
  return shape({
    type: ShapeType.Flare,
    at,
    life: o.life ?? 0.55,
    delay: o.delay,
    color: o.color ?? C.gold,
    update(f, t) {
      const k = Math.min(1, t * 14) * Math.pow(1 - t, 2.2);
      f.hw = streak * (0.6 + 0.4 * easeOut(t));
      f.hh = Math.max(size * 5, f.hw * 0.3);
      f.k = (o.intensity ?? 1) * k;
      f.q[0] = size * (0.7 + 0.5 * easeOut(t));
      f.q[1] = f.hw;
      f.q[2] = Math.max(1.2, size * 0.09);
      f.q[3] = o.spikes ?? 0.6;
      f.silhouette = silhouetteFor(o.clear);
    },
  });
}

/**
 * Slowly turning god rays. Endless unless `life` is given; stop the handle to
 * fade. With `clear` they shine from behind that element: over its shape only
 * a faint glow is left, so the light frames it instead of washing it out. For
 * a picture (see isPicture) that's its own outline (an item, not its box), as
 * visible as the picture is; for anything else its box, with its corner radius.
 */
export function rays(
  at: Anchor,
  o: { radius?: number; count?: number; sharp?: number; color?: Vec3; intensity?: number; life?: number; spin?: number; delay?: number; fadeIn?: number; clear?: Clear } = {},
): Handle {
  const R = o.radius ?? 420;
  const life = o.life ?? Infinity;
  // The cleared element's corner radius as computed, read once per element.
  let cornerOf: Element | null = null;
  let corner = '0';
  return shape({
    type: ShapeType.Rays,
    at,
    life,
    delay: o.delay,
    calm: true,
    color: o.color ?? C.gold,
    update(f, t, age, b) {
      const fin = Math.min(1, age / (o.fadeIn ?? 0.8));
      const fout = Number.isFinite(life) ? Math.min(1, (1 - t) * 3) : 1;
      f.hw = f.hh = R;
      f.k = (o.intensity ?? 0.35) * fin * fin * fout;
      f.q[0] = R * 0.08;
      f.q[1] = R;
      f.q[2] = o.count ?? 14;
      f.q[3] = o.sharp ?? 6;
      f.q[4] = o.spin ?? 0.25;
      const el = clearing(o.clear);
      f.silhouette = el && isPicture(el) ? silhouetteOf(el) : null;
      const c = el && !f.silhouette ? boxOf(el) : null;
      if (c && el !== cornerOf) {
        cornerOf = el;
        corner = getComputedStyle(el!).borderTopLeftRadius;
      }
      const hw = c ? c.w / 2 : 0;
      const hh = c ? c.h / 2 : 0;
      f.q[5] = hw;
      f.q[6] = hh;
      f.q[7] = c ? Math.min(cornerPx(corner, c.w, c.h), hw, hh) : 0;
      f.q[8] = c ? c.x - b.x : 0;
      f.q[9] = c ? c.y - b.y : 0;
    },
  });
}

/** Silhouettes measured this frame, so effects sharing a picture measure it once. */
const silhouettes = new WeakMap<Element, { frame: number; sil: Silhouette }>();

/**
 * Whether effects can shine from behind `el`'s own outline: an image, or a
 * picture put together from pieces (veiled art), an element whose canvases
 * marked `data-shape` make it up, each laid out over its own part of it.
 */
function isPicture(el: Element): el is HTMLElement {
  return el instanceof HTMLImageElement || (el instanceof HTMLElement && !!el.querySelector('canvas[data-shape]'));
}

/** A picture put together from pieces, drawn on one canvas, and when that was last brought up to date. */
const assembled = new WeakMap<HTMLElement, { pic: HTMLCanvasElement; key: string; at: number }>();
let assembledCount = 0;
/** How often an assembled picture is redrawn while its pieces change (burning in), ms. */
const ASSEMBLE_EVERY = 60;

/** The pieces of `el` (see isPicture) on one canvas at most 256 px across, about as they're shown now. */
function assemble(el: HTMLElement): { pic: HTMLCanvasElement; key: string } {
  const now = performance.now();
  let a = assembled.get(el);
  if (a && now - a.at < ASSEMBLE_EVERY) return a;
  const W = el.offsetWidth;
  const H = el.offsetHeight;
  const k = 256 / Math.max(1, W, H);
  if (!a) {
    a = { pic: document.createElement('canvas'), key: '', at: 0 };
    assembled.set(el, a);
  }
  const c = a.pic;
  c.width = Math.max(1, Math.round(W * k));
  c.height = Math.max(1, Math.round(H * k));
  const g = c.getContext('2d');
  if (g) {
    for (const piece of el.querySelectorAll<HTMLCanvasElement>('canvas[data-shape]')) {
      if (!piece.width || !piece.height) continue;
      g.globalAlpha = parseFloat(getComputedStyle(piece).opacity) || 0;
      g.drawImage(piece, piece.offsetLeft * k, piece.offsetTop * k, piece.offsetWidth * k, piece.offsetHeight * k);
    }
  }
  a.key = `assembled:${++assembledCount}`;
  a.at = now;
  return a;
}

/**
 * Where a picture is, for effects to shine from behind it: its box at its
 * own proportions, centred where it's drawn and as tall as it's drawn; how
 * far it's turned round (drawn narrower than that, by its own or an
 * ancestor's transform; mirrored by its own), so the light keeps to its
 * outline while it turns; and how visible it is.
 */
function silhouetteOf(el: HTMLElement): Silhouette {
  const frame = currentFrame();
  const known = silhouettes.get(el);
  if (known?.frame === frame) return known.sil;
  const { pic, key } = el instanceof HTMLImageElement ? { pic: el, key: el.currentSrc || el.src } : assemble(el);
  const r = el.getBoundingClientRect();
  const h = r.height;
  const w = el.offsetHeight ? (el.offsetWidth * h) / el.offsetHeight : r.width;
  const tf = getComputedStyle(el).transform;
  const m = tf === 'none' ? null : new DOMMatrix(tf);
  const mirrored = !!m && m.a * m.d < 0;
  const turn = w > 0 ? Math.min(1, r.width / w) : 1;
  const sil = { pic, key, x: r.left + r.width / 2, y: r.top + h / 2, w, h, flip: mirrored ? -turn : turn, alpha: opacityOf(el) };
  silhouettes.set(el, { frame, sil });
  return sil;
}

/**
 * The corners of `el` as drawn on screen, inset by `inset` px, when it's
 * turned in 3D: its own computed transform (mid-transition values included)
 * applied to the untransformed box of `base`, which it fills. Relative to the
 * centre of `el`'s bounding box `b`.
 */
function projectedCorners(el: HTMLElement, base: Element, inset: number, b: Box): number[] | null {
  const cs = getComputedStyle(el);
  if (cs.transform === 'none') return null;
  const m = new DOMMatrix(cs.transform);
  const box = base.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  // Worked out in the card's own px; on screen they are the stage's zoom (lib/stage.ts) larger.
  const z = zoomOf(el);
  const [ox = w / 2, oy = h / 2] = cs.transformOrigin.split(' ').map(parseFloat);
  const out: number[] = [];
  for (const [x, y] of [
    [inset, inset],
    [w - inset, inset],
    [w - inset, h - inset],
    [inset, h - inset],
  ]) {
    const p = new DOMPoint(x - ox, y - oy, 0, 1).matrixTransform(m);
    if (p.w <= 0) return null;
    out.push((p.x / p.w + ox) * z + box.left - b.x, (p.y / p.w + oy) * z + box.top - b.y);
  }
  return out;
}

/**
 * Light around an element's outline. `flame` 0-1 makes it lick upward like
 * fire; `bleed` lets it shine over the element itself. With `base` (an
 * untransformed element whose box `el` fills), the glow follows `el` exactly
 * while it's turned in 3D, like a tilted card.
 */
export function outline(
  el: Element,
  o: {
    color?: Vec3;
    width?: number;
    radius?: number;
    flame?: number;
    bleed?: number;
    intensity?: number;
    life?: number;
    pad?: number;
    pulse?: number;
    fadeIn?: number;
    base?: Element;
  } = {},
): Handle {
  const width = o.width ?? 14;
  const life = o.life ?? Infinity;
  const corner = getComputedStyle(el).borderTopLeftRadius;
  const pad = o.pad ?? 0;
  return shape({
    type: ShapeType.RectGlow,
    at: el,
    life,
    followOpacity: true,
    color: o.color ?? C.gold,
    update(f, t, age, b) {
      const fin = Math.min(1, age / (o.fadeIn ?? 0.15));
      const fade = Number.isFinite(life) ? Math.pow(1 - t, 1.6) : 1;
      const pulse = o.pulse ? 1 - o.pulse * 0.5 * (1 + Math.sin(age * 5)) : 1;
      f.hw = b.w / 2 + width * 4 + pad;
      f.hh = b.h / 2 + width * 4 + pad;
      f.k = (o.intensity ?? 1) * fin * fade * pulse;
      const r = Math.min(o.radius ?? cornerPx(corner, b.w, b.h), b.w / 2, b.h / 2);
      const quad = o.base && el instanceof HTMLElement && el.isConnected ? projectedCorners(el, o.base, r, b) : null;
      if (quad) {
        f.type = ShapeType.QuadGlow;
        for (let i = 0; i < 8; i++) f.q[i] = quad[i];
        f.q[8] = r;
        f.q[9] = width;
        f.q[10] = o.flame ?? 0;
        f.q[11] = o.bleed ?? 0;
      } else {
        f.type = ShapeType.RectGlow;
        f.q[0] = b.w / 2 + pad;
        f.q[1] = b.h / 2 + pad;
        f.q[2] = r;
        f.q[3] = width;
        f.q[4] = o.flame ?? 0;
        f.q[5] = o.bleed ?? 0;
      }
    },
  });
}

/** A swirling portal on `at`. Endless; stop the handle to close it. */
export function portal(at: Anchor, o: { radius?: number; color?: Vec3; intensity?: number } = {}): Handle {
  if (detached(at)) return { stop() {} };
  const R = o.radius ?? 60;
  const h = shape({
    type: ShapeType.Portal,
    at,
    life: Infinity,
    color: o.color ?? C.portal,
    update(f, _t, age) {
      const open = easeOut(Math.min(1, age / 0.7));
      f.hw = f.hh = R * 1.3 * open + 1;
      f.k = (o.intensity ?? 0.9) * open;
      f.q[0] = R * open + 0.5;
    },
  });
  // Motes of light spiral into it while it's open.
  const b0 = boxOf(at);
  let acc = 0;
  let open = true;
  task((dt) => {
    if (!open) return false;
    acc += dt * 26;
    const b = at instanceof Element && at.isConnected ? boxOf(at) : b0;
    while (acc >= 1) {
      acc--;
      const a = Math.random() * Math.PI * 2;
      const r = R * rand(1.3, 2.4);
      const x = b.x + Math.cos(a) * r;
      const y = b.y + Math.sin(a) * r;
      const life = rand(0.6, 1.0);
      // Tangential plus inward velocity: a spiral.
      const tx = -Math.sin(a) * r * 1.4;
      const ty = Math.cos(a) * r * 1.4;
      particle({
        x,
        y,
        vx: (b.x - x) / life + tx * 0.5,
        vy: (b.y - y) / life + ty * 0.5,
        life,
        size: rand(0.7, 1.4),
        color: Math.random() < 0.5 ? C.portalPale : C.portal,
        shape: Shape.Spark,
        stretch: 0.04,
        drag: 0.8,
        fadeIn: 0.4,
      });
    }
    return true;
  }, { keep: true });
  return {
    stop(s = 0.35) {
      open = false;
      h.stop(s);
    },
  };
}

/** An arcane circle that draws itself around `at`. */
export function sigil(at: Anchor, o: { radius?: number; color?: Vec3; life?: number; draw?: number; spin?: number; intensity?: number; width?: number; delay?: number } = {}): Handle {
  const R = o.radius ?? 90;
  const life = o.life ?? Infinity;
  return shape({
    type: ShapeType.Sigil,
    at,
    life,
    delay: o.delay,
    color: o.color ?? C.gold,
    update(f, t, age) {
      const drawn = Math.min(1, age / (o.draw ?? 0.7));
      const fout = Number.isFinite(life) ? Math.min(1, (1 - t) * 4) : 1;
      f.hw = f.hh = R * 1.15;
      f.k = (o.intensity ?? 0.6) * fout * (0.85 + 0.15 * Math.sin(age * 3));
      f.q[0] = R;
      f.q[1] = o.width ?? 1.1;
      f.q[2] = easeOut(drawn) * 1.02;
      f.q[3] = o.spin ?? 0.35;
    },
  });
}

/**
 * Glow creeping in from the screen edges (danger, urgency). It frames the
 * visible area (innerWidth/innerHeight) rather than the canvas, which reaches
 * under a phone's toolbars, so it follows them as they slide.
 */
export function edgeGlow(o: { color?: Vec3; width?: number; life?: number; intensity?: number; noise?: number } = {}) {
  const life = o.life ?? 0.8;
  return shape({
    type: ShapeType.Edge,
    at: { x: innerWidth / 2, y: innerHeight / 2 },
    life,
    color: o.color ?? C.crimson,
    update(f, t, _age, b) {
      b.x = innerWidth / 2;
      b.y = innerHeight / 2;
      f.hw = innerWidth / 2;
      f.hh = innerHeight / 2;
      f.k = (o.intensity ?? 0.2) * Math.min(1, t * 8) * Math.pow(1 - t, 1.5);
      f.q[0] = o.width ?? 60;
      f.q[1] = o.noise ?? 0.6;
    },
  });
}

/** How much bigger the edge effects are drawn on this window: by its short side over 720 px, 0.7 to 2.2 times. */
const edgeScale = () => Math.max(0.7, Math.min(2.2, Math.min(innerWidth, innerHeight) / 720));

/**
 * A crisp flash of colour at the screen's edges, as of a blow (a wrong
 * answer): up at once, a bright line along the very edge, gone in a moment.
 * No smoke; the smoke is the clock's. `width`: as edgeBeat's.
 */
export function edgeHit(o: { color?: Vec3; width?: number; intensity?: number } = {}) {
  return shape({
    type: ShapeType.Edge,
    at: { x: innerWidth / 2, y: innerHeight / 2 },
    life: 0.7,
    color: o.color ?? C.wrong,
    update(f, _t, age, b) {
      b.x = innerWidth / 2;
      b.y = innerHeight / 2;
      f.hw = innerWidth / 2;
      f.hh = innerHeight / 2;
      const rise = 0.025;
      const env = age < rise ? age / rise : Math.exp(-(age - rise) / 0.16);
      f.k = (o.intensity ?? 0.1) * env;
      // Pressing in a little as it lands, then easing back.
      f.q[0] = (o.width ?? 45) * edgeScale() * (0.8 + 0.2 * env);
      f.q[1] = 0.25;
      f.q[2] = 0;
      f.q[4] = 0.5 * env;
    },
  });
}

/**
 * One beat of red smoke at the screen's edges, as the clock ticks: up at
 * once and swelling down with the tick's sound, then lingering faintly into
 * the next, where it is (nothing rushes in). `width`: how far in it reaches
 * (px, on a window 720 px across its short side; it scales with the window,
 * so a big screen sees the same as a small one). `smoke` (0 none): its
 * wisps; `pattern` and `clock` (s): which smoke, and how far it has
 * drifted, so the beats of one countdown show one smoke; `even` (0-1): the
 * smoke spread evenly round the edges rather than in patches; `body` (0-1):
 * from see-through to full; `hold`: how much longer it takes to go (1 as
 * is); `rim`: a hot line along the very edge.
 */
export function edgeBeat(o: { color?: Vec3; width?: number; intensity?: number; smoke?: number; pattern?: number; clock?: number; even?: number; body?: number; hold?: number; rim?: number } = {}) {
  const hold = o.hold ?? 1;
  const life = 1.4 * hold;
  return shape({
    type: ShapeType.Edge,
    at: { x: innerWidth / 2, y: innerHeight / 2 },
    life,
    color: o.color ?? C.crimson,
    update(f, t, age, b) {
      b.x = innerWidth / 2;
      b.y = innerHeight / 2;
      f.hw = innerWidth / 2;
      f.hh = innerHeight / 2;
      const rise = 0.035;
      const beat = age < rise ? Math.sin(((age / rise) * Math.PI) / 2) ** 2 : Math.exp(-(age - rise) / (0.2 * hold));
      // What lingers, gone by the end of its life.
      const linger = 0.3 * Math.min(1, age / rise) * Math.exp(-age / (0.9 * hold)) * (1 - t * t);
      f.k = (o.intensity ?? 0.06) * (beat + linger);
      f.q[0] = (o.width ?? 60) * edgeScale();
      f.q[1] = 0.6;
      f.q[2] = o.smoke ?? 0;
      f.q[3] = o.pattern ?? 0;
      f.q[4] = (o.rim ?? 0) * beat;
      f.q[5] = (o.clock ?? 0) + age;
      f.q[6] = o.even ?? 0;
      f.q[7] = o.body ?? 1;
    },
  });
}

/**
 * Fire burning on an element: flames rising off its top, licking up its
 * ends, for as long as it's up. `height` is how tall the flames reach, px;
 * `blue` (0-1) turns it from orange to a hotter blue, and `tint` burns it in
 * a colour of its own instead. `fadeIn`: seconds to full strength; `grow`:
 * seconds for the flames to rise from low to full height, as a fire catching
 * (0: at full height at once).
 */
export function fire(el: Element, o: { height?: number; intensity?: number; blue?: number; fadeIn?: number; grow?: number; tint?: Vec3 } = {}): Handle {
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const H = o.height ?? 40;
  // The quad must hold the tallest tongue (FIRE_REACH times H, above the top
  // and out from the top corners) and the halo, inside the 72% where the
  // shader's fade toward the quad's border begins. Flames barely reach below
  // the element, so the quad is shifted up over them rather than centred.
  const room = (r: number) => (r + 16) / 0.72;
  // The element's centre, and where the quad was put last frame: the box
  // stops following the element once it's gone, so shift from the centre
  // rather than again from the shifted box.
  let centre = 0;
  let placed = NaN;
  return shape({
    type: ShapeType.Fire,
    at: el,
    life: Infinity,
    followOpacity: true,
    // It moves, but slowly enough to be drawn at 30fps (see `calm` in core.ts).
    calm: true,
    // A tint burns in its own colour (its tips deep, its roots toward white) instead of orange or blue.
    color: o.tint ?? [1, 1, 1],
    update(f, _t, age, b) {
      const above = b.h / 2 + FIRE_REACH * H;
      const below = b.h / 2 + 8;
      const shift = (below - above) / 2;
      f.hw = room(b.w / 2 + FIRE_REACH * H);
      f.hh = room((above + below) / 2);
      f.k = (o.intensity ?? 1) * Math.min(1, age / (o.fadeIn ?? 0.5));
      f.q[0] = b.w / 2;
      f.q[1] = b.h / 2;
      f.q[2] = Math.min(radius, b.w / 2, b.h / 2);
      // Catching, the flames start low and rise, fast at first and settling into full height.
      const g = o.grow ? Math.min(1, age / o.grow) : 1;
      f.q[3] = H * (0.1 + 0.9 * (1 - Math.pow(1 - g, 3)));
      f.q[4] = o.blue ?? 0;
      f.q[5] = -shift;
      f.q[6] = o.tint ? 1 : 0;
      if (b.y !== placed) centre = b.y;
      b.y = placed = centre + shift;
    },
  });
}

/** A soft radial flash of light over `at` (or, `behind`, from behind the UI: see cover in core.ts). */
export function flash(at: Anchor, o: { radius?: number; color?: Vec3; life?: number; intensity?: number; delay?: number; behind?: boolean } = {}) {
  const R = o.radius ?? 300;
  return shape({
    type: ShapeType.Flash,
    at,
    life: o.life ?? 0.4,
    delay: o.delay,
    behind: o.behind,
    color: o.color ?? C.gold,
    update(f, t) {
      f.hw = f.hh = R * 2.2;
      f.k = (o.intensity ?? 0.25) * Math.min(1, t * 20) * Math.pow(1 - t, 2);
      f.q[0] = R * (0.8 + 0.4 * t);
    },
  });
}

// ---------- motion ----------

/** Keeps spawning with `spawn` at `rate` per second until stopped (or `life` runs out). */
export function emitter(rate: number, spawn: () => void, life = Infinity): Handle {
  let acc = Math.random();
  let on = true;
  const h = task((dt, age) => {
    if (!on || age > life) return false;
    acc += dt * rate;
    while (acc >= 1) {
      acc--;
      spawn();
    }
    return true;
  }, { life, keep: !Number.isFinite(life) });
  return {
    stop() {
      on = false;
      h.stop();
    },
  };
}

export { after };
