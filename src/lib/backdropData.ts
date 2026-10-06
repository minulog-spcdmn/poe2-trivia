// What Delve's backdrops are made of, as data: a stratum's look (the colours
// and strengths the backdrop draws it with), its embers' way of moving (a
// motion profile of lib/emberProfiles.ts, tweaked), and the settings the
// endgame's looks are generated with (lib/backdropGen.ts). The zones' looks
// and the endgame's settings live in src/data/backdrops.json (see
// lib/backdrops.ts), which the backdrop tool (backdrop.html, src/backdropTool)
// edits. Nothing here imports anything, so the dev server's save endpoint
// (vite.config.ts) can check what it is sent with it.

export type RGB = [number, number, number];

/** A stratum's look. Colours of light are 0-255; ember colours 0-1. */
export interface Look {
  /** The dark of the hall, per channel (1 is the surface's). */
  shade: RGB;
  /** How much of the hall the uneven dark swallows, 0 to 1. */
  dark: number;
  /** The light welling up from below, its strength and its reach. */
  floor: RGB;
  floorK: number;
  floorH: number;
  /** The haze from above and its strength (1 at the surface). */
  haze: RGB;
  hazeK: number;
  /** The glow in the middle: its colour (the surface's is gold) and strength (1 at the surface). */
  glow: RGB;
  lamp: number;
  /**
   * The drifting smoke, a colour to each of its four drifts (low left, low
   * right, high right, high left; see BLOBS in lib/descent.ts), so the
   * colours mix as they pass each other, as on the start page; their
   * opacity, and the shadow's.
   */
  smoke: RGB;
  smokeB: RGB;
  smokeHi: RGB;
  smokeHiB: RGB;
  smokeK: number;
  shadowK: number;
  /** Smoke of the stratum's colour gathering in the dark, and how much. */
  mist: RGB;
  mistK: number;
  /** The embers' halo, the colour their core burns toward, and how far. */
  ember: RGB;
  core: RGB;
  coreMix: number;
  /** Share of the extra embers in the air (0 to 1), and how fast, large and bright they burn. */
  crowd: number;
  speed: number;
  size: number;
  bright: number;
  /** How restless they are: sway, draft and flicker (0 to 1). */
  agit: number;
  /** Share of them sinking like dust instead of rising (0 to 1). */
  fall: number;
  /** What glints in the walls: its colour, how much of it (0 to 1), and how far from the walls it spreads (1: all over, like stars). */
  glint: RGB;
  glints: number;
  spread: number;
  /** Sparks bursting up from below now and then, and how often (0 to 1). */
  burst: number;
  /** Eddies in the dark that pull the embers round (0 to 1). */
  eddy: number;
  /** How much of each environment the backdrop draws (ENV of them, 0 to 1; see ENVIRONMENTS). */
  env: number[];
  /**
   * The colours each environment it draws is drawn in, by its name (see
   * Tone); one it has none for takes its own (ENV_TONES' tone).
   */
  tones: Tones;
  /** The stratum's colour for text on the dark header (the depth). */
  accent: RGB;
  /**
   * How bright its hall is lit, times the scene's light (1 the Mines'): a
   * stratum whose features burn bright (fire, gold) is lit less, one whose
   * dark swallows more is lit more, so each keeps to the scene's brightness
   * (luminanceAt in lib/descent.ts) at a light of about 1 where it settles,
   * and the light only eases a little through a turn. The shipped zones'
   * were measured with scripts/measure-luminance.mjs (the light each needed
   * at its second depth with this at 1); a changed or generated look's is
   * worked out from the estimate (calibrateLight in lib/descent.ts).
   */
  lightK: number;
}

/**
 * The environments the backdrop draws, one to a zone (in the order of the
 * zones): what each draws is in lib/backdrop.ts.
 */
export const ENVIRONMENTS = ['lamps', 'magma', 'frost', 'spores', 'shafts', 'void', 'mist', 'plumes', 'city', 'heat'] as const;
export const ENV = ENVIRONMENTS.length;
export type EnvName = (typeof ENVIRONMENTS)[number];

/**
 * An environment's colour range: two or three stops (0-255), what each
 * stands for its own (ENV_TONES' labels; for most, the hottest or brightest
 * first), and how far its colour wanders between them (0 to 1), across the
 * screen and slowly over time. With two, the middle stop lies half way.
 */
export interface Tone {
  colors: RGB[];
  vary: number;
}
export type Tones = Partial<Record<EnvName, Tone>>;

/**
 * What an environment's colours may be: its stops' names (the tool's),
 * its own colours (what it is drawn in where a look gives none: the zones'
 * colours before they had their own), how much each stop shows in what it
 * draws (for its brightness, see toneLuma), and the range the generator
 * keeps to (lib/backdropGen.ts, pickTone): how far it may turn the hue of
 * its own colours (degrees, either way; `follow`, how much of the turn
 * each stop takes), how far it may scale their saturation, and how much
 * they may vary. All in one place, so a new effect's rules go here.
 */
export interface ToneRule {
  labels: [string, string, string];
  tone: Tone;
  weight: [number, number, number];
  turn: [number, number];
  follow: [number, number, number];
  sat: [number, number];
  vary: [number, number];
}

export const ENV_TONES: Record<EnvName, ToneRule> = {
  // Lamplight: whiter at a flame's heart, redder where its pool fades out.
  lamps: { labels: ['Flame', 'Lamplight', 'Far glow'], tone: { colors: [[255, 196, 120], [255, 140, 50], [190, 78, 30]], vary: 0.3 }, weight: [0.25, 0.6, 0.15], turn: [-14, 12], follow: [1, 1, 1], sat: [0.85, 1.05], vary: [0.15, 0.4] },
  // Magma: yellow-white in the hottest cores, orange, then crimson as it cools; reds and oranges only.
  magma: { labels: ['White heat', 'Glow', 'Cooling red'], tone: { colors: [[255, 215, 140], [255, 70, 14], [150, 18, 4]], vary: 0.3 }, weight: [0.25, 0.6, 0.15], turn: [-14, 10], follow: [1, 1, 1], sat: [0.88, 1.04], vary: [0.2, 0.45] },
  // Frost: white where the rime is thick, ice blue, deep blue at its thin front; white to blue only.
  frost: { labels: ['Thick rime', 'Ice', 'Thin front'], tone: { colors: [[214, 228, 246], [150, 176, 208], [96, 134, 196]], vary: 0.3 }, weight: [0.35, 0.45, 0.2], turn: [-16, 20], follow: [1, 1, 1], sat: [0.6, 1.3], vary: [0.15, 0.45] },
  // Bioluminescence: a cold glow, paler in some, a sickly fringe; teal, green or cyan.
  spores: { labels: ['Glow', 'Pale', 'Fringe'], tone: { colors: [[84, 140, 130], [150, 196, 170], [112, 150, 92]], vary: 0.6 }, weight: [0.6, 0.25, 0.15], turn: [-60, 40], follow: [1, 1, 1], sat: [0.7, 1.3], vary: [0.3, 0.8] },
  // Sunlight through dust: gold, cream where brightest, ochre in thick dust.
  shafts: { labels: ['Gold', 'Brightest', 'Dusty ochre'], tone: { colors: [[255, 196, 104], [255, 232, 180], [196, 138, 64]], vary: 0.5 }, weight: [0.55, 0.3, 0.15], turn: [-12, 10], follow: [1, 1, 1], sat: [0.6, 1.1], vary: [0.2, 0.6] },
  // The void: any colour at all; paler at the heart of an arm, deeper at its reach.
  void: { labels: ['Bright core', 'Arms', 'Deep reach'], tone: { colors: [[225, 190, 255], [140, 60, 255], [64, 34, 168]], vary: 0.4 }, weight: [0.15, 0.65, 0.2], turn: [-180, 180], follow: [1, 1, 1], sat: [0.7, 1.1], vary: [0.3, 0.8] },
  // Fog: a tinted grey of any hue, paler near, deeper and cooler far.
  mist: { labels: ['Near fog', 'Fog', 'Far haze'], tone: { colors: [[124, 134, 140], [92, 102, 110], [64, 74, 86]], vary: 0.25 }, weight: [0.35, 0.45, 0.2], turn: [-180, 180], follow: [1, 1, 1], sat: [0.6, 2.2], vary: [0.1, 0.4] },
  // Sulphur: lit yellow-green at the vents, dull fumes, greyer as they thin.
  plumes: { labels: ['Vent glow', 'Fumes', 'Thinning'], tone: { colors: [[210, 235, 90], [110, 124, 46], [84, 96, 58]], vary: 0.3 }, weight: [0.3, 0.5, 0.2], turn: [-25, 25], follow: [1, 1, 1], sat: [0.75, 1.1], vary: [0.2, 0.5] },
  // The far city: a few warm windows (they keep nearly their own hue), cold lights, the fog banks.
  city: { labels: ['Warm windows', 'Cold lights', 'Fog'], tone: { colors: [[255, 217, 153], [140, 166, 255], [46, 60, 130]], vary: 0.3 }, weight: [0.05, 0.35, 0.6], turn: [-40, 50], follow: [0.25, 1, 1], sat: [0.7, 1.2], vary: [0.15, 0.5] },
  // Fire: white-hot low down, flame orange, deep red at the tips; reds and oranges only.
  heat: { labels: ['White heat', 'Flame', 'Deep red'], tone: { colors: [[255, 240, 200], [255, 96, 24], [170, 34, 12]], vary: 0.3 }, weight: [0.3, 0.55, 0.15], turn: [-12, 12], follow: [1, 1, 1], sat: [0.85, 1.05], vary: [0.2, 0.45] },
};

/** A tone's three stops (with two, the middle half way between). */
export function stopsOf(tone: Tone): [RGB, RGB, RGB] {
  const c = tone.colors;
  if (c.length >= 3) return [c[0], c[1], c[2]];
  const mid = c[0].map((v, k) => (v + c[1][k]) / 2) as RGB;
  return [c[0], mid, c[1]];
}

/** The tone a look draws environment `i` in: its own, or the environment's. */
export const toneOf = (look: Pick<Look, 'tones'>, i: number): Tone => look.tones?.[ENVIRONMENTS[i]] ?? ENV_TONES[ENVIRONMENTS[i]].tone;

const lumaOf = (c: readonly number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
/** How bright a tone of environment `i` comes out (luma, 0 to 1): its stops' as much as each shows in what it draws. */
export function toneLuma(tone: Tone, i: number): number {
  const w = ENV_TONES[ENVIRONMENTS[i]].weight;
  const s = stopsOf(tone);
  return w[0] * lumaOf(s[0]) + w[1] * lumaOf(s[1]) + w[2] * lumaOf(s[2]);
}
/** How bright environment `i` comes out in `tone`, against its own colours (1): what it adds to the scene's brightness scales so (lib/descent.ts). */
export const toneGain = (tone: Tone, i: number) => toneLuma(tone, i) / toneLuma(ENV_TONES[ENVIRONMENTS[i]].tone, i);

/** How far into a stratum's turn the next one's light, smoke and features begin to creep in (its fourth depth). */
export const HALL_FROM = 0.25;
/** How far the next stratum's light, smoke and features have come at `turn`: steadily from HALL_FROM on. */
export const hallTurn = (turn: number) => Math.min(1, Math.max(0, (turn - HALL_FROM) / (1 - HALL_FROM)));

/**
 * A stratum's embers' way of moving: one of the motion profiles
 * (lib/emberProfiles.ts, by the name of its main motion) and how it is
 * tweaked. Left as the profile has them (tweakOf there), it is the profile
 * itself.
 */
export interface MotionTweak {
  profile: string;
  /** How fast everything about them moves, times the profile's (1). */
  speed: number;
  /** Their vertical speed, a share of the classic rise: positive rises, negative falls. */
  rise: number;
  /** A sideways draught they share (positive to the right). */
  drift: number;
  /** How much they sway, shiver, curl and flicker, times the profile's (1). */
  turbulence: number;
  /** How strongly they are drawn round the backdrop's two eddies (and into them). */
  swirl: number;
}

/** What the generator (lib/backdropGen.ts) keeps to. Hues in degrees. */
export interface GenSettings {
  /** The base hues it picks from, from one to the other round the wheel (0 to 360 all of them). */
  hue: [number, number];
  /** How saturated the smoke and light are (0 grey to 1 full). */
  sat: [number, number];
  /** How dark the hall is: its dark, its colours' values (0 to 1). */
  darkness: number;
  /** How many of the environments' details it draws and how strongly (0 none; at most two, low to moderate). */
  detail: number;
  /** How many embers fill the air (0 the calm few, 1 a crowd). */
  embers: number;
}

/** A zone (depths 10k + 1 to 10k + 10): its biome, its look and its embers' motion. */
export interface ZoneBackdrop {
  name: string;
  /** Announced as it begins (all but the first). */
  announced: boolean;
  /**
   * Whether its look is the one MEASURED in lib/descent.ts was measured
   * with: if not (a look changed in the backdrop tool), the measured
   * corrections of its depths are dropped rather than applied wrongly.
   */
  measured: boolean;
  look: Look;
  motion: MotionTweak;
}

/** Past the last zone: every stratum generated, from a seed of its own. */
export interface Endgame {
  /** The seed every stratum's own is made from (seedOf in lib/backdropGen.ts). */
  seed: number;
  settings: GenSettings;
  /** Strata given a seed by hand, by their number (11: depths 101 to 110). */
  pinned: Record<string, number>;
}

export interface Backdrops {
  zones: ZoneBackdrop[];
  endgame: Endgame;
}

/** How each field of a look is kept: a colour 0-255, a colour 0-1, a tint (a multiplier about 1), a number, or the environments. */
export type FieldKind = 'rgb255' | 'rgb1' | 'tint' | 'number' | 'env' | 'tones';
/** The groups the tool shows a look in, each locked or generated as one. */
export type Group = 'light' | 'smoke' | 'haze' | 'embers' | 'glints' | 'details';

export interface FieldSpec {
  key: keyof Look;
  group: Group | null;
  label: string;
  kind: FieldKind;
  /** The range the tool's slider covers (and the check allows, for a number). */
  min: number;
  max: number;
  step: number;
}

const f = (key: keyof Look, group: Group | null, label: string, kind: FieldKind, min = 0, max = 1, step = 0.01): FieldSpec => ({ key, group, label, kind, min, max, step });

/**
 * Every field of a look, in the order the tool shows them. `group` null:
 * kept for the record but not drawn (an ember's way of moving is its
 * motion's), or worked out (lightK).
 */
export const FIELDS: FieldSpec[] = [
  f('shade', 'light', 'Hue of the dark', 'tint', 0, 1.2),
  f('dark', 'light', 'Dark', 'number', 0, 0.8),
  f('floor', 'light', 'Light from below', 'rgb255', 0, 255, 1),
  f('floorK', 'light', 'Its strength', 'number', 0, 0.5),
  f('floorH', 'light', 'Its reach', 'number', 0.6, 1.6),
  f('glow', 'light', 'Glow in the middle', 'rgb255', 0, 255, 1),
  f('lamp', 'light', 'Its strength', 'number', 0, 1),
  f('accent', 'light', 'Header colour', 'rgb255', 0, 255, 1),
  f('smoke', 'smoke', 'Low left', 'rgb255', 0, 255, 1),
  f('smokeB', 'smoke', 'Low right', 'rgb255', 0, 255, 1),
  f('smokeHi', 'smoke', 'High right', 'rgb255', 0, 255, 1),
  f('smokeHiB', 'smoke', 'High left', 'rgb255', 0, 255, 1),
  f('smokeK', 'smoke', 'Thickness', 'number', 0, 2.2),
  f('shadowK', 'smoke', 'Shadow', 'number', 0, 2),
  f('haze', 'haze', 'Haze from above', 'rgb255', 0, 255, 1),
  f('hazeK', 'haze', 'Its strength', 'number', 0, 1.2),
  f('mist', 'haze', 'Mist in the dark', 'rgb255', 0, 255, 1),
  f('mistK', 'haze', 'Its strength', 'number', 0, 0.12, 0.005),
  f('ember', 'embers', 'Halo', 'rgb1'),
  f('core', 'embers', 'Core', 'rgb1'),
  f('coreMix', 'embers', 'Core heat', 'number'),
  f('crowd', 'embers', 'Count', 'number'),
  f('size', 'embers', 'Size', 'number', 0.5, 2),
  f('bright', 'embers', 'Brightness', 'number', 0.5, 1.6),
  f('agit', 'embers', 'Restless', 'number'),
  f('burst', 'embers', 'Bursts', 'number'),
  f('speed', null, 'Speed (legacy)', 'number', 0, 3),
  f('fall', null, 'Fall (legacy)', 'number'),
  f('glint', 'glints', 'Colour', 'rgb1'),
  f('glints', 'glints', 'Amount', 'number'),
  f('spread', 'glints', 'Spread', 'number'),
  f('env', 'details', 'Details', 'env'),
  f('tones', 'details', 'Colours', 'tones'),
  f('eddy', null, 'Eddies (legacy)', 'number'),
  f('lightK', null, 'Light', 'number', 0.1, 4),
];

export const GROUPS: { id: Group | 'motion'; label: string }[] = [
  { id: 'light', label: 'Light and dark' },
  { id: 'smoke', label: 'Smoke' },
  { id: 'haze', label: 'Haze' },
  { id: 'embers', label: 'Embers' },
  { id: 'glints', label: 'Glints' },
  { id: 'details', label: 'Details' },
  { id: 'motion', label: 'Motion' },
];

/** The ranges the tool's motion sliders cover (and the check allows). */
export const MOTION_RANGES: Record<Exclude<keyof MotionTweak, 'profile'>, [number, number, string]> = {
  speed: [0.3, 2, 'Speed'],
  rise: [-1.2, 2.5, 'Rise or fall'],
  drift: [-0.4, 0.4, 'Drift'],
  turbulence: [0, 2, 'Turbulence'],
  swirl: [0, 1.5, 'Swirl'],
};

// ---- checking ----------------------------------------------------------------

const isNum = (v: unknown, lo = -Infinity, hi = Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isRGB = (v: unknown, hi: number) => Array.isArray(v) && v.length === 3 && v.every((c) => isNum(c, 0, hi));

/** What is wrong with a look's tones. */
function tonesErrors(v: unknown, at: string): string[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [`${at}: an object of colour ranges by environment`];
  const errors: string[] = [];
  for (const [name, t] of Object.entries(v as Record<string, unknown>)) {
    const w = `${at}.${name}`;
    if (!(ENVIRONMENTS as readonly string[]).includes(name)) {
      errors.push(`${w}: not an environment`);
      continue;
    }
    const o = t as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') {
      errors.push(`${w}: not an object`);
      continue;
    }
    if (!Array.isArray(o.colors) || o.colors.length < 2 || o.colors.length > 3 || !o.colors.every((c) => isRGB(c, 255))) errors.push(`${w}.colors: two or three colours, three numbers from 0 to 255 each`);
    if (!isNum(o.vary, 0, 1)) errors.push(`${w}.vary: a number from 0 to 1`);
    for (const key of Object.keys(o)) if (key !== 'colors' && key !== 'vary') errors.push(`${w}.${key}: not a field of a colour range`);
  }
  return errors;
}

/** What is wrong with a look (nothing: an empty list). */
export function lookErrors(look: unknown, where = 'look'): string[] {
  if (!look || typeof look !== 'object') return [`${where}: not an object`];
  const o = look as Record<string, unknown>;
  const errors: string[] = [];
  for (const spec of FIELDS) {
    const v = o[spec.key];
    const at = `${where}.${spec.key}`;
    if (spec.kind === 'rgb255' && !isRGB(v, 255)) errors.push(`${at}: three numbers from 0 to 255`);
    else if (spec.kind === 'rgb1' && !isRGB(v, 1)) errors.push(`${at}: three numbers from 0 to 1`);
    else if (spec.kind === 'tint' && !isRGB(v, 2)) errors.push(`${at}: three numbers from 0 to 2`);
    else if (spec.kind === 'env' && !(Array.isArray(v) && v.length === ENV && v.every((e) => isNum(e, 0, 1)))) errors.push(`${at}: ${ENV} numbers from 0 to 1`);
    else if (spec.kind === 'tones') errors.push(...tonesErrors(v, at));
    else if (spec.kind === 'number' && !isNum(v, 0, Math.max(spec.max, 5))) errors.push(`${at}: a number from 0 to ${Math.max(spec.max, 5)}`);
  }
  for (const key of Object.keys(o)) if (!FIELDS.some((s) => s.key === key)) errors.push(`${where}.${key}: not a field of a look`);
  if (isNum(o.dark) && o.dark > 0.8) errors.push(`${where}.dark: at most 0.8`);
  if (isNum(o.floorK) && o.floorK > 0.5) errors.push(`${where}.floorK: at most 0.5`);
  if (isNum(o.lightK) && o.lightK <= 0) errors.push(`${where}.lightK: more than 0`);
  return errors;
}

/** What is wrong with a motion (`profiles`: the names it may take). */
export function motionErrors(m: unknown, profiles: readonly string[], where = 'motion'): string[] {
  if (!m || typeof m !== 'object') return [`${where}: not an object`];
  const o = m as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof o.profile !== 'string' || !profiles.includes(o.profile)) errors.push(`${where}.profile: one of ${profiles.join(', ')}`);
  for (const [key, [lo, hi]] of Object.entries(MOTION_RANGES)) if (!isNum(o[key], lo, hi)) errors.push(`${where}.${key}: a number from ${lo} to ${hi}`);
  for (const key of Object.keys(o)) if (key !== 'profile' && !(key in MOTION_RANGES)) errors.push(`${where}.${key}: not a field of a motion`);
  return errors;
}

/** What is wrong with generator settings. */
export function settingsErrors(s: unknown, where = 'settings'): string[] {
  if (!s || typeof s !== 'object') return [`${where}: not an object`];
  const o = s as Record<string, unknown>;
  const errors: string[] = [];
  const pair = (v: unknown, hi: number) => Array.isArray(v) && v.length === 2 && v.every((x) => isNum(x, 0, hi));
  if (!pair(o.hue, 360)) errors.push(`${where}.hue: two numbers from 0 to 360`);
  if (!pair(o.sat, 1) || (o.sat as number[])[0] > (o.sat as number[])[1]) errors.push(`${where}.sat: two numbers from 0 to 1, the first the lower`);
  for (const key of ['darkness', 'detail', 'embers']) if (!isNum(o[key], 0, 1)) errors.push(`${where}.${key}: a number from 0 to 1`);
  return errors;
}

/**
 * What is wrong with a whole backdrops file (nothing: an empty list).
 * `zoneNames`: the zones it must hold, in order (their names never change:
 * the zone ribbon, sigils and codex go by them).
 */
export function backdropsErrors(data: unknown, zoneNames: readonly string[], profiles: readonly string[]): string[] {
  if (!data || typeof data !== 'object') return ['not an object'];
  const o = data as Record<string, unknown>;
  const errors: string[] = [];
  if (!Array.isArray(o.zones) || o.zones.length !== zoneNames.length) errors.push(`zones: ${zoneNames.length} of them`);
  else
    o.zones.forEach((z: unknown, k: number) => {
      const at = `zones[${k}]`;
      if (!z || typeof z !== 'object') return errors.push(`${at}: not an object`);
      const zo = z as Record<string, unknown>;
      if (zo.name !== zoneNames[k]) errors.push(`${at}.name: ${zoneNames[k]}`);
      if (typeof zo.announced !== 'boolean') errors.push(`${at}.announced: true or false`);
      if (typeof zo.measured !== 'boolean') errors.push(`${at}.measured: true or false`);
      errors.push(...lookErrors(zo.look, `${at}.look`), ...motionErrors(zo.motion, profiles, `${at}.motion`));
    });
  const e = o.endgame as Record<string, unknown> | undefined;
  if (!e || typeof e !== 'object') errors.push('endgame: not an object');
  else {
    if (!isNum(e.seed, 0, 0xffffffff) || !Number.isInteger(e.seed)) errors.push('endgame.seed: a whole number from 0 to 4294967295');
    errors.push(...settingsErrors(e.settings, 'endgame.settings'));
    if (!e.pinned || typeof e.pinned !== 'object' || Array.isArray(e.pinned)) errors.push('endgame.pinned: an object');
    else
      for (const [n, seed] of Object.entries(e.pinned)) {
        if (!/^\d+$/.test(n) || Number(n) <= zoneNames.length) errors.push(`endgame.pinned.${n}: a stratum past the zones (from ${zoneNames.length + 1})`);
        if (!isNum(seed, 0, 0xffffffff) || !Number.isInteger(seed)) errors.push(`endgame.pinned.${n}: a whole number from 0 to 4294967295`);
      }
  }
  return errors;
}

// ---- writing -----------------------------------------------------------------

/**
 * Gives every look in `data` (a backdrops file, or a draft kept from
 * before environments had colours of their own) that has no tones the
 * colours it was drawn in then: its environments' own (ENV_TONES). In place;
 * returns `data`.
 */
export function withTones<T>(data: T): T {
  const fix = (look: unknown) => {
    if (!look || typeof look !== 'object' || 'tones' in look) return;
    const l = look as Record<string, unknown>;
    const env = Array.isArray(l.env) ? (l.env as unknown[]) : [];
    const tones: Tones = {};
    env.forEach((e, i) => {
      if (typeof e === 'number' && e > 0 && i < ENV) tones[ENVIRONMENTS[i]] = cloneData(ENV_TONES[ENVIRONMENTS[i]].tone);
    });
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(l)) {
      next[k] = v;
      if (k === 'env') next.tones = tones;
    }
    if (!('tones' in next)) next.tones = tones;
    for (const k of Object.keys(l)) delete l[k];
    Object.assign(l, next);
  };
  const o = data as Record<string, unknown> | null;
  if (o && typeof o === 'object' && Array.isArray(o.zones)) for (const z of o.zones) fix((z as Record<string, unknown> | null)?.look);
  return data;
}

/** A deep copy (the data is plain JSON). */
export const cloneData = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * The backdrops as the file keeps them: two spaces in, every list of numbers
 * (a colour, the environments) and every colour range (an environment's
 * colours and their variation) on one line, so a change shows as a change
 * of a line or two.
 */
export function formatBackdrops(data: Backdrops): string {
  const numbers = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'number');
  const out = (v: unknown, pad: string): string => {
    if (Array.isArray(v)) {
      if (numbers(v)) return `[${v.join(', ')}]`;
      if (v.length && v.every(numbers)) return `[${v.map((x) => out(x, pad)).join(', ')}]`;
      if (!v.length) return '[]';
      return `[\n${v.map((x) => pad + '  ' + out(x, pad + '  ')).join(',\n')}\n${pad}]`;
    }
    if (v && typeof v === 'object') {
      const entries = Object.entries(v);
      if (!entries.length) return '{}';
      if ('colors' in v) return `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${out(x, pad)}`).join(', ')} }`;
      return `{\n${entries.map(([k, x]) => `${pad}  ${JSON.stringify(k)}: ${out(x, pad + '  ')}`).join(',\n')}\n${pad}}`;
    }
    return JSON.stringify(v);
  };
  return out(data, '') + '\n';
}
