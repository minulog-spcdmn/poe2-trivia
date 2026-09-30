// Light that the WebGL backdrop (lib/backdrop.ts) throws behind the UI:
// short event lights (a gold bloom behind a correct answer, a red pulse on a
// wrong one) and a mood tint over the whole scene (crimson for a deathmatch,
// gold for a victory). Effects code
// sets them; the backdrop reads them every frame.

import { fxActive, type Anchor, boxOf, type Vec3 } from './fx/core';

export const MAX_LIGHTS = 8;

type Light = {
  at: Anchor;
  x: number;
  y: number;
  color: Vec3;
  radius: number;
  intensity: number;
  attack: number;
  hold: number;
  decay: number;
  born: number;
};

let lights: Light[] = [];

export type LightSpec = {
  color: Vec3;
  /** CSS px (the light's Gaussian radius). */
  radius: number;
  /** Peak strength, about 0 to 1. */
  intensity: number;
  attack?: number;
  hold?: number;
  decay?: number;
};

/** Flashes a light behind `at` (followed if it's an element). */
export function light(at: Anchor, spec: LightSpec) {
  if (!fxActive()) return;
  const b = boxOf(at);
  const now = performance.now() / 1000;
  const l: Light = { at, x: b.x, y: b.y, attack: 0.08, hold: 0.1, decay: 0.9, ...spec, born: now };
  if (lights.length < MAX_LIGHTS) {
    lights.push(l);
    return;
  }
  // Full: take the place of whichever light gives the least right now, so a
  // big glow still fading isn't cut off (a visible dip) by a small new one.
  let weakest = 0;
  lights.forEach((x, i) => {
    if (strength(x, now) * x.radius < strength(lights[weakest], now) * lights[weakest].radius) weakest = i;
  });
  lights[weakest] = l;
}

/** A light's strength at `now` (s): up over the attack, held, then easing out over the decay. */
function strength(l: Light, now: number): number {
  const t = now - l.born;
  let k: number;
  if (t < l.attack) k = t / l.attack;
  else if (t < l.attack + l.hold) k = 1;
  else {
    const u = Math.min(1, (t - l.attack - l.hold) / l.decay);
    k = (1 - u) * (1 - u);
  }
  return l.intensity * k * k * (3 - 2 * k);
}

/**
 * Packs the live lights for the shader: `a` gets (x, y, radius, strength) and
 * `c` (r, g, b, 0) per light. Returns true while any light is lit.
 */
export function packLights(a: Float32Array, c: Float32Array, nowS: number): boolean {
  a.fill(0);
  c.fill(0);
  lights = lights.filter((l) => nowS - l.born < l.attack + l.hold + l.decay);
  lights.forEach((l, i) => {
    if (l.at instanceof Element && l.at.isConnected) {
      const b = boxOf(l.at);
      l.x = b.x;
      l.y = b.y;
    }
    a.set([l.x, l.y, l.radius, strength(l, nowS)], i * 4);
    c.set([l.color[0], l.color[1], l.color[2], 0], i * 4);
  });
  return lights.length > 0;
}

// ---------- mood ----------

const mood = {
  color: [0, 0, 0] as number[],
  strength: 0,
  target: [0, 0, 0] as number[],
  targetStrength: 0,
  pulse: 0,
  pulseColor: [1, 0.15, 0.08] as number[],
};

/** Tints the whole backdrop toward `color` (eased); strength 0 clears it. */
export function setMood(color: Vec3, strength: number) {
  mood.target = [...color];
  mood.targetStrength = fxActive() ? strength : 0;
}

/** A quick swell of colour over the scene (heartbeats), 0-1. */
export function pulseMood(amount: number, color: Vec3 = [1, 0.15, 0.08]) {
  if (!fxActive()) return;
  mood.pulse = Math.min(1, mood.pulse + amount);
  mood.pulseColor = [...color];
}

/** Steps the mood toward its target; returns (r, g, b, strength) and whether it's moving or lit. */
export function stepMood(dt: number, out: Float32Array): boolean {
  const k = 1 - Math.exp(-dt * 2.2);
  if (!fxActive()) mood.targetStrength = 0;
  for (let i = 0; i < 3; i++) mood.color[i] += (mood.target[i] - mood.color[i]) * k;
  mood.strength += (mood.targetStrength - mood.strength) * k;
  mood.pulse = Math.max(0, mood.pulse - dt * 1.8);
  const p = mood.pulse * 0.6;
  const total = mood.strength + p;
  for (let i = 0; i < 3; i++) out[i] = total > 0 ? (mood.color[i] * mood.strength + mood.pulseColor[i] * p) / total : 0;
  out[3] = total;
  return mood.strength > 0.002 || mood.targetStrength > 0 || mood.pulse > 0;
}

// ---------- the start page ----------

/**
 * The start page's light: slow god rays falling from above and a royal glow
 * behind the title. Both ease in and out as the page comes and goes.
 */
const scene = { title: null as Element | null, rays: 0, glow: 0, target: 0, x: 0, y: 0, w: 0, h: 0 };

/** Lights the start page around `title`, or turns its light off (null). */
export function setHomeScene(title: Element | null) {
  if (title) scene.title = title;
  scene.target = title ? 1 : 0;
}

/**
 * Steps the start page's light: writes (rays, glow, 0, 0) to `a` and the
 * title's centre and half size (CSS px) to `b`. Returns whether it's lit.
 */
export function stepHomeScene(dt: number, a: Float32Array, b: Float32Array): boolean {
  const k = 1 - Math.exp(-dt * 1.4);
  scene.rays += (scene.target - scene.rays) * k;
  scene.glow += (scene.target - scene.glow) * k;
  if (scene.target === 0 && scene.rays < 0.002) {
    scene.rays = scene.glow = 0;
    scene.title = null;
  }
  if (scene.title?.isConnected) {
    const r = scene.title.getBoundingClientRect();
    scene.x = r.left + r.width / 2;
    scene.y = r.top + r.height / 2;
    scene.w = r.width / 2;
    scene.h = r.height / 2;
  }
  a[0] = scene.rays;
  a[1] = scene.glow;
  b[0] = scene.x;
  b[1] = scene.y;
  b[2] = scene.w;
  b[3] = scene.h;
  return scene.rays > 0;
}
