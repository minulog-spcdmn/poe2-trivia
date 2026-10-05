// Embers rising through the backdrop, simulated here and drawn by the
// backdrop shader (lib/backdrop.ts) beneath the UI. Three depths: far embers
// are small and slow, near ones larger, brighter and quicker, which gives the
// dark some parallax. A deathmatch or a victory can stoke them (more speed
// and glow) through `stoke`, a deathmatch can crowd the air with more of
// them through `swarm`, and a big moment flare them up for a few seconds
// through `flare`. In Delve the depth (lib/descent.ts) makes them restless,
// deepens their glow toward blood red and turns more and more of them blue,
// and glints of azurite catch in the walls (`descend`).

/** The embers that are always there. */
export const CALM_EMBERS = 36;
/** All of them, the calm ones and the extra ones a swarm brings in. */
export const EMBERS = 100;
/** The shader looks embers up by screen column: COLUMNS strips, SLOTS embers each at most. */
export const COLUMNS = 24;
export const SLOTS = 16;

type Ember = {
  x0: number; // fraction of the width
  period: number; // seconds to cross the screen
  phase: number;
  size: number; // CSS px
  bright: number;
  sway: number; // px
  swayRate: number;
  drift: number; // px over the whole rise
  flicker: number;
  /** How far a swarm has to rise before an extra ember joins it (0 to 1). */
  gate: number;
};

const r = Math.random;

/** The usual orange halo. */
export const CALM = [1, 0.45, 0.12] as const;
/** The halo deep down, before the blue: blood red. */
const DEEP_RED = [1, 0.3, 0.07] as const;
/** Glints of azurite in the walls, at most (fewer on narrow screens). */
export const MAX_VEINS = 14;

/** What the depth asks of the embers (see lib/descent.ts). */
export interface EmberDepth {
  agit: number;
  red: number;
  blue: number;
  veins: number;
  abyss: number;
}

type Vein = { x: number; y: number; rate: number; phase: number; size: number };

/** A glint in one of the side walls (fractions of the screen). */
function vein(): Vein {
  const left = r() < 0.5;
  return {
    x: left ? 0.03 + r() * 0.19 : 0.78 + r() * 0.19,
    y: 0.12 + r() * 0.78,
    rate: 0.4 + r() * 0.9,
    phase: r() * 6.283,
    size: 1.7 + r() * 1.1,
  };
}

function ember(): Ember {
  const depth = r();
  const near = depth > 0.82;
  return {
    x0: r() * 1.1 - 0.05,
    period: near ? 7 + r() * 4 : 11 + r() * 10,
    phase: r(),
    size: near ? 2.6 + r() * 1.6 : 1.3 + depth * 1.6,
    bright: near ? 0.9 : 0.45 + depth * 0.5,
    sway: 8 + r() * 26,
    swayRate: 0.6 + r() * 1.4,
    drift: (r() - 0.5) * 90,
    flicker: 5 + r() * 6,
    gate: r() * 0.7,
  };
}

export class Embers {
  private list = Array.from({ length: EMBERS }, ember);
  private veinList = Array.from({ length: MAX_VEINS }, vein);
  /** Which embers burn blue; each decides when it starts a new rise, so the blue spreads ember by ember. */
  private cold = new Uint8Array(EMBERS);
  /** How much blue it takes for each ember to burn blue (fixed per ember). */
  private coldGate = Float32Array.from({ length: EMBERS }, () => r());
  /** Each ember's place in its rise last step, to see it start a new one. */
  private lastU = new Float32Array(EMBERS);
  private depth: EmberDepth = { agit: 0, red: 0, blue: 0, veins: 0, abyss: 0 };
  /** How restless they are, eased. */
  private agit = 0;
  /** The draft that pushes them sideways, on a clock of its own. */
  private gustT = r() * 100;
  /** Ember clock: runs faster while stoked. */
  private t = r() * 100;
  private heat = 0;
  private heatTarget = 0;
  private crowd = 0;
  private crowdTarget = 0;
  private flareLevel = 0;
  private flareLeft = 0;
  private pos = new Float32Array((EMBERS + MAX_VEINS) * 4);
  /** Embers placed in each column so far (step's scratch). */
  private used = new Uint8Array(COLUMNS);
  /** (x, y, size, brightness) per slot, COLUMNS rows of SLOTS; brightness 0 ends a row. */
  readonly data = new Float32Array(COLUMNS * SLOTS * 4);
  /** Halo colour (eased toward `colorTarget`). */
  readonly color: number[] = [...CALM];
  private colorTarget: number[] = [...CALM];

  /** Tints the embers (their halo; the core stays near white). */
  tint(c: readonly number[] = CALM) {
    this.colorTarget = [...c];
  }

  /** Sets how hot they burn for as long as it lasts: 0 is calm, 1 a roaring fire. */
  stoke(level: number) {
    this.heatTarget = level;
  }

  /** Sets how many there are: 0 is the usual few, 1 crowds the air with every one. */
  swarm(level: number) {
    this.crowdTarget = level;
  }

  /**
   * Flares them up to `level` for `seconds`, over whatever they're stoked to.
   * It dies down by itself, so it never leaves them hot.
   */
  flare(level: number, seconds: number) {
    this.flareLevel = this.flareLeft > 0 ? Math.max(this.flareLevel, level) : level;
    this.flareLeft = Math.max(this.flareLeft, seconds);
  }

  get level() {
    return this.heat;
  }

  /** Follows the depth of a Delve (all zero outside one). */
  descend(d: EmberDepth) {
    this.depth = d;
  }

  /** Every ember takes the depth's colour at once (a new stratum, a rejoin), instead of at its next rise. */
  recolor() {
    for (let i = 0; i < EMBERS; i++) this.cold[i] = this.depth.blue > this.coldGate[i] ? 1 : 0;
  }

  /**
   * Advances by `dt` seconds and writes (x, y, size, brightness) per ember.
   * With `calm` (effects off) they settle back to their usual self.
   */
  step(dt: number, w: number, h: number, calm = false, snap = false) {
    const dep = this.depth;
    this.flareLeft = Math.max(0, this.flareLeft - dt);
    // Deep down they burn hotter and crowd the air a little, but never with effects off.
    const restless = calm ? 0 : dep.agit;
    this.agit += (restless - this.agit) * (snap ? 1 : 1 - Math.exp(-dt * 1.5));
    const target = calm ? 0 : Math.max(this.heatTarget, this.flareLeft > 0 ? this.flareLevel : 0, 0.5 * this.agit);
    // The depth's colour is part of the scene, so it stays with effects off.
    const base = calm ? CALM : this.colorTarget;
    const red = 0.6 * dep.red;
    this.heat += (target - this.heat) * (1 - Math.exp(-dt * 1.5));
    // A swarm builds slowly but clears out within a second or so, so it never
    // lingers into the screen after a deathmatch.
    const crowd = calm ? 0 : Math.max(this.crowdTarget, 0.6 * this.agit);
    this.crowd += (crowd - this.crowd) * (1 - Math.exp(-dt * (crowd > this.crowd ? 0.8 : 4)));
    for (let i = 0; i < 3; i++) {
      const c = base[i] + (DEEP_RED[i] - base[i]) * red;
      this.color[i] += (c - this.color[i]) * (snap ? 1 : 1 - Math.exp(-dt * 1.2));
    }
    if (snap) this.recolor();
    this.t += dt * (1 + 1.6 * this.heat);
    this.gustT += dt * (0.2 + 0.35 * this.agit);
    const a = this.agit;
    // A draft that comes and goes, pushing the restless ones sideways.
    const gust = a * 42 * (0.65 * Math.sin(this.gustT + 1.3) + 0.35 * Math.sin(2.3 * this.gustT));
    const flickerDepth = 0.22 + 0.2 * a;
    const t = this.t;
    // This runs every frame, so it writes into its arrays by index and
    // allocates nothing.
    const pos = this.pos;
    // A narrow screen crowds up with fewer of the extra embers.
    const extra = CALM_EMBERS + (EMBERS - CALM_EMBERS) * Math.min(1, w / 1100);
    for (let i = 0; i < EMBERS; i++) {
      const e = this.list[i];
      const u = (t / e.period + e.phase) % 1;
      const fade = Math.min(1, u / 0.1) * (1 - Math.max(0, (u - 0.62) / 0.38));
      // The extra embers join a swarm one by one as it builds, and leave as it ebbs.
      const join = i < CALM_EMBERS ? 1 : i < extra ? Math.min(1, Math.max(0, (this.crowd - e.gate) / 0.3)) : 0;
      const fl = 1 - flickerDepth + flickerDepth * Math.sin(t * e.flicker + i * 1.7) * Math.sin(t * e.flicker * 0.37 + i);
      // A new rise: this ember now burns blue or not, as deep as the scene is.
      if (u < this.lastU[i]) this.cold[i] = dep.blue > this.coldGate[i] ? 1 : 0;
      this.lastU[i] = u;
      const cold = this.cold[i] === 1;
      pos[i * 4] = e.x0 * w + (e.drift + gust) * u + Math.sin(u * Math.PI * 2 * e.swayRate + e.phase * 6.283) * e.sway * (1 + 0.7 * a);
      pos[i * 4 + 1] = h + 16 - u * (h * 1.08 + 32);
      // A blue ember is passed to the shader as a negative size (it squares the size anyway).
      pos[i * 4 + 2] = e.size * (1 + 0.25 * this.heat) * (cold ? -1 : 1);
      pos[i * 4 + 3] = e.bright * fade * fl * join * (1 + 0.8 * this.heat) * (cold ? 1.3 + 0.4 * dep.abyss : 1);
    }
    // Glints of azurite in the walls: still, each twinkling on its own.
    const veins = Math.round(6 + 8 * Math.min(1, w / 1100));
    for (let k = 0; k < MAX_VEINS; k++) {
      const v = this.veinList[k];
      const i = EMBERS + k;
      const tw = 0.5 + 0.5 * Math.sin(t * v.rate + v.phase);
      pos[i * 4] = v.x * w;
      pos[i * 4 + 1] = v.y * h;
      pos[i * 4 + 2] = -v.size;
      pos[i * 4 + 3] = k < veins ? dep.veins * (0.35 + 0.85 * tw * tw) : 0;
    }
    // Sort the embers into the columns their glow reaches, so each pixel of
    // the backdrop only looks at a handful.
    const data = this.data;
    const used = this.used;
    data.fill(0);
    used.fill(0);
    const colW = w / COLUMNS;
    for (let i = 0; i < EMBERS + MAX_VEINS; i++) {
      const x = pos[i * 4];
      const y = pos[i * 4 + 1];
      const size = pos[i * 4 + 2];
      const b = pos[i * 4 + 3];
      if (b <= 0 || y < -40 || y > h + 40) continue;
      const reach = Math.abs(size) * 6.4; // where the shader stops drawing it
      const c0 = Math.max(0, Math.floor((x - reach) / colW));
      const c1 = Math.min(COLUMNS - 1, Math.floor((x + reach) / colW));
      for (let c = c0; c <= c1; c++) {
        if (used[c] >= SLOTS) continue;
        const k = (c * SLOTS + used[c]) * 4;
        data[k] = x;
        data[k + 1] = y;
        data[k + 2] = size;
        data[k + 3] = b;
        used[c]++;
      }
    }
  }
}

/** The backdrop's embers, shared so effects can stoke and tint them. */
export const embers = new Embers();
