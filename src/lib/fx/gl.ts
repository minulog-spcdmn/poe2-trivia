// Small WebGL2 helpers shared by the FX overlay renderer (and the backdrop,
// lib/backdrop.ts, which builds its Delve programs with buildPrograms).

import { whenIdle } from '../idle.ts';

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

/** Whether the page was refused a WebGL2 context (the backdrop's, asked first): the effects then don't count on one either. */
let refused = false;
export const webgl2Refused = () => refused;
export function refuseWebgl2() {
  refused = true;
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

/** A program started (see begin): compiling and linking, nothing asked yet of how it went. */
type Started = { prog: WebGLProgram; shaders: WebGLShader[] };

/** Starts compiling and linking a program, asking nothing of how it went (see linked). */
function begin(gl: WebGL2RenderingContext, { vs, fs }: ProgramSource): Started {
  const prog = gl.createProgram()!;
  const shaders = ([
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
  return { prog, shaders };
}

/**
 * Whether a started program linked: only that is asked (a failed compile
 * fails the link), and its shaders' logs only if it didn't, in a warning
 * that says why. Linked, its shaders are let go (deleted with it, which
 * keeps them while it lives).
 */
function linked(gl: WebGL2RenderingContext, { prog, shaders }: Started, label: string): boolean {
  if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    for (const s of shaders) gl.deleteShader(s);
    return true;
  }
  const logs = shaders.map((s) => gl.getShaderInfoLog(s)).filter(Boolean);
  console.warn(`${label} failed to compile or link.`, ...logs, gl.getProgramInfoLog(prog));
  return false;
}

/** Deletes started programs, and their shaders (one deleted already is let be). */
function drop(gl: WebGL2RenderingContext, started: readonly Started[]) {
  for (const { prog, shaders } of started) {
    gl.deleteProgram(prog);
    for (const s of shaders) gl.deleteShader(s);
  }
}

/**
 * Compiles and links `sources` at once, for what's drawn at once (the
 * backdrop's first frame): every program is started before any is asked
 * about, so with KHR_parallel_shader_compile the driver builds them side by
 * side, and then only whether each linked is asked (see linked). The
 * programs, in order, or null if one failed (a warning says why).
 */
export function buildProgramsNow(gl: WebGL2RenderingContext, sources: readonly ProgramSource[]): WebGLProgram[] | null {
  gl.getExtension('KHR_parallel_shader_compile');
  const started = sources.map((src) => begin(gl, src));
  if (started.every((p, i) => linked(gl, p, sources[i].label))) return started.map((p) => p.prog);
  drop(gl, started);
  return null;
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
 * (whenGpuCaughtUp), so even that doesn't wait behind a frame. Polled done
 * (with the extension), they're all read in that one step, at no cost;
 * without it one at a time, each in a step of its own (a software GPU can
 * still take tens of ms over each read): with the backdrop running it holds
 * its frames until the last is read, else they're a frame apart. Nothing starts before the next
 * frame.
 */
export function buildPrograms(gl: WebGL2RenderingContext, sources: readonly ProgramSource[], done: (progs: WebGLProgram[] | null) => void, oneAtATime = false): Build {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  const started: Started[] = [];
  /** How many have been read (and linked). */
  let read = 0;
  let raf = 0;
  let stopIdle: (() => void) | null = null;
  let stopCatchUp: (() => void) | null = null;
  let over = false;

  const stop = () => {
    over = true;
    cancelAnimationFrame(raf);
    stopIdle?.();
    stopCatchUp?.();
  };
  /** Reads the next program: false if it failed, or the context was lost. */
  const readOne = () => {
    if (gl.isContextLost()) return false;
    const i = read++;
    return linked(gl, started[i], sources[i].label);
  };
  /** The end: `done` hears of the programs, or of null (and they're deleted). */
  const end = (ok: boolean) => {
    stop();
    if (ok) return done(started.map((p) => p.prog));
    drop(gl, started);
    done(null);
  };
  const finish = () => {
    stop();
    // (A lost context makes no shaders: nothing more is started on it. And
    // whatever goes wrong, `done` hears of it.)
    let ok = false;
    try {
      while (!gl.isContextLost() && started.length < sources.length) started.push(begin(gl, sources[started.length]));
      ok = started.length === sources.length;
      while (ok && read < started.length) ok = readOne();
    } catch (e) {
      console.warn(e);
      ok = false;
    }
    end(ok);
  };
  const nextFrame = (f: () => void) => {
    raf = requestAnimationFrame(() => {
      raf = 0;
      f();
    });
  };
  /** All started and compiled: the next read once the GPU has caught up, and the one after in a step of its own. */
  const readWhenCaughtUp = () => {
    let inCall = true;
    let ran = false;
    const cancel = whenGpuCaughtUp(() => {
      ran = true;
      stopCatchUp = null;
      if (over) return;
      if (gl.isContextLost()) return finish();
      let ok = false;
      try {
        ok = readOne();
        // (Compiled side by side and polled done, the rest read at no cost: all in this step.)
        while (ext && ok && read < started.length) ok = readOne();
      } catch (e) {
        console.warn(e);
      }
      if (!ok || read === started.length) return end(ok);
      // (Held by the backdrop, it's asked again at once, so the backdrop
      // holds on; else the next is read a frame later.)
      if (inCall) nextFrame(readWhenCaughtUp);
      else readWhenCaughtUp();
    });
    inCall = false;
    if (!ran) stopCatchUp = cancel;
  };
  const step = () => {
    stopIdle = null;
    if (gl.isContextLost()) return finish();
    if (ext) {
      if (!started.length) for (const src of sources) started.push(begin(gl, src));
      else if (started.every((p) => gl.getProgramParameter(p.prog, ext.COMPLETION_STATUS_KHR))) return readWhenCaughtUp();
      nextFrame(step);
      return;
    }
    if (started.length === sources.length) return readWhenCaughtUp();
    if (oneAtATime) started.push(begin(gl, sources[started.length]));
    else for (const src of sources) started.push(begin(gl, src));
    nextFrame(() => (stopIdle = whenIdle(step, { timeout: 500 })));
  };
  nextFrame(ext ? step : () => (stopIdle = whenIdle(step, { timeout: 500 })));

  return {
    cancel() {
      if (over) return;
      stop();
      drop(gl, started);
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
