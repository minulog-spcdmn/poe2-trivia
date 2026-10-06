// How deep the scene is: Delve's depth turned into what the backdrop, its
// embers and the ambience follow. The descent passes through strata, one
// every ten depths, each a place of its own: the light welling up from
// below, the smoke and its colours, how dark the hall is, what the embers
// burn like and how they move, what glints in the walls, and the features
// the backdrop draws for it alone (the environments: magma veins, frost,
// spore light, shafts of light, ...). Each is named after a Delve biome.
//
// One place turns into the next steadily, a little with every depth, never
// all at once: through a stratum a growing share of the embers burns in the
// next one's colour (a tenth at its second depth, nine tenths at its last),
// and from its fourth depth on the next one's light, smoke and features
// creep in as its own recede, so the next is all there when its name is
// announced. Past depth 100 the strata go on for ever, each pairing the
// hall of one deep stratum with the embers of another (and half its
// features), so no two in a row look alike, and each is announced by its
// hall's biome again.
//
// And the deeper, the darker, never the other way: the dark draws in from
// the edges a little with every depth, and the scene's light is set (`light`,
// see the luminance estimate below) so its average brightness only ever
// falls, however bright a stratum's fire or gold. Each new depth sinks the
// scene a little further as its cards are dealt (plunge). Pure, apart from
// the eased channel and the plunge at the bottom that the backdrop reads.

type RGB = [number, number, number];

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
   * right, high right, high left; see BLOBS), so the colours mix as they
   * pass each other, as on the start page; their opacity, and the shadow's.
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
  /** The stratum's colour for text on the dark header (the depth). */
  accent: RGB;
  /**
   * How bright its hall is lit, times the scene's light (1 the Mines'): a
   * stratum whose features burn bright (fire, gold) is lit less, one whose
   * dark swallows more is lit more, so each keeps to the scene's brightness
   * (luminanceAt) at a light (Descent.light) of about 1 where it settles,
   * and the light only eases a little through a turn. Measured with
   * scripts/measure-luminance.mjs: the light each needed at its second depth
   * with this at 1.
   */
  lightK: number;
}

/**
 * The environments the backdrop draws, one to a stratum through 100 (the
 * order of STRATA): what each draws is in lib/backdrop.ts.
 */
export const ENVIRONMENTS = ['lamps', 'magma', 'frost', 'spores', 'shafts', 'void', 'mist', 'plumes', 'city', 'heat'] as const;
export const ENV = ENVIRONMENTS.length;
/** Only environment `k` (the rest 0). */
const only = (k: number) => ENVIRONMENTS.map((_, i) => (i === k ? 1 : 0));

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
  accent: [238, 206, 140],
  lightK: 1,
};

/**
 * The strata, depths 1-10, 11-20, ... 91-100, each named after a Delve biome
 * of Path of Exile and announced by it as it begins (the Mines, depths 1 to
 * 10, are where every run starts, so they aren't). Each mixes colours the
 * way the start page does: a few neighbouring hues in its smoke, one in the
 * light from below, another in the haze above and the glow between, so the
 * colours shift as the smoke drifts, rather than one flat tint.
 */
export const STRATA: { name: string; announced: boolean; look: Look }[] = [
  {
    // The mines: the usual hall, its fire below a little stronger, its smoke a little thicker.
    name: 'The Mines',
    announced: false,
    look: {
      shade: [0.84, 0.78, 0.72], dark: 0.12,
      floor: [170, 76, 24], floorK: 0.22, floorH: 1.1,
      haze: [122, 94, 58], hazeK: 0.45, glow: [205, 152, 80], lamp: 0.6,
      smoke: [158, 74, 26], smokeB: [128, 46, 22], smokeHi: [138, 104, 58], smokeHiB: [106, 74, 44], smokeK: 0.9, shadowK: 1.15,
      mist: [120, 56, 20], mistK: 0.05,
      ember: [1, 0.5, 0.13], core: [1, 0.88, 0.6], coreMix: 0.58,
      crowd: 0.4, speed: 1.15, size: 1.05, bright: 1.1, agit: 0.2, fall: 0,
      glint: [1, 0.6, 0.2], glints: 0, spread: 0,
      burst: 0, eddy: 0, env: only(0), accent: [240, 172, 96], lightK: 1,
    },
  },
  {
    // Magma: vermilion and crimson smoke, wine and sienna above, the glow of
    // the fissures orange; heavy slow embers, garnet in the walls.
    name: 'Magma Fissure',
    announced: true,
    look: {
      shade: [1, 0.74, 0.7], dark: 0.3,
      floor: [150, 32, 14], floorK: 0.4, floorH: 1.2,
      haze: [96, 40, 56], hazeK: 0.6, glow: [210, 98, 50], lamp: 0.7,
      smoke: [150, 42, 16], smokeB: [112, 20, 28], smokeHi: [124, 60, 32], smokeHiB: [86, 26, 42], smokeK: 1.5, shadowK: 1.3,
      mist: [105, 16, 20], mistK: 0.07,
      ember: [1, 0.2, 0.08], core: [1, 0.62, 0.48], coreMix: 0.5,
      crowd: 0.3, speed: 0.8, size: 1.25, bright: 1.1, agit: 0.25, fall: 0,
      glint: [1, 0.26, 0.16], glints: 0.35, spread: 0,
      burst: 1, eddy: 0, env: only(1), accent: [255, 116, 88], lightK: 0.88,
    },
  },
  {
    // Frozen: azure and teal smoke, periwinkle and slate above, a pale ice
    // glow; frost creeping in from the walls, ice motes drifting down.
    name: 'Frozen Hollow',
    announced: true,
    look: {
      shade: [0.78, 0.86, 1.1], dark: 0.38,
      floor: [36, 100, 176], floorK: 0.38, floorH: 1.15,
      haze: [96, 92, 150], hazeK: 0.6, glow: [140, 176, 214], lamp: 0.6,
      smoke: [36, 98, 170], smokeB: [26, 118, 128], smokeHi: [88, 98, 172], smokeHiB: [58, 60, 132], smokeK: 1.4, shadowK: 1.3,
      mist: [34, 70, 124], mistK: 0.06,
      ember: [0.38, 0.64, 1], core: [0.86, 0.94, 1], coreMix: 0.62,
      crowd: 0.45, speed: 0.55, size: 1, bright: 1.25, agit: 0.3, fall: 1,
      glint: [0.44, 0.72, 1], glints: 1, spread: 0,
      burst: 0, eddy: 0, env: only(2), accent: [150, 202, 255], lightK: 0.69,
    },
  },
  {
    // Fungal: moss and teal-green smoke, olive above with a mauve shadow
    // drifting through, a pale green glow; spore light pulsing low in the walls.
    name: 'Fungal Caverns',
    announced: true,
    look: {
      shade: [0.84, 1, 0.8], dark: 0.45,
      floor: [80, 136, 36], floorK: 0.36, floorH: 1.1,
      haze: [40, 90, 78], hazeK: 0.5, glow: [150, 196, 98], lamp: 0.5,
      smoke: [86, 134, 30], smokeB: [26, 116, 88], smokeHi: [104, 112, 40], smokeHiB: [84, 60, 96], smokeK: 1.4, shadowK: 1.4,
      mist: [48, 100, 40], mistK: 0.08,
      ember: [0.66, 0.96, 0.28], core: [0.92, 1, 0.66], coreMix: 0.5,
      crowd: 0.55, speed: 0.45, size: 1.3, bright: 1, agit: 0.6, fall: 0.3,
      glint: [0.72, 1, 0.36], glints: 0.25, spread: 0.3,
      burst: 0, eddy: 0.2, env: only(3), accent: [166, 232, 112], lightK: 0.55,
    },
  },
  {
    // Vaal gold: gold and amber smoke, sand and terracotta above, dusty
    // shafts of light from above on carved stone, gold dust sifting down.
    name: 'Vaal Outpost',
    announced: true,
    look: {
      shade: [1, 0.88, 0.7], dark: 0.5,
      floor: [196, 138, 44], floorK: 0.36, floorH: 1.0,
      haze: [170, 116, 74], hazeK: 0.7, glow: [222, 178, 98], lamp: 0.7,
      smoke: [176, 124, 32], smokeB: [168, 80, 26], smokeHi: [168, 136, 70], smokeHiB: [140, 70, 58], smokeK: 1.3, shadowK: 1.4,
      mist: [146, 104, 32], mistK: 0.06,
      ember: [1, 0.82, 0.36], core: [1, 0.97, 0.84], coreMix: 0.62,
      crowd: 0.35, speed: 0.45, size: 0.75, bright: 1.2, agit: 0.1, fall: 0.6,
      glint: [1, 0.86, 0.44], glints: 1, spread: 0.35,
      burst: 0, eddy: 0, env: only(4), accent: [242, 204, 106], lightK: 0.49,
    },
  },
  {
    // The abyss: violet and indigo smoke, magenta-plum above, a lilac glow;
    // void coiling in the dark, embers pulled round in its eddies.
    name: 'Abyssal Depths',
    announced: true,
    look: {
      shade: [0.86, 0.74, 1.1], dark: 0.6,
      floor: [104, 44, 164], floorK: 0.4, floorH: 1.2,
      haze: [50, 50, 120], hazeK: 0.5, glow: [160, 112, 210], lamp: 0.5,
      smoke: [96, 40, 150], smokeB: [58, 32, 124], smokeHi: [118, 42, 108], smokeHiB: [46, 46, 106], smokeK: 1.6, shadowK: 1.5,
      mist: [84, 32, 144], mistK: 0.08,
      ember: [0.74, 0.38, 1], core: [0.95, 0.86, 1], coreMix: 0.55,
      crowd: 0.7, speed: 1.35, size: 0.9, bright: 1.15, agit: 0.85, fall: 0,
      glint: [0.82, 0.54, 1], glints: 0.6, spread: 0.5,
      burst: 0, eddy: 1, env: only(5), accent: [198, 152, 255], lightK: 1.13,
    },
  },
  {
    // Petrified: sage and blue-grey smoke, warm ash and lichen above;
    // stone trunks in a pale fog that drifts in layers, ash flakes falling.
    name: 'Petrified Forest',
    announced: true,
    look: {
      shade: [0.9, 0.95, 1], dark: 0.55,
      floor: [120, 128, 100], floorK: 0.26, floorH: 1.3,
      haze: [92, 112, 136], hazeK: 0.6, glow: [176, 184, 172], lamp: 0.4,
      smoke: [70, 94, 78], smokeB: [62, 78, 108], smokeHi: [106, 90, 70], smokeHiB: [70, 92, 66], smokeK: 1.3, shadowK: 1.2,
      mist: [98, 110, 118], mistK: 0.08,
      ember: [0.74, 0.9, 0.92], core: [1, 1, 1], coreMix: 0.7,
      crowd: 0.3, speed: 0.4, size: 1.6, bright: 0.8, agit: 0.25, fall: 0.75,
      glint: [0.85, 0.95, 1], glints: 0, spread: 0,
      burst: 0, eddy: 0, env: only(6), accent: [204, 214, 222], lightK: 0.58,
    },
  },
  {
    // Sulphur vents: sulphur and green smoke, ochre and teal above;
    // yellow-green fumes billowing up from below in columns.
    name: 'Sulphur Vents',
    announced: true,
    look: {
      shade: [0.82, 1, 0.88], dark: 0.62,
      floor: [62, 110, 52], floorK: 0.3, floorH: 1.0,
      haze: [128, 128, 50], hazeK: 0.7, glow: [184, 200, 94], lamp: 0.4,
      smoke: [108, 116, 32], smokeB: [56, 98, 62], smokeHi: [120, 104, 44], smokeHiB: [40, 88, 82], smokeK: 1.5, shadowK: 1.4,
      mist: [70, 100, 50], mistK: 0.07,
      ember: [0.5, 1, 0.68], core: [0.88, 1, 0.9], coreMix: 0.55,
      crowd: 0.5, speed: 0.6, size: 1, bright: 1.1, agit: 0.3, fall: 0,
      glint: [0.76, 1, 0.52], glints: 0.4, spread: 0.7,
      burst: 0.15, eddy: 0, env: only(7), accent: [214, 232, 104], lightK: 0.55,
    },
  },
  {
    // The drowned city: navy and indigo smoke, a faint teal and violet
    // above, near black; a few still motes, far cold lights at many depths.
    name: 'Abyssal City',
    announced: true,
    look: {
      shade: [0.84, 0.84, 1.1], dark: 0.72,
      floor: [58, 44, 126], floorK: 0.46, floorH: 1.0,
      haze: [28, 58, 92], hazeK: 0.6, glow: [96, 104, 176], lamp: 0.5,
      smoke: [34, 44, 104], smokeB: [52, 32, 96], smokeHi: [28, 64, 100], smokeHiB: [60, 44, 118], smokeK: 1.8, shadowK: 1.5,
      mist: [34, 30, 84], mistK: 0.08,
      ember: [0.56, 0.64, 1], core: [1, 1, 1], coreMix: 0.75,
      crowd: 0, speed: 0.25, size: 0.7, bright: 1.4, agit: 0.05, fall: 0,
      glint: [0.75, 0.8, 1], glints: 1, spread: 1,
      burst: 0, eddy: 0, env: only(8), accent: [156, 170, 236], lightK: 1.52,
    },
  },
  {
    // Primeval: the bottom of the world, orange and blood-red smoke over
    // soot and smoky brown, white-hot fire roaring below black smoke.
    name: 'Primeval Ruins',
    announced: true,
    look: {
      shade: [1, 0.64, 0.52], dark: 0.62,
      floor: [206, 74, 16], floorK: 0.42, floorH: 1.35,
      haze: [90, 22, 20], hazeK: 0.35, glow: [232, 140, 62], lamp: 0.4,
      smoke: [112, 40, 14], smokeB: [84, 20, 14], smokeHi: [46, 24, 18], smokeHiB: [62, 30, 20], smokeK: 1.6, shadowK: 1.6,
      mist: [150, 46, 12], mistK: 0.06,
      ember: [1, 0.42, 0.08], core: [1, 0.95, 0.8], coreMix: 0.72,
      crowd: 1, speed: 1.9, size: 1.1, bright: 1.3, agit: 0.9, fall: 0,
      glint: [1, 0.38, 0.12], glints: 0.7, spread: 0.15,
      burst: 0.7, eddy: 0.25, env: only(9), accent: [255, 222, 176], lightK: 0.59,
    },
  },
];

/** Past the last stratum, the strata it pairs come from these (all but the first). */
const DEEP = STRATA.slice(1);
/** The parts of a look that make the hall; the rest are its embers and glints. */
const HALL_KEYS = ['shade', 'dark', 'floor', 'floorK', 'floorH', 'haze', 'hazeK', 'glow', 'lamp', 'smoke', 'smokeB', 'smokeHi', 'smokeHiB', 'smokeK', 'shadowK', 'mist', 'mistK', 'accent', 'lightK'] as const;

/**
 * Past the last stratum: the hall of one deep stratum with the embers of
 * another. The hall steps by 4 of 9 each time, so it never repeats twice in
 * a row, and the embers never match the hall.
 */
function pairing(k: number): { hall: number; embers: number } {
  const hall = (k * 4) % DEEP.length;
  let embers = (k * 7 + 3) % DEEP.length;
  if (embers === hall) embers = (embers + 1) % DEEP.length;
  return { hall, embers };
}

/** The looks past the last stratum, made once each (they are read every frame). */
const paired = new Map<number, Look>();

/**
 * The look of stratum `k` (-1 is the surface, 0 depths 1 to 10, and on for
 * ever). Past the last, the hall's environment and half the embers'.
 */
export function lookOf(k: number): Look {
  if (k < 0) return SURFACE;
  if (k < STRATA.length) return STRATA[k].look;
  let look = paired.get(k);
  if (look) return look;
  const { hall, embers } = pairing(k);
  look = { ...DEEP[embers].look };
  for (const key of HALL_KEYS) (look as unknown as Record<string, unknown>)[key] = DEEP[hall].look[key];
  look.env = DEEP[hall].look.env.map((v, i) => Math.min(1, v + 0.5 * DEEP[embers].look.env[i]));
  if (paired.size > 64) paired.clear();
  paired.set(k, look);
  return look;
}

/** The biome stratum `k` is named after: past the last, the one whose hall it has. */
export function stratumName(k: number): string {
  if (k < STRATA.length) return STRATA[Math.max(0, k)].name;
  return DEEP[pairing(k).hall].name;
}

/**
 * The stratum a depth is turning into, and how far (0 to 1): through
 * stratum k (depths 10k + 1 to 10k + 10) the scene turns steadily into
 * stratum k + 1, a tenth of the way with every depth, and is it at 10k + 11.
 * Below depth 1 (only while the scene eases in) the surface turns into the
 * first stratum.
 */
export function strataAt(depth: number): { stratum: number; turn: number } {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  if (d < 1) return { stratum: 0, turn: d };
  const k = Math.floor((d - 1) / 10);
  return { stratum: k + 1, turn: (d - 1) / 10 - k };
}

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
  /** What the scene looks like: the stratum before and this one, blended. */
  look: Look;
}

/** The depth the azure stratum is announced (the blue streaks begin there). Its embers come in through the ten before. */
export const BLUE_FROM = 21;
export const ABYSS_FROM = 50;
export const ABYSS_FULL = 75;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Every key of a look, in one order (worked out once: looks are blended every frame a depth eases in). */
const KEYS = Object.keys(SURFACE) as (keyof Look)[];
type Fields = Record<string, number | number[]>;

/** A look to write into (see mixInto). */
function blank(): Look {
  const look = { ...SURFACE };
  for (const key of KEYS) {
    const v = look[key];
    if (Array.isArray(v)) (look as Record<string, unknown>)[key] = [...v];
  }
  return look;
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

/** The parts of a look the embers follow, a tenth of the way with every depth of a stratum. */
const EMBER_KEYS = new Set<string>(['ember', 'core', 'coreMix', 'crowd', 'speed', 'size', 'bright', 'agit', 'fall']);
/** Whether each of KEYS is one of them. */
const IS_EMBER = KEYS.map((key) => EMBER_KEYS.has(key));
/** How far into a stratum's turn the next one's light, smoke and features begin to creep in (its fourth depth). */
export const HALL_FROM = 0.25;
/** How far the next stratum's light, smoke and features have come at `turn`: steadily from HALL_FROM on. */
export const hallTurn = (turn: number) => clamp01((turn - HALL_FROM) / (1 - HALL_FROM));

/**
 * Writes stratum `a` turning `t` of the way into `b` into `out`: the embers
 * follow `t` itself; the light, smoke and features follow hallTurn(t). An
 * environment the two share stays as it is.
 */
function turnInto(out: Look, a: Look, b: Look, t: number): Look {
  const h = hallTurn(t);
  for (let k = 0; k < KEYS.length; k++) mixField(out as unknown as Fields, a as unknown as Fields, b as unknown as Fields, KEYS[k], IS_EMBER[k] ? t : h);
  out.lightK = mixLight(a.lightK, b.lightK, h);
  for (let i = 0; i < ENV; i++) out.env[i] = Math.max(a.env[i] + (b.env[i] - a.env[i]) * h, Math.min(a.env[i], b.env[i]));
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
 * at full strength, less the same without it.
 */
export const ENV_ADD: number[][] = [
  [0, 0.00189, 0.0068, 0.0113, 0.01353],
  [0, 0.00438, 0.00757, 0.01098, 0.01532],
  [0, 0.00004, 0.00011, 0.00019, 0.00027],
  [0, 0.00356, 0.0074, 0.01162, 0.01692],
  [0, 0.00283, 0.00918, 0.01471, 0.01831],
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
  [1, 1.043, 1.114, 1.198, 1.281],
  [1, 1.004, 1.004, 1.004, 1.004],
  [1, 1.002, 1.004, 1.006, 1.007],
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
 * 280, a round of the strata past 190 (they come round every 90 depths, as
 * their pairings do; by then the dark has all but closed in and the rest
 * levelled off, so what comes after looks like it). Measured by
 * scripts/measure-luminance.mjs (calibrate) with the ENV_ tables in place.
 * Empty, the estimate stands as it is.
 */
export const MEASURED: (readonly [number, number])[] = [
  [0.943, 0.974], [0.944, 0.976], [0.944, 0.978], [0.944, 1.044], [0.941, 1.002], [0.938, 0.974], [0.939, 0.979], [0.937, 0.961],
  [0.94, 0.977], [0.938, 0.953], [0.945, 0.988], [0.946, 0.985], [0.946, 0.982], [0.935, 0.967], [0.942, 0.962], [0.953, 0.953],
  [0.956, 0.939], [0.954, 0.925], [0.95, 0.903], [0.946, 0.98], [0.935, 0.762], [0.934, 0.721], [0.933, 0.685], [0.936, 0.711],
  [0.939, 0.807], [0.943, 0.845], [0.95, 0.866], [0.956, 0.876], [0.967, 0.888], [0.965, 0.889], [0.982, 0.907], [0.982, 0.917],
  [0.982, 0.925], [0.982, 0.897], [0.982, 0.909], [0.982, 0.95], [0.982, 0.974], [0.982, 1], [0.982, 1.004], [0.985, 1.019],
  [0.987, 1.006], [0.987, 1.005], [0.987, 1.003], [0.989, 1.011], [0.989, 1.003], [0.99, 0.988], [0.99, 0.963], [0.993, 0.925],
  [0.994, 0.917], [0.999, 0.807], [1, 0.933], [1, 0.907], [1, 0.882], [1.001, 0.837], [1.009, 0.768], [1.019, 0.686],
  [1.028, 0.61], [1.044, 0.535], [1.043, 0.481], [1.03, 0.45], [1.032, 0.486], [1.032, 0.485], [1.032, 0.485], [1.022, 0.567],
  [1.023, 0.671], [1.027, 0.755], [1.022, 0.808], [1.019, 0.853], [1.023, 0.875], [1.025, 0.904], [1.033, 0.921], [1.033, 0.938],
  [1.033, 0.955], [1.036, 0.944], [1.039, 0.967], [1.041, 1.008], [1.04, 1.012], [1.037, 1.027], [1.032, 1.091], [1.024, 1.188],
  [1.012, 1.276], [1.012, 1.257], [1.012, 1.236], [1.009, 1.267], [0.998, 1.092], [0.989, 0.999], [0.982, 0.959], [0.975, 0.927],
  [0.969, 0.893], [0.965, 0.843], [0.959, 0.838], [0.959, 0.842], [0.958, 0.845], [0.957, 0.836], [0.954, 0.827], [0.957, 0.817],
  [0.963, 0.816], [0.968, 0.813], [0.965, 0.827], [0.972, 0.905], [0.974, 0.896], [0.974, 0.903], [0.973, 0.909], [0.974, 1.034],
  [0.967, 0.933], [0.965, 0.888], [0.963, 0.882], [0.958, 0.884], [0.951, 0.903], [0.955, 0.908], [0.961, 0.92], [0.961, 0.914],
  [0.961, 0.909], [0.962, 0.886], [0.96, 0.882], [0.96, 0.9], [0.961, 0.917], [0.961, 0.945], [0.962, 0.961], [0.965, 1.008],
  [0.968, 0.96], [0.967, 0.963], [0.968, 0.966], [0.972, 0.952], [0.979, 0.934], [0.986, 0.927], [0.992, 0.906], [0.999, 0.892],
  [1.006, 0.947], [1.01, 1.003], [1.005, 1.133], [1.005, 1.133], [1.004, 1.134], [1.003, 1.082], [0.997, 0.958], [0.991, 0.909],
  [0.985, 0.925], [0.982, 0.942], [0.98, 0.955], [0.979, 0.964], [0.976, 1.02], [0.976, 1.019], [0.976, 1.017], [0.978, 1.034],
  [0.978, 1.026], [0.982, 1.012], [0.988, 1.001], [0.998, 0.977], [1.006, 0.965], [1.019, 0.974], [1.031, 0.993], [1.031, 0.994],
  [1.031, 0.996], [1.015, 0.983], [0.99, 0.966], [0.966, 0.975], [0.937, 0.993], [0.912, 1.047], [0.891, 1.123], [0.873, 1.241],
  [0.857, 1.383], [0.857, 1.351], [0.857, 1.317], [0.862, 1.266], [0.876, 1.188], [0.893, 1.112], [0.917, 1.036], [0.946, 0.963],
  [0.975, 0.893], [0.983, 0.852], [1.019, 0.862], [1.019, 0.876], [1.019, 0.891], [1.013, 0.888], [1.016, 0.814], [1.015, 0.844],
  [0.999, 0.929], [0.979, 0.957], [0.969, 0.973], [0.949, 0.978], [0.944, 0.994], [0.944, 0.992], [0.944, 0.989], [0.939, 0.975],
  [0.936, 0.961], [0.939, 0.936], [0.945, 0.91], [0.95, 0.844], [0.948, 0.803], [0.956, 0.85], [0.958, 0.895], [0.958, 0.902],
  [0.958, 0.909], [0.96, 1.014], [0.956, 0.913], [0.956, 0.866], [0.956, 0.86], [0.953, 0.861], [0.949, 0.881], [0.954, 0.886],
  [0.96, 0.898], [0.96, 0.893], [0.96, 0.888], [0.961, 0.865], [0.959, 0.861], [0.959, 0.881], [0.96, 0.901], [0.961, 0.932],
  [0.962, 0.951], [0.965, 1], [0.967, 0.957], [0.967, 0.96], [0.967, 0.964], [0.972, 0.95], [0.979, 0.936], [0.985, 0.933],
  [0.991, 0.915], [0.999, 0.904], [1.005, 0.966], [1.008, 1.032], [1.003, 1.169], [1.003, 1.169], [1.003, 1.17], [1.002, 1.115],
  [0.996, 0.981], [0.99, 0.926], [0.984, 0.937], [0.981, 0.951], [0.979, 0.961], [0.978, 0.966], [0.976, 1.021], [0.976, 1.019],
  [0.976, 1.018], [0.977, 1.034], [0.978, 1.024], [0.982, 1.011], [0.988, 0.999], [0.998, 0.975], [1.006, 0.962], [1.02, 0.972],
  [1.031, 0.991], [1.031, 0.992], [1.031, 0.994], [1.015, 0.981], [0.989, 0.965], [0.964, 0.977], [0.934, 0.999], [0.908, 1.057],
  [0.886, 1.136], [0.867, 1.26], [0.85, 1.415], [0.85, 1.38], [0.85, 1.344], [0.856, 1.288], [0.872, 1.206], [0.89, 1.125],
  [0.915, 1.045], [0.945, 0.967], [0.975, 0.894], [0.984, 0.849], [1.02, 0.858], [1.02, 0.873], [1.02, 0.888], [1.015, 0.886],
  [1.018, 0.812], [1.015, 0.842], [0.999, 0.926], [0.979, 0.955], [0.969, 0.971], [0.949, 0.977], [0.944, 0.993], [0.944, 0.991],
  [0.944, 0.988], [0.939, 0.974], [0.936, 0.96], [0.938, 0.935], [0.944, 0.909], [0.948, 0.843], [0.946, 0.802], [0.953, 0.849],
];
/** The corrections at depth `d` (see MEASURED): [hall, rest]. */
export function measuredAt(d: number): [number, number] {
  const n = MEASURED.length;
  if (n < 190 || d < 1) return [1, 1];
  const x = measuredDepth(d, n);
  const i = Math.floor(x);
  const a = MEASURED[i - 1];
  const b = MEASURED[measuredDepth(i + 1, n) - 1];
  const t = x - i;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
/** The depth measured that depth `d` comes round to (past the last of the `n` measured, every 90 depths, as the strata do). */
const measuredDepth = (d: number, n: number) => (d > n ? n - 89 + ((d - (n - 89)) % 90) : d);

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

/** The magma among the environments (it cools as it goes out; see magmaCooling). */
const MAGMA = ENVIRONMENTS.indexOf('magma');
/**
 * How far the magma has cooled (0 to 1) with the scene turning `turn` of the
 * way into stratum `stratum` (see strataAt): only as it goes out (the
 * stratum before has magma, this one none: the Magma Fissure's last depths
 * toward the Frozen Hollow), in step with its hall (hallTurn), so it has
 * cooled and stopped flowing as the next arrives. The backdrop draws its
 * glow turning from orange to dull red and dark, and its flow slowing to a
 * stop (lib/backdrop.ts); the embers burning in it slow too
 * (lib/emberMotion.ts).
 */
export function magmaCooling(stratum: number, turn: number): number {
  return stratum >= 1 && lookOf(stratum - 1).env[MAGMA] > 0 && lookOf(stratum).env[MAGMA] === 0 ? hallTurn(turn) : 0;
}
/** How much of its glow the magma loses, cooled all the way. */
export const MAGMA_DIM = 0.8;
/** How bright the magma's glow is (its luma, 1 hot), cooled `cool` of the way: the backdrop dims it so, and the estimate below with it. */
export const magmaHeat = (cool: number) => 1 - MAGMA_DIM * cool;
/** The magma's heat at depth `d` (see magmaCooling). */
function heatAt(d: number) {
  const { stratum, turn } = strataAt(d);
  return magmaHeat(magmaCooling(stratum, turn));
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
    env += envTable(ENV_ADD[i], e) * (i === MAGMA ? heat : 1);
    hall *= envTable(ENV_HALL[i], e);
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
/** The range `light` keeps to, so no stratum is drawn far from its own brightness. */
export const LIGHT_MIN = 0.2;
export const LIGHT_MAX = 1.8;
/**
 * How far `light` may change from one depth to the next (in log terms: 0.06
 * is about 6%), so the hall never swings ahead of a new stratum: where the
 * estimate would have it change faster, it is lowered a little early or
 * held a little longer (see extendLights), never raised, and the scene
 * comes out a little darker meanwhile.
 */
export const LIGHT_STEP = 0.06;
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
 * them; past it, it comes round every 90 depths as the strata do, everything
 * else (the dark closing in, luminanceAt, featuresAt) having levelled off
 * long before.
 */
const LIGHT_TABLE = 1 + 280 + 2 * 90;
/** Per whole depth: the hall and the rest the estimate comes to (measured corrections and all), the light, and the brightness with it. */
const tableHall = new Float64Array(LIGHT_TABLE + 1);
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
        const most = Math.max(LIGHT_MIN, Math.min(tableLight[d - 1] * up, Math.max(tableLight[d - 1] / up, keep)));
        if (tableLight[d] > most + 1e-12) {
          tableLight[d] = most;
          moved = true;
        }
      }
      for (let d = tableEnd - 1; d >= first - 1 && d > settled; d--) {
        const most = Math.max(LIGHT_MIN, tableLight[d + 1] * up);
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

/**
 * How bright the scene's light is drawn at depth `d` with `look` (the look
 * there; see Descent.light). At a whole depth, the table's; between two,
 * whatever keeps the brightness the estimate comes to between theirs, so it
 * never comes out brighter while a depth eases in either.
 */
export function lightAt(d: number, look: Look = lookAt(blank(), d)): number {
  if (!(d >= 1)) return 1;
  const x = d > LIGHT_TABLE ? LIGHT_TABLE - 90 + ((d - LIGHT_TABLE) % 90) : d;
  const i = Math.floor(x);
  const j = Math.min(LIGHT_TABLE, i + 1);
  if (settled < j) extendLights(j);
  if (x === i) return tableLight[i];
  const level = tableLevel[i] + (tableLevel[j] - tableLevel[i]) * (x - i);
  const e = estimateLuminance(look, closeness(d), featuresAt(d), heatAt(d));
  const [h, r] = measuredAt(d);
  return Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, (level - e.rest * r) / (e.hall * h)));
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

/** Writes the scene at a depth into `out` (its look is written over, never shared). */
function fill(out: Descent, depth: number): Descent {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  const { stratum, turn } = strataAt(d);
  lookAt(out.look, d);
  out.deep = deepAt(d);
  out.abyss = smoothstep(ABYSS_FROM, ABYSS_FULL, d);
  out.close = closeness(d);
  out.features = featuresAt(d);
  out.light = lightAt(d, out.look);
  out.dim = d < 1 ? 0 : 1 - levelAt(d);
  out.stratum = stratum;
  out.turn = turn;
  return out;
}

const fresh = (): Descent => ({ deep: 0, abyss: 0, close: 0, light: 1, features: 1, dim: 0, stratum: 0, turn: 0, look: blank() });

/** The scene at a depth (0 outside Delve: the usual scene). Fractional depths ease between whole ones. */
export function descent(depth: number): Descent {
  return fill(fresh(), depth);
}

// ---- the named depths -------------------------------------------------------

/** The named depths through 100: each stratum but the first is announced as it begins. */
export const MILESTONES: { depth: number; name: string }[] = STRATA.flatMap((s, k) => (s.announced ? [{ depth: 10 * k + 1, name: s.name }] : []));

/**
 * The name of the depth, if it has one: the first depth of every stratum but
 * the first, for ever. Past 100 the biomes come round again, each stratum
 * named after the one whose hall it has, so never the same twice in a row.
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
  shown = target;
  fading = false;
  return true;
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

/** The scene as shown right now. */
export function currentDescent(): Descent {
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
  return fadeNow;
}

/** The scene the shown one is heading for. */
export function targetDescent(): Descent {
  if (targetAt !== target) fill(targetNow, (targetAt = target));
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
export const PLUNGE_SINK = 0.6;
/** How far the scene has sunk (screens, wrapping far down), how fast (screens a second) and how far the dark has drawn in (0 to 1). */
export const sinking = { sink: 0, speed: 0, breath: 0 };
let asked = false;
let sinkFrom = 0;
let plungeAt = -Infinity;

/** Back to the top, nothing sunk and no plunge under way (a run starting from the surface). */
function resetSink() {
  sinking.sink = 0;
  sinking.speed = 0;
  sinking.breath = 0;
  sinkFrom = 0;
  plungeAt = -Infinity;
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
