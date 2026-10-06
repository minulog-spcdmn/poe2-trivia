// How deep the scene is: Delve's depth turned into what the backdrop, its
// embers and the ambience follow. The descent passes through strata, one
// every ten depths, each a place of its own: the light welling up from
// below, the smoke and its colours, how dark the hall is, what the embers
// burn like and how they move, what glints in the walls, and the scene the
// backdrop draws for it. Each is named after a Delve biome, and they grow
// from the ordinary (a mine shaft) to the awe-inspiring (the colossal ruins
// at the bottom of the world).
//
// A stratum's scene is built from layers (LAYERS: the back wall, far
// silhouettes, the features between, the foreground and the air), one
// variant to a layer (ENVIRONMENTS: rock seams, timbering, magma, frost,
// broken towers, light shafts, ...), coloured by its palette. Past depth
// 100 the strata go on for ever, each combining the hall and palette of
// one deep stratum with another's far silhouettes, a third's air and a
// fourth's embers, its colours turned a little round the colour wheel, so
// no two in a row look alike; each is announced by its hall's biome again.
//
// One place turns into the next steadily, a little with every depth, never
// all at once, and the next is never there before its time. Through a
// stratum a growing share of the embers burns in the next one's colour (a
// tenth at its second depth, nine tenths at its last; strataAt). The hall
// (its light, smoke, glints and scene) first changes in its own way through
// the stratum's later depths, dying down (the lamps gutter, the magma cools
// and stiffens, the bloom fades: the stratum's `late` look), and only over
// its last two depths does the next one's come in, settling over that one's
// first two (hallAt).
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
  /** The glow in the middle: its colour (the surface's is gold; light shafts take it too) and strength (1 at the surface). */
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
  /** Smoke of the stratum's colour gathering in the dark (fog and far silhouettes take it too), and how much. */
  mist: RGB;
  mistK: number;
  /** The embers' halo, the colour their core burns toward, and how far. */
  ember: RGB;
  core: RGB;
  coreMix: number;
  /** Share of the extra embers in the air (0 to 1), and how large and bright they burn. (How they move is lib/emberMotion.ts's, by stratum.) */
  crowd: number;
  size: number;
  bright: number;
  /** What glints in the walls: its colour, how much of it (0 to 1), and how far from the walls it spreads (1: all over, like stars). */
  glint: RGB;
  glints: number;
  spread: number;
  /** Sparks bursting up from below now and then, and how often (0 to 1). */
  burst: number;
  /** How far each environment (ENVIRONMENTS, the variants of the scene's layers) has come in, 0 to 1. */
  env: number[];
  /** The stratum's colour for text on the dark header (the depth). */
  accent: RGB;
  /**
   * How bright its hall is lit, times the scene's light (1 the Mines'): a
   * stratum whose features burn bright (fire, gold) is lit less, one whose
   * dark swallows more is lit more, so each keeps to the scene's brightness
   * (luminanceAt) at a light (Descent.light) of about 1 where it settles,
   * and the light only eases a little through a turn. Worked out from the
   * estimate below (settle), for each stratum's look and its late one.
   */
  lightK: number;
  /**
   * How far its colours are turned round the colour wheel (radians, 0
   * through 100): past 100 each combined stratum turns its palette a little
   * (hueOf), and the backdrop turns its features' own colours as far.
   */
  hue: number;
}

/** The layers of a scene, back to front. */
export const LAYERS = ['wall', 'far', 'mid', 'fore', 'air'] as const;
export type Layer = (typeof LAYERS)[number];

/**
 * The variants of the layers the backdrop draws (lib/backdrop.ts, in this
 * order; a stratum's `env` says how far each has come in), by layer:
 * - the back wall: rock seams (the Mines), mycelium (Fungal), fitted
 *   masonry (Vaal);
 * - far silhouettes: the shaft's timbering, icicles, a ruined arcade, stone
 *   trunks, broken towers, colossal columns and a gate;
 * - the features between: lamps, magma, frost, bloom (bioluminescence), the
 *   void's eddies, crystals, fumes, the abyss's corruption (veins and a rift),
 *   glyphs;
 * - the foreground: rock outcrops, tendrils;
 * - the air: light shafts, spores, haze (fog banks), ash.
 */
export const ENVIRONMENTS = [
  'seams', 'mycelium', 'masonry',
  'timbers', 'icicles', 'arches', 'trunks', 'towers', 'colossi',
  'lamps', 'magma', 'frost', 'bloom', 'void', 'crystals', 'fumes', 'corruption', 'glyphs',
  'outcrops', 'tendrils',
  'shafts', 'spores', 'haze', 'ash',
] as const;
export type Environment = (typeof ENVIRONMENTS)[number];
export const ENV = ENVIRONMENTS.length;
/** The layer each environment belongs to. */
export const LAYER_OF: Record<Environment, Layer> = {
  seams: 'wall', mycelium: 'wall', masonry: 'wall',
  timbers: 'far', icicles: 'far', arches: 'far', trunks: 'far', towers: 'far', colossi: 'far',
  lamps: 'mid', magma: 'mid', frost: 'mid', bloom: 'mid', void: 'mid', crystals: 'mid', fumes: 'mid', corruption: 'mid', glyphs: 'mid',
  outcrops: 'fore', tendrils: 'fore',
  shafts: 'air', spores: 'air', haze: 'air', ash: 'air',
};
/**
 * How much of each is left at a stratum's last depths, as it dies down (its
 * late look): the lamps gutter out, the magma cools to black rock (the
 * backdrop draws it cooling as it falls), the bloom fades, the light
 * shafts dim; walls and silhouettes mostly stay.
 */
const LINGER: Record<Environment, number> = {
  seams: 0.8, mycelium: 0.8, masonry: 0.85,
  timbers: 0.9, icicles: 0.7, arches: 0.85, trunks: 0.9, towers: 0.85, colossi: 0.9,
  lamps: 0.3, magma: 0.22, frost: 0.55, bloom: 0.4, void: 0.45, crystals: 0.5, fumes: 0.35, corruption: 0.55, glyphs: 0.45,
  outcrops: 0.9, tendrils: 0.6,
  shafts: 0.4, spores: 0.5, haze: 0.7, ash: 0.6,
};
const ENV_INDEX = Object.fromEntries(ENVIRONMENTS.map((n, i) => [n, i])) as Record<Environment, number>;

/** A stratum's scene: one variant to each layer it has. */
export type Scene = Partial<Record<Layer, Environment>>;
/** A scene's environments, all the way in. */
const envOf = (scene: Scene) => {
  const env = ENVIRONMENTS.map(() => 0);
  for (const layer of LAYERS) if (scene[layer]) env[ENV_INDEX[scene[layer]!]] = 1;
  return env;
};

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
  size: 1,
  bright: 1,
  glint: [0.34, 0.62, 1],
  glints: 0,
  spread: 0,
  burst: 0,
  env: ENVIRONMENTS.map(() => 0),
  accent: [238, 206, 140],
  lightK: 1,
  hue: 0,
};

/** A stratum: its name, whether its first depth is announced, its scene, and its look as it begins and as it dies down. */
export interface Stratum {
  name: string;
  announced: boolean;
  scene: Scene;
  look: Look;
  late: Look;
}

/**
 * A stratum's look as it dies down through its last depths: its scene
 * lingering (LINGER), its dark deeper, its light from below, its haze and
 * its glow weaker, its smoke duller, its sparks calmer, and whatever of its
 * palette `over` changes (the magma's fire cooling to ash, the lamps' light
 * guttering, ...).
 */
function aged(look: Look, over: Partial<Look>): Look {
  const dull = (c: RGB): RGB => {
    const l = (c[0] + c[1] + c[2]) / 3;
    return c.map((v) => 0.78 * (l + 0.7 * (v - l))) as RGB;
  };
  const late: Look = {
    ...look,
    env: look.env.map((v, i) => v * LINGER[ENVIRONMENTS[i]]),
    dark: look.dark + 0.14 * (1 - look.dark),
    floorK: look.floorK * 0.7,
    hazeK: look.hazeK * 0.75,
    lamp: look.lamp * 0.75,
    mistK: look.mistK * 0.9,
    smoke: dull(look.smoke),
    smokeB: dull(look.smokeB),
    smokeHi: dull(look.smokeHi),
    smokeHiB: dull(look.smokeHiB),
    glints: look.glints * 0.8,
    burst: look.burst * 0.4,
  };
  return { ...late, ...over };
}

type Palette = Omit<Look, 'env' | 'lightK' | 'hue'>;
const stratum = (name: string, announced: boolean, scene: Scene, palette: Palette, late: Partial<Palette>): Stratum => {
  const look: Look = { ...palette, env: envOf(scene), lightK: 1, hue: 0 };
  return { name, announced, scene, look, late: aged(look, late) };
};

/**
 * The strata, depths 1-10, 11-20, ... 91-100, each named after a Delve biome
 * of Path of Exile and announced by it as it begins (the Mines, depths 1 to
 * 10, are where every run starts, so they aren't). Each mixes colours the
 * way the start page does: a few neighbouring hues in its smoke, one in the
 * light from below, another in the haze above and the glow between, so the
 * colours shift as the smoke drifts, rather than one flat tint. They grow
 * from the ordinary to the awe-inspiring, and grimmer, never brighter.
 */
export const STRATA: Stratum[] = [
  // The mines: an ordinary shaft, timbered, lamps hung along the walls, the
  // rock's seams catching their light; its fire below a little stronger than
  // the start page's, its smoke a little thicker. Late on the lamps gutter out.
  stratum('The Mines', false, { wall: 'seams', far: 'timbers', mid: 'lamps', fore: 'outcrops' }, {
    shade: [0.84, 0.78, 0.72], dark: 0.12,
    floor: [170, 76, 24], floorK: 0.22, floorH: 1.1,
    haze: [122, 94, 58], hazeK: 0.45, glow: [205, 152, 80], lamp: 0.6,
    smoke: [158, 74, 26], smokeB: [128, 46, 22], smokeHi: [138, 104, 58], smokeHiB: [106, 74, 44], smokeK: 0.9, shadowK: 1.15,
    mist: [120, 56, 20], mistK: 0.05,
    ember: [1, 0.5, 0.13], core: [1, 0.88, 0.6], coreMix: 0.58,
    crowd: 0.4, size: 1.05, bright: 1.1,
    glint: [1, 0.6, 0.2], glints: 0, spread: 0,
    burst: 0, accent: [240, 172, 96],
  }, {
    floor: [112, 62, 34], glow: [184, 128, 70],
    smoke: [122, 58, 24], smokeB: [98, 40, 22], smokeHi: [112, 88, 56], smokeHiB: [88, 64, 42],
  }),
  // Magma: vermilion and crimson smoke, wine and sienna above, the glow of
  // the fissures orange; heavy slow embers, garnet in the walls, ash
  // drifting down. Late on the magma cools: orange to dull red to a dark
  // crust with embers in it to black-grey rock, its flow slowing to a
  // stop, the smoke turning to grey ash.
  stratum('Magma Fissure', true, { mid: 'magma', fore: 'outcrops', air: 'ash' }, {
    shade: [1, 0.74, 0.7], dark: 0.3,
    floor: [150, 32, 14], floorK: 0.4, floorH: 1.2,
    haze: [96, 40, 56], hazeK: 0.6, glow: [210, 98, 50], lamp: 0.7,
    smoke: [150, 42, 16], smokeB: [112, 20, 28], smokeHi: [124, 60, 32], smokeHiB: [86, 26, 42], smokeK: 1.5, shadowK: 1.3,
    mist: [105, 16, 20], mistK: 0.07,
    ember: [1, 0.2, 0.08], core: [1, 0.62, 0.48], coreMix: 0.5,
    crowd: 0.3, size: 1.25, bright: 1.1,
    glint: [1, 0.26, 0.16], glints: 0.35, spread: 0,
    burst: 1, accent: [255, 116, 88],
  }, {
    floor: [78, 24, 16], floorK: 0.3, haze: [58, 44, 52], glow: [140, 76, 52], lamp: 0.5,
    smoke: [72, 56, 54], smokeB: [58, 44, 48], smokeHi: [66, 62, 64], smokeHiB: [50, 46, 54],
    mist: [48, 30, 30], burst: 0.1, glints: 0.15,
  }),
  // Frozen: azure and teal smoke, periwinkle and slate above, a pale ice
  // glow; frost creeping in from the walls over the cooled rock, icicles
  // hanging from the ledges, a cold mist, ice motes drifting down.
  stratum('Frozen Hollow', true, { far: 'icicles', mid: 'frost', air: 'haze' }, {
    shade: [0.78, 0.86, 1.1], dark: 0.38,
    floor: [36, 100, 176], floorK: 0.38, floorH: 1.15,
    haze: [96, 92, 150], hazeK: 0.6, glow: [140, 176, 214], lamp: 0.6,
    smoke: [44, 96, 156], smokeB: [34, 108, 120], smokeHi: [86, 96, 160], smokeHiB: [58, 60, 124], smokeK: 1.4, shadowK: 1.3,
    mist: [34, 70, 124], mistK: 0.06,
    ember: [0.38, 0.64, 1], core: [0.86, 0.94, 1], coreMix: 0.62,
    crowd: 0.45, size: 1, bright: 1.25,
    glint: [0.44, 0.72, 1], glints: 1, spread: 0,
    burst: 0, accent: [150, 202, 255],
  }, { floor: [30, 84, 150], floorK: 0.3 }),
  // Fungal: damp and dark, grey-teal and olive smoke, bone above; a sickly,
  // muted bioluminescence low in the walls, threaded through the mycelium
  // that webs the rock, and a haze of spores. Late on the bloom fades.
  stratum('Fungal Caverns', true, { wall: 'mycelium', mid: 'bloom', air: 'spores' }, {
    shade: [0.8, 0.9, 0.86], dark: 0.5,
    floor: [40, 80, 72], floorK: 0.3, floorH: 1.1,
    haze: [58, 70, 60], hazeK: 0.5, glow: [140, 162, 140], lamp: 0.45,
    smoke: [42, 72, 64], smokeB: [64, 72, 50], smokeHi: [84, 84, 70], smokeHiB: [50, 56, 62], smokeK: 1.4, shadowK: 1.4,
    mist: [40, 60, 54], mistK: 0.08,
    ember: [0.6, 0.78, 0.68], core: [0.9, 0.94, 0.86], coreMix: 0.5,
    crowd: 0.5, size: 1.2, bright: 0.85,
    glint: [0.66, 0.84, 0.76], glints: 0.2, spread: 0.3,
    burst: 0, accent: [176, 214, 190],
  }, { floor: [34, 66, 62], floorK: 0.24 }),
  // Vaal gold: gold and amber smoke, sand and terracotta above; walls of
  // fitted stone, a ruined arcade either side, dusty shafts of gold light,
  // gold dust sifting down. Late on the light fades to dusk.
  stratum('Vaal Outpost', true, { wall: 'masonry', far: 'arches', air: 'shafts' }, {
    shade: [1, 0.88, 0.7], dark: 0.5,
    floor: [196, 138, 44], floorK: 0.32, floorH: 1.0,
    haze: [170, 116, 74], hazeK: 0.5, glow: [222, 178, 98], lamp: 0.7,
    smoke: [176, 124, 32], smokeB: [168, 80, 26], smokeHi: [168, 136, 70], smokeHiB: [140, 70, 58], smokeK: 1.3, shadowK: 1.4,
    mist: [146, 104, 32], mistK: 0.06,
    ember: [1, 0.82, 0.36], core: [1, 0.97, 0.84], coreMix: 0.62,
    crowd: 0.35, size: 0.75, bright: 1.2,
    glint: [1, 0.86, 0.44], glints: 1, spread: 0.35,
    burst: 0, accent: [242, 204, 106],
  }, { floor: [150, 100, 38], floorK: 0.28, haze: [130, 88, 62], glow: [190, 146, 84] }),
  // The abyss: violet and indigo smoke, magenta-plum above, a lilac glow;
  // void coiling in the dark, tendrils reaching in from the edges, embers
  // pulled round in its eddies.
  stratum('Abyssal Depths', true, { mid: 'void', fore: 'tendrils' }, {
    shade: [0.86, 0.74, 1.1], dark: 0.6,
    floor: [104, 44, 164], floorK: 0.4, floorH: 1.2,
    haze: [50, 50, 120], hazeK: 0.5, glow: [160, 112, 210], lamp: 0.5,
    smoke: [96, 40, 150], smokeB: [58, 32, 124], smokeHi: [118, 42, 108], smokeHiB: [46, 46, 106], smokeK: 1.6, shadowK: 1.5,
    mist: [84, 32, 144], mistK: 0.08,
    ember: [0.74, 0.38, 1], core: [0.95, 0.86, 1], coreMix: 0.55,
    crowd: 0.7, size: 0.9, bright: 1.15,
    glint: [0.82, 0.54, 1], glints: 0.6, spread: 0.5,
    burst: 0, accent: [198, 152, 255],
  }, { floorK: 0.32 }),
  // Petrified: a forest turned to stone, colossal trunks with an opal sheen,
  // crystals glinting in their bark, pale light falling in shafts through a
  // stone canopy; cool blue-grey and lavender smoke, warm stone above, the
  // dust of the stone sinking slowly through the light.
  stratum('Petrified Forest', true, { far: 'trunks', mid: 'crystals', air: 'shafts' }, {
    shade: [0.9, 0.94, 1], dark: 0.55,
    floor: [64, 92, 108], floorK: 0.24, floorH: 1.3,
    haze: [150, 160, 172], hazeK: 0.7, glow: [196, 204, 214], lamp: 0.45,
    smoke: [66, 84, 92], smokeB: [82, 78, 100], smokeHi: [104, 104, 96], smokeHiB: [68, 92, 88], smokeK: 1.3, shadowK: 1.25,
    mist: [90, 98, 108], mistK: 0.08,
    ember: [0.78, 0.86, 0.92], core: [1, 1, 1], coreMix: 0.7,
    crowd: 0.35, size: 1.1, bright: 0.9,
    glint: [0.82, 0.9, 1], glints: 0.6, spread: 0.25,
    burst: 0, accent: [212, 222, 234],
  }, { haze: [126, 134, 146], glow: [172, 180, 192] }),
  // Sulphur vents: sulphur and green smoke, ochre and teal above;
  // yellow-green fumes billowing up from below in columns, a yellow haze,
  // rock jutting in.
  stratum('Sulphur Vents', true, { mid: 'fumes', fore: 'outcrops', air: 'haze' }, {
    shade: [0.82, 1, 0.88], dark: 0.62,
    floor: [62, 110, 52], floorK: 0.3, floorH: 1.0,
    haze: [128, 128, 50], hazeK: 0.7, glow: [184, 200, 94], lamp: 0.4,
    smoke: [108, 116, 32], smokeB: [56, 98, 62], smokeHi: [120, 104, 44], smokeHiB: [40, 88, 82], smokeK: 1.5, shadowK: 1.4,
    mist: [70, 100, 50], mistK: 0.07,
    ember: [0.5, 1, 0.68], core: [0.88, 1, 0.9], coreMix: 0.55,
    crowd: 0.5, size: 1, bright: 1.1,
    glint: [0.76, 1, 0.52], glints: 0.4, spread: 0.7,
    burst: 0.15, accent: [214, 232, 104],
  }, {}),
  // The ruined city: broken towers and fallen spires, dark against the glow
  // of a rift torn open below; the abyss's corruption crawling over the
  // stone in black veins with a violet light deep in them, tendrils reaching
  // in, ash and debris drifting down; ash-violet and plum smoke, near black.
  stratum('Abyssal City', true, { far: 'towers', mid: 'corruption', fore: 'tendrils', air: 'ash' }, {
    shade: [0.82, 0.78, 0.98], dark: 0.68,
    floor: [76, 30, 120], floorK: 0.42, floorH: 0.95,
    haze: [44, 40, 58], hazeK: 0.5, glow: [112, 84, 150], lamp: 0.4,
    smoke: [48, 38, 62], smokeB: [62, 30, 72], smokeHi: [54, 52, 60], smokeHiB: [38, 34, 54], smokeK: 1.7, shadowK: 1.5,
    mist: [42, 28, 62], mistK: 0.08,
    ember: [0.64, 0.58, 0.72], core: [0.88, 0.82, 0.94], coreMix: 0.4,
    crowd: 0.45, size: 1.1, bright: 0.75,
    glint: [0.72, 0.42, 1], glints: 0.3, spread: 0.1,
    burst: 0, accent: [196, 170, 236],
  }, { floor: [60, 26, 96], floorK: 0.34 }),
  // Primeval: the bottom of the world, the ruins of an age before all the
  // others: colossal fluted columns either side and, far off through the
  // haze, a gate of the same scale with a pale light beyond; inscriptions of
  // ancient gold kindling round the columns, pale light falling from far
  // above. Deep teal and blue-teal smoke, ancient gold and verdigris above,
  // gold motes rising slowly.
  stratum('Primeval Ruins', true, { far: 'colossi', mid: 'glyphs', air: 'shafts' }, {
    shade: [0.8, 0.96, 0.98], dark: 0.62,
    floor: [22, 90, 96], floorK: 0.36, floorH: 1.2,
    haze: [196, 170, 112], hazeK: 0.5, glow: [226, 202, 144], lamp: 0.5,
    smoke: [20, 72, 80], smokeB: [18, 52, 70], smokeHi: [118, 98, 54], smokeHiB: [66, 80, 66], smokeK: 1.5, shadowK: 1.5,
    mist: [20, 58, 64], mistK: 0.07,
    ember: [1, 0.8, 0.42], core: [1, 0.97, 0.86], coreMix: 0.65,
    crowd: 0.5, size: 0.95, bright: 1.15,
    glint: [1, 0.84, 0.5], glints: 0.7, spread: 0.4,
    burst: 0, accent: [236, 214, 150],
  }, { floorK: 0.26, glow: [200, 182, 130] }),
];

/** Past the last stratum, the strata it combines come from these (all but the first). */
const DEEP = STRATA.slice(1);
/** The parts of a look that make the hall; the rest are its embers and glints. */
const HALL_KEYS = ['shade', 'dark', 'floor', 'floorK', 'floorH', 'haze', 'hazeK', 'glow', 'lamp', 'smoke', 'smokeB', 'smokeHi', 'smokeHiB', 'smokeK', 'shadowK', 'mist', 'mistK', 'accent'] as const;
/** The colours of a look (0-255 or 0-1), turned round the colour wheel past 100. */
const COLOUR_KEYS = ['shade', 'floor', 'haze', 'glow', 'smoke', 'smokeB', 'smokeHi', 'smokeHiB', 'mist', 'ember', 'core', 'glint', 'accent'] as const;

/** The first stratum each environment belongs to (where it is measured; see ENV_ADD). */
export const ENV_HOME: number[] = ENVIRONMENTS.map((name) => STRATA.findIndex((s) => Object.values(s.scene).includes(name)));

/** The deep stratum (DEEP's index) after `start` that has a variant of `layer`, and isn't `not`. */
function donor(start: number, not: number, layer: Layer): number {
  for (let i = 0; i < DEEP.length; i++) {
    const z = (start + i) % DEEP.length;
    if (z !== not && DEEP[z].scene[layer]) return z;
  }
  return not;
}

/**
 * Past the last stratum, which deep strata stratum `k` combines (DEEP's
 * indices): the hall (its palette, back wall, the features between and the
 * foreground) steps by 4 of 9 each time, so it never repeats twice in a
 * row; the far silhouettes, the air and the embers each come from another,
 * on steps of their own. All come round every 9 strata (90 depths).
 */
function pairing(k: number): { hall: number; embers: number; far: number; air: number } {
  const n = DEEP.length;
  const hall = (k * 4) % n;
  let embers = (k * 7 + 3) % n;
  if (embers === hall) embers = (embers + 1) % n;
  return { hall, embers, far: donor(k * 2 + 5, hall, 'far'), air: donor(k * 5 + 1, hall, 'air') };
}

/**
 * How far past 100 stratum `k` turns its colours round the colour wheel
 * (radians): a slow swing to and fro, about a quarter turn of the hue at
 * the most, one step of it to each stratum, coming round every 9 strata as
 * the pairings do.
 */
export const HUE_SWING = 0.5;
export function hueOf(k: number): number {
  if (k < STRATA.length) return 0;
  return HUE_SWING * Math.sin((2 * Math.PI * ((k - STRATA.length) % DEEP.length)) / DEEP.length + 0.6);
}
/** How much saturation a turned palette keeps, so no colour comes out garish. */
export const HUE_SATURATION = 0.85;
/**
 * The matrix (rows) turning a colour `a` radians round the wheel, keeping
 * its brightness (CSS's hue-rotate), with HUE_SATURATION of its saturation;
 * the backdrop's shader builds the same for its features' colours.
 */
export function hueMatrix(a: number): number[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r = [
    0.213 + 0.787 * c - 0.213 * s, 0.715 - 0.715 * c - 0.715 * s, 0.072 - 0.072 * c + 0.928 * s,
    0.213 - 0.213 * c + 0.143 * s, 0.715 + 0.285 * c + 0.14 * s, 0.072 - 0.072 * c - 0.283 * s,
    0.213 - 0.213 * c - 0.787 * s, 0.715 - 0.715 * c + 0.715 * s, 0.072 + 0.928 * c + 0.072 * s,
  ];
  const l = [0.2126, 0.7152, 0.0722];
  return r.map((v, i) => HUE_SATURATION * v + (1 - HUE_SATURATION) * l[i % 3]);
}
/** A look's colours turned `a` radians (in place), each kept in its range. */
function turnHue(look: Look, a: number) {
  look.hue = a;
  if (a === 0) return;
  const m = hueMatrix(a);
  for (const key of COLOUR_KEYS) {
    const c = look[key];
    const top = key === 'shade' ? 2 : key === 'ember' || key === 'core' || key === 'glint' ? 1 : 255;
    look[key] = [0, 1, 2].map((i) => Math.min(top, Math.max(0, m[i * 3] * c[0] + m[i * 3 + 1] * c[1] + m[i * 3 + 2] * c[2]))) as RGB;
  }
}

/** Past the last stratum, the strata as they begin and as they die down, made once each (they are read every frame). */
const combined = new Map<number, { look: Look; late: Look }>();
/** The stratum past 190 that `k` comes round to (from there on every 9 strata are the same). */
const roundOf = (k: number) => (k < 19 ? k : 19 + ((k - 19) % DEEP.length));

/** Stratum `k` past the last, built from the strata it combines (see pairing), as it begins or as it dies down. */
function combine(k: number, late: boolean): Look {
  const { hall, embers, far, air } = pairing(k);
  const of = (z: number) => (late ? DEEP[z].late : DEEP[z].look);
  const look: Look = { ...of(embers), env: ENVIRONMENTS.map(() => 0) };
  const h = of(hall);
  for (const key of HALL_KEYS) (look as unknown as Record<string, unknown>)[key] = h[key];
  for (const [layer, z] of [['wall', hall], ['mid', hall], ['fore', hall], ['far', far], ['air', air]] as const) {
    const v = DEEP[z].scene[layer];
    if (v) look.env[ENV_INDEX[v]] = of(z).env[ENV_INDEX[v]];
  }
  turnHue(look, hueOf(k));
  look.lightK = settle(look, 10 * roundOf(k) + (late ? LATE_AT : SETTLED_AT));
  return look;
}

function combination(k: number) {
  const r = roundOf(k);
  let c = combined.get(r);
  if (!c) {
    if (combined.size > 64) combined.clear();
    c = { look: combine(r, false), late: combine(r, true) };
    combined.set(r, c);
  }
  return c;
}

/**
 * The look of stratum `k` as it begins (-1 is the surface, 0 depths 1 to
 * 10, and on for ever). Past the last, a combination of the deep strata.
 */
export function lookOf(k: number): Look {
  if (k < 0) return SURFACE;
  if (k < STRATA.length) return STRATA[k].look;
  return combination(k).look;
}

/** The look of stratum `k` as it dies down through its last depths (see Stratum.late). */
export function lateOf(k: number): Look {
  if (k < 0) return SURFACE;
  if (k < STRATA.length) return STRATA[k].late;
  return combination(k).late;
}

/** The stratum (STRATA's index) whose embers stratum `k` has: its own through 100; past it, the one it takes its embers from. */
export function emberStratumOf(k: number): number {
  if (k < STRATA.length) return Math.max(0, k);
  return 1 + pairing(roundOf(k)).embers;
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
  /** What the scene looks like: its hall where hallAt says, its embers where strataAt says. */
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

/** The parts of a look the embers follow, a tenth of the way with every depth of a stratum (strataAt). */
const EMBER_KEYS = new Set<string>(['ember', 'core', 'coreMix', 'crowd', 'size', 'bright']);
/** KEYS' indices of them. */
const EMBER_AT = KEYS.flatMap((key, i) => (EMBER_KEYS.has(key) ? [i] : []));

/**
 * The hall's timeline (everything but the embers): how many depths before a
 * stratum's first the next one's hall begins to come in (over the last two
 * of the stratum before), and how many after it has settled (over its own
 * first two). In between it dies down, from its look to its late one.
 */
export const ARRIVE_BEFORE = 2.5;
export const ARRIVE_AFTER = 2.5;
/** The depth (from a stratum's first, 0) its look settles at, and its late one: where each keeps to the brightness curve at a light of 1 (settle). */
const SETTLED_AT = 1 + ARRIVE_AFTER;
const LATE_AT = 1 + 10 - ARRIVE_BEFORE;

/**
 * Where the hall stands at depth `d` (from 1): stratum `stratum`'s hall
 * either arriving (from the late look of the one before, `t` of the way to
 * its own) or, settled, dying down (`t` of the way from its look to its
 * late one). The first stratum is all there at depth 1.
 */
export function hallAt(d: number): { stratum: number; arriving: boolean; t: number } {
  const x = Math.max(0, d - 1);
  const k = Math.floor((x + ARRIVE_BEFORE) / 10);
  const u = x - 10 * k;
  if (k > 0 && u < ARRIVE_AFTER) return { stratum: k, arriving: true, t: (u + ARRIVE_BEFORE) / (ARRIVE_BEFORE + ARRIVE_AFTER) };
  return { stratum: k, arriving: false, t: clamp01((u - ARRIVE_AFTER) / (10 - ARRIVE_BEFORE - ARRIVE_AFTER)) };
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
// them, with what the features come to from ENV_ADD and ENV_HALL. `light` is
// set so the sum keeps to luminanceAt(d), which only ever falls, and eased so
// it never swings from one depth to the next (see lightAt).
//
// TO DO in the final pass: the scenes were rebuilt from layers, and ENV_ADD
// and ENV_HALL are for now worked out by hand from what each layer draws
// (its coverage, strength and colour), not measured; and MEASURED, the
// per-depth correction measured against the old scenes, is left empty (no
// correction) rather than applied wrongly. Measure all three again from the
// backdrop's own frames with scripts/measure-luminance.mjs (calibrate, then
// calibrate --skip-env) and paste them in.

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
 * to 1) as it comes in, at ENV_STEPS: drawn in the hall of the stratum it
 * first belongs to (ENV_HOME) at light 0 (so nothing of the hall), with no
 * dark closed in and its features at full strength, less the same without
 * it. For now worked out by hand (see the note above): what glows by its
 * coverage, strength and colour; silhouettes, fog and frost add next to
 * nothing (they are lit by the hall's light, so they show in ENV_HALL).
 */
export const ENV_ADD: number[][] = [
  [0, 0.0004, 0.0008, 0.0012, 0.0016], // seams
  [0, 0.0001, 0.0002, 0.0003, 0.0004], // mycelium
  [0, 0.0005, 0.001, 0.0015, 0.002], // masonry
  [0, 0, 0, 0, 0], // timbers
  [0, 0.0001, 0.0002, 0.0003, 0.0004], // icicles
  [0, 0, 0, 0, 0], // arches
  [0, 0.0002, 0.0005, 0.0008, 0.0008], // trunks
  [0, 0.0001, 0.0003, 0.0005, 0.0005], // towers
  [0, 0.0009, 0.0027, 0.004, 0.004], // colossi
  [0, 0.0015, 0.0055, 0.0092, 0.011], // lamps
  [0, 0.0008, 0.005, 0.0095, 0.0145], // magma
  [0, 4e-05, 0.00011, 0.00019, 0.00027], // frost
  [0, 0.0003, 0.0011, 0.0022, 0.0035], // bloom
  [0, 0.00035, 0.00127, 0.00281, 0.00498], // void
  [0, 0.0001, 0.0002, 0.0003, 0.0004], // crystals
  [0, 0.00264, 0.00535, 0.00745, 0.00888], // fumes
  [0, 0.0009, 0.0024, 0.0042, 0.0064], // corruption
  [0, 0.0002, 0.0007, 0.0015, 0.0025], // glyphs
  [0, 0.0001, 0.0001, 0.0002, 0.0003], // outcrops
  [0, 0.0002, 0.0004, 0.0006, 0.0008], // tendrils
  [0, 0.0024, 0.006, 0.0094, 0.012], // shafts
  [0, 0.0001, 0.0002, 0.0003, 0.0004], // spores
  [0, 0, 0, 0, 0], // haze
  [0, 0.00012, 0.00025, 0.00038, 0.0005], // ash
];
/**
 * And how far each darkens (under 1) or lights the hall it is drawn over, at
 * ENV_STEPS: the hall drawn with it (at light 1, less at light 0) over the
 * same without it. Silhouettes darken it by what they cover; fog, frost and
 * fumes, lit by the hall's light, light it.
 */
export const ENV_HALL: number[][] = [
  [1, 0.99, 0.98, 0.97, 0.96], // seams
  [1, 0.99, 0.98, 0.975, 0.97], // mycelium
  [1, 0.99, 0.98, 0.97, 0.96], // masonry
  [1, 0.98, 0.95, 0.94, 0.94], // timbers
  [1, 1.005, 1.01, 1.015, 1.02], // icicles
  [1, 0.964, 0.905, 0.88, 0.88], // arches
  [1, 0.97, 0.91, 0.87, 0.87], // trunks
  [1, 0.95, 0.85, 0.78, 0.78], // towers
  [1, 0.97, 0.92, 0.88, 0.88], // colossi
  [1, 1, 1, 1, 1], // lamps
  [1, 1.01, 1, 0.98, 0.97], // magma
  [1, 1.043, 1.114, 1.198, 1.281], // frost
  [1, 1, 1, 1, 1], // bloom
  [1, 0.986, 0.949, 0.886, 0.799], // void
  [1, 1, 1, 1, 1], // crystals
  [1, 1.052, 1.111, 1.161, 1.195], // fumes
  [1, 0.99, 0.985, 0.975, 0.97], // corruption
  [1, 1, 1, 1, 1], // glyphs
  [1, 0.985, 0.97, 0.955, 0.94], // outcrops
  [1, 0.985, 0.97, 0.955, 0.94], // tendrils
  [1, 1, 1, 1, 1], // shafts
  [1, 1.02, 1.045, 1.07, 1.09], // spores
  [1, 1.04, 1.08, 1.115, 1.15], // haze
  [1, 1, 1, 1, 1], // ash
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
 * scripts/measure-luminance.mjs (calibrate --skip-env) with the ENV_ tables
 * in place. Empty, the estimate stands as it is: empty for now, as the
 * scenes it was measured for are gone (see the note above).
 */
export const MEASURED: (readonly [number, number])[] = [];
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
 * features, burning at `features`, and the embers).
 */
export function estimateLuminance(look: Look, close: number, features = 1): { hall: number; rest: number } {
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
    env += envTable(ENV_ADD[i], e);
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
      const e = estimateLuminance(look, closeness(d), featuresAt(d));
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
  const e = estimateLuminance(look, closeness(d), featuresAt(d));
  const [h, r] = measuredAt(d);
  return Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, (level - e.rest * r) / (e.hall * h)));
}

/** How deep the ambience is at a depth (see Descent.deep). */
const deepAt = (d: number) => (d < 1 ? 0 : 1 - Math.exp(-(d - 1) / 22));

/** The range a stratum's own light (Look.lightK) keeps to. */
const LIGHT_K_MIN = 0.35;
const LIGHT_K_MAX = 2.5;
/**
 * The light (Look.lightK) at which `look`, shown at depth `d` with the dark
 * closed in as far as it is there, keeps to the brightness curve
 * (luminanceAt) at a scene light of 1: so wherever a stratum settles, and
 * wherever it has died down, the light hardly needs to move.
 */
function settle(look: Look, d: number): number {
  const at: Look = { ...look, lightK: 1, dark: look.dark + (1 - look.dark) * 0.15 * deepAt(d) };
  const e = estimateLuminance(at, closeness(d), featuresAt(d));
  const [h, r] = measuredAt(d);
  return Math.min(LIGHT_K_MAX, Math.max(LIGHT_K_MIN, (luminanceAt(d) - e.rest * r) / (e.hall * h)));
}

/** Writes the look at depth `d` (at least 0) into `out`. */
function lookAt(out: Look, d: number): Look {
  const { stratum, turn } = strataAt(d);
  if (d < 1) return mixInto(out, SURFACE, STRATA[0].look, turn);
  // The hall where its timeline stands; the embers a tenth of the way to the next stratum's with every depth.
  const h = hallAt(d);
  if (h.arriving) mixInto(out, lateOf(h.stratum - 1), lookOf(h.stratum), h.t);
  else mixInto(out, lookOf(h.stratum), lateOf(h.stratum), h.t);
  const a = lookOf(stratum - 1) as unknown as Fields;
  const b = lookOf(stratum) as unknown as Fields;
  for (const i of EMBER_AT) mixField(out as unknown as Fields, a, b, KEYS[i], turn);
  // Within a stratum the dark still creeps in a little with every depth.
  out.dark += (1 - out.dark) * 0.15 * deepAt(d);
  return out;
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
    // (Wrapping round after hundreds of picks in one run, so the shader's
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

// Each stratum's own light, as it settles and as it dies down (the Mines'
// look is the measure of all of them, at 1). Worked out last, once the
// estimate above is ready.
for (let k = 0; k < STRATA.length; k++) {
  if (k > 0) STRATA[k].look.lightK = settle(STRATA[k].look, 10 * k + SETTLED_AT);
  STRATA[k].late.lightK = settle(STRATA[k].late, 10 * k + LATE_AT);
}
