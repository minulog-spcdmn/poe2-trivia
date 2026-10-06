// How deep the scene is: Delve's depth turned into what the backdrop, its
// embers and the ambience follow. The descent passes through strata, one
// every ten depths, each a place of its own: the light welling up from
// below, the smoke, how dark the hall is, what the embers burn like and how
// they move, what glints in the walls, and the features the backdrop draws
// for it alone (the environments: magma veins, frost, spore light, shafts of
// light, ...). Depth 1 is the usual scene; the first stratum kindles over
// depths 1 to 7, and from then on each one creeps in over the last three
// depths of the one before and settles over the first two of its own, so it
// is mostly there by the time its name is announced. One place doesn't melt
// into the next: the old one's features recede first (the cracks cool, the
// frost withdraws to the walls, the lamps gutter out) and its light dims, the
// colour turns while it is dim, and the new one's features arrive from where
// they come from (see blendInto). Each is named after a Delve biome. Past
// depth 100 the strata go on for ever, each pairing the hall of one deep
// stratum with the embers of another (and half its features), so no two in
// a row look alike, and each is announced by its hall's biome again. And the
// deeper, the less light about you: it draws in a little with every depth
// of a stratum, most as one place gives way to the next, and opens out again
// as the next arrives. Pure, apart from the eased channel at the bottom that
// the backdrop reads.

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
  /** The gold lamp in the middle (1 at the surface). */
  lamp: number;
  /** The drifting smoke: low and high colour, how far it takes them (0 keeps the surface's), its opacity, the shadow's. */
  smoke: RGB;
  smokeHi: RGB;
  smokeMix: number;
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

/** The usual scene (outside Delve, and depth 1). */
export const SURFACE: Look = {
  shade: [1, 1, 1],
  dark: 0,
  floor: [140, 60, 20],
  floorK: 0.28,
  floorH: 1,
  haze: [120, 95, 60],
  hazeK: 1,
  lamp: 1,
  smoke: [150, 70, 25],
  smokeHi: [140, 110, 60],
  smokeMix: 0,
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
 * 10, are where every run starts, so they aren't).
 */
export const STRATA: { name: string; announced: boolean; look: Look }[] = [
  {
    // The mines: the usual hall, kindling as the fire below grows and the embers thicken.
    name: 'The Mines',
    announced: false,
    look: {
      shade: [1, 0.96, 0.92], dark: 0.12,
      floor: [175, 74, 20], floorK: 0.42, floorH: 1.3,
      haze: [120, 92, 56], hazeK: 0.65, lamp: 0.85,
      smoke: [165, 72, 24], smokeHi: [150, 100, 48], smokeMix: 0.6, smokeK: 1.25, shadowK: 1.15,
      mist: [120, 52, 16], mistK: 0.05,
      ember: [1, 0.5, 0.13], core: [1, 0.88, 0.6], coreMix: 0.58,
      crowd: 0.4, speed: 1.15, size: 1.05, bright: 1.1, agit: 0.2, fall: 0,
      glint: [1, 0.6, 0.2], glints: 0, spread: 0,
      burst: 0, eddy: 0, env: only(0), accent: [240, 172, 96],
    },
  },
  {
    // Magma: a crimson glow from the fissures, heavy slow embers, garnet in the walls.
    name: 'Magma Fissure',
    announced: true,
    look: {
      shade: [1, 0.7, 0.7], dark: 0.3,
      floor: [135, 16, 16], floorK: 0.46, floorH: 1.2,
      haze: [90, 36, 32], hazeK: 0.3, lamp: 0.5,
      smoke: [110, 16, 16], smokeHi: [84, 26, 26], smokeMix: 1, smokeK: 1.45, shadowK: 1.3,
      mist: [105, 8, 14], mistK: 0.07,
      ember: [1, 0.16, 0.08], core: [1, 0.6, 0.48], coreMix: 0.5,
      crowd: 0.3, speed: 0.8, size: 1.25, bright: 1.1, agit: 0.25, fall: 0,
      glint: [1, 0.22, 0.16], glints: 0.35, spread: 0,
      burst: 1, eddy: 0, env: only(1), accent: [255, 116, 88],
    },
  },
  {
    // Frozen: cold azure light from the floor, frost creeping in from the
    // walls, ice motes drifting down, azurite glinting.
    name: 'Frozen Hollow',
    announced: true,
    look: {
      shade: [0.75, 0.85, 1.15], dark: 0.38,
      floor: [34, 84, 160], floorK: 0.44, floorH: 1.15,
      haze: [60, 80, 110], hazeK: 0.2, lamp: 0.35,
      smoke: [28, 56, 104], smokeHi: [40, 52, 76], smokeMix: 1, smokeK: 1.4, shadowK: 1.3,
      mist: [30, 66, 124], mistK: 0.06,
      ember: [0.34, 0.62, 1], core: [0.86, 0.94, 1], coreMix: 0.62,
      crowd: 0.45, speed: 0.55, size: 1, bright: 1.3, agit: 0.3, fall: 1,
      glint: [0.4, 0.7, 1], glints: 1, spread: 0,
      burst: 0, eddy: 0, env: only(2), accent: [150, 202, 255],
    },
  },
  {
    // Fungal: a sickly green-black, clusters of spore light pulsing low in
    // the walls, spores drifting and swaying.
    name: 'Fungal Caverns',
    announced: true,
    look: {
      shade: [0.8, 1, 0.72], dark: 0.5,
      floor: [72, 132, 26], floorK: 0.44, floorH: 1.1,
      haze: [50, 70, 30], hazeK: 0.15, lamp: 0.25,
      smoke: [38, 66, 18], smokeHi: [30, 44, 22], smokeMix: 1, smokeK: 1.5, shadowK: 1.4,
      mist: [50, 100, 20], mistK: 0.09,
      ember: [0.6, 1, 0.18], core: [0.92, 1, 0.62], coreMix: 0.5,
      crowd: 0.55, speed: 0.45, size: 1.3, bright: 1, agit: 0.6, fall: 0.3,
      glint: [0.7, 1, 0.3], glints: 0.25, spread: 0.3,
      burst: 0, eddy: 0.2, env: only(3), accent: [166, 232, 112],
    },
  },
  {
    // Vaal gold: dusty shafts of light from above on carved stone, gold dust sifting down.
    name: 'Vaal Outpost',
    announced: true,
    look: {
      shade: [1, 0.88, 0.66], dark: 0.5,
      floor: [205, 145, 40], floorK: 0.42, floorH: 1,
      haze: [170, 130, 52], hazeK: 0.55, lamp: 0.8,
      smoke: [120, 84, 22], smokeHi: [100, 76, 30], smokeMix: 1, smokeK: 1.2, shadowK: 1.4,
      mist: [150, 108, 28], mistK: 0.07,
      ember: [1, 0.82, 0.34], core: [1, 0.97, 0.84], coreMix: 0.62,
      crowd: 0.35, speed: 0.45, size: 0.75, bright: 1.25, agit: 0.1, fall: 0.6,
      glint: [1, 0.86, 0.42], glints: 1, spread: 0.35,
      burst: 0, eddy: 0, env: only(4), accent: [242, 204, 106],
    },
  },
  {
    // The abyss: violet light, void coiling in the dark, embers pulled round in its eddies.
    name: 'Abyssal Depths',
    announced: true,
    look: {
      shade: [0.85, 0.7, 1.15], dark: 0.62,
      floor: [104, 40, 164], floorK: 0.42, floorH: 1.2,
      haze: [70, 40, 100], hazeK: 0.15, lamp: 0.2,
      smoke: [62, 24, 104], smokeHi: [42, 22, 64], smokeMix: 1, smokeK: 1.5, shadowK: 1.5,
      mist: [84, 30, 144], mistK: 0.08,
      ember: [0.72, 0.34, 1], core: [0.95, 0.85, 1], coreMix: 0.55,
      crowd: 0.7, speed: 1.35, size: 0.9, bright: 1.2, agit: 0.85, fall: 0,
      glint: [0.8, 0.5, 1], glints: 0.6, spread: 0.5,
      burst: 0, eddy: 1, env: only(5), accent: [198, 152, 255],
    },
  },
  {
    // Petrified: stone trunks in a pale fog that drifts in layers, ash flakes falling.
    name: 'Petrified Forest',
    announced: true,
    look: {
      shade: [0.9, 0.95, 1], dark: 0.55,
      floor: [118, 136, 148], floorK: 0.24, floorH: 1.4,
      haze: [110, 124, 134], hazeK: 0.5, lamp: 0.15,
      smoke: [72, 78, 84], smokeHi: [80, 84, 90], smokeMix: 1, smokeK: 1.1, shadowK: 1.2,
      mist: [100, 112, 122], mistK: 0.08,
      ember: [0.72, 0.92, 0.95], core: [1, 1, 1], coreMix: 0.7,
      crowd: 0.3, speed: 0.4, size: 1.6, bright: 0.8, agit: 0.25, fall: 0.75,
      glint: [0.85, 0.95, 1], glints: 0, spread: 0,
      burst: 0, eddy: 0, env: only(6), accent: [204, 214, 222],
    },
  },
  {
    // Sulphur vents: yellow-green fumes billowing up from below in columns,
    // motes rising with them.
    name: 'Sulphur Vents',
    announced: true,
    look: {
      shade: [0.78, 1, 0.9], dark: 0.66,
      floor: [30, 76, 56], floorK: 0.2, floorH: 1,
      haze: [62, 126, 92], hazeK: 1.6, lamp: 0.1,
      smoke: [28, 58, 44], smokeHi: [40, 74, 54], smokeMix: 1, smokeK: 1.4, shadowK: 1.4,
      mist: [52, 96, 58], mistK: 0.07,
      ember: [0.4, 1, 0.68], core: [0.86, 1, 0.9], coreMix: 0.55,
      crowd: 0.5, speed: 0.6, size: 1, bright: 1.1, agit: 0.3, fall: 0,
      glint: [0.72, 1, 0.5], glints: 0.4, spread: 0.7,
      burst: 0.15, eddy: 0, env: only(7), accent: [214, 232, 104],
    },
  },
  {
    // The drowned city: near black, a few still motes, far cold lights at many depths, drifting past.
    name: 'Abyssal City',
    announced: true,
    look: {
      shade: [0.7, 0.7, 1], dark: 0.8,
      floor: [54, 40, 124], floorK: 0.24, floorH: 1,
      haze: [30, 30, 70], hazeK: 0.1, lamp: 0,
      smoke: [16, 14, 36], smokeHi: [20, 16, 42], smokeMix: 1, smokeK: 1.5, shadowK: 1.5,
      mist: [34, 28, 82], mistK: 0.05,
      ember: [0.55, 0.62, 1], core: [1, 1, 1], coreMix: 0.75,
      crowd: 0, speed: 0.25, size: 0.7, bright: 1.4, agit: 0.05, fall: 0,
      glint: [0.75, 0.8, 1], glints: 1, spread: 1,
      burst: 0, eddy: 0, env: only(8), accent: [156, 170, 236],
    },
  },
  {
    // Primeval: the bottom of the world, white-hot fire roaring under black
    // smoke, the air shimmering, a swarm of embers.
    name: 'Primeval Ruins',
    announced: true,
    look: {
      shade: [1, 0.6, 0.5], dark: 0.55,
      floor: [210, 72, 14], floorK: 0.5, floorH: 1.45,
      haze: [80, 25, 10], hazeK: 0.2, lamp: 0.25,
      smoke: [46, 14, 8], smokeHi: [22, 10, 8], smokeMix: 1, smokeK: 1.6, shadowK: 1.6,
      mist: [150, 40, 8], mistK: 0.06,
      ember: [1, 0.4, 0.07], core: [1, 0.95, 0.8], coreMix: 0.72,
      crowd: 1, speed: 1.9, size: 1.1, bright: 1.3, agit: 0.9, fall: 0,
      glint: [1, 0.35, 0.1], glints: 0.7, spread: 0.15,
      burst: 0.7, eddy: 0.25, env: only(9), accent: [255, 222, 176],
    },
  },
];

/** Past the last stratum, the strata it pairs come from these (all but the first). */
const DEEP = STRATA.slice(1);
/** The parts of a look that make the hall; the rest are its embers and glints. */
const HALL_KEYS = ['shade', 'dark', 'floor', 'floorK', 'floorH', 'haze', 'hazeK', 'lamp', 'smoke', 'smokeHi', 'smokeMix', 'smokeK', 'shadowK', 'mist', 'mistK', 'accent'] as const;

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

/** A stratum starts creeping in this many depths before its first... */
const LEAD = 3;
/** ...and has settled this many depths into it. */
const SETTLE = 2;

/**
 * The stratum a depth is in, or turning into, and how far (0 to 1): from
 * depth 1 to 7 the surface kindles into the first stratum, then stratum k
 * turns in over depths 10k - LEAD to 10k + SETTLE. So at depth 21, where the
 * third is announced, it is nine tenths there (two thirds at 20), and all
 * there from 22.
 */
export function strataAt(depth: number): { stratum: number; turn: number } {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  const k = Math.floor((d + LEAD) / 10);
  if (k === 0) return { stratum: 0, turn: smoothstep(1, 10 - LEAD, d) };
  return { stratum: k, turn: smoothstep(10 * k - LEAD, 10 * k + SETTLE, d) };
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
  /**
   * How close the dark has crept in from the edges, 0 to 1: a little more
   * with every depth of a stratum, most as it gives way to the next, opening
   * out again as the next arrives, and on the whole closer the deeper.
   */
  close: number;
  /** The stratum the scene is in or turning into (see strataAt), and how far. */
  stratum: number;
  turn: number;
  /** What the scene looks like: the stratum before and this one, blended. */
  look: Look;
}

/** The depth the embers first burn blue: where the azure stratum begins. */
export const BLUE_FROM = 21;
export const ABYSS_FROM = 50;
export const ABYSS_FULL = 75;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

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

/**
 * How one place gives way to the next, `t` of the way through a turn: the
 * old one's features have receded by `leave` (most of the way by the middle),
 * the new one's arrive from a third of the way on, and between the two the
 * light is dimmest. Its colour turns over the middle, while it is dim, so the
 * two never mix into mud. At the depths a turn is seen at (a tenth, a third,
 * two thirds and nine tenths of the way) that is: the old place a little
 * dimmer; the old place fading, the new one only hinted; the new one coming
 * in with a trace of the old; nearly all the new one.
 */
const leave = (t: number) => smoothstep(0, 0.75, t);
const arrive = (t: number) => smoothstep(0.3, 1, t);
const hueOf = (t: number) => smoothstep(0.15, 0.85, t);
/** How dim it is between two places, 0 to about 0.55. */
export const between = (t: number) => leave(t) * (1 - arrive(t));

/** The parts of a look that are the colour of its light (turned while dim), and how strong it is (dimmed between places). */
const HUES = ['shade', 'floor', 'haze', 'smoke', 'smokeHi', 'mist', 'glint', 'spread'] as const;
const LIGHTS = ['floorK', 'hazeK', 'mistK', 'lamp'] as const;
/** Features of a place, which recede and arrive (see leave and arrive). */
const FEATURES = ['glints', 'burst', 'eddy'] as const;

/**
 * Writes the turn from `a` to `b`, `t` of the way, into `out` (see leave).
 * The embers follow `t` itself: they change colour one by one anyway, as
 * each starts a new rise.
 */
function blendInto(out: Look, a: Look, b: Look, t: number): Look {
  mixInto(out, a, b, t);
  if (t <= 0 || t >= 1) return out;
  const o = out as unknown as Record<string, number | number[]>;
  const A = a as unknown as Record<string, number | number[]>;
  const B = b as unknown as Record<string, number | number[]>;
  const l = leave(t);
  const r = arrive(t);
  const h = hueOf(t);
  const dim = between(t);
  for (const key of HUES) {
    const x = A[key];
    const y = B[key] as number | number[];
    if (Array.isArray(x)) {
      const arr = o[key] as number[];
      for (let i = 0; i < x.length; i++) arr[i] = x[i] + ((y as number[])[i] - x[i]) * h;
    } else o[key] = x + ((y as number) - x) * h;
  }
  // The hall itself darkens a little between two places.
  for (let i = 0; i < 3; i++) out.shade[i] *= 1 - 0.35 * dim;
  for (const key of LIGHTS) o[key] = (o[key] as number) * (1 - 0.6 * dim);
  out.dark += (0.85 - out.dark) * 0.45 * dim;
  for (const key of FEATURES) o[key] = (A[key] as number) * (1 - l) + (B[key] as number) * r;
  // An environment both places share stays; the rest recede and arrive.
  for (let i = 0; i < ENV; i++) out.env[i] = Math.max(a.env[i] * (1 - l) + b.env[i] * r, Math.min(a.env[i], b.env[i]));
  return out;
}

/**
 * How close the dark has crept in at a depth (see Descent.close): from where
 * a stratum has settled (10k + 2) it draws in a little with every depth,
 * most at 10k + 9 as the place fades, and opens out again as the next one
 * arrives (by 10k + 12); and on the whole it is closer the deeper.
 */
function closeness(d: number) {
  if (d < 1) return 0;
  const deep = 0.4 * (1 - Math.exp(-(d - 1) / 40));
  if (d < 2) return deep;
  const x = d - 10 * Math.floor((d - 2) / 10);
  const within = Math.min(1, (x - 2) / 7.5) * (1 - arrive(smoothstep(7, 12, x)));
  return deep + 0.45 * within;
}

/** Writes the scene at a depth into `out` (its look is written over, never shared). */
function fill(out: Descent, depth: number): Descent {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  const { stratum, turn } = strataAt(d);
  // The first stratum is the usual hall kindling, not a place giving way to another.
  const look = (stratum === 0 ? mixInto : blendInto)(out.look, lookOf(stratum - 1), lookOf(stratum), turn);
  out.deep = d < 1 ? 0 : 1 - Math.exp(-(d - 1) / 22);
  // Within a stratum the dark still creeps in a little with every depth.
  look.dark += (1 - look.dark) * 0.15 * out.deep;
  out.abyss = smoothstep(ABYSS_FROM, ABYSS_FULL, d);
  out.close = closeness(d);
  out.stratum = stratum;
  out.turn = turn;
  return out;
}

const fresh = (): Descent => ({ deep: 0, abyss: 0, close: 0, stratum: 0, turn: 0, look: blank() });

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
 * about a second, so a new stratum is well in while its card is up; a jump
 * cross-fades (see JUMP). Returns whether it is still moving.
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
  // Through the dark, as from one stratum to the next.
  fadeNow.close = mix(from.close, shownNow.close) + 0.4 * between(t) * (1 - Math.max(from.close, shownNow.close));
  fadeNow.stratum = shownNow.stratum;
  fadeNow.turn = shownNow.turn;
  blendInto(fadeNow.look, from.look, shownNow.look, t);
  return fadeNow;
}

/** The scene the shown one is heading for. */
export function targetDescent(): Descent {
  if (targetAt !== target) fill(targetNow, (targetAt = target));
  return targetNow;
}

/** The depth the scene shows right now (tests). */
export const shownDepth = () => shown;
