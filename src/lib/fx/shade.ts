// The shade: a second canvas under the effects' own and over the UI, blended
// normally, on which a player aura's shader lays darkness (or any colour)
// over the page. The effects canvas is added to the page as light
// (plus-lighter), so nothing drawn there can darken; whatever dark an aura
// had was the page's own, pictures moved by transforms. Here its dark is the
// shader's, with the light still added on top of it.
//
// An aura that has a `shade_<kind>` (auras/shaders.ts) gets it drawn from
// its own shapes: the same quads with the same numbers, in the same frame
// as its light (core.ts hands each frame's shapes to drawShade as it hands
// them to the renderer), on a canvas of the same size in device pixels and
// the same place on the page. So an aura's light and its dark are one field,
// registered to the pixel, and nothing new is asked of the 96 shapes.
//
// It is hidden as the light is: by the shape's own strength (f.k, the
// opacity its avatar has, its fade as it stops), by the fade round the
// quad's edge, behind an open dialog and whatever else stands over the page
// (BEHIND_DIALOG in renderer.ts), behind the UI's boxes for a shape that
// shines from behind them (COVER); and it is gone with the shapes when
// effects are off, the tab is away or the effects' context is lost. Neither
// shows before the other: an aura's shade waits for its light's program, and
// its light, the first time, for its shade's (shadeHolds).
//
// Behind an open dialog the page blurs, and an aura with it: its shade is
// blurred as its light is (AURA_BLUR in renderer.ts), by the same amount, in
// two targets made for as long as the dialog is up, and hidden behind the
// dialog only after, so none of its dark creeps onto the dialog. The shade
// of a wearer in the dialog itself is drawn after, as ever, over that.
//
// Nothing of it is there until such an aura shows: no context, no backing
// store, no program, and no work in a frame (an aura's shape says it is
// alive as it is updated, shadeAlive; without that drawShade leaves at
// once). When the last one stops the canvas is cleared and hidden, and a
// while later its backing store is let go (its context and programs stay,
// so the next one shows at once).
//
// Without WebGL2, with its context lost or a program that won't build there
// is no shade, and the light goes on as ever (shadeThere tells an aura).

import { SHADE_FNS } from './auras/shaders';
import { buildPrograms, dropTarget, target, webgl2Refused, whenGpuCaughtUp, wrapProgram, type Build, type Program, type Target } from './gl';
import { GpuTimer } from './gpuTimer';
import { BEHIND_PICTURE, BEHIND_UI, BLUR_FS, BLUR_OUT_FS, FULL_VS, MAX_HIDES, SHAPE_FLOATS, SHAPE_VS, ShapeType, auraBlur, pageBlur, shadeFs, type DialogLight, type FxRenderer } from './renderer';

const F = SHAPE_FLOATS;
/** The most shapes drawn at once: every shape there is (core.ts, MAX_SHAPES). */
const MOST = 96;
/** How long after the last shade is gone its backing store is let go (ms). */
const REST_MS = 20_000;
/** The longest an aura's light waits for its shade's program (ms): past that it shows alone, and the shade when it's built. */
const HOLD_MS = 8000;

/** What is made on the canvas the first time a shade shows, and made again after a lost context. */
type Made = {
  gl: WebGL2RenderingContext;
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  /** Each aura's shade program by slot: null if it failed; being built while absent and in `building`. */
  progs: Map<number, Program | null>;
  building: Map<number, Build>;
  /** The UI's mask (see COVER in renderer.ts), and which one it holds. */
  coverTex: WebGLTexture;
  coverKey: string;
  /** The backing store's size (device px). */
  w: number;
  h: number;
  /** Times its draws, once shadeGpuMs() has been asked. */
  timer: GpuTimer | null;
  /** The blur behind a dialog (AURA_BLUR in renderer.ts): its pass and its laying on, null until built or if they failed. */
  blur: [Program, Program] | null;
  /** Its two targets, while a dialog is up: half floats where the context can draw to them, so no step of it rounds to 8 bits before the last. */
  veil: [Target, Target] | null;
  float: boolean;
};

let canvas: HTMLCanvasElement | null = null;
let made: Made | null = null;
/** Waiting for the GPU to catch up before the context is asked for: cancels it. */
let coming: (() => void) | null = null;
/** No WebGL2 for it: not asked again. */
let refused = false;
/** Its context is lost (until it's given back). */
let lost = false;
/** An aura with a shade was updated since the last frame drawn (shadeAlive). */
let alive = false;
/** Something is drawn on it, and it shows. */
let shown = false;
let rest: ReturnType<typeof setTimeout> | null = null;
/** The slots whose shade has been built or has failed once: their light waits no more (shadeHolds). */
const settled = new Set<number>();
/** Since when each slot's light has waited (performance.now()). */
const heldSince = new Map<number, number>();
/** The last timed frame's GPU time (ms). */
let lastMs = 0;

const spare = new Float32Array(MOST * F);
const slots: number[] = [];
const hideBoxes = new Float32Array(MAX_HIDES * 4);
const hideK = new Float32Array(MAX_HIDES * 2);

/** Whether the aura in `slot` has a shade function at all. */
export const hasShade = (slot: number) => !!SHADE_FNS[slot - 1];

/** An aura's shape whose shade is drawn here says it is alive, each frame it is updated (auras/common.ts). */
export function shadeAlive() {
  alive = true;
}

/**
 * Whether the shade of the aura in `slot` is drawn, or on its way: false
 * for an aura without one, and where it can't be drawn (no canvas or no
 * WebGL2 for it, its context lost, its program failed).
 */
export function shadeThere(slot: number): boolean {
  return hasShade(slot) && !!canvas && !refused && !lost && made?.progs.get(slot) !== null;
}

/**
 * Whether the light of the aura in `slot` should wait (FxRenderer.auraHold):
 * while its shade's program is on its way for the first time, so the dark
 * and the light come in together. Never for an aura without a shade, nor
 * once its shade has been built or has failed, nor for longer than HOLD_MS.
 */
export function shadeHolds(slot: number): boolean {
  if (!hasShade(slot) || settled.has(slot) || !canvas || refused || lost) return false;
  const now = performance.now();
  let since = heldSince.get(slot);
  if (since === undefined) heldSince.set(slot, (since = now));
  if (now - since <= HOLD_MS) return true;
  settled.add(slot);
  return false;
}

/**
 * What the shade's draws cost the GPU in a frame (ms, the last one timed),
 * to be counted with the effects' own (core.ts, for gpuBudget.ts): 0 while
 * nothing is drawn on it, or where it can't be timed.
 */
export function shadeGpuMs(): number {
  if (!made || !shown) return 0;
  const t = (made.timer ??= new GpuTimer(made.gl));
  if (!t.available) return 0;
  for (const d of t.read()) lastMs = d.ms;
  return lastMs;
}

/** Lets go of what was made on a context that is gone (or is being let go). */
function forget() {
  coming?.();
  coming = null;
  for (const b of made?.building.values() ?? []) b.cancel();
  made = null;
  lastMs = 0;
  if (rest) clearTimeout(rest);
  rest = null;
  if (shown && canvas) canvas.style.visibility = 'hidden';
  shown = false;
}

/**
 * The shade is drawn on `c` (FxLayer.svelte's canvas under the effects')
 * from now on: nothing is made on it yet. Returns what lets go of it.
 */
export function attachShade(c: HTMLCanvasElement | null): () => void {
  if (!c) return () => {};
  canvas = c;
  refused = false;
  lost = false;
  // A lost context takes its programs and buffers with it: all is made
  // again, on the context given back, the next time a shade shows.
  const onLost = (e: Event) => {
    e.preventDefault();
    forget();
    lost = true;
  };
  const onRestored = () => {
    lost = false;
  };
  c.addEventListener('webglcontextlost', onLost);
  c.addEventListener('webglcontextrestored', onRestored);
  return () => {
    c.removeEventListener('webglcontextlost', onLost);
    c.removeEventListener('webglcontextrestored', onRestored);
    if (canvas !== c) return;
    const gl = made?.gl;
    forget();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    canvas = null;
  };
}

/**
 * Begins making the context, once the GPU has caught up with the backdrop
 * (a new context waits on the GPU's process: whenGpuCaughtUp in gl.ts).
 */
function begin() {
  if (made || coming || refused || lost || !canvas) return;
  if (typeof WebGL2RenderingContext === 'undefined' || webgl2Refused()) {
    refused = true;
    return;
  }
  const c = canvas;
  let ran = false;
  const cancel = whenGpuCaughtUp(() => {
    ran = true;
    coming = null;
    if (canvas !== c) return;
    try {
      make(c);
    } catch (e) {
      console.warn(e);
      refused = true;
    }
  });
  if (!ran) coming = cancel;
}

/** The context on `c` and what every shade draws with: the quad, the shapes' buffer, an empty mask. */
function make(c: HTMLCanvasElement) {
  const gl = c.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
  });
  if (!gl) {
    refused = true;
    return;
  }
  // (Lost already: made once it's given back.)
  if (gl.isContextLost()) {
    lost = true;
    return;
  }
  const quad = gl.createBuffer()!;
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  // The shapes as the renderer has them (SHAPE_VS): six vec4s to each.
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, MOST * F * 4, gl.DYNAMIC_DRAW);
  for (let k = 0; k < F / 4; k++) {
    gl.enableVertexAttribArray(1 + k);
    gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, F * 4, k * 16);
    gl.vertexAttribDivisor(1 + k, 1);
  }
  gl.bindVertexArray(null);
  // The UI's mask on unit 3, as the renderer has it: empty until one is needed.
  const coverTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, coverTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE0);
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
  const float = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
  const m: Made = { gl, vao, buf, progs: new Map(), building: new Map(), coverTex, coverKey: '', w: c.width, h: c.height, timer: null, blur: null, veil: null, float };
  made = m;
  // The blur's two small programs, from the start: there long before a dialog opens over an aura.
  buildPrograms(
    gl,
    [
      { vs: FULL_VS, fs: BLUR_FS, label: 'FX program “shade blur”' },
      { vs: FULL_VS, fs: BLUR_OUT_FS, label: 'FX program “shade blur, laid on”' },
    ],
    (progs) => {
      m.blur = progs ? [wrapProgram(gl, progs[0]), wrapProgram(gl, progs[1])] : null;
    },
  );
}

/** Lets go of the blur's targets (once the dialog is gone, or its size has changed). */
function dropVeil(m: Made) {
  if (!m.veil) return;
  if (!m.gl.isContextLost()) for (const t of m.veil) dropTarget(m.gl, t);
  m.veil = null;
}

/** The shade program of the aura in `slot`: null until it's built (and begins building it, without holding the page up: buildPrograms), or if it failed. */
function progOf(m: Made, slot: number): Program | null {
  const have = m.progs.get(slot);
  if (have !== undefined || m.building.has(slot)) return have ?? null;
  const build = buildPrograms(m.gl, [{ vs: SHAPE_VS, fs: shadeFs(SHADE_FNS[slot - 1]!), label: `FX program “shade ${slot}”` }], (progs) => {
    m.building.delete(slot);
    // (Failed on a context that was lost meanwhile, it's built again on the next: only what failed on a live one stays failed.)
    if (progs || !m.gl.isContextLost()) m.progs.set(slot, progs ? wrapProgram(m.gl, progs[0]) : null);
    settled.add(slot);
  });
  m.building.set(slot, build);
  return null;
}

/** Clears the shade and hides its canvas, once: then nothing until there is a shade to draw. */
export function clearShade() {
  if (!shown) return;
  shown = false;
  if (canvas) canvas.style.visibility = 'hidden';
  const m = made;
  if (!m || m.gl.isContextLost()) return;
  dropVeil(m);
  m.gl.bindFramebuffer(m.gl.FRAMEBUFFER, null);
  m.gl.clear(m.gl.COLOR_BUFFER_BIT);
  // Unused for a while, its backing store is let go: a texel is kept.
  if (rest) clearTimeout(rest);
  rest = setTimeout(() => {
    rest = null;
    if (shown || made !== m || !canvas || m.gl.isContextLost()) return;
    canvas.width = canvas.height = m.w = m.h = 1;
  }, REST_MS);
}

/**
 * Draws the shade of this frame's shapes: of the `n` in `shapes` (as core.ts
 * wrote them for the renderer), those of auras that have one, each run by
 * its aura's program, over one another as they come. `view` is the canvas's
 * size in CSS px, `dialog` what the page's light hides behind this frame;
 * `r`, the renderer drawing the light, gives the size in device px, says
 * whether an aura's light is ready, and has the UI's mask.
 */
export function drawShade(r: FxRenderer, view: readonly [number, number], shapes: Float32Array, n: number, dialog: DialogLight) {
  if (!alive) return clearShade();
  alive = false;
  if (!canvas || refused || lost) return;
  slots.length = 0;
  for (let i = 0; i < n; i++) {
    if (Math.round(shapes[i * F + 4]) !== ShapeType.Aura) continue;
    const slot = Math.round(shapes[i * F + 20]);
    if (hasShade(slot) && !slots.includes(slot)) slots.push(slot);
  }
  if (!slots.length) return clearShade();
  if (!made) return begin();
  const m = made;
  const gl = m.gl;
  if (gl.isContextLost()) return;
  // Only the auras whose light is drawn too: the dark never shows alone.
  const ready = slots.filter((slot) => !!progOf(m, slot) && r.auraReady(slot));
  if (!ready.length) return clearShade();
  // At the light's own size: the same pixels, so the same field in each.
  if (m.w !== r.width || m.h !== r.height) {
    canvas.width = m.w = r.width;
    canvas.height = m.h = r.height;
  }
  const b = dialog.box;
  const nHides = Math.min(MAX_HIDES, dialog.hides?.length ?? 0);
  for (let i = 0; i < nHides; i++) {
    const h = dialog.hides![i];
    hideBoxes.set([h.box.left, h.box.top, h.box.right, h.box.bottom], i * 4);
    hideK.set([h.radius, h.amount], i * 2);
  }
  // Behind an open dialog, the page's by way of the blur: into a target of
  // one texel to the page's own px (or the canvas's own where those are larger),
  // unhidden. The targets are made as soon as a dialog is there over a
  // wearer, before its blur is enough to draw through them: making targets
  // holds the GPU up a moment, which the dialog's first frame hides and the
  // middle of its fade would show.
  const blurCss = pageBlur(dialog);
  const paged = (o: number) => Math.round(shapes[o + 11]) % BEHIND_PICTURE === 1;
  let anyPaged = false;
  if (blurCss > 0 && m.blur) {
    for (let i = 0; i < n && !anyPaged; i++) {
      const o = i * F;
      anyPaged = Math.round(shapes[o + 4]) === ShapeType.Aura && paged(o) && ready.includes(Math.round(shapes[o + 20]));
    }
  }
  const vk = Math.min(1, view[0] / (m.w * (dialog.zoom ?? 1)));
  const vw = Math.max(1, Math.round(m.w * vk));
  const vh = Math.max(1, Math.round(m.h * vk));
  let sigma = 0;
  if (!anyPaged) {
    // (Let go once the dialog is gone, not at each end of its fade.)
    if (blurCss <= 0) dropVeil(m);
  } else {
    if (!m.veil || m.veil[0].w !== vw || m.veil[0].h !== vh) {
      dropVeil(m);
      const internal = m.float ? gl.RGBA16F : gl.RGBA8;
      const type = m.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      m.veil = [target(gl, vw, vh, internal, type), target(gl, vw, vh, internal, type)];
    }
    sigma = auraBlur(blurCss, vw, view[0], m.w);
  }
  const veil = sigma > 0 ? m.veil : null;
  // Each ready aura's shapes: all of them (0), the page's alone, for the
  // blur (1), or the rest alone, a wearer in the dialog itself (2).
  const quads = (which: 0 | 1 | 2) => {
    // Premultiplied, each over what is there.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(m.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    const raw = which === 1;
    for (const slot of ready) {
      const p = m.progs.get(slot)!;
      let count = 0;
      let behindUi = false;
      for (let i = 0; i < n; i++) {
        const o = i * F;
        if (Math.round(shapes[o + 4]) !== ShapeType.Aura || Math.round(shapes[o + 20]) !== slot) continue;
        if (which && paged(o) !== raw) continue;
        spare.set(shapes.subarray(o, o + F), F * count++);
        behindUi ||= shapes[o + 11] >= BEHIND_UI;
      }
      if (!count) continue;
      gl.useProgram(p.prog);
      gl.uniform2f(p.u('uView'), view[0], view[1]);
      if (b) gl.uniform4f(p.u('uDialogBox'), b.left, b.top, b.right, b.bottom);
      else gl.uniform4f(p.u('uDialogBox'), -1, -1, -1, -1);
      gl.uniform1f(p.u('uDialogR'), dialog.radius);
      // (For the blur, unhidden and unblurred by itself: the blur does both.)
      gl.uniform1i(p.u('uHideN'), raw ? 0 : nHides);
      if (nHides && !raw) {
        gl.uniform4fv(p.u('uHideBox'), hideBoxes);
        gl.uniform2fv(p.u('uHideK'), hideK);
      }
      gl.uniform1f(p.u('uBlur'), raw ? 0 : blurCss);
      gl.uniform1f(p.u('uDim'), dialog.amount);
      // The UI's mask, for a shape from behind it: the renderer's own picture of it, put in here when it changes.
      const mask = behindUi ? r.coverMask : null;
      if (mask && mask.key !== m.coverKey) {
        m.coverKey = mask.key;
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, m.coverTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, mask.canvas);
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.uniform1i(p.u('uCover'), 3);
      gl.uniform1f(p.u('uCoverOn'), mask ? 1 : 0);
      gl.uniform2f(p.u('uCoverView'), mask?.view[0] ?? 1, mask?.view[1] ?? 1);
      gl.uniform2f(p.u('uCoverShift'), mask?.shift[0] ?? 0, mask?.shift[1] ?? 0);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, spare, 0, count * F);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    }
  };
  const run = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, veil ? veil[0].fbo : null);
    gl.viewport(0, 0, veil ? vw : m.w, veil ? vh : m.h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    quads(veil ? 1 : 0);
    if (veil && m.blur) {
      // Blurred across into the second target and down into the first
      // again, then laid on the canvas, hidden behind the dialog and
      // dithered. (The quad's corners are all a pass reads of the buffers.)
      const [a, b2] = veil;
      const [pass, out] = m.blur;
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
      gl.useProgram(pass.prog);
      gl.uniform1i(pass.u('uSrc'), 0);
      gl.uniform1f(pass.u('uSigma'), sigma);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b2.fbo);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform2f(pass.u('uStep'), 1 / vw, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      gl.bindTexture(gl.TEXTURE_2D, b2.tex);
      gl.uniform2f(pass.u('uStep'), 0, 1 / vh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, m.w, m.h);
      gl.useProgram(out.prog);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(out.u('uSrc'), 0);
      gl.uniform2f(out.u('uView'), view[0], view[1]);
      gl.uniform1f(out.u('uDither'), 1);
      if (b) gl.uniform4f(out.u('uDialogBox'), b.left, b.top, b.right, b.bottom);
      else gl.uniform4f(out.u('uDialogBox'), -1, -1, -1, -1);
      gl.uniform1f(out.u('uDialogR'), dialog.radius);
      gl.uniform1i(out.u('uHideN'), nHides);
      if (nHides) {
        gl.uniform4fv(out.u('uHideBox'), hideBoxes);
        gl.uniform2fv(out.u('uHideK'), hideK);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // Then those not of the page, as ever, over it.
      quads(2);
    }
    gl.bindVertexArray(null);
  };
  if (m.timer) m.timer.time(m.w * m.h, run);
  else run();
  if (rest) clearTimeout(rest);
  rest = null;
  if (!shown) {
    shown = true;
    canvas.style.visibility = 'visible';
  }
}
