// Small WebGL2 helpers shared by the FX overlay renderer (and the backdrop,
// lib/backdrop.ts, which builds its Delve programs with buildPrograms).

export type Program = { prog: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

/** Wraps a linked program (see buildPrograms) with a cached uniform lookup. */
export function wrapProgram(gl: WebGL2RenderingContext, prog: WebGLProgram): Program {
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    prog,
    u: (name) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
      return cache.get(name)!;
    },
  };
}

/** A program's shaders, and what to call it in a warning. */
export type ProgramSource = { vs: string; fs: string; label: string };

/** Programs being built (see buildPrograms): `cancel` drops them; `now` finishes at once, waiting for the GPU if need be. */
export type Build = { cancel(): void; now(): void };

/** Runs `f` when the page is idle (soon, either way); returns a function that cancels it. */
export function whenIdle(f: () => void, timeout = 500): () => void {
  const g = globalThis as { requestIdleCallback?: (f: () => void, o: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (typeof g.requestIdleCallback === 'function') {
    const id = g.requestIdleCallback(f, { timeout });
    return () => g.cancelIdleCallback?.(id);
  }
  const id = setTimeout(f, 50);
  return () => clearTimeout(id);
}

/** How the GPU is made to catch up before a call that waits on it (see whenGpuCaughtUp): set by the backdrop while it runs. */
let catchUp: ((f: () => void) => () => void) | null = null;

/** The backdrop, while it runs, hands over how it holds its frames for whenGpuCaughtUp (null when it stops). */
export function setGpuCatchUp(hold: ((f: () => void) => () => void) | null) {
  catchUp = hold;
}

/**
 * Runs `f` once the GPU process has caught up: before a call that waits on
 * it (a new context; how a compile went). Such a call waits for whatever the
 * GPU process has to do first, and a backdrop frame (lib/backdrop.ts) can
 * keep it busy for a good while on a slow GPU (on a software one, the best
 * part of a second): so the backdrop holds its drawing, its last frame
 * staying up, until a fence after it has passed (asked without waiting,
 * once a frame), and then runs `f`. Without a backdrop running, at once.
 * Returns a function that cancels it.
 */
export function whenGpuCaughtUp(f: () => void): () => void {
  if (catchUp) return catchUp(f);
  f();
  return () => {};
}

/**
 * Compiles and links `sources` without blocking the page, then calls `done`
 * with the programs, in order, or null if one failed (a warning says why)
 * or the context was lost.
 *
 * Asking how a compile went (COMPILE_STATUS, LINK_STATUS, a uniform's
 * location) waits until the GPU process has finished it, which for a large
 * shader on a cold cache (a first visit) can take seconds; so nothing is
 * asked before then. With KHR_parallel_shader_compile every program starts
 * at once, the driver compiles them side by side off the page's thread, and
 * whether they're done is polled once a frame (COMPLETION_STATUS_KHR never
 * waits). Without it they start in an idle moment after a frame (with
 * `oneAtATime`, one in each, so the GPU process gets them one at a time
 * with frames painted between), and are read a frame after the last has
 * started. Either way they're read once the GPU has caught up
 * (whenGpuCaughtUp), so even that doesn't wait behind a frame. Nothing
 * starts before the next frame.
 */
export function buildPrograms(gl: WebGL2RenderingContext, sources: readonly ProgramSource[], done: (progs: WebGLProgram[] | null) => void, oneAtATime = false): Build {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  const progs: WebGLProgram[] = [];
  /** Each program's two shaders. */
  const shaders: WebGLShader[][] = [];
  let raf = 0;
  let stopIdle: (() => void) | null = null;
  let stopCatchUp: (() => void) | null = null;
  let over = false;

  const begin = ({ vs, fs }: ProgramSource) => {
    const prog = gl.createProgram()!;
    const pair = ([
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const).map(([type, src]) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(prog, s);
      return s;
    });
    gl.linkProgram(prog);
    progs.push(prog);
    shaders.push(pair);
  };
  const stop = () => {
    over = true;
    cancelAnimationFrame(raf);
    stopIdle?.();
    stopCatchUp?.();
  };
  /** How each program went: all of them, or null. */
  const read = (): WebGLProgram[] | null => {
    if (gl.isContextLost()) return null;
    let ok = true;
    progs.forEach((prog, i) => {
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        // (Deleted with the program, which keeps them while it lives.)
        for (const s of shaders[i]) gl.deleteShader(s);
        return;
      }
      ok = false;
      const logs = shaders[i].map((s) => gl.getShaderInfoLog(s)).filter(Boolean);
      console.warn(`${sources[i].label} failed to compile or link.`, ...logs, gl.getProgramInfoLog(prog));
    });
    if (ok) return progs;
    for (const prog of progs) gl.deleteProgram(prog);
    return null;
  };
  const finish = () => {
    stop();
    while (progs.length < sources.length) begin(sources[progs.length]);
    done(read());
  };
  const nextFrame = (f: () => void) => {
    raf = requestAnimationFrame(() => {
      raf = 0;
      f();
    });
  };
  /** All started and compiled: read once the GPU has caught up. */
  const readWhenCaughtUp = () => {
    let now = false;
    const cancel = whenGpuCaughtUp(() => {
      now = true;
      stopCatchUp = null;
      if (!over) finish();
    });
    if (!now) stopCatchUp = cancel;
  };
  const step = () => {
    stopIdle = null;
    if (gl.isContextLost()) return finish();
    if (ext) {
      if (!progs.length) sources.forEach(begin);
      else if (progs.every((p) => gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR))) return readWhenCaughtUp();
      nextFrame(step);
      return;
    }
    if (progs.length === sources.length) return readWhenCaughtUp();
    if (oneAtATime) begin(sources[progs.length]);
    else sources.forEach(begin);
    nextFrame(() => (stopIdle = whenIdle(step)));
  };
  nextFrame(ext ? step : () => (stopIdle = whenIdle(step)));

  return {
    cancel() {
      if (over) return;
      stop();
      for (const prog of progs) gl.deleteProgram(prog);
    },
    now() {
      if (!over) finish();
    },
  };
}

export type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };

/** A colour render target. `internal`/`type` pick float or 8-bit storage. */
export function target(gl: WebGL2RenderingContext, w: number, h: number, internal: number, type: number): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { fbo, tex, w, h };
}

export function dropTarget(gl: WebGL2RenderingContext, t: Target | null) {
  if (!t) return;
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
}

/** GLSL shared by the FX shaders: hashing and value noise. */
export const NOISE = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
`;
