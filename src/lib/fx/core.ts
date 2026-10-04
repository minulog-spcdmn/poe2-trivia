// The FX overlay's engine: owns the canvas, the particle pool, live shapes and
// per-frame tasks (emitters, comets), and drives the renderer only while
// something is alive. Also runs camera shake and adapts quality to the device.
//
// Effects are off when the user turned them off, when the system asks for
// reduced motion, or when WebGL2 isn't available; every call below is then a
// cheap no-op, so callers never need to check.

import { FxRenderer, SHAPE_FLOATS, ShapeType, type DialogLight } from './renderer';
import { ParticlePool, type ParticleSpec } from './particles';
import { opacityOf } from '../opacity';
import { dialogBox, openDialog } from '../behindDialog';

export type Vec3 = readonly [number, number, number];
export type Point = { x: number; y: number };
/** Where an effect happens: a point, a rectangle, or an element (followed while it moves). */
export type Anchor = Point | DOMRect | Element;

export type Box = { x: number; y: number; w: number; h: number };

/** Current centre and size of an anchor, in viewport CSS px. */
export function boxOf(a: Anchor): Box {
  if (a instanceof Element) {
    const r = a.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  if ('width' in a) return { x: a.left + a.width / 2, y: a.top + a.height / 2, w: a.width, h: a.height };
  return { x: a.x, y: a.y, w: 0, h: 0 };
}

/**
 * Whether `a` is an element that has left the page (the screen moved on
 * before a delayed effect ran). Its box is all zeros, so an effect on it
 * would land in the top-left corner; effects skip it instead.
 */
export function detached(a: Anchor) {
  return a instanceof Element && !a.isConnected;
}

// ---------- shapes ----------

/** Values a shape sets every frame. */
export type ShapeFrame = {
  /** Quad half extents, CSS px. */
  hw: number;
  hh: number;
  /** Brightness multiplier on the colour. */
  k: number;
  /** Per-type parameters, up to 12 (see ShapeType in renderer.ts). */
  q: number[];
  /** Optional colour override. */
  color?: Vec3;
  /** Optional shape type override (a shape can change form as it goes). */
  type?: ShapeType;
};

export type ShapeSpec = {
  type: ShapeType;
  at: Anchor;
  /** Seconds; Infinity lasts until stopped. */
  life: number;
  delay?: number;
  color: Vec3;
  /** t is 0-1 over the life (0 for endless shapes), age in seconds, box the anchor's box now. */
  update: (f: ShapeFrame, t: number, age: number, box: Box) => void;
  /** Dim with the anchor element's opacity (ancestors included). */
  followOpacity?: boolean;
  /** Changes slowly enough to be drawn at 30fps on phones (see `calm` below). */
  calm?: boolean;
};

type LiveShape = ShapeSpec & {
  age: number;
  seed: number;
  box: Box;
  /** Fade-out once stopped: remaining and total seconds. */
  fade: number;
  fadeTotal: number;
  stopped: boolean;
  /** The anchor's opacity, when followed. */
  opacity: number;
  /** Light from the page, which an open dialog hides (see onPage). */
  page: boolean;
  f: ShapeFrame;
};

export type Handle = { stop: (fadeSeconds?: number) => void };
const NOOP: Handle = { stop() {} };

// ---------- tasks ----------

/** Runs every frame until it returns false. */
export type Task = (dt: number, age: number) => boolean;

// ---------- state ----------

const FX_KEY = 'poe2trivia.fx';
let userOn = (() => {
  try {
    return localStorage.getItem(FX_KEY) !== '0';
  } catch {
    return true;
  }
})();
const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;

let canvas: HTMLCanvasElement | null = null;
let renderer: FxRenderer | null = null;
let pool: ParticlePool | null = null;
const MAX_SHAPES = 96;
const shapeData = new Float32Array(MAX_SHAPES * SHAPE_FLOATS);
let shapes: LiveShape[] = [];
let tasks: { fn: Task; age: number }[] = [];
let raf = 0;
let last = 0;
let viewW = 1;
let viewH = 1;
let dpr = 1;
const listeners = new Set<(on: boolean) => void>();

/**
 * Quality: 0 full resolution, 1 lower, 2 lowest. Bloom stays on at every
 * level: switching it off mid-effect would dim everything at once.
 */
let quality = 0;
let slowFor = 0;
let frameAvg = 16;
/** Frames (ms) slower than this count as load. Rises on displays capped below 60fps. */
let slowMs = 22;
/** After a drop in quality: whether it made frames quicker (see frame()). */
let probe: { from: number; before: number; time: number; frames: number } | null = null;

/**
 * On phones, while everything alive is slow (glitter drifting down, rays
 * turning) and nothing shakes, frames are drawn at about 30fps: each one
 * costs the same full-screen passes (HDR target, bloom, composite) however
 * little is in it, and drifting light looks the same at half the rate.
 * Effects still advance every frame, so timing is unchanged.
 */
let calm = false;
let lastDraw = 0;
/** Fastest a particle may move and still count as calm: about 7px per frame at 30fps. */
const CALM_SPEED = 200;

/** Are effects being drawn right now? */
export function fxActive() {
  return !!renderer && userOn && !reduce?.matches;
}

/** The user's setting (effects may still be off for reduced motion or missing WebGL2). */
export function fxUserOn() {
  return userOn;
}

export function fxAvailable() {
  return !!renderer && !reduce?.matches;
}

export function setFxOn(on: boolean) {
  userOn = on;
  try {
    localStorage.setItem(FX_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (!fxActive()) clearAll();
  for (const l of listeners) l(on);
}

export function onFxChange(fn: (on: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function clearAll() {
  pool?.clear();
  shapes = [];
  tasks = [];
  shake.trauma = 0;
  applyShake(0, 0);
  renderer?.clear();
  show(false);
}

/** What's alive right now (for debugging and tests). */
export function fxStats() {
  return { particles: pool?.count ?? 0, shapes: shapes.length, tasks: tasks.length, running: raf !== 0, quality };
}

/** Seconds of effect time since page load (for choreography that needs a clock). */
export function now() {
  return performance.now() / 1000;
}

// ---------- spawning ----------

/**
 * Whether light starting at `a` belongs to the page, which an open dialog
 * hides and dims (lib/behindDialog.ts), rather than to the dialog itself:
 * everything but effects that start inside the open dialog. It stays the
 * page's or the dialog's for its whole life, wherever it goes.
 */
function onPage(a: Anchor): boolean {
  const { backdrop } = openDialog();
  if (!backdrop) return true;
  if (a instanceof Element) return !backdrop.contains(a);
  const box = dialogBox();
  if (!box) return true;
  const { x, y } = boxOf(a);
  const r = box.rect;
  return x < r.left || x > r.right || y < r.top || y > r.bottom;
}

export function particle(p: ParticleSpec) {
  if (!fxActive()) return;
  pool!.spawn(p, onPage(p));
  wake();
}

/** How many particles to spawn for a nominal `n`, scaled to the device. */
export function budget(n: number) {
  const scale = coarse?.matches ? 0.45 : 1;
  const q = quality === 0 ? 1 : quality === 1 ? 0.75 : 0.5;
  return Math.max(1, Math.round(n * scale * q));
}

/**
 * Which shape makes way for a new one when the list is full: one already
 * fading out, else the one nearest the end of its life. Never an endless one
 * still in use (rays, a hover flame): it would vanish mid-moment and its
 * handle couldn't stop it any more. -1 when only those are left.
 */
function leastNeeded(): number {
  const left = (s: LiveShape) => (s.stopped ? s.fade : s.life - s.age);
  let fading = -1;
  let finite = -1;
  shapes.forEach((s, i) => {
    if (s.stopped) {
      if (fading < 0 || left(s) < left(shapes[fading])) fading = i;
    } else if (Number.isFinite(s.life)) {
      if (finite < 0 || left(s) < left(shapes[finite])) finite = i;
    }
  });
  return fading >= 0 ? fading : finite;
}

export function shape(spec: ShapeSpec): Handle {
  if (!fxActive() || detached(spec.at)) return NOOP;
  if (shapes.length >= MAX_SHAPES) {
    const i = leastNeeded();
    if (i < 0) return NOOP;
    shapes.splice(i, 1);
  }
  const s: LiveShape = {
    ...spec,
    age: -(spec.delay ?? 0),
    seed: Math.random() * 100,
    box: boxOf(spec.at),
    fade: 0,
    fadeTotal: 0,
    stopped: false,
    opacity: 1,
    page: onPage(spec.at),
    f: { hw: 0, hh: 0, k: 1, q: new Array(12).fill(0) },
  };
  shapes.push(s);
  wake();
  return {
    stop(fadeSeconds = 0.4) {
      if (s.stopped) return;
      s.stopped = true;
      s.fade = s.fadeTotal = Math.max(0.001, fadeSeconds);
    },
  };
}

export function task(fn: Task): Handle {
  if (!fxActive()) return NOOP;
  const t = { fn, age: 0 };
  tasks.push(t);
  wake();
  return {
    stop() {
      tasks = tasks.filter((x) => x !== t);
    },
  };
}

/** Runs `fn` after `seconds` (effect time; skipped entirely while effects are off). */
export function after(seconds: number, fn: () => void) {
  task((_, age) => {
    if (age < seconds) return true;
    fn();
    return false;
  });
}

// ---------- camera shake ----------

const shake = { trauma: 0, amp: 0, targets: [] as { el: HTMLElement; k: number }[] };

/** Registers an element that moves with camera shake, `k` times as far. */
export function shakeTarget(el: HTMLElement, k = 1) {
  shake.targets.push({ el, k });
  return () => {
    shake.targets = shake.targets.filter((t) => t.el !== el);
    el.style.translate = '';
  };
}

/**
 * Shakes the view. `amount` 0-1 adds trauma (felt as its square, so small
 * hits stay gentle); `px` is the largest offset.
 */
export function shakeView(amount: number, px = 7) {
  if (!fxActive()) return;
  const was = shake.trauma;
  shake.trauma = Math.min(1, was + amount);
  shake.amp = was > 0.05 ? Math.max(shake.amp, px) : px;
  wake();
}

/** Whether the view is shaking (moved by an inline translate, not an animation). */
export function shaking() {
  return shake.trauma > 0;
}

function applyShake(x: number, y: number) {
  for (const t of shake.targets) {
    t.el.style.translate = x || y ? `${(x * t.k).toFixed(2)}px ${(y * t.k).toFixed(2)}px` : '';
  }
}

// Smooth 1D noise for the shake path, so it rolls rather than jitters.
function noise1(x: number, seed: number) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed * 57.3) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

// ---------- loop ----------

// While nothing is alive the canvas is hidden, so the compositor doesn't
// blend an empty full-screen layer over the page every frame.
let shown = false;
function show(on: boolean) {
  if (!canvas || on === shown) return;
  shown = on;
  canvas.style.visibility = on ? 'visible' : 'hidden';
}

/** While the test harness steps effects by hand: its clock (ms); else null. */
let manualClock: number | null = null;

function wake() {
  if (!raf && renderer && manualClock === null) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

/** Shapes made of thin lines or tiny points, which need every pixel (sigils, an aura's motes and runes). */
const isCrisp = (s: LiveShape) => {
  const type = s.f.type ?? s.type;
  return type === ShapeType.Sigil || type === ShapeType.Orbit;
};

function writeShape(i: number, s: LiveShape, t: number) {
  const o = i * SHAPE_FLOATS;
  const f = s.f;
  const c = f.color ?? s.color;
  let k = f.k * s.opacity;
  if (s.stopped) k *= s.fade / s.fadeTotal;
  shapeData[o] = s.box.x;
  shapeData[o + 1] = s.box.y;
  shapeData[o + 2] = f.hw;
  shapeData[o + 3] = f.hh;
  shapeData[o + 4] = f.type ?? s.type;
  shapeData[o + 5] = t;
  shapeData[o + 6] = s.age;
  shapeData[o + 7] = s.seed;
  shapeData[o + 8] = c[0] * k;
  shapeData[o + 9] = c[1] * k;
  shapeData[o + 10] = c[2] * k;
  shapeData[o + 11] = s.page ? 1 : 0;
  for (let j = 0; j < 12; j++) shapeData[o + 12 + j] = f.q[j] ?? 0;
}

function frame(nowMs: number) {
  // `raf` stays set while this frame runs: effects that tasks spawn during it
  // would otherwise wake() a second loop, and every such frame another one,
  // each drawing the whole overlay again.
  if (!renderer || !pool) {
    raf = 0;
    return;
  }
  if (renderer.isLost) {
    teardown();
    return;
  }
  // (Never below 0: the first frame after wake() is stamped with the time it
  // began, which can be a little before wake() read the clock.)
  const rawDt = Math.max(0, nowMs - last) / 1000;
  last = nowMs;

  // Adapt quality: if frames keep taking far longer than a display refresh
  // while effects run, drop resolution. If a drop doesn't make frames any
  // quicker, they weren't slow because of the effects: the display or the
  // browser runs at a lower rate (30fps in a power-saving mode, say). Then
  // the drop is undone and frames that slow count as normal from then on.
  // (Gaps over 300ms are a background tab or a stall, not the effects.)
  if (rawDt > 0 && rawDt < 0.3) {
    const ms = Math.min(rawDt, 0.1) * 1000;
    frameAvg += (ms - frameAvg) * 0.12;
    if (probe) {
      probe.time += rawDt;
      probe.frames++;
      if (probe.time > 1) {
        const avg = (probe.time * 1000) / probe.frames;
        if (avg > probe.before * 0.85) {
          quality = probe.from;
          slowMs = Math.max(slowMs, avg * 1.3);
          resize();
        }
        probe = null;
        slowFor = 0;
        frameAvg = avg;
      }
    } else if (frameAvg > slowMs && quality < 2) {
      slowFor += rawDt;
      if (slowFor > 0.6) {
        probe = { from: quality, before: frameAvg, time: 0, frames: 0 };
        quality++;
        slowFor = 0;
        resize();
      }
    } else slowFor = Math.max(0, slowFor - rawDt * 0.5);
  }

  // (25ms rather than 33: a frame that comes a little early isn't skipped too.)
  const draw = !calm || nowMs - lastDraw >= 25;
  if (draw) lastDraw = nowMs;
  let busy = false;
  try {
    busy = simulate(Math.min(rawDt, 1 / 15), nowMs, draw);
  } finally {
    raf = busy ? requestAnimationFrame(frame) : 0;
  }
  if (!busy) show(false);
}

/** Advances every effect by `dt` seconds and (if `render`) draws. Returns whether anything is still alive. */
function simulate(dt: number, nowMs: number, render: boolean): boolean {
  if (!renderer || !pool) return false;
  for (let i = 0; i < tasks.length; ) {
    const t = tasks[i];
    t.age += dt;
    let keep = false;
    try {
      keep = t.fn(dt, t.age);
    } catch (e) {
      console.warn('FX task failed', e);
    }
    if (keep) i++;
    else tasks.splice(i, 1);
  }

  // Soft shapes are written first; thin-line shapes (sigils, orbits) last, and the
  // renderer draws those at full resolution so their strokes stay crisp.
  const visible: [LiveShape, number][] = [];
  shapes = shapes.filter((s) => {
    s.age += dt;
    if (s.age < 0) return true;
    if (s.stopped) {
      s.fade -= dt;
      if (s.fade <= 0) return false;
    }
    if (Number.isFinite(s.life) && s.age >= s.life) return false;
    if (s.at instanceof Element) {
      // Follow the element; once it's gone (the screen moved on), fade out
      // where it was.
      if (s.at.isConnected) {
        s.box = boxOf(s.at);
        if (s.followOpacity) s.opacity = opacityOf(s.at);
      } else if (!s.stopped) {
        s.stopped = true;
        s.fade = s.fadeTotal = 0.2;
      }
    }
    const t = Number.isFinite(s.life) ? s.age / s.life : 0;
    s.update(s.f, t, s.age, s.box);
    if (s.f.k > 0) visible.push([s, t]);
    return true;
  });
  let nShapes = 0;
  let nCrisp = 0;
  let shapesCalm = true;
  for (const crisp of [false, true]) {
    for (const [s, t] of visible) {
      if (isCrisp(s) !== crisp || nShapes >= MAX_SHAPES) continue;
      writeShape(nShapes++, s, t);
      if (crisp) nCrisp++;
      if (!s.calm) shapesCalm = false;
    }
  }

  const nParticles = pool.step(dt);
  calm = !!coarse?.matches && shapesCalm && shake.trauma === 0 && pool.fastest < CALM_SPEED * CALM_SPEED;

  // Shake: trauma decays; the offset follows two noise curves.
  if (shake.trauma > 0) {
    shake.trauma = Math.max(0, shake.trauma - dt * 1.6);
    const s = shake.trauma * shake.trauma * shake.amp;
    const tt = nowMs / 1000 * 26;
    applyShake(noise1(tt, 1) * s, noise1(tt, 2) * s * 0.8);
    if (shake.trauma === 0) applyShake(0, 0);
  }

  const busy = nParticles > 0 || nShapes > 0 || tasks.length > 0 || shake.trauma > 0 || shapes.length > 0 || pool.count > 0;
  if (!render) return busy;
  if (nParticles > 0 || nShapes > 0) {
    renderer.draw([viewW, viewH], dpr, pool.instances, nParticles, shapeData, nShapes, nCrisp, dialogNow());
    show(true);
  } else {
    renderer.clear();
    show(false);
  }
  return busy;
}

/** The open dialog, which hides the page's light behind it and dims all light outside it (lib/behindDialog.ts). */
function dialogNow(): DialogLight {
  const { amount } = openDialog();
  const box = amount > 0 ? dialogBox() : null;
  return { amount, box: box?.rect ?? null, radius: box?.radius ?? 0 };
}

/**
 * For the test harness: stops real-time playback and advances effects by
 * `seconds` in fixed steps, drawing only the final frame, so screenshots can
 * show an exact moment however slow the machine renders.
 */
export function fxStep(seconds: number, fps = 60) {
  if (manualClock === null) {
    cancelAnimationFrame(raf);
    raf = 0;
    manualClock = performance.now();
  }
  const n = Math.max(1, Math.round(seconds * fps));
  for (let i = 0; i < n; i++) {
    manualClock += 1000 / fps;
    simulate(1 / fps, manualClock, i === n - 1);
  }
}

/** Back to real-time playback after fxStep. */
export function fxRealtime() {
  manualClock = null;
  wake();
}

// ---------- setup ----------

let ro: ResizeObserver | null = null;
let deviceBox: { w: number; h: number } | null = null;

function resize() {
  if (!canvas || !renderer) return;
  viewW = Math.max(1, canvas.clientWidth);
  viewH = Math.max(1, canvas.clientHeight);
  // Glows don't need every device pixel: 1.5 per CSS px at most (sparks stay
  // crisp), less as quality drops. Shapes, which are all soft, get about one
  // texel per CSS px.
  const cap = quality === 0 ? 1.5 : quality === 1 ? 1 : 0.75;
  const k = Math.min(devicePixelRatio || 1, cap) / (devicePixelRatio || 1);
  const w = deviceBox && k === 1 ? deviceBox.w : Math.round(viewW * (devicePixelRatio || 1) * k);
  const h = deviceBox && k === 1 ? deviceBox.h : Math.round(viewH * (devicePixelRatio || 1) * k);
  dpr = w / viewW;
  renderer.resize(w, h, Math.min(1, 1 / dpr));
  wake();
}

function teardown() {
  cancelAnimationFrame(raf);
  raf = 0;
  ro?.disconnect();
  ro = null;
  renderer = null;
  pool = null;
  shapes = [];
  tasks = [];
  shake.trauma = 0;
  applyShake(0, 0);
  for (const l of listeners) l(userOn);
}

/** Creates the renderer and particle pool on `c` and follows its size. Returns whether WebGL2 works. */
function setup(c: HTMLCanvasElement): boolean {
  renderer = FxRenderer.create(c, { maxParticles: 5000, maxShapes: MAX_SHAPES });
  if (!renderer) return false;
  pool = new ParticlePool(coarse?.matches ? 2000 : 5000);
  quality = coarse?.matches ? 1 : 0;
  probe = null;
  ro?.disconnect();
  ro = new ResizeObserver(([entry]) => {
    const box = entry.devicePixelContentBoxSize?.[0];
    const estW = entry.contentRect.width * devicePixelRatio;
    const exact = box && Math.abs(box.inlineSize - estW) <= 2;
    deviceBox = exact ? { w: box.inlineSize, h: box.blockSize } : null;
    resize();
  });
  try {
    ro.observe(c, { box: 'device-pixel-content-box' });
  } catch {
    ro.observe(c);
  }
  resize();
  shown = true;
  show(false);
  for (const l of listeners) l(userOn);
  return true;
}

/** Starts the overlay on `c`. Returns a cleanup function. */
export function startFx(c: HTMLCanvasElement): () => void {
  canvas = c;
  if (!setup(c)) return () => {};
  const onMotion = () => {
    if (!fxActive()) clearAll();
    for (const l of listeners) l(userOn);
  };
  reduce?.addEventListener('change', onMotion);
  // Phones often drop the context while the tab is in the background.
  // preventDefault() asks the browser to give it back; then everything is
  // built again on it. (The old renderer's objects died with the context, and
  // its destroy() would lose the restored one, so it's simply dropped.)
  const onLost = (e: Event) => {
    e.preventDefault();
    teardown();
  };
  const onRestored = () => {
    if (!renderer) setup(c);
  };
  c.addEventListener('webglcontextlost', onLost);
  c.addEventListener('webglcontextrestored', onRestored);
  return () => {
    reduce?.removeEventListener('change', onMotion);
    c.removeEventListener('webglcontextlost', onLost);
    c.removeEventListener('webglcontextrestored', onRestored);
    renderer?.destroy();
    teardown();
  };
}
