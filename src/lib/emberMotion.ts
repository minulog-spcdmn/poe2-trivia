// How the backdrop's embers move, zone by zone: one motion to a zone, all
// its embers moving alike for a reason of its own (heat lifts the magma's,
// snow falls, spores hang), drawn by lib/backdropEmbers.ts. An ember takes
// the motion of the zone it burns in, so it changes as its colour does: at
// the start of a new life (see Embers.pick there). Two zones have a second,
// rarer kind of ember that moves its own way and looks it (the Mines' lamp
// sparks, the Abyssal City's corrupted sparks).
//
// Speeds are shares of the classic rise: an ember crossing the screen's
// height in its own period (7 to 21 seconds; the nearer, larger ones
// quicker), so the parallax between near and far stays. Sizes and
// brightness are about 1: how large, bright and many a zone's embers are is
// its look's (lib/descent.ts), which the scene's brightness is worked out
// from.

import { ARRIVE_AFTER, ARRIVE_BEFORE, emberStratumOf, STRATA } from './descent.ts';

/** Where an ember starts a life: below or above the screen (crossing it), or anywhere on it (fading in and out where it drifts). */
export type Spawn = 'below' | 'above' | 'anywhere';

export interface EmberMotion {
  /** What it is (for reading and tests). */
  name: string;
  spawn: Spawn;
  /** Vertical speed, a share of the classic rise: positive rises, negative falls. Nothing in a motion turns it the other way. */
  rise: number;
  /** Buoyancy: how much faster it moves by the end of a life (1: twice as fast), or slower (negative). */
  accel: number;
  /** A sideways draught every ember shares (a share of the classic rise, positive to the right), and how much each varies around it. */
  drift: number;
  driftSpread: number;
  /** Swaying side to side: how far (a share of the ember's own sway, 8 to 34 px) and how fast (a share of its own rate). */
  sway: number;
  swayRate: number;
  /** Heat shimmer: a quick sideways shiver, px. */
  shimmer: number;
  /**
   * Circling a vertical axis, seen from the side: the radius as a share of
   * the width (each ember's between orbitMin and orbit, more of them wide),
   * plus a radius in px (`curl`, small lazy curls); turns a second; how much
   * the circle is tilted toward you (it shows as a flat ellipse, the near
   * half lower); and how much larger and brighter the near half is.
   */
  orbit: number;
  orbitMin: number;
  curl: number;
  orbitRate: number;
  tilt: number;
  depth: number;
  /** Where the orbits' axes stand (a share of the width) and how far each ember's may stray from it. */
  axis: number;
  axisSpread: number;
  /** Puffs from vents across the floor: extra rise in pulses (a share of the classic rise at a puff's peak), how often (s) and how many vents. */
  puff: number;
  puffPeriod: number;
  vents: number;
  /**
   * A pull toward a centre and round it (shares of the classic rise): the
   * backdrop's two eddies (NaN centre), each ember drawn to one, or a point
   * (fractions of the screen). An ember that gets within `swallow` of the
   * eddies' reach (EDDY_REACH) of it is gone.
   */
  centreX: number;
  centreY: number;
  pull: number;
  swirl: number;
  swallow: number;
  /** Flicker: how deep (0 to 0.6) and how fast (a share of the ember's own rate). */
  flicker: number;
  flickerRate: number;
  /** A life anywhere on the screen, s (shortest, longest). */
  life: readonly [number, number];
  /** A life crossing the screen: how much of its height it crosses (1: all of it). */
  reach: number;
  /** Seconds it rests, dark, between lives (shortest, longest): a spark now and then rather than all the time. */
  rest: readonly [number, number];
  size: number;
  bright: number;
  /** As its zone hands over to the next (its last depths): how much it slows, and the share that goes out (the magma cooling). */
  cool: number;
}

/** A zone's motion: its embers', and the rarer kind's with the share of embers they are. */
export interface ZoneMotion {
  main: EmberMotion;
  accent: EmberMotion | null;
  share: number;
}

const BASE: Omit<EmberMotion, 'name'> = {
  spawn: 'below',
  rise: 1,
  accel: 0,
  drift: 0,
  driftSpread: 0,
  sway: 0,
  swayRate: 1,
  shimmer: 0,
  orbit: 0,
  orbitMin: 0,
  curl: 0,
  orbitRate: 0,
  tilt: 0,
  depth: 0,
  axis: 0.5,
  axisSpread: 0,
  puff: 0,
  puffPeriod: 4,
  vents: 5,
  centreX: 0,
  centreY: 0,
  pull: 0,
  swirl: 0,
  swallow: 0.07,
  flicker: 0.2,
  flickerRate: 1,
  life: [12, 18],
  reach: 1,
  rest: [0, 0],
  size: 1,
  bright: 1,
  cool: 0,
};

const motion = (m: Partial<EmberMotion> & { name: string }): EmberMotion => ({ ...BASE, ...m });
const zone = (main: EmberMotion, accent: EmberMotion | null = null, share = 0): ZoneMotion => ({ main, accent, share });

/** Outside Delve (the start page): the classic embers, rising and swaying, a little apart. */
export const SURFACE_MOTION = zone(motion({ name: 'embers rising', rise: 1, driftSpread: 0.05, sway: 1, flicker: 0.22 }));

/** One to a stratum, in the order of STRATA (lib/descent.ts). */
export const ZONE_MOTION: ZoneMotion[] = [
  // The Mines: fine dust sifting down and a little sideways in the still air,
  // and now and then a spark from a lamp rising a little way off the floor.
  zone(
    motion({ name: 'dust sifting down', spawn: 'anywhere', life: [12, 20], rise: -0.2, drift: 0.1, driftSpread: 0.04, sway: 0.35, swayRate: 0.5, flicker: 0.1, flickerRate: 0.25 }),
    motion({ name: 'lamp sparks', rise: 2.2, accel: -0.5, reach: 0.3, rest: [2, 9], sway: 0.2, shimmer: 1.5, flicker: 0.5, flickerRate: 1.6, size: 0.7, bright: 1.5 }),
    0.1,
  ),
  // Magma: heat lifts them fast and ever faster, swaying and shivering in it,
  // flickering; as the magma cools and stiffens through the zone's later
  // depths they slow, and more of them go out.
  zone(motion({ name: 'embers rising on the heat', rise: 1.5, accel: 1, driftSpread: 0.04, sway: 0.8, swayRate: 1.2, shimmer: 2.5, flicker: 0.4, flickerRate: 1.3, cool: 0.7 })),
  // Frozen: snow and ice crystals falling slowly, tumbling side to side,
  // glinting as they turn.
  zone(motion({ name: 'snow falling', spawn: 'above', rise: -0.5, drift: 0.04, driftSpread: 0.05, sway: 1.3, swayRate: 1.6, flicker: 0.35, flickerRate: 0.7 })),
  // Fungal: spores hanging in the air, turning in small lazy curls, rising
  // only very slightly on a faint warm current; their glow pulses slowly.
  zone(motion({ name: 'spores hanging', spawn: 'anywhere', life: [14, 24], rise: 0.12, driftSpread: 0.04, curl: 24, orbitRate: 0.06, tilt: 0.25, depth: 0.5, flicker: 0.3, flickerRate: 0.15 })),
  // Vaal: dust motes caught in the shafts of light, drifting slowly sideways
  // and gently settling, catching the light now and then.
  zone(motion({ name: 'motes settling', spawn: 'anywhere', life: [14, 22], rise: -0.1, drift: 0.16, driftSpread: 0.04, sway: 0.25, swayRate: 0.4, flicker: 0.3, flickerRate: 0.12 })),
  // Abyssal Depths: drawn into the void's two eddies, spiralling inward,
  // quicker round the nearer they get, until the dark swallows them.
  zone(motion({ name: 'drawn into the eddies', spawn: 'anywhere', life: [12, 18], rise: 0, centreX: NaN, centreY: NaN, pull: 0.35, swirl: 0.9, flicker: 0.3, flickerRate: 0.8 })),
  // Petrified: stone dust falling slowly and steadily, straight down: the
  // calmest of them.
  zone(motion({ name: 'stone dust falling', spawn: 'above', rise: -0.4, driftSpread: 0.015, sway: 0.12, swayRate: 0.3, flicker: 0.06, flickerRate: 0.3 })),
  // Sulphur: carried up in gusts as the vents puff, each column of them
  // together, then lingering, still rising a little, till the next.
  zone(motion({ name: 'rising on the puffs', rise: 0.12, puff: 3, puffPeriod: 4.5, vents: 5, sway: 0.5, swayRate: 0.6, flicker: 0.25, flickerRate: 0.5 })),
  // Abyssal City: ash and debris drifting down and sideways off the ruins,
  // tumbling; now and then a corrupted spark is pulled toward the rift.
  zone(
    motion({ name: 'ash drifting down', spawn: 'above', rise: -0.35, drift: 0.22, driftSpread: 0.06, sway: 0.7, swayRate: 0.9, flicker: 0.12, flickerRate: 0.5 }),
    motion({ name: 'corrupted sparks', spawn: 'anywhere', life: [5, 8], rest: [3, 9], rise: 0, centreX: 0.5, centreY: 0.88, pull: 0.6, swirl: 0.35, swallow: 0.05, flicker: 0.6, flickerRate: 1.8, size: 0.75, bright: 1.6 }),
    0.08,
  ),
  // Primeval: motes of ancient light rising slowly and majestically, each
  // circling the great axis of the hall, the nearer side of its circle
  // larger and brighter, all turning the same way.
  zone(motion({ name: 'motes ascending in orbit', rise: 0.38, accel: 0.2, orbit: 0.42, orbitMin: 0.06, orbitRate: 0.035, tilt: 0.05, depth: 1, axisSpread: 0.06, flicker: 0.18, flickerRate: 0.2 })),
];

/** Every motion, the surface's first: an ember holds the index of its own. */
export const MOTIONS: EmberMotion[] = [];
const MAIN: number[] = [];
const ACCENT: number[] = [];
const SHARE: number[] = [];
for (const z of [SURFACE_MOTION, ...ZONE_MOTION]) {
  MAIN.push(MOTIONS.push(z.main) - 1);
  ACCENT.push(z.accent ? MOTIONS.push(z.accent) - 1 : -1);
  SHARE.push(z.accent ? z.share : 0);
}

/** The zones past the last stratum, found once each (they are asked for as embers start new lives). */
const found = new Map<number, number>();

/**
 * The zone (ZONE_MOTION's index, -1 the surface) whose embers stratum `k`
 * has: its own through the last stratum; past it, the one it takes its
 * embers from (emberStratumOf).
 */
export function zoneOf(k: number): number {
  if (k < 0) return -1;
  if (k < STRATA.length) return Math.min(k, ZONE_MOTION.length - 1);
  let z = found.get(k);
  if (z === undefined) {
    z = Math.min(Math.max(0, emberStratumOf(k)), ZONE_MOTION.length - 1);
    if (found.size > 64) found.clear();
    found.set(k, z);
  }
  return z;
}

/** The motion (MOTIONS' index) of an ember burning in stratum `k`: the rarer kind's if its own `gate` (0 to 1) is under their share. */
export function motionFor(k: number, gate: number): number {
  const z = zoneOf(k) + 1;
  return ACCENT[z] >= 0 && gate < SHARE[z] ? ACCENT[z] : MAIN[z];
}

/**
 * How far an ember burning in stratum `burn` has cooled (0 to 1): only as
 * its own zone dies down (the scene turning into stratum burn + 1), in step
 * with its hall (hallAt in lib/descent.ts: from ARRIVE_AFTER depths into it
 * to ARRIVE_BEFORE before its end).
 */
export function cooling(burn: number, stratum: number, turn: number): number {
  return burn === stratum - 1 ? Math.min(1, Math.max(0, (10 * turn - ARRIVE_AFTER) / (10 - ARRIVE_BEFORE - ARRIVE_AFTER))) : 0;
}
