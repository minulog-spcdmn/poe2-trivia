// WebGL renderer for the page backdrop: breathing gradients, drifting blobs,
// grain and vignette. Every layer is composited in floating point and
// dithered once, at the final 8-bit conversion, so the dark gradients can't
// band. Falloffs are Gaussian or smoothstep curves with no hard end, so no
// layer shows an edge.
//
// Background.svelte keeps a static CSS approximation as the fallback when
// WebGL is unavailable.

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const BLOB_COUNT = 5;

const FRAG = `
precision highp float;

uniform vec2 uRes;   // drawing buffer size, device pixels
uniform vec2 uSize;  // canvas size, CSS pixels

// Breathing, driven from JS: each is (scale, strength) unless noted.
uniform vec2 uTop;
uniform vec2 uBottom;
uniform vec2 uGlow;
uniform vec2 uVignette; // (reach, strength)
uniform float uBaseStop;

// Blobs. A: centre (fractions of the viewport), rotation, opacity.
// B: reach ahead of / behind the centre along the rotated axis, and across
// it, in units of sqrt(W * H). Unequal reaches make each blob lopsided.
uniform vec4 uBlobA[${BLOB_COUNT}];
uniform vec3 uBlobB[${BLOB_COUNT}];
uniform vec3 uBlobColor[${BLOB_COUNT}];

vec3 rgb(float r, float g, float b) { return vec3(r, g, b) / 255.0; }

float gauss(float d) { return exp(-d * d); }

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
    vec2 r = p - a.xy * vec2(W, H);
    float u = dot(r, vec2(cos(a.z), sin(a.z)));
    float v = dot(r, vec2(-sin(a.z), cos(a.z)));
    float reach = (u > 0.0 ? b.x : b.y) * S;
    float w = gauss(length(vec2(u / reach, v / (b.z * S))));
    col = mix(col, uBlobColor[i], a.w * w);
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
  d = length((p - vec2(0.5 * W, 0.5 * H)) / (vec2(0.5 * W, 0.5 * H) * 1.4142136 * uVignette.x));
  col *= 1.0 - min(0.9, uVignette.y * 0.72 * pow(d, 2.4));

  // TPDF dither of +-1 LSB, per device pixel, ahead of the round-to-nearest
  // 8-bit conversion. The same sample goes to all three channels, so the
  // noise carries no colour of its own.
  float n = hash(dev + 0.5) + hash(dev + 101.5) - 1.0;
  gl_FragColor = vec4(col + n / 255.0, 1.0);
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
 * null when WebGL (with highp fragment floats) is unavailable. `onLost` fires
 * if the context is lost later, after the renderer has shut itself down, so
 * the caller can fall back to CSS.
 */
export function startBackdrop(canvas: HTMLCanvasElement, onLost: () => void): (() => void) | null {
  const gl = canvas.getContext('webgl', {
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

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // One triangle covering the viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uSize = gl.getUniformLocation(prog, 'uSize');
  const uTop = gl.getUniformLocation(prog, 'uTop');
  const uBottom = gl.getUniformLocation(prog, 'uBottom');
  const uGlow = gl.getUniformLocation(prog, 'uGlow');
  const uVignette = gl.getUniformLocation(prog, 'uVignette');
  const uBaseStop = gl.getUniformLocation(prog, 'uBaseStop');
  const uBlobA = gl.getUniformLocation(prog, 'uBlobA');

  gl.uniform3fv(gl.getUniformLocation(prog, 'uBlobB'), BLOBS.flatMap((b) => b.reach));
  gl.uniform3fv(
    gl.getUniformLocation(prog, 'uBlobColor'),
    BLOBS.flatMap((b) => b.color.map((c) => c / 255)),
  );
  const paths = BLOBS.map(blobPath);

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const start = performance.now();
  let raf = 0;
  let last = -Infinity;

  function draw(now: number) {
    // Every gradient breathes on its own cycle; the periods share no common
    // factor, so the combined motion takes hours to repeat. Reduced motion
    // freezes them all (and the blobs) at rest.
    const ms = now - start;
    const still = reduceMotion.matches;
    const glow = still ? 0 : breathe(ms, 9000);
    const bottom = still ? 0 : breathe(ms, 13000, 0.3);
    const top = still ? 0 : breathe(ms, 17000, 0.6);
    const vignette = still ? 0 : breathe(ms, 23000, 0.15);
    const base = still ? 0 : breathe(ms, 29000, 0.8);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform2f(uRes, canvas.width, canvas.height);
    gl!.uniform2f(uSize, canvas.clientWidth, canvas.clientHeight);
    gl!.uniform2f(uGlow, 1 + 0.08 * glow, 1 - 0.4 * glow);
    gl!.uniform2f(uBottom, 1 + 0.1 * bottom, 1 + 0.3 * bottom);
    gl!.uniform2f(uTop, 1 + 0.08 * top, 1 + 0.35 * top);
    gl!.uniform2f(uVignette, 1 - 0.06 * vignette, 1 + 0.07 * vignette);
    gl!.uniform1f(uBaseStop, 0.6 - 0.08 * base);
    gl!.uniform4fv(uBlobA, paths.flatMap((path) => path(still ? 0 : ms / 1000)));
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    // The quickest cycle is a slow 9s breath; 30fps is plenty and halves
    // the GPU work.
    if (now - last < 33) return;
    last = now;
    draw(now);
  }

  function schedule() {
    cancelAnimationFrame(raf);
    if (reduceMotion.matches) draw(performance.now());
    else raf = requestAnimationFrame(frame);
  }

  // Size the drawing buffer to the exact device pixels the canvas covers.
  // Any mismatch makes the browser resample the canvas, which smears the dither.
  // The device-pixel box is exact where supported (it includes pixel snapping
  // at fractional ratios), but it's ignored when it disagrees with the ratio by
  // more than snapping could explain, as it does under DPR emulation.
  const ro = new ResizeObserver(([entry]) => {
    const box = entry.devicePixelContentBoxSize?.[0];
    const estW = entry.contentRect.width * devicePixelRatio;
    const estH = entry.contentRect.height * devicePixelRatio;
    const exact = box && Math.abs(box.inlineSize - estW) <= 2 && Math.abs(box.blockSize - estH) <= 2;
    const w = exact ? box.inlineSize : Math.round(estW);
    const h = exact ? box.blockSize : Math.round(estH);
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
    reduceMotion.removeEventListener('change', schedule);
  }

  // A lost context stays lost: we don't call preventDefault(), so the browser
  // won't restore it, and the caller switches to the CSS backdrop for good.
  // Tear everything down so nothing keeps drawing into the dead context.
  function lost() {
    stop();
    onLost();
  }
  canvas.addEventListener('webglcontextlost', lost);
  reduceMotion.addEventListener('change', schedule);

  // Paint the first frame now so the swap from the CSS backdrop is seamless.
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
  draw(performance.now());
  schedule();

  return stop;
}
