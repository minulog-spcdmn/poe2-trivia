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
import { fxActive } from './fx/core';
import { COLUMNS, SLOTS, embers } from './backdropEmbers';
import { DIALOG_BLUR, DIALOG_DIM, openDialog } from './behindDialog';

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const BLOB_COUNT = 5;

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

// The soft light at p (CSS px, top-left origin).
vec3 smoothLight(vec2 p) {
  float W = uSize.x;
  float H = uSize.y;
  float S = sqrt(W * H);

  // Vertical base: #0d0b09 at the top, #080706 at uBaseStop, #0d0907 at the
  // bottom, eased so there's no crease at the middle stop.
  float t = p.y / H;
  vec3 col = t < uBaseStop
    ? mix(rgb(13.0, 11.0, 9.0), rgb(8.0, 7.0, 6.0), smoothstep(0.0, uBaseStop, t))
    : mix(rgb(8.0, 7.0, 6.0), rgb(13.0, 9.0, 7.0), smoothstep(uBaseStop, 1.0, t));

  // Warm haze from above the top edge.
  float d = length((p - vec2(0.5 * W, -0.1 * H)) / (vec2(0.6 * W, 0.5 * H) * uTop.x));
  col = mix(col, rgb(120.0, 95.0, 60.0), uTop.y * 0.18 * gauss(d / 0.5));

  // Ember glow from below the bottom edge.
  d = length((p - vec2(0.5 * W, 1.1 * H)) / (vec2(0.8 * W, 0.6 * H) * uBottom.x));
  col = mix(col, rgb(140.0, 60.0, 20.0), uBottom.y * 0.28 * gauss(d / 0.5));

  // Central gold glow, scaled about the screen centre.
  vec2 q = vec2(0.5 * W, 0.5 * H) + (p - vec2(0.5 * W, 0.5 * H)) / uGlow.x;
  float R = length(vec2(0.7 * W, 0.77 * H));
  d = length(q - vec2(0.5 * W, 0.43 * H)) / R;
  col = mix(col, rgb(201.0, 164.0, 92.0), uGlow.y * 0.07 * gauss(d / 0.3));

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
const frag = (MAX_ELEMENTS: number, split: boolean) => `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;   // drawing buffer size, device pixels
${SMOOTH}
uniform sampler2D uSmooth;
uniform vec2 uVignette; // breathing (reach, strength)

// Outer box-shadows and fills of UI elements (see backdropShadow.ts for the layout).
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

// Embers by screen column: row c holds the embers that reach column c,
// (x, y, size, brightness) each, ending at brightness 0; see backdropEmbers.ts.
uniform sampler2D uEmbers;
uniform vec4 uEmberColor; // halo colour, overall gain
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

  // Embers rising through the dark: a hot core and a wide, dim halo.
  int column = clamp(int(p.x / W * ${COLUMNS}.0), 0, ${COLUMNS - 1});
  for (int i = 0; i < ${SLOTS}; i++) {
    vec4 e = texelFetch(uEmbers, ivec2(i, column), 0);
    if (e.w <= 0.0) break;
    vec2 dp = p - e.xy;
    float r2 = dot(dp, dp);
    float s2 = e.z * e.z;
    if (r2 > s2 * 40.0) continue;
    float core = exp(-r2 / (s2 * 0.3));
    float halo = exp(-r2 / (s2 * 5.0));
    col += (mix(uEmberColor.rgb, vec3(1.0, 0.86, 0.6), 0.55) * core * 0.9 + uEmberColor.rgb * halo * 0.3) * e.w * uEmberColor.a;
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
  float vig = length((p - vec2(0.5 * W, 0.5 * H)) / (vec2(0.5 * W, 0.5 * H) * 1.4142136 * uVignette.x));
  col *= 1.0 - min(0.9, uVignette.y * 0.72 * pow(vig, 2.4));

  // Mood: the whole scene takes on a colour, welling up from below and the edges.
  if (uMood.a > 0.0) {
    float below = gauss(length((p - vec2(0.5 * W, 1.12 * H)) / vec2(0.95 * W, 0.8 * H)));
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
    vec2 lp = (p - ea.xy) * ea.z; // element px from its border-box corner
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
    float px = pxLocal * ea.z; // one device pixel in element px
    // Behind a dialog the UI blurs, so the edge softens with it (a linear
    // ramp as wide as a Gaussian edge's 10-90% rise).
    float edge = max(px, 2.56 * ${DIALOG_BLUR.toFixed(2)} * uDialog * ea.z);
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

type Blob = {
  color: [number, number, number];
  opacity: number;
  home: [number, number]; // resting centre, fractions of the viewport
  wander: [number, number]; // how far it drifts from home, same units
  reach: [number, number, number]; // ahead, behind, across (see shader)
};

// Warm blobs plus one shadow that drifts through the middle.
const BLOBS: Blob[] = [
  { color: [150, 70, 25], opacity: 0.1, home: [0.22, 0.75], wander: [0.12, 0.08], reach: [0.3, 0.16, 0.14] },
  { color: [120, 40, 18], opacity: 0.09, home: [0.8, 0.82], wander: [0.1, 0.07], reach: [0.22, 0.34, 0.13] },
  { color: [140, 110, 60], opacity: 0.06, home: [0.68, 0.28], wander: [0.14, 0.1], reach: [0.28, 0.18, 0.12] },
  { color: [110, 80, 45], opacity: 0.05, home: [0.3, 0.35], wander: [0.12, 0.1], reach: [0.2, 0.3, 0.1] },
  { color: [2, 1, 1], opacity: 0.35, home: [0.55, 0.6], wander: [0.18, 0.1], reach: [0.25, 0.18, 0.12] },
];

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
  // WebGL2 guarantees 224 fragment uniform vectors, enough for 10 elements;
  // most desktop GPUs offer 1024 or more, and get 16.
  const maxElements = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) >= 400 ? 16 : 10;

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
  const uTop = S('uTop');
  const uBottom = S('uBottom');
  const uGlow = S('uGlow');
  const uBaseStop = S('uBaseStop');
  const uBlobA = S('uBlobA');
  const uBlobRot = S('uBlobRot');
  const uBeams = S('uBeams');
  const uHome = S('uHome');
  const uTitle = S('uTitle');
  gl.useProgram(soft);
  gl.uniform3fv(S('uBlobB'), BLOBS.flatMap((b) => b.reach));
  gl.uniform3fv(
    S('uBlobColor'),
    BLOBS.flatMap((b) => b.color.map((c) => c / 255)),
  );

  gl.useProgram(prog);
  const U = (name: string) => gl.getUniformLocation(prog, name);
  const uRes = U('uRes');
  const uSize = U('uSize');
  const uVignette = U('uVignette');
  const uLightA = U('uLightA');
  const uLightC = U('uLightC');
  const uMood = U('uMood');
  const uEmberColor = U('uEmberColor');
  const uElCount = U('uElCount');
  const uDialog = U('uDialog');
  gl.uniform1i(U('uSmooth'), 3);
  let dialog = 0;

  const el = {
    a: new Float32Array(maxElements * 4),
    b: new Float32Array(maxElements * 4),
    c: new Float32Array(maxElements * 4),
    d: new Float32Array(maxElements * 4),
    e: new Float32Array(maxElements * 4),
    geo: new Float32Array(maxElements * SHADOWS_PER_ELEMENT * 4),
    col: new Float32Array(maxElements * SHADOWS_PER_ELEMENT * 4),
  };
  const elLoc = {
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

  // Ember positions by screen column, one float texel each (unit 2).
  const emberTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, emberTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SLOTS, COLUMNS, 0, gl.RGBA, gl.FLOAT, null);
  gl.uniform1i(U('uEmbers'), 2);
  const paths = BLOBS.map(blobPath);

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // On phones and tablets the backdrop-drawn shadows look worse than CSS's,
  // so there every element keeps its CSS shadow and the backdrop draws none.
  const cssShadows = matchMedia('(pointer: coarse)');
  const start = performance.now();
  let raf = 0;
  let last = -Infinity;
  let lastStep = performance.now();

  function draw(now: number) {
    // Every gradient breathes on its own cycle; the periods share no common
    // factor, so the combined motion takes hours to repeat. Reduced motion
    // freezes them all (and the blobs and embers) at rest.
    const ms = now - start;
    const still = reduceMotion.matches;
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
    gl!.uniform2f(uGlow, 1 + 0.08 * glow, 1 - 0.4 * glow);
    gl!.uniform2f(uBottom, 1 + 0.1 * bottom, 1 + 0.3 * bottom);
    gl!.uniform2f(uTop, 1 + 0.08 * top, 1 + 0.35 * top);
    gl!.uniform1f(uBaseStop, 0.6 - 0.08 * base);
    paths.forEach((path, i) => blobA.set(path(still ? 0 : ms / 1000), i * 4));
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
    }

    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform2f(uRes, canvas.width, canvas.height);
    gl!.uniform2f(uVignette, 1 - 0.06 * vignette, 1 + 0.07 * vignette);
    for (const [k, arr] of Object.entries(el)) gl!.uniform4fv(elLoc[k as keyof typeof el], arr);
    let count = 0;
    for (let i = 0; i < maxElements; i++) if (el.b[i * 4 + 3] > 0) count = i + 1;
    gl!.uniform1i(uElCount, count);
    for (const [k, arr] of Object.entries(mk)) gl!.uniform4fv(mkLoc[k], arr);
    gl!.uniform4fv(uLightA, lightA);
    gl!.uniform4fv(uLightC, lightC);
    gl!.uniform4fv(uMood, mood);
    gl!.uniform1f(uDialog, dialog);
    gl!.uniform4f(uEmberColor, embers.color[0], embers.color[1], embers.color[2], still ? 0.6 : 1);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, emberTex);
    gl!.texSubImage2D(gl!.TEXTURE_2D, 0, 0, 0, SLOTS, COLUMNS, gl!.RGBA, gl!.FLOAT, embers.data);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  // Measures the shadowed elements; true if anything changed since last time.
  function measure() {
    let atlases: ReturnType<typeof measureDrops> = null;
    if (cssShadows.matches) {
      for (const arr of shadowArrays) arr.fill(0);
      releaseAll();
      releaseAllDrops();
    } else {
      measureShadows(maxElements, el.a, el.b, el.c, el.d, el.e, el.geo, el.col, canvas.clientWidth, canvas.clientHeight);
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
  // embers drift a few pixels a frame), and with reduced motion nothing is
  // drawn until something changes.
  let dirty = false;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastStep) / 1000);
    lastStep = now;
    const nowS = now / 1000;
    const lights = packLights(lightA, lightC, nowS);
    const moodState = stepMood(dt, mood);
    const homeMoving = stepHomeScene(dt, home, title);
    // Lights and mood step once per animation frame; draw() uses the latest values.
    // A mood holding steady (the victory's gold, a deathmatch's red) changes
    // nothing, so it is just drawn along with everything else: at 30fps, or
    // with reduced motion only when something changes. On phones, where this
    // full-screen shader is the costliest thing on screen and runs under the
    // effects overlay, lights and an easing mood need no more than 30fps
    // either.
    const soft = lights || moodState === 'moving';
    const lit = homeMoving || (soft && !cssShadows.matches);
    if (!reduceMotion.matches) embers.step(dt, canvas.clientWidth, canvas.clientHeight, !fxActive());
    // A dialog's dimming fades in and out with the dialog, in step with the UI's.
    const d = openDialog().amount;
    const fading = d !== dialog;
    dialog = d;
    const changed = measure() || dirty || lit || fading;
    if (!changed && ((reduceMotion.matches && !soft) || now - last < 33)) return;
    last = now;
    dirty = false;
    draw(now);
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
  // at 2-3 device pixels per CSS px, so it renders at 1.5 and is scaled up:
  // a fraction of the work, and the dither still hides every band.
  const scale = () => (cssShadows.matches && devicePixelRatio > 1.5 ? 1.5 / devicePixelRatio : 1);
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
    draw(performance.now());
  });
  try {
    ro.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    ro.observe(canvas);
  }

  function stop() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.removeEventListener('webglcontextlost', lost);
    reduceMotion.removeEventListener('change', onMotionChange);
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

  // Paint the first frame now so the swap from the CSS backdrop is seamless.
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio * scale()));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio * scale()));
  embers.step(0, canvas.clientWidth, canvas.clientHeight);
  measure();
  draw(performance.now());
  raf = requestAnimationFrame(frame);

  return stop;
}
