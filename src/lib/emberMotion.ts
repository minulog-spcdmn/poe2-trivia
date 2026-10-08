// How the backdrop's embers move, stratum by stratum: each stratum's
// embers take its motion (a profile of lib/emberProfiles.ts, tweaked as
// src/data/backdrops.json or the endgame's generator has it), drawn by
// lib/backdropEmbers.ts. An ember takes the motion of the stratum it burns
// in, so it changes as its colour does: at the start of a new life (see
// Embers.born there).

import { endgameAt, onBackdrops, zones } from './backdrops.ts';
import { magmaCoolingOf } from './descent.ts';
import { motionOf, SURFACE_MOTION, type EmberMotion, type ZoneMotion } from './emberProfiles.ts';

export { PROFILES, SURFACE_MOTION, ZONE_MOTION, motionOf, profileOf, tweakOf, type EmberMotion, type Spawn, type ZoneMotion } from './emberProfiles.ts';

/**
 * Every motion an ember can hold (it keeps the index of its own): two to
 * the start page, two to each zone (its embers', and its rarer kind's), and
 * two to each of RING slots the strata past the zones take in turn (only a
 * few strata burn at once: the one the scene heads for and those around
 * it). Each is a copy, written over in place when what it stands for
 * changes, so an ember holding it moves the new way at once.
 */
export const MOTIONS: EmberMotion[] = [];
/** Per slot (0 the start page, 1 + k zone k, then the ring): its embers' motion, its rarer kind's, and their share. */
const MAIN: number[] = [];
const ACCENT: number[] = [];
const SHARE: number[] = [];
/** The ring's slots for strata past the zones, and the stratum each holds (-1: none yet). */
const RING = 8;
const ringFor = new Float64Array(RING).fill(-1);

/** Writes `z` into slot `s` (its motions copied into the slot's own). */
function put(s: number, z: ZoneMotion) {
  if (MAIN[s] === undefined) {
    MAIN[s] = MOTIONS.push({ ...z.main }) - 1;
    ACCENT[s] = MOTIONS.push({ ...(z.accent ?? z.main) }) - 1;
  } else {
    Object.assign(MOTIONS[MAIN[s]], z.main);
    Object.assign(MOTIONS[ACCENT[s]], z.accent ?? z.main);
  }
  SHARE[s] = z.accent ? z.share : 0;
}

/** The zones' motions, from their tweaks (as they stand). */
function putZones() {
  put(0, SURFACE_MOTION);
  zones.forEach((z, k) => put(1 + k, motionOf(z.motion)));
}
putZones();
for (let i = 0; i < RING; i++) put(1 + zones.length + i, SURFACE_MOTION);
onBackdrops(() => {
  putZones();
  ringFor.fill(-1);
});

/** The slot stratum `k` (-1 the start page) takes its motions from. */
function slotOf(k: number): number {
  if (k < 0) return 0;
  if (k < zones.length) return 1 + k;
  const i = k % RING;
  const s = 1 + zones.length + i;
  if (ringFor[i] !== k) {
    put(s, motionOf(endgameAt(k).motion));
    ringFor[i] = k;
  }
  return s;
}

/** The motion (MOTIONS' index) of an ember burning in stratum `k`: the rarer kind's if its own `gate` (0 to 1) is under their share. */
export function motionFor(k: number, gate: number): number {
  const s = slotOf(k);
  return gate < SHARE[s] ? ACCENT[s] : MAIN[s];
}

/** The motions of stratum `k` (-1 the start page): its embers', and its rarer kind's with their share. */
export function zoneMotionOf(k: number): ZoneMotion {
  const s = slotOf(k);
  return { main: MOTIONS[MAIN[s]], accent: SHARE[s] > 0 ? MOTIONS[ACCENT[s]] : null, share: SHARE[s] };
}

/**
 * How far an ember burning in stratum `burn` has cooled (0 to 1) with the
 * scene (as shown) turning `turn` of the way into stratum `stratum`: as
 * far as its stratum's magma (magmaCoolingOf in lib/descent.ts), so only
 * in a stratum whose look has magma that goes out (the Magma Fissure's),
 * never in one that merely moves its embers the magma's way: in step with
 * its hall as the scene turns out of it, and all the way once the scene is
 * past it. Only a motion with `cool` slows for it (the magma's).
 */
export const cooling = (burn: number, stratum: number, turn: number): number => magmaCoolingOf(burn, stratum, turn);
