// Effect building blocks for the FX overlay. Each takes an anchor (point,
// rect or element) and a few knobs; moments.ts composes them into the game's
// big beats. Colours are HDR: values above 1 bloom and burn toward white.

import { Shape } from './particles';
import { ShapeType } from './renderer';
import { after, boxOf, budget, fxActive, particle, shape, task, type Anchor, type Box, type Handle, type Point, type Vec3 } from './core';

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
  portal: [0.55, 1.35, 3.2],
  portalPale: [1.6, 2.2, 3.2],
  ash: [0.5, 0.42, 0.36],
  chaos: [1.6, 0.5, 2.6],
} satisfies Record<string, Vec3>;

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const scale = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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
  if (!fxActive()) return;
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
  if (!fxActive()) return;
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
export function shards(at: Anchor, o: { count?: number; colors?: Vec3[]; speed?: [number, number]; area?: 'fill' | 'centre' } = {}) {
  if (!fxActive()) return;
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
      size: rand(2.5, 6),
      sizeEnd: 1.2,
      color: pick(colors),
      colorEnd: scale(C.blood, 0.5),
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
  if (!fxActive()) return;
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
  if (!fxActive()) return;
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
  if (!fxActive()) return;
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
export function ring(at: Anchor, o: { radius?: number; from?: number; thickness?: number; life?: number; color?: Vec3; breakup?: number; fill?: number; delay?: number; intensity?: number } = {}) {
  const R = o.radius ?? 120;
  const R0 = o.from ?? 0;
  const th = o.thickness ?? 10;
  return shape({
    type: ShapeType.Ring,
    at,
    life: o.life ?? 0.6,
    delay: o.delay,
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

/** A lens flare: hot core plus an anamorphic streak. */
export function flare(at: Anchor, o: { size?: number; streak?: number; life?: number; color?: Vec3; spikes?: number; delay?: number; intensity?: number } = {}) {
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
    },
  });
}

/** Slowly turning god rays. Endless unless `life` is given; stop the handle to fade. */
export function rays(at: Anchor, o: { radius?: number; count?: number; sharp?: number; color?: Vec3; intensity?: number; life?: number; spin?: number; delay?: number; fadeIn?: number } = {}): Handle {
  const R = o.radius ?? 420;
  const life = o.life ?? Infinity;
  return shape({
    type: ShapeType.Rays,
    at,
    life,
    delay: o.delay,
    color: o.color ?? C.gold,
    update(f, t, age) {
      const fin = Math.min(1, age / (o.fadeIn ?? 0.8));
      const fout = Number.isFinite(life) ? Math.min(1, (1 - t) * 3) : 1;
      f.hw = f.hh = R;
      f.k = (o.intensity ?? 0.35) * fin * fin * fout;
      f.q[0] = R * 0.08;
      f.q[1] = R;
      f.q[2] = o.count ?? 14;
      f.q[3] = o.sharp ?? 6;
      f.q[4] = o.spin ?? 0.25;
    },
  });
}

/**
 * Light around an element's outline. `flame` 0-1 makes it lick upward like
 * fire; `bleed` lets it shine over the element itself.
 */
export function outline(
  el: Element,
  o: { color?: Vec3; width?: number; radius?: number; flame?: number; bleed?: number; intensity?: number; life?: number; pad?: number; pulse?: number; fadeIn?: number } = {},
): Handle {
  const width = o.width ?? 14;
  const life = o.life ?? Infinity;
  const cs = getComputedStyle(el);
  const radius = o.radius ?? (parseFloat(cs.borderTopLeftRadius) || 0);
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
      f.hw = b.w / 2 + width * 5 + (o.pad ?? 0);
      f.hh = b.h / 2 + width * 5 + (o.pad ?? 0);
      f.k = (o.intensity ?? 1) * fin * fade * pulse;
      f.q[0] = b.w / 2 + (o.pad ?? 0);
      f.q[1] = b.h / 2 + (o.pad ?? 0);
      f.q[2] = Math.min(radius, b.w / 2, b.h / 2);
      f.q[3] = width;
      f.q[4] = o.flame ?? 0;
      f.q[5] = o.bleed ?? 0;
    },
  });
}

/** A swirling portal on `at`. Endless; stop the handle to close it. */
export function portal(at: Anchor, o: { radius?: number; color?: Vec3; intensity?: number } = {}): Handle {
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
  });
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

/** Glow creeping in from the screen edges (danger, urgency). */
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

/** A soft radial flash of light over `at`. */
export function flash(at: Anchor, o: { radius?: number; color?: Vec3; life?: number; intensity?: number; delay?: number } = {}) {
  const R = o.radius ?? 300;
  return shape({
    type: ShapeType.Flash,
    at,
    life: o.life ?? 0.4,
    delay: o.delay,
    color: o.color ?? C.gold,
    update(f, t) {
      f.hw = f.hh = R * 2.2;
      f.k = (o.intensity ?? 0.25) * Math.min(1, t * 20) * Math.pow(1 - t, 2);
      f.q[0] = R * (0.8 + 0.4 * t);
    },
  });
}

// ---------- motion ----------

/**
 * A comet that arcs from `from` to `to` trailing sparks, then calls `onArrive`.
 * Where effects are off, `onArrive` still runs (at once).
 */
export function comet(from: Anchor, to: Anchor, o: { color?: Vec3; trail?: Vec3; duration?: number; arc?: number; size?: number; delay?: number; onArrive?: () => void } = {}) {
  if (!fxActive()) {
    o.onArrive?.();
    return;
  }
  const a = boxOf(from);
  const dur = o.duration ?? 0.75;
  const color = o.color ?? C.goldPale;
  const trail = o.trail ?? C.gold;
  const size = o.size ?? 7;
  // Bow the path sideways (perpendicular to the straight line), a little random.
  const side = (Math.random() < 0.5 ? -1 : 1) * (o.arc ?? 0.35);
  let prev: Point = { x: a.x, y: a.y };
  let spawnAcc = 0;
  const start = o.delay ?? 0;
  task((dt, age) => {
    if (age < start) return true;
    const b = boxOf(to);
    const u = Math.min(1, (age - start) / dur);
    // Ease in and out, with a late acceleration into the target.
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2.4) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.sin(Math.PI * e) * len * side;
    const x = a.x + dx * e + (-dy / len) * bow;
    const y = a.y + dy * e + (dx / len) * bow;
    const vx = (x - prev.x) / Math.max(dt, 1e-3);
    const vy = (y - prev.y) / Math.max(dt, 1e-3);
    // Head: a bright glow drawn fresh each frame.
    particle({ x, y, life: 0.05, size: size * 1.6, color: scale(color, 0.5), shape: Shape.Glow, fadeIn: 0 });
    particle({ x, y, vx, vy, life: 0.05, size: size * 0.45, color, shape: Shape.Spark, stretch: 0.02, fadeIn: 0 });
    // Trail.
    spawnAcc += dt * 140;
    while (spawnAcc >= 1) {
      spawnAcc--;
      const k = Math.random();
      particle({
        x: prev.x + (x - prev.x) * k + (Math.random() - 0.5) * 4,
        y: prev.y + (y - prev.y) * k + (Math.random() - 0.5) * 4,
        vx: vx * 0.08 + (Math.random() - 0.5) * 60,
        vy: vy * 0.08 + (Math.random() - 0.5) * 60,
        life: rand(0.25, 0.6),
        size: rand(0.8, 1.8),
        sizeEnd: 0.3,
        color: lerp3(trail, color, Math.random() * 0.5),
        colorEnd: scale(C.emberDeep, 0.5),
        shape: Math.random() < 0.7 ? Shape.Ember : Shape.Glow,
        drag: 2,
        gravity: 60,
      });
    }
    prev = { x, y };
    if (u >= 1) {
      o.onArrive?.();
      return false;
    }
    return true;
  });
}

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
  });
  return {
    stop() {
      on = false;
      h.stop();
    },
  };
}

export { after };
