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
  /** A billow of smoke: noise over a soft body, its lobes swelling as it spreads, lit from where it came from. */
  Smoke: 7,
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
  /** Wandering acceleration, px/s²: how hard the air's own stir (flowAt, or for all but smoke its eddies) pushes it, so neighbours wander together. */
  turbulence?: number;
  /** Seconds before the particle appears. */
  delay?: number;
  /**
   * Fly to a target instead of drifting: the particle follows a quadratic
   * curve from (x, y) through control point (cx, cy) to (tx, ty), arriving
   * exactly as its life ends (velocity, gravity and drag are ignored).
   * `from` and `to`, when set, are follow slots (ParticlePool.follow, see
   * follow() in core.ts): the start and the target move as the elements
   * they follow do, so it leaves from where its source is now and lands
   * on its target wherever that has gone meanwhile (the page scrolled, the
   * row it aims at moved).
   */
  seek?: { cx: number; cy: number; tx: number; ty: number; from?: number; to?: number };
  /** It shines from behind the UI: the boxes cover() names hide it (see COVER in renderer.ts). */
  behind?: boolean;
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
  page: 31, // 1 for the page's light, 0 for an open dialog's (see BEHIND_DIALOG in renderer.ts), plus 2 from behind the UI (see COVER)
  from: 32, // a seeking particle's follow slots (0 for none): its start's, its target's
  to: 33,
  group: 34, // the group it was made in (core.ts fxGroup), 0 for none
  out: 35, // seconds left of its fade-out once its group ended (0: not fading), and that fade's length
  outTotal: 36,
} as const;
const STRIDE = 37;

// The air's own stir, so neighbours drift together as smoke and ash do: a
// few slow waves crossing the screen at odd angles, summed as a curl so it
// neither gathers nor spreads what it carries. Smoke rides all of it (and
// the page's smoke, lib/blastSmoke.ts): broad waves and a light wind veering
// over seconds, which carry a billow off as a whole. Everything else only
// its eddies (EDDIES, eddyAt), smaller than a burst: its sparks and embers
// swirl together but the burst stays where it was made, however the wind
// blows. Each about 1 at its strongest, on average.
const waves = (list: readonly (readonly [number, number, number, number])[]) =>
  list.map(([a, len, drift, k]) => ({ dx: Math.cos(a), dy: Math.sin(a), f: (2 * Math.PI) / len, drift, k }));
const WAVES = waves([
  // direction (rad), wavelength (px), drift (rad/s), weight
  [0.3, 420, 0.7, 0.85],
  [1.9, 260, -1.1, 0.68],
  [3.4, 170, 1.6, 0.55],
  [4.7, 610, -0.45, 0.6],
]);
const EDDIES = waves([
  [0.8, 150, 1.3, 0.8],
  [2.6, 110, -1.7, 0.7],
  [4.1, 190, 1.1, 0.75],
]);
const flow: [number, number] = [0, 0];

function curl(list: typeof WAVES, x: number, y: number, t: number, fx: number, fy: number): readonly [number, number] {
  for (const w of list) {
    const c = w.k * Math.cos((x * w.dx + y * w.dy) * w.f + t * w.drift);
    fx += c * w.dy;
    fy -= c * w.dx;
  }
  flow[0] = fx;
  flow[1] = fy;
  return flow;
}
/** The air's clock (s): the effects' particles step it, and whatever else the air carries reads it (airNow). */
let airTime = 0;
/** Where the air's stir stands now, for flowAt: the effects' own clock, so the page's smoke moves with their particles. */
export const airNow = () => airTime;

/** The air's stir at (x, y) (CSS px) at time `t` (s), as an acceleration per unit of turbulence. The array is reused: read it at once. */
export function flowAt(x: number, y: number, t: number): readonly [number, number] {
  return curl(WAVES, x, y, t, 0.3 * Math.sin(t * 0.23), 0.18 * Math.sin(t * 0.31 + 1));
}

/** The air's eddies alone at (x, y) at time `t`, as flowAt: what moves everything but smoke. */
const eddyAt = (x: number, y: number, t: number) => curl(EDDIES, x, y, t, 0, 0);

/** How many moving elements seeking particles can follow at once (slots are reused in turn). */
export const FOLLOW_SLOTS = 64;

/** Floats per particle in the instance buffer: (x, y, vx, vy) (size, stretch, rot, shape) (r, g, b, page light and behind the UI). */
export const INSTANCE_FLOATS = 12;

export class ParticlePool {
  readonly cap: number;
  count = 0;
  /** Squared speed of the fastest particle drawn in the last step, (px/s)². */
  fastest = 0;
  private d: Float32Array;
  readonly instances: Float32Array;
  /**
   * How far each followed element has moved since its slot was taken, as x,
   * y pairs (slot n at 2n - 2); slot 0 means none. Kept up to date by
   * follow() in core.ts, before every step.
   */
  readonly follows = new Float32Array(FOLLOW_SLOTS * 2);
  private nextFollow = 0;

  /** Takes the next follow slot (1 to FOLLOW_SLOTS), its offset reset. */
  claimFollow(): number {
    const n = (this.nextFollow % FOLLOW_SLOTS) + 1;
    this.nextFollow = n;
    this.follows[2 * n - 2] = this.follows[2 * n - 1] = 0;
    return n;
  }

  constructor(cap: number) {
    this.cap = cap;
    this.d = new Float32Array(cap * STRIDE);
    this.instances = new Float32Array(cap * INSTANCE_FLOATS);
  }

  /**
   * Adds a particle; when the pool is full, the oldest-looking one makes way.
   * `page` is false for light from an open dialog, which shows over it;
   * `group` is the group it belongs to (see fadeGroup).
   */
  spawn(p: ParticleSpec, page = true, group = 0) {
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
    d[o + F.page] = (page ? 1 : 0) + (p.behind ? 2 : 0);
    d[o + F.group] = group;
    d[o + F.out] = d[o + F.outTotal] = 0;
    const k = p.seek;
    d[o + F.seek] = k ? 1 : 0;
    if (k) {
      d[o + F.sx] = p.x;
      d[o + F.sy] = p.y;
      d[o + F.cx] = k.cx;
      d[o + F.cy] = k.cy;
      d[o + F.tx] = k.tx;
      d[o + F.ty] = k.ty;
      d[o + F.from] = k.from ?? 0;
      d[o + F.to] = k.to ?? 0;
    }
  }

  /** Moves everything forward by `dt` seconds and packs the live particles. Returns how many to draw. */
  step(dt: number): number {
    const d = this.d;
    const out = this.instances;
    let n = 0;
    let fastest = 0;
    const time = (airTime += dt);
    for (let i = 0; i < this.count; ) {
      const o = i * STRIDE;
      const age = d[o + F.age] + dt;
      const life = d[o + F.life];
      // (Fading out, its group ended: gone once the fade is over.)
      let fade = d[o + F.out];
      const faded = fade > 0 && (fade -= dt) <= 0;
      if (age >= life || faded) {
        // Swap-remove with the last particle.
        this.count--;
        if (i !== this.count) d.copyWithin(o, this.count * STRIDE, this.count * STRIDE + STRIDE);
        continue;
      }
      d[o + F.age] = age;
      if (fade > 0) d[o + F.out] = fade;
      i++;
      if (age < 0) continue; // still delayed

      const fading = fade > 0 ? fade / d[o + F.outTotal] : 1;
      const seed = d[o + F.seed];
      if (d[o + F.seek]) {
        this.seekStep(o, age, life, n++, fading);
        fastest = Infinity;
        continue;
      }
      let vx = d[o + F.vx];
      let vy = d[o + F.vy];
      const turb = d[o + F.turb];
      if (turb) {
        const f = (d[o + F.shape] === Shape.Smoke ? flowAt : eddyAt)(d[o + F.x], d[o + F.y], time);
        vx += turb * f[0] * dt;
        vy += turb * f[1] * dt;
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
      let env = (fadeIn > 0 ? Math.min(1, t / fadeIn) : 1) * Math.pow(1 - t, 1.35) * fading;
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
      // Coins pass their flip (the cosine of their turn) where streaks pass their length, and smoke its seed and
      // how far through its life it is (the whole and the fraction).
      const shape = d[o + F.shape];
      out[q + 5] =
        shape === Shape.Coin ? Math.cos(age * (4 + (seed % 7)) + seed) : shape === Shape.Smoke ? Math.floor(seed) + Math.min(t, 0.999) : d[o + F.stretch];
      out[q + 6] = rot;
      out[q + 7] = shape;
      out[q + 8] = (d[o + F.r0] + (d[o + F.r1] - d[o + F.r0]) * ct) * env;
      out[q + 9] = (d[o + F.g0] + (d[o + F.g1] - d[o + F.g0]) * ct) * env;
      out[q + 10] = (d[o + F.b0] + (d[o + F.b1] - d[o + F.b0]) * ct) * env;
      out[q + 11] = d[o + F.page];
      n++;
      fastest = Math.max(fastest, vx * vx + vy * vy);
    }
    this.fastest = fastest;
    return n;
  }

  /** A seeking particle: its place on the curve, as streak and colour, into instance `n` (dimmed by `fading`). */
  private seekStep(o: number, age: number, life: number, n: number, fading: number) {
    const d = this.d;
    const t = age / life;
    // Ease out of the start and glide into the target.
    const e = t * t * (3 - 2 * t);
    const de = (6 * t - 6 * t * t) / life;
    const u = 1 - e;
    // Where its start and target are now, if they follow elements; the bow between them moves with both.
    const fs = d[o + F.from];
    const ft = d[o + F.to];
    const f = this.follows;
    const ax = fs ? f[2 * fs - 2] : 0;
    const ay = fs ? f[2 * fs - 1] : 0;
    const bx = ft ? f[2 * ft - 2] : 0;
    const by = ft ? f[2 * ft - 1] : 0;
    const sx = d[o + F.sx] + ax;
    const sy = d[o + F.sy] + ay;
    const cx = d[o + F.cx] + (ax + bx) / 2;
    const cy = d[o + F.cy] + (ay + by) / 2;
    const tx = d[o + F.tx] + bx;
    const ty = d[o + F.ty] + by;
    const x = u * u * sx + 2 * u * e * cx + e * e * tx;
    const y = u * u * sy + 2 * u * e * cy + e * e * ty;
    const vx = (2 * u * (cx - sx) + 2 * e * (tx - cx)) * de;
    const vy = (2 * u * (cy - sy) + 2 * e * (ty - cy)) * de;
    d[o + F.x] = x;
    d[o + F.y] = y;
    const fadeIn = d[o + F.fadeIn];
    const env = (fadeIn > 0 ? Math.min(1, t / fadeIn) : 1) * fading;
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
    out[q + 11] = d[o + F.page];
  }

  /**
   * The particles of `group` fade out over `seconds` (those still waiting
   * to appear never do); one already fading keeps the quicker fade.
   */
  fadeGroup(group: number, seconds: number) {
    const d = this.d;
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE;
      if (d[o + F.group] !== group) continue;
      // (Its age at its life: it ends on the next step.)
      if (d[o + F.age] < 0) d[o + F.age] = d[o + F.life];
      else if (!(d[o + F.out] > 0 && d[o + F.out] <= seconds)) d[o + F.out] = d[o + F.outTotal] = Math.max(0.001, seconds);
    }
  }

  clear() {
    this.count = 0;
  }
}
