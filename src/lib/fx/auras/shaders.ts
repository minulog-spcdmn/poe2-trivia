// Every player aura's light (lib/auraKinds.ts), each the heart of a program
// of its own (renderer.ts, auraFs), built the first time it shows: its own
// function and auraLight, which calls it. (All in the shapes' one shader,
// sixteen of them took ANGLE so long to compile that nothing drew.)

import { AURAS, type AuraKind } from '../../auraKinds.ts';
import { GLSL as Breach } from './breach.glsl.ts';
import { GLSL as Delirium } from './delirium.glsl.ts';
import { GLSL as Ritual } from './ritual.glsl.ts';
import { GLSL as Expedition } from './expedition.glsl.ts';
import { GLSL as Abyss } from './abyss.glsl.ts';
import { GLSL as Azmeri } from './azmeri.glsl.ts';
import { GLSL as Tower } from './tower.glsl.ts';
import { GLSL as Chronomancer } from './chronomancer.glsl.ts';
import { GLSL as Chayula } from './chayula.glsl.ts';
import { GLSL as Lich } from './lich.glsl.ts';
import { GLSL as Divine } from './divine.glsl.ts';
import { GLSL as Corrupted } from './corrupted.glsl.ts';
import { GLSL as Mirror } from './mirror.glsl.ts';
import { GLSL as Ice } from './ice.glsl.ts';
import { GLSL as Blacksun } from './blacksun.glsl.ts';
import { GLSL as Runeseal } from './runeseal.glsl.ts';
import { GLSL as Twilight } from './twilight.glsl.ts';
import { GLSL as Slayer } from './slayer.glsl.ts';
import { GLSL as Shadow, SHADE as ShadowShade } from './shadow.glsl.ts';

// By kind, so none can be left out or set against another's name; put in slot order below (auraSlot: AURAS' order, from 1).
const LIGHTS: Record<AuraKind, string> = {
  breach: Breach,
  delirium: Delirium,
  ritual: Ritual,
  expedition: Expedition,
  abyss: Abyss,
  azmeri: Azmeri,
  tower: Tower,
  chronomancer: Chronomancer,
  chayula: Chayula,
  lich: Lich,
  divine: Divine,
  corrupted: Corrupted,
  mirror: Mirror,
  ice: Ice,
  blacksun: Blacksun,
  runeseal: Runeseal,
  twilight: Twilight,
  slayer: Slayer,
  shadow: Shadow,
};

/** Each aura's light, by slot less one: its function, and auraLight calling it. */
export const AURA_FNS = AURAS.map(
  (kind) => `${LIGHTS[kind]}
vec3 auraLight(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  return aura_${kind}(p, time, seed, q, r, s);
}
`,
);

// An aura's shade (lib/fx/shade.ts): what it lays over the page, which its
// light, only ever added, can't: darkness, or any colour. Beside its GLSL an
// aura's `<kind>.glsl.ts` may export SHADE, defining
//   vec4 shade_<kind>(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s)
// given exactly what its light is given for the same shape in the same
// frame, and giving back what covers the page at that pixel, premultiplied
// (rgb already times alpha; alpha is how much of the page it hides; black
// smoke is vec4(0.0, 0.0, 0.0, a)). It is a program of its own, built the
// first time the aura shows: SHADE holds all it needs (the shapes' shared
// helpers are there, as for the light), so what its light and its shade
// share is written once in the file and put into both.
const SHADES: Partial<Record<AuraKind, string>> = { shadow: ShadowShade };

/** Each aura's shade, by slot less one (null: it has none): its function, and auraShade calling it. */
export const SHADE_FNS: (string | null)[] = AURAS.map((kind) => {
  const glsl = SHADES[kind];
  return glsl
    ? `${glsl}
vec4 auraShade(vec2 p, float time, float seed, vec4 q, vec4 r, vec3 s) {
  return shade_${kind}(p, time, seed, q, r, s);
}
`
    : null;
});
