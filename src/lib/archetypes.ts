// The endgame's archetypes: past the last zone every stratum is one of these
// moods, each a coherent recipe (lib/backdropGen.ts, generateStratum, makes
// a look from one; lib/backdrops.ts deals them out and names the strata):
//
// - its effects, one or two of the environments the backdrop draws, each
//   clearly there at a modest strength (from EFFECT_FLOOR up to at most
//   EFFECT_CEILING, a quiet background, as the hand-made zones keep theirs),
//   and the hue each is turned toward within its kind's colour rules
//   (ENV_TONES in lib/backdropData.ts);
// - its palette schemes (variants, one picked by the seed): where its base
//   hue lies and how the accent hues are found from it (Scheme), and which
//   of the light from below, the haze from above, the glow and the high
//   smoke take them, so a stratum is never all one shade;
// - its embers' colour and way of moving (motion profiles of
//   lib/emberProfiles.ts), and its character: darker or lighter, still or
//   restless, clear or hazy, thin or dense;
// - its names: a curated few, then epithets and places composed, every
//   combination meant to read well (no hand-made zone's name among them).
//
// Data only (nothing here imports anything but types).

import type { EnvName } from './backdropData.ts';

/** The least strength (0 to 1) any effect of a generated stratum is drawn at, so it clearly reads. */
export const EFFECT_FLOOR = 0.3;
/** The most: a quiet background, as the zones' secondary effects are (the petrified mist's stone trunks come in from 0.45, so mist stays under that). */
export const EFFECT_CEILING = 0.62;
/** The most the mist is drawn at (its trunks come in from 0.45). */
export const MIST_CEILING = 0.44;

/**
 * A hue a recipe points at: the base hue (the smoke's), one of the two
 * accents the scheme finds from it, a turn of the base hue by `deg`, an
 * effect's own colour (the first or second effect's, as its kind has it),
 * or a hue on the wheel outright.
 */
export type HueRef = 'base' | 'a1' | 'a2' | 'fx1' | 'fx2' | { off: number } | { at: number };

/**
 * How a variant's accents are found from its base hue h (each a little
 * jittered by the seed; `turn`, where a variant gives one, fixes which way):
 * - 'complement': analogous smoke with a complementary accent, a1 = h + 180
 *   (+ turn, up to 45 degrees, so a blue hall's accent is amber rather than
 *   olive), a2 a near neighbour (h + 30);
 * - 'split': split-complementary, a1 = h + 150 and a2 = h + 210 (turn -30),
 *   or the other way round (turn 30);
 * - 'triad': a muted triad, a1 = h + 120 and a2 = h + 240 (turn 120), or the
 *   other way round (turn -120), the accents less saturated;
 * - 'warm-cold': the smoke cold (or warm) against an effect's own colour,
 *   a1 = the first effect's hue (`from: 'fx2'`, the second's), a2 a near
 *   neighbour of the base.
 */
export type Scheme = 'complement' | 'split' | 'triad' | 'warm-cold';

export interface Variant {
  scheme: Scheme;
  /** Where its base hue lies (degrees, from one to the other round the wheel). */
  hue: [number, number];
  /** Which way its accents turn (see Scheme); the seed's way where none is given. */
  turn?: number;
  /** For 'warm-cold': which effect's colour is the accent (the first's by default). */
  from?: 'fx1' | 'fx2';
  /** How saturated its smoke is, times the settings' (1 as they are; under it greyer, an ash). */
  sat?: number;
  /** What colours the light from below, the haze from above, the glow in the middle and the high left smoke drift (the others keep near the base hue). */
  floor: HueRef;
  haze: HueRef;
  glow: HueRef;
  hiB: HueRef;
}

export interface Effect {
  env: EnvName;
  /** Its strength's range (within EFFECT_FLOOR and EFFECT_CEILING). */
  strength: [number, number];
  /** The hue its colours are turned toward, as far as its kind's rule lets them. */
  toward: HueRef;
  /** Where in its rule's saturation range its colours lie (0 the palest the rule allows, 1 the boldest). */
  sat: [number, number];
}

export interface Archetype {
  /** What it is called in the tool (the mood, not a stratum's name). */
  kind: string;
  /** Its first effect, always drawn, and its second, drawn as often as `pair` has it (0 to 1). */
  fx: [Effect, Effect];
  pair: number;
  variants: Variant[];
  /** The embers: the hue they burn in, and how saturated (0 to 1, a range). */
  ember: { hue: HueRef; sat: [number, number] };
  /** Their ways of moving (motion profiles by name), one picked by the seed. */
  motion: string[];
  /** Sparks bursting up from below now and then (a range, 0 none), for the fiery ones. */
  burst?: [number, number];
  /** Darker (positive) or lighter than the settings' darkness. */
  dark: number;
  /** How restless the embers are (agitation, a range 0 to 1). */
  agit: [number, number];
  /** How hazy (the haze from above's strength, a range) and how dense the smoke (added to its thickness). */
  hazeK: [number, number];
  dense: number;
  /** More (positive) or fewer embers than the settings have. */
  crowd: number;
  /** The zone whose emblem its strata bear (the seal's sigil and the ribbon's ornament, lib/zoneSigils.ts and lib/zoneOrnaments.ts). */
  emblem: string;
  /** Its strata's names: the curated ones first, then every epithet with every place. */
  names: string[];
  epithets: string[];
  places: string[];
}

const fx = (env: EnvName, strength: [number, number], toward: HueRef, sat: [number, number] = [0.4, 0.9]): Effect => ({ env, strength, toward, sat });

export const ARCHETYPES: readonly Archetype[] = [
  {
    kind: 'Drowned temple',
    // Pale light falling into a cold, flooded hall; the fog lying on the water.
    fx: [fx('shafts', [0.36, 0.56], 'fx1', [0, 0.35]), fx('mist', [0.38, MIST_CEILING], { off: 20 }, [0.5, 1])],
    pair: 0.9,
    variants: [
      { scheme: 'warm-cold', hue: [172, 198], floor: { off: 18 }, haze: 'a2', glow: 'a1', hiB: 'a2' },
      { scheme: 'split', hue: [192, 214], turn: -30, floor: { off: -25 }, haze: 'a1', glow: { at: 44 }, hiB: { off: -40 } },
    ],
    ember: { hue: 'base', sat: [0.2, 0.4] },
    motion: ['motes settling', 'dust sifting down'],
    dark: 0.02,
    agit: [0.05, 0.2],
    hazeK: [0.6, 0.8],
    dense: 0.05,
    crowd: -0.1,
    emblem: 'Vaal Outpost',
    names: ['The Drowned Nave', 'Sunken Chantry', 'Hall of Still Water', 'The Tidal Sanctum', 'Cistern of Saints', 'The Flooded Choir', 'Weeping Baptistry'],
    epithets: ['Drowned', 'Sunken', 'Silent', 'Brackish', 'Tideworn'],
    places: ['Cloister', 'Basilica', 'Font', 'Shrine'],
  },
  {
    kind: 'Ember forge',
    // Fire roaring low and lamps along the walls, in slate smoke or rust.
    fx: [fx('heat', [0.4, 0.58], 'fx1', [0.4, 1]), fx('lamps', [0.32, 0.5], 'fx2', [0.4, 1])],
    pair: 0.85,
    variants: [
      { scheme: 'warm-cold', hue: [228, 256], sat: 0.6, floor: 'a1', haze: 'base', glow: 'a1', hiB: 'a2' },
      { scheme: 'complement', hue: [8, 26], floor: 'base', haze: 'a1', glow: { off: 15 }, hiB: 'a1' },
    ],
    ember: { hue: 'fx1', sat: [0.7, 0.9] },
    motion: ['embers rising', 'sparks flying up'],
    burst: [0.2, 0.5],
    dark: -0.04,
    agit: [0.4, 0.75],
    hazeK: [0.4, 0.55],
    dense: 0.1,
    crowd: 0.15,
    emblem: 'Primeval Ruins',
    names: ['The Ember Forge', 'Anvil of the Damned', 'Cinder Foundry', 'The Bellows Deep', 'Smeltery of Kings', 'The Slag Halls', 'Furnace of Oaths'],
    epithets: ['Smouldering', 'Blackened', 'Hammered', 'Scorched', 'Searing'],
    places: ['Forge', 'Crucible', 'Kiln', 'Smithy'],
  },
  {
    kind: 'Void bloom',
    // A rose or violet void coiling open, cold spores glowing round it.
    fx: [fx('void', [0.45, 0.6], { off: 30 }, [0.5, 1]), fx('spores', [0.36, 0.52], 'a1', [0.4, 0.9])],
    pair: 0.85,
    variants: [
      { scheme: 'split', hue: [285, 320], turn: 45, floor: 'a1', haze: 'base', glow: { off: 30 }, hiB: 'a1' },
      { scheme: 'triad', hue: [255, 280], turn: -120, floor: 'a1', haze: 'base', glow: 'a2', hiB: 'a1' },
    ],
    ember: { hue: { off: 30 }, sat: [0.45, 0.7] },
    motion: ['drawn into the eddies', 'spores hanging'],
    dark: 0.06,
    agit: [0.15, 0.4],
    hazeK: [0.45, 0.65],
    dense: 0,
    crowd: 0,
    emblem: 'Abyssal Depths',
    names: ['The Hollow Bloom', 'Garden of Nothing', 'The Unlit Orchard', 'Petals of the Void', 'Nightbloom Vault', 'The Pale Corolla', 'Bower of Whispers'],
    epithets: ['Withering', 'Starless', 'Dreaming', 'Lightless', 'Blooming'],
    places: ['Bower', 'Arbour', 'Hothouse', 'Trellis'],
  },
  {
    kind: 'Frozen abyss',
    // Rime creeping in from every side round a cold void, snow falling.
    fx: [fx('frost', [0.45, 0.6], 'base', [0.4, 0.9]), fx('void', [0.4, 0.55], { off: -60 }, [0.4, 0.9])],
    pair: 0.85,
    variants: [
      { scheme: 'complement', hue: [238, 262], turn: -35, floor: { off: 38 }, haze: 'base', glow: 'a1', hiB: { off: 30 } },
      { scheme: 'triad', hue: [222, 245], turn: 120, floor: 'a1', haze: 'base', glow: { off: -60 }, hiB: { off: -25 } },
    ],
    ember: { hue: 'base', sat: [0.12, 0.3] },
    motion: ['snow falling'],
    dark: 0.08,
    agit: [0.05, 0.2],
    hazeK: [0.5, 0.7],
    dense: -0.05,
    crowd: 0.1,
    emblem: 'Frozen Hollow',
    names: ['The Frozen Abyss', 'Rime of the Deep', 'The Glass Chasm', 'Hall of Pale Stars', 'The Hoarfrost Rift', 'Throne of Winter', 'The Silent Floe'],
    epithets: ['Frostbound', 'Glacial', 'Shivering', 'Icebound', 'Wintry'],
    places: ['Gulf', 'Crevasse', 'Barrow', 'Expanse'],
  },
  {
    kind: 'Sulphur marsh',
    // Fumes rising off a murky bog, fog lying over it, a witchlight below.
    fx: [fx('plumes', [0.42, 0.58], 'a2', [0.3, 0.8]), fx('mist', [0.38, MIST_CEILING], 'base', [0.6, 1])],
    pair: 0.9,
    variants: [
      { scheme: 'split', hue: [148, 172], turn: 45, floor: { at: 24 }, haze: 'base', glow: { at: 85 }, hiB: 'a2' },
      { scheme: 'split', hue: [100, 122], floor: { off: -40 }, haze: 'a1', glow: { off: -25 }, hiB: 'a1' },
    ],
    ember: { hue: { at: 62 }, sat: [0.55, 0.8] },
    motion: ['spores hanging', 'embers rising'],
    dark: 0,
    agit: [0.2, 0.45],
    hazeK: [0.6, 0.8],
    dense: 0.15,
    crowd: 0,
    emblem: 'Sulphur Vents',
    names: ['The Brimstone Fen', 'Slough of Despond', 'The Reeking Bog', 'Mire of Witchlights', 'The Bilious Moor', 'Marsh of Old Bones', 'The Fuming Mere'],
    epithets: ['Rotting', 'Fetid', 'Murky', 'Sallow', 'Stagnant'],
    places: ['Morass', 'Quagmire', 'Sump', 'Marshes'],
  },
  {
    kind: 'Lantern necropolis',
    // Far cold lights of a dead city at dusk, warm lamps among its tombs.
    fx: [fx('city', [0.42, 0.58], 'base', [0.4, 0.9]), fx('lamps', [0.3, 0.46], 'fx2', [0.4, 1])],
    pair: 0.85,
    variants: [
      { scheme: 'warm-cold', from: 'fx2', hue: [262, 290], floor: 'a1', haze: 'base', glow: 'a1', hiB: 'a2' },
      { scheme: 'complement', hue: [196, 216], floor: 'a1', haze: { off: 45 }, glow: 'a1', hiB: { off: 30 } },
    ],
    ember: { hue: 'a1', sat: [0.5, 0.75] },
    motion: ['dust sifting down', 'motes settling'],
    dark: 0.1,
    agit: [0.1, 0.3],
    hazeK: [0.35, 0.5],
    dense: -0.1,
    crowd: -0.05,
    emblem: 'Abyssal City',
    names: ['Necropolis of Lamps', 'The Lantern Tombs', 'City of the Unburied', 'The Seven Bells', 'Mausoleum Row', 'The Vigil Streets', 'The Last Lamplighter'],
    epithets: ['Lamplit', 'Mourning', 'Unburied', 'Tolling', 'Shrouded'],
    places: ['Catacombs', 'Ossuary', 'Boneyard', 'Crypts'],
  },
  {
    kind: 'Sunken garden',
    // A green hall glowing with spores, gold light falling through.
    fx: [fx('spores', [0.45, 0.6], 'base', [0.5, 1]), fx('shafts', [0.32, 0.48], 'fx2', [0.4, 0.9])],
    pair: 0.85,
    variants: [
      { scheme: 'warm-cold', from: 'fx2', hue: [148, 172], floor: 'base', haze: 'a2', glow: 'a1', hiB: 'a2' },
      { scheme: 'triad', hue: [172, 192], turn: 120, floor: 'a1', haze: 'base', glow: { at: 42 }, hiB: 'a1' },
    ],
    ember: { hue: { at: 46 }, sat: [0.45, 0.7] },
    motion: ['dust sifting down', 'spores hanging'],
    dark: -0.02,
    agit: [0.1, 0.3],
    hazeK: [0.5, 0.7],
    dense: 0,
    crowd: 0.1,
    emblem: 'Fungal Caverns',
    names: ['The Verdant Well', 'The Emerald Cistern', 'Sunlit Grotto', 'The Lost Arboretum', 'Glade Beneath Stone', 'The Mossgold Hall', 'The Hanging Gardens'],
    epithets: ['Overgrown', 'Glimmering', 'Verdant', 'Mossgrown', 'Gilded'],
    places: ['Grotto', 'Glade', 'Garden', 'Terrace'],
  },
  {
    kind: 'Blood eclipse',
    // A crimson void turning under a pale, failing light from above.
    fx: [fx('void', [0.45, 0.6], { off: 12 }, [0.5, 1]), fx('shafts', [0.32, 0.48], 'fx2', [0, 0.5])],
    pair: 0.85,
    variants: [
      { scheme: 'complement', hue: [336, 356], floor: 'base', haze: 'a1', glow: { at: 40 }, hiB: 'a1' },
      { scheme: 'split', hue: [350, 10], floor: { off: -20 }, haze: 'a2', glow: { at: 38 }, hiB: 'a1' },
    ],
    ember: { hue: 'base', sat: [0.7, 0.9] },
    motion: ['drawn into the eddies', 'embers rising'],
    dark: 0.06,
    agit: [0.2, 0.45],
    hazeK: [0.4, 0.6],
    dense: 0.1,
    crowd: 0,
    emblem: 'Abyssal Depths',
    names: ['The Blood Eclipse', 'Crimson Vespers', 'The Red Moon Altar', 'The Sanguine Dark', 'Hall of Red Silence', 'The Bleeding Sun', 'Chapel of Last Light'],
    epithets: ['Bloodlit', 'Eclipsed', 'Scarlet', 'Wounded', 'Sanguine'],
    places: ['Oratory', 'Sepulchre', 'Chancel', 'Vestry'],
  },
  {
    kind: 'Glacial pyre',
    // Fire burning low in an icebound hall: the warmest light against the coldest smoke.
    fx: [fx('frost', [0.42, 0.56], 'base', [0.3, 0.8]), fx('heat', [0.36, 0.5], 'fx2', [0.4, 1])],
    pair: 0.9,
    variants: [
      { scheme: 'warm-cold', from: 'fx2', hue: [190, 212], floor: 'a1', haze: 'base', glow: 'a1', hiB: 'a2' },
      { scheme: 'warm-cold', from: 'fx2', hue: [172, 190], floor: 'a1', haze: { off: 25 }, glow: 'base', hiB: 'a1' },
    ],
    ember: { hue: 'fx2', sat: [0.6, 0.85] },
    motion: ['sparks flying up', 'embers rising'],
    burst: [0.1, 0.35],
    dark: 0.02,
    agit: [0.3, 0.6],
    hazeK: [0.45, 0.65],
    dense: 0,
    crowd: 0.05,
    emblem: 'Frozen Hollow',
    names: ['The Glacial Pyre', 'Fire Beneath the Ice', 'The Thawing Throne', 'Hearth of Rime', 'The Kindled Glacier', 'The Burning Frost', 'Brazier of Winter'],
    epithets: ['Thawing', 'Steaming', 'Frostfire', 'Rimeburnt', 'Kindled'],
    places: ['Hearth', 'Bastion', 'Icefall', 'Beacon'],
  },
  {
    kind: 'Ashen reliquary',
    // Cracks of magma under grey ash, the ash falling like snow.
    fx: [fx('magma', [0.42, 0.58], 'fx1', [0.4, 1]), fx('mist', [0.38, MIST_CEILING], 'base', [0.3, 0.8])],
    pair: 0.85,
    variants: [
      { scheme: 'warm-cold', hue: [212, 248], sat: 0.45, floor: 'a1', haze: 'base', glow: 'a1', hiB: 'a2' },
      { scheme: 'warm-cold', hue: [262, 292], sat: 0.5, floor: 'a1', haze: 'a2', glow: { off: -20 }, hiB: 'a1' },
    ],
    ember: { hue: 'base', sat: [0.04, 0.16] },
    motion: ['dust sifting down', 'snow falling'],
    dark: 0.04,
    agit: [0.05, 0.25],
    hazeK: [0.55, 0.75],
    dense: 0.2,
    crowd: 0.15,
    emblem: 'Magma Fissure',
    names: ['Ashen Reliquary', 'The Cinder Vault', 'Tomb of Grey Kings', 'Ossuary of Ash', 'Urn of the Fallen', 'Chapterhouse of Ash', 'The Banked Coals'],
    epithets: ['Ashen', 'Charred', 'Sooted', 'Cindered', 'Molten'],
    places: ['Undercroft', 'Vaults', 'Mausoleum', 'Barrows'],
  },
  {
    kind: 'Starfall abyss',
    // Far lights wheeling round a slow vortex, as if the sky lay below.
    fx: [fx('city', [0.42, 0.56], 'base', [0.4, 0.9]), fx('void', [0.42, 0.58], 'a1', [0.4, 0.9])],
    pair: 0.9,
    variants: [
      { scheme: 'split', hue: [190, 214], floor: 'a1', haze: 'base', glow: 'a2', hiB: 'a1' },
      { scheme: 'complement', hue: [228, 250], turn: -25, floor: 'a1', haze: 'base', glow: 'a1', hiB: 'a2' },
    ],
    ember: { hue: 'a1', sat: [0.35, 0.6] },
    motion: ['drawn into the eddies', 'cold motes drifting'],
    dark: 0.08,
    agit: [0.1, 0.3],
    hazeK: [0.35, 0.5],
    dense: -0.15,
    crowd: 0.05,
    emblem: 'Abyssal City',
    names: ['The Starfall Abyss', 'Sky Beneath Stone', 'The Fallen Stars', 'Observatory of Ruin', 'The Star-Eaten Deep', 'Lights of Dead Kings', 'The Gyre of Lights'],
    epithets: ['Starlit', 'Spiralling', 'Fathomless', 'Glittering', 'Wheeling'],
    places: ['Firmament', 'Maelstrom', 'Vortex', 'Heavens'],
  },
  {
    kind: 'Witchfire grove',
    // Green spores and low fire in a plum-dark wood: a muted triad.
    fx: [fx('spores', [0.42, 0.58], 'a1', [0.5, 1]), fx('heat', [0.34, 0.5], 'fx2', [0.4, 1])],
    pair: 0.85,
    variants: [
      { scheme: 'triad', hue: [272, 300], turn: -120, floor: 'fx2', haze: 'a1', glow: 'a1', hiB: 'a2' },
      { scheme: 'complement', hue: [318, 342], floor: 'fx2', haze: 'a1', glow: 'base', hiB: 'a1' },
    ],
    ember: { hue: 'a1', sat: [0.45, 0.7] },
    motion: ['spores hanging', 'embers rising'],
    burst: [0, 0.2],
    dark: 0.04,
    agit: [0.25, 0.5],
    hazeK: [0.45, 0.65],
    dense: 0.05,
    crowd: 0.05,
    emblem: 'Fungal Caverns',
    names: ['The Witchfire Grove', 'Coven of Embers', 'The Hexed Thicket', 'The Blighted Copse', 'Grove of Green Flame', 'The Cauldron Wood', 'The Wicker Circle'],
    epithets: ['Cursed', 'Witchlit', 'Bewitched', 'Baleful', 'Gnarled'],
    places: ['Wildwood', 'Coppice', 'Brambles', 'Briarwood'],
  },
];

/** Every name an archetype's strata may take: its curated ones, then each epithet with each place. */
export const composedNames = (a: Archetype): string[] => a.epithets.flatMap((e) => a.places.map((p) => `${e} ${p}`));

/** The most characters a stratum's name has (the zone's ribbon fits it on a 375 px phone; the zones' longest has 16). */
export const NAME_MOST = 20;
