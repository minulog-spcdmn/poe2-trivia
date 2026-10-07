// How deep the scene is: Delve's depth turned into what the backdrop, its
// embers and the ambience follow. The descent passes through strata, one
// every ten depths, each a place of its own: the light welling up from
// below, the smoke and its colours, how dark the hall is, what the embers
// burn like and how they move, what glints in the walls, and the features
// the backdrop draws for it alone (the environments: magma veins, frost,
// spore light, shafts of light, ...). The first ten are the zones, each
// named after a Delve biome, their looks kept in src/data/backdrops.json
// (lib/backdrops.ts; the backdrop tool, backdrop.html, edits them).
//
// One place turns into the next gradually, never all at once, over the
// seven depths (TURN_DEPTHS) from a zone's 5th to the next one's 2nd
// (strataAt), on an eased curve: slowly at first, fastest half way,
// settling slowly. A growing share of the embers burns in the next one's
// colour (one in twenty at the zone's 6th depth, three in five at its 9th,
// nineteen in twenty at the next one's 1st), and from its 6th depth the
// next one's light, smoke and features creep in as its own recede (barely
// at its 7th, half way at its 9th, nine tenths as the next is announced).
// So the handover runs on past the boundary into the next zone, whose name
// is still announced at its first depth, and is done as its first question
// is answered: from its 2nd depth it shows alone, until its own turn
// begins at its 5th. Past depth 100 the strata go on for
// ever, each one of the archetypes (lib/archetypes.ts) generated from a
// seed of its own (lib/backdropGen.ts, the same for everyone), never the
// same archetype twice in a row, and each is announced by a name of its
// archetype's own (`endgameName`).
//
// And the deeper, the darker, never the other way: the dark draws in from
// the edges a little with every depth, and the scene's light is set (`light`,
// see the luminance estimate below) so its average brightness only ever
// falls, however bright a stratum's fire or gold, generated or not (past
// the zones it may lift a little, never by a jump: brighterAt). Each new
// depth sinks the scene a little further as its cards are dealt (plunge).
// Pure, apart from the eased channel and the plunge at the bottom that the
// backdrop reads.

import { emberTurn, ENV, ENVIRONMENTS, HALL_FROM, hallTurn, toneGain, toneOf, TURN_DEPTHS, type Look, type RGB, type Tone } from './backdropData.ts';
import { endgameAt, endgameName, onBackdrops, zones } from './backdrops.ts';

export { emberTurn, ENV, ENVIRONMENTS, HALL_FROM, hallTurn, toneOf, TURN_DEPTHS, type Look };

/** The magma among the environments (it cools as it goes out; see magmaCooling). */
export const MAGMA = ENVIRONMENTS.indexOf('magma');

/** The usual scene (outside Delve). */
export const SURFACE: Look = {
  shade: [1, 1, 1],
  dark: 0,
  floor: [140, 60, 20],
  floorK: 0.28,
  floorH: 1,
  haze: [120, 95, 60],
  hazeK: 1,
  glow: [201, 164, 92],
  lamp: 1,
  smoke: [150, 70, 25],
  smokeB: [120, 40, 18],
  smokeHi: [140, 110, 60],
  smokeHiB: [110, 80, 45],
  smokeK: 1,
  shadowK: 1,
  mist: [0, 0, 0],
  mistK: 0,
  ember: [1, 0.45, 0.12],
  core: [1, 0.86, 0.6],
  coreMix: 0.55,
  crowd: 0,
  speed: 1,
  size: 1,
  bright: 1,
  agit: 0,
  fall: 0,
  glint: [0.34, 0.62, 1],
  glints: 0,
  spread: 0,
  burst: 0,
  eddy: 0,
  env: ENVIRONMENTS.map(() => 0),
  tones: {},
  accent: [238, 206, 140],
  lightK: 1,
};

/**
 * The zones, depths 1-10, 11-20, ... 91-100, each named after a Delve biome
 * of Path of Exile and announced by it as it begins (the Mines, depths 1 to
 * 10, are where every run starts, so they aren't). Their looks are kept in
 * src/data/backdrops.json (lib/backdrops.ts). Each mixes colours the way the
 * start page does: a few neighbouring hues in its smoke, one in the light
 * from below, another in the haze above and the glow between, so the
 * colours shift as the smoke drifts, rather than one flat tint:
 * - The Mines: the usual hall, its fire below a little stronger, its smoke
 *   a little thicker.
 * - Magma Fissure: vermilion and crimson smoke, wine and sienna above, the
 *   glow of the fissures orange; heavy slow embers, garnet in the walls.
 * - Frozen Hollow: slate-blue and teal smoke, periwinkle above, a pale ice
 *   glow; rime feathering in from every side, the floor too, glinting here
 *   and there, pale light filtering down, a cold mist rolling low over the
 *   floor, snow drifting down.
 * - Fungal Caverns: pale olive and bone smoke in a damp dark; faint teal
 *   bioluminescence breathing low along the walls and the floor, mycelial
 *   threads catching its glow, a spore haze, spores hanging in the air.
 * - Vaal Outpost: gold and amber smoke, sand and terracotta above, dusty
 *   shafts of light from above on carved stone, gold dust sifting down.
 * - Abyssal Depths: violet and indigo smoke, magenta-plum above, a lilac
 *   glow; void coiling in the dark, embers pulled round in its eddies.
 * - Petrified Forest: sage and blue-grey smoke, warm ash and lichen above;
 *   stone trunks in a pale fog that drifts in layers, ash flakes falling.
 * - Sulphur Vents: sulphur and green smoke, ochre and teal above;
 *   yellow-green fumes billowing up from below in columns.
 * - Abyssal City: navy and indigo smoke, a faint teal and violet above,
 *   near black; a few still motes, far cold lights at many depths.
 * - Primeval Ruins: the bottom of the world, orange and blood-red smoke over
 *   soot and smoky brown, white-hot fire roaring below black smoke.
 */
export const STRATA: readonly { name: string; announced: boolean; look: Look }[] = zones;

/** The looks past the last zone, made once each (they are read every frame), their light worked out. */
const deep = new Map<number, Look>();

/**
 * The look of stratum `k` (-1 is the surface, 0 depths 1 to 10, and on for
 * ever). Past the last zone, generated (lib/backdrops.ts), lit to keep to
 * the scene's brightness where it settles (calibrateLight).
 */
export function lookOf(k: number): Look {
  if (k < 0) return SURFACE;
  if (k < STRATA.length) return STRATA[k].look;
  let look = deep.get(k);
  if (look) return look;
  look = { ...endgameAt(k).look };
  look.lightK = calibrateLight(look, k);
  if (deep.size > 256) deep.clear();
  deep.set(k, look);
  return look;
}

/** Stratum `k`'s name: a zone's, or past the last zone its archetype's next name (`endgameName`, none twice in a long while). */
export function stratumName(k: number): string {
  if (k < STRATA.length) return STRATA[Math.max(0, k)].name;
  return endgameName(k);
}

/**
 * How many depths into a stratum its turn into the next begins: 4, so the
 * turn runs from its 5th depth (10k + 5) to the next one's 2nd (10k + 12),
 * TURN_DEPTHS in all.
 */
export const TURN_FROM = 4;

/**
 * The stratum a depth is turning into, and how far (0 to 1, a seventh with
 * every depth; the embers, light, smoke and features follow it eased, see
 * emberTurn and hallTurn): from stratum k's 5th depth (10k + 5) the scene
 * turns into stratum k + 1, and is it at k + 1's 2nd (10k + 12), the depth
 * after k + 1 is announced (10k + 11), once its first question is answered.
 * From there to k + 1's own turn (its 2nd depth to its 5th) it shows k + 1
 * alone, which reads as the turn into k + 2 not yet begun ({ stratum: k + 2,
 * turn: 0 }), as at any settled depth. Through the Mines' first depths (1
 * to 5) it is the Mines alone; below depth 1 (only while the scene eases
 * in) the surface turns into them.
 */
export function strataAt(depth: number): { stratum: number; turn: number } {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  if (d < 1) return { stratum: 0, turn: d };
  const x = d - 1 - TURN_FROM;
  if (x < 0) return { stratum: 1, turn: 0 };
  const k = Math.floor(x / 10);
  const into = x - 10 * k;
  return into < TURN_DEPTHS ? { stratum: k + 1, turn: into / TURN_DEPTHS } : { stratum: k + 2, turn: 0 };
}

/** The first depth stratum `k` shows alone, the turn into it done: its 2nd (depth 1 for the Mines). */
export const settledAt = (k: number) => (k <= 0 ? 1 : 10 * (k - 1) + 1 + TURN_FROM + TURN_DEPTHS);

/** The stratum a depth is named after: 0 for depths 1 to 10, 1 for 11 to 20, ... */
const stratumOf = (depth: number) => Math.max(0, Math.floor((Math.floor(depth) - 1) / 10));

/** The colour the depth is shown in on the header: its stratum's. */
export function accentAt(depth: number): string {
  return `rgb(${(depth >= 1 ? lookOf(stratumOf(depth)) : SURFACE).accent.join(', ')})`;
}

export interface Descent {
  /** 0 at the surface, toward 1: how deep, smoothly (the ambience follows it). */
  deep: number;
  /** The deepest dark, from about depth 50 to 75 (the ambience follows it). */
  abyss: number;
  /** How close the dark has crept in from the edges, 0 to 1: a little more with every depth. */
  close: number;
  /**
   * How bright the scene's light is drawn (1 at the surface and depth 1): set
   * so the scene's average brightness only ever falls with depth (see
   * estimateLuminance and lightAt).
   */
  light: number;
  /** How bright its features burn (1 at the surface; a little less the deeper; see featuresAt). */
  features: number;
  /**
   * How far the CSS backdrop (where WebGL is missing) dims the scene, 0 to 1:
   * a little more with every depth, as luminanceAt falls (its `light` is
   * worked out for the WebGL one's hall alone).
   */
  dim: number;
  /** The stratum the scene is turning into (see strataAt), and how far. */
  stratum: number;
  turn: number;
  /**
   * How far the magma it shows has cooled, 0 to 1 (magmaCooling; the
   * backdrop crusts it over, dims it and stops its flow, and the CSS one
   * dims it by magmaHeat). Through a cross-fade each scene's, as much of
   * each as there is of its magma: a cooled magma fading out stays cooled
   * rather than flaring up to white heat as the scene it fades to has none.
   */
  cool: number;
  /** What the scene looks like: the stratum before and this one, blended. */
  look: Look;
}

/** The depth the azure stratum is announced (the blue streaks begin there). Its embers come in from the five depths before to the one after (emberTurn). */
export const BLUE_FROM = 21;
export const ABYSS_FROM = 50;
export const ABYSS_FULL = 75;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Every key of a look but its tones (blended apart, see mixTones), in one order (worked out once: looks are blended every frame a depth eases in). */
const KEYS = (Object.keys(SURFACE) as (keyof Look)[]).filter((key) => key !== 'tones');
type Fields = Record<string, number | number[]>;

/** A look to write into (see mixInto): a tone of its own for every environment, three stops each. */
function blank(): Look {
  const look = { ...SURFACE };
  for (const key of KEYS) {
    const v = look[key];
    if (Array.isArray(v)) (look as Record<string, unknown>)[key] = [...v];
  }
  look.tones = Object.fromEntries(ENVIRONMENTS.map((name) => [name, { colors: [0, 1, 2].map(() => [0, 0, 0] as RGB), vary: 0 }]));
  return look;
}

/** Channel `c` of stop `k` of a tone (with two stops, the middle half way between), without allocating. */
function stop(tone: Tone, k: number, c: number) {
  const s = tone.colors;
  if (s.length >= 3) return s[k][c];
  return k === 0 ? s[0][c] : k === 2 ? s[1][c] : (s[0][c] + s[1][c]) / 2;
}

/**
 * Writes the colours of `a`'s environments blended `t` of the way to `b`'s
 * into `out` (a blank()): an environment both draw turns from the one's
 * colours to the other's; one only one of them draws keeps that one's all
 * the way, as it comes or goes.
 */
function mixTones(out: Look, a: Look, b: Look, t: number) {
  for (let i = 0; i < ENV; i++) {
    const ta = toneOf(a, i);
    const tb = toneOf(b, i);
    const w = a.env[i] > 0 && !(b.env[i] > 0) ? 0 : b.env[i] > 0 && !(a.env[i] > 0) ? 1 : t;
    const o = out.tones[ENVIRONMENTS[i]]!;
    for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) o.colors[k][c] = stop(ta, k, c) + (stop(tb, k, c) - stop(ta, k, c)) * w;
    o.vary = ta.vary + (tb.vary - ta.vary) * w;
  }
}

/** Writes field `key` of `a` blended `t` of the way to `b` into `o`, without allocating. */
function mixField(o: Fields, a: Fields, b: Fields, key: string, t: number) {
  const x = a[key];
  const y = b[key];
  if (Array.isArray(x)) {
    const arr = o[key] as number[];
    for (let i = 0; i < x.length; i++) arr[i] = x[i] + ((y as number[])[i] - x[i]) * t;
  } else o[key] = x + ((y as number) - x) * t;
}

/** Writes `a` blended `t` of the way to `b` into `out`, without allocating. */
function mixInto(out: Look, a: Look, b: Look, t: number): Look {
  for (const key of KEYS) mixField(out as unknown as Fields, a as unknown as Fields, b as unknown as Fields, key, t);
  out.lightK = mixLight(a.lightK, b.lightK, t);
  mixTones(out, a, b, t);
  return out;
}

/** The light of a hall turning `t` of the way into another's: evenly in proportion (by its log), as the light is eased. */
const mixLight = (a: number, b: number, t: number) => a * Math.pow(b / a, t);

/** Two looks blended, `t` of the way from `a` to `b`. */
export function mixLook(a: Look, b: Look, t: number): Look {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return mixInto(blank(), a, b, t);
}

/** The parts of a look the embers follow, as many of them as burn in the next stratum (emberTurn). */
const EMBER_KEYS = new Set<string>(['ember', 'core', 'coreMix', 'crowd', 'speed', 'size', 'bright', 'agit', 'fall']);
/** Whether each of KEYS is one of them. */
const IS_EMBER = KEYS.map((key) => EMBER_KEYS.has(key));

/**
 * Writes stratum `a` turning `t` of the way into `b` into `out`: the embers
 * follow emberTurn(t); the light, smoke and features hallTurn(t), their
 * colours too (mixTones). Both eased, so nothing turns at a steady rate. An
 * environment the two share stays as it is. A magma that goes out (`a` has
 * it, `b` none) cools first, in step with the hall (magmaCooling), and
 * narrows away only after (1 - h^3 of it still there): so it is seen
 * dimming to dull red and coming to a stop as the next stratum arrives,
 * rather than all but gone by the time it has cooled. A magma that comes
 * in (`b` has it, `a` none) comes late (h^2 of it), its cracks opening from
 * hairlines as it does (env_magma), so it grows in over the handover's
 * second half instead of showing all at once at its start.
 */
function turnInto(out: Look, a: Look, b: Look, t: number): Look {
  const h = hallTurn(t);
  const e = emberTurn(t);
  for (let k = 0; k < KEYS.length; k++) mixField(out as unknown as Fields, a as unknown as Fields, b as unknown as Fields, KEYS[k], IS_EMBER[k] ? e : h);
  out.lightK = mixLight(a.lightK, b.lightK, h);
  for (let i = 0; i < ENV; i++) out.env[i] = Math.max(a.env[i] + (b.env[i] - a.env[i]) * h, Math.min(a.env[i], b.env[i]));
  if (a.env[MAGMA] > 0 && !(b.env[MAGMA] > 0)) out.env[MAGMA] = a.env[MAGMA] * (1 - h * h * h);
  else if (b.env[MAGMA] > 0 && !(a.env[MAGMA] > 0)) out.env[MAGMA] = b.env[MAGMA] * h * h;
  mixTones(out, a, b, h);
  return out;
}

/** How close the dark has crept in at a depth (see Descent.close): a little more with every depth, never less. */
function closeness(d: number) {
  return d < 1 ? 0 : 0.6 * (1 - Math.exp(-(d - 1) / 45));
}

// ---- the scene's brightness ------------------------------------------------
//
// The backdrop draws the hall (its gradients, haze, glows, smoke and dark)
// times `light`, and the environments' features and the embers over it at
// their own brightness, so the average brightness of a frame is
//   light * hall + rest.
// Both are worked out below on a coarse grid, the way lib/backdrop.ts draws
// them, with what the noise and the features come to measured from the
// backdrop's own frames (ENV_ADD, ENV_HALL and MEASURED, measured by
// scripts/measure-luminance.mjs: run it again after changing what the
// backdrop draws). `light` is set so the sum keeps to luminanceAt(d), which
// only ever falls, and eased so it never swings from one depth to the next
// (see lightAt).

/**
 * The backdrop's drifting smoke (lib/backdrop.ts draws it): warm drifts plus
 * one shadow through the middle. The first four take a look's smoke colours
 * in turn, the shadow keeps its own.
 */
export type Blob = {
  color: [number, number, number];
  opacity: number;
  home: [number, number]; // resting centre, fractions of the viewport
  wander: [number, number]; // how far it drifts from home, same units
  reach: [number, number, number]; // ahead, behind, across, in units of sqrt(W * H) (see the shader)
};
export const BLOBS: Blob[] = [
  { color: [150, 70, 25], opacity: 0.1, home: [0.22, 0.75], wander: [0.12, 0.08], reach: [0.3, 0.16, 0.14] },
  { color: [120, 40, 18], opacity: 0.09, home: [0.8, 0.82], wander: [0.1, 0.07], reach: [0.22, 0.34, 0.13] },
  { color: [140, 110, 60], opacity: 0.06, home: [0.68, 0.28], wander: [0.14, 0.1], reach: [0.28, 0.18, 0.12] },
  { color: [110, 80, 45], opacity: 0.05, home: [0.3, 0.35], wander: [0.12, 0.1], reach: [0.2, 0.3, 0.1] },
  { color: [2, 1, 1], opacity: 0.35, home: [0.55, 0.6], wander: [0.18, 0.1], reach: [0.25, 0.18, 0.12] },
];
/** A look's smoke colour for drift `i` (the shadow, 4, keeps its own). */
export const smokeOf = (look: Look, i: number): readonly number[] =>
  i === 0 ? look.smoke : i === 1 ? look.smokeB : i === 2 ? look.smokeHi : i === 3 ? look.smokeHiB : BLOBS[i].color;

/** How far in (e, 0 to 1) the environments' tables are measured at. */
export const ENV_STEPS = [0, 0.25, 0.5, 0.75, 1];
/**
 * What each environment's features add to the average brightness (luma, 0
 * to 1) as it comes in, at ENV_STEPS: drawn in its own stratum's hall at
 * light 0 (so nothing of the hall), with no dark closed in and its features
 * at full strength, less the same without it; in its own colours
 * (ENV_TONES' tone in lib/backdropData.ts). In other colours it adds as
 * much more or less as their luma has it (toneGain), and so does what it
 * lightens the hall by (ENV_HALL over 1).
 */
export const ENV_ADD: number[][] = [
  [0, 0.00189, 0.0068, 0.0113, 0.01353],
  [0, 0.00438, 0.00757, 0.01098, 0.01532],
  // (The frost is worked out from what the shader draws, averaged over a
  // fine grid and a few moments, until measured; so are the spores and the
  // shafts (shaders/newEffects.ts), worked out with stops of luma 0.5 and
  // scaled to their own colours' luma.)
  [0, 0.00029, 0.00177, 0.00385, 0.00493],
  [0, 0.00043, 0.0011, 0.00193, 0.00239],
  [0, 0.00083, 0.00137, 0.00208, 0.00301],
  [0, 0.00035, 0.00127, 0.00281, 0.00498],
  [0, 0, 0, 0, 0],
  [0, 0.00264, 0.00535, 0.00745, 0.00888],
  [0, 0.00209, 0.00414, 0.00624, 0.0086],
  [0, 0.00583, 0.0103, 0.01554, 0.02185],
];
/**
 * And how far each darkens (under 1) or lights the hall it is drawn over, at
 * ENV_STEPS: the hall drawn with it (at light 1, less at light 0) over the
 * same without it.
 */
export const ENV_HALL: number[][] = [
  [1, 0.981, 0.962, 0.946, 0.928],
  [1, 0.985, 0.969, 0.971, 1.007],
  [1, 1.015, 1.08, 1.15, 1.178],
  [1, 0.993, 0.986, 0.978, 0.971],
  [1, 0.997, 0.995, 0.994, 0.993],
  [1, 0.986, 0.949, 0.886, 0.799],
  [1, 1.017, 1.067, 1.084, 1.139],
  [1, 1.052, 1.111, 1.161, 1.195],
  [1, 0.904, 0.804, 0.703, 0.602],
  [1, 1.009, 1.012, 1.015, 1.018],
];

/** An environment's table (ENV_ADD, ENV_HALL) read at `e`, linearly between ENV_STEPS. */
export function envTable(row: readonly number[], e: number) {
  const x = Math.min(1, Math.max(0, e)) * (ENV_STEPS.length - 1);
  const i = Math.min(ENV_STEPS.length - 2, Math.floor(x));
  return row[i] + (row[i + 1] - row[i]) * (x - i);
}

/**
 * How the frames drawn come out against the estimate below, depth by depth
 * from 1: [the hall drawn (the frame at light 1 less at light 0) over the
 * estimate's `hall`, the frame at light 0 over its `rest`], at 900 x 640,
 * held still. The estimate works the noise out at its average and the
 * features from ENV_ADD and ENV_HALL alone, which is near but not exact. To
 * depth 92, where the last zone settles (from there until the endgame's
 * generated strata come in, at its 6th depth, it keeps its own; for theirs
 * the estimate stands as it is), with the zones' looks as shipped: a zone
 * whose look has changed since (`measured` false in src/data/backdrops.json)
 * has the corrections of its depths dropped rather than applied wrongly
 * (see correction). Measured by scripts/measure-luminance.mjs (calibrate)
 * with the ENV_ tables in place, when the handover ran from a zone's 4th
 * depth to the next one's first, straight; carried over to the eased
 * handovers since (now from a zone's 5th depth to the next one's 2nd), each
 * depth taking the corrections of the depth that showed the same share of
 * the next zone's hall then, and a zone's depths before its hall begins to
 * turn spread evenly over the ones it showed alone then (calibrate measures
 * them afresh). Empty, the estimate stands as it is.
 */
export const MEASURED: (readonly [number, number])[] = [
  [0.943, 0.974], [0.944, 0.975], [0.944, 0.976], [0.944, 0.977], [0.944, 0.978], [0.944, 1.011], [0.944, 1.042], [0.94, 0.99],
  [0.939, 0.974], [0.94, 0.976], [0.941, 0.969], [0.945, 0.988], [0.946, 0.986], [0.946, 0.984], [0.946, 0.982], [0.941, 0.974],
  [0.935, 0.967], [0.947, 0.958], [0.956, 0.935], [0.95, 0.907], [0.941, 0.883], [0.935, 0.762], [0.934, 0.736], [0.934, 0.712],
  [0.933, 0.69], [0.935, 0.698], [0.936, 0.716], [0.941, 0.824], [0.952, 0.869], [0.967, 0.888], [0.973, 0.897], [0.982, 0.907],
  [0.982, 0.913], [0.982, 0.919], [0.982, 0.924], [0.982, 0.911], [0.982, 0.898], [0.982, 0.927], [0.982, 0.98], [0.982, 1.005],
  [0.986, 1.013], [0.987, 1.006], [0.987, 1.005], [0.987, 1.004], [0.987, 1.003], [0.988, 1.007], [0.989, 1.011], [0.989, 0.996],
  [0.991, 0.954], [0.994, 0.911], [0.999, 0.863], [1, 0.933], [1, 0.917], [1, 0.901], [1, 0.885], [1, 0.859],
  [1.001, 0.833], [1.013, 0.732], [1.032, 0.591], [1.042, 0.479], [1.031, 0.466], [1.032, 0.486], [1.032, 0.485], [1.032, 0.485],
  [1.032, 0.485], [1.027, 0.526], [1.022, 0.573], [1.025, 0.708], [1.021, 0.819], [1.023, 0.877], [1.029, 0.912], [1.033, 0.921],
  [1.033, 0.932], [1.033, 0.942], [1.033, 0.953], [1.034, 0.95], [1.036, 0.945], [1.04, 0.985], [1.039, 1.016], [1.032, 1.096],
  [1.019, 1.227], [1.012, 1.276], [1.012, 1.264], [1.012, 1.252], [1.012, 1.239], [1.01, 1.252], [1.008, 1.257], [0.994, 1.051],
  [0.98, 0.951], [0.969, 0.89], [0.962, 0.841], [0.959, 0.838],
];
/** Whether zone `k`'s look is the one MEASURED was measured with. */
const measuredZone = (k: number) => k >= 0 && k < STRATA.length && zones[k].measured;
/** A zone's own corrections, measured where it shows alone (settledAt), or none. */
function anchor(k: number): readonly [number, number] {
  const d = settledAt(k);
  return measuredZone(k) && d <= MEASURED.length ? MEASURED[d - 1] : NONE;
}
const NONE = [1, 1] as const;
/**
 * The corrections at whole depth `i`: MEASURED's where the zones the scene
 * shows there (the one it is in, and the next once it begins to turn into
 * it) all have their looks as measured. Elsewhere (a zone changed since,
 * or the endgame's strata coming in past 94) only what still holds of
 * them: each zone's own (where it shows alone), coming and going with it
 * as the scene turns (the hall's with hallTurn, the rest's with the
 * embers, emberTurn).
 */
function correction(i: number): readonly [number, number] {
  const { stratum, turn } = strataAt(i);
  if (i <= MEASURED.length && measuredZone(stratum - 1) && (turn === 0 || measuredZone(stratum))) return MEASURED[i - 1];
  const a = anchor(stratum - 1);
  const b = anchor(stratum);
  const h = hallTurn(turn);
  const e = emberTurn(turn);
  return [a[0] + (b[0] - a[0]) * h, a[1] + (b[1] - a[1]) * e];
}
/** The corrections at depth `d` (see MEASURED): [hall, rest], eased between whole depths. */
export function measuredAt(d: number): [number, number] {
  if (!(d >= 1)) return [1, 1];
  const i = Math.floor(d);
  const a = correction(i);
  const b = correction(i + 1);
  const t = d - i;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** The grid the estimate is worked out on, over a 900 x 640 screen. */
const GW = 16;
const GH = 10;
const CELLS = GW * GH;
const EW = 900;
const EH = 640;
const gauss = (d: number) => Math.exp(-d * d);
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** What doesn't change with the look, per cell of the grid: worked out once, as the estimate is worked out often. */
const GRID = (() => {
  const S = Math.sqrt(EW * EH);
  const R = Math.hypot(0.7 * EW, 0.77 * EH);
  const g = {
    x: new Float64Array(CELLS),
    y: new Float64Array(CELLS),
    /** The base gradient (0 to 1 a channel). */
    base: new Float64Array(CELLS * 3),
    haze: new Float64Array(CELLS),
    /** The light from below's distance, squared, before its reach (floorH) is applied. */
    floor: new Float64Array(CELLS),
    glow: new Float64Array(CELLS),
    blob: new Float64Array(CELLS * BLOBS.length),
    /** How much of the uneven dark falls here, at full strength. */
    edge: new Float64Array(CELLS),
    /** The vignette's falloff here (main() in lib/backdrop.ts), before its strength. */
    vig: new Float64Array(CELLS),
  };
  for (let j = 0; j < GH; j++) {
    const y = ((j + 0.5) / GH) * EH;
    const t = y / EH;
    const s = t < 0.6 ? smoothstep(0, 0.6, t) : smoothstep(0.6, 1, t);
    const base = t < 0.6 ? [13 + (8 - 13) * s, 11 + (7 - 11) * s, 9 + (6 - 9) * s] : [8 + 5 * s, 7 + 2 * s, 6 + s];
    for (let i = 0; i < GW; i++) {
      const c = j * GW + i;
      const x = ((i + 0.5) / GW) * EW;
      g.x[c] = x;
      g.y[c] = y;
      for (let k = 0; k < 3; k++) g.base[c * 3 + k] = base[k] / 255;
      g.haze[c] = gauss(Math.hypot((x - 0.5 * EW) / (0.6 * EW), (y + 0.1 * EH) / (0.5 * EH)) / 0.5);
      g.floor[c] = ((x - 0.5 * EW) / (0.8 * EW)) ** 2 + ((y - 1.1 * EH) / (0.6 * EH)) ** 2;
      g.glow[c] = gauss(Math.hypot(x - 0.5 * EW, y - 0.43 * EH) / R / 0.3);
      for (let k = 0; k < BLOBS.length; k++) {
        const bl = BLOBS[k];
        const reach = Math.sqrt(((bl.reach[0] + bl.reach[1]) / 2) * bl.reach[2]) * S;
        g.blob[c * BLOBS.length + k] = gauss(Math.hypot(x - bl.home[0] * EW, y - bl.home[1] * EH) / reach);
      }
      g.edge[c] = smoothstep(0.08, 0.9, Math.hypot(((x - 0.5 * EW) / EW) * 1.4, ((y - 0.62 * EH) / EH) * 1.15) + 0.018);
      g.vig[c] = 0.72 * (Math.hypot((x - 0.5 * EW) / (0.5 * EW), (y - 0.5 * EH) / (0.5 * EH)) / Math.SQRT2) ** 2.4;
    }
  }
  return g;
})();

/** The dark closing in at (x, y) of the estimate's screen (closing() in lib/backdrop.ts, with no clock running). */
function closingAt(x: number, y: number, close: number) {
  if (close <= 0) return 0;
  const reach = Math.max(0.15, 1 - 0.6 * close);
  const k = 0.3 + 0.25 * reach;
  const ax = Math.max(Math.abs(x - 0.5 * EW) / (0.5 * EW) - reach, 0) / k;
  const ay = Math.max(Math.abs(y - 0.5 * EH) / (0.5 * EH) - reach, 0) / k;
  return 1 - Math.exp(-(ax * ax + ay * ay));
}

/** Whether a look has magma (any of it shows). */
const hasMagma = (look: Look) => look.env[MAGMA] > 0;
/**
 * Whether stratum `k`'s magma goes out as the scene turns out of it: its
 * look has magma and the next one's none (the Magma Fissure handing over
 * to the Frozen Hollow, or a stratum past the zones that does the same).
 * Read from the looks themselves, so it follows whichever zone the data
 * gives magma.
 */
export const magmaGoesOut = (k: number) => k >= 0 && hasMagma(lookOf(k)) && !hasMagma(lookOf(k + 1));
/**
 * How far stratum `k`'s magma has cooled (0 to 1) with the scene turning
 * `turn` of the way into stratum `stratum` (see strataAt): only a magma
 * that goes out (magmaGoesOut), as the scene turns out of its stratum (k
 * is stratum - 1: from the Magma Fissure's 6th depth to the Frozen
 * Hollow's 2nd), in step with its hall (hallTurn, eased), so the frost,
 * which comes in with the hall and only grows once the magma has well
 * cooled (env_frost), never shows over bright magma; nine tenths cooled as
 * the next is announced, cooled, stopped and gone by its 2nd depth; and all
 * the way once the scene is past it (the turn into the stratum after, and
 * the settled depths before it, k < stratum - 1).
 */
export function magmaCoolingOf(k: number, stratum: number, turn: number): number {
  if (k > stratum - 1 || !magmaGoesOut(k)) return 0;
  return k < stratum - 1 ? 1 : hallTurn(turn);
}
/**
 * How far the magma the scene shows has cooled (0 to 1) with it turning
 * `turn` of the way into stratum `stratum`: the stratum before's
 * (magmaCoolingOf). The backdrop crusts its cracks over from their edges
 * inward, what is still molten cooling from white heat through orange to
 * dull red, and its flow slowing to a stop (env_magma in
 * lib/shaders/effects.ts, from packFx); the embers burning in it slow too
 * (lib/emberMotion.ts).
 */
export const magmaCooling = (stratum: number, turn: number): number => magmaCoolingOf(stratum - 1, stratum, turn);
/**
 * How bright the magma's glow is (its luma, 1 hot), cooled `cool` of the
 * way: no more than this. The backdrop crusts its cracks over from their
 * edges inward (a share of about 1 - cool of them still molten), dims what
 * is still molten by sqrt(1 - cool) and turns it from white heat through
 * orange to dull red, whose luma is lower still; cooled, it is dark rock.
 * So the estimate below, taking this much of what it adds hot, never has it
 * dimmer than it is drawn.
 */
export const magmaHeat = (cool: number) => Math.pow(1 - Math.min(1, Math.max(0, cool)), 1.5);
/** The magma's heat at depth `d` (see magmaCooling). */
function heatAt(d: number) {
  const { stratum, turn } = strataAt(d);
  return magmaHeat(magmaCooling(stratum, turn));
}

/**
 * The environments the backdrop draws at once, at most: a slot each, with
 * its strength and colours (see packFx). Through a handover the two zones'
 * show together, so this is what two neighbouring zones may use between
 * them; should more show, the faintest are left out.
 */
export const FX_SLOTS = 8;
/** The floats in the backdrop's uFx (three vec4s a slot, see packFx). */
export const FX_UNIFORM = FX_SLOTS * 12;
/** In uFxK's slot map: the environment shows in no slot. */
export const NO_SLOT = 15;
/** Less of an environment than this is drawn as none. */
const ENV_TRACE = 0.002;
const showing: number[] = [];

/**
 * Writes the backdrop's uFx and uFxK for `scene` into `out` (FX_UNIFORM
 * floats) and `k` (4; lib/backdrop.ts sends them as they are). A slot for
 * every environment showing, from the first (the strongest FX_SLOTS,
 * should more show), in the order of ENVIRONMENTS, each three vec4s: its
 * first colour stop and its strength, its second and how far its colour
 * varies, its third and its index in ENVIRONMENTS (colours 0 to 1); the
 * slots after, strength 0. Then k: the magma's cooling (the scene's `cool`;
 * it crusts the magma over and stops it) and its flow's clock, `magmaClock`;
 * and which slot each environment is in (NO_SLOT, none), four bits each,
 * the first five in k[2] and the rest in k[3].
 */
export function packFx(out: Float32Array, k: Float32Array, scene: Pick<Descent, 'look' | 'cool'>, magmaClock: number): Float32Array {
  const env = scene.look.env;
  showing.length = 0;
  for (let i = 0; i < ENV; i++) if (env[i] >= ENV_TRACE) showing.push(i);
  if (showing.length > FX_SLOTS) {
    showing.sort((a, b) => env[b] - env[a] || a - b);
    showing.length = FX_SLOTS;
    showing.sort((a, b) => a - b);
  }
  out.fill(0);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < ENV; i++) {
    const s = showing.indexOf(i);
    const slot = s < 0 ? NO_SLOT : s;
    if (i < 5) lo += slot * 16 ** i;
    else hi += slot * 16 ** (i - 5);
    if (s < 0) continue;
    const tone = toneOf(scene.look, i);
    const o = s * 12;
    for (let j = 0; j < 3; j++) for (let c = 0; c < 3; c++) out[o + 4 * j + c] = stop(tone, j, c) / 255;
    out[o + 3] = env[i];
    out[o + 7] = tone.vary;
    out[o + 11] = i;
  }
  k[0] = scene.cool;
  k[1] = magmaClock;
  k[2] = lo;
  k[3] = hi;
  return out;
}

/** The three stops (0 to 1) `look` draws environment `name` in (the backdrop's far city lights and frost glints, drawn per pixel, take theirs from here). */
export function stopsFor(look: Look, name: (typeof ENVIRONMENTS)[number], out: Float32Array): Float32Array {
  const tone = toneOf(look, ENVIRONMENTS.indexOf(name));
  for (let j = 0; j < 3; j++) for (let c = 0; c < 3; c++) out[3 * j + c] = stop(tone, j, c) / 255;
  return out;
}

/** The colours a look mixes in, 0 to 1 (estimateLuminance's scratch): haze, floor, glow, the smoke's five drifts, mist. */
const MIXES = 9;
const mixRGB = new Float64Array(MIXES * 3);
const mixK = new Float64Array(MIXES);
const blobK = new Float64Array(BLOBS.length);

/**
 * The average brightness (luma, 0 to 1) of the backdrop drawn with `look`
 * and the dark closed in by `close`, worked out the way lib/backdrop.ts draws
 * it (its smooth light at rest, on a coarse grid, the noise at its average;
 * the environments' features by ENV_ADD and ENV_HALL), split into what
 * `light` scales (hall: the hall's own light) and what it doesn't (rest: the
 * features, burning at `features`, and the embers). `heat` is how bright the
 * magma glows as it cools (magmaHeat; 1 hot): its features add that much of
 * what they do hot.
 */
export function estimateLuminance(look: Look, close: number, features = 1, heat = 1): { hall: number; rest: number } {
  const delve = look.dark > 0 || look.mistK > 0;
  const g = GRID;
  const nb = BLOBS.length;
  for (let m = 0; m < MIXES; m++) {
    const c = m === 0 ? look.haze : m === 1 ? look.floor : m === 2 ? look.glow : m < 8 ? smokeOf(look, m - 3) : look.mist;
    for (let k = 0; k < 3; k++) mixRGB[m * 3 + k] = c[k] / 255;
  }
  for (let k = 0; k < nb; k++) blobK[k] = 0.75 * BLOBS[k].opacity * (k < 4 ? look.smokeK : look.shadowK);
  const [sh0, sh1, sh2] = look.shade;
  const hazeK = look.hazeK * 0.18;
  const floorK = look.floorK;
  const glowK = look.lamp * 0.07;
  const mistK = delve ? look.mistK * 0.27 : 0;
  const darkK = delve ? 0.75 * look.dark : 0;
  const fh = 0.25 * look.floorH * look.floorH;
  const vigK = 1 - 0.6 * look.dark;
  let hall = 0;
  let open = 0;
  for (let c = 0; c < CELLS; c++) {
    let r = g.base[c * 3] * sh0;
    let gr = g.base[c * 3 + 1] * sh1;
    let b = g.base[c * 3 + 2] * sh2;
    mixK[0] = hazeK * g.haze[c];
    mixK[1] = floorK * Math.exp(-g.floor[c] / fh);
    mixK[2] = glowK * g.glow[c];
    for (let k = 0; k < nb; k++) mixK[3 + k] = blobK[k] * g.blob[c * nb + k];
    mixK[8] = mistK;
    for (let m = 0; m < MIXES; m++) {
      const k = mixK[m];
      r += (mixRGB[m * 3] - r) * k;
      gr += (mixRGB[m * 3 + 1] - gr) * k;
      b += (mixRGB[m * 3 + 2] - b) * k;
    }
    const shut = closingAt(g.x[c], g.y[c], close);
    open += 1 - 0.75 * shut;
    // The uneven dark, and the backdrop's lift and vignette (main() in lib/backdrop.ts).
    hall += luma(r, gr, b) * (1 - darkK * g.edge[c]) * (1 - 0.93 * shut) * 1.2 * (1 - Math.min(0.9, vigK * g.vig[c]));
  }
  open /= CELLS;
  // (The grid at rest comes out about 8% under the frames drawn.) The
  // stratum's own light is the backdrop's too (uLight is light * lightK).
  hall *= (1.08 / CELLS) * look.lightK;
  let env = 0;
  for (let i = 0; i < ENV; i++) {
    const e = look.env[i];
    if (e <= 0) continue;
    // (In colours brighter or darker than its own, it adds and lightens the hall by as much more or less.)
    const gain = toneGain(toneOf(look, i), i);
    env += envTable(ENV_ADD[i], e) * gain * (i === MAGMA ? heat : 1);
    const lift = envTable(ENV_HALL[i], e);
    hall *= lift > 1 ? 1 + (lift - 1) * gain : lift;
  }
  // The embers: how many burn (the calm ones and the crowd), how large and
  // bright on average, each a hot core and a wide halo (the shader's).
  const count = 36 + 52 * look.crowd;
  const s2 = 5.5 * look.size * look.size;
  const em = look.ember;
  const hot = luma(em[0] + (look.core[0] - em[0]) * look.coreMix, em[1] + (look.core[1] - em[1]) * look.coreMix, em[2] + (look.core[2] - em[2]) * look.coreMix);
  const each = 0.7 * 0.76 * 0.8 * look.bright * (0.9 * Math.PI * 0.3 * s2 * hot + 0.3 * Math.PI * 5 * s2 * luma(em[0], em[1], em[2]));
  const embers = ((count * each) / (EW * EH)) * open * 1.2;
  return { hall: Math.max(1e-4, hall), rest: embers + env * open * features };
}

/**
 * The average brightness the scene keeps to at a depth: depth 1's (the
 * Mines with no dark closed in yet, at their own light), falling steadily
 * and levelling off at LEVEL_FLOOR of it far down.
 */
export const LEVEL_FLOOR = 0.62;
let depthOne = NaN;
export function luminanceAt(d: number): number {
  if (Number.isNaN(depthOne)) {
    const e = estimateLuminance(STRATA[0].look, 0, 1);
    const [h, r] = measuredAt(1);
    depthOne = e.hall * h + e.rest * r;
  }
  return depthOne * levelAt(d);
}
/** luminanceAt as a share of depth 1's. */
const levelAt = (d: number) => LEVEL_FLOOR + (1 - LEVEL_FLOOR) * Math.exp(-Math.max(0, d - 1) / 50);
/** How bright the strata's features burn (fire, gold, fog, ...): a little less the deeper, down to FEATURES_FLOOR. */
const FEATURES_FLOOR = 0.5;
export const featuresAt = (d: number) => (d < 1 ? 1 : FEATURES_FLOOR + (1 - FEATURES_FLOOR) * Math.exp(-(d - 1) / 60));
/**
 * The last depth the zones keep to darkening: the last zone's 7th, until
 * which the endgame's first stratum has barely begun to creep in.
 */
export const ZONES_DARKEN_TO = 10 * STRATA.length - 3;
/**
 * How much brighter than the depth before the scene may come out at depth
 * `d` (as a factor): through the zones (to ZONES_DARKEN_TO) not visibly, a
 * trace at most (0.8%, under what a frame drawn varies by; the light keeps
 * to LIGHT_SLACK); past them, where the endgame's strata may lift the
 * excitement, by 8% at most, never by a jump.
 */
export const brighterAt = (d: number) => (d <= ZONES_DARKEN_TO ? 1.008 : 1.08);
/** The range `light` keeps to, so no stratum is drawn far from its own brightness. */
export const LIGHT_MIN = 0.2;
export const LIGHT_MAX = 1.8;
/**
 * How far the light may change from one depth to the next (in log terms:
 * 0.09 is about 9%), so the hall never swings ahead of a new stratum: where
 * the estimate would have it change faster, it is lowered a little early or
 * held a little longer (see extendLights), never raised, and the scene
 * comes out a little darker meanwhile. Either `light` or the light drawn
 * (uLight, `light` times the look's lightK) may move this far: where a
 * stratum's own light rises (lightK, from the last zone's 0.15 to an
 * endgame stratum's 0.4, say), `light` may fall as fast as it does, so what
 * is drawn keeps pace with it, rather than the scene growing brighter by
 * the difference. (Half as much again as when the hall turned over nine
 * depths: over six, at its steepest it turns half as far again a depth, and
 * the light has to keep pace with it.)
 */
export const LIGHT_STEP = 0.09;
/**
 * How much brighter than the depth before the estimate may come out where
 * the light, eased, has fallen behind the curve and catches up with it
 * (0.004: 0.4%, under what a frame shows; the curve itself falls by more
 * than that a depth through the first strata).
 */
const LIGHT_SLACK = 0.004;

/**
 * The light is worked out at every whole depth to LIGHT_TABLE, a stretch at
 * a time as the scene goes deeper (see extendLights), and eased between
 * them. The strata never come round again (each past the zones is
 * generated), so neither does the light: the table goes on, a stretch at a
 * time, to depth 2001, deeper than anyone goes. Past it, everything else
 * (the dark closing in, luminanceAt, featuresAt) has long levelled off, and
 * the light keeps to the curve exactly, depth by depth (as it does in the
 * table wherever the strata leave it the room).
 */
export const LIGHT_TABLE = 1 + 200 * 10;
/** Per whole depth: the hall and the rest the estimate comes to (measured corrections and all), the look's own light (lightK), the light, and the brightness with it. */
const tableHall = new Float64Array(LIGHT_TABLE + 1);
const tableK = new Float64Array(LIGHT_TABLE + 1);
const tableRest = new Float64Array(LIGHT_TABLE + 1);
const tableLight = new Float64Array(LIGHT_TABLE + 1);
const tableLevel = new Float64Array(LIGHT_TABLE + 1);
/** How far the table is worked out, and how far of that is settled (it never changes again). */
let tableEnd = 0;
let settled = 0;
/** The stretch worked out at a time, and how far past what it settles it looks ahead (further than the light could ease in from). */
const STRETCH = 90;
const AHEAD = 45;

/**
 * Works the light table out to at least depth `to`. Each stretch: the light
 * that keeps to luminanceAt at each whole depth, given the hall the estimate
 * works out there and what the features and embers add (each times its
 * measured correction); then lowered wherever it would change by more than
 * LIGHT_STEP a depth, or where the features come in faster than the falling
 * curve leaves room for, until neither is so: the least it has to be
 * lowered, never raised. So the scene comes out at the curve or a little
 * under it, and never brighter than the depth before (but for LIGHT_SLACK).
 * A stretch at a time, so the scene never stops for long to work it out.
 */
function extendLights(to: number) {
  const look = blank();
  const up = Math.exp(LIGHT_STEP);
  while (settled < Math.min(to, LIGHT_TABLE)) {
    const from = tableEnd + 1;
    tableEnd = Math.min(LIGHT_TABLE, tableEnd + STRETCH);
    for (let d = from; d <= tableEnd; d++) {
      lookAt(look, d);
      const e = estimateLuminance(look, closeness(d), featuresAt(d), heatAt(d));
      const [h, r] = measuredAt(d);
      tableHall[d] = e.hall * h;
      tableRest[d] = e.rest * r;
      tableK[d] = look.lightK;
      tableLight[d] = Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, (luminanceAt(d) - tableRest[d]) / tableHall[d]));
    }
    // Lowered where it must be, leaving what is settled as it is.
    const first = Math.max(2, settled + 1);
    for (let pass = 0, moved = true; moved && pass < 200; pass++) {
      moved = false;
      for (let d = first; d <= tableEnd; d++) {
        // (Where the features come in faster than the light may fall, it
        // falls as fast as it may, no faster: lowering it further back
        // wouldn't help.)
        const keep = ((tableLight[d - 1] * tableHall[d - 1] + tableRest[d - 1]) * (1 + LIGHT_SLACK) - tableRest[d]) / tableHall[d];
        // (As far as `light` may move, or as far as it may to keep the light drawn moving no further: see LIGHT_STEP.)
        const k = tableK[d - 1] / tableK[d];
        const most = Math.max(LIGHT_MIN, Math.min(tableLight[d - 1] * up * Math.max(1, k), Math.max((tableLight[d - 1] / up) * Math.min(1, k), keep)));
        if (tableLight[d] > most + 1e-12) {
          tableLight[d] = most;
          moved = true;
        }
      }
      for (let d = tableEnd - 1; d >= first - 1 && d > settled; d--) {
        const most = Math.max(LIGHT_MIN, tableLight[d + 1] * up * Math.max(1, tableK[d + 1] / tableK[d]));
        if (tableLight[d] > most + 1e-12) {
          tableLight[d] = most;
          moved = true;
        }
      }
    }
    const was = settled;
    settled = tableEnd === LIGHT_TABLE ? LIGHT_TABLE : tableEnd - AHEAD;
    for (let d = was + 1; d <= settled; d++) tableLevel[d] = tableLight[d] * tableHall[d] + tableRest[d];
  }
}

/** Whether the light at depth `d` is worked out, so lightAt answers at once. */
const lit = (d: number) => !(d >= 1) || d >= LIGHT_TABLE || settled >= Math.floor(d) + 1;

/** The strata looked up so far, in order, to work the table out (see workLights). */
let looked = 0;
const clock = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

/**
 * Works the light table out toward depth `to` for about `ms` (at least one
 * step): first the looks of the strata the next stretch reads (generated
 * past the zones, a millisecond or so each), one at a time, then the
 * stretch itself (a few milliseconds). Returns whether it is worked out
 * that far. The same table as lightAt works out at once (extendLights),
 * only in pieces: a rejoin deep down (depth 2000 takes a hundred
 * milliseconds or more at once) never holds up a frame for long.
 */
function workLights(to: number, ms: number): boolean {
  const end = clock() + ms;
  const goal = Math.min(to, LIGHT_TABLE);
  while (settled < goal) {
    const need = strataAt(Math.min(LIGHT_TABLE, tableEnd + STRETCH) + 1).stratum + 1;
    if (looked <= need) lookOf(looked++);
    else extendLights(settled + 1);
    if (clock() >= end) break;
  }
  return settled >= goal;
}

/** How deep the light is being worked out in idle moments (see warmLights), and whether it is under way. */
let warmTo = 0;
let warming = false;
type Idle = { timeRemaining(): number };
const whenIdle = (f: (deadline?: Idle) => void) => {
  const ric = (globalThis as { requestIdleCallback?: (f: (deadline: Idle) => void, o: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(f, { timeout: 250 });
  else setTimeout(f, 16);
};
/**
 * Works the light out to depth `to` in idle moments, a few milliseconds at
 * a time, ahead of the scene getting there (a run starting, a rejoin deep
 * down): so it is there by the time a frame needs it.
 */
function warmLights(to: number) {
  warmTo = Math.max(warmTo, Math.min(LIGHT_TABLE, Math.ceil(to)));
  if (warming || settled >= warmTo) return;
  warming = true;
  const step = (deadline?: Idle) => {
    const ms = deadline ? Math.max(2, deadline.timeRemaining() - 2) : 4;
    if (workLights(warmTo, ms)) warming = false;
    else whenIdle(step);
  };
  whenIdle(step);
}

/**
 * How bright the scene's light is drawn at depth `d` with `look` (the look
 * there; see Descent.light). At a whole depth, the table's; between two,
 * whatever keeps the brightness the estimate comes to between theirs, so it
 * never comes out brighter while a depth eases in either.
 */
export function lightAt(d: number, look: Look = lookAt(blank(), d)): number {
  if (!(d >= 1)) return 1;
  let level: number;
  if (d < LIGHT_TABLE) {
    const i = Math.floor(d);
    const j = i + 1;
    if (settled < j) extendLights(j);
    if (d === i) return tableLight[i];
    level = tableLevel[i] + (tableLevel[j] - tableLevel[i]) * (d - i);
  } else level = luminanceAt(d);
  const e = estimateLuminance(look, closeness(d), featuresAt(d), heatAt(d));
  const [h, r] = measuredAt(d);
  return Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, (level - e.rest * r) / (e.hall * h)));
}

/**
 * How far the light moves from one scene to the next (`a`'s depth to
 * `b`'s, in log terms) beyond what makes way for the strata's own light
 * (lightK) as it changes: what LIGHT_STEP bounds a depth (see there).
 */
export function lightSwing(a: Pick<Descent, 'light' | 'look'>, b: Pick<Descent, 'light' | 'look'>): number {
  const moved = Math.log(b.light / a.light);
  const own = Math.log(a.look.lightK / b.look.lightK);
  return moved > Math.max(0, own) ? moved - Math.max(0, own) : moved < Math.min(0, own) ? Math.min(0, own) - moved : 0;
}

/**
 * How bright a look's hall is lit (its lightK) to show as stratum `k`: so
 * that, settled there (settledAt: its 2nd depth, the turn into it done, the
 * dark crept in as far as it has by then), the scene keeps to luminanceAt
 * at a light of 1, as the zones' were measured to. The endgame's generated
 * looks are lit so, and the backdrop tool lights a zone's changed look so;
 * the Mines' is 1, as their brightness is the curve's own.
 */
export function calibrateLight(look: Look, k: number): number {
  if (k <= 0) return 1;
  const d = settledAt(k);
  const e = estimateLuminance({ ...look, dark: look.dark + (1 - look.dark) * 0.15 * deepAt(d), lightK: 1 }, closeness(d), featuresAt(d));
  return Math.round(1000 * Math.min(4, Math.max(0.1, (luminanceAt(d) - e.rest) / e.hall))) / 1000;
}

/**
 * The scene's average brightness at depth `d` as the estimate has it, with
 * its light and the measured corrections: what the brightness rule keeps
 * from rising (the backdrop tool's curve; no frame is drawn or read).
 */
export function brightnessAt(d: number): number {
  const x = descent(d);
  const e = estimateLuminance(x.look, x.close, x.features, heatAt(d));
  const [h, r] = measuredAt(d);
  return e.hall * h * x.light + e.rest * r;
}

/** How deep the ambience is at a depth (see Descent.deep). */
const deepAt = (d: number) => (d < 1 ? 0 : 1 - Math.exp(-(d - 1) / 22));

/** Writes the look at depth `d` (at least 0) into `out`. */
function lookAt(out: Look, d: number): Look {
  const { stratum, turn } = strataAt(d);
  const look = d < 1 ? mixInto(out, SURFACE, STRATA[0].look, turn) : turnInto(out, lookOf(stratum - 1), lookOf(stratum), turn);
  // Within a stratum the dark still creeps in a little with every depth.
  look.dark += (1 - look.dark) * 0.15 * deepAt(d);
  return look;
}

/**
 * Writes the scene at a depth into `out` (its look is written over, never
 * shared). `light` false leaves its light as it is (the caller sees to it).
 */
function fill(out: Descent, depth: number, light = true): Descent {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  const { stratum, turn } = strataAt(d);
  lookAt(out.look, d);
  out.deep = deepAt(d);
  out.abyss = smoothstep(ABYSS_FROM, ABYSS_FULL, d);
  out.close = closeness(d);
  out.features = featuresAt(d);
  if (light) out.light = lightAt(d, out.look);
  out.dim = d < 1 ? 0 : 1 - levelAt(d);
  out.stratum = stratum;
  out.turn = turn;
  out.cool = magmaCooling(stratum, turn);
  return out;
}

const fresh = (): Descent => ({ deep: 0, abyss: 0, close: 0, light: 1, features: 1, dim: 0, stratum: 0, turn: 0, cool: 0, look: blank() });

/**
 * The scene at a depth (0 outside Delve: the usual scene). Fractional depths
 * ease between whole ones. Where its light isn't worked out yet (deep down,
 * the first time), it is worked out only when read: what reads only the
 * rest (the ambience, the CSS backdrop) never waits on it.
 */
export function descent(depth: number): Descent {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  if (lit(d)) return fill(fresh(), d);
  const out = fill(fresh(), d, false);
  let light: number | undefined;
  Object.defineProperty(out, 'light', {
    get: () => (light ??= lightAt(d)),
    set: (v: number) => void (light = v),
    enumerable: true,
    configurable: true,
  });
  return out;
}

// ---- the named depths -------------------------------------------------------

/** The named depths through 100: each stratum but the first is announced as it begins. */
export const MILESTONES: { depth: number; name: string }[] = STRATA.flatMap((s, k) => (s.announced ? [{ depth: 10 * k + 1, name: s.name }] : []));

/**
 * The name of the depth, if it has one: the first depth of every stratum but
 * the first, for ever. Past 100 each generated stratum takes its
 * archetype's next name (`endgameName`), never a zone's and none twice in a
 * long while.
 */
export function milestoneAt(depth: number): string | null {
  const d = Math.floor(depth);
  if (!Number.isFinite(d) || d < 11 || d % 10 !== 1) return null;
  return stratumName((d - 1) / 10);
}

// ---- the eased channel ----------------------------------------------------

/** The depth the scene shows, easing toward the depth of the game. */
let shown = 0;
let target = 0;
/**
 * A jump of more than JUMP depths (leaving a run, a rejoin deep down, a new
 * run after one) doesn't walk the scene through every stratum between: it
 * cross-fades straight there over FADE seconds, from `from` (the scene as it
 * was shown), `fadeT` of the way.
 */
const JUMP = 3;
const FADE = 1.6;
let fading = false;
let fadeT = 0;
const from = fresh();
const listeners = new Set<(d: Descent) => void>();

/** Sets the depth the scene heads for (0 outside Delve). */
export function setDescent(depth: number) {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  if (d === target) return;
  // A run starting from the surface (where nothing shows how far the scene
  // has sunk) starts it from the top again, so it never has to wrap round.
  if (target === 0 && shown === 0 && !fading) resetSink();
  if (Math.abs(d - shown) > JUMP || (d === 0 && shown > 0)) {
    copyInto(from, currentDescent());
    fading = true;
    fadeT = 0;
    fadeAt = NaN;
    shown = d;
  }
  target = d;
  // (Its light worked out ahead, in idle moments, and as far again past it.)
  warmLights(d + STRETCH);
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
 * about a second; a jump cross-fades (see JUMP). Returns whether it is still
 * moving.
 */
export function stepDescent(dt: number): boolean {
  if (fading) {
    if (waiting()) return true;
    fadeT += dt / FADE;
    if (fadeT >= 1) fading = false;
  }
  const diff = target - shown;
  if (diff === 0) return fading;
  const step = Math.max(Math.abs(diff) * (1 - Math.exp(-dt / 0.7)), dt);
  shown = Math.abs(diff) <= step ? target : shown + Math.sign(diff) * step;
  return true;
}

/** Jumps straight to the target (the backdrop holding still). Returns whether that changed anything. */
export function snapDescent(): boolean {
  if (shown === target && !fading) return false;
  if (fading && waiting()) {
    shown = target;
    return true;
  }
  shown = target;
  fading = false;
  return true;
}

/**
 * A jump deep down (a rejoin) waits to fade in until the light there is
 * worked out: a few milliseconds of it a frame (FRAME_MS, see workLights),
 * the rest in idle moments (warmLights), meanwhile showing the scene as it
 * was. Nothing of the new depth shows until its light is there, so it
 * fades in as it would have at once, its light the same, a moment later.
 * Returns whether it is still waiting.
 */
const FRAME_MS = 3;
function waiting(): boolean {
  const to = Math.floor(Math.max(shown, target)) + 1;
  if (lit(shown) && lit(target)) return false;
  return !workLights(to, FRAME_MS);
}

function copyInto(out: Descent, d: Descent) {
  out.deep = d.deep;
  out.abyss = d.abyss;
  out.close = d.close;
  out.light = d.light;
  out.features = d.features;
  out.dim = d.dim;
  out.stratum = d.stratum;
  out.turn = d.turn;
  out.cool = d.cool;
  mixInto(out.look, d.look, d.look, 0);
}

// Read every frame, so each is worked out once per change rather than per
// call, and into the same objects, so easing allocates nothing.
const shownNow = fresh();
const fadeNow = fresh();
const targetNow = fresh();
let shownAt = NaN;
let fadeAt = NaN;
let fadeShownAt = NaN;
let targetAt = NaN;

// The backdrop tool shows a draft in place of the file's backdrops
// (setBackdrops in lib/backdrops.ts): everything worked out from the looks
// is worked out again.
onBackdrops(() => {
  deep.clear();
  depthOne = NaN;
  tableEnd = 0;
  settled = 0;
  looked = 0;
  warmTo = 0;
  shownAt = NaN;
  fadeAt = NaN;
  targetAt = NaN;
});

/** The scene as shown right now. */
export function currentDescent(): Descent {
  // (A jump deep down shows the scene as it was until its light is worked out: see waiting.)
  if (fading && !(lit(shown) && lit(target))) return from;
  if (shownAt !== shown) fill(shownNow, (shownAt = shown));
  if (!fading) return shownNow;
  if (fadeAt === fadeT && fadeShownAt === shown) return fadeNow;
  fadeAt = fadeT;
  fadeShownAt = shown;
  const t = smoothstep(0, 1, fadeT);
  const mix = (a: number, b: number) => a + (b - a) * t;
  fadeNow.deep = mix(from.deep, shownNow.deep);
  fadeNow.abyss = mix(from.abyss, shownNow.abyss);
  fadeNow.close = mix(from.close, shownNow.close);
  fadeNow.light = mix(from.light, shownNow.light);
  fadeNow.features = mix(from.features, shownNow.features);
  fadeNow.dim = mix(from.dim, shownNow.dim);
  fadeNow.stratum = shownNow.stratum;
  fadeNow.turn = shownNow.turn;
  mixInto(fadeNow.look, from.look, shownNow.look, t);
  // The magma's cooling: each scene's, as much as each shows of it (its
  // strength fades from the one to the other with the rest of the look).
  const a = from.look.env[MAGMA] * (1 - t);
  const b = shownNow.look.env[MAGMA] * t;
  fadeNow.cool = a + b > 0 ? (a * from.cool + b * shownNow.cool) / (a + b) : mix(from.cool, shownNow.cool);
  return fadeNow;
}

/**
 * The scene the shown one is heading for. (Until its light is worked out,
 * a jump deep down waiting on it, its light is the deepest worked out so
 * far: nothing draws it meanwhile.)
 */
export function targetDescent(): Descent {
  if (targetAt === target) return targetNow;
  if (lit(target)) fill(targetNow, (targetAt = target));
  else {
    fill(targetNow, target, false);
    targetNow.light = settled >= 1 ? tableLight[settled] : 1;
  }
  return targetNow;
}

/** The depth the scene shows right now (tests). */
export const shownDepth = () => shown;

// ---- the plunge -------------------------------------------------------------

/**
 * Each new depth of a Delve, as its cards are dealt, sinks the scene a
 * little further: over PLUNGE_MS the walls, the smoke and the dust drift up
 * past you (the nearer, the faster) as if you sank PLUNGE_SINK of a screen,
 * the embers streak up, and the dark draws in and lets go again; it gathers
 * speed quickly and comes to rest slowly, settling where it came to.
 * App.svelte calls plunge() (see dealtDeeper); the backdrop steps it, and
 * skips it while it holds still (reduced motion, effects off).
 */
export const PLUNGE_MS = 1900;
export const PLUNGE_SINK = 1.1;
/**
 * How far the scene has sunk (screens, wrapping far down), how fast (screens
 * a second) and how far the dark has drawn in (0 to 1); and how far it has
 * swung sideways (screen heights, see swing) and the dark drawn in as it does.
 */
export const sinking = { sink: 0, speed: 0, breath: 0, slide: 0, slideBreath: 0 };
let asked = false;
let sinkFrom = 0;
let plungeAt = -Infinity;

/** Back to the top, nothing sunk and no plunge under way (a run starting from the surface). */
function resetSink() {
  sinking.sink = 0;
  sinking.speed = 0;
  sinking.breath = 0;
  sinking.slide = 0;
  sinking.slideBreath = 0;
  sinkFrom = 0;
  plungeAt = -Infinity;
  swingAsked = 0;
  swingAt = -Infinity;
}

/** Sinks the scene a little further (a new depth's cards were dealt). */
export function plunge() {
  asked = true;
}

/** Where a run's cards were last dealt: which run (its start) and at what depth. */
export type Dealt = { run: number; depth: number };
/**
 * Whether cards dealt at `now` are a new depth's, deeper in the same run
 * than the cards dealt `before`: the moment to plunge. Not the first cards
 * of a run (or the first seen after a reload), and not the same depth's
 * cards dealt again (a question set aside by the host's reload).
 */
export function dealtDeeper(before: Dealt | undefined, now: Dealt): boolean {
  return !!before && before.run === now.run && now.depth > before.depth;
}

/**
 * How the plunge moves: gathering speed for the first PLUNGE_PEAK of it,
 * then slowing to rest over the rest (two cubics meeting at their steepest,
 * so it never jerks), and its slope.
 */
const PLUNGE_PEAK = 0.38;
const ease = (x: number) => {
  const m = PLUNGE_PEAK;
  return x < m ? m * (x / m) ** 3 : m + (1 - m) * (1 - (1 - (x - m) / (1 - m)) ** 3);
};
const easeSlope = (x: number) => {
  const m = PLUNGE_PEAK;
  return x < m ? 3 * (x / m) ** 2 : 3 * (1 - (x - m) / (1 - m)) ** 2;
};

/**
 * Steps the plunge to `now` (ms): starts one asked for (unless `allowed` is
 * false, when it is dropped) and moves `sinking`. Returns whether it is moving.
 */
export function stepPlunge(now: number, allowed: boolean): boolean {
  if (asked) {
    asked = false;
    if (allowed) {
      sinkFrom = sinking.sink;
      plungeAt = now;
    }
  }
  if (plungeAt === -Infinity) return false;
  // Holding still now: it ends at once where it was heading.
  const x = allowed ? Math.max(0, (now - plungeAt) / PLUNGE_MS) : 1;
  if (x >= 1) {
    // (Wrapping round after hundreds of depths in one run, so the shader's
    // noise keeps its precision; each run starts from 0, see setDescent.)
    sinking.sink = (sinkFrom + PLUNGE_SINK) % 256;
    sinking.speed = 0;
    sinking.breath = 0;
    plungeAt = -Infinity;
    return true;
  }
  sinking.sink = sinkFrom + PLUNGE_SINK * ease(x);
  sinking.speed = (PLUNGE_SINK * easeSlope(x) * 1000) / PLUNGE_MS;
  sinking.breath = Math.sin(Math.PI * x) ** 2;
  return true;
}

// ---- the swing --------------------------------------------------------------

/**
 * Dynamite blasts a question away for another card's at the same depth: no
 * depth deeper, so the scene swings sideways instead of sinking, toward the
 * side that card lay on the offer (`side`: -1 left, 1 right). Over SWING_MS
 * the walls, the smoke and the dust drift past the other way (the nearer,
 * the faster) as far as SWING_SHIFT of a screen's height, with the plunge's
 * ease, and the dark draws in and lets go again. Game.svelte calls swing();
 * the backdrop steps it, and skips it while it holds still (reduced motion,
 * effects off).
 */
export const SWING_MS = 1300;
export const SWING_SHIFT = 0.55;
let swingAsked = 0;
let slideFrom = 0;
let slideBy = 0;
let swingAt = -Infinity;

/** Swings the scene sideways, toward `side` (dynamite blasted a question away, see above). */
export function swing(side: -1 | 1) {
  swingAsked = side;
}

/**
 * Steps the swing to `now` (ms): starts one asked for (unless `allowed` is
 * false, when it is dropped) and moves `sinking.slide`. Returns whether it is
 * moving. Moving left, the scene drifts right past you: the walls are read
 * further left.
 */
export function stepSwing(now: number, allowed: boolean): boolean {
  if (swingAsked) {
    const side = swingAsked;
    swingAsked = 0;
    if (allowed) {
      slideFrom = sinking.slide;
      slideBy = side * SWING_SHIFT;
      swingAt = now;
    }
  }
  if (swingAt === -Infinity) return false;
  const x = allowed ? Math.max(0, (now - swingAt) / SWING_MS) : 1;
  if (x >= 1) {
    sinking.slide = (slideFrom + slideBy) % 256;
    sinking.slideBreath = 0;
    swingAt = -Infinity;
    return true;
  }
  sinking.slide = slideFrom + slideBy * ease(x);
  sinking.slideBreath = Math.sin(Math.PI * x) ** 2;
  return true;
}
