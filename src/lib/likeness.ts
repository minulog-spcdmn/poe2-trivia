// How alike two of Delve's backdrops look to a viewer: a difference from 0
// (the same) to 1 (nothing in common), so the endgame's generated strata can
// be kept clearly unlike the hand-made zones and unlike the stratum before
// (lib/backdrops.ts, endgameAt), and the backdrop tool can show how near a
// stratum comes to its nearest zone.
//
// What a viewer reads a backdrop by, most strongly first:
//
// - Its effects (EFFECTS, 0.35 of the whole): which of the environments show
//   and how strongly. A void with violet eddies reads as the Abyssal Depths
//   whatever else changes, so the effect set weighs most. Compared as a
//   weighted overlap (1 less the shared presence over the combined), where
//   an effect both show counts as less shared the further apart its colours
//   are (a green void is still a void, so its colours take at most 70% of
//   the overlap away).
// - Its dominant colour (DOMINANT, 0.22): the four smoke drifts' mean, the
//   bulk of the screen.
// - Its palette (PALETTE, 0.15): the smoke's four hues, the light from below,
//   the haze and the glow, each matched to the nearest of the other's.
// - Its embers (EMBERS, 0.08 their colour, MOTION 0.1 how they move: up or
//   down, round the eddies, how restless, how many, glints and bursts).
// - Its overall brightness (BRIGHTNESS, 0.1): its smoke, its light from below
//   and how much of it the dark swallows (the scene's light is kept to one
//   curve whatever the look, lib/descent.ts, so this weighs little).
//
// Colours are compared in OKLab, made to match how far apart colours look:
// its lightness L and, round its colour wheel, the chroma C (how vivid: its
// saturation and brightness together) and the hue h, so the difference is
// ΔE² = ΔL² + ΔC² + (HUE·ΔH)², ΔH = 2·√(C₁C₂)·sin(Δh/2): the circular hue
// distance weighted by how vivid both colours are (two greys differ by their
// lightness alone, two vivid colours a wheel apart by the most). In a dark
// hall the hue is what reads, so ΔH counts HUE (1.5) times. 0.2 of it is
// all the difference a colour can make (an orange smoke against a blue).
//
// Pure, and cheap: a look's signature (signatureOf) is worked out once, and
// comparing two is a few dozen colour differences.

import { ENV, ENV_TONES, ENVIRONMENTS, stopsOf, toneOf, type Look, type MotionTweak } from './backdropData.ts';

/** A backdrop as compared: its look and its embers' motion. */
export interface Backdrop {
  look: Look;
  motion: MotionTweak;
}

/** A colour in OKLCh: lightness (0 to 1), chroma (0 to about 0.32) and hue (radians). */
export type LCh = [number, number, number];

/** What a backdrop is compared by, worked out once (signatureOf). */
export interface Signature {
  /** The smoke's mean colour. */
  dominant: LCh;
  /**
   * The hue of its smoke on the generator's wheel (HSV, degrees) and how
   * vivid the smoke is (its OKLCh chroma): the generator's cue to which
   * zone a hue belongs (lib/backdropGen.ts, kinship).
   */
  wheel: number;
  chroma: number;
  /** The palette: the four smoke drifts, the light from below, the haze, the glow; and how much each shows. */
  palette: LCh[];
  paletteW: number[];
  /** How much each environment shows (0 to 1, by ENVIRONMENTS), and its colours (three stops) where it shows. */
  fx: number[];
  fxTone: (LCh[] | null)[];
  /** The embers' halo. */
  ember: LCh;
  /** How the embers move, each 0 to 1 (see motionFeatures). */
  motion: number[];
  profile: string;
  /** Its overall brightness, about 0 to 1. */
  bright: number;
}

// ---- weights -----------------------------------------------------------------

export const EFFECTS = 0.35;
export const DOMINANT = 0.22;
export const PALETTE = 0.15;
export const EMBERS = 0.08;
export const MOTION = 0.1;
export const BRIGHTNESS = 0.1;
/** How much more a hue difference counts than one of lightness or chroma. */
const HUE = 1.5;
/** The colour difference (ΔE, as above) that counts as all the difference a colour can make. */
const FULL = 0.2;
/** How much of an effect's overlap its colours can take away. */
const TONE_SHARE = 0.7;

/**
 * The least difference a generated stratum keeps from every hand-made zone
 * and from the stratum before it (lib/backdrops.ts, endgameAt), so that it
 * reads as a hall of its own:
 *
 * - The zones, as shipped, differ pairwise by 0.52 to 0.96; the two most
 *   alike (the Fungal Caverns and the Vaal Outpost, two muted olive halls
 *   the user made as separate biomes) by 0.52. So 0.5 asks a generated
 *   stratum to stand as far from every zone as the zones stand from each
 *   other at their closest.
 * - What a viewer would still call the same hall comes out under it: a zone
 *   recoloured by 30 degrees (0.16 to 0.53, typically 0.26) or by 60
 *   (typically 0.37), or with all its effects taken away (0.35). A quarter
 *   turn of hue with the same effects only just reaches it (typically
 *   0.51): it takes a new hue and a new set of effects, or one of them
 *   and different embers and light besides.
 * - The generator reaches it without strain: each stratum an archetype
 *   of its own effects (lib/archetypes.ts), none sharing an effect with
 *   the one before, about one stratum in fifteen needs a re-roll and none
 *   more than a few (tests/likeness.test.ts).
 *
 * It is a fixed bar, not one worked out from the zones: zones retuned to
 * look alike would otherwise lower it for every stratum.
 */
export const UNLIKE = 0.5;

// ---- colour ------------------------------------------------------------------

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** A colour (channels 0 to `scale`) in OKLCh. */
export function lchOf(c: readonly number[], scale = 255): LCh {
  const r = lin(Math.min(1, Math.max(0, c[0] / scale)));
  const g = lin(Math.min(1, Math.max(0, c[1] / scale)));
  const b = lin(Math.min(1, Math.max(0, c[2] / scale)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** How far apart two colours look, 0 to 1 (ΔE over FULL; see the top). */
export function colourDistance(x: LCh, y: LCh): number {
  const dL = x[0] - y[0];
  const dC = x[1] - y[1];
  const dH = 2 * Math.sqrt(x[1] * y[1]) * Math.sin((x[2] - y[2]) / 2);
  return Math.min(1, Math.hypot(dL, dC, HUE * dH) / FULL);
}

/** The mean of colours in OKLab (weights `w`), back in OKLCh. */
function meanOf(cs: LCh[], w: number[]): LCh {
  let L = 0;
  let A = 0;
  let B = 0;
  let total = 0;
  cs.forEach((c, i) => {
    L += w[i] * c[0];
    A += w[i] * c[1] * Math.cos(c[2]);
    B += w[i] * c[1] * Math.sin(c[2]);
    total += w[i];
  });
  return [L / total, Math.hypot(A, B) / total, Math.atan2(B, A)];
}

/** The hue (HSV, degrees) of colours' mean (0-255 each, weights `w`). */
function wheelHue(cs: readonly (readonly number[])[], w: number[]): number {
  const [r, g, b] = [0, 1, 2].map((k) => cs.reduce((s, c, i) => s + w[i] * c[k], 0));
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d <= 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// ---- signatures ----------------------------------------------------------------

/** How much an environment at strength `e` shows (0 to 1): a faint one already shows, a strong one no more than fully. */
export const presence = (e: number) => (e > 0 ? Math.sqrt(Math.min(1, e / 0.8)) : 0);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** How the embers move: rising or sinking, drawn round the eddies, restless, many, glinting, bursting (each 0 to 1). */
function motionFeatures(look: Look, m: MotionTweak): number[] {
  return [
    (Math.tanh(1.5 * m.rise) + 1) / 2,
    clamp01(m.swirl),
    clamp01((m.turbulence * m.speed) / 2),
    clamp01(look.crowd),
    clamp01(look.glints),
    clamp01(look.burst),
    (m.drift / 0.4 + 1) / 2,
  ];
}
/** How much each of motionFeatures counts. */
const MOTION_W = [0.4, 0.2, 0.12, 0.08, 0.08, 0.07, 0.05];

/** What a backdrop is compared by. */
export function signatureOf({ look, motion }: Backdrop): Signature {
  const smokes = [look.smoke, look.smokeB, look.smokeHi, look.smokeHiB].map((c) => lchOf(c));
  const dominant = meanOf(smokes, [0.3, 0.3, 0.2, 0.2]);
  const floor = lchOf(look.floor);
  const palette = [...smokes, floor, lchOf(look.haze), lchOf(look.glow)];
  const paletteW = [1, 1, 0.8, 0.8, clamp01(look.floorK / 0.3), 0.6 * clamp01(look.hazeK / 0.6), 0.5 * clamp01(look.lamp)];
  const fx = look.env.map(presence);
  const fxTone = fx.map((p, i) => (p > 0 ? stopsOf(toneOf(look, i)).map((c) => lchOf(c)) : null));
  const meanL = (smokes[0][0] + smokes[1][0] + smokes[2][0] + smokes[3][0]) / 4;
  return {
    dominant,
    wheel: wheelHue([look.smoke, look.smokeB, look.smokeHi, look.smokeHiB], [0.3, 0.3, 0.2, 0.2]),
    chroma: dominant[1],
    palette,
    paletteW,
    fx,
    fxTone,
    ember: lchOf(look.ember, 1),
    motion: motionFeatures(look, motion),
    profile: motion.profile,
    bright: 0.5 * meanL + 0.25 * floor[0] * clamp01(look.floorK / 0.35) + 0.25 * (1 - look.dark),
  };
}

// ---- comparing -----------------------------------------------------------------

/** How far apart two colour ranges of environment `i` look (0 to 1): stop by stop, as much as each stop shows. */
export function toneDistance(i: number, a: LCh[], b: LCh[]): number {
  const w = ENV_TONES[ENVIRONMENTS[i]].weight;
  return w[0] * colourDistance(a[0], b[0]) + w[1] * colourDistance(a[1], b[1]) + w[2] * colourDistance(a[2], b[2]);
}

/** How unlike two effect sets look (0 to 1): the weighted overlap, less where a shared effect's colours differ. */
export function effectsDistance(a: Signature, b: Signature): number {
  let shared = 0;
  let all = 0;
  for (let i = 0; i < ENV; i++) {
    const pa = a.fx[i];
    const pb = b.fx[i];
    if (pa <= 0 && pb <= 0) continue;
    all += Math.max(pa, pb);
    if (pa > 0 && pb > 0) shared += Math.min(pa, pb) * (1 - TONE_SHARE * toneDistance(i, a.fxTone[i]!, b.fxTone[i]!));
  }
  return all > 0 ? 1 - shared / all : 0;
}

/** How unlike two palettes look (0 to 1): each colour against the nearest of the other's, as much as each shows. */
function paletteDistance(a: Signature, b: Signature): number {
  const half = (x: Signature, y: Signature) => {
    let sum = 0;
    let total = 0;
    x.palette.forEach((c, i) => {
      const w = x.paletteW[i];
      if (w <= 0) return;
      let best = 1;
      y.palette.forEach((d, j) => {
        if (y.paletteW[j] > 0) best = Math.min(best, colourDistance(c, d));
      });
      sum += w * best;
      total += w;
    });
    return total > 0 ? sum / total : 0;
  };
  return (half(a, b) + half(b, a)) / 2;
}

/** How unlike the embers' ways of moving look (0 to 1). */
function motionDistance(a: Signature, b: Signature): number {
  let sum = 0;
  for (let i = 0; i < MOTION_W.length; i++) sum += MOTION_W[i] * Math.abs(a.motion[i] - b.motion[i]);
  return Math.min(1, 0.25 * (a.profile === b.profile ? 0 : 1) + sum);
}

/** Each part of the difference (0 to 1 each), before weighing. */
export function parts(a: Signature, b: Signature) {
  return {
    effects: effectsDistance(a, b),
    dominant: colourDistance(a.dominant, b.dominant),
    palette: paletteDistance(a, b),
    embers: colourDistance(a.ember, b.ember),
    motion: motionDistance(a, b),
    brightness: Math.min(1, Math.abs(a.bright - b.bright) / 0.25),
  };
}

/** How unlike two backdrops look, 0 (the same) to 1 (nothing in common). */
export function difference(a: Signature, b: Signature): number {
  const p = parts(a, b);
  return EFFECTS * p.effects + DOMINANT * p.dominant + PALETTE * p.palette + EMBERS * p.embers + MOTION * p.motion + BRIGHTNESS * p.brightness;
}

/** How alike they look (1 the same): 1 less their difference. */
export const similarity = (a: Signature, b: Signature) => 1 - difference(a, b);

/** The nearest of `others` to `sig` (its index), and how far it is. */
export function nearest(sig: Signature, others: readonly Signature[]): { index: number; difference: number } {
  let index = -1;
  let best = Infinity;
  others.forEach((o, i) => {
    const d = difference(sig, o);
    if (d < best) {
      best = d;
      index = i;
    }
  });
  return { index, difference: best };
}
