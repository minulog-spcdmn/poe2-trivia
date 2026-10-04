// The creator's aura (aura.ts) in numbers: its shape around an avatar of a
// given size, where its motes are, how a showing fades in and out, and how
// often it shows. Kept free of the DOM so the tests can run it.

/**
 * The motes on the orbit: how far each rides behind the lead one (rad) and
 * its size. The Orbit shader (renderer.ts) draws them with the same numbers.
 */
export const MOTES = [
  { lag: 0, size: 1 },
  { lag: 2.25, size: 0.78 },
  { lag: 4.2, size: 0.62 },
] as const;

/** Avatars smaller than this get the reduced aura: race markers, the deathmatch strip, toasts. */
export const FULL_AT = 30;
/** Avatars this big or bigger get the grand one: the deathmatch intro and the victory crown. */
export const GRAND_AT = 48;
/** How far the ring the avatar wears (Avatar.svelte) reaches beyond its disc, px. */
export const BEZEL = 3.5;

export type AuraTier = 'small' | 'full' | 'grand';

export type AuraForm = {
  tier: AuraTier;
  /** The avatar's layout size, px. Lengths below are for it; they scale with its drawn size. */
  size: number;
  /** The disc that hides the orbit's far side: the avatar and its ring (radius, px). */
  disc: number;
  /** Orbit radius (px), its height over its width, and its roll (rad; negative raises its right end). */
  radius: number;
  tilt: number;
  roll: number;
  /** How many motes ride it, their radius (px), and how far their trails reach (rad). */
  motes: number;
  mote: number;
  trail: number;
  /** How fast they go round (rad/s). */
  speed: number;
  /** Embers rising off her per second (before the device's budget) and glints per showing. */
  embers: number;
  glints: number;
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The aura for an avatar `size` px wide. Small ones (beside answers, among
 * other players' faces) keep to two motes close in; from FULL_AT embers
 * rise off it; from GRAND_AT a third mote joins and the motes slow down.
 * The orbit clears the avatar's sides, and its near side passes in front of
 * it below the letter.
 */
export function auraForm(size: number): AuraForm {
  const s = Math.max(1, size);
  const disc = s / 2 + BEZEL;
  const radius = disc + clamp(s * 0.25, 5, 18);
  const base = { size: s, disc, radius, roll: -0.32 };
  if (s < FULL_AT) return { ...base, tier: 'small', tilt: 0.36, motes: 2, mote: 1.15, trail: 1.5, speed: 1.9, embers: 0, glints: 1 };
  if (s < GRAND_AT) return { ...base, tier: 'full', tilt: 0.34, motes: 2, mote: 1.35, trail: 1.7, speed: 1.6, embers: 1.2, glints: 1 };
  return { ...base, tier: 'grand', tilt: 0.3, motes: 3, mote: clamp(s * 0.03, 1.6, 2.8), trail: 1.9, speed: 1.15, embers: 3, glints: 2 };
}

/**
 * Where a point at `angle` on the orbit is drawn, relative to the avatar's
 * centre (px, at `scale` times the form's size), and how near it is: 1 in
 * front at the bottom, -1 behind at the top. Angles run counterclockwise on
 * screen from the orbit's right end, as in the shader.
 */
export function orbitPoint(f: AuraForm, angle: number, scale = 1): { x: number; y: number; depth: number } {
  const px = f.radius * scale * Math.cos(angle);
  const py = -f.radius * scale * f.tilt * Math.sin(angle);
  const c = Math.cos(f.roll);
  const s = Math.sin(f.roll);
  return { x: c * px - s * py, y: s * px + c * py, depth: -Math.sin(angle) };
}

/** One showing: seconds it lasts, fading in and out. */
export const SHOW = { life: 12, fadeIn: 1.4, fadeOut: 1.8 };
/** Seconds between showings (random in this range): a short breath, so she is rarely without it. */
export const GAP: readonly [number, number] = [2.5, 4];
/** Seconds before the first showing once one of her avatars appears (or a grand one does). */
export const FIRST = 1.2;

/** How bright a showing is `age` seconds in, 0 to 1. */
export function auraEnvelope(age: number, life = SHOW.life): number {
  const rise = smooth(clamp(age / SHOW.fadeIn, 0, 1));
  const fall = smooth(clamp((life - age) / SHOW.fadeOut, 0, 1));
  return Math.min(rise, fall);
}

/** Seconds until the next showing, for a random number `r` in [0, 1). */
export function nextGap(r = Math.random()): number {
  return GAP[0] + (GAP[1] - GAP[0]) * clamp(r, 0, 1);
}

/** Share of the time the aura is out (and keeps the effects loop awake) while nothing else happens. */
export const DUTY = SHOW.life / (SHOW.life + (GAP[0] + GAP[1]) / 2);
