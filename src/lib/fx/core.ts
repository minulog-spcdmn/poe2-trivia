// The FX overlay's engine: owns the canvas, the particle pool, live shapes and
// per-frame tasks (emitters, comets), and drives the renderer only while
// something is alive. Also runs camera shake and adapts quality to the device.
//
// Effects are off when the user turned them off, when the system asks for
// reduced motion, or when WebGL2 isn't available; every call below is then a
// cheap no-op, so callers never need to check.
//
// While the tab is in the background no frames come, and nothing moves on.
// What would run its course meanwhile is dropped as it goes away, and not
// started while it's away (see setHidden): unseen, it would otherwise all
// start at once as the tab comes back.
//
// The renderer isn't made as the page loads: its context and shaders would
// hold up the first paint (see startFx). Effects asked for before it's ready
// wait for it, and play once it is.

import { BEHIND_PICTURE, BEHIND_UI, FxRenderer, MAX_HIDES, SHAPE_FLOATS, ShapeType, pictureReady, type DialogLight, type HideLight, type SigilPicture, type Silhouette } from './renderer';
import { webgl2Refused, whenGpuCaughtUp, type Build } from './gl';
import { ParticlePool, type ParticleSpec } from './particles';
import { opacityOf } from '../opacity';
import { dialogBox, openDialog } from '../behindDialog';
import { cornerOnScreen } from '../corner';
import { zoomOf } from '../stage';
import { readStored, writeStored } from '../storage';
import { whenIdle } from '../idle';
import { scrollFollow } from '../scrollFollow';
import { pageScroll } from '../pageScroll';
import { switchedOff, type Switch } from '../switchedOff';
import { frameEvent, timed } from '../fpsMeter';
import { GpuBudget, type Layer, type Saved } from './gpuBudget';
import type { GpuDraw } from './gpuTimer';

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
  /**
   * The picture this shines from behind (its outline stays clear). One
   * picture at a time: the first shape's; shapes naming another get none.
   */
  silhouette?: Silhouette | null;
  /** This frame, whether it's calm (ShapeSpec's `calm`), when that changes as it goes. */
  calm?: boolean;
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
  /** It shines from behind the UI: the boxes cover() names hide it (see COVER in renderer.ts). */
  behind?: boolean;
};

type LiveShape = ShapeSpec & {
  /** The group it was made in (see fxGroup), 0 for none. */
  group: number;
  age: number;
  seed: number;
  box: Box;
  /** How far the page was scrolled when `box` was measured (see placeCanvas). */
  scrollAt: number;
  /**
   * Where the anchor's centre was as measured, before update() moved `box`
   * (a fire shifts it up over its flames): how far the anchor moved is told
   * from this, or a shape that shifts its box would seem to move every frame,
   * and `box` is put back here before each update(), so a shift never adds up.
   */
  seen: Point;
  /** Fade-out once stopped: remaining and total seconds. */
  fade: number;
  fadeTotal: number;
  stopped: boolean;
  /** The anchor's opacity, when followed. */
  opacity: number;
  /** Light from the page, which an open dialog hides (see onPage). */
  page: boolean;
  /** Light of what stands over the page (a toast: overPage), which is the page's again while a dialog is open over both. */
  front: boolean;
  /** Whose light it is (lightOf's element, or its anchor), for a front that comes or goes while it plays (see overPage). */
  owner: Anchor;
  f: ShapeFrame;
};

export type Handle = { stop: (fadeSeconds?: number) => void };
/** A shape's handle, which can also say whether it's still there (not stopped, ended, or dropped as the tab went away). */
export type ShapeHandle = Handle & { alive: () => boolean };
const NOOP: ShapeHandle = { stop() {}, alive: () => false };

/** Whether `h` is something actually running, rather than the stand-in for one that never started. */
export function isLive(h: Handle) {
  return h !== NOOP;
}

// ---------- tasks ----------

/** Runs every frame until it returns false. */
export type Task = (dt: number, age: number) => boolean;

/** How a task runs (see task()). */
export type TaskOptions = {
  /** The most seconds it runs: it ends by then however it's written. */
  life?: number;
  /** Kept while the tab is away: one that lasts until stopped (a burning flare's), or that something waits on. */
  keep?: boolean;
};

/** `group`, `behind`: the group it was made in and whether that was from behind the UI, in force again as it runs (see fxGroup). */
type LiveTask = { fn: Task; age: number; life: number; keep: boolean; group: number; behind: boolean; owner: Element | null };

// ---------- state ----------

let userOn = readStored('fx') !== '0';
const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;

let canvas: HTMLCanvasElement | null = null;
let renderer: FxRenderer | null = null;
let pool: ParticlePool | null = null;
/**
 * The renderer on its way (see startFx): waiting for the page to have
 * painted (and, while effects are off, for them to be on), or for the GPU
 * to catch up (`waiting` cancels either; `forPaint` says which), or its
 * shaders compiling (`building`). Meanwhile effects count as on, and wait
 * for it.
 */
let waiting: (() => void) | null = null;
let forPaint = false;
let building: Build | null = null;
const coming = () => !!(waiting || building);
/** When the first effect that waits for the renderer was asked for (performance.now()), or null. */
let queuedAt: number | null = null;
/** When the view was last shaken while waiting for it. */
let shakenAt = 0;
const MAX_SHAPES = 96;
const shapeData = new Float32Array(MAX_SHAPES * SHAPE_FLOATS);
let shapes: LiveShape[] = [];
let tasks: LiveTask[] = [];
let raf = 0;
let last = 0;
/** Whether the tab is in the background (see setHidden), and since when (performance.now()). */
let hidden = false;
let awayAt = 0;
let viewW = 1;
let viewH = 1;
let dpr = 1;
const listeners = new Set<(on: boolean) => void>();
const awayListeners = new Set<(away: boolean) => void>();

/**
 * Quality: 0 full resolution, 1 lower, 2 lowest, as the GPU keeps up
 * (lib/fx/gpuBudget.ts weighs it, after the pace, fxSlowGap; touch screens
 * start, and stay, at 1). The
 * backdrop follows it (fxScaledDown). Bloom stays on at every level:
 * switching it off mid-effect would dim everything at once.
 */
let quality = coarse?.matches ? 1 : 0;
/** Another quality is wanted: it's moved to once nothing is drawn (see frame()). */
let resizeDue = false;
let resizeDueAt = 0;

/**
 * On phones, while everything alive is slow (glitter drifting down, rays
 * turning) and nothing shakes, frames are drawn at about 30fps: each one
 * costs the same full-screen passes (HDR target, bloom, composite) however
 * little is in it, and drifting light looks the same at half the rate.
 * Effects still advance every frame, so timing is unchanged. On every
 * device, the same goes while all that's alive is endless and calm (a
 * streak's fire burning between moments), which can last a whole game: at
 * the pace the GPU keeps up with (fxSlowGap), every frame where it can.
 */
let calm = false;
let lastDraw = 0;
/** Fastest a particle may move and still count as calm: about 7px per frame at 30fps. */
const CALM_SPEED = 200;

/** Are effects being drawn right now? */
export function fxActive() {
  return (!!renderer || coming()) && userOn && !reduce?.matches;
}

/** The user's setting (effects may still be off for reduced motion or missing WebGL2). */
export function fxUserOn() {
  return userOn;
}

export function fxAvailable() {
  return (!!renderer || coming()) && !reduce?.matches;
}

export function setFxOn(on: boolean) {
  userOn = on;
  writeStored('fx', on ? '1' : '0');
  if (!fxActive()) clearAll();
  // (Not made while they were off: made now.)
  else hurry();
  for (const l of listeners) l(on);
}

export function onFxChange(fn: (on: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Whether the tab is in the background. Effects that run beside the overlay
 * (lights, the mood, the aura) follow the same rule as its own (see
 * setHidden): what would run its course isn't started meanwhile.
 */
export function fxHidden() {
  return hidden;
}

/** Calls `fn` as the tab goes away (true) or comes back, once the overlay has dropped or woken what it holds. */
export function onFxHidden(fn: (away: boolean) => void) {
  awayListeners.add(fn);
  return () => awayListeners.delete(fn);
}

function clearAll() {
  shapes = [];
  tasks = [];
  queuedAt = null;
  covers.clear();
  blank();
}

/** No particles, no shake, nothing drawn. */
function blank() {
  pool?.clear();
  stopShake();
  renderer?.clear();
  show(false);
}

/** What's alive right now (for debugging and tests). */
export function fxStats() {
  return { particles: pool?.count ?? 0, shapes: shapes.length, tasks: tasks.length, running: raf !== 0, quality };
}

/** Device px per CSS px the effects are drawn at (fewer than the screen's where they're scaled down). */
export const fxPixelRatio = () => dpr;

/** Seconds of effect time since page load (for choreography that needs a clock). */
export function now() {
  return performance.now() / 1000;
}

// ---------- spawning ----------

/**
 * Whether light starting at `a` belongs to the page, which an open dialog
 * hides and dims (lib/behindDialog.ts), rather than to the dialog itself:
 * everything but effects that start inside the open dialog. With no dialog
 * open, the page's is everything but the light of what stands over it (a
 * toast: overPage), which hides the page's behind it: effects on an element
 * of it, or made for one (lightOf). It stays the page's or the dialog's for
 * its whole life, wherever it goes.
 */
function onPage(a: Anchor): boolean {
  const { backdrop } = openDialog();
  if (!backdrop) return !inFront(a);
  if (a instanceof Element) return !backdrop.contains(a);
  const box = dialogBox();
  if (!box) return true;
  const { x, y } = boxOf(a);
  const r = box.rect;
  return x < r.left || x > r.right || y < r.top || y > r.bottom;
}

/**
 * While the renderer is on its way, seconds since the first effect asked for
 * meanwhile (0 for that one, and once it's made). What's asked for is held
 * back by that much: setup() moves everything on by the whole wait, so each
 * effect goes on from where it would be by then.
 */
function waited(): number {
  if (renderer) return 0;
  // (Time away doesn't count: nothing moves on meanwhile, see setHidden.)
  const t = hidden ? awayAt : performance.now();
  queuedAt ??= t;
  return (t - queuedAt) / 1000;
}

export function particle(p: ParticleSpec) {
  if (!fxActive() || hidden || particlesOff) return;
  const late = waited();
  const spec = behindNow && !p.behind ? { ...p, behind: true } : p;
  pool!.spawn(late ? { ...spec, delay: (spec.delay ?? 0) + late } : spec, onPage(ownerNow ?? p), groupNow);
  wake();
}

/**
 * Has seeking particles follow `el` for `seconds` (ParticleSpec.seek's
 * `from` and `to`): returns the slot to name, whose offset tracks how far
 * the element has moved on screen since now, or 0 (nothing to follow, or
 * effects off). An element that leaves the page stops where it was last.
 */
export function follow(el: Element, seconds: number): number {
  if (!fxActive() || hidden || !pool || detached(el)) return 0;
  const p = pool;
  const slot = p.claimFollow();
  const b0 = boxOf(el);
  // Till a little past `seconds`, for the stragglers of a stream timed to land by then.
  task(() => {
    if (detached(el)) return false;
    const b = boxOf(el);
    p.follows[2 * slot - 2] = b.x - b0.x;
    p.follows[2 * slot - 1] = b.y - b0.y;
    return true;
  }, { life: seconds + 0.25 });
  return slot;
}

/** How far the element behind follow slot `slot` has moved (none for 0). */
export function followOffset(slot: number): Point {
  if (!pool || !slot) return { x: 0, y: 0 };
  return { x: pool.follows[2 * slot - 2], y: pool.follows[2 * slot - 1] };
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

/** Beta: the kinds of shape switched off, to find which makes a moment slow (lib/switchedOff.ts). */
const SHAPE_SWITCHES: [Switch, number[]][] = [
  ['rays', [ShapeType.Rays]],
  ['flare', [ShapeType.Flare]],
  ['outline', [ShapeType.RectGlow, ShapeType.QuadGlow]],
  ['ring', [ShapeType.Ring]],
  ['flash', [ShapeType.Flash]],
];
const shapesOff = new Set(SHAPE_SWITCHES.flatMap(([name, types]) => (switchedOff(name) ? types : [])));
const shapeOff = (type: number) => shapesOff.size > 0 && shapesOff.has(type);
const particlesOff = switchedOff('particles');

export function shape(spec: ShapeSpec): ShapeHandle {
  if (!fxActive() || detached(spec.at) || (hidden && Number.isFinite(spec.life)) || shapeOff(spec.type)) return NOOP;
  if (shapes.length >= MAX_SHAPES) {
    const i = leastNeeded();
    if (i < 0) return NOOP;
    shapes.splice(i, 1);
  }
  const box = boxOf(spec.at);
  const s: LiveShape = {
    ...spec,
    behind: spec.behind || behindNow,
    group: groupNow,
    age: -(spec.delay ?? 0) - waited(),
    seed: Math.random() * 100,
    box,
    scrollAt: pageScroll()[1],
    seen: { x: box.x, y: box.y },
    fade: 0,
    fadeTotal: 0,
    stopped: false,
    opacity: 1,
    page: onPage(ownerNow ?? spec.at),
    front: !openDialog().backdrop && inFront(ownerNow ?? spec.at),
    owner: ownerNow ?? spec.at,
    f: { hw: 0, hh: 0, k: 1, q: new Array(12).fill(0) },
  };
  shapes.push(s);
  wake();
  return {
    stop(fadeSeconds = 0.4) {
      if (s.stopped) return;
      // (Away, its fade would only play once it's back, on what has moved on: it goes now.)
      if (hidden) {
        shapes = shapes.filter((x) => x !== s);
        return;
      }
      s.stopped = true;
      s.fade = s.fadeTotal = Math.max(0.001, fadeSeconds);
    },
    alive: () => !s.stopped && shapes.includes(s),
  };
}

/**
 * Runs `fn` every frame until it returns false, its `life` runs out or the
 * handle is stopped. A task is part of a moment unless it's to be kept: it's
 * dropped as the tab goes away and not started while it's away (see
 * setHidden), and one with a life that waited past it for the renderer is
 * dropped too (setup).
 */
export function task(fn: Task, { life = Infinity, keep = false }: TaskOptions = {}): Handle {
  if (!fxActive() || (hidden && !keep)) return NOOP;
  const t: LiveTask = { fn, age: -waited(), life, keep, group: groupNow, behind: behindNow, owner: ownerNow };
  tasks.push(t);
  wake();
  return {
    stop() {
      tasks = tasks.filter((x) => x !== t);
    },
  };
}

// ---------- groups ----------

/** The group effects made now belong to (see fxGroup), 0 for none; and whether they shine from behind the UI. */
let groupNow = 0;
let behindNow = false;
/** The element effects made now belong to (see lightOf), null for their own anchor's. */
let ownerNow: Element | null = null;
let groupsMade = 0;

function inGroup<T>(group: number, behind: boolean, fn: () => T): T {
  const was = groupNow;
  const wasBehind = behindNow;
  groupNow = group;
  behindNow = behind;
  try {
    return fn();
  } finally {
    groupNow = was;
    behindNow = wasBehind;
  }
}

/**
 * Effects that belong together, a screen's (the category cards'): what is
 * made inside `run` is in the group, and so is all that its emitters and
 * delayed steps go on to make. `stop` ends the group's effects together,
 * fading them over `fadeSeconds`, so they don't play on over the screen that
 * takes its place. With `behind`, what `run` makes shines from behind the UI
 * (see cover). A run inside another group's belongs to the inner group.
 */
export type FxGroup = {
  run<T>(fn: () => T, o?: { behind?: boolean }): T;
  stop(fadeSeconds?: number): void;
};

export function fxGroup(): FxGroup {
  const id = ++groupsMade;
  return {
    run: (fn, o) => inGroup(id, !!o?.behind, fn),
    stop(fadeSeconds = 0.2) {
      tasks = tasks.filter((t) => t.group !== id);
      // (Away, nothing fades: it goes at once, as a stopped shape does.)
      shapes = shapes.filter((s) => {
        if (s.group !== id) return true;
        if (hidden || s.age < 0) return false;
        const fade = Math.max(0.001, fadeSeconds);
        if (!s.stopped) {
          s.stopped = true;
          s.fade = s.fadeTotal = fade;
        } else if (s.fade > fade) {
          // (Already fading, slower: on from as bright as it is now.)
          s.fadeTotal *= fade / s.fade;
          s.fade = fade;
        }
        return true;
      });
      pool?.fadeGroup(id, hidden ? 0 : fadeSeconds);
    },
  };
}

// ---------- the UI in front ----------

/**
 * Where the UI is, for light from behind it: boxes on screen (viewport CSS
 * px), with their corners' radii (top left, top right, bottom right, bottom
 * left, px) so a rounded one hides it in its own shape (a pill as a
 * capsule). A `soft` one (text, say) hides it with a wide soft edge rather
 * than a box's.
 */
export type CoverBox = { box: DOMRect; soft?: boolean; radii?: readonly number[] };
export type CoverSource = () => Iterable<CoverBox>;
const covers = new Set<CoverSource>();
const coverBoxes: number[] = [];

/**
 * While the handle is up, light from behind the UI (shapes and particles
 * marked `behind`) hides behind the boxes `source` gives, asked every frame
 * it's drawn (but while the view shakes: see setCovers): it lights the
 * backdrop round them and their edges, never them. The handle can be stopped
 * at any time, even after the effects went off or lost their context (which
 * drop every cover).
 */
export function cover(source: CoverSource): Handle {
  if (!fxActive()) return NOOP;
  covers.add(source);
  wake();
  return {
    stop() {
      covers.delete(source);
    },
  };
}

/** The boxes of every cover now, packed for the renderer (null for none). */
function coverNow(): number[] | null {
  if (!covers.size) return null;
  coverBoxes.length = 0;
  for (const src of covers) {
    try {
      for (const { box: r, soft, radii } of src()) {
        if (!(r.width > 0 && r.height > 0)) continue;
        coverBoxes.push(r.left, r.top, r.width, r.height, soft ? 1 : 0);
        for (let i = 0; i < 4; i++) coverBoxes.push(radii?.[i] ?? 0);
      }
    } catch (e) {
      console.warn('FX cover failed', e);
    }
  }
  return coverBoxes;
}

/** How far the view was shaken when the covers' boxes were last measured. */
let coverShake = { x: 0, y: 0 };

/**
 * Hands the renderer the covers' boxes. While the view shakes, the UI moves
 * only by the shake's offset, so the mask measured before it is moved with
 * it: measuring the UI again would force a layout every frame (right after
 * the shake's own write) and draw and upload the mask again each time.
 */
function setCovers(r: FxRenderer) {
  if (covers.size && shaking() && r.hasCover) {
    r.shiftCover(shake.x - coverShake.x, shake.y - coverShake.y);
    return;
  }
  coverShake = { x: shake.x, y: shake.y };
  r.setCover(coverNow(), [viewW, viewH]);
}

/** The deathmatch sigil's picture (lib/fx/duelArt.ts), handed to the renderer once painted, and to one made later. */
let sigilPicture: SigilPicture | null = null;
export function sigilArt(picture: SigilPicture) {
  sigilPicture = picture;
  renderer?.setSigil(picture);
}

/** Runs `fn` after `seconds` (effect time; skipped entirely while effects are off). */
export function after(seconds: number, fn: () => void) {
  task((_, age) => {
    if (age < seconds) return true;
    fn();
    return false;
  }, { life: seconds });
}

// ---------- camera shake ----------

/**
 * A shake moves the view as a camera would: the UI (shakeTarget) and the
 * backdrop's scene behind it (shakeOffset) by the same offset in the same
 * frame, so neither slides on the other. Two things move it, added up:
 * blows (shakeView) and a tremor (setTremor), the ground trembling for as
 * long as its source says.
 * A blow's offset is trauma² × amp, trauma wearing off JOLT_FADE a second;
 * it sways along two noise curves, JOLT_RATE steps of them a second (`phase`
 * the way along). kick: the direction it throws the view, weighed by w,
 * which falls from 1 to 0 over KICK seconds as the sway takes over (so a
 * blow never lands where the noise is near 0). The tremor shakes the view
 * by what its source gives each frame (`tremorPx`), along two curves of its
 * own, quicker: a shiver, not a sway. `at`: the frame (ms) the shake was
 * last moved to (-1: start afresh, nothing to wear off).
 */
const shake = {
  trauma: 0,
  amp: 0,
  phase: 0,
  kick: { x: 0, y: 0, w: 0 },
  tremor: null as Tremor | null,
  tremorPx: 0,
  tremorPhase: 0,
  at: -1,
  x: 0,
  y: 0,
  targets: [] as { el: HTMLElement; k: number }[],
};
const JOLT_FADE = 1.6;
const JOLT_RATE = 26;
const KICK = 0.08;
const TREMOR_RATE = 30;
/** Below this (px) a tremor isn't drawn: the view rests while its source is quiet. */
const TREMOR_MIN = 0.05;

/**
 * A tremor's source: how far (px) it shakes the view at `nowMs` (up and
 * down at most; across, 0.7 of it), 0 while still for now, or null once
 * it's over (its source let go).
 */
export type Tremor = (nowMs: number) => number | null;

/** Registers an element that moves with camera shake, `k` times as far. */
export function shakeTarget(el: HTMLElement, k = 1) {
  shake.targets.push({ el, k });
  return () => {
    shake.targets = shake.targets.filter((t) => t.el !== el);
    el.style.translate = '';
  };
}

/**
 * Shakes the view with a blow. `amount` 0-1 adds trauma, which wears off at
 * 1.6 a second, so it sets how long the shake lasts; `px` is the furthest
 * this blow moves the view at once, easing off as the square of the trauma
 * left. A blow on one still going adds to what's left of it.
 */
export function shakeView(amount: number, px = 7) {
  if (!fxActive() || hidden || amount <= 0) return;
  const left = shake.trauma ** 2 * shake.amp;
  shake.trauma = Math.min(1, shake.trauma + amount);
  shake.amp = Math.hypot(left, px) / shake.trauma ** 2;
  const a = Math.random() * Math.PI * 2;
  shake.kick = { x: Math.cos(a), y: Math.sin(a) * 0.8, w: 1 };
  // (Still till now: nothing to wear off before its first frame.)
  if (!shaking()) shake.at = -1;
  if (!renderer) shakenAt = performance.now();
  wake();
}

/** Sets the tremor's source (in place of any), or lets it go (null). */
export function setTremor(fn: Tremor | null) {
  shake.tremor = fn;
  if (!fn) shake.tremorPx = 0;
  else wake();
}

/** Whether the view is shaking (moved by an inline translate, not an animation). */
export function shaking() {
  return shake.trauma > 0 || shake.tremorPx > 0;
}

/** How far (CSS px) the view is moved now, for the backdrop to move its scene by. */
export function shakeOffset(): Point {
  return { x: shake.x, y: shake.y };
}

/** Stills the view at once (a tremor's source stays, to shake it again once effects play). */
function stopShake() {
  shake.trauma = 0;
  shake.tremorPx = 0;
  applyShake(0, 0);
}

/**
 * Moves the shake to the frame at `nowMs`, once, by whichever loop gets
 * there first: the backdrop's (before it measures the UI and draws) or the
 * effects'. A display frame hands both the same time, so the view, the
 * backdrop's scene and the UI's shadows on it move together. The offset is
 * placed as things stand, then worn on to the next frame, so a blow's first
 * frame lands at its full px.
 */
function advanceShake(nowMs: number) {
  if (nowMs === shake.at) return;
  const dt = shake.at < 0 ? 0 : Math.min(1 / 15, Math.max(0, (nowMs - shake.at) / 1000));
  shake.at = nowMs;
  if (shake.tremor) {
    // (Asked even while effects are off: what follows the source goes on.)
    const px = shake.tremor(nowMs);
    if (px === null) shake.tremor = null;
    shake.tremorPx = px !== null && px > TREMOR_MIN && fxActive() && !hidden ? px : 0;
  }
  if (!shaking()) {
    if (shake.x || shake.y) applyShake(0, 0);
    return;
  }
  let x = 0;
  let y = 0;
  if (shake.trauma > 0) {
    const s = shake.trauma ** 2 * shake.amp;
    const k = shake.kick;
    x += s * (k.x * k.w + noise1(shake.phase, 1) * (1 - k.w));
    y += s * (k.y * k.w + noise1(shake.phase, 2) * 0.8 * (1 - k.w));
    wearJolt(dt);
  }
  if (shake.tremorPx > 0) {
    x += shake.tremorPx * noise1(shake.tremorPhase, 5) * 0.7;
    y += shake.tremorPx * noise1(shake.tremorPhase, 6);
    shake.tremorPhase += dt * TREMOR_RATE;
  }
  applyShake(x, y);
}

/** Wears a blow `dt` seconds on: its kick handed over, its sway along, its trauma down. */
function wearJolt(dt: number) {
  shake.kick.w = Math.max(0, shake.kick.w - dt / KICK);
  shake.phase += dt * JOLT_RATE;
  shake.trauma = Math.max(0, shake.trauma - dt * JOLT_FADE);
}

/** Moves the view by (x, y). */
function applyShake(x: number, y: number) {
  shake.x = x;
  shake.y = y;
  for (const t of shake.targets) t.el.style.translate = x || y ? `${(x * t.k).toFixed(2)}px ${(y * t.k).toFixed(2)}px` : '';
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

/**
 * A phone scrolls the page on its own, ahead of the frames drawn here, so a
 * canvas fixed to the screen leaves the light on what scrolls behind, by as
 * far as the page goes in a frame or two (a lot, in a fling). While what the
 * effects follow scrolls with the page (an avatar in a list), the canvas is
 * set in the page instead, at the top of the screen as each frame is drawn:
 * between frames it scrolls with what it lights. While they follow what
 * stays put as the page scrolls (the bar pinned to the top in a game, the
 * dock at the bottom), it's fixed, as it was. Each pass, the shapes on
 * elements say which they are by how they moved as the page scrolled
 * (lib/scrollFollow.ts); with none, it's fixed, for what's placed on the
 * screen (sparks, the edge glow, a dialog's clear box). (#app is its
 * containing block in the page, and clips it, so a canvas reaching past the
 * end of the page never makes it longer.)
 */
let setInPage = false;
let placedAt = '';
function placeCanvas() {
  if (!canvas) return;
  const [x, y] = pageScroll();
  const at = setInPage ? `${x}px ${y}px` : '';
  if (at === placedAt) return;
  placedAt = at;
  canvas.style.position = setInPage ? 'absolute' : '';
  canvas.style.translate = at;
}

/** While the test harness steps effects by hand: its clock (ms); else null. */
let manualClock: number | null = null;

function wake() {
  // Not made yet: made now, and then everything asked for so far plays.
  if (!renderer) hurry();
  // (Away, none would come: the loop starts again once it's back, see setHidden.)
  else if (!raf && !hidden && manualClock === null) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

/** Shapes made of thin lines or tiny points, which need every pixel (sigils, an aura's motes and runes). */
const isCrisp = (s: LiveShape) => {
  const type = s.f.type ?? s.type;
  return type === ShapeType.Sigil || type === ShapeType.Orbit;
};

function writeShape(i: number, s: LiveShape, t: number, dialogUp: boolean) {
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
  // (A toast's light, made before a dialog opened over it, hides behind the dialog with the page's.)
  shapeData[o + 11] = (s.page || (s.front && dialogUp) ? 1 : 0) + (s.behind ? BEHIND_UI : 0);
  for (let j = 0; j < 12; j++) shapeData[o + 12 + j] = f.q[j] ?? 0;
}

/** One frame of the effects (timed for the beta's frame meter). */
function frame(nowMs: number) {
  timed('effects', frameUntimed, nowMs);
}

function frameUntimed(nowMs: number) {
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

  // What the effects' draws cost the GPU, for the quality (lib/fx/gpuBudget.ts:
  // weighed by these, the backdrop's, and its frames, see backdropFrame).
  // The resolution itself changes only once nothing is drawn (resizeDue):
  // making the targets anew stalls the GPU, which in the middle of a moment
  // (a right answer's reveal) held several frames up at once. The moment
  // plays out as it began; the next one is drawn at the new size, and only
  // then is it weighed again.
  // (Not timed on touch screens: a phone's GPU draws in tiles, later than its
  // timer sees, and some report next to nothing. There frames alone tell.)
  const draws = coarse?.matches ? null : renderer.gpuDraws();
  if (draws) for (const d of draws) gpuBudget.gpu('fx', d.ms, d.px, nowMs);
  // (No backdrop to tell the frames, its context lost for good, or none
  // beside the effects at all: the effects' own frames tell instead.)
  if (!backdropPixels) {
    if (rawDt > 0 && rawDt < 0.3) gpuBudget.frame(rawDt * 1000, nowMs);
    steer(nowMs);
  }

  const draw = !calm || nowMs - lastDraw >= fxSlowGap();
  if (draw) lastDraw = nowMs;
  let busy = false;
  try {
    busy = simulate(Math.min(rawDt, 1 / 15), nowMs, draw);
  } finally {
    raf = busy ? requestAnimationFrame(frame) : 0;
  }
  // (Something endless, a streak's fire, may never let go: then a drop is
  // made once it's calm, a few seconds on, and after a while even if it
  // never is, or a slow machine would wait at the old size, its quality
  // never adapting, for as long as it lasts. A climb can wait for a moment
  // with nothing drawn: making the targets anew mid-moment holds frames up.)
  const dropping = resizeDue && gpuBudget.next(nowMs) > quality;
  if (resizeDue && (!busy || (dropping && ((calm && nowMs - resizeDueAt > 3000) || nowMs - resizeDueAt > 8000)))) moveTo(nowMs);
  if (!busy) show(false);
}

let frameNo = 0;
/**
 * The followed elements' own opacities, read once per simulate() pass: shapes
 * on the same element or on siblings share their ancestors' reads. Nothing in
 * the pass writes an opacity (the shapes' update callbacks only read the DOM;
 * a callback that changed an element's opacity would have to clear this).
 */
const opacities = new Map<Element, number>();

/** Counts the frames effects are updated in, so values measured once per frame can be shared. */
export function currentFrame() {
  return frameNo;
}

/** Advances every effect by `dt` seconds and (if `render`) draws. Returns whether anything is still alive. */
function simulate(dt: number, nowMs: number, render: boolean): boolean {
  if (!renderer || !pool) return false;
  frameNo++;
  for (let i = 0; i < tasks.length; ) {
    const t = tasks[i];
    t.age += dt;
    let keep = false;
    // (What it makes belongs to the group it was made in.)
    groupNow = t.group;
    behindNow = t.behind;
    ownerNow = t.owner;
    try {
      // (It ends by its life however it's written, so dropping it unseen while the tab is away loses nothing that would still run.)
      keep = t.fn(dt, t.age) && t.age < t.life;
    } catch (e) {
      console.warn('FX task failed', e);
    } finally {
      groupNow = 0;
      behindNow = false;
      ownerNow = null;
    }
    if (keep) i++;
    else tasks.splice(i, 1);
  }

  // Soft shapes are written first; thin-line shapes (sigils, orbits) last, and the
  // renderer draws those at full resolution so their strokes stay crisp.
  const visible: [LiveShape, number][] = [];
  // Of the shapes on elements, drawn this pass: how many there are, which
  // way they went as the page scrolled (see placeCanvas), and whether any
  // moved on the screen, or in the page.
  const scrollNow = pageScroll()[1];
  let onElements = 0;
  let withPage = 0;
  let pinned = 0;
  let movedOnScreen = false;
  let movedInPage = false;
  opacities.clear();
  shapes = shapes.filter((s) => {
    s.age += dt;
    if (s.age < 0) return true;
    if (s.stopped) {
      s.fade -= dt;
      if (s.fade <= 0) return false;
    }
    if (Number.isFinite(s.life) && s.age >= s.life) return false;
    let follow: ReturnType<typeof scrollFollow> = null;
    let onScreen = false;
    let inPage = false;
    if (s.at instanceof Element) {
      // Follow the element; once it's gone (the screen moved on), fade out
      // where it was.
      if (s.at.isConnected) {
        const b = boxOf(s.at);
        const [dx, dy, scrolled] = [b.x - s.seen.x, b.y - s.seen.y, scrollNow - s.scrollAt];
        onScreen = Math.abs(dx) + Math.abs(dy) > 0.25;
        inPage = Math.abs(dx) + Math.abs(dy + scrolled) > 0.25;
        follow = scrollFollow(dy, scrolled);
        s.box = b;
        s.seen.x = b.x;
        s.seen.y = b.y;
        s.scrollAt = scrollNow;
        if (s.followOpacity) s.opacity = opacityOf(s.at, opacities);
      } else if (!s.stopped) {
        s.stopped = true;
        s.fade = s.fadeTotal = 0.2;
      }
    }
    const t = Number.isFinite(s.life) ? s.age / s.life : 0;
    // (update() is handed the anchor's centre as measured every pass, also
    // once the element is gone or for a point: what it shifted last time
    // never carries over.)
    s.box.x = s.seen.x;
    s.box.y = s.seen.y;
    s.update(s.f, t, s.age, s.box);
    if (s.f.k > 0) {
      visible.push([s, t]);
      if (s.at instanceof Element) {
        onElements++;
        if (follow === 'page') withPage++;
        else if (follow === 'screen') pinned++;
        movedOnScreen ||= onScreen;
        movedInPage ||= inPage;
      }
    }
    return true;
  });
  const wasInPage = setInPage;
  if (!onElements) setInPage = false;
  else if (withPage !== pinned) setInPage = withPage > pinned;
  // Moved where the canvas is set: a canvas in the page goes along with what
  // scrolls with it, with no new frame.
  const anchorsMoved = (setInPage ? movedInPage : movedOnScreen) || setInPage !== wasInPage;
  // (Let go of the elements: they may leave the page before the next pass.)
  opacities.clear();
  let nShapes = 0;
  let nCrisp = 0;
  let shapesCalm = true;
  let shapesEndless = true;
  // (A picture with no size, hidden or scaled away, has no outline to keep clear.)
  const ready = (sil?: Silhouette | null) => !!sil && sil.w > 0 && sil.h > 0 && pictureReady(sil.pic);
  const silhouette = visible.map(([s]) => s.f.silhouette).find(ready) ?? null;
  const dialogUp = !!openDialog().backdrop;
  for (const crisp of [false, true]) {
    for (const [s, t] of visible) {
      if (isCrisp(s) !== crisp || nShapes >= MAX_SHAPES) continue;
      writeShape(nShapes, s, t, dialogUp);
      if (silhouette && s.f.silhouette?.pic === silhouette.pic) shapeData[nShapes * SHAPE_FLOATS + 11] += BEHIND_PICTURE;
      nShapes++;
      if (crisp) nCrisp++;
      if (!(s.f.calm ?? s.calm)) shapesCalm = false;
      if (Number.isFinite(s.life)) shapesEndless = false;
    }
  }

  const nParticles = pool.step(dt);
  // (A calm shape on an element that moves isn't calm: drawn at half the rate
  // while the page scrolls, or a phone's toolbars slide, it would trail its
  // element, jumping after it every other frame.)
  calm = (!!coarse?.matches || (nShapes > 0 && shapesEndless)) && shapesCalm && !anchorsMoved && !shaking() && pool.fastest < CALM_SPEED * CALM_SPEED;

  advanceShake(nowMs);

  const busy = nParticles > 0 || nShapes > 0 || tasks.length > 0 || shaking() || shake.tremor !== null || shapes.length > 0 || pool.count > 0;
  // (Drawn now if it has just begun to move, rather than a frame behind.)
  if (!render && !(anchorsMoved && manualClock === null)) return busy;
  if (nParticles > 0 || nShapes > 0) {
    placeCanvas();
    setCovers(renderer);
    renderer.draw([viewW, viewH], dpr, pool.instances, nParticles, shapeData, nShapes, nCrisp, dialogNow(), silhouette);
    show(true);
  } else {
    renderer.clear();
    show(false);
  }
  return busy;
}

/**
 * The open dialog, which hides the page's light behind it and dims all light
 * outside it (lib/behindDialog.ts). With none, what stands over the page (a
 * window, a toast) hides the page's light behind it the same way, and dims
 * nothing.
 */
function dialogNow(): DialogLight {
  const { amount } = openDialog();
  const box = amount > 0 ? dialogBox() : null;
  // (A list of its own each frame: whoever keeps it keeps that frame's boxes.)
  const hides: HideLight[] = [];
  if (box) {
    hides.push({ box: box.rect, radius: box.radius, amount });
    return { amount, box: box.rect, radius: box.radius, hides };
  }
  for (const src of windows) {
    if (hides.length >= MAX_HIDES) break;
    const r = src();
    if (r && r.width > 0 && r.height > 0) hides.push({ box: r, radius: 0, amount: 1 });
  }
  const windowed = hides.length > 0;
  // (Ancestors the toasts share are read once.)
  const own = new Map<Element, number>();
  for (const el of fronts) {
    if (hides.length >= MAX_HIDES) break;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    // As it (or what it's in) fades in and out, it hides as much as it shows.
    const o = opacityOf(el, own);
    if (o > 0) hides.push({ box: r, radius: cornerOnScreen(cornerOf(el), r.width, r.height, zoomOf(el)), amount: o });
  }
  // (A window, with a dialog's backdrop up but no box of it yet, dims nothing either.)
  return { amount: windowed ? 0 : amount, box: null, radius: 0, hides };
}

/** What stands over the page (overPage). */
const fronts = new Set<Element>();

/** Each one's corner radius as its style gives it, read again when the window's size changes (a phone turned, a breakpoint crossed). */
const corners = new WeakMap<Element, { at: string; radius: string }>();
function cornerOf(el: Element): string {
  const at = `${innerWidth}x${innerHeight}`;
  let c = corners.get(el);
  if (c?.at !== at) corners.set(el, (c = { at, radius: getComputedStyle(el).borderTopLeftRadius }));
  return c.radius;
}

/** Whether `a` is an element of something that stands over the page (overPage). */
function inFront(a: Anchor): boolean {
  if (!(a instanceof Element) || !fronts.size) return false;
  for (const f of fronts) if (f.contains(a)) return true;
  return false;
}

/**
 * Svelte action for an element that stands over the page and the effects
 * layer's light, though the layer is drawn above it (a toast): the page's
 * light hides behind its box, as behind an open dialog's, and its own (from
 * effects on it, or made for it with lightOf) shows over it. Behind an open
 * dialog, its shapes hide with the page's; its particles, which live a
 * moment, keep showing for the rest of theirs. With `on` false it stands
 * over nothing (a sticky bar, see-through till it sticks); as it comes and
 * goes, the light already playing on it goes with it, its own or the page's.
 */
export function overPage(node: HTMLElement, on = true) {
  const set = (o: boolean) => {
    if (o === fronts.has(node)) return;
    if (o) fronts.add(node);
    else fronts.delete(node);
    // (Behind an open dialog it's all the page's either way.)
    if (openDialog().backdrop) return;
    for (const s of shapes) {
      if (s.owner instanceof Element && node.contains(s.owner)) {
        s.front = o;
        s.page = !o;
      }
    }
  };
  set(on);
  return {
    update: set,
    destroy() {
      fronts.delete(node);
    },
  };
}

/**
 * Runs `fn`, and the effects it makes (and its emitters and later steps go
 * on to make) are `el`'s light, wherever they start: over an element that
 * stands over the page (overPage) when `el` is in it, or in an open dialog.
 * For effects started at points rather than on `el`, which would otherwise
 * count as the page's wherever they are.
 */
export function lightOf<T>(el: Element, fn: () => T): T {
  const was = ownerNow;
  ownerNow = el;
  try {
    return fn();
  } finally {
    ownerNow = was;
  }
}

const windows = new Set<() => DOMRect | null>();

/**
 * While the handle is up, the box `source` gives (asked every frame it's
 * drawn; square cornered) hides the page's light as an open dialog does,
 * without dimming the page: for a window that floats over the game (an
 * item's, ItemWindow.svelte), opaque like a dialog. With a dialog open, only
 * the dialog's box is drawn.
 */
export function hideLightIn(source: () => DOMRect | null): Handle {
  // (Nothing to wake: with no light, there's none to hide, and while there is, every frame asks.)
  windows.add(source);
  return {
    stop() {
      windows.delete(source);
    },
  };
}

/**
 * For the test harness: stops real-time playback and advances effects by
 * `seconds` in fixed steps, drawing only the final frame, so screenshots can
 * show an exact moment however slow the machine renders.
 */
export function fxStep(seconds: number, fps = 60) {
  // (The renderer finished at once, if it's on its way.)
  if (!renderer) {
    if (waiting && canvas) build(canvas);
    building?.now();
  }
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

/** The most pixels the overlay draws at below quality 0 (see sizeAt): a 1440p screen's. */
const MAX_PIXELS = 2560 * 1440;

let ro: ResizeObserver | null = null;
let deviceBox: { w: number; h: number } | null = null;

const scaleListeners = new Set<() => void>();

/**
 * Whether the quality is down from full resolution: on a touch screen from
 * the start, elsewhere once the GPU was found too slow for every pixel (see
 * gpuBudget.ts). The backdrop then keeps to a 1440p screen's worth too
 * (lib/backdrop.ts).
 */
export function fxScaledDown() {
  return quality > 0;
}

/**
 * How long (ms) since slow motion (the backdrop's own, effects while calm)
 * was last drawn before it's drawn again: at the pace the GPU keeps up with
 * while effects play, or while none do (gpuBudget.ts), every frame where it
 * can; on a touch screen, as it is now, 30fps's always.
 */
export function fxSlowGap() {
  return gpuBudget.gap(raf !== 0, !!coarse?.matches);
}

/** Calls `fn` when fxScaledDown() changes. */
export function onFxScale(fn: () => void) {
  scaleListeners.add(fn);
  return () => scaleListeners.delete(fn);
}

/** The backdrop's device pixels at each quality (lib/backdrop.ts says, as it starts), or null while there's none. */
let backdropPixels: ((q: number) => number) | null = null;

/** The device pixels `layer` draws at quality `q` (none for the effects while they aren't drawn). */
function layerPixels(q: number, layer: Layer) {
  if (layer === 'backdrop') return backdropPixels?.(q) ?? 0;
  if (!renderer || !fxActive()) return 0;
  const [w, h] = sizeAt(q);
  return w * h;
}

/** What the GPU was found to cost on a past visit (see save()), or null. */
function savedCost(): Saved | null {
  try {
    const v = readStored('gpuCost');
    const saved = v ? JSON.parse(v) : null;
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
}

/** Which quality the GPU keeps up with (lib/fx/gpuBudget.ts). */
const gpuBudget = new GpuBudget(layerPixels, quality, savedCost());
let savedAt = -Infinity;
let written = '';
let writtenAt = -Infinity;

/**
 * Keeps what the GPU costs for the next visit: looked at once a minute
 * (unless `now`), written when it changed, or hourly so a level held stays
 * fresh (gpuBudget.ts, SAVED_FOR_S).
 */
function save(nowMs: number, now = false) {
  if (!now && nowMs - savedAt < 60_000) return;
  savedAt = nowMs;
  const s = gpuBudget.saved();
  if (!s) return;
  const same = JSON.stringify({ ...s, at: 0 });
  if (same === written && nowMs - writtenAt < 3600_000) return;
  written = same;
  writtenAt = nowMs;
  writeStored('gpuCost', JSON.stringify(s));
}

/**
 * The backdrop starts (with how many device pixels it draws at each
 * quality, and whether its GPU can be timed), or stops (null). As it
 * starts, the level a past visit held may set the quality before its first
 * frame (or, where the GPU can't be timed, a big screen starts a level down).
 */
export function setBackdropPixels(fn: ((q: number) => number) | null, timable = false) {
  backdropPixels = fn;
  if (!fn) return;
  gpuBudget.timable(timable);
  steer(performance.now());
}

let lastFrame = 0;

/**
 * One of the backdrop's frames (it has one every display frame): its draws
 * timed on the GPU since the last (see gpuTimer.ts), if any, and how long the
 * frame was, for the quality (gpuBudget.ts), with whether effects play and
 * whether they're off. (Gaps over 300ms are a background tab or a stall.)
 */
export function backdropFrame(nowMs: number, draws: GpuDraw[] | null) {
  if (draws) for (const d of draws) gpuBudget.gpu('backdrop', d.ms, d.px, nowMs);
  const ms = nowMs - lastFrame;
  lastFrame = nowMs;
  if (ms > 0 && ms < 300) gpuBudget.frame(ms, nowMs, raf !== 0, !fxActive());
  steer(nowMs);
  // The shake moved to this frame before the backdrop measures the UI and
  // draws (advanceShake); on a clock of its own (fxStep), the effects' loop
  // alone moves it.
  if (manualClock === null) advanceShake(nowMs);
}

/**
 * Weighs the quality (gpuBudget.ts). Another is moved to at once while no
 * effect is drawn, else marked due for a calm moment (see frame()).
 */
function steer(nowMs: number) {
  save(nowMs);
  if (gpuBudget.next(nowMs) === quality) {
    resizeDue = false;
    return;
  }
  if (!resizeDue) resizeDueAt = nowMs;
  resizeDue = true;
  if (!raf) moveTo(nowMs);
}

/**
 * Moves to the quality weighed: the overlay's targets made anew at its size,
 * the backdrop told (onFxScale). Returns whether it changed.
 */
function moveTo(nowMs: number) {
  resizeDue = false;
  const q = gpuBudget.next(nowMs);
  if (q === quality) return false;
  const scaled = quality > 0;
  quality = q;
  gpuBudget.applied(q, nowMs);
  frameEvent(`quality ${q}`);
  save(nowMs, true);
  resize();
  if (scaled !== q > 0) for (const l of scaleListeners) l();
  return true;
}

/** The size (device px) the overlay draws at at quality `q`, for the canvas's size now. */
function sizeAt(q: number): [number, number] {
  // Glows don't need every device pixel: 1.5 per CSS px at most (sparks stay
  // crisp), less as quality drops. Shapes, which are all soft, get about one
  // texel per CSS px.
  const cap = q === 0 ? 1.5 : q === 1 ? 1 : 0.75;
  // Below quality 0, never more than MAX_PIXELS in all either: on a 4K
  // screen 1.5 per CSS px came to 8 million, in half-float targets and their
  // bloom, under a backdrop as big, and on a GPU too weak for that a reveal's
  // frames waited for a tenth of a second and more. A GPU that keeps up
  // draws a big screen whole; one that doesn't is found out
  // (gpuBudget.ts) and comes down to this, the backdrop with it.
  const dprNow = devicePixelRatio || 1;
  const fit = q === 0 ? Infinity : Math.sqrt(MAX_PIXELS / Math.max(1, viewW * viewH));
  // (Nor wider or taller than the GPU's targets can be: a window across several screens.)
  const most = renderer?.maxSize ?? Infinity;
  const k = Math.min(dprNow, cap, fit, most / Math.max(1, viewW), most / Math.max(1, viewH)) / dprNow;
  const w = deviceBox && k === 1 ? deviceBox.w : Math.round(viewW * dprNow * k);
  const h = deviceBox && k === 1 ? deviceBox.h : Math.round(viewH * dprNow * k);
  return [w, h];
}

/** Makes the overlay's targets at the quality now, for the canvas's size. */
function resize() {
  if (!canvas || !renderer) return;
  viewW = Math.max(1, canvas.clientWidth);
  viewH = Math.max(1, canvas.clientHeight);
  const [w, h] = sizeAt(quality);
  dpr = w / viewW;
  frameEvent(`effects at ${w}x${h} (quality ${quality})`);
  renderer.resize(w, h, Math.min(1, 1 / dpr));
  wake();
}

function teardown() {
  waiting?.();
  waiting = null;
  forPaint = false;
  building?.cancel();
  building = null;
  cancelAnimationFrame(raf);
  raf = 0;
  ro?.disconnect();
  ro = null;
  renderer = null;
  pool = null;
  shapes = [];
  tasks = [];
  queuedAt = null;
  // (What would have stopped a cover may be among the tasks just dropped, or
  // never start while the renderer is gone: left up, it would be asked every
  // frame from now on.)
  covers.clear();
  stopShake();
  for (const l of listeners) l(userOn);
}

/** Whether effects would be drawn, once the renderer is made. */
const wanted = () => userOn && !reduce?.matches;

/**
 * Gets the overlay on `c` ready to take effects: the particle pool now, the
 * renderer once the page has painted and is idle (or at once, when an effect
 * is asked for before then: see hurry), or, while effects are off, once
 * they're on. The first paint waits for neither its context nor its
 * shaders: on a first visit (a cold shader cache) those held it up by
 * seconds, behind the backdrop's own (lib/backdrop.ts). Without WebGL2 (or
 * where the backdrop was refused a context) nothing is on its way, and
 * effects are off from the start.
 */
function prepare(c: HTMLCanvasElement) {
  pool = new ParticlePool(coarse?.matches ? 2000 : 5000);
  waiting?.();
  waiting = null;
  if (typeof WebGL2RenderingContext === 'undefined' || webgl2Refused()) return;
  // Two frames: the first has been painted (and the backdrop's first frame
  // with it, which comes before it); then an idle moment (and, while
  // effects are off, until they're on: see hurry).
  let raf2 = 0;
  let stopIdle: (() => void) | null = null;
  const idle = () => {
    if (wanted()) soon(c);
  };
  const raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => (stopIdle = whenIdle(idle, { timeout: 1000 })));
  });
  forPaint = true;
  waiting = () => {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
    stopIdle?.();
  };
}

/** The renderer is wanted now (an effect was asked for, or effects came on): it's made as soon as it can be, if it wasn't on its way already. */
function hurry() {
  if (waiting && forPaint && canvas && wanted()) soon(canvas);
}

/**
 * Makes the renderer on `c` once the GPU has caught up with the backdrop
 * (whenGpuCaughtUp): a new context waits on the GPU process, and would
 * otherwise wait behind a backdrop frame.
 */
function soon(c: HTMLCanvasElement) {
  waiting?.();
  waiting = null;
  forPaint = false;
  let ran = false;
  const cancel = whenGpuCaughtUp(() => {
    ran = true;
    build(c);
  });
  if (!ran) waiting = cancel;
}

/** Starts making the renderer on `c`, its shaders compiling without blocking the page (FxRenderer.start). */
function build(c: HTMLCanvasElement) {
  waiting?.();
  waiting = null;
  forPaint = false;
  if (renderer || building) return;
  building = FxRenderer.start(c, { maxParticles: 5000, maxShapes: MAX_SHAPES }, (r) => {
    building = null;
    if (r) setup(c, r);
    else teardown();
  });
  // No WebGL2: effects are off (and whatever waited is dropped).
  if (!building) teardown();
}

/**
 * Draws `r`'s programs once each before an effect needs them (warmNext),
 * each in an idle moment of its own while nothing is drawn: an effect
 * drawing meanwhile draws them itself.
 */
function warm(r: FxRenderer) {
  const next = () => {
    if (renderer !== r) return;
    if (!raf && !shown && !r.warmNext()) return;
    whenIdle(next, { fallback: 50 });
  };
  whenIdle(next, { fallback: 50 });
}

/** Takes the renderer made on `c` and follows its size; whatever waited for it plays. */
function setup(c: HTMLCanvasElement, r: FxRenderer) {
  renderer = r;
  if (switchedOff('bloom')) r.bloom = false;
  if (sigilPicture) r.setSigil(sigilPicture);
  pool ??= new ParticlePool(coarse?.matches ? 2000 : 5000);
  ro?.disconnect();
  ro = new ResizeObserver(([entry]) => {
    const box = entry.devicePixelContentBoxSize?.[0];
    const estW = entry.contentRect.width * devicePixelRatio;
    const exact = box && Math.abs(box.inlineSize - estW) <= 2;
    deviceBox = exact ? { w: box.inlineSize, h: box.blockSize } : null;
    // (A quality waiting for a calm moment is moved to now: the targets are made anew anyway.)
    if (!resizeDue || !moveTo(performance.now())) resize();
  });
  try {
    ro.observe(c, { box: 'device-pixel-content-box' });
  } catch {
    ro.observe(c);
  }
  // What was asked for meanwhile goes on from where it would be by now
  // (see waited): what has run its course is dropped, and so is what was
  // stopped, or whose element left the page, before it ever showed.
  // (Made while the tab is away, the time away doesn't count: see waited.)
  if (queuedAt !== null) {
    const late = ((hidden ? awayAt : performance.now()) - queuedAt) / 1000;
    queuedAt = null;
    shapes = shapes.filter((s) => {
      s.age += late;
      return !s.stopped && !detached(s.at) && !(s.age >= s.life);
    });
    tasks = tasks.filter((t) => {
      t.age += late;
      return t.age < t.life;
    });
    for (let left = late; left > 0 && pool.count; left -= 1 / 15) pool.step(Math.min(left, 1 / 15));
    const shaken = (performance.now() - shakenAt) / 1000;
    wearJolt(shaken);
  }
  resize();
  shown = true;
  show(false);
  warm(r);
  for (const l of listeners) l(userOn);
  // (resize() woke the loop: anything asked for meanwhile plays from now.)
}

/**
 * The tab went away (`away`) or came back. Away, no frames come, so nothing
 * moves on, and the loop is stopped too (no work in the background). What
 * would run its course (particles, shapes that end, a moment's tasks, a
 * shake) is dropped now, and not started while it's away: unseen, it would
 * otherwise play all at once as the tab comes back. What lasts until it's
 * stopped (a streak's fire, a burning flare: endless shapes, tasks to keep)
 * stays where it was, and goes on once it's back; stopped meanwhile, it goes
 * at once.
 */
function setHidden(away: boolean) {
  if (away === hidden) return;
  hidden = away;
  if (away) {
    awayAt = performance.now();
    cancelAnimationFrame(raf);
    raf = 0;
    shapes = shapes.filter((s) => !s.stopped && !Number.isFinite(s.life));
    tasks = tasks.filter((t) => t.keep);
    // (Nothing stale is shown for a moment as it comes back.)
    blank();
  } else {
    // Waiting for the renderer: the time away isn't caught up on once it's made (see waited).
    if (queuedAt !== null) queuedAt += performance.now() - awayAt;
    if (shapes.length || tasks.length) wake();
  }
  for (const l of awayListeners) l(away);
}

/** Starts the overlay on `c`. Returns a cleanup function. */
export function startFx(c: HTMLCanvasElement): () => void {
  canvas = c;
  placedAt = '';
  prepare(c);
  const onMotion = () => {
    if (!fxActive()) clearAll();
    else hurry();
    for (const l of listeners) l(userOn);
  };
  reduce?.addEventListener('change', onMotion);
  setHidden(document.hidden);
  const onVisibility = () => setHidden(document.hidden);
  document.addEventListener('visibilitychange', onVisibility);
  // Phones often drop the context while the tab is in the background.
  // preventDefault() asks the browser to give it back; then everything is
  // built again on it. (The old renderer's objects died with the context, and
  // its destroy() would lose the restored one, so it's simply dropped.)
  const onLost = (e: Event) => {
    e.preventDefault();
    teardown();
  };
  const onRestored = () => {
    if (!renderer && !coming()) {
      prepare(c);
      hurry();
    }
  };
  c.addEventListener('webglcontextlost', onLost);
  c.addEventListener('webglcontextrestored', onRestored);
  return () => {
    reduce?.removeEventListener('change', onMotion);
    document.removeEventListener('visibilitychange', onVisibility);
    c.removeEventListener('webglcontextlost', onLost);
    c.removeEventListener('webglcontextrestored', onRestored);
    renderer?.destroy();
    // (Its context is made before its shaders are: let go too, mid-build.)
    const half = !renderer && !!building;
    teardown();
    if (half) c.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    // (No overlay follows the tab now: nothing counts as away.)
    setHidden(false);
  };
}
