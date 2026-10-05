// How deep the scene is: Delve's depth turned into what the backdrop, its
// embers and the ambience follow. The descent passes through strata, one
// every ten depths, each with a look of its own: the light welling up from
// below, the smoke, how dark the hall is, what the embers burn like and how
// they move, and what glints in the walls. Depth 1 is the usual scene; the
// first stratum kindles over depths 1 to 10, and from then on each one turns
// into the next over the first five depths of its own ten, so a stratum is
// recognisable from its middle on. The blue embers are the third stratum,
// from depth 21 (where a streak's fire can first burn blue). Each is named
// after a Delve biome. Past depth 100 the strata go on for ever, each
// pairing the hall of one deep stratum with the embers of another, so no two
// in a row look alike, and each is announced by its hall's biome again.
// Pure, apart from the eased channel at the bottom that the backdrop reads.

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
}

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
    },
  },
  {
    // Frozen: cold azure light from the floor, blue embers, azurite glinting.
    name: 'Frozen Hollow',
    announced: true,
    look: {
      shade: [0.75, 0.85, 1.15], dark: 0.38,
      floor: [34, 84, 160], floorK: 0.44, floorH: 1.15,
      haze: [60, 80, 110], hazeK: 0.2, lamp: 0.35,
      smoke: [28, 56, 104], smokeHi: [40, 52, 76], smokeMix: 1, smokeK: 1.4, shadowK: 1.3,
      mist: [30, 66, 124], mistK: 0.06,
      ember: [0.34, 0.62, 1], core: [0.86, 0.94, 1], coreMix: 0.62,
      crowd: 0.45, speed: 1, size: 1, bright: 1.3, agit: 0.35, fall: 0,
      glint: [0.4, 0.7, 1], glints: 1, spread: 0,
    },
  },
  {
    // Fungal: a sickly green-black, spores drifting and swaying.
    name: 'Fungal Caverns',
    announced: true,
    look: {
      shade: [0.8, 1, 0.72], dark: 0.5,
      floor: [72, 132, 26], floorK: 0.44, floorH: 1.1,
      haze: [50, 70, 30], hazeK: 0.15, lamp: 0.25,
      smoke: [38, 66, 18], smokeHi: [30, 44, 22], smokeMix: 1, smokeK: 1.5, shadowK: 1.4,
      mist: [50, 100, 20], mistK: 0.09,
      ember: [0.6, 1, 0.18], core: [0.92, 1, 0.62], coreMix: 0.5,
      crowd: 0.55, speed: 0.55, size: 1.3, bright: 1, agit: 0.6, fall: 0,
      glint: [0.7, 1, 0.3], glints: 0.25, spread: 0.3,
    },
  },
  {
    // Vaal gold: molten veins in the walls, gold dust sifting down.
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
    },
  },
  {
    // The abyss: violet light, restless embers swirling in the draft.
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
    },
  },
  {
    // Petrified: a pale, stone-grey fog, large ghostly wisps rising slowly.
    name: 'Petrified Forest',
    announced: true,
    look: {
      shade: [0.9, 0.95, 1], dark: 0.55,
      floor: [118, 136, 148], floorK: 0.24, floorH: 1.4,
      haze: [110, 124, 134], hazeK: 0.5, lamp: 0.15,
      smoke: [72, 78, 84], smokeHi: [80, 84, 90], smokeMix: 1, smokeK: 1.1, shadowK: 1.2,
      mist: [100, 112, 122], mistK: 0.08,
      ember: [0.72, 0.92, 0.95], core: [1, 1, 1], coreMix: 0.7,
      crowd: 0.3, speed: 0.45, size: 1.75, bright: 0.8, agit: 0.2, fall: 0,
      glint: [0.85, 0.95, 1], glints: 0, spread: 0,
    },
  },
  {
    // Sulphur vents: a sickly green-blue light from above, motes sinking
    // through the fumes as through water.
    name: 'Sulphur Vents',
    announced: true,
    look: {
      shade: [0.78, 1, 0.9], dark: 0.66,
      floor: [30, 76, 56], floorK: 0.2, floorH: 1,
      haze: [62, 126, 92], hazeK: 1.6, lamp: 0.1,
      smoke: [28, 58, 44], smokeHi: [40, 74, 54], smokeMix: 1, smokeK: 1.4, shadowK: 1.4,
      mist: [52, 96, 58], mistK: 0.07,
      ember: [0.4, 1, 0.68], core: [0.86, 1, 0.9], coreMix: 0.55,
      crowd: 0.5, speed: 0.5, size: 1, bright: 1.1, agit: 0.3, fall: 1,
      glint: [0.72, 1, 0.5], glints: 0.4, spread: 0.7,
    },
  },
  {
    // The drowned city: near black, a few still motes, cold lights all over like stars.
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
    },
  },
  {
    // Primeval: the bottom of the world, white-hot fire roaring under black smoke.
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
    },
  },
];

/** Past the last stratum, the strata it pairs come from these (all but the first). */
const DEEP = STRATA.slice(1);
/** The parts of a look that make the hall; the rest are its embers and glints. */
const HALL_KEYS = ['shade', 'dark', 'floor', 'floorK', 'floorH', 'haze', 'hazeK', 'lamp', 'smoke', 'smokeHi', 'smokeMix', 'smokeK', 'shadowK', 'mist', 'mistK'] as const;

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

/** The look of stratum `k` (-1 is the surface, 0 depths 1 to 10, and on for ever). */
export function lookOf(k: number): Look {
  if (k < 0) return SURFACE;
  if (k < STRATA.length) return STRATA[k].look;
  const { hall, embers } = pairing(k);
  const look = { ...DEEP[embers].look };
  for (const key of HALL_KEYS) (look as Record<string, unknown>)[key] = DEEP[hall].look[key];
  return look;
}

/** The biome stratum `k` is named after: past the last, the one whose hall it has. */
export function stratumName(k: number): string {
  if (k < STRATA.length) return STRATA[Math.max(0, k)].name;
  return DEEP[pairing(k).hall].name;
}

/** Each stratum after the first turns into view over this many depths from its start. */
const TURN = 5;

/**
 * The stratum a depth is in, or turning into, and how far (0 to 1): from
 * depth 1 to 10 the surface kindles into the first stratum, then stratum k
 * turns in over depths 10k to 10k + TURN (depth 20 is still all the second,
 * 21 starts the third).
 */
export function strataAt(depth: number): { stratum: number; turn: number } {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  if (d < 10) return { stratum: 0, turn: smoothstep(1, 10, d) };
  const k = Math.floor(d / 10);
  return { stratum: k, turn: smoothstep(10 * k, 10 * k + TURN, d) };
}

export interface Descent {
  /** 0 at the surface, toward 1: how deep, smoothly (the ambience follows it). */
  deep: number;
  /** The deepest dark, from about depth 50 to 75 (the ambience follows it). */
  abyss: number;
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

/** Two looks blended, `t` of the way from `a` to `b`. */
export function mixLook(a: Look, b: Look, t: number): Look {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out: Record<string, number | number[]> = {};
  for (const key of Object.keys(a) as (keyof Look)[]) {
    const x = a[key];
    const y = b[key];
    out[key] = Array.isArray(x) ? x.map((v, i) => v + ((y as RGB)[i] - v) * t) : x + ((y as number) - x) * t;
  }
  return out as unknown as Look;
}

/** The scene at a depth (0 outside Delve: the usual scene). Fractional depths ease between whole ones. */
export function descent(depth: number): Descent {
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  const { stratum, turn } = strataAt(d);
  const look = mixLook(lookOf(stratum - 1), lookOf(stratum), turn);
  const deep = d < 1 ? 0 : 1 - Math.exp(-(d - 1) / 22);
  // Within a stratum the dark still creeps in a little with every depth.
  const dark = look.dark + (1 - look.dark) * 0.15 * deep;
  return {
    deep,
    abyss: smoothstep(ABYSS_FROM, ABYSS_FULL, d),
    stratum,
    turn,
    look: dark === look.dark ? look : { ...look, dark },
  };
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

// Read every frame, so each is worked out once per depth rather than per call.
let shownMemo = { at: NaN, d: descent(0) };
let targetMemo = { at: NaN, d: descent(0) };

/** The scene as shown right now. */
export function currentDescent(): Descent {
  if (shownMemo.at !== shown) shownMemo = { at: shown, d: descent(shown) };
  return shownMemo.d;
}

/** The scene the shown one is heading for. */
export function targetDescent(): Descent {
  if (targetMemo.at !== target) targetMemo = { at: target, d: descent(target) };
  return targetMemo.d;
}

/** The depth the scene shows right now (tests). */
export const shownDepth = () => shown;
