// Generated from the picks on the sound audition page; tweak freely.
// Each moment is a few layers played together. Per layer: volume (dB),
// playback rate, delay (ms), high-pass and low-pass cutoffs (Hz) and reverb
// send. Per moment: 'soften' cuts dB around 3.2 kHz (harshness), and
// varyPitch/varyGain randomize each play so repeats don't sound identical.

import type { Sfx } from './sound';

export type Layer = { file: string; gain: number; rate: number; delay: number; hp: number; lp: number; send: number };
export type Moment = { layers: Layer[]; soften: number; varyPitch: number; varyGain: number };

/** Whole mix: master volume (dB) and 'warmth', a high-shelf cut (dB) above 5 kHz. */
export const MIX = { volume: 7, warmth: 1 };

/**
 * How far (ms) into the 'fill' moment its first spark lands on the bar: the
 * whoosh swells up to it, then the sparks crackle across the fill.
 */
export const FILL_LEAD = 450;

/**
 * A quiet loop under the whole game, a hearth fire; lp is a low-pass cutoff
 * (Hz). In Delve each place keeps as much of it as its bed's `fire` says.
 */
export const AMBIENCE = { file: 'amb-game-4', gain: -40, lp: 5011 };

/**
 * A roaring fire that swells up over AMBIENCE for as long as a deathmatch
 * lasts. The file is as loud as AMBIENCE's, so the gains compare directly.
 */
export const FIRE = { file: 'amb-fire', gain: -30, lp: 3750 };

/**
 * Delve: how AMBIENCE changes all the way down (at descent's deep = 1, see
 * lib/descent.ts). It loses its highs, slows and drops in pitch, grows a
 * little louder and rings further into the hall.
 */
export const DEPTH = { lp: 1300, rate: 0.82, gain: 5, send: 0.45 };

/**
 * Delve: a slow, breathing rumble under AMBIENCE, generated (lowpassed brown
 * noise, its level about AMBIENCE's file's). It comes in a few depths down at
 * `gain` and swells by `abyss` dB toward the abyss; `breath` is how deep its
 * swell (0 to 1) and `period` how long (s).
 */
export const RUMBLE = { file: 'rumble', gain: -50, abyss: 7, lp: 140, breath: 0.4, period: 13 };

/**
 * Delve: one layer of a place's ambience bed, a loop played under the game.
 * Its level (dB), low-pass cutoff (Hz), playback rate and reverb send.
 */
export type BedLayer = { file: string; gain: number; lp: number; rate: number; send: number };

/**
 * Delve: a place's ambience bed. `fire` is how much of AMBIENCE (dB, over
 * its gain and DEPTH's) stays lit there, null for none; `layers` play under
 * it. As the scene turns from one place into the next their beds cross-fade
 * with its hall (equal power, see bedsAt in lib/sound.ts). As picked on the
 * ambience mix board, which mixes them just as the game does, then leveled
 * by loudness (LUFS, each place's whole mix at the depth it settles): moved
 * toward the lobby's loudness all the way at depth 1, half way by depth 100
 * and past it, so the deeper places may keep more of their own character.
 */
export type Bed = { fire: number | null; layers: BedLayer[] };

/** Delve: each zone's bed, in the zones' order (depths 1 to 10, 11 to 20, ... 91 to 100). */
export const ZONE_AMBIENCE: readonly Bed[] = [
  // The Mines
  { fire: -1.6, layers: [{ file: 'amb-mines-3', gain: -44.6, lp: 2837, rate: 0.98, send: 0.75 }] },
  // Magma Fissure
  { fire: -8.7, layers: [{ file: 'amb-magma-3', gain: -40.7, lp: 2252, rate: 0.83, send: 0.2 }] },
  // Frozen Hollow
  { fire: null, layers: [{ file: 'amb-frozen-1', gain: -40.6, lp: 9000, rate: 1, send: 0.85 }] },
  // Fungal Caverns
  { fire: -11.6, layers: [{ file: 'amb-fungal-1', gain: -41.6, lp: 9000, rate: 1, send: 0.2 }] },
  // Vaal Outpost
  { fire: -6.1, layers: [{ file: 'amb-vaal-1', gain: -44.1, lp: 3022, rate: 1, send: 0.8 }] },
  // Abyssal Depths
  { fire: null, layers: [{ file: 'amb-abyss-1', gain: -41.9, lp: 9000, rate: 1, send: 0.7 }] },
  // Petrified Forest
  { fire: -38.2, layers: [{ file: 'amb-petrified-1', gain: -39.2, lp: 5556, rate: 0.9, send: 0.35 }] },
  // Sulphur Vents
  { fire: -5.8, layers: [{ file: 'amb-sulphur-1', gain: -48.8, lp: 20000, rate: 1.05, send: 0.9 }] },
  // Abyssal City
  { fire: null, layers: [{ file: 'amb-city-1', gain: -41, lp: 9000, rate: 1, send: 0.2 }] },
  // Primeval Ruins
  {
    fire: -4.5,
    layers: [
      { file: 'amb-primeval-2', gain: -44.5, lp: 20000, rate: 0.74, send: 1 },
      { file: 'amb-primeval-1', gain: -40.5, lp: 300, rate: 0.94, send: 0.75 },
    ],
  },
];

/**
 * Delve: each endgame archetype's bed past depth 100, in ARCHETYPES' order
 * (lib/archetypes.ts). Every stratum of an archetype sounds the same.
 */
export const ARCHETYPE_AMBIENCE: readonly Bed[] = [
  // Drowned temple
  { fire: -13.2, layers: [{ file: 'amb-fungal-4', gain: -43.2, lp: 9000, rate: 1, send: 0.2 }] },
  // Ember forge
  { fire: -5.9, layers: [{ file: 'amb-magma-4', gain: -45.9, lp: 9000, rate: 1, send: 0.2 }] },
  // Void bloom
  { fire: -13.6, layers: [{ file: 'amb-endgame-3', gain: -43.6, lp: 9000, rate: 1, send: 0.2 }] },
  // Frozen abyss
  { fire: null, layers: [{ file: 'amb-frozen-2', gain: -40.3, lp: 2837, rate: 1, send: 1 }] },
  // Sulphur marsh
  { fire: -13.2, layers: [{ file: 'amb-sulphur-2', gain: -43.2, lp: 9000, rate: 1, send: 0.2 }] },
  // Lantern necropolis
  { fire: -13.5, layers: [{ file: 'amb-endgame-2', gain: -43.5, lp: 9000, rate: 1, send: 0.2 }] },
  // Sunken garden
  { fire: -12.1, layers: [{ file: 'amb-fungal-4', gain: -44.1, lp: 4228, rate: 1, send: 0.45 }] },
  // Blood eclipse
  { fire: -13.6, layers: [{ file: 'amb-endgame-6', gain: -43.6, lp: 9000, rate: 1, send: 0.2 }] },
  // Glacial pyre
  { fire: -5.5, layers: [{ file: 'amb-frozen-2', gain: -45.5, lp: 9000, rate: 1, send: 0.2 }] },
  // Ashen reliquary
  { fire: -13.5, layers: [{ file: 'amb-vaal-3', gain: -43.5, lp: 9000, rate: 1, send: 0.2 }] },
  // Starfall abyss
  { fire: -13.5, layers: [{ file: 'amb-endgame-1', gain: -43.5, lp: 9000, rate: 1, send: 0.2 }] },
  // Witchfire grove
  { fire: -4.9, layers: [{ file: 'amb-endgame-5', gain: -49.9, lp: 9000, rate: 1, send: 0.2 }] },
];

/**
 * Delve: an Azurite Vein caving in, generated too (lib/sound.ts caveIn): a
 * crack, a deep rumble, heavy thumps and a collapse of stones settling, over
 * `seconds`; `rumble` and `stones` set how loud each is against the other. Played by the
 * caveIn moment below.
 */
export const CAVE_IN = { file: 'cave-in', seconds: 1.3, rumble: 6, stones: 4 };

/** Delve: the run is over; no victory, just the last ember going out. */
const FALLEN: Moment = {
  soften: 5,
  varyPitch: 0.01,
  varyGain: 0.5,
  layers: [
    { file: 'defeat-2', gain: -23, rate: 0.62, delay: 0, hp: 30, lp: 300, send: 0.8 },
    { file: 'layer-sub-2', gain: -24, rate: 0.5, delay: 355, hp: 20, lp: 600, send: 0.5 },
    { file: 'layer-air-4', gain: -30, rate: 0.55, delay: 80, hp: 150, lp: 822, send: 0.85 },
    { file: 'victory-6', gain: -32, rate: 0.7, delay: 0, hp: 20, lp: 20000, send: 0.8 },
  ],
};

/**
 * A moment heard from far off: quieter, its highs gone, further into the
 * hall and a beat late. Delve together: a teammate perishing is your own
 * perishing heard from down the shaft.
 */
function distant(m: Moment): Moment {
  return {
    ...m,
    soften: m.soften + 2,
    layers: m.layers.map((l) => ({ ...l, gain: l.gain - 9, lp: Math.min(l.lp, 1200), send: Math.min(1, l.send + 0.2), delay: l.delay + 90 })),
  };
}

export const MOMENTS: Record<Sfx, Moment> = {
  hover: {
    soften: 5.5,
    varyPitch: 0.065,
    varyGain: 2,
    layers: [
      { file: 'hover-2', gain: -41, rate: 1.6, delay: 0, hp: 563, lp: 12341, send: 0.25 },
      { file: 'hover-1', gain: -45, rate: 1.37, delay: 0, hp: 206, lp: 13592, send: 0.3 },
    ],
  },
  click: {
    soften: 3,
    varyPitch: 0,
    varyGain: 2,
    layers: [
      { file: 'click-1', gain: -39, rate: 0.89, delay: 0, hp: 765, lp: 7493, send: 0.2 },
      { file: 'click-5', gain: -41, rate: 1.1, delay: 0, hp: 20, lp: 1908, send: 0.1 },
      { file: 'click-4', gain: -28, rate: 1.6, delay: 0, hp: 1200, lp: 2946, send: 0.25 },
      { file: 'pick-5', gain: -30, rate: 1.14, delay: 0, hp: 1200, lp: 14731, send: 0.15 },
    ],
  },
  yourTurn: {
    soften: 5.5,
    varyPitch: 0.035,
    varyGain: 0.5,
    layers: [
      { file: 'yourTurn-3', gain: -24, rate: 1.42, delay: 0, hp: 298, lp: 11950, send: 0.2 },
      { file: 'layer-air-3', gain: -36, rate: 1.13, delay: 20, hp: 351, lp: 4065, send: 0.6 },
      { file: 'layer-texture-4', gain: -32, rate: 1, delay: 5, hp: 20, lp: 3405, send: 0 },
    ],
  },
  turn: {
    soften: 7.5,
    varyPitch: 0.06,
    varyGain: 1.5,
    layers: [
      { file: 'turn-1', gain: -28, rate: 0.98, delay: 0, hp: 574, lp: 12341, send: 0.1 },
    ],
  },
  pick: {
    soften: 6.5,
    varyPitch: 0.045,
    varyGain: 1.5,
    layers: [
      { file: 'pick-5', gain: -21, rate: 1, delay: 0, hp: 540, lp: 7000, send: 0.1 },
      { file: 'layer-sub-2', gain: -42, rate: 0.81, delay: 0, hp: 20, lp: 1318, send: 0.5 },
      { file: 'pick-4', gain: -32, rate: 1.34, delay: 0, hp: 140, lp: 2994, send: 0.7 },
    ],
  },
  reveal: {
    soften: 8,
    varyPitch: 0.06,
    varyGain: 0.5,
    layers: [
      { file: 'reveal-1', gain: -27, rate: 1.3, delay: 0, hp: 248, lp: 12744, send: 0.65 },
      { file: 'layer-sub-2', gain: -22, rate: 1, delay: 0, hp: 20, lp: 1651, send: 0.3 },
      { file: 'layer-metal-2', gain: -41, rate: 1.6, delay: 0, hp: 330, lp: 6483, send: 0.7 },
    ],
  },
  // A patch of veiled art fizzles into being: the "crispy burn 2" mix from the
  // Burn Sound Mixer. A crackling fire loop under a handheld sparkler's
  // crackle, a fuse fizzing and a close-up sparkler spitting at the start;
  // each file is trimmed and faded as it was mixed. It plays every second or
  // so while the art comes in, so it sits under the other moments.
  burn: {
    soften: 5.5,
    varyPitch: 0.18,
    varyGain: 1.5,
    layers: [
      { file: 'burn-crackle', gain: -40, rate: 1, delay: 270, hp: 173, lp: 16000, send: 0.48 },
      { file: 'burn-embers', gain: -37.5, rate: 1, delay: 0, hp: 60, lp: 16000, send: 0.96 },
      { file: 'burn-fuse', gain: -40, rate: 1, delay: 140, hp: 55, lp: 16000, send: 0.3 },
      { file: 'burn-sparkler', gain: -44.5, rate: 1, delay: 0, hp: 59, lp: 7176, send: 0.3 },
    ],
  },
  select: {
    soften: 3,
    varyPitch: 0.04,
    varyGain: 1.5,
    layers: [
      { file: 'select-6', gain: -38, rate: 1.2, delay: 0, hp: 120, lp: 5011, send: 0.6 },
      { file: 'click-1', gain: -23, rate: 1, delay: 0, hp: 1152, lp: 20000, send: 0.2 },
    ],
  },
  correct: {
    soften: 7.5,
    varyPitch: 0.005,
    varyGain: 0.5,
    layers: [
      { file: 'correct-7', gain: -17, rate: 1.22, delay: 0, hp: 112, lp: 2035, send: 0.85 },
      { file: 'select-5', gain: -28, rate: 1.46, delay: 40, hp: 449, lp: 6277, send: 0.15 },
      { file: 'yourTurn-2', gain: -39, rate: 1.23, delay: 0, hp: 95, lp: 1651, send: 0.2 },
    ],
  },
  // The point streams into the scorer's bar: a swell up to the first landing
  // (FILL_LEAD), crackling sparks as they land across it, and a ring when it's full.
  fill: {
    soften: 6,
    varyPitch: 0.04,
    varyGain: 0.5,
    layers: [
      { file: 'layer-air-3', gain: -33, rate: 1, delay: 0, hp: 600, lp: 9000, send: 0.5 },
      { file: 'fill-sparks', gain: -30, rate: 1, delay: 450, hp: 1200, lp: 11000, send: 0.3 },
      { file: 'layer-metal-2', gain: -33, rate: 2, delay: 1050, hp: 600, lp: 9000, send: 0.65 },
    ],
  },
  wrong: {
    soften: 3.5,
    varyPitch: 0.025,
    varyGain: 0.5,
    layers: [
      { file: 'wrong-3', gain: -32, rate: 0.86, delay: 0, hp: 40, lp: 9000, send: 0.05 },
      { file: 'select-4', gain: -33, rate: 1, delay: 0, hp: 124, lp: 1235, send: 0.05 },
      { file: 'layer-sub-5', gain: -30, rate: 1, delay: 0, hp: 87, lp: 20000, send: 0 },
    ],
  },
  tick: {
    soften: 3,
    varyPitch: 0.04,
    varyGain: 1.5,
    layers: [
      { file: 'tick-3', gain: -14, rate: 1, delay: 0, hp: 30, lp: 2500, send: 0.1 },
    ],
  },
  join: {
    soften: 6.5,
    varyPitch: 0.015,
    varyGain: 0.5,
    layers: [
      { file: 'join-4', gain: -31, rate: 1.07, delay: 0, hp: 40, lp: 9000, send: 0.45 },
    ],
  },
  start: {
    soften: 8,
    varyPitch: 0.015,
    varyGain: 0.5,
    layers: [
      { file: 'start-7', gain: -21, rate: 0.79, delay: 410, hp: 87, lp: 9237, send: 0.1 },
      { file: 'layer-air-4', gain: -18, rate: 1.12, delay: 0, hp: 431, lp: 20000, send: 0.75 },
      { file: 'deathmatch-7', gain: -17, rate: 1, delay: 340, hp: 37, lp: 20000, send: 0.2 },
    ],
  },
  deathmatch: {
    soften: 3,
    varyPitch: 0.015,
    varyGain: 0.5,
    layers: [
      { file: 'deathmatch-4', gain: -13, rate: 1.01, delay: 0, hp: 40, lp: 9000, send: 0.45 },
    ],
  },
  victory: {
    soften: 9,
    varyPitch: 0.015,
    varyGain: 0.5,
    layers: [
      { file: 'victory-7', gain: -25, rate: 1, delay: 0, hp: 381, lp: 9000, send: 0.85 },
      { file: 'deathmatch-1', gain: -31, rate: 1, delay: 0, hp: 20, lp: 20000, send: 0.3 },
      { file: 'defeat-5', gain: -31, rate: 1, delay: 0, hp: 20, lp: 20000, send: 0.3 },
    ],
  },
  defeat: {
    soften: 3,
    varyPitch: 0.015,
    varyGain: 0.5,
    layers: [
      { file: 'defeat-4', gain: -13, rate: 0.86, delay: 0, hp: 40, lp: 9000, send: 0.65 },
    ],
  },
  // Delve, as picked on the Delve sound page.
  stratum: {
    soften: 6,
    varyPitch: 0.02,
    varyGain: 1,
    layers: [
      { file: 'defeat-5', gain: -34, rate: 0.59, delay: 0, hp: 107, lp: 5917, send: 0.85 },
      { file: 'layer-sub-2', gain: -18, rate: 0.55, delay: 0, hp: 20, lp: 900, send: 0.6 },
      { file: 'layer-air-4', gain: -31, rate: 0.8, delay: 60, hp: 200, lp: 4200, send: 0.8 },
      { file: 'deathmatch-1', gain: -29, rate: 0.4, delay: 0, hp: 20, lp: 5917, send: 1 },
    ],
  },
  lifeLost: {
    soften: 6,
    varyPitch: 0.04,
    varyGain: 1,
    layers: [
      { file: 'burn-fuse', gain: -30, rate: 0.75, delay: 0, hp: 200, lp: 7000, send: 0.4 },
      { file: 'layer-sub-5', gain: -27, rate: 0.85, delay: 0, hp: 20, lp: 1200, send: 0.5 },
      { file: 'burn-sparkler', gain: -36, rate: 1.1, delay: 60, hp: 900, lp: 11000, send: 0.35 },
    ],
  },
  // The end of a descent, alone or together: no fanfare. A dark impact
  // slowed and muffled, a deep thud as the floor gives way, a breath falling
  // away into the hall, and a low gong ringing out under it.
  fallen: FALLEN,
  fallenFar: distant(FALLEN),
  // A road flare struck as the clock hits 0: the striker's scratch (a card
  // dealt, high and bright), a dry pop as the head catches, a quick burst of
  // fire as it flares up, then a loud hiss that sputters on (the sparkler's
  // fuse slowed and thinned to its highs, twice over, with the sparkler and
  // a few sparks spitting through it) for about a second and a half.
  flare: {
    soften: 4.5,
    varyPitch: 0.04,
    varyGain: 1,
    layers: [
      { file: 'pick-5', gain: -24, rate: 1.3, delay: 0, hp: 1600, lp: 12000, send: 0.15 },
      { file: 'click-5', gain: -22, rate: 1.45, delay: 75, hp: 700, lp: 9000, send: 0.3 },
      { file: 'click-1', gain: -28, rate: 0.8, delay: 75, hp: 180, lp: 4000, send: 0.2 },
      { file: 'layer-texture-4', gain: -23, rate: 1.2, delay: 55, hp: 300, lp: 9000, send: 0.35 },
      { file: 'burn-fuse', gain: -17, rate: 0.85, delay: 80, hp: 1800, lp: 14000, send: 0.25 },
      { file: 'burn-sparkler', gain: -27, rate: 0.9, delay: 150, hp: 700, lp: 12000, send: 0.25 },
      { file: 'fill-sparks', gain: -28, rate: 0.8, delay: 320, hp: 1500, lp: 11000, send: 0.3 },
      { file: 'burn-fuse', gain: -24, rate: 1, delay: 700, hp: 2500, lp: 13000, send: 0.35 },
    ],
  },
  // A stick of dynamite: its fuse fizzing for a breath (the sparkler's fuse,
  // quicker and brighter, with a spit of sparkler over it)…
  fuse: {
    soften: 4,
    varyPitch: 0.04,
    varyGain: 1,
    layers: [
      { file: 'burn-fuse', gain: -27, rate: 1.2, delay: 0, hp: 380, lp: 14000, send: 0.25 },
      { file: 'burn-sparkler', gain: -35, rate: 1.35, delay: 90, hp: 900, lp: 15000, send: 0.2 },
    ],
  },
  // An Azurite Vein caves in, for two losses at once (in place of a lost
  // life's sound, twice): the generated collapse (CAVE_IN), with the gate
  // slam slowed into the rock giving way, and a low thud under it. Heavy,
  // but over in about a second; drier than the blast, as it is close.
  caveIn: {
    soften: 5,
    varyPitch: 0.03,
    varyGain: 0.5,
    layers: [
      { file: 'cave-in', gain: -15, rate: 1, delay: 0, hp: 25, lp: 300, send: 0.4 },
      { file: 'layer-sub-2', gain: -17, rate: 0.62, delay: 0, hp: 20, lp: 900, send: 0.4 },
      { file: 'start-7', gain: -30, rate: 0.6, delay: 0, hp: 60, lp: 2400, send: 0.35 },
    ],
  },
  // …then the blast: a deep boom, the gate slam's crack and its echo off the
  // hall, a dull thud under it, stone chips landing and a crackle of burning.
  blast: {
    soften: 5,
    varyPitch: 0.035,
    varyGain: 0.5,
    layers: [
      { file: 'layer-sub-2', gain: -13, rate: 0.72, delay: 0, hp: 20, lp: 1500, send: 0.55 },
      { file: 'start-7', gain: -22, rate: 0.82, delay: 0, hp: 70, lp: 6000, send: 0.6 },
      { file: 'wrong-3', gain: -24, rate: 0.62, delay: 0, hp: 30, lp: 2600, send: 0.2 },
      { file: 'layer-sub-5', gain: -24, rate: 0.8, delay: 10, hp: 20, lp: 600, send: 0.3 },
      { file: 'click-5', gain: -31, rate: 0.75, delay: 170, hp: 400, lp: 9000, send: 0.5 },
      { file: 'click-5', gain: -34, rate: 0.95, delay: 260, hp: 500, lp: 9000, send: 0.55 },
      { file: 'burn-crackle', gain: -33, rate: 0.9, delay: 120, hp: 250, lp: 11000, send: 0.6 },
    ],
  },
  // Each deeper depth, as its cards are dealt and the scene sinks: a slow breath
  // falling away and a low thud.
  plunge: {
    soften: 5,
    varyPitch: 0.03,
    varyGain: 1,
    layers: [
      { file: 'layer-air-4', gain: -32, rate: 0.6, delay: 0, hp: 120, lp: 3000, send: 0.7 },
      { file: 'layer-sub-3', gain: -30, rate: 0.7, delay: 120, hp: 20, lp: 700, send: 0.5 },
    ],
  },
  // An Azurite Ward breaking in place of a life: a high bell struck and cut,
  // a low thump, a ring of metal and a shimmer as the crystal bursts.
  wardShatter: {
    soften: 3,
    varyPitch: 0.045,
    varyGain: 1.5,
    layers: [
      { file: 'defeat-3', gain: -38, rate: 1.8, delay: 55, hp: 972, lp: 4055, send: 0.4 },
      { file: 'layer-sub-5', gain: -29, rate: 0.85, delay: 0, hp: 20, lp: 1175, send: 0.5 },
      { file: 'layer-metal-2', gain: -43, rate: 0.77, delay: 55, hp: 20, lp: 20000, send: 0.3 },
      { file: 'reveal-4', gain: -44, rate: 1.8, delay: 0, hp: 200, lp: 6999, send: 0.45 },
    ],
  },
  // A find answered right: the sparks whoosh from the answer and crackle
  // toward the item's slot; the ring, on the last layer, lands with the item
  // (Scoreboard times it to FIND_LANDS).
  findReward: {
    soften: 6,
    varyPitch: 0.04,
    varyGain: 0.5,
    layers: [
      { file: 'layer-air-3', gain: -33, rate: 1, delay: 0, hp: 600, lp: 9000, send: 0.5 },
      { file: 'fill-sparks', gain: -30, rate: 1, delay: 450, hp: 1200, lp: 11000, send: 0.3 },
      { file: 'layer-metal-2', gain: -33, rate: 2, delay: 1050, hp: 600, lp: 9000, send: 0.65 },
    ],
  },
  // Delve together: a vote cast for a card. Light; it plays every depth.
  vote: {
    soften: 1.5,
    varyPitch: 0.04,
    varyGain: 1.5,
    layers: [
      { file: 'select-6', gain: -38, rate: 1.52, delay: 0, hp: 120, lp: 5011, send: 0.6 },
      { file: 'click-1', gain: -23, rate: 0.65, delay: 0, hp: 1152, lp: 12083, send: 0.2 },
    ],
  },
  // Delve together: the draw lands on the card everyone will play.
  draw: {
    soften: 6.5,
    varyPitch: 0.045,
    varyGain: 1.5,
    layers: [
      { file: 'pick-5', gain: -21, rate: 1, delay: 0, hp: 540, lp: 7000, send: 0.1 },
      { file: 'layer-sub-2', gain: -42, rate: 0.81, delay: 0, hp: 20, lp: 1318, send: 0.5 },
      { file: 'pick-4', gain: -32, rate: 1.34, delay: 0, hp: 140, lp: 2994, send: 0.7 },
    ],
  },
  // Delve together: a teammate's wrong pick strikes an answer for everyone.
  // Quiet, under your own sounds.
  struck: {
    soften: 3.5,
    varyPitch: 0.025,
    varyGain: 0.5,
    layers: [
      { file: 'wrong-3', gain: -40, rate: 0.86, delay: 0, hp: 40, lp: 9000, send: 0.05 },
      { file: 'select-4', gain: -41, rate: 1, delay: 0, hp: 124, lp: 1235, send: 0.05 },
      { file: 'layer-sub-5', gain: -38, rate: 1, delay: 0, hp: 87, lp: 20000, send: 0 },
    ],
  },
  // Delve together: a life given to a teammate who perished, its light
  // streaming across and lighting as it lands.
  revive: {
    soften: 6,
    varyPitch: 0.04,
    varyGain: 0.5,
    layers: [
      { file: 'burn-crackle', gain: -33, rate: 1, delay: 0, hp: 600, lp: 9000, send: 0.5 },
      { file: 'fill-sparks', gain: -30, rate: 1, delay: 450, hp: 1200, lp: 11000, send: 0.3 },
      { file: 'burn-fuse', gain: -33, rate: 2, delay: 1050, hp: 600, lp: 9000, send: 0.65 },
      { file: 'correct-6', gain: -40, rate: 1.54, delay: 0, hp: 116, lp: 20000, send: 0.95 },
    ],
  },
};
