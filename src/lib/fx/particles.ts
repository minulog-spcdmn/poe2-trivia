// CPU particle pool for the FX overlay. Particles live in flat typed arrays
// (struct of arrays) and are packed into one instance buffer per frame.
// Positions are CSS pixels in the viewport; colours are HDR (above 1 blooms
// and burns toward white in the tone map).

export const Shape = {
  /** Soft Gaussian light. */
  Glow: 0,
  /** Motion-blurred streak along the velocity. */
  Spark: 1,
  /** Hot core with a wide halo; flickers. */
  Ember: 2,
  /** Diamond shard with bright edges. */
  Shard: 3,
  /** Four-point star glint. */
  Glint: 4,
  /** Out-of-focus disc (bokeh). */
  Mote: 5,
  /** A gold coin flipping end over end, glinting when it faces you. */
  Coin: 6,
} as const;
export type Shape = (typeof Shape)[keyof typeof Shape];

export type ParticleSpec = {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Seconds. */
  life: number;
  size: number;
  sizeEnd?: number;
  /** HDR colour at birth. */
  color: readonly [number, number, number];
  /** HDR colour at death; defaults to `color`. */
  colorEnd?: readonly [number, number, number];
  /** px/s², positive is down. */
  gravity?: number;
  /** Fraction of velocity lost per second (exponential). */
  drag?: number;
  shape?: Shape;
  /** Streak length in seconds of travel. */
  stretch?: number;
  rot?: number;
  spin?: number;
  /** 0 to 1: how much the brightness flickers. */
  flicker?: number;
  /** Fraction of the life spent fading in. */
  fadeIn?: number;
  /** Wandering acceleration, px/s². */
  turbulence?: number;
  /** Seconds before the particle appears. */
  delay?: number;
  /**
   * Fly to a target instead of drifting: the particle follows a quadratic
   * curve from (x, y) through control point (cx, cy) to (tx, ty), arriving
   * exactly as its life ends (velocity, gravity and drag are ignored).
   */
  seek?: { cx: number; cy: number; tx: number; ty: number };
};

// Per-particle fields, in this order.
const F = {
  x: 0,
  y: 1,
  vx: 2,
  vy: 3,
  age: 4,
  life: 5,
  s0: 6,
  s1: 7,
  r0: 8,
  g0: 9,
  b0: 10,
  r1: 11,
  g1: 12,
  b1: 13,
  grav: 14,
  drag: 15,
  shape: 16,
  stretch: 17,
  rot: 18,
  spin: 19,
  flicker: 20,
  fadeIn: 21,
  turb: 22,
  seed: 23,
  seek: 24, // 1 when seeking, then start x/y, control x/y, target x/y
  sx: 25,
  sy: 26,
  cx: 27,
  cy: 28,
  tx: 29,
  ty: 30,
} as const;
const STRIDE = 31;

/** Floats per particle in the instance buffer: (x, y, vx, vy) (size, stretch, rot, shape) (r, g, b, seed). */
export const INSTANCE_FLOATS = 12;

export class ParticlePool {
  readonly cap: number;
  count = 0;
  /** Squared speed of the fastest particle drawn in the last step, (px/s)². */
  fastest = 0;
  private d: Float32Array;
  readonly instances: Float32Array;

  constructor(cap: number) {
    this.cap = cap;
    this.d = new Float32Array(cap * STRIDE);
    this.instances = new Float32Array(cap * INSTANCE_FLOATS);
  }

  /** Adds a particle; when the pool is full, the oldest-looking one makes way. */
  spawn(p: ParticleSpec) {
    let i = this.count;
    if (i >= this.cap) {
      // Replace a random particle rather than refusing: bursts stay complete.
      i = Math.floor(Math.random() * this.cap);
    } else {
      this.count++;
    }
    const d = this.d;
    const o = i * STRIDE;
    const ce = p.colorEnd ?? p.color;
    d[o + F.x] = p.x;
    d[o + F.y] = p.y;
    d[o + F.vx] = p.vx ?? 0;
    d[o + F.vy] = p.vy ?? 0;
    d[o + F.age] = -(p.delay ?? 0);
    d[o + F.life] = Math.max(0.016, p.life);
    d[o + F.s0] = p.size;
    d[o + F.s1] = p.sizeEnd ?? p.size;
    d[o + F.r0] = p.color[0];
    d[o + F.g0] = p.color[1];
    d[o + F.b0] = p.color[2];
    d[o + F.r1] = ce[0];
    d[o + F.g1] = ce[1];
    d[o + F.b1] = ce[2];
    d[o + F.grav] = p.gravity ?? 0;
    d[o + F.drag] = p.drag ?? 0;
    d[o + F.shape] = p.shape ?? Shape.Glow;
    d[o + F.stretch] = p.stretch ?? 0;
    d[o + F.rot] = p.rot ?? Math.random() * Math.PI * 2;
    d[o + F.spin] = p.spin ?? 0;
    d[o + F.flicker] = p.flicker ?? 0;
    d[o + F.fadeIn] = p.fadeIn ?? 0.04;
    d[o + F.turb] = p.turbulence ?? 0;
    d[o + F.seed] = Math.random() * 1000;
    const k = p.seek;
    d[o + F.seek] = k ? 1 : 0;
    if (k) {
      d[o + F.sx] = p.x;
      d[o + F.sy] = p.y;
      d[o + F.cx] = k.cx;
      d[o + F.cy] = k.cy;
      d[o + F.tx] = k.tx;
      d[o + F.ty] = k.ty;
    }
  }

  /** Moves everything forward by `dt` seconds and packs the live particles. Returns how many to draw. */
  step(dt: number): number {
    const d = this.d;
    const out = this.instances;
    let n = 0;
    let fastest = 0;
    for (let i = 0; i < this.count; ) {
      const o = i * STRIDE;
      const age = d[o + F.age] + dt;
      const life = d[o + F.life];
      if (age >= life) {
        // Swap-remove with the last particle.
        this.count--;
        if (i !== this.count) d.copyWithin(o, this.count * STRIDE, this.count * STRIDE + STRIDE);
        continue;
      }
      d[o + F.age] = age;
      i++;
      if (age < 0) continue; // still delayed

      const seed = d[o + F.seed];
      if (d[o + F.seek]) {
        this.seekStep(o, age, life, n++);
        fastest = Infinity;
        continue;
      }
      let vx = d[o + F.vx];
      let vy = d[o + F.vy];
      const turb = d[o + F.turb];
      if (turb) {
        const x = d[o + F.x];
        const y = d[o + F.y];
        vx += turb * Math.sin(y * 0.021 + age * 2.3 + seed) * dt;
        vy += turb * Math.cos(x * 0.017 + age * 1.9 + seed * 1.3) * dt;
      }
      vy += d[o + F.grav] * dt;
      const drag = d[o + F.drag];
      if (drag) {
        const k = Math.exp(-drag * dt);
        vx *= k;
        vy *= k;
      }
      d[o + F.vx] = vx;
      d[o + F.vy] = vy;
      const x = (d[o + F.x] += vx * dt);
      const y = (d[o + F.y] += vy * dt);
      const rot = (d[o + F.rot] += d[o + F.spin] * dt);

      const t = age / life;
      const fadeIn = d[o + F.fadeIn];
      let env = (fadeIn > 0 ? Math.min(1, t / fadeIn) : 1) * Math.pow(1 - t, 1.35);
      const flicker = d[o + F.flicker];
      if (flicker) {
        const f = 0.5 + 0.5 * Math.sin(age * (9 + (seed % 7)) + seed) * Math.sin(age * 23.7 + seed * 0.7);
        env *= 1 - flicker * f;
      }
      const ct = t * t * (3 - 2 * t);
      const size = d[o + F.s0] + (d[o + F.s1] - d[o + F.s0]) * t;

      const q = n * INSTANCE_FLOATS;
      out[q] = x;
      out[q + 1] = y;
      out[q + 2] = vx;
      out[q + 3] = vy;
      out[q + 4] = size;
      // Coins pass their flip (the cosine of their turn) where streaks pass their length.
      out[q + 5] = d[o + F.shape] === Shape.Coin ? Math.cos(age * (4 + (seed % 7)) + seed) : d[o + F.stretch];
      out[q + 6] = rot;
      out[q + 7] = d[o + F.shape];
      out[q + 8] = (d[o + F.r0] + (d[o + F.r1] - d[o + F.r0]) * ct) * env;
      out[q + 9] = (d[o + F.g0] + (d[o + F.g1] - d[o + F.g0]) * ct) * env;
      out[q + 10] = (d[o + F.b0] + (d[o + F.b1] - d[o + F.b0]) * ct) * env;
      out[q + 11] = seed;
      n++;
      fastest = Math.max(fastest, vx * vx + vy * vy);
    }
    this.fastest = fastest;
    return n;
  }

  /** A seeking particle: its place on the curve, as streak and colour, into instance `n`. */
  private seekStep(o: number, age: number, life: number, n: number) {
    const d = this.d;
    const t = age / life;
    // Ease out of the start and glide into the target.
    const e = t * t * (3 - 2 * t);
    const de = (6 * t - 6 * t * t) / life;
    const u = 1 - e;
    const x = u * u * d[o + F.sx] + 2 * u * e * d[o + F.cx] + e * e * d[o + F.tx];
    const y = u * u * d[o + F.sy] + 2 * u * e * d[o + F.cy] + e * e * d[o + F.ty];
    const vx = (2 * u * (d[o + F.cx] - d[o + F.sx]) + 2 * e * (d[o + F.tx] - d[o + F.cx])) * de;
    const vy = (2 * u * (d[o + F.cy] - d[o + F.sy]) + 2 * e * (d[o + F.ty] - d[o + F.cy])) * de;
    d[o + F.x] = x;
    d[o + F.y] = y;
    const fadeIn = d[o + F.fadeIn];
    const env = fadeIn > 0 ? Math.min(1, t / fadeIn) : 1;
    const size = d[o + F.s0] + (d[o + F.s1] - d[o + F.s0]) * t;
    const q = n * INSTANCE_FLOATS;
    const out = this.instances;
    out[q] = x;
    out[q + 1] = y;
    out[q + 2] = vx;
    out[q + 3] = vy;
    out[q + 4] = size;
    out[q + 5] = d[o + F.stretch];
    out[q + 6] = 0;
    out[q + 7] = d[o + F.shape];
    out[q + 8] = (d[o + F.r0] + (d[o + F.r1] - d[o + F.r0]) * t) * env;
    out[q + 9] = (d[o + F.g0] + (d[o + F.g1] - d[o + F.g0]) * t) * env;
    out[q + 10] = (d[o + F.b0] + (d[o + F.b1] - d[o + F.b0]) * t) * env;
    out[q + 11] = d[o + F.seed];
  }

  clear() {
    this.count = 0;
  }
}
