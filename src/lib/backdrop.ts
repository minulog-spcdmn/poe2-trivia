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
import { fxActive, fxUserOn, onFxChange } from './fx/core';
import { COLUMNS, GLINT_COLOR, PALETTE, ROWS, SIZE_STRIDE, SLOTS, TILES, embers } from './backdropEmbers';
import { BLOBS, ENV, ENVIRONMENTS, HUE_SATURATION, currentDescent, sinking, smokeOf, snapDescent, stepDescent, stepPlunge, targetDescent, type Blob } from './descent';
import { pressureLevel } from './darkness';
import { DIALOG_BLUR, DIALOG_DIM, openDialog } from './behindDialog';

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const BLOB_COUNT = 5;
/** The vectors the scene's environments take (four to a vec4), and a name in the shader for each. */
const ENV_VECS = Math.ceil(ENV / 4);
const ENV_DEFINES = ENVIRONMENTS.map((name, i) => `#define E_${name.toUpperCase()} uEnv[${i >> 2}].${'xyzw'[i & 3]}`).join('\n');
/** The magma's index (its flow's clock runs slower as it cools; see uFx). */
const MAGMA = ENVIRONMENTS.indexOf('magma');

/**
 * The backdrop's soft light: the base gradient, its haze and glows, the
 * blobs, and the start page's rays and title glow. Nothing in it changes over
 * less than several CSS px, so where the GPU can draw to a float target it
 * is drawn at SMOOTH_PX CSS px per texel and filtered up (see startBackdrop):
 * on a 2x screen that's a sixteenth of the pixels, for most of the
 * backdrop's own arithmetic. Embers, grain, shadows, fills and the dither
 * stay per pixel.
 */
const SMOOTH = `
uniform vec2 uSize;  // canvas size, CSS pixels
uniform float uViewH; // the height the scene is laid out for, CSS pixels (see viewH)

// Breathing, driven from JS: each is (scale, strength).
uniform vec2 uTop;
uniform vec2 uBottom;
uniform vec2 uGlow;
uniform float uBaseStop;

// Blobs. A: centre (fractions of the viewport), rotation, opacity.
// B: reach ahead of / behind the centre along the rotated axis, and across
// it, in units of sqrt(W * H). Unequal reaches make each blob lopsided. (B
// never changes, so it is a constant here: uniform space is tight.)
uniform vec4 uBlobA[${BLOB_COUNT}];
uniform vec2 uBlobRot[${BLOB_COUNT}]; // (cos, sin) of A's rotation
const vec3 BLOB_B[${BLOB_COUNT}] = vec3[${BLOB_COUNT}](${BLOBS.map((b) => `vec3(${b.reach.map((v) => v.toFixed(3)).join(', ')})`).join(', ')});
uniform vec3 uBlobColor[${BLOB_COUNT}];

// Delve's stratum (lib/descent.ts; the surface's look outside one): the light
// from below (rgb, strength), the haze's colour, the dark's hue (rgb) and how
// much of the hall its uneven dark swallows, and smoke of the stratum's
// colour (rgb, strength).
uniform vec4 uFloor;
uniform vec3 uHaze;
uniform vec4 uShade;
uniform vec4 uMist;
// How far each of the scene's environments has come in (ENVIRONMENTS in
// lib/descent.ts, four to a vec4, each named E_ and its name below); where
// the void's two eddies turn (x, y each, fractions of the screen; the
// embers swirl round the same); the magma's own clock (s; it runs slower as
// the magma cools, and stops), two spare, and how far the stratum's palette
// is turned round the colour wheel (radians, past 100); and the dark
// closing in from the edges: (depth, the question's clock).
uniform vec4 uEnv[${ENV_VECS}];
${ENV_DEFINES}
uniform vec4 uEddy;
uniform vec4 uFx;
uniform vec2 uDark;
// The glow in the middle's colour (the surface's gold, a stratum's own).
// And in one vector (uniform space is tight, see maxElements): how bright
// the stratum's light is drawn (descent.ts's light times the stratum's
// own, lightK: so the scene only ever darkens deeper down); how far the
// scene has sunk (CSS px; each new depth sinks it, see plunge in
// descent.ts): the smoke's and each layer's noise is read that much further
// down, the nearer the more; and how bright the stratum's features burn
// (descent.ts's features).
uniform vec3 uGlowCol;
uniform vec3 uScene;
#define uLight uScene.x
#define uSink uScene.y
#define uFeatures uScene.z

// The start page: (rays, title glow, time in s, title breath), and the
// title's centre and half size (CSS px). See setHomeScene in lights.ts.
uniform vec4 uHome;
uniform vec4 uTitle;
// The god rays' beams: (angle, width, brightness) each, from the time in uHome
// (see beams() below; they're the same for every pixel, so worked out once a
// frame).
uniform vec3 uBeams[7];

vec3 rgb(float r, float g, float b) { return vec3(r, g, b) / 255.0; }

float gauss(float d) { return exp(-d * d); }

// Value noise for Delve's smoke and dark: smooth, with no direction or
// shape of its own. (Hash without sine, Dave Hoskins.)
float nhash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nhash(i), nhash(i + vec2(1.0, 0.0)), f.x), mix(nhash(i + vec2(0.0, 1.0)), nhash(i + 1.0), f.x), f.y);
}

float fbm(vec2 x) { return 0.5 * vnoise(x) + 0.3 * vnoise(x * 2.03 + 11.7) + 0.2 * vnoise(x * 4.1 - 5.3); }
// Ridged noise: 1 along the winding seams where the noise crosses its middle.
float ridge(vec2 x) { return 1.0 - abs(2.0 * vnoise(x) - 1.0); }
// The smallest of three or four distances, smoothly, so no crease runs in
// from the corners.
float smin3(float a, float b, float c, float k) { return -k * log(exp(-a / k) + exp(-b / k) + exp(-c / k)); }

// 1 below a, 0 above b, smoothly (a < b).
float under(float a, float b, float x) { return 1.0 - smoothstep(a, b, x); }

// Past 100 a stratum's palette is turned round the colour wheel (hueOf in
// lib/descent.ts, which turns the hall's colours); the features' own
// colours are turned as far by this (set in environments()).
mat3 HUE = mat3(1.0);
vec3 hue(float r, float g, float b) { return max(rgb(r, g, b) * HUE, 0.0); }
vec3 hueV(vec3 c) { return max(c * HUE, 0.0); }

// A row of stone trunks, cw (S) apart, at x (S from the middle) and world
// height y (S): how much of a trunk stands here, and where across it it is
// (-1 to 1). Each stays inside its own cell, so no edge shows between them.
float trunkRow(float x, float y, float cw, float seed, out float across) {
  float c = floor(x / cw);
  float h = nhash(vec2(c, seed));
  float hw = cw * (0.14 + 0.1 * h);
  float cx = (c + 0.5 + 0.2 * (h - 0.5)) * cw + 0.05 * cw * (2.0 * vnoise(vec2(y * 1.3, c * 3.7 + seed)) - 1.0);
  across = (x - cx) / hw;
  return step(0.2, h) * under(0.9, 1.04, abs(across));
}

// A row of broken towers, cw (S) apart, at x (S from the middle) and world
// height y (S): how much of a tower stands here, and how near its edge
// (for the rim the rift lights). Each column of the row is tier on tier of
// ruin down the chasm: a tower broken off at a jagged top, or narrowing to
// a spire, then a gap where the rest fell, then the next.
float towerRow(float x, float y, float cw, float seed, out float edge) {
  float c = floor(x / cw);
  float fx = x / cw - c - 0.5;
  float h = nhash(vec2(c, seed));
  float hw = 0.12 + 0.2 * h;
  float seg = 1.4 + 0.8 * h;
  float tier = floor(y / seg + h);
  float v = fract(y / seg + h) * seg;
  float ht = nhash(vec2(c + 17.0 * tier, seed + 3.0));
  float top = 0.1 + 0.5 * ht;
  float spire = step(0.62, ht);
  float jag = (0.05 * (vnoise(vec2(fx * 14.0 + c * 3.0, tier)) - 0.5) + 0.05 * (ht - 0.5) * fx / hw) * (1.0 - spire);
  float w = hw * mix(1.0, clamp((v - top) / 0.4, 0.04, 1.0), spire);
  // A ledge every so often, a little wider.
  w *= 1.0 + 0.12 * step(0.86, fract(v * 2.6 + h));
  float body = under(w - 0.03, w + 0.02, abs(fx)) * smoothstep(top - 0.012, top + 0.012, v + jag) * step(0.15, h);
  edge = body * smoothstep(w - 0.09, w, abs(fx));
  return body;
}

// Delve's scenes (see ENVIRONMENTS in lib/descent.ts): each stratum is a
// few layers, back to front: the wall, far silhouettes, the features
// between, the foreground and the air, one variant to each, coloured by
// the stratum's palette (its glow, mist and light from below) where they
// aren't their own. All are noise and soft-edged silhouettes, slowly moving
// like the rest of the backdrop; each layer is carried up past you at its
// own pace as the scene sinks, the nearer the faster. How much of one shows
// (0 to 1) is how far it has come, not how faint it is: each arrives in its
// own way and dies down the same way (the lamps kindle one by one, the
// cracks heat up and cool, the frost grows in from the walls, silhouettes
// loom out of the dark), so two never sit on top of each other half-faded.
// And what each adds to the scene's brightness grows steadily as it comes,
// never all at the end, so the scene's light can make way for it evenly
// (ENV_ADD in lib/descent.ts). What glows burns at its own brightness
// (lit); what a feature lays over the hall in a colour of its own (frost,
// fog, stone) is lit by the hall's light (uLight), as the hall is.
// p in CSS px, xy = fractions of the screen, tm the clock (s).
vec3 environments(vec3 col, vec2 p, vec2 xy, float S, float W, float H, float tm, float dark) {
  // What glows still shows through the dark closing in, dimmed (and burns a
  // little less the deeper).
  float lit = (1.0 - 0.8 * dark) * uFeatures;
  float side = 1.0 - smoothstep(0.0, 0.3, min(xy.x, 1.0 - xy.x));
  // How far from the nearer side wall (a share of the width, 0 to 0.5), and which wall it is.
  float xs = min(xy.x, 1.0 - xy.x);
  float wall = step(0.5, xy.x);
  if (uFx.w != 0.0) {
    float c = cos(uFx.w);
    float s = sin(uFx.w);
    mat3 r = mat3(
      0.213 + 0.787 * c - 0.213 * s, 0.715 - 0.715 * c - 0.715 * s, 0.072 - 0.072 * c + 0.928 * s,
      0.213 - 0.213 * c + 0.143 * s, 0.715 + 0.285 * c + 0.14 * s, 0.072 - 0.072 * c - 0.283 * s,
      0.213 - 0.213 * c - 0.787 * s, 0.715 - 0.715 * c + 0.715 * s, 0.072 + 0.928 * c + 0.072 * s);
    mat3 l = mat3(0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722);
    HUE = ${HUE_SATURATION.toFixed(3)} * r + (1.0 - ${HUE_SATURATION.toFixed(3)}) * l;
  }
  // Where the walls stand, and the features between (S units, carried up as the scene sinks).
  vec2 qw = (p + vec2(0.0, 0.6 * uSink)) / S;
  vec2 q = (p + vec2(0.0, uSink)) / S;
  // Shared between the layers: the rock's seams (the lamps catch them), how
  // much of a far silhouette stands here (what grows on stone clings to
  // it), and the colossi's carved rings (the glyphs gather on them).
  float seam = 0.0;
  float solid = 0.0;
  float ring = 0.0;

  // ---- The wall ----

  // The Mines: the rock's seams running across, catching the lamps' light.
  if (E_SEAMS > 0.0) {
    vec2 wq = qw + 0.25 * vec2(vnoise(qw * 1.3 + 2.0), vnoise(qw * 1.3 + 9.0));
    seam = E_SEAMS * pow(ridge(vec2(wq.x * 1.4, wq.y * 7.0)), 6.0);
    col *= 1.0 - 0.3 * seam;
    col += lit * hue(90.0, 50.0, 22.0) * seam * 0.04;
  }

  // Fungal Caverns: mycelium webbing the damp rock, fine pale strands
  // thickest at the walls and the ceiling, the rock between darker with the
  // wet. It spreads in from the walls as it comes, and withdraws to them.
  if (E_MYCELIUM > 0.0) {
    float e = E_MYCELIUM;
    vec2 mq = qw * 8.0 + 0.7 * vec2(vnoise(qw * 1.7 + 1.0), vnoise(qw * 1.7 + 7.0));
    float strands = pow(ridge(mq), 16.0) + 0.6 * pow(ridge(mq * 2.3 + 5.0), 20.0);
    float reach = max(side, under(0.0, 0.45, xy.y));
    float grow = smoothstep(0.0, 0.35, e * (0.4 + 0.6 * reach) - 0.3 * vnoise(qw * 2.2 + 4.0) + 0.1);
    float web = min(1.0, strands) * grow * (0.35 + 0.65 * reach);
    col *= 1.0 - 0.12 * e * reach;
    col = mix(col, hue(104.0, 108.0, 94.0) * uLight, 0.2 * web);
    col += lit * hue(120.0, 150.0, 136.0) * web * 0.02;
  }

  // Vaal Outpost: walls of fitted stone blocks, worn and broken away in
  // places, the joints dark and the faces catching the gold light, more of
  // it toward the walls. It is uncovered as it comes, and wears away as it goes.
  if (E_MASONRY > 0.0) {
    float e = E_MASONRY;
    vec2 bq = qw * vec2(7.0, 14.0);
    float row = floor(bq.y);
    bq.x += 0.5 * mod(row, 2.0) + 0.3 * nhash(vec2(row, 1.0));
    vec2 bf = fract(bq);
    float joint = max(under(0.0, 0.05, min(bf.x, 1.0 - bf.x)), under(0.0, 0.1, min(bf.y, 1.0 - bf.y)));
    float face = nhash(floor(bq) + 7.0);
    float k = (0.35 + 0.65 * side) * smoothstep(0.3, 0.6, vnoise(qw * 5.0 + 3.0) + 0.3 * (e - 1.0)) * e;
    col *= 1.0 - k * (0.4 * joint + 0.12 * face);
    col += lit * uGlowCol * k * (1.0 - joint) * (0.004 + 0.006 * face);
  }

  // ---- Far silhouettes ----

  // The Mines: the shaft's timbering, posts along the walls and crossbeams
  // between them, dark against the lamplight, passing up as you sink. They
  // loom out of the dark as it comes, and fade back into it as it goes.
  if (E_TIMBERS > 0.0) {
    float e = smoothstep(0.0, 0.6, E_TIMBERS);
    float yw = (p.y + 0.8 * uSink) / S;
    float x = (xs + 0.003 * (vnoise(vec2(yw * 4.0, wall * 5.0)) - 0.5)) * W / S;
    float a = 0.035 * W / S;
    float b = 0.11 * W / S;
    float post = max(under(0.016, 0.022, abs(x - a)), 0.8 * under(0.012, 0.017, abs(x - b)));
    float v = fract(yw / 0.85 + 0.37 * wall);
    float beam = under(0.018, 0.026, abs(v - 0.5) * 0.85) * under(b + 0.01, b + 0.03, x);
    float t = max(post, beam) * e;
    col = mix(col, col * 0.2, 0.85 * t);
    // The posts' faces toward the hall catch the light from below.
    col += lit * uFloor.rgb * uFloor.a * post * smoothstep(0.0, 0.016, x - a) * smoothstep(0.3, 1.0, xy.y) * 0.08 * e;
    solid = max(solid, t);
  }

  // Frozen Hollow: icicles hanging in fringes from ledges in the walls,
  // pale and clear, catching the light at their edges, thickest toward the
  // walls. They grow longer as it comes, and melt back as it goes.
  if (E_ICICLES > 0.0) {
    float e = E_ICICLES;
    float yw = (p.y + 0.5 * uSink) / S;
    float L = 0.9;
    float tier = floor(yw / L);
    float v = yw - tier * L;
    float cx = p.x / S * 34.0;
    float c = floor(cx);
    float h = nhash(vec2(c, tier));
    float f = fract(cx) - 0.5 - 0.2 * (nhash(vec2(c, tier + 3.0)) - 0.5);
    float len = (0.03 + 0.22 * h * h) * e * (0.25 + 0.75 * side);
    float wdt = 0.36 * (1.0 - v / max(len, 0.001));
    float ice = step(v, len) * under(wdt - 0.12, wdt, abs(f));
    float ledge = under(0.0, 0.025, v) * (0.3 + 0.7 * side) * smoothstep(0.0, 0.4, e);
    col = mix(col, col * 0.4, 0.7 * ledge);
    col = mix(col, hue(110.0, 150.0, 190.0) * uLight * 0.35, 0.45 * ice);
    col += lit * hue(200.0, 230.0, 255.0) * ice * under(0.0, 0.1, abs(f + 0.12)) * 0.06;
    solid = max(solid, ice);
  }

  // Vaal Outpost: a ruined arcade either side, storey on storey of pillars
  // and arches dark against the haze, a bay broken through here and there,
  // the middle open. It looms out of the haze as it comes.
  if (E_ARCHES > 0.0) {
    float e = smoothstep(0.0, 0.7, E_ARCHES);
    float yw = (p.y + 0.3 * uSink) / S;
    float u = (p.x - 0.5 * W) / S / 0.3;
    float bi = floor(u);
    float bx = fract(u);
    float L = 0.75;
    float st = floor(yw / L);
    float v = fract(yw / L);
    float ax = (bx - 0.5) / 0.38;
    float opening = v > 0.5 ? under(0.97, 1.03, abs(ax)) : under(0.97, 1.03, length(vec2(ax, (v - 0.5) / 0.28)));
    // A bay fallen through, its pillars still standing.
    float fallen = step(0.72, nhash(vec2(bi, st))) * smoothstep(0.1, 0.2, min(bx, 1.0 - bx));
    float stone = (1.0 - opening) * (1.0 - fallen) * smoothstep(0.12, 0.32, abs(xy.x - 0.5)) * e;
    col = mix(col, col * 0.35, 0.75 * stone);
    solid = max(solid, stone);
  }

  // Petrified Forest: colossal trunks of stone in two rows, the far ones
  // paler in the haze; round, their bark furrowed, lit from the side the
  // light falls from and sheened like opal where it does, under a stone
  // canopy the light breaks through. They loom out of the haze as it comes,
  // and fade back into it as it goes.
  if (E_TRUNKS > 0.0) {
    float e = smoothstep(0.0, 0.8, E_TRUNKS);
    float x = (p.x - 0.5 * W) / S;
    float af;
    float far = trunkRow(x, (p.y + 0.18 * uSink) / S, 0.3, 11.0, af);
    col = mix(col, uMist.rgb * uLight * 0.3, 0.3 * far * e);
    float an;
    float yw = (p.y + 0.4 * uSink) / S;
    float near = trunkRow(x + 0.11, yw, 0.55, 3.0, an);
    float round_ = sqrt(max(0.0, 1.0 - an * an));
    float facing = clamp(0.5 - 0.6 * an, 0.0, 1.0);
    float bark = ridge(vec2(an * 6.0 + 3.0 * floor(x / 0.55), yw * 0.8));
    vec3 stone = rgb(16.0, 17.0, 20.0) * uLight * (0.3 + 0.7 * round_ * facing) * (0.7 + 0.3 * bark);
    col = mix(col, stone, 0.92 * near * e);
    // Opal: a pale sheen running through teal, violet and gold where the light falls.
    float film = 2.2 * vnoise(vec2(an * 1.5 + yw * 0.6, yw * 1.4)) + an;
    vec3 opal = mix(vec3(0.8), 0.5 + 0.5 * cos(6.2832 * (film + vec3(0.0, 0.33, 0.67))), 0.45);
    float sheen = pow(round_ * facing, 3.0) * smoothstep(0.4, 0.75, vnoise(vec2(an * 2.0, yw * 3.0 + 5.0)));
    col += lit * hueV(opal) * sheen * near * e * 0.07;
    // The canopy: stone boughs closing overhead, the light breaking through.
    float canopy = under(0.0, 0.3, xy.y) * smoothstep(0.35, 0.6, fbm(vec2(x * 3.0, yw * 3.0)));
    col *= 1.0 - 0.6 * canopy * e;
    solid = max(solid, near * e);
  }

  // Abyssal City: broken towers and fallen spires in two rows, the far row
  // lost in the smoke, the near one black against the glow of the rift
  // below, its edges lit by it. They loom out of the smoke as it comes.
  if (E_TOWERS > 0.0) {
    float e = smoothstep(0.0, 0.8, E_TOWERS);
    float x = (p.x - 0.5 * W) / S;
    float ef;
    float far = towerRow(x + 0.07, (p.y + 0.15 * uSink) / S, 0.16, 5.0, ef);
    col = mix(col, uMist.rgb * uLight * 0.5, 0.55 * far * e);
    float en;
    float near = towerRow(x, (p.y + 0.3 * uSink) / S, 0.27, 9.0, en);
    col = mix(col, rgb(6.0, 5.0, 9.0) * uLight, 0.9 * near * e);
    col += lit * uFloor.rgb * en * smoothstep(0.3, 1.0, xy.y) * 0.08 * e;
    solid = max(solid, near * e);
  }

  // Primeval Ruins: the ruins of an age before all others. Far off through
  // the haze, a gate of colossal scale, two pillars and a lintel with a pale
  // light beyond it; and near, either side, columns as great, fluted, banded
  // by carved rings, their inner edges lit from above. They loom out of the
  // haze as it comes, and fade back into it as it goes.
  if (E_COLOSSI > 0.0) {
    float e = smoothstep(0.0, 0.8, E_COLOSSI);
    float gx = abs(p.x - 0.5 * W) / S;
    float gv = fract((p.y + 0.1 * uSink) / S / 2.4 + 0.3) * 2.4;
    float gate = max(under(0.075, 0.085, abs(gx - 0.42)), under(0.17, 0.19, gv) * under(0.55, 0.6, gx));
    float through = under(0.25, 0.36, gx) * smoothstep(0.19, 0.5, gv);
    col += lit * uGlowCol * through * 0.025 * e * (0.6 + 0.4 * (1.0 - xy.y));
    col = mix(col, uMist.rgb * uLight * 0.15, 0.6 * gate * e);
    float yw = (p.y + 0.3 * uSink) / S;
    float sc = clamp(W / S, 0.7, 1.2);
    float rv = fract(yw / 1.1 + 0.2 * wall) * 1.1;
    float band = under(0.045, 0.06, abs(rv - 0.3));
    float a = (xs - 0.085) * W / S / (0.06 * sc * (1.0 + 0.18 * band));
    float column = under(0.92, 1.04, abs(a));
    float round_ = sqrt(max(0.0, 1.0 - a * a));
    float facing = clamp(0.4 + 0.6 * a, 0.0, 1.0);
    float flute = 0.75 + 0.25 * cos(a * 20.0) * (1.0 - band);
    col = mix(col, rgb(14.0, 17.0, 17.0) * uLight * (0.3 + 0.7 * round_ * facing) * flute, 0.93 * column * e);
    col += lit * uGlowCol * pow(round_ * facing, 6.0) * column * e * 0.03;
    solid = max(solid, column * e);
    ring = band * column * e;
  }

  // ---- The features between ----

  // The Mines: lamps hung along the walls, each a warm pool that gutters,
  // the seams catching their light, carried up with the timbering as you
  // sink (and round again below). They kindle one by one, and gutter out the same way.
  if (E_LAMPS > 0.0) {
    float e = E_LAMPS;
    float lamps = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float y = mod((0.3 + 0.45 * fract(fi * 0.618 + 0.1)) * H - 0.8 * uSink + 0.45 * H, 1.9 * H) - 0.45 * H;
      vec2 at = vec2((i < 2 ? 0.05 + 0.06 * fi : 0.87 + 0.06 * (fi - 2.0)) * W, y);
      vec2 d = (p - at) / S;
      float gutter = (0.7 + 0.3 * vnoise(vec2(tm * 2.6, fi * 7.0))) * smoothstep(0.2 * fi, 0.2 * fi + 0.4, e);
      lamps += gutter * gauss(length(d) / (0.16 * (0.7 + 0.6 * vnoise(d * 5.0 + fi * 3.1))));
    }
    col += lit * hue(255.0, 140.0, 50.0) * min(1.2, lamps) * (0.06 + 0.14 * seam);
  }

  // Magma Fissure: cracks glowing through the rock, branching as they
  // climb and brightest low down, the light pulsing up them and the heat
  // shimmering over them. A crack is where a warped noise crosses its
  // middle: jagged, like a coastline, never closed into a shape. How far it
  // has come is how hot it is: coming, the cracks open as dark seams and
  // heat up; dying down they cool the way magma does, glowing orange to dull
  // red to a dark crust with embers still in it to black-grey rock, their
  // flow slowing to a stop (its clock, uFx.x, runs slower as they cool).
  if (E_MAGMA > 0.0) {
    float e = E_MAGMA;
    float hot = clamp((e - 0.25) / 0.75, 0.0, 1.0);
    float warm = smoothstep(0.1, 0.55, e) * (1.0 - hot);
    float rock = smoothstep(0.0, 0.2, e);
    float ft = uFx.x;
    vec2 m = vec2(q.x * 4.0, q.y * 2.0);
    m += 0.4 * vec2(vnoise(m * 0.7 + 4.0), vnoise(m * 0.7 - 2.0));
    m.x += 0.04 * hot * (vnoise(vec2(q.x * 9.0, q.y * 6.0 + ft * 1.4)) - 0.5);
    float n1 = fbm(m);
    float n2 = fbm(m * 1.9 + 7.7);
    float open = 0.35 + 0.65 * smoothstep(0.0, 0.6, e);
    float c1 = clamp(1.0 - abs(n1 - 0.5) * 9.0 / open, 0.0, 1.0);
    float c2 = clamp(1.0 - abs(n2 - 0.5) * 12.0 / open, 0.0, 1.0) * under(0.0, 0.15, abs(n1 - 0.5)) * smoothstep(0.3, 0.8, e);
    float crack = c1 * c1 * c1 + 0.8 * c2 * c2 * c2;
    float low = 0.25 + 0.75 * smoothstep(0.1, 1.0, xy.y) + 0.3 * side;
    float flow = 0.35 + 0.65 * vnoise(vec2(m.x * 1.2, m.y * 1.6 + ft * 0.4));
    float heat = crack * low * flow;
    // The crust: dark seams where it has cooled, and black-grey rock once it has.
    col *= 1.0 - 0.5 * rock * (1.0 - hot) * c1 * c1;
    col = mix(col, rgb(22.0, 20.0, 20.0) * uLight, 0.35 * rock * under(0.15, 0.55, e) * c1);
    // The glow, dull red cooling from orange; white-hot only at its hottest; embers left in the crust.
    vec3 glow = mix(hue(150.0, 22.0, 6.0), hue(255.0, 74.0, 16.0), hot);
    float specks = smoothstep(0.72, 0.92, vnoise(m * 7.0 + 3.0)) * c1;
    col += lit * (glow * heat * 0.45 * sqrt(hot)
      + hue(255.0, 215.0, 140.0) * heat * heat * heat * 0.45 * smoothstep(0.7, 1.0, e)
      + hue(150.0, 18.0, 4.0) * under(0.0, 0.2, abs(n1 - 0.5)) * 0.1 * low * flow * hot
      + hue(170.0, 36.0, 10.0) * specks * warm * 0.25);
  }

  // Frozen Hollow: frost creeping in from the walls and the ceiling, a
  // feathered rim of ice needles grown along three directions, as ice
  // grows, catching the light here and there, and a cold glitter in the air.
  // It creeps in from the walls as it comes, and withdraws to them as it goes.
  if (E_FROST > 0.0) {
    float e = E_FROST;
    float fe = smin3(p.x / S, (W - p.x) / S, 1.2 * p.y / S, 0.05);
    float rim = smoothstep(0.0, 0.2, 0.24 * e + 0.28 * (fbm(q * 2.6 + 1.7) - 0.5) - fe) * smoothstep(0.0, 0.3, e);
    float needles = 0.0;
    for (int i = 0; i < 3; i++) {
      float a = float(i) * 2.0944 + 0.35;
      vec2 dir = vec2(cos(a), sin(a));
      vec2 u = vec2(dot(q, dir), dot(q, vec2(-dir.y, dir.x)));
      needles = max(needles, vnoise(vec2(u.x * 16.0, u.y * 70.0) + float(i) * 13.0));
    }
    // In patches, thickest at the rim, and thinning out into the hall.
    float patches = smoothstep(0.45, 0.75, fbm(q * 3.2 + 4.0));
    float cr = smoothstep(0.74, 0.98, needles) * patches * rim * (0.5 + 0.5 * vnoise(q * 9.0));
    // The glitter: tiny points of light, one in some cells of a grid, each
    // twinkling to its own beat (thresholded noise would glint in squares).
    vec2 g = q * 40.0;
    vec2 cell = floor(g);
    float h = nhash(cell + 5.3);
    vec2 f = fract(g) - 0.3 - 0.4 * vec2(nhash(cell + 1.7), nhash(cell + 9.1));
    float tw = 0.5 + 0.5 * sin(tm * (0.8 + 1.5 * h) + h * 50.0);
    float glitter = step(0.72, h) * exp(-dot(f, f) / 0.012) * tw * tw * (0.3 + cr);
    col = mix(col, hue(96.0, 130.0, 170.0) * uLight, lit * (rim * (0.08 + 0.07 * patches) + 0.25 * cr));
    col += lit * hue(215.0, 238.0, 255.0) * (rim + 0.2 * e) * glitter * 0.45;
  }

  // Fungal Caverns: a sickly light in the damp, pale cold patches of
  // bioluminescence low along the walls and the floor, threaded with
  // glowing strands, each patch waxing and waning slowly; never bright, never
  // a green of its own. They kindle from their hearts as it comes, and fade
  // the same way as it goes.
  if (E_BLOOM > 0.0) {
    float e = E_BLOOM;
    float place = 0.2 + 0.8 * max(side, smoothstep(0.35, 1.0, xy.y));
    float pocket = smoothstep(0.62 - 0.14 * e, 0.8, fbm(q * 2.2 + vec2(3.3, tm * 0.004))) * place;
    float beat = 0.6 + 0.4 * sin(tm * 0.35 + 6.283 * vnoise(q * 1.1 + 8.0));
    float threads = pow(ridge(q * 11.0 + 0.5 * vec2(vnoise(q * 3.0), vnoise(q * 3.0 + 5.0))), 10.0);
    col += lit * e * pocket * beat * (hue(70.0, 128.0, 120.0) * 0.2 + hue(170.0, 180.0, 150.0) * threads * 0.3);
  }

  // Abyssal Depths: the void coiling round two slow eddies (the embers
  // swirl round the same), torn violet tendrils with the dark between them.
  // Each arm is the noise read round a circle about the eddy, turned by the
  // log of the distance; toward the centre that circle shrinks with the
  // square of the distance, so the arms draw together into a calm, dark eye
  // instead of winding ever tighter into a point. The eddies open out from
  // their centres as they come, and close in on them as they go.
  if (E_VOID > 0.0) {
    float e = E_VOID;
    float v = 0.0;
    float near = 0.0;
    float size = 0.16 * (0.3 + 0.7 * e) * (0.3 + 0.7 * e);
    for (int i = 0; i < 2; i++) {
      vec2 c = (i == 0 ? uEddy.xy : uEddy.zw) * vec2(W, H);
      vec2 d = (p - c) / S;
      d += 0.12 * vec2(vnoise(q * 3.0 + float(i) * 7.0), vnoise(q * 3.0 + 4.0 + float(i) * 7.0)) - 0.06;
      float r2 = dot(d, d);
      float r = sqrt(r2);
      float eye = r2 / (r2 + 0.007);
      float a = (i == 0 ? 1.0 : -1.0) * atan(d.y, d.x) + 2.2 * log(r + 0.05) - tm * 0.1;
      float arm = vnoise(vec2(cos(a), sin(a)) * 1.5 * eye + vec2(r * 4.0, float(i) * 5.0));
      float torn = smoothstep(0.3, 0.7, fbm(q * 4.0 + vec2(tm * 0.03, float(i) * 3.0)));
      float reach = exp(-r2 / size);
      v += smoothstep(0.4, 0.8, arm) * torn * reach * eye;
      near += reach;
    }
    col *= 1.0 - e * 0.35 * min(1.0, near) * (1.0 - min(1.0, v));
    col += e * lit * (hue(140.0, 60.0, 255.0) * v * 0.16 + hue(225.0, 190.0, 255.0) * pow(v, 3.0) * 0.08);
  }

  // Petrified Forest: crystals grown in the stone, clustered on the trunks
  // (or the walls), small sharp facets each catching the light in turn, a
  // pale opal fire. They grow one by one as it comes, and go dull as it goes.
  if (E_CRYSTALS > 0.0) {
    float e = E_CRYSTALS;
    vec2 g = q * 34.0;
    vec2 cell = floor(g);
    float h = nhash(cell + 2.7);
    vec2 f = fract(g) - 0.5 - 0.3 * (vec2(nhash(cell + 4.1), nhash(cell + 6.3)) - 0.5);
    float a = h * 6.2832;
    vec2 r = vec2(cos(a) * f.x + sin(a) * f.y, cos(a) * f.y - sin(a) * f.x);
    float facet = exp(-(r.x * r.x / 0.003 + r.y * r.y / 0.03));
    float cluster = smoothstep(0.5, 0.75, vnoise(cell * 0.21 + 1.3)) * max(solid, 0.6 * side) * step(1.0 - 0.5 * e, h);
    float glint = pow(0.5 + 0.5 * sin(tm * (0.4 + 0.8 * h) + h * 40.0), 14.0);
    vec3 opal = mix(vec3(0.82), 0.5 + 0.5 * cos(6.2832 * (h * 3.0 + vec3(0.0, 0.33, 0.67))), 0.4);
    col += lit * hueV(opal) * facet * cluster * (0.12 + 0.9 * glint);
  }

  // Sulphur Vents: fumes billowing up from below in columns, spreading
  // and thinning as they rise, lit from the vents. Coming, they rise from
  // the floor; going, they sink back into it.
  if (E_FUMES > 0.0) {
    float e = E_FUMES;
    float top = 0.35 + 0.9 * e;
    float up = 1.0 - xy.y;
    float xc = (p.x - 0.5 * W) / S;
    float vents = smoothstep(0.5, 0.78, vnoise(vec2(xc * 3.0 / (0.6 + 1.0 * up) + 10.0, 2.0)));
    vec2 bq = vec2(xc * 4.5, q.y * 1.8 + tm * 0.16);
    float billow = fbm(bq + 0.6 * vec2(vnoise(bq * 1.3 + vec2(0.0, tm * 0.1)), 0.0));
    float plume = vents * smoothstep(0.35, 0.72, billow) * under(0.15, 1.25, up) * under(top - 0.4, top, up + 0.15 * (billow - 0.5));
    float k = sqrt(e);
    col = mix(col, hue(110.0, 124.0, 46.0) * uLight, k * 0.1 * plume * (1.0 - 0.5 * dark));
    col += k * lit * hue(210.0, 235.0, 90.0) * plume * (0.3 + 0.7 * xy.y) * 0.05;
  }

  // Abyssal City: the abyss's corruption crawling over the ruins, black
  // veins threading the stone with a violet light pulsing along them,
  // spreading slowly; and low across the scene a rift torn open, its glow
  // welling up behind the towers. The veins spread as it comes and wither
  // as it goes; the rift opens and closes.
  if (E_CORRUPTION > 0.0) {
    float e = E_CORRUPTION;
    float rx = (p.x - 0.5 * W) / S;
    float span = max(0.3, 0.5 * W / S);
    float dy = (xy.y - 0.88 - 0.06 * (fbm(vec2(rx * 2.4, 3.0)) - 0.5)) * H / S;
    float flick = 0.8 + 0.2 * vnoise(vec2(rx * 6.0, tm * 0.8));
    float tear = exp(-dy * dy / 0.0003) * under(0.4, 1.2, abs(rx) / span);
    float well = exp(-dy * dy / 0.03) * under(0.0, 1.6, abs(rx) / span);
    col += lit * e * flick * (hue(110.0, 34.0, 200.0) * well * 0.1 + hue(220.0, 180.0, 255.0) * tear * 0.3 * e);
    vec2 vq = q * 6.0 + 0.8 * vec2(vnoise(q * 2.0 + 1.0), vnoise(q * 2.0 + 6.0));
    float vein = min(1.0, pow(ridge(vq), 12.0) + 0.5 * pow(ridge(vq * 2.1 + 3.0), 14.0));
    float reach = smoothstep(0.62 - 0.3 * e, 0.9 - 0.3 * e, fbm(q * 1.4 + vec2(3.0, tm * 0.002)) + 0.25 * max(solid, side));
    float on = vein * reach * e;
    float pulse = 0.55 + 0.45 * sin(tm * 0.5 - 4.0 * vq.y + 3.0 * vnoise(q * 3.0));
    col = mix(col, col * 0.25, 0.7 * on);
    col += lit * hue(120.0, 40.0, 220.0) * on * pulse * 0.08;
  }

  // Primeval Ruins: inscriptions in a lost script, lines of it cut round the
  // columns' rings (or along the walls), their ancient gold kindling and
  // fading as a slow wave of light runs along them. They kindle mark by mark
  // as it comes, and go dark the same way as it goes.
  if (E_GLYPHS > 0.0) {
    float e = E_GLYPHS;
    vec2 g = vec2(p.x / S * 26.0, (p.y + 0.3 * uSink) / S * 18.0);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float h = nhash(cell + 0.5);
    float h2 = fract(h * 7.31);
    float h3 = fract(h * 13.7);
    float s1 = under(0.075, 0.115, abs(f.x - 0.3 - 0.4 * step(0.5, h))) * step(0.18, f.y) * step(f.y, 0.82);
    float s2 = under(0.075, 0.115, abs(f.y - 0.22 - 0.56 * step(0.5, h2))) * step(0.22, f.x) * step(f.x, 0.78);
    float s3 = under(0.06, 0.1, abs(f.x - f.y) * 0.7071) * step(0.2, f.y) * step(f.y, 0.8);
    float mark = max(s1 * step(0.25, h3), max(s2 * step(0.3, h2), s3 * step(0.7, h3)));
    float line = floor(cell.y / 3.0);
    float band = step(0.55, nhash(vec2(line, 7.0))) * step(0.12, h);
    float on = max(ring, max(0.5 * solid, 0.45 * side));
    float wave = pow(0.5 + 0.5 * sin(cell.x * 0.35 - tm * 0.5 + line * 2.0), 3.0);
    col += lit * hue(232.0, 180.0, 92.0) * mark * band * on * step(h, 0.1 + 0.9 * e) * (0.08 + 0.3 * wave) * e;
  }

  // ---- The foreground ----

  // Rock jutting in at the edges, near and out of focus, dark against the
  // hall, its edge catching the light from below; it passes fastest of all
  // as you sink. It juts further in as it comes.
  if (E_OUTCROPS > 0.0) {
    float e = E_OUTCROPS;
    float yn = (p.y + 1.4 * uSink) / S;
    float reach = e * (0.015 + 0.11 * smoothstep(0.3, 0.8, fbm(vec2(yn * 1.6, wall * 9.0 + 2.0))));
    float rock = under(reach - 0.02, reach + 0.01, xs);
    col = mix(col, col * 0.15, 0.85 * rock);
    col += lit * uFloor.rgb * uFloor.a * under(0.0, 0.012, abs(xs - reach + 0.005)) * smoothstep(0.4, 1.0, xy.y) * 0.25 * e;
  }

  // The abyss reaching in: dark tendrils curling in from the edges, near,
  // a violet light pulsing along their rims. They reach further in as it
  // comes, and draw back as it goes.
  if (E_TENDRILS > 0.0) {
    float e = E_TENDRILS;
    float yn = (p.y + 1.4 * uSink) / S;
    float n = vnoise(vec2(yn * 2.6 + tm * 0.03, wall * 7.0 + 1.0));
    float x = xs + 0.02 * sin(yn * 11.0 + tm * 0.4 + wall * 2.0);
    float reach = e * (0.01 + 0.16 * pow(smoothstep(0.45, 0.95, n), 1.5));
    float body = under(reach - 0.015, reach + 0.005, x);
    col = mix(col, col * 0.1, 0.9 * body);
    float rim = under(0.0, 0.01, abs(x - reach + 0.006)) * step(0.02, reach);
    col += lit * hue(150.0, 70.0, 255.0) * rim * (0.5 + 0.5 * sin(tm * 1.3 + yn * 4.0)) * 0.1;
  }

  // ---- The air ----

  // Shafts of light falling slantwise from far above, dust sinking through
  // them, in the colour of the hall's glow (gold among Vaal stone, pale
  // through the stone canopy, a cold divine light in the ruins). As they
  // come they reach further down; as they go they draw back up.
  if (E_SHAFTS > 0.0) {
    float e = E_SHAFTS;
    float down = 1.2 * e + 0.05;
    float s = (p.x - 0.4 * p.y) / S;
    float b = 0.7 * vnoise(vec2(s * 6.0, tm * 0.03)) + 0.3 * vnoise(vec2(s * 14.0 + 3.0, tm * 0.05));
    float shaft = pow(smoothstep(0.5, 0.82, b), 1.5);
    float fade = (0.15 + 0.85 * pow(max(0.0, 1.0 - xy.y), 1.3)) * under(down - 0.35, down + 0.05, xy.y);
    float dust = 0.45 + 0.55 * fbm(vec2(q.x * 9.0, q.y * 9.0 - tm * 0.07));
    vec3 light = min(vec3(1.0), uGlowCol * 1.15 + 0.05);
    col += sqrt(e) * lit * light * fade * (shaft * dust * 0.11 + 0.0135);
  }

  // Fungal Caverns: a haze of spores hanging in the damp air in slow clouds,
  // and motes of it catching the light here and there. It thickens as it
  // comes, and settles as it goes.
  if (E_SPORES > 0.0) {
    float e = E_SPORES;
    float cloud = smoothstep(0.4, 0.8, fbm(vec2(q.x * 2.4 + tm * 0.008, q.y * 2.4 - tm * 0.012))) * (0.4 + 0.6 * smoothstep(0.2, 0.9, xy.y));
    col = mix(col, hue(60.0, 70.0, 62.0) * uLight, 0.12 * cloud * e);
    vec2 g = vec2(q.x, q.y - tm * 0.01) * 48.0;
    vec2 cell = floor(g);
    float h = nhash(cell + 3.7);
    vec2 f = fract(g) - 0.3 - 0.4 * vec2(nhash(cell + 1.1), nhash(cell + 8.3));
    float mote = step(1.0 - 0.25 * e, h) * exp(-dot(f, f) / 0.015) * (0.5 + 0.5 * sin(tm * (0.5 + h) + h * 30.0));
    col += lit * hue(150.0, 168.0, 146.0) * mote * 0.1;
  }

  // Haze: banks of fog drifting past at two depths, the nearer faster, in
  // the hall's own mist. It rolls in as it comes, and thins away as it goes.
  if (E_HAZE > 0.0) {
    vec3 fog = uMist.rgb * 0.7 * uLight;
    float thin = E_HAZE * 0.05 * (1.0 - 0.5 * dark);
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float k = 1.5 + 1.2 * fi;
      float bank = smoothstep(0.36, 0.76, fbm(vec2(qw.x * k - tm * (0.012 + 0.02 * fi) * k, qw.y * k * 2.6 + fi * 5.0)));
      col = mix(col, fog, thin * (0.2 + 0.8 * bank * gauss((xy.y - 0.35 - 0.3 * fi) / 0.28)));
    }
  }

  // Ash drifting down, flakes of it turning as they fall and catching the
  // light from below. More of it falls as it comes.
  if (E_ASH > 0.0) {
    float e = E_ASH;
    float ash = 0.0;
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float k = 26.0 + 16.0 * fi;
      vec2 g = vec2(q.x * k + 0.6 * sin(tm * 0.2 + q.y * 3.0 + fi), (q.y - tm * (0.02 + 0.015 * fi)) * k);
      vec2 cell = floor(g);
      float h = nhash(cell + 11.0 * fi);
      vec2 f = fract(g) - 0.3 - 0.4 * vec2(nhash(cell + 2.3), nhash(cell + 5.9));
      float turn = 0.5 + 0.5 * sin(tm * (1.0 + h) + h * 20.0);
      ash += step(1.0 - 0.18 * e, h) * exp(-(f.x * f.x / 0.02 + f.y * f.y / (0.004 + 0.012 * turn))) * (0.6 + 0.4 * fi);
    }
    col += lit * mix(rgb(70.0, 66.0, 64.0), uFloor.rgb, 0.5) * ash * 0.12;
  }
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
  float reach = max(0.15, 1.0 - 0.6 * uDark.x - 0.7 * uDark.y + flicker);
  vec2 x = max(abs(p - 0.5 * size) / (0.5 * size) - reach, 0.0) / (0.3 + 0.25 * reach);
  return 1.0 - exp(-dot(x, x));
}

// The soft light at p (CSS px, top-left origin).
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
    vec3 b = BLOB_B[i];
    vec2 rot = uBlobRot[i];
    vec2 r = p - a.xy * vec2(W, H);
    float u = dot(r, rot);
    float v = dot(r, vec2(-rot.y, rot.x));
    float reach = (u > 0.0 ? b.x : b.y) * S;
    float w = gauss(length(vec2(u / reach, v / (b.z * S))));
    col = mix(col, uBlobColor[i], a.w * w);
  }

  // Delve: smoke of the stratum's colour, and a dark that gathers out of
  // the same smoke. Both come from domain-warped noise drifting on the
  // backdrop's clock, so the dark is uneven and slowly shifting: heavier
  // toward the edges and the ceiling, but with no edge, ellipse or other
  // shape that could be picked out.
  if (uShade.a > 0.0 || uMist.a > 0.0) {
    float tm = uHome.z;
    vec2 u = (p + vec2(0.0, 0.6 * uSink)) / S * 2.4;
    vec2 warp = vec2(vnoise(u * 0.6 + vec2(tm * 0.021, 3.1)), vnoise(u * 0.6 + vec2(7.3, -tm * 0.017)));
    vec2 v = u + 2.2 * warp + vec2(-tm * 0.013, tm * 0.009);
    float n = 0.5 * vnoise(v) + 0.3 * vnoise(v * 2.03 + 11.7) + 0.2 * vnoise(v * 4.1 - 5.3);
    col = mix(col, uMist.rgb, uMist.a * smoothstep(0.42, 0.82, n));
    vec2 c = (p - vec2(0.5 * W, 0.62 * H)) / vec2(W, H) + 0.4 * (warp - 0.5);
    float edge = length(c * vec2(1.4, 1.15));
    col *= 1.0 - 0.75 * uShade.a * smoothstep(0.08, 0.9, edge + 0.9 * (0.52 - n));
  }

  // The stratum's light, set so the scene's average only ever darkens with
  // depth; its features are drawn after, at their own brightness, so a
  // bright one (fire, gold) is balanced by darker surroundings.
  col *= uLight;

  // The light about you drawing in (see closing()). What glows in the
  // stratum's environment still shows through it, dimmed.
  float dark = closing(p);
  if (dark > 0.0) col *= 1.0 - 0.93 * dark;
  if (uShade.a > 0.0 || uMist.a > 0.0) col = environments(col, p, p / vec2(W, H), S, W, H, uHome.z, dark);
  // As the clock runs out the light about you dims as it draws in, the
  // stratum's glow and all.
  col *= 1.0 - 0.35 * uDark.y;

  // The start page: god rays falling from high above the centre, each beam
  // slowly waxing and waning in place, and a royal glow behind the title.
  if (uHome.x > 0.0) {
    float ht = uHome.z;
    vec2 src = vec2(0.5 * W, -0.32 * H);
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

/** Draws smoothLight() into its own target, a texel per SMOOTH_PX CSS px. */
const SMOOTH_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes; // the target's size, texels
${SMOOTH}
void main() {
  fragColor = vec4(smoothLight(vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uSize), 1.0);
}
`;

/**
 * The backdrop at every device pixel. With `split`, the soft light comes from
 * uSmooth (drawn by SMOOTH_FRAG); without, it's worked out here.
 */
/**
 * Fragment uniform vectors the main pass uses apart from the UI elements'
 * (counted unpacked, with a little to spare: 143 now, the soft light's 45
 * among them), and each element's: its seven rows and its shadows' two
 * each. Recount when adding a uniform.
 */
const FIXED_UNIFORMS = 145;
const ELEMENT_UNIFORMS = 7 + 2 * SHADOWS_PER_ELEMENT;

const frag = (MAX_ELEMENTS: number, split: boolean) => `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;   // drawing buffer size, device pixels
${SMOOTH}
uniform sampler2D uSmooth;
uniform vec2 uVignette; // breathing (reach, strength)

// Outer box-shadows and fills of UI elements (see backdropShadow.ts for the layout).
uniform vec4 uElX[${MAX_ELEMENTS}];
uniform vec4 uElY[${MAX_ELEMENTS}];
uniform vec4 uElA[${MAX_ELEMENTS}];
uniform vec4 uElB[${MAX_ELEMENTS}];
uniform vec4 uElC[${MAX_ELEMENTS}];
uniform vec4 uElD[${MAX_ELEMENTS}];
uniform vec4 uElE[${MAX_ELEMENTS}];
uniform int uElCount;

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
uniform vec4 uShGeo[${MAX_ELEMENTS * SHADOWS_PER_ELEMENT}];
uniform vec4 uShCol[${MAX_ELEMENTS * SHADOWS_PER_ELEMENT}];

// Drop shadows of UI elements (see backdropDropShadow.ts for the layout).
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
uniform float uDialog; // how far an open dialog dims the page, 0-1 (lib/behindDialog.ts)

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
  vec2 clear = halfSize - corner - abs(point) - 3.0 * sigma;
  if (max(clear.x, clear.y) >= 0.0) {
    vec2 k = vec2(0.70710678 / sigma);
    vec2 cover = 0.5 * (erf2((point + halfSize) * k) - erf2((point - halfSize) * k));
    return cover.x * cover.y;
  }
  float low = point.y - halfSize.y;
  float high = point.y + halfSize.y;
  float y0 = clamp(-3.0 * sigma, low, high);
  float y1 = clamp(3.0 * sigma, low, high);
  float dy = (y1 - y0) / 8.0;
  float y = y0 + dy * 0.5;
  float value = 0.0;
  for (int i = 0; i < 8; i++) {
    value += shadowX(point.x, point.y - y, sigma, corner, halfSize)
      * exp(-y * y / (2.0 * sigma * sigma)) * dy;
    y += dy;
  }
  return value * (0.39894228 / sigma);
}

// Hash without sine (Dave Hoskins); uniform in [0, 1).
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 dev = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = dev / uRes * uSize; // CSS px, top-left origin
  float W = uSize.x;
  float H = uSize.y;

  vec3 col = ${split ? 'texture(uSmooth, vec2(p.x / W, 1.0 - p.y / H)).rgb' : 'smoothLight(p)'};
  // The embers dim where the dark has closed in (see closing()).
  float near = (1.0 - 0.75 * closing(p)) * (1.0 - 0.3 * uDark.y);

  // Embers rising through the dark: a hot core and a wide, dim halo.
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
    col += (hot * core * 0.9 + tint.rgb * halo * 0.3) * e.w * uEmberGain * near;
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

  // UI drop shadows. The element paints over its own shadow, so where it is
  // opaque the shadow is hidden anyway; drawing it only where the content is
  // transparent keeps a see-through element (like the faint showcase items)
  // from darkening what shows through it.
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
    float content = texture(uSharp, (md.xy + m) / uSharpSize).a;
    vec4 off = uMkOff[i];
    vec4 t1 = texture(uBlur, (md.zw + (m - off.xy) * q) / uBlurSize);
    vec4 t2 = texture(uBlur, (md.zw + (m - off.zw) * q) / uBlurSize);
    vec4 c1 = uMkCol[i * ${DROPS_PER_MASK}];
    vec4 c2 = uMkCol[i * ${DROPS_PER_MASK} + 1];
    // CSS paints the last shadow in the list first.
    col = mix(col, c2.rgb, c2.a * (t2.b + t2.a / 255.0) * (1.0 - content));
    col = mix(col, c1.rgb, c1.a * (t1.r + t1.g / 255.0) * (1.0 - content));
  }

  // UI elements in two passes: every element's shadows outside its border
  // box, then every fill inside it, in document order. So a shadow only ever
  // lands on the backdrop, never on a neighbouring box: the same as while
  // the page scrolls, when CSS paints the fills over these shadows. (CSS on
  // its own would lay a later box's shadow over the boxes before it.)
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
    if (pass == 0) {
      // Most pixels are beyond every shadow's reach (ea.w, the per-shadow
      // test below for all of them at once): skip those first.
      vec2 far = max(-lp, lp - eb.xy);
      if (max(far.x, far.y) > ea.w) continue;
    } else if (fc.x < 0.5) continue;
    vec2 halfBox = eb.xy * 0.5;
    float rr = min(eb.z, min(halfBox.x, halfBox.y));
    vec2 qd = abs(lp - eb.xy * 0.5) - halfBox + rr;
    float sdf = length(max(qd, 0.0)) + min(max(qd.x, qd.y), 0.0) - rr;
    float px = pxLocal * k; // one device pixel in element px
    // Behind a dialog the UI blurs, so the edge softens with it (a linear
    // ramp as wide as a Gaussian edge's 10-90% rise).
    float edge = max(px, 2.56 * ${DIALOG_BLUR.toFixed(2)} * uDialog * k);
    float outside = clamp(sdf / edge + 0.5, 0.0, 1.0);

    if (pass == 1) {
      if (outside >= 1.0) continue;
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
      col = mix(col, fill.rgb, fill.a * fc.z * (1.0 - outside));
      continue;
    }
    if (outside <= 0.0) continue;
    for (int j = 0; j < ${SHADOWS_PER_ELEMENT}; j++) {
      vec4 g = uShGeo[i * ${SHADOWS_PER_ELEMENT} + j];
      vec4 c = uShCol[i * ${SHADOWS_PER_ELEMENT} + j];
      if (c.a <= 0.0) continue;
      vec2 lower = g.xy - g.w;
      vec2 upper = eb.xy + g.xy + g.w;
      // Skip pixels beyond the Gaussian's reach.
      vec2 far = max(lower - lp, lp - upper);
      if (max(far.x, far.y) > 4.0 * g.z) continue;
      float a = roundedBoxShadow(lower, upper, lp, g.z, max(eb.z + g.w, 0.0));
      col = mix(col, c.rgb, c.a * a * outside);
    }
  }

  // A dialog dims it all here, before the dither; CSS darkening the
  // dithered output would band.
  col *= 1.0 - ${DIALOG_DIM.toFixed(3)} * uDialog;

  // TPDF dither of +-1 LSB, per device pixel, ahead of the round-to-nearest
  // 8-bit conversion. The same sample goes to all three channels, so the
  // noise carries no colour of its own.
  float n = hash(dev + 0.5) + hash(dev + 101.5) - 1.0;
  fragColor = vec4(col + n / 255.0, 1.0);
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

/**
 * Starts rendering the backdrop into `canvas`. Returns a cleanup function, or
 * null when WebGL2 (with highp fragment floats) is unavailable. `onLost` fires
 * if the context is lost later, after the renderer has shut itself down, so
 * the caller can fall back to CSS.
 */
export function startBackdrop(canvas: HTMLCanvasElement, onLost: () => void): (() => void) | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!hp || hp.precision === 0) return null;
  // The main pass needs about FIXED_UNIFORMS fragment uniform vectors (every
  // one counted unpacked, the soft light's included where it is worked out
  // there) plus ELEMENT_UNIFORMS a UI element. WebGL2 guarantees 224, enough
  // for 7 elements; most desktop GPUs offer 1024 or more, and get 16.
  const maxElements = Math.max(4, Math.min(16, Math.floor((gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) - FIXED_UNIFORMS) / ELEMENT_UNIFORMS)));

  // The soft light (see SMOOTH) gets a half-float target of its own wherever
  // the GPU can draw to one, which is nearly everywhere; elsewhere the main
  // pass works it out at every pixel. (An 8-bit target would band.)
  let smoothTex: WebGLTexture | null = null;
  let smoothFbo: WebGLFramebuffer | null = null;
  if (gl.getExtension('EXT_color_buffer_float')) {
    smoothTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, smoothTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    smoothFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, smoothFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, smoothTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(smoothFbo);
      gl.deleteTexture(smoothTex);
      smoothTex = smoothFbo = null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  let smoothW = 1;
  let smoothH = 1;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
    console.warn('Backdrop shader failed to compile; using the CSS backdrop.', gl.getShaderInfoLog(s));
    return null;
  };
  const link = (fragSrc: string) => {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (gl.getProgramParameter(p, gl.LINK_STATUS)) return p;
    console.warn('Backdrop program failed to link; using the CSS backdrop.', gl.getProgramInfoLog(p));
    return null;
  };
  const prog = link(frag(maxElements, !!smoothTex));
  const smoothProg = smoothTex ? link(SMOOTH_FRAG) : null;
  if (!prog || (smoothTex && !smoothProg)) return null;
  // The program that works out the soft light.
  const soft = smoothProg ?? prog;

  // One triangle covering the viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const S = (name: string) => gl.getUniformLocation(soft, name);
  const sRes = S('uRes');
  const sSize = S('uSize');
  const sViewH = S('uViewH');
  const uTop = S('uTop');
  const uBottom = S('uBottom');
  const uGlow = S('uGlow');
  const uBaseStop = S('uBaseStop');
  const uBlobA = S('uBlobA');
  const uBlobRot = S('uBlobRot');
  const uBeams = S('uBeams');
  const uHome = S('uHome');
  const uTitle = S('uTitle');
  const uFloor = S('uFloor');
  const uHaze = S('uHaze');
  const uShade = S('uShade');
  const uMist = S('uMist');
  const uEnv = S('uEnv');
  const uEddy = S('uEddy');
  const uDark = S('uDark');
  const uGlowCol = S('uGlowCol');
  const uScene = S('uScene');
  const uFx = S('uFx');
  const env = new Float32Array(ENV_VECS * 4);
  /** The magma's clock (s): it runs as fast as the magma is hot, and stops as it cools to rock. */
  let magmaClock = 0;
  const uBlobColor = S('uBlobColor');
  gl.useProgram(soft);
  const blobColor = new Float32Array(BLOB_COUNT * 3);

  gl.useProgram(prog);
  const U = (name: string) => gl.getUniformLocation(prog, name);
  const uRes = U('uRes');
  const uSize = U('uSize');
  const uViewH = U('uViewH');
  const uVignette = U('uVignette');
  const uLightA = U('uLightA');
  const uLightC = U('uLightC');
  const uMood = U('uMood');
  const uEmberHalo = U('uEmberHalo');
  const uEmberCore = U('uEmberCore');
  const uEmberK = U('uEmberK');
  // The dark closing in dims the embers too (closing() in the shader).
  const mDark = U('uDark');
  const mScene = U('uScene');
  const mHome = U('uHome');
  const uElCount = U('uElCount');
  const uDialog = U('uDialog');
  gl.uniform1i(U('uSmooth'), 3);
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
  const mk = {
    a: new Float32Array(MAX_MASKS * 4),
    b: new Float32Array(MAX_MASKS * 4),
    c: new Float32Array(MAX_MASKS * 4),
    d: new Float32Array(MAX_MASKS * 4),
    e: new Float32Array(MAX_MASKS * 4),
    off: new Float32Array(MAX_MASKS * 4),
    col: new Float32Array(MAX_MASKS * DROPS_PER_MASK * 4),
  };
  const mkLoc = Object.fromEntries(
    ['A', 'B', 'C', 'D', 'E', 'Off', 'Col'].map((k) => [k.toLowerCase(), U('uMk' + k)]),
  );
  const shadowArrays = [...Object.values(el), ...Object.values(mk)];
  const prev = new Float32Array(shadowArrays.reduce((n, arr) => n + arr.length, 0));
  const lightA = new Float32Array(MAX_LIGHTS * 4);
  const lightC = new Float32Array(MAX_LIGHTS * 4);
  const mood = new Float32Array(4);
  const home = new Float32Array(4);
  const title = new Float32Array(4);
  const blobA = new Float32Array(BLOB_COUNT * 4);
  const blobRot = new Float32Array(BLOB_COUNT * 2);
  const beam = new Float32Array(7 * 3);

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
  gl.uniform1i(U('uSharp'), 0);
  gl.uniform1i(U('uBlur'), 1);
  const uSharpSize = U('uSharpSize');
  const uBlurSize = U('uBlurSize');
  gl.uniform2f(uSharpSize, 1, 1);
  gl.uniform2f(uBlurSize, 1, 1);

  // Ember positions by screen tile, one float texel each (unit 2).
  const emberTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, emberTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SLOTS, TILES, 0, gl.RGBA, gl.FLOAT, null);
  gl.uniform1i(U('uEmbers'), 2);
  const paths = BLOBS.map(blobPath);

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // With the visual effects switched off (the ✦ in the header) the backdrop
  // holds still too, where it stands, and is only drawn when something
  // changes: the low-power mode, for phones that run hot. (Reduced motion
  // goes further and rests everything.)
  const calm = () => reduceMotion.matches || !fxUserOn();
  // On phones and tablets the backdrop-drawn shadows look worse than CSS's,
  // so there every element keeps its CSS shadow and the backdrop draws none.
  const cssShadows = matchMedia('(pointer: coarse)');
  /** The backdrop's own clock (ms): it stops while calm(). */
  let clock = 0;
  let raf = 0;
  let last = -Infinity;
  let lastStep = performance.now();

  /** The question's clock as the dark last drawn shows it (lib/darkness.ts). */
  let pressure = 0;
  function draw() {
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
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;

    // The soft light: into its own target first, or along with the rest.
    gl!.useProgram(soft);
    gl!.uniform2f(sSize, cssW, cssH);
    gl!.uniform1f(sViewH, viewH);
    // Delve: the stratum's look (the surface's outside one): its light from
    // below, haze, lamp, smoke, and dark.
    const scene = currentDescent();
    const look = scene.look;
    gl!.uniform4f(uFloor, look.floor[0] / 255, look.floor[1] / 255, look.floor[2] / 255, look.floorK);
    gl!.uniform3f(uHaze, look.haze[0] / 255, look.haze[1] / 255, look.haze[2] / 255);
    gl!.uniform4f(uShade, look.shade[0], look.shade[1], look.shade[2], look.dark);
    gl!.uniform4f(uMist, look.mist[0] / 255, look.mist[1] / 255, look.mist[2] / 255, look.mistK);
    // Its environment, and the dark closing in with the depth and the clock.
    for (let i = 0; i < ENV; i++) env[i] = look.env[i] < 0.002 ? 0 : look.env[i];
    gl!.uniform4fv(uEnv, env);
    gl!.uniform4fv(uEddy, embers.eddies);
    gl!.uniform4f(uFx, still ? 0 : magmaClock, 0, 0, look.hue);
    // A plunge draws the dark in and lets it go again as the scene sinks.
    const close = Math.min(1, scene.close + 0.12 * sinking.breath);
    const sink = sinking.sink * viewH;
    gl!.uniform2f(uDark, close, pressure);
    gl!.uniform3f(uGlowCol, look.glow[0] / 255, look.glow[1] / 255, look.glow[2] / 255);
    gl!.uniform3f(uScene, scene.light * look.lightK, sink, scene.features);
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
    gl!.uniform2f(uVignette, 1 - 0.06 * vignette, (1 + 0.07 * vignette) * (1 - 0.6 * look.dark));
    for (const [k, arr] of Object.entries(el)) gl!.uniform4fv(elLoc[k as keyof typeof el], arr);
    let count = 0;
    for (let i = 0; i < maxElements; i++) if (el.b[i * 4 + 3] > 0) count = i + 1;
    gl!.uniform1i(uElCount, count);
    for (const [k, arr] of Object.entries(mk)) gl!.uniform4fv(mkLoc[k], arr);
    gl!.uniform4fv(uLightA, lightA);
    gl!.uniform4fv(uLightC, lightC);
    gl!.uniform4fv(uMood, mood);
    gl!.uniform1f(uDialog, dialog);
    gl!.uniform4fv(uEmberHalo, embers.halo);
    gl!.uniform3fv(uEmberCore, embers.core);
    gl!.uniform2f(uEmberK, calm() ? 0.6 : 1, embers.streak);
    gl!.uniform2f(mDark, close, pressure);
    gl!.uniform3f(mScene, scene.light * look.lightK, sink, scene.features);
    gl!.uniform4fv(mHome, home);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, emberTex);
    // Only the slots in use, and the empty one that ends the fullest row: the
    // shader reads no further in any row, and every row's own end is in them.
    const cols = Math.min(SLOTS, embers.usedMax + 1);
    gl!.pixelStorei(gl!.UNPACK_ROW_LENGTH, SLOTS);
    gl!.texSubImage2D(gl!.TEXTURE_2D, 0, 0, 0, cols, TILES, gl!.RGBA, gl!.FLOAT, embers.data);
    gl!.pixelStorei(gl!.UNPACK_ROW_LENGTH, 0);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  // Measures the shadowed elements; true if anything changed since last time.
  // On phones and tablets there's nothing to measure: everything is let go
  // to CSS once, and nothing changes until the pointer does.
  let released = false;
  function measure() {
    let atlases: ReturnType<typeof measureDrops> = null;
    if (cssShadows.matches) {
      if (released) return false;
      released = true;
      for (const arr of shadowArrays) arr.fill(0);
      releaseAll();
      releaseAllDrops();
    } else {
      released = false;
      measureShadows(maxElements, el.x, el.y, el.a, el.b, el.c, el.d, el.e, el.geo, el.col, canvas.clientWidth, canvas.clientHeight);
      atlases = measureDrops(mk.a, mk.b, mk.c, mk.d, mk.e, mk.off, mk.col, canvas.clientWidth, canvas.clientHeight);
    }
    let changed = false;
    if (atlases) {
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, sharpTex);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, atlases.sharp);
      gl!.uniform2f(uSharpSize, atlases.sharp.width, atlases.sharp.height);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, blurTex);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, atlases.blurW, atlases.blurH, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, atlases.blur);
      gl!.uniform2f(uBlurSize, atlases.blurW, atlases.blurH);
      changed = true;
    }
    let k = 0;
    for (const arr of shadowArrays) {
      for (let i = 0; i < arr.length; i++, k++) {
        if (prev[k] !== arr[i]) {
          prev[k] = arr[i];
          changed = true;
        }
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
  let wasDescending = false;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    // (A frame's time can come before the last one's; it never runs backwards here.)
    const dt = Math.max(0, Math.min(0.1, (now - lastStep) / 1000));
    const still = calm();
    if (!still) {
      clock += 1000 * dt;
      // (Full speed while it glows, slowing as it cools, still once it is rock.)
      const e = currentDescent().look.env[MAGMA];
      const k = Math.min(1, Math.max(0, (e - 0.3) / 0.6));
      magmaClock += dt * k * k * (3 - 2 * k);
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
    embers.descend(currentDescent(), targetDescent());
    // A new depth dealt: the scene sinks a little further (plunge in descent.ts),
    // the embers and glints carried up with the walls; never while holding still.
    const sunk = sinking.sink;
    if (stepPlunge(now, !still)) {
      const px = (sinking.sink - sunk) * viewH;
      if (Math.abs(px) < viewH) embers.rise(px, canvas.clientHeight);
      dirty = true;
    }
    // (Capped: a plunge's speed peaks near a screen a second.)
    embers.streak = Math.min(1.6, 2 * sinking.speed);
    // Arrived at a depth: the embers still in the old colour take the new one (after a rejoin, all of them).
    if (wasDescending && !descending) embers.recolor();
    wasDescending = descending;
    // A depth easing in is a slow change of colour: 30fps is plenty. Holding
    // still, the one frame it changes in must be drawn.
    if (still && descending) dirty = true;
    const soft = lights || moodState === 'moving';
    const lit = homeMoving || (soft && !cssShadows.matches);
    if (!still) embers.step(dt, canvas.clientWidth, canvas.clientHeight, !fxActive());
    else if (descending) embers.step(0, canvas.clientWidth, canvas.clientHeight, true, true);
    // A dialog's dimming fades in and out with the dialog, in step with the UI's.
    const d = openDialog().amount;
    const fading = d !== dialog;
    dialog = d;
    const changed = measure() || dirty || lit || fading;
    if (!changed && ((still && !soft) || now - last < 33)) return;
    last = now;
    dirty = false;
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
  const scale = () => (cssShadows.matches && devicePixelRatio > 1 ? 1 / devicePixelRatio : 1);

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
    viewH = Math.max(1, h > 0 ? Math.min(h, canvas.clientHeight) : canvas.clientHeight);
  };
  const viewRo = new ResizeObserver(() => {
    const before = viewH;
    measureView();
    if (viewH !== before) draw();
  });
  viewRo.observe(viewProbe);

  const ro = new ResizeObserver(([entry]) => {
    const box = entry.devicePixelContentBoxSize?.[0];
    const k = scale();
    const estW = entry.contentRect.width * devicePixelRatio;
    const estH = entry.contentRect.height * devicePixelRatio;
    const exact = k === 1 && box && Math.abs(box.inlineSize - estW) <= 2 && Math.abs(box.blockSize - estH) <= 2;
    const w = exact ? box.inlineSize : Math.round(estW * k);
    const h = exact ? box.blockSize : Math.round(estH * k);
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    measureView();
    draw();
  });
  try {
    ro.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    ro.observe(canvas);
  }

  function stop() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    viewRo.disconnect();
    viewProbe.remove();
    canvas.removeEventListener('webglcontextlost', lost);
    reduceMotion.removeEventListener('change', onMotionChange);
    offFx();
    releaseAll();
    releaseAllDrops();
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

  // Paint the first frame now so the swap from the CSS backdrop is seamless.
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio * scale()));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio * scale()));
  embers.step(0, canvas.clientWidth, canvas.clientHeight);
  measureView();
  measure();
  draw();
  raf = requestAnimationFrame(frame);

  return stop;
}

/** The shaders' sources, for a compile and link check: the vertex shader, the soft light's, and the main pass with it split off and without. */
export const backdropShaders = (maxElements: number) => ({ vert: VERT, smooth: SMOOTH_FRAG, split: frag(maxElements, true), whole: frag(maxElements, false) });
