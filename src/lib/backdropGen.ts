// Backdrops made up: a stratum's look and its embers' motion, generated from
// a seed within tasteful bounds, so whatever comes out keeps to the start
// page's style: a smooth gradient with soft drifting smoke and light,
// embers, and at most a quiet detail or two. Only the backdrop's own
// parameters are generated (lib/backdropData.ts: the colours and strengths
// of a look, how much of each environment the backdrop already draws, a
// motion profile tweaked); nothing new is drawn.
//
// The zones' generator (generate, the backdrop tool's):
//
// - One base hue, its neighbours on the wheel in the smoke (as on the start
//   page, where the smoke's four drifts are a few neighbouring hues), the
//   light from below near it, the haze a further neighbour; muted, dark.
// - Restrained detail: at most two of the environments, low to moderate,
//   picked by the hue (frost in a blue hall, spores in a green one), never
//   the stone trunks the petrified mist brings in when it is strong.
// - Each detail in colours of its own kind (ENV_TONES' rules in
//   lib/backdropData.ts: magma within the reds and oranges, frost from white
//   to blue, a void any hue), turned toward the hall's hue as far as its
//   kind allows (pickTone).
// - Embers in the hue, moving as its mood has it, as a soft rule: warm
//   palettes rise, cold ones fall, violet ones are drawn into the eddies.
//
// The endgame's strata (generateStratum) each take an archetype of
// lib/archetypes.ts instead, a mood with a vibe of its own: its one or two
// effects, clearly there but quiet; a palette in a colour scheme (a base
// hue with its neighbours in the smoke, and a contrasting accent in the
// light from below, the haze, the glow or an effect's colours); its embers'
// colour and motion; and its character. Bolder than the zones (Steer), each
// effect a zone shows in colours kept from that zone's; lib/backdrops.ts
// re-rolls what still comes out too alike, as lib/likeness.ts measures it.
//
// Pure and seeded: the same seed and settings always give the same backdrop
// (the endgame's strata are the same for everyone, see lib/backdrops.ts).

import { ENV_TONES, ENVIRONMENTS, stopsOf, type EnvName, type GenSettings, type Group, type Look, type MotionTweak, type RGB, type Tone } from './backdropData.ts';
import { profileOf, tweakOf } from './emberProfiles.ts';
import { ARCHETYPES, EFFECT_CEILING, EFFECT_FLOOR, MIST_CEILING, type HueRef, type Variant } from './archetypes.ts';
import { lchOf, toneDistance, type LCh, type Signature } from './likeness.ts';

/** The settings the endgame starts from, and the tool's generator. */
export const DEFAULT_SETTINGS: GenSettings = { hue: [0, 360], sat: [0.4, 0.8], darkness: 0.6, detail: 0.45, embers: 0.5 };

export interface Generated {
  /** The seed it was generated from (its stratum's own, or a re-roll of it: see `rolled`). */
  seed: number;
  /** How many seeds on from its stratum's own it is (lib/backdrops.ts re-rolls a stratum too like a zone or its neighbour: seed, seed + 1, ...). */
  rolled: number;
  /** Its base hue (degrees). */
  hue: number;
  look: Look;
  motion: MotionTweak;
  /** A stratum past the zones: its archetype (lib/archetypes.ts, its kind) and its variant's colour scheme. */
  kind?: string;
  scheme?: string;
}

// ---- seeds ---------------------------------------------------------------------

/** A seed's random numbers, 0 to 1 (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes two whole numbers into a seed. */
export function mix(a: number, b: number): number {
  let h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b >>> 0, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A seed from what is typed: a whole number as it is, anything else hashed. */
export function seedOf(text: string | number): number {
  const s = String(text).trim();
  if (/^\d{1,10}$/.test(s) && Number(s) <= 0xffffffff) return Number(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return mix(h, s.length);
}

/** Stratum `k`'s own seed, from the endgame's (the same for everyone). */
export const stratumSeed = (base: number, k: number) => mix(mix(base, k % 0x100000000), Math.floor(k / 0x100000000));

/** The `i`th of a seed's variations (the tool's strip). */
export const variationSeed = (seed: number, i: number) => mix(seed ^ 0x5bd1e995, i + 1);

/** A fresh seed (the tool's Generate; never in the game). */
export const freshSeed = () => Math.floor(Math.random() * 0x100000000) >>> 0;

// ---- colour ------------------------------------------------------------------

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const wrap = (h: number) => ((h % 360) + 360) % 360;
/** How far apart two hues are round the wheel (0 to 180). */
export const hueDistance = (a: number, b: number) => {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, 360 - d);
};

/** A colour from hue (degrees), saturation and value (0 to 1), its channels 0 to 1. */
export function hsv(h: number, s: number, v: number): RGB {
  const hh = wrap(h) / 60;
  const c = v * clamp01(s);
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** The hue (degrees) of a colour, and how saturated it is (0 grey to 1). */
export function hueOf(c: readonly number[]): { hue: number; sat: number } {
  const [r, g, b] = c;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d <= 0) return { hue: 0, sat: 0 };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { hue: wrap(h * 60), sat: d / max };
}

const to255 = (c: RGB): RGB => c.map((v) => Math.round(255 * clamp01(v))) as RGB;
const to1 = (c: RGB): RGB => c.map((v) => Math.round(100 * clamp01(v)) / 100) as RGB;
const round = (x: number, step = 0.01) => Math.round(x / step) * step;
const r2 = (x: number) => Math.round(x * 100) / 100;
const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** How wide the settings' hue range is (degrees; 360 the whole wheel). */
export function hueSpan(s: GenSettings) {
  const span = wrap(s.hue[1] - s.hue[0]);
  return span === 0 ? 360 : span;
}
/** The hue `place` (0 to 1) of the way through the settings' range. */
export const hueAt = (s: GenSettings, place: number) => wrap(s.hue[0] + clamp01(place) * hueSpan(s));
/** Where a hue lies in the settings' range (0 to 1; the nearer end where it lies outside). */
export function placeOf(s: GenSettings, hue: number) {
  const span = hueSpan(s);
  const t = wrap(hue - s.hue[0]);
  if (t <= span) return t / span;
  return wrap(hue - s.hue[1]) < wrap(s.hue[0] - hue) ? 1 : 0;
}

// ---- moods ---------------------------------------------------------------------

/**
 * The hue each environment's detail belongs to (its own colour in the
 * backdrop), and how far from it it still fits; the most it is ever drawn
 * at (the petrified mist brings stone trunks in from 0.45: never).
 */
const ENV_MOOD: Record<(typeof ENVIRONMENTS)[number], { hue: number; width: number; most: number }> = {
  lamps: { hue: 28, width: 22, most: 0.6 },
  magma: { hue: 10, width: 22, most: 0.6 },
  frost: { hue: 205, width: 30, most: 0.65 },
  spores: { hue: 110, width: 35, most: 0.6 },
  shafts: { hue: 42, width: 20, most: 0.6 },
  void: { hue: 275, width: 30, most: 0.6 },
  mist: { hue: 180, width: 70, most: 0.4 },
  plumes: { hue: 70, width: 20, most: 0.6 },
  city: { hue: 235, width: 22, most: 0.55 },
  heat: { hue: 18, width: 18, most: 0.5 },
};

/**
 * The hue each motion profile belongs to (by its own zone's), and how far
 * it reaches: so warm halls take rising embers, cold ones falling snow,
 * dust and motes, violet ones the eddies; a soft rule, each weighed by how
 * near the hue is.
 */
const MOTION_MOOD: { name: string; hue: number; width: number }[] = [
  { name: 'embers rising', hue: 28, width: 30 },
  { name: 'dust sifting down', hue: 35, width: 30 },
  { name: 'embers rising on the heat', hue: 8, width: 25 },
  { name: 'snow falling', hue: 205, width: 35 },
  { name: 'spores hanging', hue: 105, width: 35 },
  { name: 'motes settling', hue: 45, width: 18 },
  { name: 'drawn into the eddies', hue: 280, width: 30 },
  { name: 'stone dust falling', hue: 165, width: 40 },
  { name: 'rising on the puffs', hue: 68, width: 18 },
  { name: 'cold motes drifting', hue: 232, width: 25 },
  { name: 'sparks flying up', hue: 16, width: 25 },
];

const near = (hue: number, center: number, width: number) => Math.exp(-((hueDistance(hue, center) / width) ** 2));

/** Picks an index by weight. */
function pick(weights: number[], r: number) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

// ---- the zones' generator ----------------------------------------------------------

/**
 * A backdrop from `seed`, within `settings`: its base hue `place` (0 to 1)
 * of the way through the settings' hue range, or where the seed puts it.
 * The tool's generator for the zones; the endgame's strata are made by
 * generateStratum instead. Its lightK is 1: how bright its hall is lit is
 * worked out where it is shown (calibrateLight in lib/descent.ts).
 */
export function generate(seed: number, settings: GenSettings, place?: number): Generated {
  const r = rng(seed);
  const own = r();
  const h = hueAt(settings, place ?? own);
  const s = Math.min(0.92, lerp(settings.sat[0], settings.sat[1], r()));
  const dk = clamp01(settings.darkness + (r() - 0.5) * 0.2);

  // The smoke: the base hue and its neighbours, the high drifts paler.
  const spread = 14 + 22 * r();
  const side = r() < 0.5 ? -1 : 1;
  const v = lerp(0.66, 0.44, dk) * (0.92 + 0.16 * r());
  const smoke = hsv(h, s, v);
  const smokeB = hsv(h - side * spread * (0.5 + 0.5 * r()), Math.min(0.92, s * (0.9 + 0.15 * r())), v * 0.8);
  const smokeHi = hsv(h + side * spread * (0.3 + 0.5 * r()), s * 0.62, v * 0.95);
  const smokeHiB = hsv(h + (r() < 0.5 ? -1 : 1) * spread * (0.6 + 0.6 * r()), s * 0.6, v * 0.75);
  // The light from below near it, the haze a further neighbour, the glow paler.
  const floor = hsv(h + (r() - 0.5) * 16, Math.min(0.92, s * 1.08), lerp(0.72, 0.52, dk));
  const haze = hsv(h + (r() < 0.5 ? -1 : 1) * (20 + 30 * r()), s * 0.55, lerp(0.58, 0.36, dk));
  const glow = hsv(h + (r() - 0.5) * 20, s * 0.5, lerp(0.86, 0.66, dk));
  const mist = hsv(h, s, lerp(0.48, 0.32, dk));
  const tint = hsv(h, 1, 1);

  // The embers: the hue, bright; their core near white.
  const eh = h + (r() - 0.5) * 24;
  const es = 0.45 + 0.45 * r();
  const ember = hsv(eh, es, 1);
  const core = hsv(eh, 0.08 + 0.18 * r(), 1);
  let accent = hsv(eh, Math.min(0.55, es * 0.7), 1);
  if (luma(accent) < 0.55) accent = hsv(eh, 0.3, 1);

  const look: Look = {
    shade: tint.map((c) => r2(0.74 + 0.34 * c)) as RGB,
    dark: r2(Math.min(0.75, Math.max(0.1, lerp(0.32, 0.68, dk) + (r() - 0.5) * 0.08))),
    floor: to255(floor),
    floorK: r2(0.28 + 0.16 * r()),
    floorH: r2(1 + 0.3 * r()),
    haze: to255(haze),
    hazeK: r2(0.45 + 0.25 * r()),
    glow: to255(glow),
    lamp: r2(0.4 + 0.3 * r()),
    smoke: to255(smoke),
    smokeB: to255(smokeB),
    smokeHi: to255(smokeHi),
    smokeHiB: to255(smokeHiB),
    smokeK: r2(lerp(1.2, 1.7, dk) + (r() - 0.5) * 0.1),
    shadowK: r2(lerp(1.15, 1.55, dk)),
    mist: to255(mist),
    mistK: round(0.05 + 0.03 * r(), 0.005),
    ember: to1(ember),
    core: to1(core),
    coreMix: r2(0.5 + 0.25 * r()),
    crowd: r2(clamp01(settings.embers + (r() - 0.5) * 0.3)),
    speed: 1,
    size: r2(0.75 + 0.6 * r()),
    bright: r2(0.9 + 0.35 * r()),
    agit: 0,
    fall: 0,
    glint: [1, 1, 1],
    glints: 0,
    spread: 0,
    burst: 0,
    eddy: 0,
    env: ENVIRONMENTS.map(() => 0),
    tones: {},
    accent: to255(accent),
    lightK: 1,
  };

  // Glints now and then, in the embers' hue.
  look.glint = to1(hsv(eh + (r() - 0.5) * 30, 0.5 + 0.3 * r(), 1));
  if (r() < 0.6) {
    look.glints = r2(0.2 + 0.5 * r());
    look.spread = r2(0.7 * r());
  }

  // A quiet detail or two, fitting the hue.
  const amount = clamp01(settings.detail);
  const roll = r();
  const count = amount <= 0 ? 0 : roll < (1 - amount) * 0.45 ? 0 : roll > 1 - amount * 0.35 ? 2 : 1;
  const weights = ENVIRONMENTS.map((name) => near(h, ENV_MOOD[name].hue, ENV_MOOD[name].width) + 0.02);
  for (let n = 0; n < count; n++) {
    const i = pick(weights, r());
    const most = ENV_MOOD[ENVIRONMENTS[i]].most;
    look.env[i] = r2(Math.min(most, 0.15 + (0.25 + 0.35 * amount) * r() + 0.1 * amount));
    weights[i] = 0;
    // (Its colours from a stream of their own, so the rest of the look is what the seed always gave.)
    look.tones[ENVIRONMENTS[i]] = pickTone(ENVIRONMENTS[i], h, rng(mix(seed, 0x70e5 + i)));
  }

  // The embers' way of moving, as the hue's mood has it.
  const m = MOTION_MOOD[pick(MOTION_MOOD.map((p) => near(h, p.hue, p.width) + 0.03), r())];
  const motion = motionFrom(m.name, r);
  look.agit = r2(Math.min(0.9, (0.1 + 0.5 * r()) * motion.turbulence));
  keepMotion(look, motion, r);
  // Sparks bursting up from a fire now and then, rising and warm only.
  if (motion.rise > 0.5 && near(h, 15, 30) > 0.5 && r() < 0.4) look.burst = r2(0.1 + 0.4 * r());
  return { seed, rolled: 0, hue: Math.round(h), look, motion };
}

/** A motion profile tweaked a little by the seed. */
function motionFrom(name: string, r: () => number): MotionTweak {
  const base = tweakOf(profileOf(name));
  return {
    profile: base.profile,
    speed: r2(0.8 + 0.4 * r()),
    rise: r2(base.rise * (0.8 + 0.4 * r())),
    drift: r2(Math.max(-0.4, Math.min(0.4, base.drift + (r() - 0.5) * 0.1))),
    turbulence: r2(0.75 + 0.5 * r()),
    swirl: r2(base.swirl * (0.8 + 0.4 * r())),
  };
}

/** The look's record of its motion (kept as the zones have them: the motion moves them). */
function keepMotion(look: Look, motion: MotionTweak, r: () => number) {
  look.speed = r2(Math.max(0.25, Math.abs(motion.rise) * motion.speed));
  look.fall = motion.rise < 0 ? r2(Math.min(1, 0.4 - motion.rise)) : 0;
  look.eddy = motion.swirl > 0 ? r2(0.6 + 0.4 * r()) : 0;
}

// ---- the endgame's strata -----------------------------------------------------------

/**
 * What the endgame's strata keep clear of, and how boldly they colour.
 */
export interface Steer {
  /** The looks to stay unlike (the hand-made zones', lib/likeness.ts's signatures): an effect a zone shows takes, near the colours its archetype has for it, those furthest from that zone's. */
  avoid: readonly Signature[];
  /**
   * How much more colourful than the zones' generator, 0 to 1: more
   * saturated smoke whose drifts spread further round the wheel, livelier
   * embers, and each effect's colours in the upper half of its rule's
   * saturation and variation.
   */
  vivid: number;
}

/** Which of an effect's colour stops shows most (ENV_TONES' weights): its colour, as a viewer reads it. */
const mainStop = (name: EnvName) => {
  const w = ENV_TONES[name].weight;
  return w.indexOf(Math.max(...w));
};
/** The hue an effect is seen in: its main stop's. */
const fxHueOf = (name: EnvName, tone: Tone = ENV_TONES[name].tone) => hueOf(stopsOf(tone)[mainStop(name)]).hue;

/**
 * The accents a variant's scheme finds from base hue `h` (Scheme in
 * lib/archetypes.ts), each jittered a little; `fx` the hues of its effects
 * (their own colours).
 */
function accentsOf(v: Variant, h: number, fx: [number, number], r: () => number): [number, number] {
  const jit = () => (r() - 0.5) * 20;
  const side = r() < 0.5 ? -1 : 1;
  switch (v.scheme) {
    case 'complement':
      return [wrap(h + 180 + (v.turn ?? 0) + jit()), wrap(h + side * (25 + 10 * r()))];
    case 'split': {
      const d = v.turn ?? side * 30;
      return [wrap(h + 180 + d + jit()), wrap(h + 180 - d + jit())];
    }
    case 'triad': {
      const d = v.turn ?? side * 120;
      return [wrap(h + d + jit()), wrap(h - d + jit())];
    }
    case 'warm-cold':
      return [wrap((v.from === 'fx2' ? fx[1] : fx[0]) + 0.5 * jit()), wrap(h + side * (25 + 10 * r()))];
  }
}

/**
 * A stratum past the zones from `seed`, as archetype `kind` of
 * lib/archetypes.ts has it (lib/backdrops.ts deals them out), within
 * `settings` (their saturation, darkness, detail and embers; their hue
 * range, if narrowed, pulls the base hue into it), clear of `steer`'s zones
 * and as colourful as it asks:
 *
 * - The palette by its variant's scheme: the base hue in the smoke, its
 *   neighbours on the wheel in the other drifts (as on the start page),
 *   and the accents the scheme finds (complementary, split-complementary,
 *   a muted triad, or an effect's own warm colour against cold smoke)
 *   given to the light from below, the haze, the glow or the high smoke,
 *   as the variant has it. Muted and dark, the start page's values.
 * - Its effects, its first always and its second as often as the
 *   archetype pairs them, each from EFFECT_FLOOR to at most EFFECT_CEILING
 *   (the mist under MIST_CEILING), in colours turned toward the hue the
 *   archetype points it at, within its kind's rules (pickTone).
 * - Its embers in the archetype's colour, moving one of its ways, as
 *   restless, many and bursting as its character has it.
 *
 * Pure and seeded. Its lightK is 1 (calibrateLight in lib/descent.ts).
 */
export function generateStratum(seed: number, settings: GenSettings, kind: number, steer: Steer): Generated {
  const a = ARCHETYPES[((kind % ARCHETYPES.length) + ARCHETYPES.length) % ARCHETYPES.length];
  const r = rng(seed);
  const vivid = clamp01(steer.vivid);
  const variant = Math.floor(r() * a.variants.length);
  const vr = a.variants[variant];

  // The base hue, within the variant's window (and the settings' range, where narrowed).
  let h = wrap(vr.hue[0] + wrap(vr.hue[1] - vr.hue[0]) * r());
  if (hueSpan(settings) < 360) h = hueAt(settings, placeOf(settings, h));
  const s0 = lerp(settings.sat[0], settings.sat[1], r()) * (vr.sat ?? 1);
  const s = Math.min(0.92, s0 + (0.95 - s0) * 0.5 * vivid * (vr.sat ?? 1));
  const dk = clamp01(settings.darkness + a.dark + (r() - 0.5) * 0.16);
  const own: [number, number] = [fxHueOf(a.fx[0].env), fxHueOf(a.fx[1].env)];
  const [a1, a2] = accentsOf(vr, h, own, r);
  const triad = vr.scheme === 'triad';

  // The effects first (their colours read the hues the palette is built on).
  const count = r() < a.pair ? 2 : 1;
  const amount = clamp01(settings.detail);
  const env = ENVIRONMENTS.map(() => 0);
  const tones: Look['tones'] = {};
  const fxHue: [number, number] = [...own];
  const hueFor = (ref: HueRef): number =>
    ref === 'base' ? h : ref === 'a1' ? a1 : ref === 'a2' ? a2 : ref === 'fx1' ? fxHue[0] : ref === 'fx2' ? fxHue[1] : 'off' in ref ? wrap(h + ref.off) : ref.at;
  const strengths = a.fx.map((e) => {
    const most = e.env === 'mist' ? MIST_CEILING : EFFECT_CEILING;
    return r2(Math.min(most, e.strength[1], Math.max(EFFECT_FLOOR, lerp(e.strength[0], e.strength[1], clamp01(0.7 * r() + 0.3 * amount)))));
  });
  for (let n = 0; n < count; n++) {
    const e = a.fx[n];
    const i = ENVIRONMENTS.indexOf(e.env);
    env[i] = strengths[n];
    // (Its colours from a stream of their own, so the rest of the look is what the seed always gave.)
    tones[e.env] = pickTone(e.env, hueFor(e.toward), rng(mix(seed, 0x70e5 + i)), { avoid: steer.avoid, sat: e.sat, bold: vivid });
    fxHue[n] = fxHueOf(e.env, tones[e.env]);
  }

  // The palette.
  const isAccent = (ref: HueRef) => ref !== 'base' && !(typeof ref === 'object' && 'off' in ref && Math.abs(ref.off) <= 45);
  const spread = (14 + 18 * r()) * (1 + 0.3 * vivid);
  const side = r() < 0.5 ? -1 : 1;
  const v = lerp(0.66, 0.44, dk) * (0.92 + 0.16 * r());
  const smoke = hsv(h, s, v);
  const smokeB = hsv(h - side * spread * (0.5 + 0.5 * r()), Math.min(0.92, s * (0.9 + 0.15 * r())), v * 0.8);
  const smokeHi = hsv(h + side * spread * (0.3 + 0.5 * r()), s * 0.62, v * 0.95);
  const smokeHiB = hsv(hueFor(vr.hiB) + (r() - 0.5) * 10, s * (isAccent(vr.hiB) ? (triad ? 0.45 : 0.55) : 0.6), v * 0.75);
  const floorS = isAccent(vr.floor) ? Math.min(0.85, Math.max(0.45, s) * (triad ? 0.75 : 0.95)) : Math.min(0.92, s * 1.08);
  const floor = hsv(hueFor(vr.floor) + (r() - 0.5) * 10, floorS, lerp(0.72, 0.52, dk));
  const haze = hsv(hueFor(vr.haze) + (r() - 0.5) * 16, Math.min(0.7, Math.max(0.3, s) * (isAccent(vr.haze) ? 0.6 : 0.55)), lerp(0.58, 0.36, dk));
  const glow = hsv(hueFor(vr.glow) + (r() - 0.5) * 12, Math.min(0.6, Math.max(0.3, s) * 0.5), lerp(0.86, 0.66, dk));
  const mist = hsv(h, s, lerp(0.48, 0.32, dk));
  const tint = hsv(h, 1, 1);

  // The embers: the archetype's colour, bright; their core near white.
  const eh = hueFor(a.ember.hue) + (r() - 0.5) * 16;
  const es = lerp(a.ember.sat[0], a.ember.sat[1], r());
  const ember = hsv(eh, es, 1);
  const core = hsv(eh, Math.min(es, 0.08 + 0.18 * r()), 1);
  let accent = hsv(eh, Math.min(0.55, Math.max(0.3, es * 0.7)), 1);
  if (luma(accent) < 0.55) accent = hsv(eh, 0.3, 1);

  const look: Look = {
    shade: tint.map((c) => r2(0.74 + 0.34 * c)) as RGB,
    dark: r2(Math.min(0.75, Math.max(0.1, lerp(0.32, 0.68, dk) + (r() - 0.5) * 0.08))),
    floor: to255(floor),
    floorK: r2(0.28 + 0.16 * r()),
    floorH: r2(1 + 0.3 * r()),
    haze: to255(haze),
    hazeK: r2(lerp(a.hazeK[0], a.hazeK[1], r())),
    glow: to255(glow),
    lamp: r2(0.4 + 0.3 * r()),
    smoke: to255(smoke),
    smokeB: to255(smokeB),
    smokeHi: to255(smokeHi),
    smokeHiB: to255(smokeHiB),
    smokeK: r2(Math.min(2.1, Math.max(0.8, lerp(1.2, 1.7, dk) + a.dense + (r() - 0.5) * 0.1))),
    shadowK: r2(lerp(1.15, 1.55, dk)),
    mist: to255(mist),
    mistK: round(0.05 + 0.03 * r(), 0.005),
    ember: to1(ember),
    core: to1(core),
    coreMix: r2(0.5 + 0.25 * r()),
    crowd: r2(clamp01(settings.embers + a.crowd + (r() - 0.5) * 0.3)),
    speed: 1,
    size: r2(0.75 + 0.6 * r()),
    bright: r2(0.9 + 0.1 * vivid + 0.35 * r()),
    agit: 0,
    fall: 0,
    glint: [1, 1, 1],
    glints: 0,
    spread: 0,
    burst: 0,
    eddy: 0,
    env,
    tones,
    accent: to255(accent),
    lightK: 1,
  };

  // Glints now and then, in the embers' colour or the first accent.
  look.glint = to1(hsv((r() < 0.5 ? eh : a1) + (r() - 0.5) * 20, 0.4 + 0.3 * r(), 1));
  if (r() < 0.5) {
    look.glints = r2(0.2 + 0.4 * r());
    look.spread = r2(0.7 * r());
  }

  // The embers' way of moving, one of the archetype's; as restless as it is.
  const motion = motionFrom(a.motion[Math.floor(r() * a.motion.length)], r);
  look.agit = r2(Math.min(0.9, lerp(a.agit[0], a.agit[1], r()) * motion.turbulence));
  keepMotion(look, motion, r);
  if (a.burst && motion.rise > 0.5) look.burst = r2(lerp(a.burst[0], a.burst[1], r()));
  return { seed, rolled: 0, hue: Math.round(h), look, motion, kind: a.kind, scheme: vr.scheme };
}

/** The signed turn (degrees, -180 to 180) from hue `a` to hue `b`. */
const turnTo = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/** How the endgame picks an effect's colours (pickTone). */
export interface ToneAim {
  /** The zones' signatures: where one shows the effect, its colours are kept from theirs. */
  avoid: readonly Signature[];
  /** Where in the rule's saturation range (0 its least, 1 its most). */
  sat: [number, number];
  /** How bold (Steer's vivid): the variation in the upper half of its rule's range. */
  bold: number;
}

/**
 * Colours for environment `name` turned toward hue `hue`, within its kind's
 * rules (ENV_TONES in lib/backdropData.ts). Each stop keeps its own value,
 * so a magma's white heat stays white hot and a frost's thick rime stays
 * white.
 *
 * The zones' generator: its own colours turned half way toward the hall's
 * hue as far as its rule allows, and half way to a turn of its own within
 * that; their saturation and variation anywhere in the rule's ranges.
 *
 * The endgame's (`aim`): turned toward `hue` as far as the rule allows,
 * jittered a little; the saturation where the archetype puts it; and where
 * a zone shows the effect, of the turns near that one the one whose
 * colours lie furthest from that zone's (a void in a green hall, say, where
 * the Abyssal City has its green one), so it keeps its mood but not the
 * zone's look.
 */
export function pickTone(name: EnvName, hue: number, r: () => number, aim?: ToneAim): Tone {
  const rule = ENV_TONES[name];
  const own = stopsOf(rule.tone);
  const [lo, hi] = rule.turn;
  const clampTurn = (t: number) => Math.min(hi, Math.max(lo, t));
  const toward = clampTurn(turnTo(hueOf(own[1]).hue, hue));
  const make = (t: number, sat: number) =>
    own.map((c, k) => {
      const { hue: h, sat: s } = hueOf(c);
      const v = Math.max(...c) / 255;
      return to255(hsv(h + t * rule.follow[k], Math.min(1, s * sat), v));
    });
  if (!aim) {
    const turn = 0.5 * toward + 0.5 * lerp(lo, hi, r());
    const sat = lerp(rule.sat[0], rule.sat[1], r());
    const vary = r2(lerp(rule.vary[0], rule.vary[1], r()));
    return { colors: make(turn, sat), vary };
  }
  const bold = clamp01(aim.bold);
  let turn = clampTurn(toward + (r() - 0.5) * Math.min(24, 0.3 * (hi - lo)));
  const sat = lerp(rule.sat[0], rule.sat[1], lerp(aim.sat[0], aim.sat[1], r()));
  const vary = r2(lerp(rule.vary[0], rule.vary[1], lerp(0, 0.5, bold) + lerp(1, 0.5, bold) * r()));
  const i = ENVIRONMENTS.indexOf(name);
  const theirs = aim.avoid.filter((z) => z.fx[i] > 0).map((z) => z.fxTone[i]!);
  if (theirs.length) {
    // The turns near it (up to 30 degrees either way, within the rule), the nearer the better.
    const t0 = turn;
    let best = -Infinity;
    for (const d of [0, -15, 15, -30, 30]) {
      const t = clampTurn(t0 + d);
      const lch: LCh[] = make(t, sat).map((c) => lchOf(c));
      const far = Math.min(...theirs.map((z) => toneDistance(i, lch, z)));
      const score = far - 0.4 * (Math.abs(t - t0) / 180) + 0.01 * r();
      if (score > best) {
        best = score;
        turn = t;
      }
    }
  }
  return { colors: make(turn, sat), vary };
}

/** The groups of a look's fields the tool locks (lib/backdropData.ts's FIELDS), each a list of keys. */
export const GROUP_KEYS: Record<Group, (keyof Look)[]> = {
  light: ['shade', 'dark', 'floor', 'floorK', 'floorH', 'glow', 'lamp', 'accent'],
  smoke: ['smoke', 'smokeB', 'smokeHi', 'smokeHiB', 'smokeK', 'shadowK'],
  haze: ['haze', 'hazeK', 'mist', 'mistK'],
  embers: ['ember', 'core', 'coreMix', 'crowd', 'size', 'bright', 'agit', 'burst', 'speed', 'fall'],
  glints: ['glint', 'glints', 'spread'],
  details: ['env', 'tones', 'eddy'],
};

/** `next`, but with the groups in `locked` (and the motion, if locked) kept from `current`. */
export function keepLocked(next: { look: Look; motion: MotionTweak }, current: { look: Look; motion: MotionTweak }, locked: ReadonlySet<Group | 'motion'>) {
  const look = { ...next.look };
  for (const [group, keys] of Object.entries(GROUP_KEYS) as [Group, (keyof Look)[]][]) {
    if (!locked.has(group)) continue;
    for (const key of keys) {
      const v = current.look[key];
      (look as unknown as Record<string, unknown>)[key] = Array.isArray(v) ? [...v] : v;
    }
  }
  return { look, motion: locked.has('motion') ? { ...current.motion } : next.motion };
}

/** A look's palette in a few colours (CSS), for a swatch: the smoke's four, the light from below, the haze, the embers. */
export function swatchOf(look: Look): { smoke: string[]; floor: string; haze: string; ember: string } {
  const css = (c: readonly number[], k = 1) => `rgb(${c.map((v) => Math.round(v * k)).join(' ')})`;
  return {
    smoke: [look.smoke, look.smokeB, look.smokeHi, look.smokeHiB].map((c) => css(c)),
    floor: css(look.floor),
    haze: css(look.haze),
    ember: css(look.ember, 255),
  };
}

