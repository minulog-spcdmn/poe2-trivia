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
import { NOISE, dropTarget, program, target, type Program, type Target } from './gl';
import { DIALOG_DIM } from '../behindDialog';

/** Floats per shape instance: five vec4s (see ShapeType). */
export const SHAPE_FLOATS = 24;

/**
 * Procedural shapes. Instance layout:
 *   s0: centre x, centre y, quad half width, quad half height (CSS px)
 *   s1: type, progress 0-1, age (s), seed
 *   s2: r, g, b (HDR, envelope applied), flags: 1 for the page's light (see
 *       BEHIND_DIALOG), plus BEHIND_PICTURE when it shines from behind the
 *       picture in uSil (see Silhouette)
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
} as const;
export type ShapeType = (typeof ShapeType)[keyof typeof ShapeType];

/** Shape flag (s2.w): it shines from behind the picture in uSil (see Silhouette). */
export const BEHIND_PICTURE = 2;

// While a dialog is open (lib/behindDialog.ts), light from the page behind it
// hides behind the dialog, which on the page is opaque; the dialog's own light
// (from effects that started inside it) shows over it. Outside it, the
// composite dims both with the rest of the page.
const BEHIND_DIALOG = `
uniform vec4 uDialogBox; // the open dialog: left, top, right, bottom (CSS px)
uniform float uDialogR;  // its corner radius, CSS px
uniform float uHide;     // how far it hides the page's light, 0-1
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
  o = vec4(vCol * v * (1.0 - vP.w * hiddenAt(vWorld)), 0.0);
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
  vPicture = step(${BEHIND_PICTURE}.0, s2.w);
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
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
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
  float a = atan(vP.y, vP.x);
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
      float u = a / (2.0 * PI) + 0.5;
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
    // Screen edge glow. q: width (px), noise.
    vec2 e = vHalf - abs(vP);
    float d = min(e.x, e.y);
    float g = exp(-d / vQ.x);
    if (g > 0.004) {
      float n = fbm(vP * 0.004 + vec2(seed, time * 0.35));
      v = g * mix(1.0, 0.3 + 1.4 * n, vQ.y);
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
    // What the disc lets through from behind it: 0 over it, 1 outside.
    float clear = smoothstep(vQ.x - 0.7, vQ.x + 0.7, r);
    vec2 ab = vec2(vQ.y, max(vQ.y * vQ.z, 0.01));
    vec2 p = rot2(vP, -vQ.w);
    // Distance to the orbit's ellipse (Inigo Quilez's approximation) and the
    // angle along it, counterclockwise on screen from its right end. Its
    // lower half is the near side.
    float k0 = length(p / ab);
    float k1 = length(p / (ab * ab));
    float d = k0 * (k0 - 1.0) / max(k1, 1e-4);
    float th = atan(-p.y / ab.y, p.x / ab.x);
    float near = -sin(th);
    float seen = mix(clear, 1.0, smoothstep(-0.12, 0.12, near)) * (0.68 + 0.32 * near);
    for (int i = 0; i < 3; i++) {
      if (float(i) >= vR.y) break;
      float head = vR.x - LAG[i];
      float size = vR.w * SIZE[i];
      // The trail, along the orbit behind the head, thinning as it fades.
      float lag = mod(head - th, 2.0 * PI);
      if (lag < vR.z) {
        float u = lag / vR.z;
        float w = size * (0.8 - 0.5 * u);
        v += exp(-d * d / (w * w)) * (1.0 - u) * (1.0 - u) * 0.6 * seen;
      }
      // The head: a hot core in a soft glow, a little bigger on the near
      // side; behind the disc, its light hides behind the disc's edge.
      float hn = -sin(head);
      float hs = size * (1.0 + 0.22 * hn);
      vec2 e = p - vec2(cos(head), -sin(head)) * ab;
      float e2 = dot(e, e) / (hs * hs);
      float hseen = mix(clear, 1.0, smoothstep(-0.12, 0.12, hn)) * (0.68 + 0.32 * hn);
      v += (exp(-e2) + 0.18 * exp(-e2 * 0.12)) * hseen;
      hot += exp(-e2 * 4.0) * hseen * 0.7;
    }
    // The glow from the disc's edge.
    v += exp(-max(r - vQ.x, 0.0) / (1.2 + vQ.x * 0.12)) * vS.w * clear;
  } else {
    // Sigil: an arcane circle that draws itself. q: radius, line width,
    // drawn 0-1, spin (rad/s).
    float R = vQ.x;
    float lw = vQ.y;
    vec2 p = rot2(vP, time * vQ.w + seed);
    float ang = atan(p.y, p.x);
    float lines = 0.0;
    lines += exp(-pow((r - R) / lw, 2.0));
    lines += 0.8 * exp(-pow((r - R * 0.86) / (lw * 0.8), 2.0));
    lines += 0.5 * exp(-pow((r - R * 0.44) / (lw * 0.7), 2.0));
    // Tick marks between the two outer rings.
    float band = smoothstep(R * 0.87, R * 0.89, r) * (1.0 - smoothstep(R * 0.97, R * 0.99, r));
    lines += band * pow(abs(cos(ang * 36.0)), 90.0) * 1.2;
    // Rune notches: each of 12 sectors gets its own pattern of dashes.
    float sector = floor((ang + PI) / (2.0 * PI) * 12.0);
    float h = hash12(vec2(sector, seed));
    float local = fract((ang + PI) / (2.0 * PI) * 12.0);
    float dash = step(0.18, local) * step(local, 0.82) * step(0.5, fract(local * (2.0 + floor(h * 3.0)) + h));
    float runeBand = exp(-pow((r - R * 0.93) / (lw * 1.3), 2.0));
    lines += dash * runeBand * 0.9;
    // A hexagram inside.
    float tri = min(abs(sdTri(p, R * 0.73)), abs(sdTri(vec2(p.x, -p.y), R * 0.73)));
    lines += 0.75 * exp(-pow(tri / (lw * 0.8), 2.0));
    // Draw on around the circle.
    float at = fract((ang + PI) / (2.0 * PI) + 0.25);
    float drawn = 1.0 - smoothstep(vQ.z - 0.02, vQ.z, at);
    v = lines * drawn;
    v += exp(-pow((r - R) / (lw * 6.0), 2.0)) * 0.15;
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
  o = vec4((col * v + vec3(1.0, 0.95, 0.85) * hot * max(max(col.r, col.g), col.b)) * (1.0 - vBehind * hiddenAt(vWorld)), 0.0);
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
// can't flicker the whole bloom.
const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uKaris;
out vec4 o;
vec3 s(vec2 off) { return texture(uSrc, vUv + off * uTexel).rgb; }
float w(vec3 c) { return mix(1.0, 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))), uKaris); }
void main() {
  vec3 a = s(vec2(-2, -2)), b = s(vec2(0, -2)), c = s(vec2(2, -2));
  vec3 d = s(vec2(-1, -1)), e = s(vec2(1, -1));
  vec3 f = s(vec2(-2, 0)), g = s(vec2(0, 0)), h = s(vec2(2, 0));
  vec3 i = s(vec2(-1, 1)), j = s(vec2(1, 1));
  vec3 k = s(vec2(-2, 2)), l = s(vec2(0, 2)), m = s(vec2(2, 2));
  vec3 g0 = (d + e + i + j) * 0.25;
  vec3 g1 = (a + b + f + g) * 0.25;
  vec3 g2 = (b + c + g + h) * 0.25;
  vec3 g3 = (f + g + k + l) * 0.25;
  vec3 g4 = (g + h + l + m) * 0.25;
  float w0 = w(g0) * 0.5, w1 = w(g1) * 0.125, w2 = w(g2) * 0.125, w3 = w(g3) * 0.125, w4 = w(g4) * 0.125;
  o = vec4((g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4), 1.0);
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
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += (texture(uSrc, vUv + vec2(-t.x, 0.0)).rgb + texture(uSrc, vUv + vec2(t.x, 0.0)).rgb
      + texture(uSrc, vUv + vec2(0.0, -t.y)).rgb + texture(uSrc, vUv + vec2(0.0, t.y)).rgb) * 2.0;
  c += texture(uSrc, vUv - t).rgb + texture(uSrc, vUv + t).rgb
     + texture(uSrc, vUv + vec2(-t.x, t.y)).rgb + texture(uSrc, vUv + vec2(t.x, -t.y)).rgb;
  o = vec4(c / 16.0, 1.0);
}`;

// Copies the shapes (drawn at lower resolution) into the HDR target.
const COPY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
out vec4 o;
void main() {
  o = vec4(texture(uSrc, vUv).rgb, 0.0);
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
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 hdr = texture(uHdr, vUv).rgb;
  if (uHasBloom > 0.5) hdr += texture(uBloom, vUv).rgb * uBloomAmt;
  // Per-channel exponential tone map: linear for faint light, saturating
  // smoothly, so orange sparks burn through yellow toward white.
  vec3 c = 1.0 - exp(-max(hdr, 0.0) * uExposure);
  // Outside an open dialog, light falls on the dimmed page and dims with it.
  if (uDim > 0.0) {
    float sdf = dialogSdf(vec2(vUv.x, 1.0 - vUv.y) * uView);
    c *= 1.0 - ${DIALOG_DIM.toFixed(3)} * uDim * clamp(sdf + 0.5, 0.0, 1.0);
  }
  // TPDF dither, only where there is light, so empty pixels stay exactly 0.
  float peak = max(max(c.r, c.g), c.b);
  float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 71.3) - 1.0;
  c = max(c + n * smoothstep(0.0, 3.0 / 255.0, peak) / 255.0, 0.0);
  // Premultiplied: alpha as high as the brightest channel keeps the colour
  // valid; plus-lighter then adds it to the page.
  o = vec4(c, max(max(c.r, c.g), c.b));
}`;

export type RendererOptions = { maxParticles: number; maxShapes: number };

/**
 * A picture effects shine from behind, so they leave its own shape clear (an
 * item's outline, not its box): its centre and size in CSS px as laid out,
 * its x scale (-1 to 1) while it turns round, and its opacity.
 */
export type Silhouette = { img: HTMLImageElement; x: number; y: number; w: number; h: number; flip: number; alpha: number };

/** Longest side of the silhouette texture, and the blur over it, in its px. */
// Fine enough that thin items (a spear's shaft) keep most of their alpha.
const SIL_SIZE = 256;
const SIL_BLUR = 2.5;

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
  /** The picture in silTex (by URL, so a picture gone from the page isn't kept), and how much of the texture it covers. */
  private silSrc = '';
  private silFit: [number, number] = [1, 1];
  /** A picture that couldn't be read (another origin, say): not tried again every frame. */
  private silFailed = '';

  static create(canvas: HTMLCanvasElement, opts: RendererOptions): FxRenderer | null {
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
    try {
      return new FxRenderer(gl, opts);
    } catch (e) {
      console.warn('FX renderer unavailable; effects are off.', e);
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext, opts: RendererOptions) {
    this.gl = gl;
    const float = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.hdrFloat = float;
    this.internal = float ? gl.RGBA16F : gl.RGBA8;
    this.texType = float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    const p = program(gl, PARTICLE_VS, PARTICLE_FS, 'particles');
    const s = program(gl, SHAPE_VS, SHAPE_FS, 'shapes');
    const d = program(gl, FULL_VS, DOWN_FS, 'bloom-down');
    const u = program(gl, FULL_VS, UP_FS, 'bloom-up');
    const c = program(gl, FULL_VS, COMPOSITE_FS, 'composite');
    const k = program(gl, FULL_VS, COPY_FS, 'copy');
    if (!p || !s || !d || !u || !c || !k) throw new Error('shader');
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
    const sil = silhouette && this.loadSilhouette(silhouette.img) ? silhouette : null;
    const shapeUniforms = () => {
      const p = this.shapeProg;
      gl.uniform2f(p.u('uView'), view[0], view[1]);
      behindDialog(p, true);
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
    // Without a dialog box, nothing is hidden and everything is dimmed.
    const b = dialog.box;
    const behindDialog = (p: Program, hide: boolean) => {
      if (b) gl.uniform4f(p.u('uDialogBox'), b.left, b.top, b.right, b.bottom);
      else gl.uniform4f(p.u('uDialogBox'), -1, -1, -1, -1);
      gl.uniform1f(p.u('uDialogR'), dialog.radius);
      gl.uniform1f(p.u('uHide'), hide && b ? dialog.amount : 0);
    };

    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

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
      gl.useProgram(this.copyProg.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shapesT.tex);
      gl.uniform1i(this.copyProg.u('uSrc'), 0);
      gl.bindVertexArray(this.fullVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, particles, 0, nParticles * INSTANCE_FLOATS);
      gl.bindVertexArray(this.particleVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nParticles);
    }

    const bloom = this.bloom && this.mips.length > 0;
    gl.bindVertexArray(this.fullVao);
    if (bloom) {
      gl.disable(gl.BLEND);
      gl.useProgram(this.downProg.prog);
      let src: Target = this.hdr;
      this.mips.forEach((m, i) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
        gl.viewport(0, 0, m.w, m.h);
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
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  /** Makes `img` the silhouette texture, unless it is already. Returns whether it's ready (loaded, and readable). */
  private loadSilhouette(img: HTMLImageElement): boolean {
    const src = img.currentSrc || img.src;
    if (src === this.silSrc) return true;
    if (src === this.silFailed || !img.complete || !img.naturalWidth) return false;
    if (!this.makeSilhouette(img)) {
      this.silFailed = src;
      return false;
    }
    this.silSrc = src;
    return true;
  }

  /** Draws `img`'s alpha, blurred, into silTex, with a margin for the blur to spread into. False if it can't be read. */
  private makeSilhouette(img: HTMLImageElement): boolean {
    const k = SIL_SIZE / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const pad = Math.ceil(SIL_BLUR * 3);
    const c = document.createElement('canvas');
    c.width = w + pad * 2;
    c.height = h + pad * 2;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.filter = `blur(${SIL_BLUR}px)`;
    ctx.drawImage(img, pad, pad, w, h);
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
    dropTarget(gl, this.hdr);
    dropTarget(gl, this.shapesT);
    for (const m of this.mips) dropTarget(gl, m);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
