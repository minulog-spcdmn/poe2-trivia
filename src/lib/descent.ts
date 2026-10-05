// How deep the scene is: Delve's depth turned into the few numbers the
// backdrop and its embers follow. The hall darkens and closes in, the warm
// glow from below deepens to blood red, the embers grow restless, glints of
// azurite catch in the walls, and from depth 21 (where a streak's fire can
// first burn blue) the embers start to burn blue themselves, all of them by
// depth 50. Everything levels off, so depth 1000 looks like depth 100.
// Pure, apart from the eased channel at the bottom that the backdrop reads.

export interface Descent {
  /** 0 at the surface, toward 1: darker, cooler, closer walls. */
  deep: number;
  /** How restless the embers are. */
  agit: number;
  /** The warm glow from below turning blood red. */
  red: number;
  /** The share of embers burning blue (and the cold glow from below). */
  blue: number;
  /** Glints of azurite in the walls. */
  veins: number;
  /** The deepest dark, past the slower veils. */
  abyss: number;
}

export const RED_FROM = 3;
export const RED_FULL = 21;
export const VEINS_FROM = 13;
export const VEINS_FULL = 30;
export const BLUE_FROM = 21;
export const BLUE_FULL = 50;
/** The share of embers that are already blue when the first ones turn. */
export const BLUE_FIRST = 0.15;
export const ABYSS_FROM = 50;
export const ABYSS_FULL = 75;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The scene at a depth (0 outside Delve: the usual scene). Fractional depths ease between whole ones. */
export function descent(depth: number): Descent {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  if (d < 1) {
    // Out of Delve and into it: from nothing to the surface.
    const s = descent(1);
    return { deep: s.deep * d, agit: s.agit * d, red: s.red * d, blue: 0, veins: 0, abyss: 0 };
  }
  return {
    deep: 1 - Math.exp(-(d - 1) / 22),
    agit: 1 - Math.exp(-(d - 1) / 25),
    red: smoothstep(RED_FROM, RED_FULL, d),
    blue: d < BLUE_FROM ? 0 : BLUE_FIRST + (1 - BLUE_FIRST) * smoothstep(BLUE_FROM, BLUE_FULL, d),
    veins: smoothstep(VEINS_FROM, VEINS_FULL, d),
    abyss: smoothstep(ABYSS_FROM, ABYSS_FULL, d),
  };
}

// ---- the eased channel ----------------------------------------------------

/** The depth the scene shows, easing toward the depth of the game. */
let shown = 0;
let target = 0;
const listeners = new Set<(d: Descent) => void>();

/** Sets the depth the scene heads for (0 outside Delve). */
export function setDescent(depth: number) {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  if (d === target) return;
  target = d;
  for (const f of listeners) f(descent(d));
}

/** Calls `f` with the scene a depth change heads for (the CSS backdrop follows it this way). */
export function onDescent(f: (d: Descent) => void): () => void {
  listeners.add(f);
  f(descent(target));
  return () => listeners.delete(f);
}

/**
 * Eases the shown depth toward the target by `dt` seconds: one depth takes
 * about two seconds, a long way (back to the surface after a run) about eight,
 * and it never jumps. Returns whether it is still moving.
 */
export function stepDescent(dt: number): boolean {
  const diff = target - shown;
  if (diff === 0) return false;
  const step = Math.max(Math.abs(diff) * (1 - Math.exp(-dt / 1.6)), 0.4 * dt);
  shown = Math.abs(diff) <= step ? target : shown + Math.sign(diff) * step;
  return true;
}

/** Jumps straight to the target (the backdrop holding still). Returns whether that changed anything. */
export function snapDescent(): boolean {
  if (shown === target) return false;
  shown = target;
  return true;
}

/** The scene as shown right now. */
export function currentDescent(): Descent {
  return descent(shown);
}

/** The depth the scene shows right now (tests). */
export const shownDepth = () => shown;
