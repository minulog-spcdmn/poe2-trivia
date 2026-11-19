// Delve: the Sulphite rush's ride (the
// rules in delve.ts, rushOf). In Path of Exile's Delve, Voltaxic Sulphite is
// the fuel Niko's crawler burns to travel down the mine, and its light keeps
// the dark back. A rush is that ride. From the pick of its card to its last
// answer the scene never comes to rest: it keeps sinking, faster with every
// step down (descent.ts setCruise), and the view narrows with the speed, the
// dark drawn in from the edges. Below, the sulphite burns, a light of its
// own welling up from under the stage and crackling as it burns; the embers
// burn in its colour, more of them the faster it goes (moments.ts
// rushMood), and sparks fly up off it past you at the screen's edges, never
// over the question. A step down surges (the light flares, sparks spray);
// a miss falters (the light gutters, the ride slows for a moment); and its
// end brakes and lands at the depth it reached, with a thud, the light
// going out as the sparks settle.
//
// Set from the game's state (App.svelte): the ride is on for as long as the
// state says a rush runs, so a reload, a run's end or leaving the game
// stops it. The beats (rushIgnite, rushStep, rushLand) only as seen live.

import { after, fxActive, shakeView, task, type Handle, type Point, type Vec3 } from './fx/core';
import { flash, puffs, sparks } from './fx/effects';
import { descended, rushMood } from './fx/moments';
import { holdLight, type HeldLight } from './lights';
import { embers as backdropEmbers } from './backdropEmbers';
import { setCruise } from './descent';
import { RUSH_LAND_MS } from './delve';
import { sfx } from './sound';

/** The sulphite's light (0 to 1): a pale, hot sulphur yellow, near white at its heart. */
export const SULPHITE: Vec3 = [1, 0.84, 0.36];
/** Its sparks and flashes, in the effects' HDR: the yellow, its pale, and white-hot. */
const SPARK: Vec3 = [3.1, 2.55, 0.9];
const SPARK_PALE: Vec3 = [3.2, 3.0, 1.9];
const SPARK_COOL: Vec3 = [0.9, 0.45, 0.08];

/**
 * How fast the scene sinks through a rush (screens a second): at its start,
 * and with the last of its questions, gathering speed between them. And how
 * far the dark draws in from the edges at each.
 */
const CRUISE_FROM = 0.22;
const CRUISE_TO = 0.6;
const TUNNEL_FROM = 0.35;
const TUNNEL_TO = 0.8;

/**
 * Each step down in a rush (descent.ts plunge): as far as a depth's plunge
 * and a little more, quicker. Into a new zone on the way, further, for as
 * long as the step holds the next question (RushTuning.zone). Their speed
 * at its fastest stays under what the scene's far layers keep crisp at.
 */
export const RUSH_PLUNGE = { ms: 2200, by: 1.4 };
export const rushZonePlunge = (ms: number) => ({ ms, by: Math.min(2.6, 0.6 * (ms / 1000)) });
/** The rush's last step down, as it ends: the biggest, braking to rest at the depth it reached (RUSH_LAND_S). */
export const RUSH_LAND_S = RUSH_LAND_MS / 1000;
export const RUSH_LAST_PLUNGE = { ms: RUSH_LAND_S * 1000, by: 1.8, brake: true };
/** Ended on a miss: no step down, the ride only grinds to a halt (s). */
export const RUSH_HALT_S = 0.7;

let on = false;
/**
 * Its end under way: until then (performance.now ms) the light, the mood,
 * the sparks and the narrowed view hold while the ride brakes, going out
 * as it lands (rushLand).
 */
let holdUntil = 0;
const lit = () => on || performance.now() < holdUntil;
/** How far through the rush (0 to 1), and the ride faltering after a miss (1: at full speed). */
let k = 0;
let falter = 1;
let falterUntil = 0;
/** The light below: held while the ride is on, its strength set every frame (see glow). */
let lamp: HeldLight | null = null;
let glow: Handle | null = null;
/** The light's strength as it eases (0 to 1), where it heads, and a flare over it that dies down. */
let level = 0;
let flareK = 0;
let gutter = 0;
let sparkAcc = 0;
/** The gutter's unsteadiness: a new depth to dip to every so often, eased into, so it never beats like a strobe. */
let jit = 0;
let jitTo = 0;
let jitNext = 0;

/** Where the light wells up from: under the middle of the screen's foot. */
const source = (): Point => ({ x: innerWidth / 2, y: innerHeight * 1.04 });
const radius = () => Math.max(innerWidth, innerHeight) * 0.36;

function cruiseNow() {
  if (!on) return setCruise(0, 0);
  const f = performance.now() < falterUntil ? falter : 1;
  setCruise((CRUISE_FROM + (CRUISE_TO - CRUISE_FROM) * k) * f, TUNNEL_FROM + (TUNNEL_TO - TUNNEL_FROM) * k);
}

/**
 * The ride on or off, `progress` of the way through the rush (0 to 1): set
 * from the state whenever it changes. The scene's cruise and the mood follow
 * at once (eased by themselves); the light and the sparks while effects run.
 */
export function rushRide(ride: boolean, progress = 0) {
  const was = on;
  on = ride;
  k = Math.min(1, Math.max(0, progress));
  cruiseNow();
  // (Its end holds the mood until the ride lands: rushLand.)
  if (on || performance.now() >= holdUntil) rushMood(on, SULPHITE, k);
  if (on && !was) light();
}

/** The light below and its sparks, for as long as the ride is on and a while after, as it goes out. */
function light() {
  if (glow || !fxActive()) return;
  const r = radius();
  lamp = holdLight(source(), SULPHITE, r);
  let t = 0;
  glow = task(
    (dt) => {
      t += dt;
      const burning = lit();
      const target = burning ? 0.26 + 0.2 * k : 0;
      // (Up in a moment as it catches, down more slowly as it goes out.)
      level += (target - level) * (1 - Math.exp(-dt / (burning ? 0.35 : 0.6)));
      flareK *= Math.exp(-dt / 0.45);
      gutter *= Math.exp(-dt / 0.5);
      // Crackling as it burns: a slow waver, a quick one, and now and then a jump (it is voltaxic).
      const waver = 0.9 + 0.06 * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 7.9 + 1.3);
      if (burning && Math.random() < dt * (1.5 + 3 * k)) flareK = Math.max(flareK, 0.06 + 0.1 * Math.random());
      // Guttering: dipping by uneven amounts at uneven moments, eased, never all the way out.
      if (t >= jitNext) {
        jitTo = Math.random();
        jitNext = t + 0.07 + 0.16 * Math.random();
      }
      jit += (jitTo - jit) * (1 - Math.exp(-dt / 0.05));
      const shake = 1 - gutter * 0.5 * jit;
      lamp?.set(Math.max(0, (level * waver + flareK) * shake), r * (0.9 + 0.2 * level));
      // Sparks fly up off it at the screen's edges, more of them the faster it goes.
      if (burning) {
        sparkAcc += dt * (2.5 + 6 * k) * (performance.now() < falterUntil ? 0.3 : 1);
        while (sparkAcc >= 1) {
          sparkAcc--;
          edgeSparks(2 + Math.round(2 * k));
        }
      }
      if (!burning && level < 0.01 && flareK < 0.01) {
        lamp?.release();
        lamp = null;
        glow = null;
        level = 0;
        return false;
      }
      return true;
    },
    { keep: true },
  );
}

/** A few sparks thrown up from the foot of the screen, on its left or right side (never under the question). */
function edgeSparks(count: number, spread = 0.22) {
  const w = innerWidth;
  const side = Math.random() < 0.5 ? -1 : 1;
  const x = w / 2 + side * w * (0.5 - spread * Math.random());
  sparks(
    { x, y: innerHeight + 6 },
    {
      count,
      angle: -Math.PI / 2 - side * 0.18,
      spread: 0.5,
      speed: [520, 1150],
      colors: [SPARK, SPARK_PALE],
      cool: SPARK_COOL,
      life: [0.45, 1.0],
      size: [0.7, 1.4],
      gravity: 380,
      drag: 1.3,
      stretch: 0.06,
    },
  );
}

/**
 * The sulphite card taken, seen as it happened: it catches. The light bursts
 * on from below, sparks fountain up both sides, the embers flare, and the
 * scene lurches into its ride (the cruise, gathering speed from rest).
 */
export function rushIgnite() {
  sfx('rushIgnite');
  backdropEmbers.flare(0.7, 1.4);
  if (!fxActive()) return;
  flareK = 0.9;
  level = Math.max(level, 0.3);
  flash({ x: innerWidth / 2, y: innerHeight }, { radius: innerHeight * 0.55, color: SPARK, intensity: 0.22, life: 0.7, behind: true });
  for (let i = 0; i < 6; i++) after(i * 0.07, () => edgeSparks(5, 0.35));
  shakeView(0.16, 3);
}

/**
 * A rush question answered, seen as it happened: `right`, the run steps down
 * (its plunge is App.svelte's), and the ride surges: the light flares,
 * sparks spray, the embers flare. A miss falters: the light gutters and the
 * ride slows for a moment before it picks up again.
 */
export function rushStep(right: boolean) {
  if (right) {
    sfx('rushSurge');
    descended();
    flareK = Math.max(flareK, 0.55);
    for (let i = 0; i < 3; i++) after(i * 0.09, () => edgeSparks(4, 0.3));
    return;
  }
  falter = 0.3;
  falterUntil = performance.now() + 1400;
  gutter = 1;
  cruiseNow();
  setTimeout(cruiseNow, 1450);
}

/**
 * The rush's end, seen as it happened: the crawler lands `inS` seconds from
 * now (braking to rest over its last step down, or grinding to a halt after
 * a miss: App.svelte's plunge). There a thud shakes the view, sparks and
 * dust burst along the foot of the screen, and the light flares one last
 * time and goes out. The ride itself is off already (rushRide), easing to
 * rest under the brake.
 */
export function rushLand(inS: number) {
  sfx('rushLand', { inMs: inS * 1000 });
  // Lit, the view narrowed and the embers in its colour, until it lands; only its speed is off (the brake's plunge carries it).
  holdUntil = performance.now() + inS * 1000;
  k = 1;
  rushMood(true, SULPHITE, 1);
  setCruise(0, TUNNEL_TO);
  light();
  setTimeout(() => {
    holdUntil = 0;
    if (!on) {
      rushMood(false, SULPHITE);
      setCruise(0, 0);
    }
    backdropEmbers.flare(0.6, 1.6);
    if (!fxActive()) return;
    shakeView(0.5, 9);
    flareK = 1;
    level = Math.max(level, 0.5);
    gutter = 1;
    for (let i = 0; i < 4; i++) edgeSparks(6, 0.45);
    puffs(new DOMRect(0, innerHeight - 30, innerWidth, 30), {
      count: 14,
      color: [0.32, 0.27, 0.2],
      size: [30, 60],
      speed: [30, 140],
      angle: -Math.PI / 2,
      spread: 1.6,
      life: [0.9, 1.6],
      area: 'fill',
    });
  }, inS * 1000);
}
