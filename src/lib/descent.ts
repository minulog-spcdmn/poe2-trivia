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
// falls, however bright a stratum's fire or gold. Each pick of a card sinks
// the scene a little further (plunge). Pure, apart from the eased channel
// and the plunge at the bottom that the backdrop reads.

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
      burst: 0, eddy: 0, env: only(0), accent: [240, 172, 96],
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
      burst: 1, eddy: 0, env: only(1), accent: [255, 116, 88],
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
      burst: 0, eddy: 0, env: only(2), accent: [150, 202, 255],
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
      burst: 0, eddy: 0.2, env: only(3), accent: [166, 232, 112],
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
      burst: 0, eddy: 0, env: only(4), accent: [242, 204, 106],
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
      burst: 0, eddy: 1, env: only(5), accent: [198, 152, 255],
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
      burst: 0, eddy: 0, env: only(6), accent: [204, 214, 222],
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
      burst: 0.15, eddy: 0, env: only(7), accent: [214, 232, 104],
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
      burst: 0, eddy: 0, env: only(8), accent: [156, 170, 236],
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
      burst: 0.7, eddy: 0.25, env: only(9), accent: [255, 222, 176],
    },
  },
];

/** Past the last stratum, the strata it pairs come from these (all but the first). */
const DEEP = STRATA.slice(1);
/** The parts of a look that make the hall; the rest are its embers and glints. */
const HALL_KEYS = ['shade', 'dark', 'floor', 'floorK', 'floorH', 'haze', 'hazeK', 'glow', 'lamp', 'smoke', 'smokeB', 'smokeHi', 'smokeHiB', 'smokeK', 'shadowK', 'mist', 'mistK', 'accent'] as const;

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

/** The stratum (through 100) whose hall stratum `k` has: itself through 100, past it its pairing's. */
const hallOf = (k: number) => (k < STRATA.length ? Math.max(0, k) : pairing(k).hall + 1);

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
   * estimateLuminance).
   */
  light: number;
  /** How bright its features burn (1 at the surface; a little less the deeper; see featuresAt). */
  features: number;
  /** How far its hall drawn comes out from the estimate (see HALL_GAIN). */
  gain: number;
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

/** A look to write into (see mixInto). */
function blank(): Look {
  const look = { ...SURFACE };
  for (const key of Object.keys(look) as (keyof Look)[]) {
    const v = look[key];
    if (Array.isArray(v)) (look as Record<string, unknown>)[key] = [...v];
  }
  return look;
}

/** Writes `a` blended `t` of the way to `b` into `out`, without allocating. */
function mixInto(out: Look, a: Look, b: Look, t: number): Look {
  const o = out as unknown as Record<string, number | number[]>;
  for (const key of Object.keys(a) as (keyof Look)[]) {
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x)) {
      const arr = o[key] as number[];
      for (let i = 0; i < x.length; i++) arr[i] = x[i] + ((y as number[])[i] - x[i]) * t;
    } else o[key] = x + ((y as number) - x) * t;
  }
  return out;
}

/** Two looks blended, `t` of the way from `a` to `b`. */
export function mixLook(a: Look, b: Look, t: number): Look {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return mixInto(blank(), a, b, t);
}

/** The parts of a look the embers follow, a tenth of the way with every depth of a stratum. */
const EMBER_KEYS = new Set<string>(['ember', 'core', 'coreMix', 'crowd', 'speed', 'size', 'bright', 'agit', 'fall']);
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
  mixInto(out, a, b, h);
  const o = out as unknown as Record<string, number | number[]>;
  const A = a as unknown as Record<string, number | number[]>;
  const B = b as unknown as Record<string, number | number[]>;
  for (const key of EMBER_KEYS) {
    const x = A[key];
    const y = B[key];
    if (Array.isArray(x)) {
      const arr = o[key] as number[];
      for (let i = 0; i < x.length; i++) arr[i] = x[i] + ((y as number[])[i] - x[i]) * t;
    } else o[key] = (x as number) + ((y as number) - (x as number)) * t;
  }
  for (let i = 0; i < ENV; i++) out.env[i] = Math.max(a.env[i] + (b.env[i] - a.env[i]) * h, Math.min(a.env[i], b.env[i]));
  return out;
}

/** How close the dark has crept in at a depth (see Descent.close): a little more with every depth, never less. */
function closeness(d: number) {
  return d < 1 ? 0 : 0.6 * (1 - Math.exp(-(d - 1) / 45));
}

// ---- the scene's brightness ------------------------------------------------

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

/**
 * What each environment adds to the average brightness at full strength
 * (luminance, 0 to 1; `light` leaves them be), measured from the backdrop's
 * own frames with the dark not yet drawn in: what the features draw is
 * noise too fine to work out here.
 */
export const ENV_LUMINANCE = [0.0097, 0.0156, 0.0189, 0.0151, 0.0189, -0.0012, 0.022, 0.019, -0.0119, 0.0189];

const gauss = (d: number) => Math.exp(-d * d);
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/**
 * How far each stratum's hall drawn comes out from the estimate below
 * (measured from the backdrop's frames with no features), to correct it by.
 */
const HALL_GAIN = [1.046, 1.059, 1.046, 0.986, 0.979, 0.957, 0.945, 0.996, 1.03, 1.087];
/**
 * How bright the hall drawn comes out against the estimate below, depth by
 * depth (measured from the backdrop's own frames, 900 x 640: what they show
 * less the features and embers estimated, over the hall estimated; past 190
 * the strata come round every 90 depths, as their pairings do). The estimate
 * works the noise and the features out at their averages, and is off by up
 * to a third where they come and go. Measure again after changing what the
 * backdrop draws (see the scripts in the commit that made it). Empty, the
 * estimate stands as it is.
 */
export const MEASURED: number[] = [
  1,
  0.991, 1.001, 1.006, 0.993, 0.961, 0.915, 0.861, 0.812, 0.786, 0.79, 0.806, 0.812, 0.803, 0.778, 0.754,
  0.752, 0.774, 0.814, 0.868, 0.924, 0.962, 0.972, 0.962, 0.937, 0.9, 0.861, 0.83, 0.814, 0.818, 0.857,
  0.926, 0.989, 1.024, 1.017, 0.982, 0.971, 1.005, 1.064, 1.126, 1.178, 1.212, 1.228, 1.236, 1.219, 1.16,
  1.076, 0.995, 0.936, 0.914, 0.926, 0.95, 0.963, 0.963, 0.952, 0.935, 0.921, 0.915, 0.921, 0.955, 1.033,
  1.12, 1.157, 1.137, 1.069, 1.014, 1.026, 1.059, 1.07, 1.057, 1.019, 0.96, 0.889, 0.828, 0.792, 0.771,
  0.757, 0.76, 0.779, 0.79, 0.785, 0.78, 0.781, 0.782, 0.783, 0.78, 0.771, 0.758, 0.735, 0.711, 0.721,
  0.75, 0.734, 0.692, 0.661, 0.654, 0.69, 0.75, 0.804, 0.853, 0.902, 0.936, 0.944, 0.926, 0.879, 0.814,
  0.751, 0.697, 0.651, 0.619, 0.645, 0.721, 0.758, 0.743, 0.704, 0.676, 0.689, 0.732, 0.793, 0.864, 0.932,
  0.962, 0.949, 0.914, 0.868, 0.816, 0.776, 0.751, 0.732, 0.723, 0.722, 0.725, 0.73, 0.742, 0.759, 0.779,
  0.801, 0.821, 0.841, 0.858, 0.865, 0.859, 0.842, 0.817, 0.784, 0.768, 0.789, 0.835, 0.891, 0.945, 0.993,
  1.05, 1.11, 1.154, 1.173, 1.152, 1.076, 0.966, 0.868, 0.806, 0.779, 0.769, 0.755, 0.741, 0.722, 0.7,
  0.691, 0.721, 0.827, 1.037, 1.358, 1.651, 1.726, 1.62, 1.415, 1.152, 0.921, 0.77, 0.691, 0.671, 0.707,
  0.761, 0.788, 0.791, 0.779, 0.762, 0.766, 0.787, 0.818, 0.851, 0.889,
];
/** The correction at depth `d` (see MEASURED). */
export function measuredAt(d: number) {
  if (MEASURED.length < 191 || d < 1) return 1;
  const x = d > 190 ? 101 + ((d - 101) % 90) : d;
  const i = Math.floor(x);
  const a = MEASURED[i] ?? 1;
  const b = MEASURED[i + 1 > 190 ? 101 : i + 1] ?? 1;
  return a + (b - a) * (x - i);
}
/** The grid the estimate is worked out on, over a 900 x 640 screen. */
const GW = 24;
const GH = 16;
const EW = 900;
const EH = 640;

/** The dark closing in at (x, y) of the estimate's screen (closing() in lib/backdrop.ts, with no clock running). */
function closingAt(x: number, y: number, close: number) {
  if (close <= 0) return 0;
  const reach = Math.max(0.15, 1 - 0.6 * close);
  const k = 0.3 + 0.25 * reach;
  const ax = Math.max(Math.abs(x - 0.5 * EW) / (0.5 * EW) - reach, 0) / k;
  const ay = Math.max(Math.abs(y - 0.5 * EH) / (0.5 * EH) - reach, 0) / k;
  return 1 - Math.exp(-(ax * ax + ay * ay));
}

/**
 * The average brightness of the backdrop drawn with `look` and the dark
 * closed in by `close`, worked out the way lib/backdrop.ts draws it (its
 * smooth light at rest, on a coarse grid, the noise at its average; the
 * environments' features by what they add, see ENV_LUMINANCE), split into
 * what `light` scales (soft: the hall's own light) and what it doesn't
 * (rest: the features and the embers).
 */
export function estimateLuminance(look: Look, close: number, features = 1, gain = 1): { soft: number; rest: number } {
  const S = Math.sqrt(EW * EH);
  const R = Math.hypot(0.7 * EW, 0.77 * EH);
  const delve = look.dark > 0 || look.mistK > 0;
  let soft = 0;
  let open = 0;
  for (let j = 0; j < GH; j++) {
    const y = ((j + 0.5) / GH) * EH;
    const t = y / EH;
    const s = t < 0.6 ? smoothstep(0, 0.6, t) : smoothstep(0.6, 1, t);
    const base = t < 0.6 ? [13 + (8 - 13) * s, 11 + (7 - 11) * s, 9 + (6 - 9) * s] : [8 + 5 * s, 7 + 2 * s, 6 + s];
    for (let i = 0; i < GW; i++) {
      const x = ((i + 0.5) / GW) * EW;
      let r = (base[0] / 255) * look.shade[0];
      let g = (base[1] / 255) * look.shade[1];
      let b = (base[2] / 255) * look.shade[2];
      const mix = (c: readonly number[], k: number) => {
        r += (c[0] / 255 - r) * k;
        g += (c[1] / 255 - g) * k;
        b += (c[2] / 255 - b) * k;
      };
      mix(look.haze, look.hazeK * 0.18 * gauss(Math.hypot((x - 0.5 * EW) / (0.6 * EW), (y + 0.1 * EH) / (0.5 * EH)) / 0.5));
      mix(look.floor, look.floorK * gauss(Math.hypot((x - 0.5 * EW) / (0.8 * EW * look.floorH), (y - 1.1 * EH) / (0.6 * EH * look.floorH)) / 0.5));
      mix(look.glow, look.lamp * 0.07 * gauss(Math.hypot(x - 0.5 * EW, y - 0.43 * EH) / R / 0.3));
      for (let k = 0; k < BLOBS.length; k++) {
        const bl = BLOBS[k];
        const reach = Math.sqrt(((bl.reach[0] + bl.reach[1]) / 2) * bl.reach[2]) * S;
        const w = gauss(Math.hypot(x - bl.home[0] * EW, y - bl.home[1] * EH) / reach);
        mix(smokeOf(look, k), 0.75 * bl.opacity * (k < 4 ? look.smokeK : look.shadowK) * w);
      }
      if (delve) {
        mix(look.mist, look.mistK * 0.27);
        const edge = Math.hypot(((x - 0.5 * EW) / EW) * 1.4, ((y - 0.62 * EH) / EH) * 1.15);
        const k = 1 - 0.75 * look.dark * smoothstep(0.08, 0.9, edge + 0.018);
        r *= k;
        g *= k;
        b *= k;
      }
      const c = closingAt(x, y, close);
      const lit = 1 - 0.93 * c;
      open += 1 - 0.75 * c;
      // The backdrop's lift and vignette (main() in lib/backdrop.ts).
      const vig = Math.hypot((x - 0.5 * EW) / (0.5 * EW), (y - 0.5 * EH) / (0.5 * EH)) / Math.SQRT2;
      const v = 1.2 * (1 - Math.min(0.9, (1 - 0.6 * look.dark) * 0.72 * vig ** 2.4));
      soft += luma(r, g, b) * lit * v;
    }
  }
  const n = GW * GH;
  // (The grid at rest comes out about 8% under the frames drawn.)
  soft *= (1.08 * gain) / n;
  open /= n;
  let env = 0;
  for (let i = 0; i < ENV; i++) env += ENV_LUMINANCE[i] * look.env[i];
  // The embers: how many burn (the calm ones and the crowd), how large and
  // bright on average, each a hot core and a wide halo (the shader's).
  const count = 36 + 52 * look.crowd;
  const s2 = 5.5 * look.size * look.size;
  const hot = look.ember.map((v, i) => v + (look.core[i] - v) * look.coreMix);
  const each = 0.7 * 0.76 * 0.8 * look.bright * (0.9 * Math.PI * 0.3 * s2 * luma(hot[0], hot[1], hot[2]) + 0.3 * Math.PI * 5 * s2 * luma(look.ember[0], look.ember[1], look.ember[2]));
  const embers = ((count * each) / (EW * EH)) * open * 1.2;
  return { soft: Math.max(1e-4, soft), rest: embers + env * open * features };
}

/**
 * The average brightness the scene keeps to at a depth: depth 1's (the
 * Mines with no dark closed in yet, at their own light), falling steadily
 * and levelling off at under half of it far down.
 */
const LEVEL_FLOOR = 0.62;
let depthOne = NaN;
export function luminanceAt(d: number): number {
  if (Number.isNaN(depthOne)) {
    const e = estimateLuminance(STRATA[0].look, 0, 1, HALL_GAIN[0]);
    depthOne = e.soft * measuredAt(1) + e.rest;
  }
  return depthOne * (LEVEL_FLOOR + (1 - LEVEL_FLOOR) * Math.exp(-Math.max(0, d - 1) / 50));
}
/** How bright the strata's features burn (fire, gold, fog, ...): a little less the deeper, down to FEATURES_FLOOR. */
const FEATURES_FLOOR = 0.6;
export const featuresAt = (d: number) => (d < 1 ? 1 : FEATURES_FLOOR + (1 - FEATURES_FLOOR) * Math.exp(-(d - 1) / 60));
/** The range `light` keeps to, so no stratum is drawn far from its own brightness. */
export const LIGHT_MIN = 0.2;
export const LIGHT_MAX = 1.8;

/** Writes the scene at a depth into `out` (its look is written over, never shared). */
function fill(out: Descent, depth: number): Descent {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  const { stratum, turn } = strataAt(d);
  const look = d < 1 ? mixInto(out.look, SURFACE, STRATA[0].look, turn) : turnInto(out.look, lookOf(stratum - 1), lookOf(stratum), turn);
  out.deep = d < 1 ? 0 : 1 - Math.exp(-(d - 1) / 22);
  // Within a stratum the dark still creeps in a little with every depth.
  look.dark += (1 - look.dark) * 0.15 * out.deep;
  out.abyss = smoothstep(ABYSS_FROM, ABYSS_FULL, d);
  out.close = closeness(d);
  out.features = featuresAt(d);
  out.gain = d < 1 ? 1 : HALL_GAIN[hallOf(stratum - 1)] + (HALL_GAIN[hallOf(stratum)] - HALL_GAIN[hallOf(stratum - 1)]) * hallTurn(turn);
  if (d < 1) out.light = 1;
  else {
    const e = estimateLuminance(look, out.close, out.features, out.gain);
    out.light = Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, (luminanceAt(d) - e.rest) / (e.soft * measuredAt(d))));
  }
  out.stratum = stratum;
  out.turn = turn;
  return out;
}

const fresh = (): Descent => ({ deep: 0, abyss: 0, close: 0, light: 1, features: 1, gain: 1, stratum: 0, turn: 0, look: blank() });

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
  out.gain = d.gain;
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
  fadeNow.gain = mix(from.gain, shownNow.gain);
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
 * Each pick of a card in a Delve sinks the scene a little further: over
 * PLUNGE_MS the walls, the smoke and the dust drift up past you (the
 * nearer, the faster) as if you sank PLUNGE_SINK of a screen, the embers
 * streak up, and the dark draws in and lets go again; then it all settles
 * where it came to. App.svelte calls plunge(); the backdrop steps it, and
 * skips it while it holds still (reduced motion, effects off).
 */
export const PLUNGE_MS = 1300;
export const PLUNGE_SINK = 0.35;
/** How far the scene has sunk (screens, wrapping far down), how fast (screens a second) and how far the dark has drawn in (0 to 1). */
export const sinking = { sink: 0, speed: 0, breath: 0 };
let asked = false;
let sinkFrom = 0;
let plungeAt = -Infinity;

/** Sinks the scene a little further (a card was picked). */
export function plunge() {
  asked = true;
}

/** easeInOutCubic and its slope. */
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeSlope = (x: number) => (x < 0.5 ? 12 * x * x : 3 * (-2 * x + 2) ** 2);

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
    // (Wrapping round far down, so the shader's noise keeps its precision.)
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
