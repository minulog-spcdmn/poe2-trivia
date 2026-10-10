// WebGL2 renderer for the FX overlay: a transparent canvas above the UI that
// the page composites with `mix-blend-mode: plus-lighter`, so everything it
// draws adds light to what's underneath.
//
// Particles and procedural shapes are accumulated additively in a half-float
// (HDR) target, bloomed through a mip chain (13-tap downsample, tent
// upsample), tone-mapped per channel so hot colours burn toward white, and
// dithered once, at the 8-bit conversion, so no glow can band. Empty pixels
// stay exactly zero: the overlay never tints or noises the page when idle.

import { INSTANCE_FLOATS } from './particles';
import { NOISE, buildPrograms, dropTarget, target, whenGpuCaughtUp, wrapProgram, type Build, type Program, type Target } from './gl';
import { DIALOG_BLUR, DIALOG_DIM } from '../behindDialog';

/** Floats per shape instance: five vec4s (see ShapeType). */
export const SHAPE_FLOATS = 24;

/**
 * Procedural shapes. Instance layout:
 *   s0: centre x, centre y, quad half width, quad half height (CSS px)
 *   s1: type, progress 0-1, age (s), seed
 *   s2: r, g, b (HDR, envelope applied), flags: 1 for the page's light (see
 *       BEHIND_DIALOG), plus BEHIND_PICTURE when it shines from behind the
 *       picture in uSil (see Silhouette), plus BEHIND_UI when it shines from
 *       behind the UI (see COVER)
 *   s3, s4, s5: per-type parameters (documented in the shader)
 */
export const ShapeType = {
  Ring: 0,
  Flare: 1,
  Rays: 2,
  RectGlow: 3,
  Portal: 4,
  Edge: 5,
  Flash: 6,
  Sigil: 7,
  QuadGlow: 8,
  Orbit: 9,
  Fire: 10,
  Burn: 11,
} as const;
export type ShapeType = (typeof ShapeType)[keyof typeof ShapeType];

/** Shape flag (s2.w): it shines from behind the picture in uSil (see Silhouette). */
export const BEHIND_PICTURE = 2;
/** Shape flag (s2.w): it shines from behind the UI, which hides it (see COVER). */
export const BEHIND_UI = 4;
/** Particle flag (its page light, iC.w): it shines from behind the UI (see COVER). */
export const PARTICLE_BEHIND_UI = 2;

/** How far the fire's tallest tongue reaches, in flame heights: the shader stops there and effects.ts sizes the quad to it. */
export const FIRE_REACH = 1.8;

// While a dialog is open (lib/behindDialog.ts), light from the page behind it
// hides behind the dialog, which on the page is opaque; the dialog's own light
// (from effects that started inside it) shows over it. Outside it, the
// composite dims both with the rest of the page. The page's light is soft
// already, so the page's blur passes it by; the shapes drawn crisp (an aura's
// orbit, a sigil) blur themselves by uBlur.
const BEHIND_DIALOG = `
uniform vec4 uDialogBox; // the open dialog: left, top, right, bottom (CSS px)
uniform float uDialogR;  // its corner radius, CSS px
uniform float uHide;     // how far it hides the page's light, 0-1
uniform float uBlur;     // how far it blurs the page: the blur's standard deviation, CSS px
// Signed distance from the dialog's edge (CSS px), negative inside.
float dialogSdf(vec2 p) {
  vec2 h = (uDialogBox.zw - uDialogBox.xy) * 0.5;
  vec2 q = abs(p - uDialogBox.xy - h) - h + uDialogR;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uDialogR;
}
// How much of the page's light at p (CSS px) the dialog hides.
float hiddenAt(vec2 p) {
  return uHide > 0.0 ? uHide * clamp(0.5 - dialogSdf(p), 0.0, 1.0) : 0.0;
}`;

// Light from behind the UI (a flare burning behind the question): the boxes
// of the UI in front of it, as a soft mask (see setCover), hide it. It lights
// the backdrop round them and their edges, never the UI itself; and while
// they're set, its bloom stays off them too. For that the HDR target and the
// bloom chain carry, in alpha, how much of each pixel's light (its luminance)
// is from behind the UI: the composite hides only that share of the bloom
// over the boxes, so the bloom of everything else is untouched.
const COVER = `
uniform sampler2D uCover;
uniform float uCoverOn;   // 1 while the UI's boxes are set, else 0
uniform vec2 uCoverView;  // the view the mask spans, CSS px
uniform vec2 uCoverShift; // how far the UI has moved since the mask was drawn (a shake), CSS px
// How much of the UI covers p (CSS px), 0-1.
float coverAt(vec2 p) {
  return uCoverOn > 0.0 ? texture(uCover, (p - uCoverShift) / uCoverView).a : 0.0;
}
// Light's luminance: what alpha carries of the light from behind the UI.
float coverLum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}`;

const PARTICLE_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 iA; // x, y, vx, vy
layout(location = 2) in vec4 iB; // size, stretch, rot, shape
layout(location = 3) in vec4 iC; // r, g, b, page light (see BEHIND_DIALOG)
uniform vec2 uView;     // CSS px
uniform float uMinPx;   // smallest width in CSS px (about one device pixel)
out vec2 vL;            // px along (dir, normal)
out vec2 vWorld;        // CSS px
flat out vec3 vCol;
flat out vec4 vP;       // shape, size, half length, page light
void main() {
  float shape = iB.w;
  float size = iB.x;
  vec2 vel = iA.zw;
  float speed = length(vel);
  vec2 dir = vec2(cos(iB.z), sin(iB.z));
  float halfLen = 0.0;
  // Keep sub-pixel particles at a pixel wide, dimmed to the same energy, so
  // they don't shimmer in and out between pixels.
  float w = max(size, uMinPx);
  float energy = size / w;
  vec2 ext;
  if (shape < 0.5) {            // glow
    ext = vec2(3.0 * w);
    energy *= energy;
  } else if (shape < 1.5) {     // spark: streak along the velocity
    if (speed > 0.001) dir = vel / speed;
    halfLen = speed * iB.y * 0.5;
    ext = vec2(halfLen + 3.0 * w, 3.0 * w);
    // Spread the same light over a longer streak, gently.
    energy *= inversesqrt(1.0 + halfLen / (4.0 * w));
  } else if (shape < 2.5) {     // ember
    ext = vec2(4.0 * w);
    energy *= energy;
  } else if (shape < 3.5) {     // shard
    ext = vec2(2.2 * w);
  } else if (shape < 4.5) {     // glint
    ext = vec2(4.5 * w);
  } else if (shape < 5.5) {     // mote
    ext = vec2(1.25 * w);
    energy *= energy;
  } else {                      // coin: the stretch slot carries its flip
    halfLen = iB.y;
    ext = vec2(2.0 * w);
  }
  vec2 nrm = vec2(-dir.y, dir.x);
  vL = aCorner * ext;
  vec2 p = iA.xy + dir * vL.x + nrm * vL.y;
  vWorld = p;
  vCol = iC.rgb * energy;
  vP = vec4(shape, w, halfLen, iC.w);
  vec2 clip = p / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const PARTICLE_FS = `#version 300 es
precision highp float;
in vec2 vL;
in vec2 vWorld;
flat in vec3 vCol;
flat in vec4 vP;
out vec4 o;
${BEHIND_DIALOG}
${COVER}
void main() {
  float shape = vP.x;
  float w = vP.y;
  float v;
  if (shape < 0.5) {
    v = exp(-dot(vL, vL) / (w * w));
  } else if (shape < 1.5) {
    float L = vP.z;
    float x = clamp(vL.x, -L, L);
    vec2 d = vec2(vL.x - x, vL.y) / w;
    // The head (front of travel) is brighter than the tail.
    float head = L > 0.0 ? mix(0.2, 1.0, (x + L) / (2.0 * L)) : 1.0;
    v = exp(-dot(d, d)) * head;
  } else if (shape < 2.5) {
    float r2 = dot(vL, vL) / (w * w);
    v = exp(-r2 * 7.0) * 1.4 + 0.22 * exp(-r2 * 0.45);
  } else if (shape < 3.5) {
    vec2 q = abs(vL) / vec2(w, w * 0.42);
    float d = q.x + q.y;
    float body = 1.0 - smoothstep(0.82, 1.0, d);
    v = body * (0.3 + 0.9 * smoothstep(0.45, 0.95, d)) + 0.25 * exp(-d * d * 1.5);
  } else if (shape < 4.5) {
    vec2 a = abs(vL) / w;
    float core = exp(-dot(a, a) * 4.0);
    float beamX = exp(-a.x * 0.9) * exp(-a.y * a.y * 90.0);
    float beamY = exp(-a.y * 0.9) * exp(-a.x * a.x * 90.0);
    v = core * 1.5 + beamX + beamY;
  } else if (shape < 5.5) {
    float r = length(vL) / w;
    v = (1.0 - smoothstep(0.86, 1.0, r)) * (0.55 + 0.45 * smoothstep(0.3, 1.0, r));
  } else {
    // A coin turning end over end: a disc squashed across by its flip, with
    // a raised rim and an inner ring, darker edge-on, and a star glint as it
    // turns to face you.
    float flip = vP.z;
    float fw = max(abs(flip), 0.06);
    vec2 c = vec2(vL.x / fw, vL.y) / w;
    float r = length(c);
    float aa = fwidth(r) * 1.2;
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0, r);
    float rim = smoothstep(0.7, 0.8, r) * (1.0 - smoothstep(0.86, 0.95, r));
    float ring = exp(-pow((r - 0.46) / 0.06, 2.0));
    float shade = (0.3 + 0.7 * abs(flip)) * (flip > 0.0 ? 1.0 : 0.8);
    v = disc * shade * (0.5 + 0.7 * rim + 0.45 * ring);
    float facing = pow(abs(flip), 24.0);
    vec2 a = abs(vL) / w;
    float star = exp(-a.y * a.y * 120.0) * exp(-a.x * 1.1) + exp(-a.x * a.x * 120.0) * exp(-a.y * 1.1);
    v += facing * star * 1.3;
  }
  float page = mod(vP.w, 2.0);
  float behindUi = step(${PARTICLE_BEHIND_UI}.0, vP.w);
  vec3 lit = vCol * v * (1.0 - page * hiddenAt(vWorld)) * (1.0 - behindUi * coverAt(vWorld));
  o = vec4(lit, behindUi * coverLum(lit));
}`;

const SHAPE_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 s0;
layout(location = 2) in vec4 s1;
layout(location = 3) in vec4 s2;
layout(location = 4) in vec4 s3;
layout(location = 5) in vec4 s4;
layout(location = 6) in vec4 s5;
uniform vec2 uView;
out vec2 vP;
out vec2 vWorld; // CSS px
flat out vec4 vA;
flat out vec3 vC;
flat out float vBehind; // page light (see BEHIND_DIALOG)
flat out float vPicture; // behind the picture (see Silhouette)
flat out float vUi; // behind the UI (see COVER)
flat out vec4 vQ;
flat out vec4 vR;
flat out vec4 vS;
flat out vec2 vHalf;
void main() {
  vP = aCorner * s0.zw;
  vHalf = s0.zw;
  vA = s1;
  vC = s2.rgb;
  vBehind = mod(s2.w, ${BEHIND_PICTURE}.0);
  vPicture = step(${BEHIND_PICTURE}.0, mod(s2.w, ${BEHIND_UI}.0));
  vUi = step(${BEHIND_UI}.0, s2.w);
  vQ = s3;
  vR = s4;
  vS = s5;
  vec2 p = s0.xy + vP;
  vWorld = p;
  vec2 clip = p / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const SHAPE_FS = `#version 300 es
precision highp float;
in vec2 vP;
in vec2 vWorld;
flat in vec4 vA;
flat in vec3 vC;
flat in float vBehind;
flat in float vPicture;
flat in float vUi;
flat in vec4 vQ;
flat in vec4 vR;
flat in vec4 vS;
flat in vec2 vHalf;
out vec4 o;
#define PI 3.14159265
// A picture the rays shine from behind (see Silhouette): its blurred alpha,
// its centre and half size (CSS px), how far it's turned (its x scale, -1 to
// 1) and the part of the texture the picture covers (the rest is margin).
uniform sampler2D uSil;
uniform float uSilOn; // the picture's opacity, 0 without one
uniform vec4 uSilBox;
uniform float uSilFlip;
uniform vec2 uSilFit;
// Where p (CSS px) falls on the picture's texture.
vec2 silhouetteUv(vec2 p) {
  vec2 l = (p - uSilBox.xy) / uSilBox.zw;
  l.x /= (uSilFlip < 0.0 ? -1.0 : 1.0) * max(abs(uSilFlip), 0.02);
  return 0.5 + 0.5 * l * uSilFit;
}
// How much of the picture covers p, 0-1 (as visible as the picture is).
// Half a level down: a little smoother, and some blur where the canvas can't (older Safari).
float silhouetteAt(vec2 p) {
  if (uSilOn <= 0.0) return 0.0;
  return smoothstep(0.15, 0.7, textureLod(uSil, silhouetteUv(p), 0.5).a) * uSilOn;
}
// How near p is to the picture, 0-1: its alpha blurred far wider (a small
// mip), so light right beside a thin item doesn't bloom back over it.
float silhouetteNear(vec2 p) {
  if (uSilOn <= 0.0) return 0.0;
  return smoothstep(0.0, 0.35, textureLod(uSil, silhouetteUv(p), 4.0).a) * uSilOn;
}
${NOISE}
${BEHIND_DIALOG}
${COVER}
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
// A line's profile across it, exp(-(x / w)^2), blurred by a Gaussian blur
// (CSS px; see BEHIND_DIALOG): their variances add, and it dims by as much
// as it widens, keeping its light.
float blurredLine(float x, float w, float blur) {
  float wb = w * w + 2.0 * blur * blur;
  return exp(-x * x / wb) * w * inversesqrt(wb);
}
// How much of a pattern repeating every period px a Gaussian blur leaves (of its fundamental).
float blurKeeps(float period, float blur) {
  return exp(-19.74 * blur * blur / max(period * period, 1e-4));
}
// Equilateral triangle SDF (Inigo Quilez), r = circumradius-ish size.
float sdTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
// Signed distance to a convex or concave quad (Inigo Quilez's polygon SDF).
float sdQuad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  vec2 v[4] = vec2[4](a, b, c, d);
  float dist = dot(p - v[0], p - v[0]);
  float s = 1.0;
  for (int i = 0, j = 3; i < 4; j = i, i++) {
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 q = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    dist = min(dist, dot(q, q));
    bvec3 cond = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(cond) || all(not(cond))) s *= -1.0;
  }
  return s * sqrt(dist);
}
// Value noise that wraps every period cells along x (around a circle).
float pnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, period), x1 = mod(i.x + 1.0, period);
  return mix(mix(hash12(vec2(x0, i.y)), hash12(vec2(x1, i.y)), u.x),
             mix(hash12(vec2(x0, i.y + 1.0)), hash12(vec2(x1, i.y + 1.0)), u.x), u.y);
}
// One ring of light shafts at u (turns, 0-1) and rn (radius, 0-1 of the
// reach): n cells round the circle, one shaft in each, with its own width
// (w, in cells), offset, reach and breathing. root widens them (in cells)
// near the source, dimming them by as much so the light stays the same.
float shafts(float u, float rn, float n, float w, float root, float time, float seed) {
  float x = u * n;
  float cell = floor(x);
  float v = 0.0;
  for (int k = -1; k <= 1; k++) {
    float c = cell + float(k);
    float id = mod(c, n);
    float h1 = hash12(vec2(id, seed));
    float h2 = hash12(vec2(id + 0.5, seed + 7.31));
    float h3 = hash12(vec2(id + 0.25, seed + 3.17));
    float ww = w * (0.5 + 1.1 * h2);
    float we = min(ww + root, 0.6);
    float d = (x - c - 0.5 - (h1 - 0.5) * 0.6) / we;
    float len = 0.55 + 0.45 * h3;
    float q = rn / len;
    float breathe = 0.6 + 0.4 * sin(time * (0.4 + 0.5 * h1) + h2 * 6.2832);
    // A soft shaft with a brighter line down its middle.
    float body = exp(-d * d) + 0.5 * exp(-d * d * 8.0);
    v += body * (ww / we) * exp(-q * 2.2) * breathe * (0.45 + 0.55 * h3);
  }
  return v;
}

// Glow around an outline at signed distance d: a soft outer halo and a
// brighter edge, with optional flames licking upward (up, 0-1, is how high
// this pixel sits), fading inside unless it bleeds over the element.
float outlineGlow(float d, float wd, float flameAmt, float bleed, float up, vec2 np, float time, float seed, out float hot) {
  hot = 0.0;
  float outer = exp(-max(d, 0.0) / wd);
  float edge = exp(-abs(d) / max(1.0, wd * 0.12));
  float inside = mix(smoothstep(-wd * 0.35, 0.0, d), 1.0, bleed);
  float base = (outer * 0.5 + edge * 0.9) * inside;
  if (base <= 0.003) return 0.0;
  float flame = 1.0;
  if (flameAmt > 0.0) {
    float n = fbm(np * 0.03 + vec2(0.0, time * 1.8) + seed);
    flame = mix(1.0, (0.2 + 1.7 * n) * (0.6 + 0.8 * up), flameAmt);
  }
  hot = edge * edge * 0.25 * inside;
  return base * flame;
}

void main() {
  int type = int(vA.x + 0.5);
  float prog = vA.y;
  float time = vA.z;
  float seed = vA.w;
  float r = length(vP);
  vec2 dir = r > 0.0 ? vP / r : vec2(1.0, 0.0);
  vec3 col = vC;
  float v = 0.0;
  float hot = 0.0; // extra white-hot light on top of the colour

  if (type == 0) {
    // Ring (shockwave). q: radius, thickness, breakup 0-1, inner fill.
    // A crisp leading edge with a soft wake trailing inward, torn up by
    // noise that also varies along the wake, so it reads as a blast front
    // rather than a drawn circle.
    float th = max(vQ.y, 0.75);
    float d = (r - vQ.x) / th;
    float front = d > 0.0 ? exp(-d * d * 3.0) : exp(d * 0.9);
    float fill = vQ.w * (1.0 - smoothstep(0.0, vQ.x, r)) * (d < 0.0 ? 1.0 : 0.0) * 0.25;
    // Most of the quad is empty: only tear the band that's actually lit.
    if (front > 0.004) {
      float n = fbm(dir * 2.6 + vec2(seed, time * 1.3) + vec2(0.0, d * 0.18));
      float torn = mix(1.0, smoothstep(0.25, 0.75, n) * 1.8, vQ.z);
      v = front * torn;
      hot = exp(-d * d * 12.0) * torn * 0.35;
    }
    v += fill;
  } else if (type == 1) {
    // Flare. q: core radius, streak half length, streak thickness, spikes.
    float core = exp(-(r * r) / (vQ.x * vQ.x)) + 0.4 * exp(-r / (vQ.x * 2.2));
    float sx = max(0.0, 1.0 - abs(vP.x) / vQ.y);
    float streak = exp(-(vP.y * vP.y) / (vQ.z * vQ.z)) * sx * sx * sx;
    float sy = max(0.0, 1.0 - abs(vP.y) / (vQ.y * 0.28));
    float vert = exp(-(vP.x * vP.x) / (vQ.z * vQ.z * 0.5)) * sy * sy * sy * 0.35;
    float a = atan(vP.y, vP.x);
    float spikes = pow(abs(cos(a * 3.0 + seed)), 64.0) * exp(-r / (vQ.x * 2.5)) * vQ.w * 0.6;
    v = core + streak + vert + spikes;
    hot = exp(-(r * r) / (vQ.x * vQ.x * 0.12)) * 1.5;
  } else if (type == 2) {
    // God rays: shafts of light through haze. q: inner radius, outer radius,
    // ray count, sharpness. r: spin speed, then the half width, half height
    // and corner radius of the element they shine from behind (0 for none).
    // s: that element's centre, relative to the rays'.
    // A main layer of broad shafts and a finer one turning the other way,
    // each shaft with its own width, place, reach and slow breathing, so no
    // two look alike. Their roots melt into a soft glow instead of meeting in
    // a point, and dust drifting outward streaks them like light in smoke.
    float rn = r / vQ.y;
    if (rn < 1.0) {
      float t = time * vR.x;
      float u = atan(vP.y, vP.x) / (2.0 * PI) + 0.5;
      float w = 0.3 / sqrt(max(vQ.w, 1.0));
      // Widen near the root (in cells, by a fixed width in px), keeping the light.
      float n1 = max(vQ.z, 3.0);
      float n2 = floor(n1 * 1.7);
      float root1 = 0.5 * vQ.x * n1 / (2.0 * PI * max(r, 1.0));
      float root2 = 0.5 * vQ.x * n2 / (2.0 * PI * max(r, 1.0));
      // Each layer turns one of its cells for every 2 PI of t.
      float s = shafts(u + t / (2.0 * PI * n1), rn, n1, w, root1, time, seed)
              + 0.5 * shafts(u - 1.3 * t / (2.0 * PI * n2) + 0.37, rn * 1.25, n2, w * 0.6, root2, time * 1.3, seed + 19.7);
      // Haze: fine streaks along the shafts with motes drifting out, and
      // light that wanders slowly round the circle.
      float haze = (0.6 + 0.8 * pnoise(vec2(u * 64.0, rn * 6.0 - time * 0.3 + seed), 64.0))
                 * (0.55 + 0.9 * pnoise(vec2(u * 7.0 + seed, time * 0.15), 7.0));
      float reach = 1.0 - smoothstep(0.55, 1.0, rn);
      v = 2.0 * s * haze * reach * smoothstep(0.0, vQ.x * 1.5, r);
      // The source: a soft core in a wider haze, no hard point.
      float c = r / vQ.x;
      v += exp(-c * c * 0.6) * 0.3 + exp(-rn * 5.0) * 0.12 * reach;
      // Behind the element: a faint glow over it, the rays starting at its rim.
      if (vR.y > 0.0) {
        vec2 h = vR.yz;
        vec2 e = abs(vP - vS.xy) - h + vR.w;
        float d = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - vR.w;
        float soft = 8.0 + 0.2 * min(h.x, h.y);
        v *= mix(0.2, 1.0, smoothstep(-soft, soft * 0.6, d));
      }
    }
  } else if (type == 3) {
    // Glow around a rounded rectangle. q: half w, half h, corner radius, glow width.
    // r: flame 0-1, inner bleed 0-1.
    vec2 q = abs(vP) - vec2(vQ.x, vQ.y) + vQ.z;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vQ.z;
    // Flames lick upward: stronger above the element than below it.
    float up = smoothstep(vQ.y, -vQ.y - vQ.w, vP.y);
    v = outlineGlow(d, vQ.w, vR.x, vR.y, up, vP, time, seed, hot);
  } else if (type == 4) {
    // Portal vortex. q: radius.
    float rr = r / vQ.x;
    float twist = time * 1.4 + 2.2 / (rr + 0.18);
    vec2 sp = rot2(vP / vQ.x, twist) * 2.4;
    float n = fbm(sp + vec2(seed, 0.0));
    float n2 = fbm(rot2(vP / vQ.x, -time * 0.9 + 1.4 / (rr + 0.25)) * 4.0 + vec2(0.0, seed));
    float body = 1.0 - smoothstep(0.55, 1.0, rr);
    float rim = exp(-pow((rr - 0.9) / 0.09, 2.0)) * (0.6 + 0.8 * n2);
    float swirl = body * pow(n, 2.2) * 2.6 * smoothstep(0.05, 0.45, rr);
    v = swirl + rim * 1.2 + exp(-rr * rr * 7.0) * 0.8;
    hot = exp(-rr * rr * 16.0) * 0.9 + rim * 0.2;
  } else if (type == 5) {
    // Screen edge glow. q: width (px), noise, smoke, the smoke's pattern.
    // r: heat (the smoke's thickest threads, and a line along the very
    // edge), the smoke's clock (s), its evenness (0-1), its body (0-1).
    vec2 e = max(vHalf - abs(vP), 0.0);
    // Each edge's light, joined as light adds up: brighter into the corners,
    // and round there, with no seam along the diagonal. Read back as a
    // distance (d), that is the distance in from a frame with round corners.
    vec2 ge = exp(-e / vQ.x);
    float g = 1.0 - (1.0 - ge.x) * (1.0 - ge.y);
    float d = -log(max(g, 1e-6)) * vQ.x;
    // The smoke hugs the edges, and fades out fast past its width.
    float reach = exp(-pow(d / vQ.x, 1.6)) * vQ.z;
    if (g > 0.004 || reach > 0.004) {
      // (Its patches scale with the width: about 250 px at 60.)
      float n = fbm(vP * (0.25 / vQ.x) + vec2(seed, time * 0.35));
      v = g * mix(1.0, 0.3 + 1.4 * n, vQ.y) * (1.0 - 0.6 * min(vQ.z, 1.0));
      if (reach > 0.004) {
        // Smoke along the edges, drifting on its own clock (the same for
        // every beat of one countdown, so they all show one smoke): broad
        // slow billows, and finer threads curling over them where it is
        // thick. Thin, it is a deeper red; thick, warmer.
        float tt = vR.y;
        vec2 P = vP / (vQ.x * 0.8) + vQ.w * 7.0;
        vec2 w = vec2(fbm(P * 0.45 + vec2(0.0, tt * 0.25)), fbm(P * 0.45 + vec2(5.2, 1.3 - tt * 0.2)));
        // Its density, soft (never solid, even where thick) and, with
        // evenness (r.z), spread round the edges rather than in patches.
        float raw = fbm(P * 0.55 + 1.6 * w + vec2(tt * 0.05, 0.0));
        // Its body (r.w, 0-1) thins it toward see-through, and back.
        float billow = pow(smoothstep(0.22, 0.95, raw), mix(1.8, 1.3, vR.w));
        billow = mix(billow, 0.3 + 0.45 * raw, vR.z);
        float ridge = 1.0 - abs(2.0 * fbm(P * 1.1 + 2.4 * w + vec2(0.0, -tt * 0.12)) - 1.0);
        float thread = pow(ridge, 6.0) * smoothstep(0.15, 0.6, billow);
        float dens = (billow * 0.5 + thread * 0.6) * reach * mix(0.75, 1.15, vR.w);
        v += dens;
        col *= mix(vec3(1.0), mix(vec3(0.75, 0.55, 0.6), vec3(1.05, 1.2, 1.12), clamp(dens * 1.5, 0.0, 1.0)), clamp(reach * 3.0, 0.0, 1.0));
        hot = pow(ridge, 20.0) * billow * reach * vR.x;
      }
      // A hot line along the very edge.
      hot += exp(-d / (vQ.x * 0.08)) * 0.5 * vR.x;
    }
  } else if (type == 6) {
    // Soft radial flash. q: radius.
    v = exp(-(r * r) / (vQ.x * vQ.x));
  } else if (type == 8) {
    // Glow around a projected quad (an element turned in 3D). q, r: its four
    // corners relative to the centre, inset by the corner radius. s: corner
    // radius, glow width, flame, bleed.
    float d = sdQuad(vP, vQ.xy, vQ.zw, vR.xy, vR.zw) - vS.x;
    float top = min(min(vQ.y, vQ.w), min(vR.y, vR.w)) - vS.x;
    float bottom = max(max(vQ.y, vQ.w), max(vR.y, vR.w)) + vS.x;
    float up = smoothstep(bottom, top - vS.y, vP.y);
    v = outlineGlow(d, vS.y, vS.z, vS.w, up, vP, time, seed, hot);
  } else if (type == 9) {
    // Orbit: an aura around a disc (an avatar). Up to three motes of light
    // circle it on a tilted orbit, each trailing light along it; the far
    // side is dimmer and passes behind the disc, which hides it, and a glow
    // can seep out from behind the disc's edge. q: disc radius, orbit
    // radius, tilt (the orbit's height over its width), roll (rad). r: lead
    // mote's angle (rad; motes travel toward larger angles), mote count,
    // trail length (rad), mote radius. s: edge glow strength in w (x, y, z
    // unused). Lengths in CSS px. The motes' spacing and sizes are MOTES in
    // fx/orbit.ts, which places them the same way.
    const float LAG[3] = float[3](0.0, 2.25, 4.2);
    const float SIZE[3] = float[3](1.0, 0.78, 0.62);
    // Behind an open dialog the avatar blurs with the page, and its aura
    // with it: each Gaussian widens by the blur (see blurredLine), and each
    // hard edge (the disc's, a trail's start) softens by as much.
    float blur = vBehind * uBlur;
    float b2 = 2.0 * blur * blur;
    // What the disc lets through from behind it: 0 over it, 1 outside. (A
    // smoothstep of half width h spreads an edge with variance h^2 / 5; the
    // blur's adds to it.)
    float edge = sqrt(0.49 + 5.0 * blur * blur);
    float clear = smoothstep(vQ.x - edge, vQ.x + edge, r);
    vec2 ab = vec2(vQ.y, max(vQ.y * vQ.z, 0.01));
    vec2 p = rot2(vP, -vQ.w);
    // Distance to the orbit's ellipse (Inigo Quilez's approximation) and the
    // angle along it, counterclockwise on screen from its right end. Its
    // lower half is the near side.
    float k0 = length(p / ab);
    float k1 = length(p / (ab * ab));
    float d = k0 * (k0 - 1.0) / max(k1, 1e-4);
    float th = atan(-p.y / ab.y, p.x / ab.x);
    // CSS px along the orbit per radian of th, here.
    float ds = length(vec2(ab.x * sin(th), ab.y * cos(th)));
    float near = -sin(th);
    float seen = mix(clear, 1.0, smoothstep(-0.12, 0.12, near)) * (0.68 + 0.32 * near);
    for (int i = 0; i < 3; i++) {
      if (float(i) >= vR.y) break;
      float head = vR.x - LAG[i];
      float size = vR.w * SIZE[i];
      // The trail, along the orbit behind the head, thinning as it fades.
      // Blurred, it starts softly round the head, a little ahead of it too
      // (where lag is negative; a trail is shorter than half the orbit).
      float lag = mod(head - th, 2.0 * PI);
      if (blur > 0.0 && lag > PI) lag -= 2.0 * PI;
      if (lag < vR.z) {
        float u = max(lag, 0.0) / vR.z;
        float w = size * (0.8 - 0.5 * u);
        float t = blurredLine(d, w, blur) * (1.0 - u) * (1.0 - u) * 0.6 * seen;
        // (The blurred step: a logistic close to the Gaussian's CDF.)
        if (blur > 0.0) t /= 1.0 + exp(-1.702 * lag * ds / blur);
        v += t;
      }
      // The head: a hot core in a soft glow, a little bigger on the near
      // side; behind the disc, its light hides behind the disc's edge.
      float hn = -sin(head);
      float hs = size * (1.0 + 0.22 * hn);
      vec2 e = p - vec2(cos(head), -sin(head)) * ab;
      float ee = dot(e, e);
      float hseen = mix(clear, 1.0, smoothstep(-0.12, 0.12, hn)) * (0.68 + 0.32 * hn);
      // The core, its glow and its white heat: Gaussians hs, hs / sqrt(0.12) and hs / 2 wide.
      float hs2 = hs * hs;
      vec3 w2 = vec3(hs2, hs2 / 0.12, hs2 / 4.0);
      vec3 wb = w2 + b2;
      vec3 g = exp(-ee / wb) * w2 / wb;
      v += (g.x + 0.18 * g.y) * hseen;
      hot += g.z * hseen * 0.7;
    }
    // The glow from the disc's edge. (Blurred, its tail keeps its length:
    // only the edge, in clear, softens.)
    v += exp(-max(r - vQ.x, 0.0) / (1.2 + vQ.x * 0.12)) * vS.w * clear;
  } else if (type == 10) {
    // Fire rising off a rounded rectangle. q: half w, half h, corner radius,
    // flame height (px). r: blue 0-1, how far the rectangle's centre sits
    // below the quad's (the quad is shifted up over the flames). The colour is a gain on a black-body
    // ramp (deep red at the tips, through orange, to yellow at the roots),
    // or its blue counterpart.
    vec2 lp = vP - vec2(0.0, vR.y);
    vec2 hb = vQ.xy;
    float H = vQ.w;
    vec2 qq = abs(lp) - hb + vQ.z;
    float d = length(max(qq, 0.0)) + min(max(qq.x, qq.y), 0.0) - vQ.z;
    // Flames reach highest above the top, a little way up the ends, barely below.
    float up = 1.0 - smoothstep(-hb.y, hb.y, lp.y);
    float reach = H * (0.06 + 0.94 * up * up * up);
    // Past the tallest tongue (FIRE_REACH) or inside the element there's no
    // flame: skip the noise, and only the halo below is left.
    if (d < ${FIRE_REACH.toFixed(3)} * reach + 2.0 && d > -5.0) {
      // Turbulence scrolling upward, domain-warped so the tongues sway and split.
      vec2 p = lp * vec2(0.05, 0.028);
      vec2 warp = vec2(fbm(p * 0.8 + vec2(seed, time * 0.9)), fbm(p * 0.8 + vec2(seed + 4.1, time * 1.15)));
      float n = fbm(p + vec2(0.0, time * 2.4) + (warp - 0.5) * 1.8 + seed);
      float lick = vnoise(vec2(lp.x * 0.11 + seed * 3.0, lp.y * 0.04 + time * 3.2));
      float tongue = n * 0.8 + lick * 0.45;
      // 1 at the surface, falling to 0 at each tongue's tip.
      float f = clamp(1.0 - max(d, 0.0) / (reach * (0.15 + 1.25 * tongue * tongue) + 2.0), 0.0, 1.0);
      // The roots burn unevenly (hotter under a tongue) and dimmer along the bottom.
      float T = f * smoothstep(-5.0, 0.0, d) * mix(0.3, 1.0, up) * (0.45 + 0.75 * tongue);
      if (T > 0.002) {
        // Fine flicker inside the body, so it doesn't read as a flat fill.
        float flick = 0.7 + 0.6 * vnoise(vec2(lp.x * 0.12, lp.y * 0.07 + time * 6.0) + seed);
        // Light fades out toward the tips rather than ending on an edge.
        float I = T * T * flick * 1.8;
        // Black body: red first, green only as it heats up, a touch of blue at the
        // hottest; the tone map takes the brightest roots toward yellow-white.
        vec3 orange = vec3(1.0, 0.18 + 0.42 * T * T, 0.03 + 0.12 * T * T * T);
        vec3 blue = vec3(0.06 + 0.4 * T * T, 0.22 + 0.5 * T * T, 1.0);
        // A tinted fire (r.z): the tint at the tips, heating toward white at the roots.
        vec3 tinted = mix(vC * (0.4 + 0.6 * T), mix(vC, vec3(1.0), 0.55), T * T);
        col = (vR.z > 0.5 ? tinted : vC * mix(orange, blue, vR.x)) * I;
        v = 1.0;
      }
    }
    // A faint heat halo hugging the outline.
    float halo = exp(-abs(d) / (5.0 + H * 0.1)) * smoothstep(-6.0, 0.0, d) * 0.25;
    vec3 haloCol = vR.z > 0.5 ? vC * 0.45 : mix(vec3(0.5, 0.1, 0.02), vec3(0.04, 0.12, 0.5), vR.x);
    col = v > 0.0 ? col + vC * haloCol * halo : vC * haloCol;
    v = v > 0.0 ? 1.0 : halo;
  } else if (type == 11) {
    // A road flare burning: a white-hot heart in a flame of magenta and
    // crimson, licking upward and swaying, torn by turbulence that scrolls
    // up through it. q: heart radius, flame height, heat (how hard it burns
    // this moment, about 0-1.6), guttering (0-1: it shrinks and reddens).
    // The colour is in vC's red channel as a strength.
    float R = max(vQ.x, 1.0);
    float Hh = max(vQ.y, 1.0);
    float heat = vQ.z;
    float gut = vQ.w;
    float k = vC.r;
    vec2 p = vP;
    // How high this pixel is up the flame (0 at the heart, 1 at its reach).
    float up = clamp(-p.y / Hh, 0.0, 1.5);
    // The whole flame sways, more toward its tip.
    float sway = (fbm(vec2(time * 1.3 + seed, up * 1.5 - time * 0.7)) - 0.5) * Hh * 0.5 * up;
    vec2 fp = vec2(p.x - sway, p.y);
    float width = R * (1.5 + 0.5 * heat) * mix(1.0, 0.25, smoothstep(0.0, 1.0, up));
    // Turbulence scrolling upward, domain-warped so the tongues split and lick.
    vec2 np = vec2(fp.x / (R * 2.2), fp.y / (R * 3.0)) + vec2(seed, time * 3.4);
    vec2 warp = vec2(fbm(np * 0.6 + vec2(time * 0.8, seed)), fbm(np * 0.6 + vec2(seed + 3.3, time * 1.1)));
    float n = fbm(np + (warp - 0.5) * 1.6);
    float body;
    if (fp.y < 0.0) {
      float nx = fp.x / width;
      float reach = (0.45 + 0.55 * min(heat, 1.3)) * (1.0 - 0.6 * gut);
      float ny = up / max(reach, 0.05);
      float tongue = ny - (n - 0.45) * 1.1;
      body = exp(-nx * nx * 1.6) * clamp(1.0 - tongue, 0.0, 1.0);
    } else {
      // Below the heart: a short rounded base, where the flare's stick is.
      vec2 b = vec2(fp.x / width, fp.y / (R * 1.3));
      body = exp(-dot(b, b) * 1.8) * (0.75 + 0.5 * n);
    }
    body = clamp(body, 0.0, 1.0);
    float r2 = dot(p, p) / (R * R);
    float heart = exp(-r2 * 1.4);
    // Fine flicker inside the body, so it never reads as a flat fill.
    float flick = 0.75 + 0.5 * vnoise(vec2(fp.x / R, fp.y / R * 0.6 + time * 9.0) + seed);
    float T = body * flick;
    vec3 crimson = vec3(1.6, 0.1, 0.22);
    vec3 magenta = vec3(2.6, 0.45, 1.5);
    vec3 pinkHot = vec3(3.2, 1.6, 2.3);
    vec3 c = mix(crimson, magenta, smoothstep(0.15, 0.6, T * (1.0 - 0.5 * gut)));
    c = mix(c, pinkHot, smoothstep(0.6, 1.0, T) * (1.0 - gut));
    col = c * T * T * 1.4 * k;
    // The heart burns white, past what the tone map can hold.
    hot = heart * (2.2 + 1.6 * heat) * (1.0 - 0.6 * gut);
    col += magenta * heart * 0.6 * k;
    // A haze of its light round it.
    col += crimson * exp(-sqrt(r2) / 3.5) * 0.18 * k;
    v = 1.0;
  } else {
    // Sigil: an arcane circle that draws itself. q: radius, line width,
    // drawn 0-1, spin (rad/s).
    // Behind an open dialog its lines blur with the page (see blurredLine),
    // and its ticks and dashes fade toward their average.
    float R = vQ.x;
    float lw = vQ.y;
    float blur = vBehind * uBlur;
    vec2 p = rot2(vP, time * vQ.w + seed);
    float ang = atan(p.y, p.x);
    float lines = 0.0;
    lines += blurredLine(r - R, lw, blur);
    lines += 0.8 * blurredLine(r - R * 0.86, lw * 0.8, blur);
    lines += 0.5 * blurredLine(r - R * 0.44, lw * 0.7, blur);
    // Tick marks between the two outer rings (72 round it; |cos|^90 averages 0.084).
    float band = smoothstep(R * 0.87, R * 0.89, r) * (1.0 - smoothstep(R * 0.97, R * 0.99, r));
    float ticks = mix(0.084, pow(abs(cos(ang * 36.0)), 90.0), blurKeeps(2.0 * PI * r / 72.0, blur));
    lines += band * ticks * 1.2;
    // Rune notches: each of 12 sectors gets its own pattern of dashes (half on, in its middle 64%).
    float sector = floor((ang + PI) / (2.0 * PI) * 12.0);
    float h = hash12(vec2(sector, seed));
    float local = fract((ang + PI) / (2.0 * PI) * 12.0);
    float n = 2.0 + floor(h * 3.0);
    float dash = step(0.18, local) * step(local, 0.82) * mix(0.5, step(0.5, fract(local * n + h)), blurKeeps(2.0 * PI * r / 12.0 / n, blur));
    float runeBand = blurredLine(r - R * 0.93, lw * 1.3, blur);
    lines += dash * runeBand * 0.9;
    // A hexagram inside.
    float tri = min(abs(sdTri(p, R * 0.73)), abs(sdTri(vec2(p.x, -p.y), R * 0.73)));
    lines += 0.75 * blurredLine(tri, lw * 0.8, blur);
    // Draw on around the circle.
    float at = fract((ang + PI) / (2.0 * PI) + 0.25);
    float drawn = 1.0 - smoothstep(vQ.z - 0.02, vQ.z, at);
    v = lines * drawn;
    v += blurredLine(r - R, lw * 6.0, blur) * 0.15;
  }
  // Behind the picture: only a faint glow over it, none of the white heat,
  // and a little less light right around it.
  if (vPicture > 0.5) {
    float c = silhouetteAt(vWorld);
    float near = silhouetteNear(vWorld);
    v *= mix(1.0, 0.2, c) * mix(1.0, 0.55, near);
    hot *= (1.0 - c) * (1.0 - near);
  }
  // Fade everything to zero before the quad's border, so no long tail can
  // show the quad's edge. (The edge glow's quad is the screen itself.)
  if (type != 5) {
    vec2 e = abs(vP) / vHalf;
    float win = (1.0 - smoothstep(0.72, 1.0, e.x)) * (1.0 - smoothstep(0.72, 1.0, e.y));
    v *= win;
    hot *= win;
  }
  vec3 lit = (col * v + vec3(1.0, 0.95, 0.85) * hot * max(max(col.r, col.g), col.b)) * (1.0 - vBehind * hiddenAt(vWorld)) * (1.0 - vUi * coverAt(vWorld));
  o = vec4(lit, vUi * coverLum(lit));
}`;

const FULL_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
out vec2 vUv;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`;

// Call of Duty: Advanced Warfare style 13-tap downsample. The first level
// weights each block by 1 / (1 + luma) (Karis average) so single hot pixels
// can't flicker the whole bloom. Alpha (the share from behind the UI, see
// COVER) is carried with the same weights.
const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uKaris;
out vec4 o;
vec4 s(vec2 off) { return texture(uSrc, vUv + off * uTexel); }
float w(vec4 c) { return mix(1.0, 1.0 / (1.0 + dot(c.rgb, vec3(0.2126, 0.7152, 0.0722))), uKaris); }
void main() {
  vec4 a = s(vec2(-2, -2)), b = s(vec2(0, -2)), c = s(vec2(2, -2));
  vec4 d = s(vec2(-1, -1)), e = s(vec2(1, -1));
  vec4 f = s(vec2(-2, 0)), g = s(vec2(0, 0)), h = s(vec2(2, 0));
  vec4 i = s(vec2(-1, 1)), j = s(vec2(1, 1));
  vec4 k = s(vec2(-2, 2)), l = s(vec2(0, 2)), m = s(vec2(2, 2));
  vec4 g0 = (d + e + i + j) * 0.25;
  vec4 g1 = (a + b + f + g) * 0.25;
  vec4 g2 = (b + c + g + h) * 0.25;
  vec4 g3 = (f + g + k + l) * 0.25;
  vec4 g4 = (g + h + l + m) * 0.25;
  float w0 = w(g0) * 0.5, w1 = w(g1) * 0.125, w2 = w(g2) * 0.125, w3 = w(g3) * 0.125, w4 = w(g4) * 0.125;
  o = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
}`;

const UP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
out vec4 o;
void main() {
  vec2 t = uTexel * uRadius;
  vec4 c = texture(uSrc, vUv) * 4.0;
  c += (texture(uSrc, vUv + vec2(-t.x, 0.0)) + texture(uSrc, vUv + vec2(t.x, 0.0))
      + texture(uSrc, vUv + vec2(0.0, -t.y)) + texture(uSrc, vUv + vec2(0.0, t.y))) * 2.0;
  c += texture(uSrc, vUv - t) + texture(uSrc, vUv + t)
     + texture(uSrc, vUv + vec2(-t.x, t.y)) + texture(uSrc, vUv + vec2(t.x, -t.y));
  o = c / 16.0;
}`;

// Copies the shapes (drawn at lower resolution) into the HDR target, with
// their share from behind the UI (see COVER).
const COPY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
out vec4 o;
void main() {
  o = texture(uSrc, vUv);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHdr;
uniform sampler2D uBloom;
uniform float uBloomAmt;
uniform float uHasBloom;
uniform float uExposure;
uniform vec2 uView;    // CSS px
uniform float uDim;    // how far an open dialog dims the page, 0-1
out vec4 o;
${BEHIND_DIALOG}
${COVER}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 hdr = texture(uHdr, vUv).rgb;
  if (uHasBloom > 0.5) {
    vec4 b = texture(uBloom, vUv);
    // Over the UI's boxes, only the share of the bloom from behind the UI is hidden (see COVER).
    float behind = clamp(b.a / max(coverLum(b.rgb), 1e-4), 0.0, 1.0);
    hdr += b.rgb * uBloomAmt * (1.0 - behind * coverAt(vec2(vUv.x, 1.0 - vUv.y) * uView));
  }
  // Per-channel exponential tone map: linear for faint light, saturating
  // smoothly, so orange sparks burn through yellow toward white.
  vec3 c = 1.0 - exp(-max(hdr, 0.0) * uExposure);
  // Outside an open dialog, light falls on the dimmed page and dims with it.
  if (uDim > 0.0) {
    float sdf = dialogSdf(vec2(vUv.x, 1.0 - vUv.y) * uView);
    c *= 1.0 - ${DIALOG_DIM.toFixed(3)} * uDim * clamp(sdf + 0.5, 0.0, 1.0);
  }
  // TPDF dither, only where there is light, so empty pixels stay exactly 0;
  // in full from half a level up, so a wide faint glow's last few levels
  // (most of its area) dither too rather than band.
  float peak = max(max(c.r, c.g), c.b);
  float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 71.3) - 1.0;
  c = max(c + n * smoothstep(0.0, 0.5 / 255.0, peak) / 255.0, 0.0);
  // Premultiplied: alpha as high as the brightest channel keeps the colour
  // valid; plus-lighter then adds it to the page.
  o = vec4(c, max(max(c.r, c.g), c.b));
}`;

export type RendererOptions = { maxParticles: number; maxShapes: number };

/**
 * A picture effects shine from behind, so they leave its own shape clear (an
 * item's outline, not its box): what it's drawn from (an image, or a canvas
 * it was put together on) and a key that changes whenever that does, its
 * centre and size in CSS px as laid out, its x scale (-1 to 1) while it
 * turns round, and its opacity.
 */
export type Silhouette = { pic: HTMLImageElement | HTMLCanvasElement; key: string; x: number; y: number; w: number; h: number; flip: number; alpha: number };

/** Whether a silhouette's picture can be drawn: loaded, and not empty. */
export function pictureReady(pic: HTMLImageElement | HTMLCanvasElement) {
  return pic instanceof HTMLImageElement ? pic.complete && pic.naturalWidth > 0 : pic.width > 0 && pic.height > 0;
}

/** Longest side of the silhouette texture, and the blur over it, in its px. */
// Fine enough that thin items (a spear's shaft) keep most of their alpha.
const SIL_SIZE = 256;
const SIL_BLUR = 2.5;

/**
 * How far the bloom carries light, in texels of its smallest level: each
 * step, down or up, spreads it about 5 texels of the finer of the two levels,
 * which adds up to about 10 texels of the smallest one. Past that, all it
 * adds is exactly 0. (This leaves some to spare.)
 */
const BLOOM_REACH = 12;

/** CSS px per texel of the UI's mask (see setCover). */
const COVER_GRID = 4;
/** A soft cover's layers where the canvas can't blur (older Safari): padding (mask px) and alpha, about 0.6 where all four lie. */
const SOFT_LAYERS: [number, number][] = [
  [0.5, 0.2],
  [0, 0.2],
  [-0.5, 0.2],
  [-1, 0.2],
];

/**
 * What the UI's mask is drawn from (see setCover), as a key that changes only
 * when it would: the view, and each box's place, size and corners to the
 * mask's own grid (its soft flag as it is).
 */
export function coverKey(boxes: readonly number[], view: readonly [number, number]): string {
  let key = `${view[0]}x${view[1]}:`;
  for (let i = 0; i < boxes.length; i++) key += (i % 9 === 4 ? boxes[i] : Math.round(boxes[i] / COVER_GRID)) + ',';
  return key;
}

/** An open dialog (lib/behindDialog.ts): how far it dims the page, and its box and corner radius in CSS px. */
export type DialogLight = { amount: number; box: DOMRect | null; radius: number };
const NO_DIALOG: DialogLight = { amount: 0, box: null, radius: 0 };

export class FxRenderer {
  private gl: WebGL2RenderingContext;
  private particleProg: Program;
  private shapeProg: Program;
  private downProg: Program;
  private upProg: Program;
  private compProg: Program;
  private copyProg: Program;
  private particleVao: WebGLVertexArrayObject;
  private shapeVao: WebGLVertexArrayObject;
  private fullVao: WebGLVertexArrayObject;
  private particleBuf: WebGLBuffer;
  private shapeBuf: WebGLBuffer;
  private hdr: Target | null = null;
  /** Shapes are soft, so they're drawn at about one texel per CSS px, not per device px. */
  private shapesT: Target | null = null;
  private mips: Target[] = [];
  private internal: number;
  private texType: number;
  private hdrFloat: boolean;
  width = 0;
  height = 0;
  bloom = true;
  private cleared = false;
  private silTex: WebGLTexture | null = null;
  /** The picture in silTex (by its silhouette's key, so a picture gone from the page isn't kept), and how much of the texture it covers. */
  private silKey = '';
  private silFit: [number, number] = [1, 1];
  /** A picture that couldn't be read (another origin, say): not tried again every frame. */
  private silFailed = '';
  /** The UI's boxes light from behind it hides behind (see COVER): their mask, what it was drawn from, and whether it's set. */
  private coverTex: WebGLTexture | null = null;
  private coverCanvas: HTMLCanvasElement | null = null;
  private coverKey = '';
  private coverOn = false;
  private coverView: [number, number] = [1, 1];
  private coverShift: [number, number] = [0, 0];
  /** Whether the 2D canvas can blur (older Safari can't): asked once, before the first `filter` is set. */
  private coverBlur: boolean | null = null;

  /**
   * Begins making the renderer on `canvas`: its context at once, its shaders
   * compiled in the background, without blocking the page (buildPrograms in
   * gl.ts). `ready` gets the renderer, or null if a shader failed. Returns
   * the build (to cancel it, or finish it at once), or null without WebGL2.
   */
  static start(canvas: HTMLCanvasElement, opts: RendererOptions, ready: (r: FxRenderer | null) => void): Build | null {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
    });
    if (!gl) return null;
    const sources = (
      [
        ['particles', PARTICLE_VS, PARTICLE_FS],
        ['shapes', SHAPE_VS, SHAPE_FS],
        ['bloom-down', FULL_VS, DOWN_FS],
        ['bloom-up', FULL_VS, UP_FS],
        ['composite', FULL_VS, COMPOSITE_FS],
        ['copy', FULL_VS, COPY_FS],
      ] as const
    ).map(([name, vs, fs]) => ({ vs, fs, label: `FX program "${name}"` }));
    // Whether it can draw to half floats: asked in a step of its own, a
    // frame after the context and once the GPU has caught up
    // (whenGpuCaughtUp), before the shaders start. (It waits on the GPU
    // process, and on a software GPU takes a while even then: asked with
    // the context, it made that step longer; asked as the shaders were
    // read, it waited behind them too.)
    let float = false;
    let build: Build | null = null;
    const begin = () => {
      float = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
      build = buildPrograms(gl, sources, (progs) => {
        let r: FxRenderer | null = null;
        try {
          if (progs) r = new FxRenderer(gl, opts, progs.map((p) => wrapProgram(gl, p)), float);
        } catch (e) {
          console.warn(e);
          for (const p of progs ?? []) gl.deleteProgram(p);
        }
        if (!r) console.warn('FX renderer unavailable; effects are off.');
        ready(r);
      });
    };
    let stopCatchUp: (() => void) | null = null;
    let raf = requestAnimationFrame(() => {
      raf = 0;
      let ran = false;
      const cancel = whenGpuCaughtUp(() => {
        ran = true;
        stopCatchUp = null;
        begin();
      });
      if (!ran) stopCatchUp = cancel;
    });
    const wait = () => {
      cancelAnimationFrame(raf);
      stopCatchUp?.();
      stopCatchUp = null;
    };
    return {
      cancel() {
        wait();
        build?.cancel();
      },
      now() {
        wait();
        if (!build) begin();
        build!.now();
      },
    };
  }

  /** Makes the renderer at once, waiting for its shaders to compile (for tests). */
  static create(canvas: HTMLCanvasElement, opts: RendererOptions): FxRenderer | null {
    let made: FxRenderer | null = null;
    FxRenderer.start(canvas, opts, (r) => (made = r))?.now();
    return made;
  }

  private constructor(gl: WebGL2RenderingContext, opts: RendererOptions, programs: Program[], float: boolean) {
    this.gl = gl;
    this.hdrFloat = float;
    this.internal = float ? gl.RGBA16F : gl.RGBA8;
    this.texType = float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    const [p, s, d, u, c, k] = programs;
    this.copyProg = k;
    this.particleProg = p;
    this.shapeProg = s;
    this.downProg = d;
    this.upProg = u;
    this.compProg = c;

    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const withQuad = () => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return vao;
    };
    const instanced = (buf: WebGLBuffer, vec4s: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      for (let k = 0; k < vec4s; k++) {
        gl.enableVertexAttribArray(1 + k);
        gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, vec4s * 16, k * 16);
        gl.vertexAttribDivisor(1 + k, 1);
      }
    };

    this.particleBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, opts.maxParticles * INSTANCE_FLOATS * 4, gl.DYNAMIC_DRAW);
    this.particleVao = withQuad();
    instanced(this.particleBuf, INSTANCE_FLOATS / 4);

    this.shapeBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shapeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, opts.maxShapes * SHAPE_FLOATS * 4, gl.DYNAMIC_DRAW);
    this.shapeVao = withQuad();
    instanced(this.shapeBuf, SHAPE_FLOATS / 4);

    this.fullVao = withQuad();
    gl.bindVertexArray(null);
  }

  get isLost() {
    return this.gl.isContextLost();
  }

  /** Resizes the drawing buffer and the HDR, shape and bloom targets (shapes at `shapeScale` of the buffer). */
  resize(w: number, h: number, shapeScale = 1) {
    const gl = this.gl;
    w = Math.max(1, w);
    h = Math.max(1, h);
    const sw = Math.max(1, Math.round(w * shapeScale));
    const sh = Math.max(1, Math.round(h * shapeScale));
    const shapesFit = this.shapesT ? this.shapesT.w === sw && this.shapesT.h === sh : sw === w && sh === h;
    if (w === this.width && h === this.height && this.hdr && shapesFit) return;
    this.width = w;
    this.height = h;
    gl.canvas.width = w;
    gl.canvas.height = h;
    dropTarget(gl, this.hdr);
    dropTarget(gl, this.shapesT);
    for (const m of this.mips) dropTarget(gl, m);
    this.hdr = target(gl, w, h, this.internal, this.texType);
    // At the same size as the HDR target (phones, 1x screens) the shapes go
    // straight into it: a target of their own would only cost a copy.
    this.shapesT = sw === w && sh === h ? null : target(gl, sw, sh, this.internal, this.texType);
    this.mips = [];
    let mw = w >> 1;
    let mh = h >> 1;
    while (this.mips.length < 5 && mw >= 8 && mh >= 8) {
      this.mips.push(target(gl, mw, mh, this.internal, this.texType));
      mw >>= 1;
      mh >>= 1;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cleared = false;
  }

  /** Clears the visible canvas once, then does nothing until there is something to draw. */
  clear() {
    if (this.cleared) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.cleared = true;
  }

  /**
   * Draws one frame. `view` is the canvas size in CSS px, `dpr` device pixels
   * per CSS px of the drawing buffer. The last `nCrisp` of the shapes are
   * drawn at full resolution (thin lines); the rest at reduced resolution.
   * `dialog` is the open dialog, if any (see BEHIND_DIALOG).
   */
  draw(
    view: [number, number],
    dpr: number,
    particles: Float32Array,
    nParticles: number,
    shapes: Float32Array,
    nShapes: number,
    nCrisp = 0,
    dialog: DialogLight = NO_DIALOG,
    silhouette: Silhouette | null = null,
  ) {
    const gl = this.gl;
    if (!this.hdr) return;
    this.cleared = false;
    const sil = silhouette && this.loadSilhouette(silhouette) ? silhouette : null;
    const shapeUniforms = () => {
      const p = this.shapeProg;
      gl.uniform2f(p.u('uView'), view[0], view[1]);
      behindDialog(p, true);
      cover(p);
      // Always on its own unit: left on unit 0, the sampler could point at
      // the target being drawn into, which WebGL refuses to draw.
      gl.uniform1i(p.u('uSil'), 2);
      gl.uniform1f(p.u('uSilOn'), sil ? sil.alpha : 0);
      if (!sil) return;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.silTex);
      gl.uniform4f(p.u('uSilBox'), sil.x, sil.y, sil.w / 2, sil.h / 2);
      gl.uniform1f(p.u('uSilFlip'), sil.flip);
      gl.uniform2f(p.u('uSilFit'), this.silFit[0], this.silFit[1]);
      gl.activeTexture(gl.TEXTURE0);
    };
    // The UI's boxes, on unit 3 (see COVER).
    const cover = (p: Program) => {
      gl.uniform1i(p.u('uCover'), 3);
      gl.uniform1f(p.u('uCoverOn'), this.coverOn ? 1 : 0);
      gl.uniform2f(p.u('uCoverView'), this.coverView[0], this.coverView[1]);
      gl.uniform2f(p.u('uCoverShift'), this.coverShift[0], this.coverShift[1]);
    };
    if (this.coverOn) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.coverTex);
      gl.activeTexture(gl.TEXTURE0);
    }
    // Without a dialog box, nothing is hidden and everything is dimmed.
    const b = dialog.box;
    const behindDialog = (p: Program, hide: boolean) => {
      if (b) gl.uniform4f(p.u('uDialogBox'), b.left, b.top, b.right, b.bottom);
      else gl.uniform4f(p.u('uDialogBox'), -1, -1, -1, -1);
      gl.uniform1f(p.u('uDialogR'), dialog.radius);
      gl.uniform1f(p.u('uHide'), hide && b ? dialog.amount : 0);
      gl.uniform1f(p.u('uBlur'), DIALOG_BLUR * dialog.amount);
    };

    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    // The full-screen passes (copy, bloom, composite) only need to cover the
    // light and as far as the bloom can carry it; past that every pass gives
    // exactly 0. Each target is cleared whole, then drawn within its share
    // of that area.
    const bloom = this.bloom && this.mips.length > 0;
    const area = this.litArea(view, dpr, particles, nParticles, shapes, nShapes, bloom ? BLOOM_REACH * 2 ** this.mips.length : 4);
    const within = (t: { w: number; h: number }, clear: boolean) => {
      if (!area) return;
      gl.disable(gl.SCISSOR_TEST);
      if (clear) gl.clear(gl.COLOR_BUFFER_BIT);
      const kx = t.w / this.width;
      const ky = t.h / this.height;
      const x = Math.floor(area[0] * kx);
      const y = Math.floor(area[1] * ky);
      gl.scissor(x, y, Math.ceil(area[2] * kx) - x, Math.ceil(area[3] * ky) - y);
      gl.enable(gl.SCISSOR_TEST);
    };

    // Without a shape target of their own, every shape is drawn at full
    // resolution below, soft and crisp alike.
    if (!this.shapesT) nCrisp = nShapes;
    const nSoft = nShapes - nCrisp;
    if (nSoft > 0 && this.shapesT) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shapeBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, shapes, 0, nSoft * SHAPE_FLOATS);
      // Shapes first, into their own lower-resolution target...
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shapesT.fbo);
      gl.viewport(0, 0, this.shapesT.w, this.shapesT.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.shapeProg.prog);
      shapeUniforms();
      gl.bindVertexArray(this.shapeVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nSoft);
      // ...then filtered up into the HDR target, which they fill completely.
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdr.fbo);
      gl.viewport(0, 0, this.width, this.height);
      within(this.hdr, true);
      gl.useProgram(this.copyProg.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shapesT.tex);
      gl.uniform1i(this.copyProg.u('uSrc'), 0);
      gl.bindVertexArray(this.fullVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdr.fbo);
      gl.viewport(0, 0, this.width, this.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    if (nCrisp > 0) {
      // Thin-line shapes straight into the full-resolution target.
      gl.useProgram(this.shapeProg.prog);
      shapeUniforms();
      gl.bindVertexArray(this.shapeVao);
      // (Uploaded after the soft ones were drawn; WebGL keeps the order.)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shapeBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, shapes, nSoft * SHAPE_FLOATS, nCrisp * SHAPE_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nCrisp);
    }
    if (nParticles > 0) {
      gl.useProgram(this.particleProg.prog);
      gl.uniform2f(this.particleProg.u('uView'), view[0], view[1]);
      gl.uniform1f(this.particleProg.u('uMinPx'), 0.85 / dpr);
      behindDialog(this.particleProg, true);
      cover(this.particleProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, particles, 0, nParticles * INSTANCE_FLOATS);
      gl.bindVertexArray(this.particleVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nParticles);
    }

    gl.bindVertexArray(this.fullVao);
    if (bloom) {
      gl.disable(gl.BLEND);
      gl.useProgram(this.downProg.prog);
      let src: Target = this.hdr;
      this.mips.forEach((m, i) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
        gl.viewport(0, 0, m.w, m.h);
        within(m, true);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(this.downProg.u('uSrc'), 0);
        gl.uniform2f(this.downProg.u('uTexel'), 1 / src.w, 1 / src.h);
        gl.uniform1f(this.downProg.u('uKaris'), i === 0 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        src = m;
      });
      // Upsample back up the chain, adding each blurred level onto the next.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.upProg.prog);
      for (let i = this.mips.length - 1; i > 0; i--) {
        const from = this.mips[i];
        const to = this.mips[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
        gl.viewport(0, 0, to.w, to.h);
        within(to, false);
        gl.bindTexture(gl.TEXTURE_2D, from.tex);
        gl.uniform1i(this.upProg.u('uSrc'), 0);
        gl.uniform2f(this.upProg.u('uTexel'), 1 / from.w, 1 / from.h);
        gl.uniform1f(this.upProg.u('uRadius'), 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    within(this.hdr, true);
    gl.useProgram(this.compProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.hdr.tex);
    gl.uniform1i(this.compProg.u('uHdr'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloom ? this.mips[0].tex : this.hdr.tex);
    gl.uniform1i(this.compProg.u('uBloom'), 1);
    gl.uniform1f(this.compProg.u('uHasBloom'), bloom ? 1 : 0);
    // The mip sum carries every level once; scale it to a gentle halo.
    gl.uniform1f(this.compProg.u('uBloomAmt'), bloom ? 0.55 / this.mips.length : 0);
    gl.uniform1f(this.compProg.u('uExposure'), this.hdrFloat ? 1 : 1.2);
    gl.uniform2f(this.compProg.u('uView'), view[0], view[1]);
    gl.uniform1f(this.compProg.u('uDim'), dialog.amount);
    behindDialog(this.compProg, false);
    cover(this.compProg);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  /**
   * The part of the HDR target this frame can light, widened by `margin` px:
   * (left, bottom, right, top) in its px, from its bottom-left corner as GL
   * counts. Null when that's most of the screen anyway.
   */
  private litArea(
    view: [number, number],
    dpr: number,
    particles: Float32Array,
    nParticles: number,
    shapes: Float32Array,
    nShapes: number,
    margin: number,
  ): [number, number, number, number] | null {
    // In CSS px: each shape's quad, and a box round each particle's quad
    // (see PARTICLE_VS; a glint's reaches 4.5 widths, so its corners 6.4).
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < nShapes; i++) {
      const o = i * SHAPE_FLOATS;
      x0 = Math.min(x0, shapes[o] - shapes[o + 2]);
      x1 = Math.max(x1, shapes[o] + shapes[o + 2]);
      y0 = Math.min(y0, shapes[o + 1] - shapes[o + 3]);
      y1 = Math.max(y1, shapes[o + 1] + shapes[o + 3]);
    }
    const minPx = 0.85 / dpr;
    for (let i = 0; i < nParticles; i++) {
      const o = i * INSTANCE_FLOATS;
      const shape = particles[o + 7];
      // A spark streaks half its stretch along its velocity; a coin's flip is at most 1.
      const len = shape === 1 ? 0.5 * Math.hypot(particles[o + 2], particles[o + 3]) * Math.abs(particles[o + 5]) : shape === 6 ? 1 : 0;
      const r = len + 6.5 * Math.max(particles[o + 4], minPx);
      x0 = Math.min(x0, particles[o] - r);
      x1 = Math.max(x1, particles[o] + r);
      y0 = Math.min(y0, particles[o + 1] - r);
      y1 = Math.max(y1, particles[o + 1] + r);
    }
    const kx = this.width / view[0];
    const ky = this.height / view[1];
    const left = Math.max(0, Math.floor(x0 * kx) - margin);
    const right = Math.min(this.width, Math.ceil(x1 * kx) + margin);
    const bottom = Math.max(0, this.height - Math.ceil(y1 * ky) - margin);
    const top = Math.min(this.height, this.height - Math.floor(y0 * ky) + margin);
    if (!(right > left && top > bottom)) return null;
    if ((right - left) * (top - bottom) > 0.75 * this.width * this.height) return null;
    return [left, bottom, right, top];
  }

  /**
   * Sets the UI's boxes that light from behind it hides behind (see COVER):
   * `boxes` as (left, top, width, height, soft, and the four corners' radii)
   * in CSS px, in a view `view` CSS px across; null for none. Each is drawn
   * in its own shape, its corners rounded. Drawn as a mask at a quarter of the view's
   * size (the light needs no more), and again only when they move a texel
   * of it or more (see coverKey). A box's
   * edge is softened by a few px, so the light fades out over it (its rim
   * light); a soft one's (text) far more, and not all the way, so no box shows round it.
   */
  setCover(boxes: number[] | null, view: [number, number]) {
    this.coverShift = [0, 0];
    if (!boxes || !boxes.length) {
      this.coverOn = false;
      return;
    }
    const K = COVER_GRID;
    const key = coverKey(boxes, view);
    this.coverOn = true;
    if (key === this.coverKey) return;
    this.coverKey = key;
    this.coverView = view;
    const c = (this.coverCanvas ??= document.createElement('canvas'));
    const w = Math.max(1, Math.ceil(view[0] / K));
    const h = Math.max(1, Math.ceil(view[1] / K));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    if (!ctx) {
      this.coverOn = false;
      this.coverKey = '';
      return;
    }
    // (A canvas without `filter` has no such property until it's set.)
    this.coverBlur ??= typeof ctx.filter === 'string';
    ctx.clearRect(0, 0, w, h);
    for (const soft of [0, 1]) {
      // Each layer: its padding (mask px) and alpha. Text is hidden only
      // mostly: a full shadow round a line of it would show as a dark plate.
      // Without a blur, a soft edge is built of faint layers stepping in
      // from a narrower padding, which come to about the same in the middle.
      let layers: [number, number][];
      if (this.coverBlur) {
        ctx.filter = soft ? 'blur(4px)' : 'blur(1px)';
        layers = [[soft ? 2 : 0, soft ? 0.7 : 1]];
      } else layers = soft ? SOFT_LAYERS : [[0, 1]];
      for (const [pad, alpha] of layers) {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        for (let i = 0; i + 8 < boxes.length; i += 9) {
          if (boxes[i + 4] !== soft) continue;
          const x = boxes[i] / K - pad;
          const y = boxes[i + 1] / K - pad;
          const w = boxes[i + 2] / K + 2 * pad;
          const h = boxes[i + 3] / K + 2 * pad;
          if (!(w > 0 && h > 0)) continue;
          const radii = [boxes[i + 5], boxes[i + 6], boxes[i + 7], boxes[i + 8]].map((r) => Math.max(0, Math.min(r / K + pad, w / 2, h / 2)));
          if (radii.some((r) => r > 0) && typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, radii);
            ctx.fill();
          } else ctx.fillRect(x, y, w, h);
        }
      }
    }
    const gl = this.gl;
    this.coverTex ??= gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.coverTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Whether the UI's mask is set (see setCover). */
  get hasCover() {
    return this.coverOn;
  }

  /** Moves the mask setCover drew by (dx, dy) CSS px, the UI having moved that far since (a shake), rather than drawing it again. */
  shiftCover(dx: number, dy: number) {
    this.coverShift = [dx, dy];
  }

  /** Makes the silhouette's picture the silhouette texture, unless it is already. Returns whether it's ready (loaded, and readable). */
  private loadSilhouette({ pic, key }: Silhouette): boolean {
    if (key === this.silKey) return true;
    if (key === this.silFailed || !pictureReady(pic)) return false;
    if (!this.makeSilhouette(pic)) {
      this.silFailed = key;
      return false;
    }
    this.silKey = key;
    return true;
  }

  /** Draws `pic`'s alpha, blurred, into silTex, with a margin for the blur to spread into. False if it can't be read. */
  private makeSilhouette(pic: HTMLImageElement | HTMLCanvasElement): boolean {
    const [pw, ph] = pic instanceof HTMLImageElement ? [pic.naturalWidth, pic.naturalHeight] : [pic.width, pic.height];
    const k = SIL_SIZE / Math.max(pw, ph);
    const w = Math.max(1, Math.round(pw * k));
    const h = Math.max(1, Math.round(ph * k));
    const pad = Math.ceil(SIL_BLUR * 3);
    const c = document.createElement('canvas');
    c.width = w + pad * 2;
    c.height = h + pad * 2;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.filter = `blur(${SIL_BLUR}px)`;
    ctx.drawImage(pic, pad, pad, w, h);
    const gl = this.gl;
    this.silTex ??= gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.silTex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    } catch {
      gl.activeTexture(gl.TEXTURE0);
      return false;
    }
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    this.silFit = [w / c.width, h / c.height];
    return true;
  }

  destroy() {
    const gl = this.gl;
    if (this.silTex) gl.deleteTexture(this.silTex);
    if (this.coverTex) gl.deleteTexture(this.coverTex);
    dropTarget(gl, this.hdr);
    dropTarget(gl, this.shapesT);
    for (const m of this.mips) dropTarget(gl, m);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
