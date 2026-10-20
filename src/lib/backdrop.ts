// WebGL2 renderer for the page backdrop: breathing gradients, drifting blobs,
// rising embers, grain, vignette, light from game events and the mouse, a mood
// tint, and the soft outer shadows and large gradient fills of UI elements on
// top of it. Every layer is composited in floating point and dithered once,
// at the final 8-bit conversion, so the dark gradients can't band. Falloffs
// are Gaussian or smoothstep curves with no hard end, so no layer shows an
// edge.
//
// Background.svelte keeps a static CSS approximation as the fallback when
// WebGL is unavailable.

import { SHADOWS_PER_ELEMENT, measureShadows, releaseAll } from './backdropShadow';
import { DROPS_PER_MASK, MAX_MASKS, measureDrops, releaseAllDrops } from './backdropDropShadow';
import { MAX_LIGHTS, packLights, stepHomeScene, stepMood } from './lights';
import { backdropFrame, fxActive, fxScaledDown, fxUserOn, onFxChange, onFxScale, setBackdropPixels } from './fx/core';
import { GpuTimer } from './fx/gpuTimer';
import { CALM, COLUMNS, GLINT_COLOR, PALETTE, ROWS, SIZE_STRIDE, SLOTS, TILES, embers } from './backdropEmbers';
import { BLOBS, ENVIRONMENTS, FX_SLOTS, FX_UNIFORM, NO_SLOT, currentDescent, packFx, sinking, smokeOf, snapDescent, stepDescent, stepPlunge, stepSwing, stopsFor, targetDescent, toneOf, type Blob, type Look } from './descent';
import { ENV_GLSL } from './shaders/effects';
import { FX_NOISE_GLSL, SHAFTS_GLSL, SPORES_GLSL } from './shaders/newEffects';
import { CLOCK_PEAK, pressureLevel } from './darkness';
import { onVein, veinLevel } from './vein';
import { DIALOG_BLUR, DIALOG_DIM, openDialog } from './behindDialog';
import { buildPrograms, maxDrawSize, refuseWebgl2, setGpuCatchUp, startPrograms, type Build, type Pending, type ProgramSource } from './fx/gl';
import { frameEvent, timed } from './fpsMeter';
import { whenIdle } from './idle';
import { switchedOff } from './switchedOff';

const CITY = ENVIRONMENTS.indexOf('city');

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const BLOB_COUNT = 5;

/** The effects shaders/newEffects.ts draws (vec3 fx_<name>(...), see shaders/effectApi.md); the rest are shaders/effects.ts's env_<name>. */
const NEW_EFFECTS: readonly string[] = ['spores', 'shafts'];

/**
 * environments()'s body: each environment, in the order of ENVIRONMENTS,
 * drawn from its slot if it has one. Each appears once, so the shader
 * holds every effect's code once, never once a slot.
 */
const ENV_CALLS = ENVIRONMENTS.map((name, i) => {
  const args = (qq: string) => `p, ${qq}, xy, S, W, H, tm, sink, uFx[3 * s].w, uFx[3 * s].rgb, uFx[3 * s + 1].rgb, uFx[3 * s + 2].rgb, uFx[3 * s + 1].w`;
  const call = NEW_EFFECTS.includes(name)
    ? `{
    vec3 add = fx_${name}(${args('p / S')}, dim);
    col = col * dim + gLit * add;
  }`
    : `col = env_${name}(col, ${args('q')});`;
  return `  s = fxSlot(${i});
  if (s < ${NO_SLOT}) ${call}`;
}).join('\n');

// Delve's own parts of the backdrop (its strata's smoke and dark, their
// environments, the dark closing in, the far city lights and the frost's
// glints), cut out of the programs everyone else gets. On the start page and
// in the other modes they never draw (each is off at the surface's look; see
// delveScene below), so the lean programs, built without them, draw exactly
// the same; Delve's, built with them, are exactly the backdrop as it was
// whole, and are compiled only when Delve is on its way (wantDelveBackdrop).

/** The soft light's uniforms only Delve uses. */
const DELVE_SMOOTH_UNIFORMS = `// The environments showing (ENVIRONMENTS in lib/descent.ts), a slot each
// (packFx there; see shaders/effectApi.md): its first colour stop and
// strength, its second and how far its colour varies, its third and which
// environment it is. And the magma's cooling and its flow's clock, then
// which slot each environment is in (four bits each, the first five in z,
// the rest in w). Where the void's two eddies turn (x, y each, fractions of
// the screen; the embers swirl round the same); and the dark closing in
// from the edges: (depth, the question's clock).
uniform vec4 uFx[${FX_SLOTS * 3}];
uniform vec4 uFxK;
uniform vec4 uEddy;
uniform vec2 uDark;
// How far an Azurite Vein's scene has come in (lib/vein.ts), 0 to 1.
uniform float uVein;
// 0, always: it is never set, and a uniform starts at 0 (were it not, the
// loops below would run past the ends of what they read). A loop that runs
// to its count plus this stays a loop. Direct3D's shader compiler, which
// Windows browsers build WebGL with, inlines every call and unrolls every
// loop whose count it knows, so a loop over fbm()'s octaves or the frost's
// four sides would be compiled as that many copies of its body, wherever
// it is called; across Delve's environments that made this program take
// seconds longer to build. It can't know a uniform, so it leaves the loop.
uniform int uRolled;
`;

/** Delve's noise, its environments, and the dark closing in. */
const DELVE_SMOOTH_FUNCTIONS = `// The dark of the clock run out (uDark.y; CLOCK_PEAK in lib/darkness.ts).
// Past it is a miss swallowing the scene, and the dark keeps that much of
// the screen in hand to surge into.
const float CLOCK_PEAK = ${CLOCK_PEAK.toFixed(2)};

// Value noise for Delve's smoke and dark: smooth, with no direction or
// shape of its own. (Hash without sine, Dave Hoskins; vnoise() works out
// the same at its four corners, so a change to one is a change to both.)
float nhash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  // nhash() at the four corners, side by side: the same sums, in fewer of
  // the shader compiler's instructions.
  vec4 hx = fract(vec4(i.x, i.x + 1.0, i.x, i.x + 1.0) * 0.1031);
  vec4 hy = fract(vec4(i.y, i.y, i.y + 1.0, i.y + 1.0) * 0.1031);
  vec3 a = vec3(hx.x, hy.x, hx.x);
  vec3 b = vec3(hx.y, hy.y, hx.y);
  vec3 c = vec3(hx.z, hy.z, hx.z);
  vec3 e = vec3(hx.w, hy.w, hx.w);
  vec4 d = vec4(dot(a, a.yzx + 33.33), dot(b, b.yzx + 33.33), dot(c, c.yzx + 33.33), dot(e, e.yzx + 33.33));
  hx += d;
  hy += d;
  vec4 h = fract((hx + hy) * hx);
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}

// Three octaves of it: their scale, offset and weight.
float fbm(vec2 x) {
  float n = 0.0;
  for (int i = 0; i < 3 + uRolled; i++) {
    vec3 o = i == 0 ? vec3(1.0, 0.0, 0.5) : i == 1 ? vec3(2.03, 11.7, 0.3) : vec3(4.1, -5.3, 0.2);
    n += o.z * vnoise(x * o.x + o.y);
  }
  return n;
}
// Ridged noise: 1 along the winding seams where the noise crosses its middle.
float ridge(vec2 x) { return 1.0 - abs(2.0 * vnoise(x) - 1.0); }
// The smallest of three or four distances, smoothly, so no crease runs in
// from the corners.
float smin3(float a, float b, float c, float k) { return -k * log(exp(-a / k) + exp(-b / k) + exp(-c / k)); }

${FX_NOISE_GLSL}
${ENV_GLSL}
${SPORES_GLSL}
${SHAFTS_GLSL}

// An Azurite Vein being dug (lib/vein.ts, uVein): off the lit path the hall
// goes cold and dark, and seams of azurite run through the rock of the
// walls and the floor: broad crystal faces, their seams glowing pale blue,
// brightest where three faces meet, and behind them, deeper in the rock,
// more of the crystal, dimmer and bluer. The faces catch a little of the
// light, each its own, and the light moves slowly along the seams. It grows
// in from the edges as the vein comes in (never over the middle, behind the
// UI).
// Crystal faces: the cells of a jittered grid (x in cell units). How near x
// is to the seam between two faces (0 on it), and to a corner where three
// meet (0 at it); which face it is in (0 to 1); and how far across the face
// toward the light it lies (-1 to 1).
vec4 veinCells(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  float d3 = 8.0;
  vec2 r1 = vec2(0.0);
  vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++)
    for (int k = -1; k <= 1; k++) {
      vec2 g = vec2(float(k), float(y));
      vec2 r = g + 0.15 + 0.7 * vec2(nhash(i + g), nhash(i + g + 17.31)) - f;
      float d = dot(r, r);
      if (d < d1) {
        d3 = d2;
        d2 = d1;
        d1 = d;
        r1 = r;
        id = i + g;
      } else if (d < d2) {
        d3 = d2;
        d2 = d;
      } else if (d < d3) d3 = d;
    }
  return vec4(sqrt(d2) - sqrt(d1), sqrt(d3) - sqrt(d1), nhash(id + 5.7), clamp(dot(-r1, vec2(0.6, -0.8)) / 0.7, -1.0, 1.0));
}

vec3 azuriteVein(vec3 col, vec2 p, float S, float W, float H, float tm, float dark) {
  float v = uVein;
  vec2 xy = p / vec2(W, H);
  // Cold and darker: the path's warm light is behind you.
  col = mix(col, col * vec3(0.42, 0.58, 0.95), 0.75 * v);
  col *= 1.0 - 0.3 * v;
  // The rock the seams run in: the walls, then the floor, reaching further in as it comes.
  float side = min(xy.x, 1.0 - xy.x);
  float reach = 0.1 + 0.24 * v;
  float wall = max(1.0 - smoothstep(reach * 0.3, reach, side), 0.8 * smoothstep(1.0 - 0.55 * reach, 1.0, xy.y));
  if (wall <= 0.0) return col;
  vec3 deep = rgb(22.0, 40.0, 140.0);
  vec3 azure = rgb(40.0, 105.0, 255.0);
  vec3 pale = rgb(150.0, 205.0, 255.0);
  vec3 white = rgb(230.0, 245.0, 255.0);
  // The dark of the depth and the clock dims it, as it does every glow.
  float lit = wall * v * (1.0 - 0.8 * dark);
  mat2 slant = mat2(0.8, -0.6, 0.6, 0.8);
  // Deeper in the rock, behind: smaller faces, their seams dim and deep
  // blue, going up slower than the near ones as the scene sinks.
  vec2 qf = (p + vec2(0.7 * uSlide, 0.55 * uSink)) / S;
  vec2 xf = slant * qf * vec2(9.0, 4.4) + 31.0;
  vec4 ef = veinCells(xf);
  float oreF = smoothstep(0.38, 0.7, fbm(qf * 1.7 + vec2(-2.6, 7.1)));
  float runF = 0.65 + 0.35 * sin(tm * 0.3 - 1.3 * (xf.x + 0.5 * xf.y));
  // (Wider and softer than the near seams, as if out of focus.)
  // (Each face's own light fades out toward its seams, so no edge shows where two faces meet.)
  float faceF = (0.4 + 0.6 * ef.z) * smoothstep(0.0, 0.25, ef.x);
  col += (deep * (0.24 * (1.0 - smoothstep(0.0, 0.34, ef.x)) + 0.05 * faceF * smoothstep(-0.6, 1.0, ef.w)) +
    azure * (0.16 * runF * (1.0 - smoothstep(0.0, 0.11, ef.x)))) * (oreF * lit);
  // The near seams: straight cracks between crystal faces, the faces drawn
  // out on a slant so they run as veins, only where the ore runs (a band of
  // slow noise), the walls going up with the scene (uSink) as it sinks.
  vec2 q = (p + vec2(uSlide, 0.9 * uSink)) / S;
  vec2 x = slant * q * vec2(5.5, 2.6);
  vec4 e = veinCells(x);
  float ore = smoothstep(0.42, 0.68, fbm(q * 2.2 + vec2(4.2, 1.3)));
  if (ore <= 0.0) return col;
  float face = e.z;
  // The faces: each catches a little of the light, brighter toward the
  // side it comes from, and a glint crosses each one slowly, on its own beat.
  // (Faded out toward the seams, as deeper in.)
  float inner = smoothstep(0.0, 0.14, e.x);
  float catchL = (0.35 + 0.65 * face) * smoothstep(-0.6, 1.0, e.w) * inner;
  float glint = exp(-pow(e.w - 0.9 * sin(tm * 0.11 + 6.283 * face), 2.0) / 0.05) * inner;
  col += mix(azure, pale, 0.25 * glint) * ((0.075 * catchL + 0.05 * glint * face) * ore * lit);
  // The seams swell and pinch along their length, as ore does.
  float swell = 0.7 + 0.6 * vnoise(x * 1.3 + 9.0);
  float seam = 1.0 - smoothstep(0.0, 0.045 * swell, e.x);
  float body = 1.0 - smoothstep(0.0, 0.12 * swell, e.x);
  float halo = 1.0 - smoothstep(0.0, 0.32, e.x);
  // Crystals where three faces meet, each breathing over many seconds, with a soft bloom round it.
  float node = (1.0 - smoothstep(0.0, 0.16, e.y)) * seam;
  float bloom = 1.0 - smoothstep(0.0, 0.34, e.y);
  // (Its beat from slow noise, not from the grid's squares, whose edges would cut through the bloom.)
  float breathe = 0.7 + 0.3 * sin(tm * 0.35 + 12.566 * vnoise(x * 0.6 + 3.0));
  // The light moving along the seams, slowly.
  float run = 0.6 + 0.4 * sin(tm * 0.45 - 1.7 * (x.x + 0.6 * x.y));
  vec3 add = azure * (0.14 * halo * halo + 0.16 * body * swell) + pale * (0.55 * seam * run) +
    white * (0.85 * node + 0.12 * bloom * bloom * halo) * breathe;
  return col + add * (ore * lit);
}

// The slot environment i (its index in ENVIRONMENTS) is drawn from, or ${NO_SLOT}: none.
int fxSlot(int i) {
  int m = int(i < 5 ? uFxK.z : uFxK.w);
  return (m >> (4 * (i < 5 ? i : i - 5))) & 15;
}

// Delve's environments, one or a few to a stratum: what makes each a place
// rather than a colour (shaders/effects.ts and shaders/newEffects.ts draw
// them; shaders/effectApi.md is their interface). Each that shows is drawn
// from its slot, with its strength and colours, in the fixed order of
// ENVIRONMENTS, so the order they are laid over each other never changes
// with which slots they are in. How much of one shows (0 to 1) is how far
// it has come, not how faint it is: each arrives from where it comes from
// and recedes the same way, so two in a turn never sit on top of each
// other half-faded (see turnInto in lib/descent.ts).
// p in CSS px, q = (p + (0, sink)) / S, xy = fractions of the screen, tm the clock (s).
vec3 environments(vec3 col, vec2 p, vec2 q, vec2 xy, float S, float W, float H, float tm, float dark) {
  // What glows still shows through the dark closing in, dimmed (and burns a
  // little less the deeper).
  gDark = dark;
  gLit = (1.0 - 0.8 * dark) * uFeatures;
  gSide = 1.0 - smoothstep(0.0, 0.3, min(xy.x, 1.0 - xy.x));
  float sink = uSink / H;
  int s;
  float dim;
${ENV_CALLS}
  return col;
}

// The light about you drawing in, at p (CSS px): 0 where it is light, toward
// 1 where it is dark. Deeper down (uDark.x) and as a question's clock runs
// down (uDark.y) the dark comes in from the edges. It is one wide Gaussian
// falloff across times one down, from where the light ends (reach, in half
// screens from the middle), so it has no edge, no texture and no shape of its
// own, and the corners go darkest, as they would. Only its reach wavers a
// little, like a flame's, the more as the clock runs out (not at all
// holding still, when the clock in uHome is 0).
float closing(vec2 p) {
  if (uDark.x + uDark.y <= 0.0) return 0.0;
  vec2 size = vec2(uSize.x, uViewH);
  float tm = uHome.z;
  float flicker = (0.012 + 0.02 * uDark.y) * (0.6 * sin(tm * 1.7) + 0.4 * sin(tm * 2.9 + 1.0));
  float surge = max(uDark.y - CLOCK_PEAK, 0.0);
  float reach = max(0.06, 1.0 - 0.6 * uDark.x - 0.32 * min(uDark.y, CLOCK_PEAK) - 0.75 * surge + flicker);
  vec2 x = max(abs(p - 0.5 * size) / (0.5 * size) - reach, 0.0) / (0.3 + 0.25 * reach);
  return 1.0 - exp(-dot(x, x));
}

// The smoke turned about slow eddies, so an arm of the dark passing one
// curls round it in a hook or a swirl. One eddy to a cell of a grid (about a
// quarter of the screen), at a jittered place, turning one way or the other;
// its turn fades to nothing well inside its cell, so no seam shows. On the
// backdrop's clock it breathes a little (still, holding still).
vec2 eddy(vec2 p, float S, float tm) {
  float L = 0.24 * S;
  vec2 cell = floor(p / L);
  float h = nhash(cell + 19.7);
  vec2 o = (cell + 0.5 + 0.3 * (vec2(nhash(cell + 3.1), nhash(cell + 8.3)) - 0.5)) * L;
  vec2 r = p - o;
  float k = 1.0 - smoothstep(0.0, 0.35 * L, length(r));
  float turn = (h < 0.5 ? -1.0 : 1.0) * (2.2 + 1.4 * h) * k * k * (0.85 + 0.15 * sin(tm * 0.4 + 6.283 * h));
  float cs = cos(turn);
  float sn = sin(turn);
  return o + mat2(cs, sn, -sn, cs) * r;
}

// The question's clock running down (uDark.y): curling arms of smoke
// reaching in from every side, longer as it runs out, 0 to 1 where it is
// dark. How far each reaches varies along the edge with slow noise read
// round a circle (so it has no seam); each curls one way or the other the
// further in it reaches, hooking at its tip, and turns round the eddies it
// passes (eddy()); drifting smoke bends them, so they writhe slowly, on the
// backdrop's clock (still, holding still). Across each, the dark falls off
// as a Gaussian from the edge, so no arm has an edge of its own. Where an
// arm thins out (its rim) gRim is set, toward 1, for a faint blue light
// caught on it, the more toward the light in the middle.
float gRim;
float tendrils(vec2 p) {
  gRim = 0.0;
  if (uDark.y <= 0.0) return 0.0;
  vec2 size = vec2(uSize.x, uViewH);
  float S = sqrt(size.x * size.y);
  float tm = uHome.z;
  p = eddy(p, S, tm);
  vec2 c = (p - 0.5 * size) / (0.5 * size);
  // How far in from the nearest edge: 0 there, about 1 in the middle (a
  // smooth max, so no crease runs in from the corners).
  vec2 a = abs(c);
  float inward = max(0.0, 1.0 - 0.12 * log(exp(a.x / 0.12) + exp(a.y / 0.12)));
  // Which way from the middle, curling the further in: a little with the
  // smoke, and each arm hard one way or the other toward its tip (its own
  // way, read off the same slow noise round the edge as its length).
  vec2 d = normalize(c * size / S + 1e-4);
  float hook = vnoise(d * 2.6 + vec2(41.0 + tm * 0.02, 7.0)) - 0.5;
  float twist = (vnoise(d * 1.7 + vec2(tm * 0.045, 3.0)) - 0.5) * 1.4 * inward + 6.0 * hook * inward * inward;
  d = mat2(cos(twist), sin(twist), -sin(twist), cos(twist)) * d;
  vec2 u = p / S * 3.0;
  vec2 w = vec2(vnoise(u + vec2(tm * 0.06, 0.0)), vnoise(u + vec2(5.2, -tm * 0.05))) - 0.5;
  d = normalize(d + 0.45 * w);
  // How far the arm here reaches (in half screens), longer as the clock
  // runs out, but short of the middle even then, and much further as a miss
  // swallows the scene (past CLOCK_PEAK). While the clock runs they never
  // quite reach the middle, where the arms would meet in a star: they reach
  // for the light there, and the dark itself (closing(), the dimming and
  // the smoke) does the rest; a miss takes that too.
  float f = smoothstep(0.3, 0.85, vnoise(d * 2.6 + vec2(17.0 + tm * 0.02, -tm * 0.015)));
  float surge = max(uDark.y - CLOCK_PEAK, 0.0);
  float len = 0.95 * (1.0 - exp(-(min(uDark.y, CLOCK_PEAK) * (0.07 + 0.8 * f) + 0.01) / 0.95)) + surge * (0.55 + 0.35 * f);
  float heart = mix(0.6, 1.2, smoothstep(0.0, 0.55, surge));
  float x = inward / len;
  // A little of the smoke's own texture in it, and faint while the clock has long to run.
  float smoke = 0.8 + 0.2 * vnoise(u * 2.1 - vec2(tm * 0.03, 0.0));
  float t = exp(-1.4 * x * x) * smoke * min(1.0, 3.0 * uDark.y) * (1.0 - smoothstep(heart, heart + 0.35, inward));
  // Its rim: a narrow band where it thins out, patchy, and only once it has
  // left the edge it grows from.
  float band = t - 0.4;
  gRim = exp(-band * band / 0.012) * smoothstep(0.04, 0.3, inward) * (0.45 + 0.55 * vnoise(u * 1.3 + vec2(-tm * 0.04, 2.0)));
  return t;
}

// The dark of the clock is smoke, not black: deep indigo, with violet and
// a brighter blue billowing through it slowly, at p (CSS px), as dark as
// q (uDark.y) has it.
vec3 darkSmoke(vec2 p, float S, float tm, float q) {
  vec2 u = p / S * 1.6 + vec2(tm * 0.03, -tm * 0.02);
  float n = 0.65 * vnoise(u) + 0.35 * vnoise(u * 2.3 + 4.7);
  float v = vnoise(u * 0.7 + vec2(9.1, -tm * 0.015));
  vec3 deep = mix(rgb(3.0, 3.0, 11.0), rgb(8.0, 4.0, 15.0), v);
  vec3 billow = mix(rgb(12.0, 14.0, 44.0), rgb(22.0, 12.0, 46.0), v);
  return mix(deep, billow, smoothstep(0.45, 0.8, n)) * (1.0 - 0.25 * max(0.0, q - 1.0));
}

`;

/** In smoothLight(): the stratum's smoke and uneven dark. */
const DELVE_SMOKE = `  // Delve: smoke of the stratum's colour, and a dark that gathers out of
  // the same smoke. Both come from domain-warped noise drifting on the
  // backdrop's clock, so the dark is uneven and slowly shifting: heavier
  // toward the edges and the ceiling, but with no edge, ellipse or other
  // shape that could be picked out.
  if (uShade.a > 0.0 || uMist.a > 0.0) {
    float tm = uHome.z;
    vec2 u = (p + 0.6 * vec2(uSlide, uSink)) / S * 2.4;
    vec2 warp = vec2(vnoise(u * 0.6 + vec2(tm * 0.021, 3.1)), vnoise(u * 0.6 + vec2(7.3, -tm * 0.017)));
    vec2 v = u + 2.2 * warp + vec2(-tm * 0.013, tm * 0.009);
    float n = 0.5 * vnoise(v) + 0.3 * vnoise(v * 2.03 + 11.7) + 0.2 * vnoise(v * 4.1 - 5.3);
    col = mix(col, uMist.rgb, uMist.a * smoothstep(0.42, 0.82, n));
    vec2 c = (p - vec2(0.5 * W, 0.62 * H)) / vec2(W, H) + 0.4 * (warp - 0.5);
    float edge = length(c * vec2(1.4, 1.15));
    col *= 1.0 - 0.75 * uShade.a * smoothstep(0.08, 0.9, edge + 0.9 * (0.52 - n));
  }

`;

/** In smoothLight(): the dark closing in, and the stratum's environments. */
const DELVE_DARK = `  // The light about you drawing in (see closing()). What glows in the
  // stratum's environment still shows through it, dimmed.
  float dark = closing(p);
  float arms = tendrils(p);
  dark = 1.0 - (1.0 - dark) * (1.0 - 0.9 * arms);
  if (dark > 0.0) col *= 1.0 - 0.93 * dark;
  if (uShade.a > 0.0 || uMist.a > 0.0) col = environments(col, p, (p + vec2(uSlide, uSink)) / S, p / vec2(W, H), S, W, H, uHome.z, dark);
  // An Azurite Vein being dug.
  if (uVein > 0.0) col = azuriteVein(col, p, S, W, H, uHome.z, dark);
  // As the clock runs out the light about you dims as it draws in, the
  // stratum's glow and all (and a right answer's light, a little under 0,
  // lifts it a touch). Never past black, however far it is pushed.
  col *= max(0.0, 1.0 - 0.35 * uDark.y);
  // The clock's dark is smoke rather than black: where it has come in, deep
  // indigo and violet billow through it, and the arms' curling rims catch
  // a faint blue light.
  if (uDark.y > 0.0) {
    float q = min(uDark.y, 2.0);
    // (As a miss swallows the scene, a veil of it over the middle too.)
    float body = max(clamp(dark, 0.0, 1.0) * smoothstep(0.0, 0.7, q), 0.6 * smoothstep(1.5, 2.0, q));
    col = mix(col, darkSmoke(p, S, uHome.z, q), 0.85 * body);
    col += rgb(50.0, 80.0, 190.0) * (0.22 * gRim * arms * min(1.0, q));
  }

`;

/** The main pass's uniforms only Delve uses. */
const DELVE_MAIN_UNIFORMS = `// Abyssal City's far lights: their colour and how many show (0 to 1); the
// warm windows' colour now and then among them, and the clock (s); the
// city's fog colour, and how far the lights' colours vary toward it (its
// colour stops c1, c0 and c2, see env_city).
uniform vec4 uCityA;
uniform vec4 uCityB;
uniform vec4 uCityC;
// The colour Frozen Hollow's frost glints in (its whitest stop, whiter).
uniform vec3 uIce;
`;

/** In the main pass: the dark closing in on the far lights and the embers, the city's far lights, the frost's glints. */
const DELVE_MAIN = `  // The far lights and the embers dim where the dark has closed in (see closing()).
  float near = (1.0 - 0.75 * closing(p)) * (1.0 - 0.3 * uDark.y);

  // Abyssal City: far cold lights, like windows or stars, gathered in
  // clusters at two depths that drift past at two speeds. Each is a point a
  // pixel or two across, too fine for the soft light's own target.
  if (uCityA.w > 0.0) {
    for (int i = 0; i < 2; i++) {
      float cs = i == 0 ? 7.0 : 12.0;
      vec2 pp = p + vec2(uCityB.w * (i == 0 ? 1.0 : 2.6), 0.0) + vec2(uSlide, uSink) * (i == 0 ? 0.3 : 0.6);
      vec2 cell = floor(pp / cs);
      float h = hash(cell + float(i) * 31.0);
      // Most cells hold no light: test that before the cluster's noise.
      if (h < 0.84) continue;
      float cluster = vnoise(cell * (i == 0 ? 0.11 : 0.07) + float(i) * 9.0);
      if (cluster < 0.5) continue;
      vec2 at = (cell + 0.3 + 0.4 * vec2(hash(cell + 7.0), hash(cell + 13.0))) * cs;
      vec2 d = pp - at;
      float tw = 0.65 + 0.35 * sin(uCityB.w * (0.4 + 1.6 * h) + h * 60.0);
      float lit = smoothstep(0.5, 0.7, cluster) * (i == 0 ? 0.7 : 1.2) * (0.3 + 0.7 * smoothstep(0.0, 0.6, p.y / uViewH));
      // One by one as the city comes (and goes).
      float on = smoothstep(0.0, 0.12, 1.12 * uCityA.w - (h - 0.84) / 0.16);
      float r2 = dot(d, d);
      // Each cold light a little deeper toward the fog's colour, or not (as far as the city's colours vary).
      vec3 cold = mix(uCityA.rgb, mix(uCityA.rgb, 1.6 * uCityC.rgb, 0.5), uCityC.w * hash(cell + 19.0));
      col += mix(cold, uCityB.rgb, step(0.975, h)) * (exp(-r2 / (i == 0 ? 0.6 : 1.1)) + 0.12 * exp(-r2 / 9.0)) * tw * lit * 0.8 * on * near;
    }
  }

  // Frozen Hollow: the frost catching the light. Here and there, where its
  // crystal is (frost, from the soft light; already dimmed where the dark
  // has closed in), a point of it glints for a few seconds and fades: one
  // in a few cells of a 14 px grid, each on a slow beat of its own (20 to
  // 50 s), so only a few show at once, never a glitter. A point and a small
  // soft halo, well inside its cell, so nothing is cut off. They sit on the
  // walls, so they go up with them as the scene sinks.
  if (frost > 0.004) {
    vec2 fp = p + vec2(uSlide, uSink);
    vec2 cell = floor(fp / 14.0);
    float h = hash(cell + 3.7);
    if (h > 0.93) {
      vec2 d = fp - (cell + 0.3 + 0.4 * vec2(hash(cell + 1.3), hash(cell + 8.9))) * 14.0;
      float r2 = dot(d, d);
      float s = max(0.0, sin(uHome.z * (0.12 + 0.2 * hash(cell + 5.1)) + 6.283 * hash(cell + 2.2)));
      s *= s;
      s *= s;
      s *= s;
      s *= s;
      col += uIce * (exp(-r2 / 0.45) + 0.12 * exp(-r2 / 3.0)) * s * min(1.0, frost) * 0.32;
    }
  }

`;

// GLSL the backdrop's passes share.
const RGB = `vec3 rgb(float r, float g, float b) { return vec3(r, g, b) / 255.0; }
`;
const HASH = `// Hash without sine (Dave Hoskins); uniform in [0, 1).
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;
/** Read by FINISH (and BOX_MAIN), so declared by the pass that ends with it. */
const DIALOG_UNIFORM = `uniform float uDialog; // how far an open dialog dims the page, 0-1 (lib/behindDialog.ts)
`;

/**
 * The backdrop's soft light: the base gradient, its haze and glows, the
 * blobs, and the start page's rays and title glow. Nothing in it changes over
 * less than several CSS px, so where the GPU can draw to a float target it
 * is drawn at SMOOTH_PX CSS px per texel and filtered up (see startBackdrop):
 * on a 2x screen that's a sixteenth of the pixels, for most of the
 * backdrop's own arithmetic. Embers, grain, shadows, fills and the dither
 * stay per pixel. With `delve`, Delve's parts too (see DELVE_SMOOTH_FUNCTIONS).
 */
const smooth = (delve: boolean) => `
uniform vec2 uSize;  // canvas size, CSS pixels
uniform float uViewH; // the height the scene is laid out for, CSS pixels (see viewH)

// Breathing, driven from JS: each is (scale, strength).
uniform vec2 uTop;
uniform vec2 uBottom;
uniform vec2 uGlow;
uniform float uBaseStop;

// Blobs. A: centre (fractions of the viewport), rotation, opacity.
// B: reach ahead of / behind the centre along the rotated axis, and across
// it, in units of sqrt(W * H). Unequal reaches make each blob lopsided.
uniform vec4 uBlobA[${BLOB_COUNT}];
uniform vec2 uBlobRot[${BLOB_COUNT}]; // (cos, sin) of A's rotation
uniform vec3 uBlobB[${BLOB_COUNT}];
uniform vec3 uBlobColor[${BLOB_COUNT}];

// Delve's stratum (lib/descent.ts; the surface's look outside one): the light
// from below (rgb, strength), the haze's colour, the dark's hue (rgb) and how
// much of the hall its uneven dark swallows, and smoke of the stratum's
// colour (rgb, strength).
uniform vec4 uFloor;
uniform vec3 uHaze;
uniform vec4 uShade;
uniform vec4 uMist;
${delve ? DELVE_SMOOTH_UNIFORMS : ''}// The glow in the middle's colour (the surface's gold, a stratum's own).
// And in one vector (uniform space is tight, see maxElements): how bright
// the stratum's light is drawn (descent.ts's light times the stratum's
// own, lightK: so the scene only ever darkens deeper down); how far the
// scene has sunk (CSS px; each new depth sinks it, see plunge in
// descent.ts): the walls' and the smoke's noise is read that much further
// down, the nearer the more; and how bright the stratum's features burn
// (descent.ts's features); and how far it has swung sideways (CSS px;
// dynamite blasting a question away swings it, see swing in descent.ts):
// the walls and the smoke are read that much further along.
uniform vec3 uGlowCol;
uniform vec4 uScene;
#define uLight uScene.x
#define uSink uScene.y
#define uFeatures uScene.z
#define uSlide uScene.w

// The start page: (rays, title glow, time in s, title breath), and the
// title's centre and half size (CSS px). See setHomeScene in lights.ts.
uniform vec4 uHome;
uniform vec4 uTitle;
// The god rays' beams: (angle, width, brightness) each, from the time in uHome
// (see beams() below; they're the same for every pixel, so worked out once a
// frame).
uniform vec3 uBeams[7];

${RGB}
float gauss(float d) { return exp(-d * d); }

${delve ? DELVE_SMOOTH_FUNCTIONS : ''}// The soft light at p (CSS px, top-left origin).
vec3 smoothLight(vec2 p) {
  float W = uSize.x;
  float H = uViewH;
  float S = sqrt(W * H);

  // Vertical base: #0d0b09 at the top, #080706 at uBaseStop, #0d0907 at the
  // bottom, eased so there's no crease at the middle stop.
  float t = p.y / H;
  vec3 col = t < uBaseStop
    ? mix(rgb(13.0, 11.0, 9.0), rgb(8.0, 7.0, 6.0), smoothstep(0.0, uBaseStop, t))
    : mix(rgb(8.0, 7.0, 6.0), rgb(13.0, 9.0, 7.0), smoothstep(uBaseStop, 1.0, t));
  // Each stratum of a Delve tints the dark its own way.
  col *= uShade.rgb;

  // Warm haze from above the top edge (a stratum's own colour in a Delve).
  float d = length((p - vec2(0.5 * W, -0.1 * H)) / (vec2(0.6 * W, 0.5 * H) * uTop.x));
  col = mix(col, uHaze, uTop.y * 0.18 * gauss(d / 0.5));

  // Ember glow from below the bottom edge (in a Delve, the stratum's light).
  d = length((p - vec2(0.5 * W, 1.1 * H)) / (vec2(0.8 * W, 0.6 * H) * uBottom.x));
  col = mix(col, uFloor.rgb, uBottom.y * uFloor.a * gauss(d / 0.5));

  // Central gold glow, scaled about the screen centre.
  vec2 q = vec2(0.5 * W, 0.5 * H) + (p - vec2(0.5 * W, 0.5 * H)) / uGlow.x;
  float R = length(vec2(0.7 * W, 0.77 * H));
  d = length(q - vec2(0.5 * W, 0.43 * H)) / R;
  col = mix(col, uGlowCol, uGlow.y * 0.07 * gauss(d / 0.3));

  // Drifting blobs break up the symmetry of the layers above.
  for (int i = 0; i < ${BLOB_COUNT}; i++) {
    vec4 a = uBlobA[i];
    vec3 b = uBlobB[i];
    vec2 rot = uBlobRot[i];
    vec2 r = p - a.xy * vec2(W, H);
    float u = dot(r, rot);
    float v = dot(r, vec2(-rot.y, rot.x));
    float reach = (u > 0.0 ? b.x : b.y) * S;
    float w = gauss(length(vec2(u / reach, v / (b.z * S))));
    col = mix(col, uBlobColor[i], a.w * w);
  }

${delve ? DELVE_SMOKE : ''}  // The stratum's light, set so the scene's average only ever darkens with
  // depth; its features are drawn after, at their own brightness, so a
  // bright one (fire, gold) is balanced by darker surroundings.
  col *= uLight;

${delve ? DELVE_DARK : ''}  // The start page: god rays falling from high above the title (the centre
  // without one), each beam slowly waxing and waning in place, and a royal
  // glow behind the title.
  if (uHome.x > 0.0) {
    float ht = uHome.z;
    vec2 src = vec2(uTitle.z > 0.0 ? uTitle.x : 0.5 * W, -0.32 * H);
    vec2 dr = p - src;
    float ang = atan(dr.x, dr.y); // 0 is straight down
    float r = length(dr);
    float beams = 0.0;
    for (int i = 0; i < 7; i++) {
      vec3 b = uBeams[i];
      float x = (ang - b.x) / b.y;
      beams += b.z * exp(-x * x);
    }
    // Motes of dust drifting down the shafts.
    float shimmer = 0.82 + 0.18 * sin(r * 0.014 - ht * 0.5 + ang * 9.0);
    float cone = exp(-ang * ang / 0.5);
    float fall = exp(-max(r - 0.3 * H, 0.0) / (0.5 * H));
    col += vec3(1.0, 0.86, 0.62) * beams * shimmer * cone * fall * 0.05 * uHome.x;
  }
  if (uHome.y > 0.0 && uTitle.z > 0.0) {
    float breath = uHome.w;
    vec2 q = (p - uTitle.xy) / (uTitle.zw * vec2(0.95, 2.4));
    col += vec3(1.0, 0.74, 0.36) * exp(-dot(q, q)) * 0.1 * breath * uHome.y;
    vec2 q2 = (p - uTitle.xy) / (uTitle.zw * vec2(1.9, 5.5));
    col += vec3(0.5, 0.14, 0.2) * exp(-dot(q2, q2)) * 0.05 * uHome.y;
  }
  return col;
}
`;

/** CSS px per texel of the soft light's own target. */
const SMOOTH_PX = 2;

/** Draws smoothLight() into its own target, a texel per SMOOTH_PX CSS px (with Delve's parts, or without). */
const smoothFrag = (delve: boolean) => `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes; // the target's size, texels
${smooth(delve)}
void main() {
  vec3 col = smoothLight(vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uSize);
  // (Its alpha carries where Frozen Hollow's frost crystal is: see gFrost.)
  fragColor = vec4(col, ${delve ? 'gFrost' : '0.0'});
}
`;

/**
 * Fragment uniform vectors the main pass uses apart from the UI elements'
 * (counted unpacked, samplers apart, with one to spare: 172 as linked with
 * the soft light worked out here, the effects' slots, 3 * FX_SLOTS, among
 * them), and each element's: its seven rows and its shadows' two each.
 * Recount when adding a uniform (the active uniforms of the program
 * frag(4, false, true) links to, less 4 elements' worth).
 */
const FIXED_UNIFORMS = 173;
const ELEMENT_UNIFORMS = 7 + 2 * SHADOWS_PER_ELEMENT;

/**
 * Which of the UI's shadows and fills a main pass draws: all of them; only
 * the drop shadows, with the boxes' laid over the scene from the UI pass's
 * layer (uiFrag: the two are built side by side, so the page's first paint
 * waits only for the slower, not both in one); or none (where the backdrop
 * leaves them all to CSS). The UI pass needs a float target to draw into,
 * as the soft light does its own: without one (see split), it's all in the
 * main pass.
 */
type UiParts = 'all' | 'drops' | 'none';

/**
 * The backdrop at every device pixel. With `split`, the soft light comes from
 * uSmooth (drawn by smoothFrag); without, it's worked out here (where the
 * spores' and motes' finest points are drawn at a device pixel's size, not
 * the soft light's texel's). With `delve`, Delve's parts too. `ui` is which
 * of the UI's shadows and fills it draws (see UiParts): CSS paints the rest.
 * With 'drops' the boxes' come from the UI pass's layer (uiFrag), laid over
 * the scene here.
 */
const frag = (MAX_ELEMENTS: number, split: boolean, delve: boolean, ui: UiParts = 'all') => `#version 300 es
precision highp float;
out vec4 fragColor;
${split ? '' : '#define FX_POINT_PX 2.0'}

uniform vec2 uRes;   // drawing buffer size, device pixels
${smooth(delve)}
uniform sampler2D uSmooth;
uniform vec2 uVignette; // breathing (reach, strength)
${ui === 'all' ? BOX_UNIFORMS(MAX_ELEMENTS) : ''}
// Event lights (x, y, radius, strength) and colours; the mood tint (r, g,
// b, strength). See lights.ts.
uniform vec4 uLightA[${MAX_LIGHTS}];
uniform vec4 uLightC[${MAX_LIGHTS}];
uniform vec4 uMood;

// Embers by screen tile: row t holds the embers whose glow reaches tile t,
// (x, y, size + ${SIZE_STRIDE} * palette entry, brightness) each, ending at
// brightness 0; see backdropEmbers.ts.
uniform sampler2D uEmbers;
// The embers' palette: halo colour and how far the core burns toward
// uEmberCore, per entry (see backdropEmbers.ts); and their overall gain.
uniform vec4 uEmberHalo[${PALETTE}];
uniform vec3 uEmberCore[${PALETTE}];
// Their overall gain, and how far they streak up in a plunge (their glow
// drawn that much taller; the glints' never).
uniform vec2 uEmberK;
#define uEmberGain uEmberK.x
#define uStreak uEmberK.y
${delve ? DELVE_MAIN_UNIFORMS : ''}${ui === 'all' ? BOX_SHADOW_UNIFORMS(MAX_ELEMENTS) : ''}${ui !== 'none' ? DROP_UNIFORMS : ''}${ui === 'drops' ? BOXES_UNIFORM : ''}${DIALOG_UNIFORM}${ui === 'all' ? BOX_FUNCTIONS : ''}${ui !== 'none' ? LAY : ''}
${HASH}
void main() {
  vec2 dev = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = dev / uRes * uSize; // CSS px, top-left origin
  float W = uSize.x;
  float H = uSize.y;

  ${split ? 'vec4 soft = texture(uSmooth, vec2(p.x / W, 1.0 - p.y / H));\n  vec3 col = soft.rgb;' + (delve ? '\n  float frost = soft.a;' : '') : 'vec3 col = smoothLight(p);' + (delve ? '\n  float frost = gFrost;' : '')}
${delve ? DELVE_MAIN : ''}  // Embers rising through the dark: a hot core and a wide, dim halo.
  int tile = clamp(int(p.y / H * ${ROWS}.0), 0, ${ROWS - 1}) * ${COLUMNS} + clamp(int(p.x / W * ${COLUMNS}.0), 0, ${COLUMNS - 1});
  for (int i = 0; i < ${SLOTS}; i++) {
    vec4 e = texelFetch(uEmbers, ivec2(i, tile), 0);
    if (e.w <= 0.0) break;
    float entry = floor(e.z * ${(1 / SIZE_STRIDE).toFixed(6)});
    float size = e.z - ${SIZE_STRIDE}.0 * entry;
    // (The glints in the walls go up with the walls, unstreaked.)
    vec2 dp = (p - e.xy) * vec2(1.0, 1.0 / (1.0 + (entry == ${GLINT_COLOR}.0 ? 0.0 : uStreak)));
    float r2 = dot(dp, dp);
    float s2 = size * size;
    if (r2 > s2 * 40.0) continue;
    float core = exp(-r2 / (s2 * 0.3));
    float halo = exp(-r2 / (s2 * 5.0));
    vec4 tint = uEmberHalo[int(entry)];
    vec3 hot = mix(tint.rgb, uEmberCore[int(entry)], tint.a);
    col += (hot * core * 0.9 + tint.rgb * halo * 0.3) * e.w * uEmberGain${delve ? ' * near' : ''};
  }

  // Lift the dark tones within their own hue. (A flat grey lift, as the old
  // SVG grain gave, washes these near-black colours out.)
  col *= 1.2;

  // Grain: a faint luminance texture, one sample per CSS pixel. It scales
  // each colour rather than adding grey, so it doesn't desaturate.
  vec2 cell = floor(p);
  float g = (hash(cell) + hash(cell + 17.0) + hash(cell + 43.0) + hash(cell + 71.0) - 2.0) * 1.7320508;
  col *= 1.0 + 0.04 * g;

  // Vignette: darkens smoothly from the centre, reaching about 72% at the
  // corners (farthest-corner ellipse, as in CSS).
  float V = uViewH;
  float vig = length((p - vec2(0.5 * W, 0.5 * V)) / (vec2(0.5 * W, 0.5 * V) * 1.4142136 * uVignette.x));
  col *= 1.0 - min(0.9, uVignette.y * 0.72 * pow(vig, 2.4));

  // Mood: the whole scene takes on a colour, welling up from below and the edges.
  if (uMood.a > 0.0) {
    float below = gauss(length((p - vec2(0.5 * W, 1.12 * V)) / vec2(0.95 * W, 0.8 * V)));
    float m = uMood.a * (0.06 + 0.42 * below + 0.14 * pow(vig, 2.0));
    col = col * (1.0 - 0.25 * uMood.a) + uMood.rgb * m * 0.3;
  }

  // Event lights light the stone: an added glow plus a lift of
  // what's already there, so the grain shows through.
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 la = uLightA[i];
    if (la.w <= 0.0) continue;
    float g = la.w * gauss(length(p - la.xy) / la.z);
    col = col * (1.0 + 1.5 * g) + uLightC[i].rgb * g * 0.22;
  }

${ui !== 'none' ? DROPS : ''}${ui === 'drops' ? BOXES : ui === 'all' ? BOX_MAIN(MAX_ELEMENTS, false) : ''}${ui !== 'none' ? DROPS_OVER : ''}${FINISH}`;

/** The end of the main pass. */
const FINISH = `  // A dialog dims it all here, before the dither; CSS darkening the
  // dithered output would band.
  col *= 1.0 - ${DIALOG_DIM.toFixed(3)} * uDialog;

  // TPDF dither of +-1 LSB, per device pixel, ahead of the round-to-nearest
  // 8-bit conversion. The same sample goes to all three channels, so the
  // noise carries no colour of its own.
  float n = hash(dev + 0.5) + hash(dev + 101.5) - 1.0;
  fragColor = vec4(col + n / 255.0, 1.0);
}
`;

// The UI's shadows and fills, drawn here once the backdrop has taken them
// over from CSS. Its boxes' (backdropShadow.ts: soft box shadows and fills)
// are most of what the backdrop takes to build, so they're the UI pass's
// where it can have one (see UiParts); its drop shadows
// (backdropDropShadow.ts: text and image glows) a little, and stay in the
// main pass.
const BOX_UNIFORMS = (MAX_ELEMENTS: number) => `
// Outer box-shadows and fills of UI elements (see backdropShadow.ts for the layout).
uniform vec4 uElX[${MAX_ELEMENTS}];
uniform vec4 uElY[${MAX_ELEMENTS}];
uniform vec4 uElA[${MAX_ELEMENTS}];
uniform vec4 uElB[${MAX_ELEMENTS}];
uniform vec4 uElC[${MAX_ELEMENTS}];
uniform vec4 uElD[${MAX_ELEMENTS}];
uniform vec4 uElE[${MAX_ELEMENTS}];
uniform int uElCount;
`;
const BOX_SHADOW_UNIFORMS = (MAX_ELEMENTS: number) => `uniform vec4 uShGeo[${MAX_ELEMENTS * SHADOWS_PER_ELEMENT}];
uniform vec4 uShCol[${MAX_ELEMENTS * SHADOWS_PER_ELEMENT}];

`;
const DROP_UNIFORMS = `// Drop shadows of UI elements (see backdropDropShadow.ts for the layout).
uniform vec4 uMkA[${MAX_MASKS}];
uniform vec4 uMkB[${MAX_MASKS}];
uniform vec4 uMkC[${MAX_MASKS}];
uniform vec4 uMkD[${MAX_MASKS}];
uniform vec4 uMkE[${MAX_MASKS}];
uniform vec4 uMkOff[${MAX_MASKS}];
uniform vec4 uMkCol[${MAX_MASKS * DROPS_PER_MASK}];
uniform sampler2D uSharp; // content alpha
uniform sampler2D uBlur;  // blurred alpha, 16-bit in R+G and B+A
uniform vec2 uSharpSize;
uniform vec2 uBlurSize;
`;
const BOX_FUNCTIONS = `
// Blurred rounded-rectangle shadow (Evan Wallace, "Fast Rounded Rectangle
// Shadows"): exact Gaussian integral across x via erf, numerically integrated
// along y. Returns coverage in [0, 1].
vec2 erf2(vec2 x) {
  vec2 s = sign(x);
  vec2 a = abs(x);
  x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
  x *= x;
  return s - s / (x * x);
}

float shadowX(float x, float y, float sigma, float corner, vec2 halfSize) {
  float delta = min(halfSize.y - corner - abs(y), 0.0);
  float curved = halfSize.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  vec2 integral = 0.5 + 0.5 * erf2((x + vec2(-curved, curved)) * (0.70710678 / sigma));
  return integral.y - integral.x;
}

float roundedBoxShadow(vec2 lower, vec2 upper, vec2 point, float sigma, float corner) {
  vec2 center = (lower + upper) * 0.5;
  vec2 halfSize = (upper - lower) * 0.5;
  corner = min(corner, min(halfSize.x, halfSize.y));
  point -= center;
  // Where the blur (to 3 sigma, as far as the sum below looks) can't reach a
  // rounded corner, the box is a plain rectangle, whose blur is erf across
  // times erf down: no sum needed. That's most of the shadow beside a large
  // element.
  // (One return, not an early one: the shader compiler builds it faster.)
  vec2 clear = halfSize - corner - abs(point) - 3.0 * sigma;
  float value = 0.0;
  if (max(clear.x, clear.y) >= 0.0) {
    vec2 k = vec2(0.70710678 / sigma);
    vec2 cover = 0.5 * (erf2((point + halfSize) * k) - erf2((point - halfSize) * k));
    value = cover.x * cover.y;
  } else {
    float low = point.y - halfSize.y;
    float high = point.y + halfSize.y;
    float y0 = clamp(-3.0 * sigma, low, high);
    float y1 = clamp(3.0 * sigma, low, high);
    float dy = (y1 - y0) / 8.0;
    float y = y0 + dy * 0.5;
    for (int i = 0; i < 8; i++) {
      value += shadowX(point.x, point.y - y, sigma, corner, halfSize)
        * exp(-y * y / (2.0 * sigma * sigma)) * dy;
      y += dy;
    }
    value *= 0.39894228 / sigma;
  }
  return value;
}
`;
/**
 * A layer (premultiplied colour, coverage) with `c` laid over it at `a`: so
 * the scene with the layer over it (col * (1 - l.a) + l.rgb) is the scene
 * mixed with each in turn, as if drawn straight onto it.
 */
const LAY = `vec4 lay(vec4 l, vec3 c, float a) { return vec4(mix(l.rgb, c, a), mix(l.a, 1.0, a)); }
`;
/**
 * The UI's drop shadows, in two layers: those inside a fill drawn here
 * (uMkE's y), laid over the boxes (DROPS_OVER), and the rest, over the scene
 * now. One loop for both: a second copy of it would take the shader
 * compiler about as long again (some 30 ms).
 */
const DROPS = `  // UI drop shadows. The element paints over its own shadow, so where it
  // is opaque the shadow is hidden anyway; drawing it only where the content
  // is transparent keeps a see-through element (like the faint showcase
  // items) from darkening what shows through it.
  vec4 dropsUnder = vec4(0.0);
  vec4 dropsOver = vec4(0.0);
  for (int i = 0; i < ${MAX_MASKS}; i++) {
    vec4 mc = uMkC[i];
    if (mc.z <= 0.0) continue;
    vec4 ma = uMkA[i];
    vec4 mb = uMkB[i];
    vec2 r = p - ma.xy;
    vec2 lp = vec2(mb.x * r.x + mb.z * r.y, mb.y * r.x + mb.w * r.y) + ma.zw * 0.5;
    vec2 m = lp - mc.xy; // position inside the mask region
    if (m.x < 0.0 || m.y < 0.0 || m.x > mc.z || m.y > mc.w) continue;
    vec4 md = uMkD[i];
    float q = uMkE[i].x;
    // textureLod, not texture: the atlases have no mipmaps, so it samples
    // the same, but without the implicit derivatives, which a loop that
    // continues per pixel can't have; on Windows (ANGLE to HLSL) they force
    // the compiler to unroll the loop, which slows the first compile.
    float content = textureLod(uSharp, (md.xy + m) / uSharpSize, 0.0).a;
    vec4 off = uMkOff[i];
    vec4 t1 = textureLod(uBlur, (md.zw + (m - off.xy) * q) / uBlurSize, 0.0);
    vec4 t2 = textureLod(uBlur, (md.zw + (m - off.zw) * q) / uBlurSize, 0.0);
    vec4 c1 = uMkCol[i * ${DROPS_PER_MASK}];
    vec4 c2 = uMkCol[i * ${DROPS_PER_MASK} + 1];
    // CSS paints the last shadow in the list first.
    bool inFill = uMkE[i].y > 0.5;
    vec4 l = inFill ? dropsOver : dropsUnder;
    l = lay(l, c2.rgb, c2.a * (t2.b + t2.a / 255.0) * (1.0 - content));
    l = lay(l, c1.rgb, c1.a * (t1.r + t1.g / 255.0) * (1.0 - content));
    if (inFill) dropsOver = l;
    else dropsUnder = l;
  }
  col = col * (1.0 - dropsUnder.a) + dropsUnder.rgb;

`;
/** The drop shadows inside fills drawn here, over the boxes (see DROPS). */
const DROPS_OVER = `  col = col * (1.0 - dropsOver.a) + dropsOver.rgb;

`;
const BOXES_UNIFORM = `uniform sampler2D uBoxes; // the UI pass's layer (uiFrag), a texel per device pixel
`;
/** The boxes' shadows and fills, from the UI pass's layer, over the scene. */
const BOXES = `  vec4 boxes = texelFetch(uBoxes, ivec2(gl_FragCoord.xy), 0);
  col = col * (1.0 - boxes.a) + boxes.rgb;

`;
/** GLSL that draws `c` at `a` onto col, or lays it into the layer `ui`. */
const paint = (layer: boolean, c: string, a: string) => (layer ? `ui = lay(ui, ${c}, ${a});` : `col = mix(col, ${c}, ${a});`);
/**
 * The boxes' shadows and fills, drawn onto col, or (`layer`, the UI pass's)
 * laid into the layer `ui` (see LAY).
 */
const BOX_MAIN = (MAX_ELEMENTS: number, layer: boolean) => `  // UI elements in two passes: every element's shadows outside its border
  // box, then every fill inside it, in document order. So a shadow only ever
  // lands on the backdrop, never on a neighbouring box: the same as while
  // the page scrolls, when CSS paints the fills over these shadows. (CSS on
  // its own would lay a later box's shadow over the boxes before it.) An
  // element inside a fill drawn here has its shadows drawn in the second
  // pass, in its turn, so they land on that fill as CSS would lay them.
  float pxLocal = uSize.x / uRes.x; // CSS px per device px
  for (int pass = 0; pass < 2; pass++)
  for (int i = 0; i < ${MAX_ELEMENTS}; i++) {
    if (i >= uElCount) break;
    vec4 ea = uElA[i];
    vec4 eb = uElB[i];
    if (eb.w < 0.5) continue;
    vec4 fc = uElC[i];
    // Element px from its border-box corner, through the element's map
    // (homogeneous, so a turned element's own plane).
    vec3 hx = uElX[i].xyz;
    vec3 hy = uElY[i].xyz;
    vec3 hp = vec3(dot(hx, vec3(p, 1.0)), dot(hy, vec3(p, 1.0)), dot(ea.xyz, vec3(p, 1.0)));
    if (hp.z <= 0.0) continue; // beyond its horizon
    vec2 lp = hp.xy / hp.z;
    // Element px per CSS px here: the root of the map's local area scale.
    vec2 jx = (hx.xy - lp.x * ea.xy) / hp.z;
    vec2 jy = (hy.xy - lp.y * ea.xy) / hp.z;
    float k = sqrt(abs(jx.x * jy.y - jx.y * jy.x));
    // Inside a fill drawn here (fc.w), its shadows go over that fill, in the
    // second pass with the fills; otherwise in the first, under them all.
    bool over = fc.w > 0.5;
    // Most pixels are beyond every shadow's reach (ea.w, the per-shadow
    // test below for all of them at once): skip those first.
    vec2 far = max(-lp, lp - eb.xy);
    bool shade = (pass == 1) == over && max(far.x, far.y) <= ea.w;
    if (!shade && (pass == 0 || fc.x < 0.5)) continue;
    vec2 halfBox = eb.xy * 0.5;
    float rr = min(eb.z, min(halfBox.x, halfBox.y));
    vec2 qd = abs(lp - eb.xy * 0.5) - halfBox + rr;
    float sdf = length(max(qd, 0.0)) + min(max(qd.x, qd.y), 0.0) - rr;
    float px = pxLocal * k; // one device pixel in element px
    // Behind a dialog the UI blurs, so the edge softens with it (a linear
    // ramp as wide as a Gaussian edge's 10-90% rise).
    float edge = max(px, 2.56 * ${DIALOG_BLUR.toFixed(2)} * uDialog * k);
    float outside = clamp(sdf / edge + 0.5, 0.0, 1.0);
    // A shadow reaches one pixel further in, under the box's own edge: CSS
    // covers that pixel by its coverage, so weighing the shadow by it too
    // would count the edge twice and leave a dark seam where the glow starts.
    float under = clamp((sdf + px) / edge + 0.5, 0.0, 1.0);

    if (shade && under > 0.0) {
      for (int j = 0; j < ${SHADOWS_PER_ELEMENT}; j++) {
        vec4 g = uShGeo[i * ${SHADOWS_PER_ELEMENT} + j];
        vec4 c = uShCol[i * ${SHADOWS_PER_ELEMENT} + j];
        vec2 lower = g.xy - g.w;
        vec2 upper = eb.xy + g.xy + g.w;
        // Skip pixels beyond the Gaussian's reach. (Ifs, not continues: the
        // shader compiler builds them faster.)
        vec2 far = max(lower - lp, lp - upper);
        if (c.a > 0.0 && max(far.x, far.y) <= 4.0 * g.z) {
          float a = roundedBoxShadow(lower, upper, lp, g.z, max(eb.z + g.w, 0.0));
          ${paint(layer, 'c.rgb', 'c.a * a * under')}
        }
      }
    }
    if (pass == 1 && fc.x > 0.5 && outside < 1.0) {
      vec4 ca = uElD[i];
      vec4 cb = uElE[i];
      vec4 fill;
      if (fc.x < 1.5) {
        // CSS linear-gradient(angle, a, b), interpolated premultiplied.
        vec2 gdir = vec2(sin(fc.y), -cos(fc.y));
        float glen = abs(eb.x * gdir.x) + abs(eb.y * gdir.y);
        float gt = clamp(dot(lp - halfBox, gdir) / glen + 0.5, 0.0, 1.0);
        vec4 m = mix(vec4(ca.rgb * ca.a, ca.a), vec4(cb.rgb * cb.a, cb.a), gt);
        fill = vec4(m.a > 0.0 ? m.rgb / m.a : vec3(0.0), m.a);
      } else {
        // The art stage (QuestionView's .art), layer by layer as its CSS
        // paints it: a dark vertical ground; a vignette (farthest-corner
        // ellipse, clear to 45%, then to 55% black); a cool rim light from
        // the top edge (ellipse 80% x 45% at 50% 0%); and the warm glow in ca
        // (ellipse 55% x 50% at 50% 52%). Each fades out at 70% of its
        // ellipse, linearly as CSS does.
        vec3 s = mix(rgb(12.0, 13.0, 18.0), rgb(6.0, 7.0, 9.0), clamp(lp.y / eb.y, 0.0, 1.0));
        float tv = length((lp - halfBox) / (halfBox * 1.4142136));
        s = mix(s, vec3(0.0), 0.55 * clamp((tv - 0.45) / 0.55, 0.0, 1.0));
        float tr = length((lp - vec2(0.5 * eb.x, 0.0)) / (eb.xy * vec2(0.8, 0.45)));
        s = mix(s, rgb(90.0, 110.0, 160.0), 0.1 * max(0.0, 1.0 - tr / 0.7));
        float tg = length((lp - eb.xy * vec2(0.5, 0.52)) / (eb.xy * vec2(0.55, 0.5)));
        s = mix(s, ca.rgb, ca.a * max(0.0, 1.0 - tg / 0.7));
        fill = vec4(s, 1.0);
      }
      ${paint(layer, 'fill.rgb', 'fill.a * fc.z * (1.0 - outside)')}
    }
  }

`;

/**
 * The UI pass: the UI's box shadows and fills (see BOX_MAIN), into a layer
 * of their own (see LAY) that the main pass lays over the scene (frag's
 * 'drops'). Their code takes the shader compiler longer than the rest of the
 * main pass, so as a program of its own it's built alongside; it reads
 * nothing of the scene, so neither waits on the other.
 */
const uiFrag = (MAX_ELEMENTS: number) => `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;  // drawing buffer size, device pixels
uniform vec2 uSize; // canvas size, CSS pixels
${BOX_UNIFORMS(MAX_ELEMENTS)}${BOX_SHADOW_UNIFORMS(MAX_ELEMENTS)}${DIALOG_UNIFORM}
${RGB}${BOX_FUNCTIONS}${LAY}
void main() {
  vec2 dev = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = dev / uRes * uSize; // CSS px, top-left origin
  vec4 ui = vec4(0.0);

${BOX_MAIN(MAX_ELEMENTS, true)}  fragColor = ui;
}
`;

// CSS `ease-in-out`: cubic-bezier(0.42, 0, 0.58, 1).
function easeInOut(x: number): number {
  const bez = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, 0.42, 0.58) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, 0, 1);
}

/**
 * Progress (0 to 1) of a breathing cycle: ease-in-out up to the peak at the
 * halfway point and back, like the CSS `breathe` keyframes. `phase` offsets
 * the start (0 to 1) so the layers don't all begin at rest together.
 */
function breathe(ms: number, periodMs: number, phase = 0): number {
  const u = (ms / periodMs + phase) % 1;
  return u < 0.5 ? easeInOut(u * 2) : 1 - easeInOut((u - 0.5) * 2);
}

/**
 * The start page's god rays at time `t` (s): each beam slowly sways about its
 * place, narrows and widens, and waxes and wanes. Writes (angle, width,
 * brightness) per beam to `out`, in radians from straight down.
 */
function beams(t: number, out: Float32Array) {
  for (let i = 0; i < 7; i++) {
    out[i * 3] = (i - 3) * 0.17 + 0.012 * Math.sin(t * (0.07 + 0.02 * i) + i * 2.1);
    out[i * 3 + 1] = 0.055 + 0.025 * Math.sin(i * 3.1 + 1.0) + 0.012 * Math.sin(t * 0.21 + i);
    out[i * 3 + 2] = 0.55 + 0.45 * Math.sin(t * (0.13 + 0.04 * i) + i * 1.3);
  }
}

// The drifting smoke (BLOBS, in lib/descent.ts): warm drifts plus one shadow
// through the middle; in a Delve each takes a colour of its stratum's.

const TAU = Math.PI * 2;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const wave = (lo: number, hi: number) => ({ w: TAU / rand(lo, hi), p: rand(0, TAU) });

/**
 * A blob's path: each coordinate is two sine waves with random periods and
 * phases, so every page load drifts differently and nothing visibly repeats.
 */
function blobPath(b: Blob) {
  const x1 = wave(40, 70), x2 = wave(17, 31);
  const y1 = wave(45, 80), y2 = wave(19, 37);
  const spin = rand(-1, 1) * (TAU / rand(90, 160));
  const turn = wave(20, 40);
  const pulse = wave(11, 23);
  const rot0 = rand(0, TAU);
  return (s: number) => [
    b.home[0] + b.wander[0] * (0.7 * Math.sin(s * x1.w + x1.p) + 0.3 * Math.sin(s * x2.w + x2.p)),
    b.home[1] + b.wander[1] * (0.7 * Math.sin(s * y1.w + y1.p) + 0.3 * Math.sin(s * y2.w + y2.p)),
    rot0 + s * spin + 0.4 * Math.sin(s * turn.w + turn.p),
    b.opacity * (0.75 + 0.25 * Math.sin(s * pulse.w + pulse.p)),
  ];
}

/** Less of the far city than this is drawn as none (uCityA). */
const CITY_TRACE = 0.002;

/**
 * Whether a scene shows any of Delve's own parts (the DELVE_ pieces of the
 * shaders): the stratum's smoke or uneven dark (and with them its
 * environments), the dark closing in with the depth (`close`) or the
 * question's clock (`pressure`), or the far city. None of them shows at the
 * surface's look, outside Delve, where the lean programs draw exactly what
 * Delve's would.
 */
export function delveScene(look: Pick<Look, 'dark' | 'mistK'>, close: number, pressure: number, city: number, vein = 0): boolean {
  // (The clock's dark is drawn either way from 0: a right answer's light is a little under it.)
  return look.dark > 0 || look.mistK > 0 || close !== 0 || pressure !== 0 || city >= CITY_TRACE || vein > 0;
}

/** The most device pixels the backdrop draws on a GPU too slow for more (see scale() in startBackdrop): a 1440p screen's. */
const MAX_PIXELS = 2560 * 1440;
/** The embers' halo in an Azurite Vein: azurite blue. */
const VEIN_EMBERS = [0.3, 0.62, 1];

/** Seconds Delve's parts take to come in, should its programs be ready only once its scene shows. */
const DELVE_IN_S = 1.2;
/** The idle moments a program is warmed in (see warmUp): true ones, however long they take to come; a timer's delay where there's no requestIdleCallback (Safari). */
const WARM_IDLE = { fallback: 50 };

/** The QA desk's S (see leaveUiToCss). */
let uiToCss = false;

/**
 * Leaves the UI's shadows and fills to CSS, or gives them back to the
 * backdrop, live: the QA desk's S, to see the two side by side in time.
 * Given back, they're taken over just as they are as the page starts.
 */
export function leaveUiToCss(on: boolean) {
  uiToCss = on;
}

let delveWanted = false;
let delveReadyNow = false;
const delveWaiters = new Set<() => void>();

/**
 * Delve is on its way (picked in the lobby, a Delve room joined or a run
 * picked up, or a page that shows it from the start): the backdrop builds
 * its Delve programs in the background, without blocking the page (see
 * buildPrograms in fx/gl.ts). Until they're ready, a Delve scene is drawn
 * without Delve's own parts, which then come in over a moment. Only the
 * first call does anything; the backdrop also calls it itself as soon as a
 * Delve scene shows.
 */
export function wantDelveBackdrop() {
  if (delveWanted) return;
  delveWanted = true;
  for (const f of delveWaiters) f();
}

/** Whether the running backdrop has Delve's programs ready (for scripts that measure or picture Delve's scenes). */
export const delveBackdropReady = () => delveReadyNow;

/**
 * Sets up the GPU side of 2D canvases, which the first one drawn to does
 * (the backdrop's drop shadows draw to them: backdropDropShadow.ts),
 * waiting on the GPU process: called before the backdrop gives the GPU its
 * shaders to build and its first frame to draw, it's quick; the first drop
 * shadow, a frame or so later, would wait behind all that (on a software
 * GPU, the best part of a second).
 */
function warm2d() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d')?.fillRect(0, 0, 1, 1);
}

/**
 * Gives a context back at once. A canvas let go of keeps its context (its
 * targets, the drawing buffer) until it's collected, and Safari collects
 * them late: the app shown afresh after a crash (Root.svelte) made a new one
 * each time beside the old ones, on a phone short of memory as it is.
 */
function letGo(gl: WebGL2RenderingContext): null {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return null;
}

/**
 * Whether an opaque WebGL canvas (alpha: false) stalls the page in this
 * browser: Chrome and the browsers built on it (Edge, Opera, Brave) on
 * Windows, which draw WebGL through Direct3D 11. There an opaque canvas's
 * buffers are made in a format Direct3D has to emulate, and making one holds
 * up the GPU process, and every frame on the page with it, for 25-85 ms at
 * 4K (a Chrome trace on an RTX 5070: SharedImageStub::OnCreateSharedImage on
 * the GPU process's main thread). The canvas makes them often: whenever the
 * backdrop draws faster for a while (a reveal), it needs more of them in
 * flight. With an alpha channel each is made in a few hundredths of a ms.
 * Elsewhere (Firefox, Safari, phones, Chrome on macOS and Linux) the canvas
 * stays opaque, which spares the compositor blending it with the page.
 */
export const opaqueCanvasStalls = (userAgent: string) => /Windows NT/.test(userAgent) && /Chrome\//.test(userAgent);

/** How many backdrops draw with WebGL now (one, but an old one's stop can come after a new one's start). */
let onWebgl = 0;
/** Whether the backdrop is drawn with WebGL now (not the CSS one: refused, failed or lost). */
export const backdropOnWebgl = () => onWebgl > 0;

/**
 * Starts rendering the backdrop into `canvas`, with the lean programs (its
 * first frame drawn at once: see begin); Delve's follow in the background
 * once Delve is on its way (wantDelveBackdrop). Returns a cleanup function,
 * or null when WebGL2 (with highp fragment floats) is unavailable. `onLost`
 * fires if the context is lost later, after the renderer has shut itself
 * down, so the caller can fall back to CSS.
 */
export function startBackdrop(canvas: HTMLCanvasElement, onLost: () => void): (() => void) | null {
  // (With an alpha channel where an opaque canvas stalls the page: see
  // opaqueCanvasStalls. Every pixel is drawn opaque all the same, the main
  // pass writing alpha 1.)
  const gl = canvas.getContext('webgl2', {
    alpha: opaqueCanvasStalls(globalThis.navigator?.userAgent ?? ''),
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
  });
  if (!gl) {
    // (The effects' overlay won't get one either: see prepare in fx/core.ts.)
    refuseWebgl2();
    return null;
  }
  // The canvas's size in CSS px, kept by the ResizeObserver below rather than
  // read every frame: read after anything on the page has changed (measure()'s
  // own data-bs-fill among them), it has the styles worked out again on the
  // spot, more than once a frame.
  let canvasW = canvas.clientWidth;
  let canvasH = canvas.clientHeight;
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!hp || hp.precision === 0) return letGo(gl);
  warm2d();
  // The main pass needs about FIXED_UNIFORMS fragment uniform vectors (every
  // one counted unpacked, the soft light's included where it is worked out
  // there) plus ELEMENT_UNIFORMS a UI element. WebGL2 guarantees 224, enough
  // for 4 elements; most desktop GPUs offer 1024 or more, and get 16.
  const maxElements = Math.max(4, Math.min(16, Math.floor((gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) - FIXED_UNIFORMS) / ELEMENT_UNIFORMS)));

  // On phones and tablets the backdrop-drawn shadows look worse than CSS's,
  // so there every element keeps its CSS shadow and the backdrop draws none.
  const cssShadows = matchMedia('(pointer: coarse)');
  // Beta, to find what makes frames slow (lib/switchedOff.ts): the UI's shadows and fills left to CSS;
  // the backdrop drawn once a second (and its shadows and fills left to CSS with it).
  const drawnSlowly = switchedOff('backdraw');
  const fillsToCss = drawnSlowly || switchedOff('fills');
  /** Whether the backdrop draws the UI's shadows and fills, or leaves them all to CSS; and whether it would but for the QA desk's S (programs are built as for that). */
  const mayDrawUi = () => !cssShadows.matches && !fillsToCss;
  const drawsUi = () => mayDrawUi() && !uiToCss;
  // What each frame costs the GPU, for the quality the backdrop and the
  // effects are drawn at (fx/gpuBudget.ts). (Not on phones and tablets: their
  // GPUs draw in tiles, later than a timer sees.)
  const timer = cssShadows.matches ? null : new GpuTimer(gl);

  // The lean programs, without Delve's parts (Delve's are built later, in
  // the background: see buildDelve), started first of all, so they build
  // while the rest is set up. The soft light (see smooth) gets a half-float
  // target of its own wherever the GPU can draw to one, which is nearly
  // everywhere; elsewhere the main pass works it out at every pixel. (An
  // 8-bit target would band.) Turning the extension on to find out for sure
  // takes the GPU process a while, so the programs for a target of its own
  // start as soon as the extension is offered, and are started afresh
  // without one should it fail after all.
  //
  // The UI's box shadows and fills take the shader compiler longer than all
  // the rest of the main pass (see the UI parts in frag), so with a target
  // to draw the scene into they're a pass of their own (uiFrag), built side
  // by side with it and the soft light (with KHR_parallel_shader_compile
  // the driver does that off the page's thread): the first paint waits for
  // the slowest, not for all of it in one. That's for the first paint
  // only: two full-screen passes and a half-float layer between them cost
  // the GPU more every frame than one, enough to show in a reveal's
  // frames, so once the page is idle the main pass with them all is built
  // in the background and takes over (see replaceLean). Where the backdrop draws
  // none of them (cssShadows) the main pass has none, and there's no UI
  // pass.
  const offered = !!gl.getSupportedExtensions()?.includes('EXT_color_buffer_float');
  let split = offered;
  /** Which of the UI's parts a main pass built now draws (see UiParts): the first frame's leaves the boxes to the UI pass, where it can (see begin). */
  const uiParts = (): UiParts => (!mayDrawUi() ? 'none' : 'all');
  const mainSource = (ui: UiParts): ProgramSource => ({ vs: VERT, fs: frag(maxElements, split, false, ui), label: "The backdrop's program" });
  const smoothSources = (): ProgramSource[] => (split ? [{ vs: VERT, fs: smoothFrag(false), label: "The backdrop's soft light program" }] : []);
  const uiSources = (ui: UiParts): ProgramSource[] => (ui === 'drops' ? [{ vs: VERT, fs: uiFrag(maxElements), label: "The backdrop's UI program" }] : []);
  let first: Pending;
  /** Which of the UI's parts the first frame's main pass draws. */
  let firstUi = 'all' as UiParts;
  const begin = () => {
    firstUi = split && uiParts() === 'all' ? 'drops' : uiParts();
    first = startPrograms(gl, [mainSource(firstUi), ...smoothSources(), ...uiSources(firstUi)]);
  };
  begin();
  /** A float target (see split): the soft light's, or the scene's for the UI pass. */
  const target = (unit: number, filter: number) => {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (ok) return { tex, fbo };
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return null;
  };
  let smoothTex: WebGLTexture | null = null;
  let smoothFbo: WebGLFramebuffer | null = null;
  // The UI pass's layer, for the main pass (unit 4), a texel per device pixel.
  let boxTex: WebGLTexture | null = null;
  let boxFbo: WebGLFramebuffer | null = null;
  if (offered && gl.getExtension('EXT_color_buffer_float')) {
    const soft = target(3, gl.LINEAR);
    const boxes = soft && target(4, gl.NEAREST);
    if (soft && boxes) {
      ({ tex: smoothTex, fbo: smoothFbo } = soft);
      ({ tex: boxTex, fbo: boxFbo } = boxes);
    } else if (soft) {
      gl.deleteFramebuffer(soft.fbo);
      gl.deleteTexture(soft.tex);
    }
  }
  if (offered && !smoothTex) {
    first!.cancel();
    split = false;
    begin();
  }
  let smoothW = 1;
  let smoothH = 1;
  let boxW = 1;
  let boxH = 1;

  // One triangle covering the viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const fx = new Float32Array(FX_UNIFORM);
  const fxK = new Float32Array(4);
  const stops = new Float32Array(9);
  /** The magma's flow's clock (s): it runs slower as the magma cools, and stops (see env_magma in shaders/effects.ts). */
  let magmaClock = 0;
  const blobColor = new Float32Array(BLOB_COUNT * 3);
  let dialog = 0;

  const el = {
    x: new Float32Array(maxElements * 4),
    y: new Float32Array(maxElements * 4),
    a: new Float32Array(maxElements * 4),
    b: new Float32Array(maxElements * 4),
    c: new Float32Array(maxElements * 4),
    d: new Float32Array(maxElements * 4),
    e: new Float32Array(maxElements * 4),
    geo: new Float32Array(maxElements * SHADOWS_PER_ELEMENT * 4),
    col: new Float32Array(maxElements * SHADOWS_PER_ELEMENT * 4),
  };
  const mk = {
    a: new Float32Array(MAX_MASKS * 4),
    b: new Float32Array(MAX_MASKS * 4),
    c: new Float32Array(MAX_MASKS * 4),
    d: new Float32Array(MAX_MASKS * 4),
    e: new Float32Array(MAX_MASKS * 4),
    off: new Float32Array(MAX_MASKS * 4),
    col: new Float32Array(MAX_MASKS * DROPS_PER_MASK * 4),
  };
  const shadowArrays = [...Object.values(el), ...Object.values(mk)];
  /** What only colours the elements' shadows and fills (see measure): their changes can wait for a 30fps frame. */
  const colourArrays = new Set<Float32Array>([el.c, el.d, el.e, el.col]);
  const prev = new Float32Array(shadowArrays.reduce((n, arr) => n + arr.length, 0));
  /** The drop-shadow atlases' sizes (uSharpSize, uBlurSize). */
  const atlasSize = new Float32Array([1, 1, 1, 1]);
  const lightA = new Float32Array(MAX_LIGHTS * 4);
  const lightC = new Float32Array(MAX_LIGHTS * 4);
  const mood = new Float32Array(4);
  const home = new Float32Array(4);
  const title = new Float32Array(4);
  const blobA = new Float32Array(BLOB_COUNT * 4);
  const blobRot = new Float32Array(BLOB_COUNT * 2);
  const beam = new Float32Array(7 * 3);

  /**
   * A main pass and the soft light's (or none: the main pass works it out),
   * lean or Delve's, with their uniforms' locations and what was last sent
   * to them (a uniform keeps its value in its program until set again).
   */
  function variant(prog: WebGLProgram, smoothProg: WebGLProgram | null, ui: UiParts = 'all') {
    const g = gl!;
    // The program that works out the soft light.
    const soft = smoothProg ?? prog;
    const S = (name: string) => g.getUniformLocation(soft, name);
    const U = (name: string) => g.getUniformLocation(prog, name);
    g.useProgram(soft);
    g.uniform3fv(S('uBlobB'), BLOBS.flatMap((b) => b.reach));
    g.useProgram(prog);
    // Drop-shadow atlases: unit 0 holds content alpha, unit 1 the blurred
    // alpha; the embers are on unit 2, the soft light on 3.
    g.uniform1i(U('uSharp'), 0);
    g.uniform1i(U('uBlur'), 1);
    g.uniform1i(U('uEmbers'), 2);
    g.uniform1i(U('uSmooth'), 3);
    g.uniform1i(U('uBoxes'), 4);
    const elLoc = {
      x: U('uElX'),
      y: U('uElY'),
      a: U('uElA'),
      b: U('uElB'),
      c: U('uElC'),
      d: U('uElD'),
      e: U('uElE'),
      geo: U('uShGeo'),
      col: U('uShCol'),
    };
    const mkLoc = Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'Off', 'Col'].map((k) => [k.toLowerCase(), U('uMk' + k)]));
    return {
      prog,
      smoothProg,
      soft,
      /** Which of the UI's shadows and fills it draws (see UiParts). */
      ui,
      sRes: S('uRes'),
      sSize: S('uSize'),
      sViewH: S('uViewH'),
      uTop: S('uTop'),
      uBottom: S('uBottom'),
      uGlow: S('uGlow'),
      uBaseStop: S('uBaseStop'),
      uBlobA: S('uBlobA'),
      uBlobRot: S('uBlobRot'),
      uBeams: S('uBeams'),
      uHome: S('uHome'),
      uTitle: S('uTitle'),
      uFloor: S('uFloor'),
      uHaze: S('uHaze'),
      uShade: S('uShade'),
      uMist: S('uMist'),
      uFx: S('uFx'),
      uFxK: S('uFxK'),
      uEddy: S('uEddy'),
      uDark: S('uDark'),
      uVein: S('uVein'),
      uGlowCol: S('uGlowCol'),
      uScene: S('uScene'),
      uBlobColor: S('uBlobColor'),
      uRes: U('uRes'),
      uSize: U('uSize'),
      uViewH: U('uViewH'),
      uVignette: U('uVignette'),
      uLightA: U('uLightA'),
      uLightC: U('uLightC'),
      uMood: U('uMood'),
      uEmberHalo: U('uEmberHalo'),
      uEmberCore: U('uEmberCore'),
      uEmberK: U('uEmberK'),
      uCityA: U('uCityA'),
      uCityB: U('uCityB'),
      uCityC: U('uCityC'),
      uIce: U('uIce'),
      // An Azurite Vein's, in the main pass too (it draws the whole soft light where no float target is to be had).
      mVein: U('uVein'),
      // The dark closing in dims the embers too (closing() in the shader).
      mDark: U('uDark'),
      mScene: U('uScene'),
      mHome: U('uHome'),
      uElCount: U('uElCount'),
      uDialog: U('uDialog'),
      uSharpSize: U('uSharpSize'),
      uBlurSize: U('uBlurSize'),
      // The shadow arrays this program draws (see sendList).
      sent: sendList([...(ui === 'all' ? Object.entries(el).map(([k, arr]) => ({ loc: elLoc[k as keyof typeof el], arr })) : []), ...Object.entries(mk).map(([k, arr]) => ({ loc: mkLoc[k], arr }))]),
      sentCount: -1,
    };
  }
  type Variant = ReturnType<typeof variant>;
  /**
   * Shadow arrays and their uniforms, with what each was last sent to the
   * GPU as, bit for bit: draw() sends only the arrays that changed. NaN bits
   * to begin with, so the first draw sends all.
   */
  function sendList(list: { loc: WebGLUniformLocation | null; arr: Float32Array }[]) {
    return list.map(({ loc, arr }) => ({ loc, arr, bits: new Uint32Array(arr.buffer, arr.byteOffset, arr.length), last: new Uint32Array(arr.length).fill(0x7fc00001) }));
  }
  /** The UI pass (uiFrag), with its uniforms' locations: the same one over the lean programs and Delve's. */
  function uiVariant(prog: WebGLProgram) {
    const g = gl!;
    const U = (name: string) => g.getUniformLocation(prog, name);
    const elLoc = { x: U('uElX'), y: U('uElY'), a: U('uElA'), b: U('uElB'), c: U('uElC'), d: U('uElD'), e: U('uElE'), geo: U('uShGeo'), col: U('uShCol') };
    return {
      prog,
      uRes: U('uRes'),
      uSize: U('uSize'),
      uDialog: U('uDialog'),
      uElCount: U('uElCount'),
      sent: sendList(Object.entries(el).map(([k, arr]) => ({ loc: elLoc[k as keyof typeof el], arr }))),
      sentCount: -1,
    };
  }

  // The lean programs, read: the first frame waits for them (see begin).
  const firstProgs = first!.read();
  if (!firstProgs) {
    console.warn('The backdrop goes to the CSS one.');
    return letGo(gl);
  }
  let lean: Variant = variant(firstProgs[0], split ? firstProgs[1] : null, firstUi);
  let ui = firstUi === 'drops' ? uiVariant(firstProgs[2]) : null;
  // Programs that take over from those drawing now, built in the
  // background: each set is built, then warmed (see warmUp), then takes
  // over in the next frame drawn (see draw), the programs it replaces let
  // go (see Successor). The lean main pass is replaced so once the page is
  // idle after the first paint: the first frame's two passes (see begin)
  // give way to one that draws the UI's parts itself, since two
  // full-screen passes and a half-float layer between them cost the GPU
  // more every frame than one, enough to show in a reveal's frames. And
  // where the backdrop drew none of the UI's parts but has come to (the
  // pointer changed), one with them takes over; CSS paints them meanwhile.
  // Failing, the first keeps its two passes, the second leaves the UI's
  // parts to CSS. Delve's are replaced the same way (see buildDelve). The
  // UI pass and its layer are let go once nothing drawn or coming needs
  // them (needsUiPass).
  type Successor = {
    /** Which of the UI's parts it draws, from the moment it's started; null while none is coming. */
    parts: UiParts | null;
    build: Build | null;
    /** Built: the programs, and those built for them (a soft light kept from the ones replaced isn't). */
    v: Variant | null;
    own: WebGLProgram[];
    /** Warmed: it takes over in the next frame drawn. */
    ready: boolean;
    /** Cancels what it waits on: the idle moment its build starts in, or its warming. */
    stop: (() => void) | null;
    /** Its warming's next step drawn now, in the frame (see warmUp), while it's being warmed. */
    hurry: (() => void) | null;
  };
  const successor = (): Successor => ({ parts: null, build: null, v: null, own: [], ready: false, stop: null, hurry: null });
  /** Whether nothing is coming for it, nor waits to start. */
  const quiet = (s: Successor) => !s.parts && !s.stop;
  /** Waits for an idle moment (`timeout` ms at most) to start `f`. */
  function whenPageIdle(s: Successor, f: () => void, timeout: number) {
    s.stop = whenIdle(
      () => {
        s.stop = null;
        if (!gl!.isContextLost()) f();
      },
      { timeout, fallback: 1000 },
    );
  }
  /** Builds `sources` into what takes over (`make` makes it of them), then warms it; `failed` hears if they don't build. */
  function succeed(s: Successor, parts: UiParts, sources: ProgramSource[], make: (progs: WebGLProgram[]) => Variant, failed: () => void, oneAtATime = false) {
    s.parts = parts;
    s.build = buildPrograms(
      gl!,
      sources,
      (progs) => {
        s.build = null;
        if (!progs) {
          s.parts = null;
          // (A lost context goes to the CSS backdrop by itself: see lost.)
          if (!gl!.isContextLost()) failed();
          return;
        }
        const v = make(progs);
        s.v = v;
        s.own = progs;
        const steps = [{ prog: v.prog, fbo: warmTarget() }];
        if (v.smoothProg && progs.includes(v.smoothProg)) steps.unshift({ prog: v.smoothProg, fbo: smoothFbo! });
        const w = warmUp(steps, () => {
          s.stop = s.hurry = null;
          s.ready = true;
          dirty = true;
        });
        s.stop = w.cancel;
        s.hurry = w.now;
      },
      oneAtATime,
    );
  }
  /** What took over from `was` (see succeed), the programs it replaces let go (but a soft light it keeps). */
  function adopt(s: Successor, was: Variant | null): Variant {
    const v = s.v!;
    if (was) {
      gl!.deleteProgram(was.prog);
      if (was.smoothProg && was.smoothProg !== v.smoothProg) gl!.deleteProgram(was.smoothProg);
    }
    Object.assign(s, successor());
    return v;
  }
  /** Whatever is coming for it given up, and let go. */
  function drop(s: Successor) {
    s.stop?.();
    s.build?.cancel();
    for (const p of s.own) gl!.deleteProgram(p);
    Object.assign(s, successor());
  }

  const leanNext = successor();
  let upgradeFailed = false;
  function replaceLean() {
    // (With whichever of the UI's parts the backdrop draws by now.)
    const parts = uiParts();
    const upgrading = lean.ui === 'none';
    succeed(leanNext, parts, [mainSource(parts)], (progs) => variant(progs[0], lean.smoothProg, parts), () => {
      if (!upgrading) return;
      upgradeFailed = true;
      console.warn("The backdrop leaves the UI's shadows and fills to CSS.");
    });
  }
  /** Whether a main pass drawn now or coming leaves its boxes to the UI pass. */
  const needsUiPass = () => lean.ui === 'drops' || delve?.ui === 'drops' || leanNext.parts === 'drops' || delveNext.parts === 'drops';
  /** The UI pass and its layer let go (see needsUiPass). */
  function letGoOfUiPass() {
    const g = gl!;
    g.deleteProgram(ui!.prog);
    ui = null;
    g.deleteFramebuffer(boxFbo);
    g.deleteTexture(boxTex);
    boxFbo = null;
    boxTex = null;
    boxW = boxH = 1;
    frameEvent('backdrop: one pass');
  }
  /**
   * Which of the UI's parts the backdrop can draw, whichever of its programs
   * draw the next frame: all, unless the lean ones or Delve's (once built)
   * have none. (Delve's are built with none where the backdrop draws none:
   * should the pointer change after that, CSS keeps them all.)
   */
  const uiNow = (): UiParts => (lean.ui === 'none' || delve?.ui === 'none' ? 'none' : 'all');
  // Delve's programs: built in the background once Delve is on its way
  // (wantDelveBackdrop), then warmed (see warmUp); then ready. Until then,
  // a Delve scene is drawn by the lean programs without Delve's parts,
  // which come in over a moment once they're ready (delveIn); while one
  // shows, their warming goes on a step a frame rather than waiting for
  // idle moments. Like the lean ones, they're built at first to leave the
  // UI's boxes to the UI pass, where it's still there (Delve wanted as the
  // page starts, a Delve link or a run picked up), since a main pass with
  // the boxes in it takes the driver several times as long to build (in a
  // trace on an RTX 5070, 1.6 s against 0.14 s for the slowest of the two
  // apart); then, once the page is idle, they give way
  // to ones that draw the boxes too (mergeDelve). If they fail to build,
  // the CSS backdrop takes over, as on a lost context, once a Delve scene
  // shows (the lean ones can't draw its dark): the start page keeps this
  // one.
  const delveNext = successor();
  let delve: Variant | null = null;
  let delveFailed = false;
  /** Whether the last frame was drawn by the lean programs in Delve's place. */
  let standIn = false;
  /** How far Delve's parts have come in (0 to 1) after the lean programs stood in for them. */
  let delveIn = 1;
  const delveSource = (parts: UiParts): ProgramSource => ({ vs: VERT, fs: frag(maxElements, !!smoothTex, true, parts), label: "Delve's backdrop program" });
  function buildDelve() {
    if (delve || !quiet(delveNext) || delveFailed || gl!.isContextLost()) return;
    // (Where the backdrop draws none of the UI's parts, Delve's has none
    // either, see uiNow.)
    const parts: UiParts = ui && uiParts() === 'all' ? 'drops' : uiParts();
    const sources = [delveSource(parts)];
    if (smoothTex) sources.unshift({ vs: VERT, fs: smoothFrag(true), label: "Delve's backdrop soft light program" });
    succeed(
      delveNext,
      parts,
      sources,
      (progs) => (smoothTex ? variant(progs[1], progs[0], parts) : variant(progs[0], null, parts)),
      () => {
        delveFailed = true;
        console.warn("Delve's backdrop goes to the CSS one once Delve shows.");
      },
      true,
    );
  }
  /** Delve's main pass that leaves the boxes to the UI pass giving way to one that draws them too (see buildDelve), its soft light kept. Failing, it keeps the two passes. */
  function mergeDelve() {
    if (delve?.ui !== 'drops') return;
    const parts = uiParts();
    const smooth = delve.smoothProg;
    succeed(delveNext, parts, [delveSource(parts)], (progs) => variant(progs[0], smooth, parts), () => {}, true);
  }

  // A texel of the drawing buffer's own kind (8-bit RGBA), off the page,
  // for a main pass to be warmed into (see warmUp): a renderbuffer, so no
  // texture unit's binding changes.
  let warmFbo: WebGLFramebuffer | null = null;
  function warmTarget() {
    if (warmFbo) return warmFbo;
    const g = gl!;
    const rb = g.createRenderbuffer();
    g.bindRenderbuffer(g.RENDERBUFFER, rb);
    g.renderbufferStorage(g.RENDERBUFFER, g.RGBA8, 1, 1);
    g.bindRenderbuffer(g.RENDERBUFFER, null);
    warmFbo = g.createFramebuffer();
    g.bindFramebuffer(g.FRAMEBUFFER, warmFbo);
    g.framebufferRenderbuffer(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.RENDERBUFFER, rb);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    return warmFbo;
  }
  /**
   * Programs drawn once each, a texel's worth, before any frame uses them,
   * each in an idle moment of its own; then `done` (in one more). A
   * program's first draw is when the browser has the GPU's driver finish
   * it (on Windows, Direct3D builds the shader it really runs then, should
   * the one it built with the program not fit), and that holds up the GPU
   * process, and every frame on the page with it: the bigger the program,
   * the longer. In a true idle moment it holds up only one when nothing
   * moves but the backdrop's slow breathing: they're waited for however
   * long it takes, since what they replace draws the same picture
   * meanwhile. `now` draws the next step at once instead (a Delve scene
   * showing while Delve's are warmed: see draw). Each is drawn into the
   * target it draws to, or one of the same kind (warmTarget), so that
   * what's built is what the frame will use; and none of it shows, the
   * drawing buffer untouched (the next frame draws the soft light afresh).
   */
  function warmUp(steps: { prog: WebGLProgram; fbo: WebGLFramebuffer }[], done: () => void): { cancel: () => void; now: () => void } {
    let i = 0;
    let stopIdle = () => {};
    const next = () => {
      // (Drawn now, the idle moment waited for isn't.)
      stopIdle();
      if (gl!.isContextLost()) return;
      if (i === steps.length) return done();
      const g = gl!;
      const { prog, fbo } = steps[i++];
      g.useProgram(prog);
      g.bindFramebuffer(g.FRAMEBUFFER, fbo);
      g.viewport(0, 0, 1, 1);
      g.drawArrays(g.TRIANGLES, 0, 3);
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      // (Sent at once, so it's built in this moment, not with the next frame.)
      g.flush();
      stopIdle = whenIdle(next, WARM_IDLE);
    };
    stopIdle = whenIdle(next, WARM_IDLE);
    return { cancel: () => stopIdle(), now: next };
  }

  // Drop-shadow atlases: unit 0 holds content alpha, unit 1 the blurred alpha.
  const texture = (unit: number, filter: number) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return t;
  };
  const sharpTex = texture(0, gl.LINEAR);
  const blurTex = texture(1, gl.LINEAR);

  // Ember positions by screen tile, one float texel each (unit 2).
  const emberTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, emberTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SLOTS, TILES, 0, gl.RGBA, gl.FLOAT, null);
  const paths = BLOBS.map(blobPath);

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // With the visual effects switched off (in the settings) the backdrop
  // holds still too, where it stands, and is only drawn when something
  // changes: the low-power mode, for phones that run hot. (Reduced motion
  // goes further and rests everything.)
  const calm = () => reduceMotion.matches || !fxUserOn();
  /** The backdrop's own clock (ms): it stops while calm(). */
  let clock = 0;
  let raf = 0;
  let last = -Infinity;
  let lastStep = performance.now();

  /** The question's clock as the dark last drawn shows it (lib/darkness.ts). */
  let pressure = 0;
  /** How far an Azurite Vein's scene has come in (lib/vein.ts). */
  let vein = 0;
  /** Draws a frame, timed on the GPU where it can be. */
  function draw() {
    if (timer) timer.time(canvas.width * canvas.height, drawUntimed);
    else drawUntimed();
  }
  function drawUntimed() {
    // Every gradient breathes on its own cycle; the periods share no common
    // factor, so the combined motion takes hours to repeat. Reduced motion
    // freezes them all (and the blobs and embers) at rest; the effects
    // switched off freeze them where they are.
    const still = reduceMotion.matches;
    const ms = still ? 0 : clock;
    const glow = still ? 0 : breathe(ms, 9000);
    const bottom = still ? 0 : breathe(ms, 13000, 0.3);
    const top = still ? 0 : breathe(ms, 17000, 0.6);
    const vignette = still ? 0 : breathe(ms, 23000, 0.15);
    const base = still ? 0 : breathe(ms, 29000, 0.8);
    const cssW = canvasW;
    const cssH = canvasH;
    const scene = currentDescent();
    const look = scene.look;
    // A plunge draws the dark in and lets it go again as the scene sinks.
    const close = Math.min(1, scene.close + 0.12 * Math.max(sinking.breath, sinking.slideBreath));
    const sink = sinking.sink * viewH;
    const slide = sinking.slide * viewH;
    const city = look.env[CITY];

    // Which programs draw it: Delve's while any of Delve's parts show, once
    // they're ready; else the lean ones (the same picture without them).
    const deep = delveScene(look, close, pressure, city, vein);
    if (deep && delveFailed) return lost();
    if (deep) wantDelveBackdrop();
    // (A Delve scene showing before Delve's programs are warmed: the next
    // step now, in the frame, rather than in an idle moment.)
    if (deep && !delve) delveNext.hurry?.();
    if (leanNext.ready) lean = adopt(leanNext, lean);
    if (delveNext.ready) {
      const first = !delve;
      delve = adopt(delveNext, delve);
      if (first) delveReadyNow = true;
      if (delve.ui === 'drops') whenPageIdle(delveNext, mergeDelve, 3000);
    }
    if (ui && !needsUiPass()) letGoOfUiPass();
    const v = deep && delve ? delve : lean;
    if (v === lean) standIn = deep;
    else if (standIn) {
      standIn = false;
      delveIn = reduceMotion.matches ? 1 : 0;
    }
    // Delve's parts coming in, after the lean programs stood in for them:
    // each of them scaled from none (the lean picture) to all of it. (The
    // lean programs have none to scale; but the vignette, which gives way
    // to the stratum's dark, keeps all of itself while that isn't drawn.)
    const k = v === lean ? 1 : delveIn;
    const dark = v === lean ? 0 : delveIn * look.dark;
    const { soft, prog, smoothProg, sRes, sSize, sViewH, uTop, uBottom, uGlow, uBaseStop, uBlobA, uBlobRot, uBeams, uHome, uTitle, uFloor, uHaze, uShade, uMist, uFx, uFxK, uEddy, uDark, uVein, uGlowCol, uScene, uBlobColor } = v;
    const { uRes, uSize, uViewH, uVignette, uLightA, uLightC, uMood, uEmberHalo, uEmberCore, uEmberK, uCityA, uCityB, uCityC, uIce, mVein, mDark, mScene, mHome, uDialog, uSharpSize, uBlurSize } = v;

    // The soft light: into its own target first, or along with the rest.
    gl!.useProgram(soft);
    gl!.uniform2f(sSize, cssW, cssH);
    gl!.uniform1f(sViewH, viewH);
    // Delve: the stratum's look (the surface's outside one): its light from
    // below, haze, lamp, smoke, and dark.
    gl!.uniform4f(uFloor, look.floor[0] / 255, look.floor[1] / 255, look.floor[2] / 255, look.floorK);
    gl!.uniform3f(uHaze, look.haze[0] / 255, look.haze[1] / 255, look.haze[2] / 255);
    gl!.uniform4f(uShade, look.shade[0], look.shade[1], look.shade[2], look.dark * k);
    gl!.uniform4f(uMist, look.mist[0] / 255, look.mist[1] / 255, look.mist[2] / 255, look.mistK * k);
    // Its environments, a slot each with their strength and colours, and
    // the magma's cooling and its flow's clock; and the dark closing in
    // with the depth and the clock.
    packFx(fx, fxK, scene, still ? 0 : magmaClock);
    if (k < 1) for (let i = 0; i < FX_SLOTS; i++) fx[i * 12 + 3] *= k;
    gl!.uniform4fv(uFx, fx);
    gl!.uniform4fv(uFxK, fxK);
    gl!.uniform4fv(uEddy, embers.eddies);
    gl!.uniform2f(uDark, close * k, pressure * k);
    if (uVein) gl!.uniform1f(uVein, vein * k);
    gl!.uniform3f(uGlowCol, look.glow[0] / 255, look.glow[1] / 255, look.glow[2] / 255);
    gl!.uniform4f(uScene, scene.light * look.lightK, sink, scene.features, slide);
    gl!.uniform2f(uGlow, 1 + 0.08 * glow, (1 - 0.4 * glow) * look.lamp);
    gl!.uniform2f(uBottom, (1 + 0.1 * bottom) * look.floorH, 1 + 0.3 * bottom);
    gl!.uniform2f(uTop, 1 + 0.08 * top, (1 + 0.35 * top) * look.hazeK);
    // Each drift of smoke takes one of the stratum's colours (the shadow keeps its own).
    for (let i = 0; i < BLOBS.length; i++) {
      const smoke = smokeOf(look, i);
      for (let c = 0; c < 3; c++) blobColor[i * 3 + c] = smoke[c] / 255;
    }
    gl!.uniform3fv(uBlobColor, blobColor);
    gl!.uniform1f(uBaseStop, 0.6 - 0.08 * base);
    paths.forEach((path, i) => blobA.set(path(still ? 0 : ms / 1000), i * 4));
    for (let i = 0; i < BLOB_COUNT; i++) blobA[i * 4 + 3] *= i < 4 ? look.smokeK : look.shadowK;
    for (let i = 0; i < BLOB_COUNT; i++) {
      blobRot[i * 2] = Math.cos(blobA[i * 4 + 2]);
      blobRot[i * 2 + 1] = Math.sin(blobA[i * 4 + 2]);
    }
    gl!.uniform4fv(uBlobA, blobA);
    gl!.uniform2fv(uBlobRot, blobRot);
    home[2] = still ? 0 : ms / 1000;
    home[3] = 0.86 + 0.14 * Math.sin(home[2] * 0.55);
    beams(home[2], beam);
    gl!.uniform4fv(uHome, home);
    gl!.uniform3fv(uBeams, beam);
    gl!.uniform4fv(uTitle, title);
    if (smoothProg) {
      const w = Math.max(1, Math.ceil(cssW / SMOOTH_PX));
      const h = Math.max(1, Math.ceil(cssH / SMOOTH_PX));
      if (w !== smoothW || h !== smoothH) {
        smoothW = w;
        smoothH = h;
        gl!.activeTexture(gl!.TEXTURE3);
        gl!.bindTexture(gl!.TEXTURE_2D, smoothTex);
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA16F, w, h, 0, gl!.RGBA, gl!.HALF_FLOAT, null);
      }
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, smoothFbo);
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(sRes, w, h);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.useProgram(prog);
      gl!.uniform2f(uSize, cssW, cssH);
      gl!.uniform1f(uViewH, viewH);
    }

    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform2f(uRes, canvas.width, canvas.height);
    // Deep down the stratum's uneven dark takes over from the vignette, so
    // its ellipse never shows.
    gl!.uniform2f(uVignette, 1 - 0.06 * vignette, (1 + 0.07 * vignette) * (1 - 0.6 * dark));
    gl!.uniform2f(uSharpSize, atlasSize[0], atlasSize[1]);
    gl!.uniform2f(uBlurSize, atlasSize[2], atlasSize[3]);
    // The UI's shadows and fills (those this pass draws).
    send(v);
    gl!.uniform4fv(uLightA, lightA);
    gl!.uniform4fv(uLightC, lightC);
    gl!.uniform4fv(uMood, mood);
    if (uDialog) gl!.uniform1f(uDialog, dialog);
    gl!.uniform4fv(uEmberHalo, embers.halo);
    gl!.uniform3fv(uEmberCore, embers.core);
    gl!.uniform2f(uEmberK, calm() ? 0.6 : 1, embers.streak);
    // The city's far lights and the frost's glints, drawn here, in their colours.
    stopsFor(look, 'city', stops);
    gl!.uniform4f(uCityA, stops[3], stops[4], stops[5], city < CITY_TRACE ? 0 : city * k);
    gl!.uniform4f(uCityB, stops[0], stops[1], stops[2], home[2]);
    gl!.uniform4f(uCityC, stops[6], stops[7], stops[8], toneOf(look, CITY).vary);
    stopsFor(look, 'frost', stops);
    gl!.uniform3f(uIce, stops[0] + 0.35 * (1 - stops[0]), stops[1] + 0.35 * (1 - stops[1]), stops[2] + 0.35 * (1 - stops[2]));
    gl!.uniform2f(mDark, close * k, pressure * k);
    if (mVein) gl!.uniform1f(mVein, vein * k);
    gl!.uniform4f(mScene, scene.light * look.lightK, sink, scene.features, slide);
    gl!.uniform4fv(mHome, home);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, emberTex);
    // Only the slots in use, and the empty one that ends the fullest row: the
    // shader reads no further in any row, and every row's own end is in them.
    const cols = Math.min(SLOTS, embers.usedMax + 1);
    gl!.pixelStorei(gl!.UNPACK_ROW_LENGTH, SLOTS);
    gl!.texSubImage2D(gl!.TEXTURE_2D, 0, 0, 0, cols, TILES, gl!.RGBA, gl!.FLOAT, embers.data);
    gl!.pixelStorei(gl!.UNPACK_ROW_LENGTH, 0);
    const boxes = v.ui === 'drops' ? ui : null;
    if (boxes) {
      // The UI pass first, into its layer, which the main pass lays over the scene.
      gl!.useProgram(boxes.prog);
      gl!.uniform2f(boxes.uRes, canvas.width, canvas.height);
      gl!.uniform2f(boxes.uSize, cssW, cssH);
      gl!.uniform1f(boxes.uDialog, dialog);
      send(boxes);
      gl!.activeTexture(gl!.TEXTURE4);
      gl!.bindTexture(gl!.TEXTURE_2D, boxTex);
      if (canvas.width !== boxW || canvas.height !== boxH) {
        boxW = canvas.width;
        boxH = canvas.height;
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA16F, boxW, boxH, 0, gl!.RGBA, gl!.HALF_FLOAT, null);
      }
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, boxFbo);
      // With no boxes, an empty layer: cleared, not shaded pixel by pixel.
      if (boxes.sentCount > 0) gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      else gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.useProgram(prog);
    }
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  /** Sends a pass the shadow arrays whose bits changed since they were last sent to it, and how many elements there are. */
  function send(pass: { sent: ReturnType<typeof sendList>; uElCount: WebGLUniformLocation | null; sentCount: number }) {
    for (const { loc, arr, bits, last } of pass.sent) {
      let same = true;
      for (let i = 0; i < bits.length; i++) {
        if (bits[i] !== last[i]) {
          same = false;
          break;
        }
      }
      if (same) continue;
      gl!.uniform4fv(loc, arr);
      last.set(bits);
    }
    if (!pass.uElCount) return;
    let count = 0;
    for (let i = 0; i < maxElements; i++) if (el.b[i * 4 + 3] > 0) count = i + 1;
    if (count !== pass.sentCount) gl!.uniform1i(pass.uElCount, (pass.sentCount = count));
  }

  // Measures the shadowed elements and says what changed since last time:
  // 'now' when something must be drawn in this very frame (an element moved
  // or changed size, or a shadow or fill was handed between CSS and the
  // backdrop, which CSS stops or starts painting this frame), 'paced' when
  // only colours changed (a fill or shadow easing to another colour), which
  // 30fps draws as well, or false. On phones and tablets there's nothing to
  // measure: everything is let go to CSS once, and nothing changes until the
  // pointer does. `parts` is which of the UI's parts the backdrop can draw
  // (see uiNow): none, and they're let go to CSS too.
  let released = false;
  function measure(parts: UiParts): 'now' | 'paced' | false {
    let atlases: ReturnType<typeof measureDrops> = null;
    if (!drawsUi() || parts === 'none') {
      if (released) return false;
      released = true;
      // (What was last drawn is now these zeros too: measured again later,
      // values that happen to equal those from before still count.)
      for (const arr of shadowArrays) arr.fill(0);
      prev.fill(0);
      releaseAll();
      releaseAllDrops();
      return 'now';
    } else {
      released = false;
      measureShadows(maxElements, el.x, el.y, el.a, el.b, el.c, el.d, el.e, el.geo, el.col, canvasW, canvasH);
      atlases = measureDrops(mk.a, mk.b, mk.c, mk.d, mk.e, mk.off, mk.col, canvasW, canvasH);
    }
    let changed: 'now' | 'paced' | false = false;
    if (atlases) {
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, sharpTex);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, atlases.sharp);
      atlasSize[0] = atlases.sharp.width;
      atlasSize[1] = atlases.sharp.height;
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, blurTex);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, atlases.blurW, atlases.blurH, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, atlases.blur);
      atlasSize[2] = atlases.blurW;
      atlasSize[3] = atlases.blurH;
      frameEvent('backdrop: drop shadows upload');
      changed = 'now';
    }
    let k = 0;
    for (const arr of shadowArrays) {
      const colour = colourArrays.has(arr);
      for (let i = 0; i < arr.length; i++, k++) {
        if (prev[k] === arr[i]) continue;
        // A colour easing is paced; one coming or going (a fill's kind, a shadow's alpha from or to 0) is a handover.
        const handover = !colour || (arr === el.c ? i % 4 === 0 : arr === el.col ? i % 4 === 3 && (prev[k] === 0 || arr[i] === 0) : false);
        prev[k] = arr[i];
        if (handover) changed = 'now';
        else changed ||= 'paced';
      }
    }
    return changed;
  }

  // Shadows and fills must track their elements every frame (hover,
  // transitions, scrolling), and lights and a changing mood tint animate
  // quickly, so any of those draws at once. Otherwise the backdrop's own
  // motion only needs 30fps (its quickest cycle is a slow 9s breath and the
  // embers drift a few pixels a frame), and while calm() nothing is drawn
  // until something changes.
  let dirty = false;
  /** A change held back for the 30fps pace (see frame()). */
  let owed = false;
  let wasDescending = false;
  // Calls that wait on the GPU process (whenGpuCaughtUp in fx/gl.ts), and
  // the fence after the last frame drawn before they asked: nothing new is
  // drawn (the last frame stays up) until the GPU has passed it, which is
  // asked without waiting, once a frame. Then they run, and the GPU has
  // nothing to finish first. One that asks once the fence is in waits for
  // the next (`later`): what it asked of the GPU just before (a program
  // to link) may come after this one.
  let catchingUp = new Set<() => void>();
  let later = new Set<() => void>();
  let fence: WebGLSync | null = null;
  const holdFor = (f: () => void) => {
    (fence ? later : catchingUp).add(f);
    return () => {
      if (!catchingUp.delete(f)) later.delete(f);
      // (None left for this fence: it's let go, so the next to ask gets a fresh one.)
      if (fence && !catchingUp.size) nextFence();
    };
  };
  /** Drops the fence; those that came after it wait for the next. Returns those it held. */
  function nextFence() {
    if (fence) gl!.deleteSync(fence);
    fence = null;
    const held = catchingUp;
    catchingUp = later;
    later = new Set();
    return held;
  }
  /** The fence has passed: what it held runs (with `everyone`, as the backdrop stops, what waits for the next too). */
  function caughtUp(everyone = false) {
    const now = [...nextFence(), ...(everyone ? nextFence() : [])];
    for (const f of now) {
      try {
        f();
      } catch (e) {
        console.warn(e);
      }
    }
  }
  /** One frame of the backdrop (timed for the beta's frame meter). */
  const frame = (now: number) => timed('backdrop', frameUntimed, now);
  function frameUntimed(now: number) {
    raf = requestAnimationFrame(frame);
    backdropFrame(now, timer?.read() ?? null);
    // (The backdrop come to draw the UI's parts after all: the pointer changed.)
    if (lean.ui === 'none' && quiet(leanNext) && !upgradeFailed && mayDrawUi()) replaceLean();
    if (catchingUp.size) {
      // (The backdrop's clock holds still meanwhile.)
      lastStep = now;
      if (!fence && !gl!.isContextLost()) {
        fence = gl!.fenceSync(gl!.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl!.flush();
        if (fence) return;
      }
      if (fence && gl!.getSyncParameter(fence, gl!.SYNC_STATUS) !== gl!.SIGNALED && !gl!.isContextLost()) return;
      caughtUp();
      return;
    }
    // (A frame's time can come before the last one's; it never runs backwards here.)
    const dt = Math.max(0, Math.min(0.1, (now - lastStep) / 1000));
    const still = calm();
    if (!still) {
      clock += 1000 * dt;
      // (The magma flows as fast as it is hot: slower as it cools, still once it has.)
      magmaClock += dt * (1 - currentDescent().cool);
    }
    lastStep = now;
    const nowS = now / 1000;
    const lights = packLights(lightA, lightC, nowS);
    const moodState = stepMood(dt, mood);
    const homeMoving = stepHomeScene(dt, home, title);
    // Lights and mood step once per animation frame; draw() uses the latest values.
    // A mood holding steady (the victory's gold, a deathmatch's red) changes
    // nothing, so it is just drawn along with everything else: at 30fps, or
    // while calm only when something changes. On phones, where this
    // full-screen shader is the costliest thing on screen and runs under the
    // effects overlay, lights and an easing mood need no more than 30fps
    // either.
    // Delve's depth eases in; holding still, it changes at once (it is game information).
    const descending = still ? snapDescent() : stepDescent(dt);
    // The dark of a question's clock eases in and out by itself: drawn at
    // 30fps with everything else, or, holding still, in steps of a fiftieth.
    const p = pressureLevel(now);
    if (p !== pressure && (Math.abs(p - pressure) > (still ? 0.02 : 0.002) || p === 0)) {
      pressure = p;
      if (still) dirty = true;
    }
    // An Azurite Vein's scene eases in and out by itself, as the dark does.
    const vn = veinLevel(now, still);
    if (vn !== vein) {
      vein = vn;
      dirty = true;
    }
    embers.descend(currentDescent(), targetDescent());
    // A new depth dealt: the scene sinks a little further (plunge in descent.ts),
    // the embers and glints carried up with the walls; never while holding still.
    const sunk = sinking.sink;
    if (stepPlunge(now, !still)) {
      const px = (sinking.sink - sunk) * viewH;
      if (Math.abs(px) < viewH) embers.rise(px, canvasH);
      dirty = true;
    }
    embers.streak = Math.min(1.6, 2 * sinking.speed);
    // Dynamite blasted a question away: the scene swings sideways (swing in descent.ts), the embers carried with it.
    const slid = sinking.slide;
    if (stepSwing(now, !still)) {
      const px = (sinking.slide - slid) * viewH;
      if (Math.abs(px) < viewH) embers.slide(px, canvasW);
      dirty = true;
    }
    // Arrived at a depth: the embers still in the old colour take the new one (after a rejoin, all of them).
    if (wasDescending && !descending) embers.recolor();
    wasDescending = descending;
    // A depth easing in is a slow change of colour: 30fps is plenty. Holding
    // still, the one frame it changes in must be drawn.
    if (still && descending) dirty = true;
    const soft = lights || moodState === 'moving';
    if (!still) embers.step(dt, canvasW, canvasH, !fxActive());
    else if (descending) embers.step(0, canvasW, canvasH, true, true);
    // A dialog's dimming fades in and out with the dialog, in step with the UI's.
    const d = openDialog().amount;
    const fading = d !== dialog;
    dialog = d;
    // Delve's parts coming in once its programs are ready (see delveIn).
    if (delveIn < 1) {
      delveIn = Math.min(1, delveIn + dt / DELVE_IN_S);
      dirty = true;
    }
    // What must be drawn now: the UI's shadows and fills moving with it, the
    // start page's scene, a dialog's dimming, the scene sinking or swinging,
    // Delve's parts coming in. Lights, a mood easing and colours changing
    // under the UI are slow enough for 30fps on every screen: a right
    // answer's reveal (its light, its fills and glows easing to green and
    // gold) would otherwise redraw this pass every frame, along with the
    // effects overlay's own.
    const measured = measure(uiNow());
    // A colour measured now isn't measured as changed again (measure() takes
    // it as drawn), and a light or mood easing may stop in a frame held back:
    // either is owed a frame, at the 30fps pace.
    if (measured || soft) owed = true;
    if (drawnSlowly && now - last < 1000) return;
    const urgent = measured === 'now' || dirty || homeMoving || fading;
    if (!urgent && ((still && !owed) || now - last < 33)) return;
    last = now;
    dirty = false;
    owed = false;
    draw();
  }

  const onMotionChange = () => (dirty = true);

  // Size the drawing buffer to the exact device pixels the canvas covers.
  // Any mismatch makes the browser resample the canvas, which smears the dither.
  // The device-pixel box is exact where supported (it includes pixel snapping
  // at fractional ratios), but it's ignored when it disagrees with the ratio by
  // more than snapping could explain, as it does under DPR emulation.
  //
  // Phones and tablets are the exception: there the backdrop draws no crisp
  // fills or shadows (see cssShadows), just soft light, and their screens run
  // at 2-3 device pixels per CSS px, so it renders at one pixel per CSS px
  // and is scaled up: a ninth of the work on a 3x screen, for a canvas
  // redrawn 30 times a second for as long as the page is open. The grain is
  // per CSS px anyway, the embers are soft glows, and the dither still hides
  // every band.
  //
  // And on a GPU too slow for a big screen, never more than MAX_PIXELS: on
  // a weak one a 4K screen's 8 million device pixels (or more) made this
  // full-screen pass, drawn under the effects overlay's own, too much in a
  // reveal, and frames came a tenth of a second late. Which GPU is too slow
  // is measured (fx/gpuBudget.ts: what this pass and the effects' cost it),
  // and as the effects come down from full resolution so does this
  // (fxScaledDown); a GPU that keeps up draws every pixel, exact. Past a
  // 1440p screen's worth, scaled down, it's about one pixel per CSS px or a
  // little more, which the crisp fills and shadows (under the UI's own 1px
  // borders) still hold to.
  // (Nor wider or taller than the GPU can draw: a window across several screens.)
  const most = maxDrawSize(gl);
  const scaleAt = (down: boolean) => {
    if (cssShadows.matches && devicePixelRatio > 1) return 1 / devicePixelRatio;
    const device = canvasW * canvasH * devicePixelRatio * devicePixelRatio;
    const k = device > MAX_PIXELS && down ? Math.sqrt(MAX_PIXELS / device) : 1;
    return Math.min(k, most / Math.max(1, canvasW * devicePixelRatio), most / Math.max(1, canvasH * devicePixelRatio));
  };
  const scale = () => scaleAt(fxScaledDown());
  /** The device pixels drawn at the effects' quality `q` (see fx/gpuBudget.ts). */
  const pixelsAt = (q: number) => {
    const k = scaleAt(q > 0);
    return Math.round(canvasW * devicePixelRatio * k) * Math.round(canvasH * devicePixelRatio * k);
  };

  // The canvas is as tall as the viewport with a phone's toolbars hidden, but
  // the scene is laid out for the height with them showing (--view-h in
  // app.css): constant while they slide, so nothing moves, and centred on
  // what's visible while they show. A hidden probe measures that height.
  const viewProbe = document.createElement('div');
  viewProbe.setAttribute('aria-hidden', 'true');
  viewProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:var(--view-h);visibility:hidden;pointer-events:none';
  document.body.append(viewProbe);
  let viewH = 1;
  const measureView = () => {
    const h = viewProbe.offsetHeight;
    // (Read, not canvasH: viewRo can run before ro has kept a new size.)
    const ch = canvas.clientHeight;
    viewH = Math.max(1, h > 0 ? Math.min(h, ch) : ch);
  };
  const viewRo = new ResizeObserver(() => {
    const before = viewH;
    measureView();
    if (viewH !== before) draw();
  });
  viewRo.observe(viewProbe);

  // The canvas's CSS size as last seen, unrounded, and its device-pixel box
  // where the browser gives one: the buffer is fitted to them anew when the
  // canvas resizes, and when the effects come down from full resolution or
  // go back up (scale()).
  let cssW = canvasW;
  let cssH = canvasH;
  let box: ResizeObserverSize | undefined;
  const fit = () => {
    const k = scale();
    const estW = cssW * devicePixelRatio;
    const estH = cssH * devicePixelRatio;
    const b = box;
    const exact = k === 1 && b && Math.abs(b.inlineSize - estW) <= 2 && Math.abs(b.blockSize - estH) <= 2;
    const w = exact ? b.inlineSize : Math.round(estW * k);
    const h = exact ? b.blockSize : Math.round(estH * k);
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    measureView();
    draw();
  };
  const ro = new ResizeObserver(([entry]) => {
    canvasW = Math.round(entry.contentRect.width);
    canvasH = Math.round(entry.contentRect.height);
    cssW = entry.contentRect.width;
    cssH = entry.contentRect.height;
    box = entry.devicePixelContentBoxSize?.[0];
    fit();
  });
  // (Followed once the first frame is drawn: see below.)
  let offScale = () => {};
  try {
    ro.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    ro.observe(canvas);
  }

  // An Azurite Vein's embers burn azure, and take their own colours back as it ends.
  const offVein = onVein((on) => {
    embers.tint(on ? VEIN_EMBERS : CALM);
    embers.vein(on);
  });
  // (Counted in onWebgl once its frames have begun; stop can come twice: lost, then the caller's.)
  let counted = false;
  function stop() {
    if (counted) onWebgl--;
    counted = false;
    offVein();
    cancelAnimationFrame(raf);
    // (Delve's build first: it would otherwise go ahead below, and finish.)
    delveWaiters.delete(buildDelve);
    drop(leanNext);
    drop(delveNext);
    if (delve) {
      gl!.deleteProgram(delve.prog);
      if (delve.smoothProg) gl!.deleteProgram(delve.smoothProg);
    }
    delve = null;
    delveReadyNow = false;
    // Whatever waited on the GPU goes ahead without the backdrop.
    setGpuCatchUp(null);
    caughtUp(true);
    ro.disconnect();
    offScale();
    setBackdropPixels(null);
    timer?.dispose();
    viewRo.disconnect();
    viewProbe.remove();
    canvas.removeEventListener('webglcontextlost', lost);
    reduceMotion.removeEventListener('change', onMotionChange);
    offFx();
    releaseAll();
    releaseAllDrops();
    letGo(gl!);
  }

  // A lost context stays lost: we don't call preventDefault(), so the browser
  // won't restore it, and the caller switches to the CSS backdrop for good.
  // Tear everything down so nothing keeps drawing into the dead context.
  function lost() {
    stop();
    onLost();
  }
  canvas.addEventListener('webglcontextlost', lost);
  reduceMotion.addEventListener('change', onMotionChange);
  const offFx = onFxChange(onMotionChange);
  // Delve's programs, as soon as Delve is on its way (now, if it already is).
  delveWaiters.add(buildDelve);
  if (delveWanted) buildDelve();

  // Paint the first frame now, before the page is first painted (the CSS
  // backdrop isn't there behind it: see Background.svelte). Should that
  // throw, everything set up so far is taken down again before the caller
  // hears of it and turns to the CSS backdrop.
  // (What a past visit found the GPU to cost may set the quality first.)
  setBackdropPixels(pixelsAt, !!timer?.available);
  try {
    canvas.width = Math.max(1, Math.round(canvasW * devicePixelRatio * scale()));
    canvas.height = Math.max(1, Math.round(canvasH * devicePixelRatio * scale()));
    embers.step(0, canvasW, canvasH);
    measureView();
    measure(uiNow());
    draw();
  } catch (e) {
    stop();
    throw e;
  }
  // Only now, with frames to come, does anything wait on them.
  setGpuCatchUp(holdFor);
  offScale = onFxScale(fit);
  raf = requestAnimationFrame(frame);
  if (lean.ui === 'drops') whenPageIdle(leanNext, replaceLean, 3000);
  onWebgl++;
  counted = true;

  return stop;
}

/**
 * The shaders' sources, for a compile and link check: the vertex shader, the
 * soft light's, the main pass with it split off (split, with the UI pass,
 * ui, after it) and without (whole, everything in one), and both with none
 * of the UI's parts (bare); the lean ones, or with `delve` Delve's. (And the
 * split main pass with everything in it, which isn't drawn, for checking
 * the UI pass takes only its part.)
 */
export const backdropShaders = (maxElements: number, delve = false) => ({
  vert: VERT,
  smooth: smoothFrag(delve),
  split: frag(maxElements, true, delve, 'drops'),
  ui: uiFrag(maxElements),
  whole: frag(maxElements, false, delve, 'all'),
  bareSplit: frag(maxElements, true, delve, 'none'),
  bareWhole: frag(maxElements, false, delve, 'none'),
  splitAll: frag(maxElements, true, delve, 'all'),
});
