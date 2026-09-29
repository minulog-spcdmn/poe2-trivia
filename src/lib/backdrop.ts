// WebGL renderer for the page backdrop (breathing gradients, glow, grain
// and vignette). Every layer is composited in floating point and dithered
// once, at the final 8-bit conversion, so the dark gradients can't band.
// CSS draws each gradient layer at 8 bits and composites the rounded results,
// and no overlay added afterwards can undo that rounding.
//
// The math mirrors the CSS backdrop in Background.svelte, which remains the
// fallback when WebGL is unavailable, so keep the two in sync.

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2 uRes;   // drawing buffer size, device pixels
uniform vec2 uSize;  // canvas size, CSS pixels
// Breathing, driven from JS: each is (scale, strength) unless noted.
uniform vec2 uTop;
uniform vec2 uBottom;
uniform vec2 uGlow;
uniform vec2 uVignette; // (inner edge, strength)
uniform float uBaseStop;

vec3 rgb(float r, float g, float b) { return vec3(r, g, b) / 255.0; }

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

  // linear-gradient(180deg, #0d0b09, #080706 60%, #0d0907), with the dark
  // middle stop drifting (uBaseStop, 0.6 at rest).
  float t = p.y / H;
  vec3 col = t < uBaseStop
    ? mix(rgb(13.0, 11.0, 9.0), rgb(8.0, 7.0, 6.0), t / uBaseStop)
    : mix(rgb(8.0, 7.0, 6.0), rgb(13.0, 9.0, 7.0), (t - uBaseStop) / (1.0 - uBaseStop));

  // radial-gradient(ellipse 60% 50% at 50% -10%, rgba(120, 95, 60, 0.18), transparent 70%)
  float d = length((p - vec2(0.5 * W, -0.1 * H)) / (vec2(0.6 * W, 0.5 * H) * uTop.x));
  col = mix(col, rgb(120.0, 95.0, 60.0), uTop.y * 0.18 * clamp(1.0 - d / 0.7, 0.0, 1.0));

  // radial-gradient(ellipse 80% 60% at 50% 110%, rgba(140, 60, 20, 0.28), transparent 70%)
  d = length((p - vec2(0.5 * W, 1.1 * H)) / (vec2(0.8 * W, 0.6 * H) * uBottom.x));
  col = mix(col, rgb(140.0, 60.0, 20.0), uBottom.y * 0.28 * clamp(1.0 - d / 0.7, 0.0, 1.0));

  // .glow: box inset -20%, radial-gradient(circle at 50% 45%,
  // rgba(201, 164, 92, 0.07), transparent 45%), scaled about the box centre.
  vec2 q = vec2(0.5 * W, 0.5 * H) + (p - vec2(0.5 * W, 0.5 * H)) / uGlow.x;
  float R = length(vec2(0.7 * W, 0.77 * H)); // farthest corner of the box
  d = length(q - vec2(0.5 * W, 0.43 * H)) / R;
  col = mix(col, rgb(201.0, 164.0, 92.0), uGlow.y * 0.07 * clamp(1.0 - d / 0.45, 0.0, 1.0));

  // Grain, matched to the original SVG noise layer (fractalNoise at 6%
  // opacity), measured as out = dst * (1 - A) + K with A = 0.03, K = 5.6/255
  // on average and a spread of about 1.5 levels, one sample per CSS pixel.
  vec2 cell = floor(p);
  float g = (hash(cell) + hash(cell + 17.0) + hash(cell + 43.0) + hash(cell + 71.0) - 2.0) * 1.7320508;
  col = col * (1.0 - (0.03 + 0.00563 * g)) + (0.02196 + 0.00616 * g);

  // radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.75) 100%)
  // "ellipse" defaults to farthest-corner: the closest-side ellipse scaled by sqrt(2).
  d = length((p - vec2(0.5 * W, 0.5 * H)) / (vec2(0.5 * W, 0.5 * H) * 1.4142136));
  col *= 1.0 - uVignette.y * 0.75 * clamp((d - uVignette.x) / (1.0 - uVignette.x), 0.0, 1.0);

  // TPDF dither of +-1 LSB per channel, per device pixel, ahead of the
  // round-to-nearest 8-bit conversion.
  vec3 n = vec3(
    hash(dev + 0.5) + hash(dev + 101.5),
    hash(dev + 211.5) + hash(dev + 307.5),
    hash(dev + 401.5) + hash(dev + 503.5)
  ) - 1.0;
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

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const start = performance.now();
  let raf = 0;
  let last = -Infinity;

  function draw(now: number) {
    // Every gradient breathes on its own cycle; the periods share no common
    // factor, so the combined motion takes hours to repeat. Reduced motion
    // freezes them all at rest, as the CSS animation does.
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
    gl!.uniform2f(uVignette, 0.45 - 0.05 * vignette, 1 + 0.07 * vignette);
    gl!.uniform1f(uBaseStop, 0.6 - 0.08 * base);
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
