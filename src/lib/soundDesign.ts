// Generated from the picks on the sound audition page; tweak freely.
// Each moment is a few layers played together. Per layer: volume (dB),
// playback rate, delay (ms), high-pass and low-pass cutoffs (Hz) and reverb
// send. Per moment: 'soften' cuts dB around 3.2 kHz (harshness), and
// varyPitch/varyGain randomize each play so repeats don't sound identical.

import type { Sfx } from './sound';

export type Layer = { file: string; gain: number; rate: number; delay: number; hp: number; lp: number; send: number };
export type Moment = { layers: Layer[]; soften: number; varyPitch: number; varyGain: number };

/** Whole mix: master volume (dB) and 'warmth', a high-shelf cut (dB) above 5 kHz. */
export const MIX = { volume: 4, warmth: 1 };

/**
 * How far (ms) into the 'fill' moment its first spark lands on the bar: the
 * whoosh swells up to it, then the sparks crackle across the fill.
 */
export const FILL_LEAD = 450;

/** A quiet loop under the whole game; lp is a low-pass cutoff (Hz). */
export const AMBIENCE = { file: 'amb-6', gain: -44, lp: 5011 };

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
  // Delve. Built from files already loaded for other moments, so they add no bytes.
  stratum: {
    soften: 6,
    varyPitch: 0.02,
    varyGain: 1,
    layers: [
      { file: 'defeat-5', gain: -27, rate: 0.6, delay: 0, hp: 40, lp: 3200, send: 0.85 },
      { file: 'layer-sub-2', gain: -22, rate: 0.55, delay: 0, hp: 20, lp: 900, send: 0.6 },
      { file: 'layer-air-4', gain: -31, rate: 0.8, delay: 60, hp: 200, lp: 4200, send: 0.8 },
      { file: 'layer-metal-2', gain: -39, rate: 0.5, delay: 250, hp: 300, lp: 6000, send: 0.9 },
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
};
