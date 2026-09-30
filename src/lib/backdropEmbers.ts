// Embers rising through the backdrop, simulated here and drawn by the
// backdrop shader (lib/backdrop.ts) beneath the UI. Three depths: far embers
// are small and slow, near ones larger, brighter and quicker, which gives the
// dark some parallax. A deathmatch or a victory can stoke them (more speed
// and glow) through `stoke`.

export const EMBERS = 36;
/** The shader looks embers up by screen column: COLUMNS strips, SLOTS embers each at most. */
export const COLUMNS = 16;
export const SLOTS = 8;

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
};

const r = Math.random;

/** The usual orange halo. */
export const CALM = [1, 0.45, 0.12] as const;

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
  };
}

export class Embers {
  private list = Array.from({ length: EMBERS }, ember);
  /** Ember clock: runs faster while stoked. */
  private t = r() * 100;
  private heat = 0;
  private heatTarget = 0;
  private pos = new Float32Array(EMBERS * 4);
  /** (x, y, size, brightness) per slot, COLUMNS rows of SLOTS; brightness 0 ends a row. */
  readonly data = new Float32Array(COLUMNS * SLOTS * 4);
  /** Halo colour (eased toward `colorTarget`). */
  readonly color: number[] = [...CALM];
  private colorTarget: number[] = [...CALM];

  /** Tints the embers (their halo; the core stays near white). */
  tint(c: readonly number[] = CALM) {
    this.colorTarget = [...c];
  }

  /** 0 is calm, 1 a roaring fire. */
  stoke(level: number) {
    this.heatTarget = level;
  }

  get level() {
    return this.heat;
  }

  /** Advances by `dt` seconds and writes (x, y, size, brightness) per ember. */
  step(dt: number, w: number, h: number) {
    this.heat += (this.heatTarget - this.heat) * (1 - Math.exp(-dt * 1.5));
    for (let i = 0; i < 3; i++) this.color[i] += (this.colorTarget[i] - this.color[i]) * (1 - Math.exp(-dt * 1.2));
    this.t += dt * (1 + 1.6 * this.heat);
    const t = this.t;
    this.list.forEach((e, i) => {
      const u = (t / e.period + e.phase) % 1;
      const x = e.x0 * w + e.drift * u + Math.sin(u * Math.PI * 2 * e.swayRate + e.phase * 6.283) * e.sway;
      const y = h + 16 - u * (h * 1.08 + 32);
      const fade = Math.min(1, u / 0.1) * (1 - Math.max(0, (u - 0.62) / 0.38));
      const fl = 0.78 + 0.22 * Math.sin(t * e.flicker + i * 1.7) * Math.sin(t * e.flicker * 0.37 + i);
      this.pos.set([x, y, e.size * (1 + 0.25 * this.heat), e.bright * fade * fl * (1 + 0.8 * this.heat)], i * 4);
    });
    // Sort the embers into the columns their glow reaches, so each pixel of
    // the backdrop only looks at a handful.
    this.data.fill(0);
    const used = new Uint8Array(COLUMNS);
    const colW = w / COLUMNS;
    for (let i = 0; i < EMBERS; i++) {
      const [x, y, size, b] = this.pos.subarray(i * 4, i * 4 + 4);
      if (b <= 0 || y < -40 || y > h + 40) continue;
      const reach = size * 6.4; // where the shader stops drawing it
      const c0 = Math.max(0, Math.floor((x - reach) / colW));
      const c1 = Math.min(COLUMNS - 1, Math.floor((x + reach) / colW));
      for (let c = c0; c <= c1; c++) {
        if (used[c] >= SLOTS) continue;
        this.data.set([x, y, size, b], (c * SLOTS + used[c]) * 4);
        used[c]++;
      }
    }
  }
}

/** The backdrop's embers, shared so effects can stoke and tint them. */
export const embers = new Embers();
