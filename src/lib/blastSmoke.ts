// Delve's dynamite, the page's part of it (lib/blastAway.ts): what of the
// explosion is drawn in the blast's layer. Always the cloud of smoke and rock
// dust it throws out, which darkens what it hangs over (the effects overlay
// only adds light, so it can't); and without that overlay the fire, the
// shockwave, the rock chips and the sparks too.
//
// The cloud is thrown out with the blast and stopped hard by the air within
// a second, then hangs: it goes on churning, its lobes boiling over, spreads
// and thins as it does, drifts on the air's own stir (flowAt, as the
// overlay's particles do) and lifts a little, and takes seconds to clear,
// softening into a haze as it goes. It is lit on the side the fire is, and
// the fire's glow on it dies as the fire does.
//
// It's drawn with WebGL, in one draw a frame: each billow worked out pixel by
// pixel from a tile of noise (fx/noiseTile.ts) that moves within it, so it
// churns, and dithered as it's written, rounded up or down at random in its
// colour and its opacity alike, so soft edges this big never band
// (CLAUDE.md). Its canvas and program are made once, before the first blast.
// Without WebGL2 (and so without the overlay) a 2D canvas draws all of it
// instead, plainer: each billow a still picture.

import { fxActive } from './fx/core';
import { airNow, flowAt } from './fx/particles';
import { NOISE_CELLS, NOISE_MAX, NOISE_TILE, noiseAt, noiseTile } from './fx/noiseTile';

/** How long the cloud hangs, at the longest (s): then its layer goes. */
export const BLAST_SMOKE_S = 9.5;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// ---- the cloud, in WebGL ----

/**
 * Floats per billow: x, y (layer px), size (px), seed; its opacity, the
 * fire's glow on it, its age (s), how soft it has gone; how torn it still is,
 * and its roll (cos, sin).
 */
const BILLOW_FLOATS = 12;

const SMOKE_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 iA;
layout(location = 2) in vec4 iB;
layout(location = 3) in vec4 iC;
uniform vec2 uView;
out vec2 vQ;
flat out vec4 vA;
flat out vec4 vB;
void main() {
  vec2 p = iA.xy + aCorner * 0.5 * iA.z;
  vQ = aCorner * 2.0;
  vA = vec4(iA.w, iB.xyz);
  vB = vec4(iB.w, iC.xyz);
  vec2 clip = p / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const SMOKE_FS = `#version 300 es
precision highp float;
in vec2 vQ;          // across the billow, -2 to 2: its body reaches about 1.6
flat in vec4 vA;     // seed, opacity, glow, age
flat in vec4 vB;     // softness, tear, roll (cos, sin)
uniform sampler2D uNoise; // noiseTile.ts, repeating
uniform float uSide;      // the side the fire is (+x one way, -x the other)
out vec4 o;
float N(vec2 p) {
  return texture(uNoise, p / ${NOISE_CELLS}.0).r * ${NOISE_MAX};
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 3.8) discard;
  float seed = vA.x;
  float age = vA.w;
  // The noise rolls slowly within it and two layers of it slide past each
  // other, so its lobes boil over rather than sit still.
  vec2 p = mat2(vB.z, vB.w, -vB.w, vB.z) * vQ * 0.85 + vec2(fract(seed * 0.1031), fract(seed * 0.1197)) * ${NOISE_CELLS}.0;
  vec2 drift = vec2(0.05, -0.08) * age;
  float n1 = N(p + drift);
  float nz = 0.62 * n1 + 0.38 * N(p * 1.9 + 3.7 + vec2(0.09, -0.06) * age);
  float body = exp(-r2 * 0.55);
  float thick = body - (0.62 - nz) * vB.y;
  float dens = smoothstep(0.0, vB.x, thick) * (1.0 - smoothstep(1.69, 3.8, r2));
  float a = dens * vA.y;
  if (a <= 0.0) discard;
  // Lit from the fire's side: that side of it, and each lobe's face that rises toward it.
  float rise = N(p + drift + vec2(0.12 * uSide, -0.06)) - n1;
  float lum = clamp(0.36 + 0.36 * vQ.x * uSide + 1.3 * (nz - 0.44) + 3.0 * rise, 0.0, 1.0);
  // Soot and rock dust from its shadowed side to its lit one, warmed by the fire's glow while it burns.
  vec3 soot = lum < 0.55 ? mix(vec3(14.0, 11.0, 10.0), vec3(40.0, 33.0, 28.0), lum / 0.55) : mix(vec3(40.0, 33.0, 28.0), vec3(84.0, 68.0, 55.0), (lum - 0.55) / 0.45);
  float l2 = lum * lum;
  vec3 glow = vec3(1.0, 0.5 + 0.24 * l2, 0.2 + 0.16 * l2);
  vec3 col = mix(soot / 255.0, glow, clamp(vA.z * l2, 0.0, 1.0));
  // Dithered: two hashes, a triangular spread of a level either way, the
  // same in colour and opacity (it stays a valid premultiplied colour).
  float d = (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.yx + 19.19) - 1.0) / 255.0;
  o = max(vec4(col * a, a) + d, 0.0);
}`;

type SmokeGl = { canvas: HTMLCanvasElement; draw: (W: number, H: number, k: number, side: number, billows: Float32Array, n: number) => void; lost: () => boolean };
/** Undefined until tried; null where WebGL2 isn't there. */
let gl2: SmokeGl | null | undefined;
/** The blast drawing in it now: a newer one takes it over. */
let glOwner: object | null = null;

function smokeGl(): SmokeGl | null {
  // (Its context lost, a GPU reset say: made anew.)
  if (gl2?.lost()) gl2 = undefined;
  if (gl2 !== undefined) return gl2;
  gl2 = null;
  const cv = canvas(1, 1);
  const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'default' });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, SMOKE_VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, SMOKE_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Blast smoke: WebGL program failed', gl.getProgramInfoLog(prog));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, NOISE_TILE, NOISE_TILE, 0, gl.RED, gl.UNSIGNED_BYTE, noiseTile());
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  for (let k = 0; k < 3; k++) {
    gl.enableVertexAttribArray(1 + k);
    gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, BILLOW_FLOATS * 4, k * 16);
    gl.vertexAttribDivisor(1 + k, 1);
  }
  gl.useProgram(prog);
  gl.uniform1i(gl.getUniformLocation(prog, 'uNoise'), 0);
  const uView = gl.getUniformLocation(prog, 'uView');
  const uSide = gl.getUniformLocation(prog, 'uSide');
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  gl2 = {
    canvas: cv,
    lost: () => gl.isContextLost(),
    draw(W, H, k, side, billows, n) {
      const w = Math.max(1, Math.round(W * k));
      const h = Math.max(1, Math.round(H * k));
      if (cv.width !== w || cv.height !== h) Object.assign(cv, { width: w, height: h });
      // (The browser may give a very big canvas a smaller buffer than asked for.)
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!n) return;
      gl.uniform2f(uView, W, H);
      gl.uniform1f(uSide, side);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, billows.subarray(0, n * BILLOW_FLOATS), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    },
  };
  return gl2;
}

// ---- without WebGL2: a 2D canvas ----

/** A billow's picture, px square, and how many different ones. */
const SPRITE = 192;
const VARIANTS = 3;

type Sprites = { soot: HTMLCanvasElement[]; glow: HTMLCanvasElement[]; fire: HTMLCanvasElement[] };
let sprites2d: Sprites | null = null;

const mixRgb = (stops: [number, number, number, number][], x: number): [number, number, number] => {
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1][0]) i++;
  const [x0, r0, g0, b0] = stops[i];
  const [x1, r1, g1, b1] = stops[i + 1];
  const k = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return [r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k];
};

/**
 * The billows as still pictures for a 2D canvas, worked out as the WebGL
 * draws them (lit from +x): soot, the fire's glow on it, and the same billow
 * burning.
 */
function sprites(): Sprites {
  if (sprites2d) return sprites2d;
  const out: Sprites = { soot: [], glow: [], fire: [] };
  for (let v = 0; v < VARIANTS; v++) {
    const soot = new ImageData(SPRITE, SPRITE);
    const glow = new ImageData(SPRITE, SPRITE);
    const fire = new ImageData(SPRITE, SPRITE);
    for (let i = 0; i < SPRITE * SPRITE; i++) {
      const qx = ((i % SPRITE) + 0.5) * (4 / SPRITE) - 2;
      const qy = (Math.floor(i / SPRITE) + 0.5) * (4 / SPRITE) - 2;
      const r = Math.hypot(qx, qy);
      if (r > 1.95) continue;
      // Each its own stretch of the noise.
      const nx = qx * 0.85 + v * 2.7;
      const ny = qy * 0.85 + v * 1.9;
      const nz = noiseAt(nx, ny);
      const body = Math.exp(-r * r * 0.55);
      const dens = smooth(0, 0.3, body - (0.62 - nz) * 1.3) * (1 - smooth(1.3, 1.95, r));
      if (dens <= 0) continue;
      const rise = noiseAt(nx + 0.12, ny - 0.06) - nz;
      const lum = Math.min(1, Math.max(0, 0.36 + 0.36 * qx + 1.3 * (nz - 0.44) + 3 * rise));
      const heat = Math.min(1, Math.max(0, body * 1.15 + (nz - 0.44) * 1.3 - 0.12));
      const o = i * 4;
      const [sr, sg, sb] = mixRgb([[0, 14, 11, 10], [0.55, 40, 33, 28], [1, 84, 68, 55]], lum);
      soot.data.set([sr, sg, sb, 255 * dens], o);
      const l2 = lum * lum;
      glow.data.set([255, 128 + 60 * l2, 50 + 40 * l2, 255 * dens * l2], o);
      const [fr, fg, fb] = mixRgb([[0, 96, 26, 10], [0.35, 214, 86, 30], [0.65, 255, 172, 84], [1, 255, 246, 220]], heat);
      fire.data.set([fr, fg, fb, 255 * dens], o);
    }
    for (const [list, img] of [[out.soot, soot], [out.glow, glow], [out.fire, fire]] as const) {
      const c = canvas(SPRITE, SPRITE);
      c.getContext('2d')?.putImageData(img, 0, 0);
      list.push(c);
    }
  }
  sprites2d = out;
  return out;
}

/** Made while the page is idle, before the first blast needs it (once a Delve run is under way): what draws the cloud. */
let prepared = false;
export function prepareBlastSmoke() {
  if (prepared || typeof document === 'undefined') return;
  prepared = true;
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  // With the overlay, the WebGL the cloud is drawn with; without it, the 2D canvas's pictures.
  const make = () => void (fxActive() ? smokeGl() : sprites());
  if (idle) idle(make, { timeout: 4000 });
  else setTimeout(make, 1500);
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

type Billow = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s0: number;
  /** How much it swells as the blast throws it, and how fast it goes on spreading after (of s0, a second). */
  burst: number;
  spread: number;
  age: number;
  life: number;
  seed: number;
  v: number;
  flipY: number;
  /** How fast its noise rolls within it (rad/s). */
  roll: number;
  lift: number;
};
type Fire = { x: number; y: number; vx: number; vy: number; s0: number; s1: number; age: number; life: number; v: number; flipY: number };
type Chip = { x: number; y: number; vx: number; vy: number; rot: number; spin: number; size: number; age: number; life: number; hot: boolean; pts: number[] };
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number };

export type BlastSmoke = {
  /** The layer it's drawn in, and its size in the layer's px. */
  layer: HTMLElement;
  W: number;
  H: number;
  /** The layer's zoom (stage.ts): the smoke is as sharp as the screen. */
  Z: number;
  /** The screen edge it bursts in from, and its height there (layer px). */
  side: -1 | 1;
  y: number;
  /** The fireball's size (layer px). */
  S: number;
  /** No effects overlay: the fire, the shockwave, the chips and the sparks are drawn here too. */
  whole: boolean;
  phone: boolean;
  /** Called once the last of it has cleared (BLAST_SMOKE_S at the longest). */
  done: () => void;
};

/** Starts the blast's cloud (and the rest, `whole`) in `o.layer` (see the top of this file). */
export function blastSmoke(o: BlastSmoke) {
  const { W, H, side, S } = o;
  // The overlay is there, so WebGL2 is: the cloud is drawn with it, and nothing else is needed.
  const gl = o.whole ? null : smokeGl();
  const k = Math.max(1, devicePixelRatio * o.Z);
  const me = {};
  if (gl) {
    glOwner = me;
    Object.assign(gl.canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    o.layer.append(gl.canvas);
  }
  // Without it, a 2D canvas, up to twice the layer's px.
  const k2 = Math.min(2, k);
  const cv = gl ? null : canvas(Math.round(W * k2), Math.round(H * k2));
  const ctx = cv?.getContext('2d') ?? null;
  if (cv && ctx) {
    Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    o.layer.append(cv);
    ctx.imageSmoothingQuality = 'high';
  } else if (!gl) return void setTimeout(o.done, BLAST_SMOKE_S * 1000);
  const sp = ctx ? sprites() : null;
  const edgeX = side > 0 ? W : 0;
  const inward = -side;

  // The cloud: thrown in off the edge after the fire, the heart of it the
  // thickest, stopped hard by the air and hanging where it stops, the new
  // question coming through it as it thins.
  const smoke: Billow[] = [];
  for (let i = 0; i < (o.phone ? 10 : 14); i++) {
    const s0 = S * rand(0.32, 0.55);
    smoke.push({
      x: edgeX + side * s0 * 0.1,
      y: o.y + rand(-0.5, 0.5) * Math.min(H * 0.4, S * 0.55),
      vx: inward * W * rand(0.25, 0.75) * 3.2,
      vy: rand(-160, 90),
      s0,
      burst: rand(0.7, 1.1),
      spread: rand(0.08, 0.15),
      age: -rand(0.04, 0.2),
      life: rand(6.5, BLAST_SMOKE_S - 0.3),
      seed: rand(0, 1000),
      v: Math.floor(Math.random() * VARIANTS),
      flipY: Math.random() < 0.5 ? -1 : 1,
      roll: rand(-0.22, 0.22),
      lift: rand(6, 16),
    });
  }
  const billows = new Float32Array(smoke.length * BILLOW_FLOATS);
  // Without the overlay: the fire, billowing in off the edge, burning out as it slows.
  const fire: Fire[] = [];
  const chips: Chip[] = [];
  const sparks: Spark[] = [];
  if (o.whole) {
    for (let i = 0; i < (o.phone ? 6 : 9); i++) {
      const core = i < 3;
      const s0 = S * (core ? rand(0.5, 0.65) : rand(0.3, 0.5));
      fire.push({
        x: edgeX + side * s0 * 0.15,
        y: o.y + (core ? rand(-0.1, 0.1) : rand(-0.35, 0.35)) * S,
        vx: inward * S * (core ? rand(0.6, 1.1) : rand(0.9, 1.8)),
        vy: rand(-0.3, 0.2) * S,
        s0,
        s1: s0 * rand(1.4, 1.8),
        age: -(core ? 0 : rand(0.02, 0.08)),
        life: rand(0.5, 0.85),
        v: i % VARIANTS,
        flipY: Math.random() < 0.5 ? -1 : 1,
      });
    }
    for (let i = 0; i < (o.phone ? 10 : 16); i++) {
      const a = (side > 0 ? Math.PI : 0) + rand(-0.6, 0.6);
      const v = W * rand(0.8, 1.8);
      const pts: number[] = [];
      for (let c = 0; c < 5; c++) {
        const t = ((c + rand(-0.35, 0.35)) / 5) * Math.PI * 2;
        const r = rand(0.6, 1);
        pts.push(Math.cos(t) * r, Math.sin(t) * r * 0.7);
      }
      chips.push({ x: edgeX, y: o.y + rand(-0.25, 0.25) * S, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(60, 220), rot: rand(0, 6.3), spin: rand(-12, 12), size: rand(3, o.phone ? 6 : 7.5), age: -rand(0, 0.07), life: rand(0.8, 1.3), hot: Math.random() < 0.3, pts });
    }
    for (let i = 0; i < (o.phone ? 22 : 36); i++) {
      const a = (side > 0 ? Math.PI : 0) + rand(-0.6, 0.6);
      const v = rand(600, 1700);
      sparks.push({ x: edgeX, y: o.y + rand(-0.2, 0.2) * S, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(40, 200), age: -rand(0, 0.09), life: rand(0.3, 0.75) });
    }
  }
  const R = Math.hypot(W, H) * 1.1;

  // The air's stir is the effects' own, in the screen's px and on their clock, so the
  // cloud drifts with the overlay's particles; without them, on its own.
  const Z = o.Z;
  const move = (b: { x: number; y: number; vx: number; vy: number }, dt: number, drag: number, gravity: number, stir: number, t: number) => {
    if (stir) {
      const f = flowAt(b.x * Z, b.y * Z, o.whole ? t : airNow());
      b.vx += (f[0] * stir * dt) / Z;
      b.vy += (f[1] * stir * dt) / Z;
    }
    b.vy += gravity * dt;
    const keep = Math.exp(-drag * dt);
    b.vx *= keep;
    b.vy *= keep;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  };
  // A billow swells fast as the blast throws it, then goes on spreading, slowly, as long as it hangs.
  const sizeOf = (b: Billow) => b.s0 * (1 + b.burst * (1 - Math.exp(-3 * b.age)) + b.spread * b.age);
  // The air stops it hard at first (thrown fast, it pushes a lot of it), then barely holds it.
  const dragOf = (b: Billow) => 0.7 + 3.4 * Math.exp(-b.age * 2.2);
  // How thick it is: as thick as it was thrown, thinning as it spreads (the
  // same dust over more of the screen), and clearing over its last seconds.
  const sootOf = (b: Billow) => {
    const u = b.age / b.life;
    return Math.min(1, b.age / 0.12) * Math.pow(b.s0 / sizeOf(b), 0.5) * (1 - smooth(0.5, 1, u)) * 0.62;
  };
  const glowOf = (b: Billow) => Math.exp(-b.age * 3.2) * 0.75;
  const fireFit = (b: Fire) => b.s0 + (b.s1 - b.s0) * ((1 - Math.exp(-2.4 * b.age)) / (1 - Math.exp(-2.4 * b.life)));
  const drawPicture = (x: number, y: number, s: number, flipY: number, img: HTMLCanvasElement, alpha: number) => {
    if (!ctx || alpha <= 0.002) return;
    ctx.globalAlpha = Math.min(1, alpha);
    // Mirrored for a blast from the left, so it's lit from the fire's side.
    ctx.setTransform(k2 * side, 0, 0, k2 * flipY, x * k2, y * k2);
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
  };

  let t = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const mine = !gl || glOwner === me;
    if (!mine || !(gl?.canvas ?? cv)?.isConnected) return end(mine);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    let left = false;
    for (const b of smoke) {
      b.age += dt;
      if (b.age <= b.life) left = true;
      if (b.age >= 0 && b.age <= b.life) move(b, dt, dragOf(b), -b.lift, 60, t);
    }
    if (gl) {
      let n = 0;
      for (const b of smoke) {
        if (b.age < 0 || b.age > b.life) continue;
        // Softer and less torn as it goes, a haze by the end.
        const settle = 1 - Math.exp(-b.age / 3.5);
        const q = n++ * BILLOW_FLOATS;
        billows[q] = b.x;
        billows[q + 1] = b.y;
        billows[q + 2] = sizeOf(b);
        billows[q + 3] = b.seed;
        billows[q + 4] = sootOf(b);
        billows[q + 5] = glowOf(b);
        billows[q + 6] = b.age;
        billows[q + 7] = 0.3 + 0.9 * settle;
        billows[q + 8] = 1.3 - 0.55 * settle;
        billows[q + 9] = Math.cos(b.roll * b.age);
        billows[q + 10] = Math.sin(b.roll * b.age);
      }
      gl.draw(W, H, k, side, billows, n);
    } else if (ctx && sp) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, cv!.width, cv!.height);
      // The fire, its light added.
      ctx.globalCompositeOperation = 'lighter';
      for (const b of fire) {
        b.age += dt;
        if (b.age < 0 || b.age > b.life) continue;
        move(b, dt, 3, -120, 0, t);
        const u = b.age / b.life;
        drawPicture(b.x, b.y, fireFit(b), b.flipY, sp.fire[b.v], Math.min(1, u / 0.08) * Math.pow(1 - u, 1.5));
      }
      // The shockwave: the front of a ring far bigger than the screen, running across from the edge.
      if (o.whole && t < 0.76) {
        const u = t / 0.76;
        const r = R * (0.02 + 0.98 * (1 - Math.pow(1 - u, 2.6)));
        const a = 1 - u;
        ctx.setTransform(k2, 0, 0, k2, 0, 0);
        ctx.globalAlpha = 1;
        for (const [w, c] of [[26, `rgba(255, 150, 70, ${0.07 * a})`], [10, `rgba(255, 180, 100, ${0.22 * a})`], [2, `rgba(255, 238, 205, ${0.85 * a})`]] as const) {
          ctx.lineWidth = w;
          ctx.strokeStyle = c;
          ctx.beginPath();
          ctx.arc(edgeX, o.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Sparks: streaks along their flight, a white-hot head on an orange trail.
      ctx.setTransform(k2, 0, 0, k2, 0, 0);
      ctx.lineCap = 'round';
      for (const p of sparks) {
        p.age += dt;
        if (p.age < 0 || p.age > p.life) continue;
        move(p, dt, 1.3, 420, 0, t);
        ctx.globalAlpha = Math.pow(1 - p.age / p.life, 1.2);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = 'rgb(255, 170, 80)';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
        ctx.strokeStyle = 'rgb(255, 246, 225)';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.008, p.y - p.vy * 0.008);
        ctx.stroke();
      }
      // Rock chips, tumbling: a face of each catches the light as it turns.
      ctx.globalCompositeOperation = 'source-over';
      for (const c of chips) {
        c.age += dt;
        if (c.age < 0 || c.age > c.life) continue;
        move(c, dt, 1.1, 950, 0, t);
        c.rot += c.spin * dt;
        const u = c.age / c.life;
        ctx.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        const cos = Math.cos(c.rot);
        const sin = Math.sin(c.rot);
        ctx.setTransform(k2 * cos * c.size, k2 * sin * c.size, -k2 * sin * c.size, k2 * cos * c.size, c.x * k2, c.y * k2);
        const glow = c.hot ? Math.max(0, 1 - u * 1.6) : 0;
        ctx.beginPath();
        ctx.moveTo(c.pts[0], c.pts[1]);
        for (let i = 2; i < 10; i += 2) ctx.lineTo(c.pts[i], c.pts[i + 1]);
        ctx.closePath();
        ctx.fillStyle = glow ? `rgb(${120 + 135 * glow}, ${50 + 90 * glow}, ${24 + 30 * glow})` : 'rgb(46, 34, 26)';
        ctx.fill();
        // One face, from a ridge near the middle to two corners, lit as it turns toward the light (up and left).
        const lit = Math.max(0, Math.cos(c.rot + 2.1));
        ctx.beginPath();
        ctx.moveTo(0.15, -0.1);
        ctx.lineTo(c.pts[0], c.pts[1]);
        ctx.lineTo(c.pts[2], c.pts[3]);
        ctx.lineTo(c.pts[4], c.pts[5]);
        ctx.closePath();
        ctx.fillStyle = glow ? `rgba(255, 236, 190, ${0.5 * lit})` : `rgba(168, 134, 104, ${0.35 + 0.6 * lit})`;
        ctx.fill();
      }
      // The cloud, hanging over it all, then the fire's glow on it.
      for (const b of smoke) if (b.age >= 0 && b.age <= b.life) drawPicture(b.x, b.y, sizeOf(b), b.flipY, sp.soot[b.v], sootOf(b));
      ctx.globalCompositeOperation = 'source-atop';
      for (const b of smoke) if (b.age >= 0 && b.age <= b.life) drawPicture(b.x, b.y, sizeOf(b), b.flipY, sp.glow[b.v], Math.min(1, b.age / 0.12) * glowOf(b));
    }
    if (left) requestAnimationFrame(frame);
    else end(true);
  };
  const end = (mine: boolean) => {
    // (The WebGL canvas is kept for the next blast, its drawing let go of meanwhile.)
    if (gl && mine) {
      gl.draw(1, 1, 1, side, billows, 0);
      gl.canvas.remove();
    }
    // A newer blast took the canvas over: this one's shards still fly to the end.
    if (mine) o.done();
    else setTimeout(o.done, Math.max(0, BLAST_SMOKE_S - t) * 1000);
  };
  requestAnimationFrame(frame);
}
