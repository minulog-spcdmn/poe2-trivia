// Backdrops made up: a stratum's look and its embers' motion, generated from
// a seed within tasteful bounds, so whatever comes out keeps to the start
// page's style: a smooth gradient with soft drifting smoke and light,
// embers, and at most a quiet detail or two. Only the backdrop's own
// parameters are generated (lib/backdropData.ts: the colours and strengths
// of a look, how much of each environment the backdrop already draws, a
// motion profile tweaked); nothing new is drawn.
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
// - For the endgame, steered clear of the hand-made zones (Steer): the
//   effects a zone of a kindred hue is known for, and its embers' way of
//   moving, come up less; a second effect a zone already pairs with the
//   first comes up less; an effect a zone shows takes the colours furthest
//   from that zone's its rule allows; and the palette is bolder than the
//   zones'. lib/backdrops.ts re-rolls what still comes out too alike, as
//   lib/likeness.ts measures it.
//
// Pure and seeded: the same seed and settings always give the same backdrop
// (the endgame's strata are the same for everyone, see lib/backdrops.ts).

import { ENV_TONES, ENVIRONMENTS, stopsOf, type EnvName, type GenSettings, type Group, type Look, type MotionTweak, type RGB, type Tone } from './backdropData.ts';
import { profileOf, tweakOf } from './emberProfiles.ts';
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
function mix(a: number, b: number): number {
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

// ---- steering clear of the zones ------------------------------------------------

/**
 * What the endgame's generator keeps clear of, and how boldly it colours.
 * Without it, generate is the zones' generator (the tool's) as it always
 * was.
 */
export interface Steer {
  /** The looks to stay unlike (the hand-made zones', lib/likeness.ts's signatures). */
  avoid: readonly Signature[];
  /**
   * How much more colourful than the zones' generator, 0 to 1: more
   * saturated smoke whose drifts spread further round the wheel, livelier
   * embers, and each detail's colours drawn from the whole of its rule's
   * ranges rather than mostly toward the hall's hue.
   */
  vivid: number;
}

/**
 * How much a hall of hue `h` is kin to each zone to avoid (0 to 1): near
 * its smoke's hue, and as much as that smoke is coloured at all (a grey
 * zone, the Petrified Forest, is known by its details, not its hue).
 */
const kinship = (h: number, avoid: readonly Signature[]) => avoid.map((z) => near(h, z.wheel, 40) * Math.min(1, z.chroma / 0.05));

/**
 * The environments' weights for a hall of hue `h` steered clear of the
 * zones: an effect a zone of a kindred hue is known for weighs much less
 * (magma in a red hall would read as the Magma Fissure), and the void,
 * which takes any hue, and the fog are always a little to hand to change a
 * hall's character.
 */
function steeredWeights(h: number, steer: Steer, kin: number[]) {
  return ENVIRONMENTS.map((name, i) => {
    let w = near(h, ENV_MOOD[name].hue, ENV_MOOD[name].width) + (name === 'void' ? 0.08 : name === 'mist' ? 0.04 : 0.03);
    steer.avoid.forEach((z, j) => (w *= 1 - 0.9 * kin[j] * z.fx[i]));
    return Math.max(w, 0.002);
  });
}

/** After picking environment `first`: the others weighed less as zones already pair them with it (a combination no zone uses is favoured). */
function pairWeights(weights: number[], first: number, steer: Steer) {
  for (const z of steer.avoid) if (z.fx[first] > 0) weights.forEach((w, j) => (weights[j] = w * (1 - 0.7 * z.fx[j] * z.fx[first])));
}

// ---- the generator ---------------------------------------------------------------

/**
 * A backdrop from `seed`, within `settings`: its base hue `place` (0 to 1)
 * of the way through the settings' hue range, or where the seed puts it.
 * Its lightK is 1: how bright its hall is lit is worked out where it is
 * shown (calibrateLight in lib/descent.ts).
 */
export function generate(seed: number, settings: GenSettings, place?: number, steer?: Steer): Generated {
  const r = rng(seed);
  const own = r();
  const h = hueAt(settings, place ?? own);
  const vivid = clamp01(steer?.vivid ?? 0);
  // (Bolder: a third of the way on to nearly full saturation; never neon, as the values stay the start page's.)
  const s0 = lerp(settings.sat[0], settings.sat[1], r());
  const s = Math.min(0.92 + 0.03 * vivid, s0 + (0.95 - s0) * 0.35 * vivid);
  const dk = clamp01(settings.darkness + (r() - 0.5) * 0.2);
  const kin = steer ? kinship(h, steer.avoid) : [];

  // The smoke: the base hue and its neighbours, the high drifts paler.
  const spread = (14 + 22 * r()) * (1 + 0.3 * vivid);
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
  const es = lerp(0.45, 0.6, vivid) + lerp(0.45, 0.35, vivid) * r();
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
    bright: r2(0.9 + 0.1 * vivid + 0.35 * r()),
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
  const weights = steer ? steeredWeights(h, steer, kin) : ENVIRONMENTS.map((name) => near(h, ENV_MOOD[name].hue, ENV_MOOD[name].width) + 0.02);
  for (let n = 0; n < count; n++) {
    const i = pick(weights, r());
    const most = ENV_MOOD[ENVIRONMENTS[i]].most;
    look.env[i] = r2(Math.min(most, 0.15 + (0.25 + 0.35 * amount) * r() + 0.1 * amount));
    weights[i] = 0;
    if (steer) pairWeights(weights, i, steer);
    // (Its colours from a stream of their own, so the rest of the look is what the seed always gave.)
    look.tones[ENVIRONMENTS[i]] = pickTone(ENVIRONMENTS[i], h, rng(mix(seed, 0x70e5 + i)), steer);
  }

  // The embers' way of moving, as the hue's mood has it (steered: not as a zone of a kindred hue moves them).
  const moods = MOTION_MOOD.map((p) => {
    let w = near(h, p.hue, p.width) + 0.03;
    steer?.avoid.forEach((z, j) => (w *= z.profile === p.name ? 1 - 0.8 * kin[j] : 1));
    return w;
  });
  const m = MOTION_MOOD[pick(moods, r())];
  const base = tweakOf(profileOf(m.name));
  const motion: MotionTweak = {
    profile: base.profile,
    speed: r2(0.8 + 0.4 * r()),
    rise: r2(base.rise * (0.8 + 0.4 * r())),
    drift: r2(Math.max(-0.4, Math.min(0.4, base.drift + (r() - 0.5) * 0.1))),
    turbulence: r2(0.75 + 0.5 * r()),
    swirl: r2(base.swirl * (0.8 + 0.4 * r())),
  };
  look.agit = r2(Math.min(0.9, (0.1 + 0.5 * r()) * motion.turbulence));
  // (Kept for the record, as the zones have them: the motion moves them.)
  look.speed = r2(Math.max(0.25, Math.abs(motion.rise) * motion.speed));
  look.fall = motion.rise < 0 ? r2(Math.min(1, 0.4 - motion.rise)) : 0;
  look.eddy = motion.swirl > 0 ? r2(0.6 + 0.4 * r()) : 0;
  // Sparks bursting up from a fire now and then, rising and warm only.
  if (motion.rise > 0.5 && near(h, 15, 30) > 0.5 && r() < 0.4) look.burst = r2(0.1 + 0.4 * r());
  return { seed, rolled: 0, hue: Math.round(h), look, motion };
}

/** The signed turn (degrees, -180 to 180) from hue `a` to hue `b`. */
const turnTo = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Colours for environment `name` in a hall of hue `hue`, within its kind's
 * rules (ENV_TONES in lib/backdropData.ts): its own colours turned toward
 * the hall's hue as far as its rule allows, and half way to a turn of its
 * own within that; their saturation scaled and their variation picked
 * within the rule's ranges. Each stop keeps its own value, so a magma's
 * white heat stays white hot and a frost's thick rime stays white.
 *
 * Steered (the endgame's), bolder and clear of the zones: the turn, the
 * saturation and the variation range over the whole of the rule (the
 * saturation and variation in its upper half), and where a zone shows the
 * effect, the turn is the one of a few across the rule's range whose
 * colours lie furthest from that zone's (a void in a green hall, say,
 * where the Abyssal City has its green one), the hall's hue breaking ties.
 */
export function pickTone(name: EnvName, hue: number, r: () => number, steer?: Steer): Tone {
  const rule = ENV_TONES[name];
  const own = stopsOf(rule.tone);
  const [lo, hi] = rule.turn;
  const toward = Math.min(hi, Math.max(lo, turnTo(hueOf(own[1]).hue, hue)));
  const bold = clamp01(steer?.vivid ?? 0);
  let turn = lerp(0.5, 0.3, bold) * toward + lerp(0.5, 0.7, bold) * lerp(lo, hi, r());
  const sat = lerp(rule.sat[0], rule.sat[1], lerp(0, 0.5, bold) + lerp(1, 0.5, bold) * r());
  const vary = r2(lerp(rule.vary[0], rule.vary[1], lerp(0, 0.5, bold) + lerp(1, 0.5, bold) * r()));
  const make = (t: number) =>
    own.map((c, k) => {
      const { hue: h, sat: s } = hueOf(c);
      const v = Math.max(...c) / 255;
      return to255(hsv(h + t * rule.follow[k], Math.min(1, s * sat), v));
    });
  const i = ENVIRONMENTS.indexOf(name);
  const theirs = steer ? steer.avoid.filter((z) => z.fx[i] > 0).map((z) => z.fxTone[i]!) : [];
  if (theirs.length) {
    // A turn every 30 degrees or so across the rule's range, and the one the hall would have.
    const n = Math.max(2, Math.round((hi - lo) / 30));
    const turns = [turn, ...Array.from({ length: n + 1 }, (_, j) => lerp(lo, hi, j / n))];
    let best = -Infinity;
    for (const t of turns) {
      const lch: LCh[] = make(t).map((c) => lchOf(c));
      const far = Math.min(...theirs.map((z) => toneDistance(i, lch, z)));
      const score = far - 0.15 * (Math.abs(t - toward) / 360) + 0.02 * r();
      if (score > best) {
        best = score;
        turn = t;
      }
    }
  }
  return { colors: make(turn), vary };
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

