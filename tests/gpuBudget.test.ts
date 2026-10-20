import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GpuBudget, type Layer, type Saved } from '../src/lib/fx/gpuBudget.ts';

// The backdrop and the effects draw every pixel on a GPU that keeps up, and
// fewer on one that doesn't (src/lib/fx/gpuBudget.ts). A drop needs frames
// that are slow and, where the GPU can be timed, the layers' own work over
// budget; it has to help to stay. A momentary stutter moves nothing; a GPU
// busy for a while is dropped for and climbed back from.

/** A 4K screen at 1x: every pixel at 0; 1440p's worth at 1; the effects at 0.75 per CSS px at 2. */
const UHD = (level: number, layer: Layer) => {
  if (level === 0) return 3840 * 2160;
  if (layer === 'backdrop' || level === 1) return 2560 * 1440;
  return 2880 * 1620 * 0.4444;
};

type Opts = {
  start?: number;
  /** Whether effects play at `t` (most of the time, by default). */
  busy?: (t: number) => boolean;
  /** Effects switched off. */
  off?: boolean;
  /** The display's refresh (Hz): 60 by default. */
  hz?: number;
  /** How long frames take; by default as long as the GPU's work needs, at 60Hz at best. */
  frameMs?: (level: number, t: number, gpuMs: number) => number;
  /** False: the GPU can't be timed. */
  timed?: boolean;
  px?: typeof UHD;
};

/**
 * Runs `seconds` of frames from `start` (s), the layers' draws costing
 * `cost(level, t)` ms per million pixels on the GPU, and moves to each level
 * wanted at once, as core.ts does while nothing is drawn. Frames take as long
 * as the GPU's work and a little more, at 60Hz at best. Returns the levels
 * moved to, with when (s).
 */
function run(b: GpuBudget, seconds: number, cost: (level: number, t: number) => number, opts: Opts = {}) {
  const px = opts.px ?? UHD;
  const busy = opts.busy ?? (() => true);
  const went: [number, number][] = [];
  let t = opts.start ?? 0;
  let i = 0;
  const end = t + seconds;
  while (t < end) {
    const c = cost(b.level, t);
    const on = busy(t);
    const gpuMs = (c * ((on ? px(b.level, 'fx') : 0) + px(b.level, 'backdrop'))) / 1e6;
    const base = opts.frameMs ? opts.frameMs(b.level, t, gpuMs) : Math.max(1000 / (opts.hz ?? 60), gpuMs + 2);
    // (Every eighth frame half as long again: a page's frames are never even.)
    const ms = base * (++i % 8 === 0 ? 1.5 : 1);
    t += ms / 1000;
    if (opts.timed !== false) {
      if (on) b.gpu('fx', (c * px(b.level, 'fx')) / 1e6, px(b.level, 'fx'));
      b.gpu('backdrop', (c * px(b.level, 'backdrop')) / 1e6, px(b.level, 'backdrop'));
    }
    b.frame(ms, t * 1000, on, !!opts.off);
    const want = b.next(t * 1000);
    if (want !== b.level) {
      b.applied(want, t * 1000);
      went.push([want, Math.round(t)]);
    }
  }
  return { went, levels: went.map(([l]) => l), t };
}

const climbsIn = (went: [number, number][]) => went.filter(([l]) => l === 0).map(([, t]) => t);

function assertWaitsGrow(climbs: number[]) {
  assert.ok(climbs.length >= 2 && climbs.length <= 7, `climbed ${climbs.length} times in 30 minutes`);
  const gaps = climbs.slice(1).map((t, i) => t - climbs[i]);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1], `gaps between climbs ${gaps.join(', ')}`);
}

test('a GPU that keeps up draws a 4K screen whole, for as long as it plays', () => {
  const b = new GpuBudget(UHD);
  // 0.3 ms per million pixels: both layers at 4K take 5 ms at their busiest.
  assert.deepEqual(run(b, 600, () => 0.3).levels, []);
});

test('a moment that stutters (a few slow frames) moves nothing', () => {
  const b = new GpuBudget(UHD);
  // Every few seconds, three frames in a row take ten times as long.
  assert.deepEqual(run(b, 300, (_, t) => (t % 5 < 0.05 ? 3 : 0.3)).levels, []);
});

test('a GPU too weak for a 4K screen goes straight to the level that fits', () => {
  // 1.08 ms per million: 17.9 ms at 0 (frames at 50fps), 8 at 1.
  assert.deepEqual(run(new GpuBudget(UHD), 30, () => 1.08).levels, [1]);
  // 2 ms per million: 1 doesn't fit either, so down to 2 at once, not a step at a time.
  assert.deepEqual(run(new GpuBudget(UHD), 30, () => 2).levels, [2]);
});

test('it drops within a few seconds of a GPU turning slow', () => {
  const { went } = run(new GpuBudget(UHD), 60, (_, t) => (t < 30 ? 0.3 : 1.08));
  assert.equal(went.length, 1);
  assert.ok(went[0][1] >= 30 && went[0][1] <= 34, `dropped at ${went[0][1]}s`);
});

test('a GPU clocked down while lightly loaded: its long timings alone move nothing, frames being on time', () => {
  // Timings say 2 ms per million (over budget at every level), but every frame comes at 60Hz.
  assert.deepEqual(run(new GpuBudget(UHD), 300, () => 2, { frameMs: () => 16.7 }).levels, []);
});

test('frames slow for another reason (scripts, a slow CPU): the GPU costs little, nothing moves', () => {
  assert.deepEqual(run(new GpuBudget(UHD), 300, () => 0.3, { frameMs: () => 30 }).levels, []);
});

test('frames held to 30fps (a power mode) on a GPU that times long: the drop that does not help is undone', () => {
  const b = new GpuBudget(UHD);
  assert.deepEqual(run(b, 300, () => 2, { frameMs: () => 33.3 }).levels, [2, 0]);
  assert.equal(b.level, 0);
});

test('a GPU busy with something else for a while: down, then back up once it is free again', () => {
  // Something else on the GPU from 10s to 70s makes every draw take three times as long.
  const { went } = run(new GpuBudget(UHD), 240, (_, t) => (t > 10 && t < 70 ? 1.08 : 0.36));
  assert.deepEqual(
    went.map(([l]) => l),
    [1, 0],
  );
  assert.ok(went[1][1] >= 70 && went[1][1] < 100, `climbed at ${went[1][1]}s`);
});

test('a climb that fails waits longer before the next, and the waits grow', () => {
  // A GPU whose cost per pixel grows with the pixels: cheap enough lower
  // down to predict that 0 fits, too slow at 0 once it's there.
  const { went } = run(new GpuBudget(UHD), 1800, (level) => (level === 0 ? 1.5 : 0.3));
  assertWaitsGrow(climbsIn(went));
});

test('climbing waits for the effects to have been seen at their busiest', () => {
  const b = new GpuBudget(UHD);
  run(b, 20, () => 1.08);
  assert.equal(b.level, 1);
  // The GPU is free again, but no effect plays: the backdrop alone can't say the effects fit
  // (for the few minutes before a level predicted too dear is tried anyway).
  const quiet = run(b, 250, () => 0.3, { start: 20, busy: () => false });
  assert.deepEqual(quiet.levels, []);
  // Effects playing again: up it goes.
  assert.deepEqual(run(b, 60, () => 0.3, { start: quiet.t }).levels, [0]);
});

test('untimed, with effects off, slow frames are the page own: nothing moves', () => {
  assert.deepEqual(run(new GpuBudget(UHD), 120, () => 0, { timed: false, off: true, busy: () => false, frameMs: () => 40 }).levels, []);
});

test('effects off on a GPU too weak for the backdrop at 4K: the backdrop alone comes down', () => {
  // 3 ms per million: the backdrop alone takes 25 ms at 4K, 11 at 1440p's worth.
  const off = (level: number, layer: Layer) => (layer === 'fx' ? 0 : UHD(level, layer));
  const b = new GpuBudget(off);
  assert.deepEqual(run(b, 30, () => 3, { busy: () => false, off: true, px: off }).levels, [1]);
});

test('a 1x screen up to 1440p (two levels drawing as many pixels) climbs all the way back', () => {
  // 1080p at 1x: levels 0 and 1 draw every pixel (only the particles differ); 2 the effects at 0.75 per CSS px.
  const fhd = (level: number, layer: Layer) => (layer === 'fx' && level === 2 ? 1920 * 1080 * 0.5625 : 1920 * 1080);
  // Something else on the GPU from 10s to 70s: 6 ms per million is over budget at 0 and 1.
  const timed = new GpuBudget(fhd);
  const t = run(timed, 300, (_, t) => (t > 10 && t < 70 ? 6 : 0.5), { px: fhd });
  assert.equal(t.levels[0], 2);
  assert.equal(timed.level, 0);
  const untimedB = new GpuBudget(fhd);
  run(untimedB, 600, () => 0, { px: fhd, timed: false, frameMs: (l, t) => (t > 10 && t < 70 && l < 2 ? 40 : 16.7) });
  assert.equal(untimedB.level, 0);
});

test('a 50Hz display (or a 30fps power mode) climbs back too: easy is judged by its own refresh', () => {
  for (const hz of [50, 30]) {
    const b = new GpuBudget(UHD);
    // (Effects play most of the time; between them the backdrop's frames show the display's refresh.)
    run(b, 400, (_, t) => (t > 10 && t < 70 ? 1.5 : 0.3), { hz, busy: (t) => t % 10 < 7 });
    assert.equal(b.level, 0, `at ${hz}Hz`);
  }
});

test('frames held long by something else first do not teach it the display is slower, so the GPU is still dropped for', () => {
  // 30s of frames at 50fps that the GPU isn't to blame for (the page's scripts), then the GPU over budget at 0.
  const b = new GpuBudget(UHD);
  const { levels } = run(b, 60, (_, t) => (t < 30 ? 0.3 : 1.1), { frameMs: (_, t, gpuMs) => Math.max(t < 30 ? 19.8 : 1000 / 60, gpuMs + 2) });
  assert.ok(levels[0] > 0, `went ${JSON.stringify(levels)}`);
});

test('a climb that fails later than at once (a GPU that throttles once warm) still waits longer each time', () => {
  // Fine at 0 for 200s after each climb, then over budget (frames slow) until it drops.
  let climbedAt = 0;
  let last = 0;
  const b = new GpuBudget(UHD);
  const { went } = run(b, 3600, (level, t) => {
    if (level === 0 && last !== 0) climbedAt = t;
    last = level;
    return level === 0 && t - climbedAt > 200 ? 1.5 : 0.3;
  });
  const climbs = climbsIn(went);
  assert.ok(climbs.length <= 8, `climbed ${climbs.length} times in an hour`);
  const gaps = climbs.slice(1).map((t, i) => t - climbs[i]);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1], `gaps between climbs ${gaps.join(', ')}`);
});

test('a climb that holds sets the wait back, so one that fails much later starts again from the least wait', () => {
  const b = new GpuBudget(UHD);
  // Two failed climbs grow the wait.
  run(b, 200, (level) => (level === 0 ? 1.5 : 0.3));
  const grown = b.saved()!.backoff;
  assert.ok(grown > 20, `wait ${grown}`);
  // Then the GPU keeps up at 0 for 20 minutes: the climb held.
  run(b, 1500, () => 0.3, { start: 200 });
  assert.equal(b.level, 0);
  assert.equal(b.saved()!.backoff, 20);
});

test('a GPU that times long while lightly loaded (clocks down) is still tried at full resolution now and then, and stays there once it fits', () => {
  // Over budget for a minute; then at 1 the GPU is so lightly loaded its
  // timings read 1.2 ms per million, predicting 0 at 20 ms (within
  // PROBE_UNDER budgets), though at 0 it clocks up and fits.
  const b = new GpuBudget(UHD);
  const { went } = run(b, 1500, (level, t) => (t < 60 ? 1.5 : level === 0 ? 0.3 : 1.2));
  assert.equal(b.level, 0, `went ${JSON.stringify(went)}`);
  assert.equal(climbsIn(went).length, 1);
});

test('a GPU predicted far too dear for the level above is never probed', () => {
  // 4.5 ms per million: 26 ms at 2; 1 would take 33, 0 75, both past PROBE_UNDER budgets.
  const b = new GpuBudget(UHD);
  const { went } = run(b, 3600, () => 4.5);
  assert.deepEqual(
    went.map(([l]) => l),
    [2],
  );
});

test('where the GPU cannot be timed, a big screen starts a level down, and climbs once frames are easy', () => {
  const b = new GpuBudget(UHD);
  b.timable(false);
  assert.equal(b.next(0), 1);
  b.applied(1, 0);
  run(b, 200, () => 0, { timed: false, frameMs: () => 16.7 });
  assert.equal(b.level, 0);
  // A screen no bigger than 1440p at 1x starts at its best: nothing to cap.
  const qhd = (level: number, layer: Layer) => (layer === 'fx' && level === 2 ? 2560 * 1440 * 0.5625 : 2560 * 1440);
  const q = new GpuBudget(qhd);
  q.timable(false);
  assert.equal(q.next(0), 0);
  // Where it can be timed, every screen starts at its best.
  const t = new GpuBudget(UHD);
  t.timable(true);
  assert.equal(t.next(0), 0);
});

test('climbing needs the effects drawn for a while at this level, not a few quiet draws', () => {
  // Effects off, the backdrop too dear at 4K: down to 1. Then effects come on, cheaply, for a few draws only.
  let fxOn = false;
  const px = (level: number, layer: Layer) => (layer === 'fx' && !fxOn ? 0 : UHD(level, layer));
  const b = new GpuBudget(px);
  const r = run(b, 30, (_, t) => (t < 20 ? 3 : 0.3), { off: true, busy: () => false, px });
  assert.equal(b.level, 1);
  fxOn = true;
  // Effects for 3s only: a couple of hundred draws, short of FRESH_CLIMB.
  const short = run(b, 60, () => 0.3, { start: r.t, px, busy: (t) => t - r.t < 3 });
  assert.deepEqual(short.levels, []);
  assert.deepEqual(run(b, 60, () => 0.3, { start: short.t, px }).levels, [0]);
});

test('touch screens never climb above where they start', () => {
  const b = new GpuBudget(UHD, 1);
  assert.deepEqual(run(b, 300, () => 0.1).levels, []);
  // Down to 2 for a while, then back: to 1, never past it.
  const { levels } = run(b, 600, (_, t) => (t > 310 && t < 370 ? 3 : 0.1), { start: 300 });
  assert.deepEqual(levels, [2, 1]);
});

test('the level that held is kept for the next visit on a screen as big, and climbed from if it can be', () => {
  const b = new GpuBudget(UHD);
  run(b, 30, () => 1.08);
  assert.equal(b.level, 1);
  const saved = b.saved();
  const next = new GpuBudget(UHD, 0, saved);
  assert.equal(next.next(0), 1);
  next.applied(1, 0);
  // The GPU is quicker this visit: back up.
  assert.deepEqual(run(next, 120, () => 0.3).levels, [0]);
  // Another screen: it starts at its best and finds out afresh.
  const qhd = (level: number, layer: Layer) => (layer === 'fx' && level === 2 ? 2560 * 1440 * 0.5625 : 2560 * 1440);
  assert.equal(new GpuBudget(qhd, 0, saved).next(0), 0);
});

test('a saved level from long ago, or not one at all, is ignored', () => {
  const old: Saved = { at: Date.now() - 60 * 24 * 3600_000, level: 2, px: 3840 * 2160, backoff: 20 };
  assert.equal(new GpuBudget(UHD, 0, old).next(0), 0);
  const junk = [
    { at: Date.now(), level: 'x', px: null },
    { at: Date.now(), level: 1.5, px: 3840 * 2160, backoff: 20 },
    { at: Date.now(), level: 7, px: 3840 * 2160, backoff: 20 },
  ];
  for (const j of junk) assert.equal(new GpuBudget(UHD, 0, j as unknown as Saved).next(0), 0);
});

test('a saved level holds on a window a little smaller (a bookmarks bar, devtools), and is not written over before anything is measured', () => {
  const saved: Saved = { at: Date.now(), level: 2, px: 3840 * 2160, backoff: 40 };
  const smaller = (level: number, layer: Layer) => Math.round(UHD(level, layer) * 0.94);
  const b = new GpuBudget(smaller, 0, saved);
  assert.deepEqual(b.saved(), saved);
  assert.equal(b.next(0), 2);
});

// Where the GPU can't be timed, only frames tell.

const untimed = { timed: false };

test('untimed, a GPU too weak for the effects: the drops that help stay', () => {
  const b = new GpuBudget(UHD);
  const { levels } = run(b, 30, () => 0, { ...untimed, frameMs: (l) => 12 + 30 / 2 ** l });
  assert.deepEqual(levels, [1, 2]);
});

test('untimed, frames slow for another reason: a drop that does not help is undone once and not tried again', () => {
  const b = new GpuBudget(UHD);
  assert.deepEqual(run(b, 120, () => 0, { ...untimed, frameMs: () => 28 }).levels, [1, 0]);
});

test('untimed, one long stall while a drop is weighed does not make a drop that did not help look as if it did', () => {
  // Frames slow for another reason, and one 280 ms stall in the second before the drop.
  const b = new GpuBudget(UHD);
  const { levels } = run(b, 30, () => 0, { ...untimed, frameMs: (_, t) => (t > 1.2 && t < 1.22 ? 280 : 28) });
  assert.deepEqual(levels, [1, 0]);
});

test('untimed, frames quick enough: nothing changes', () => {
  assert.deepEqual(run(new GpuBudget(UHD), 120, () => 0, { ...untimed, frameMs: () => 16.7 }).levels, []);
});

test('untimed, slow frames while no effect plays are not weighed', () => {
  assert.deepEqual(run(new GpuBudget(UHD), 120, () => 0, { ...untimed, busy: () => false, frameMs: () => 40 }).levels, []);
});

test('untimed, a climb is tried once frames are easy, and one that fails waits longer before the next', () => {
  // Slow at 0 for the first 30s (something else on the GPU), quick after.
  const free = run(new GpuBudget(UHD), 200, () => 0, { ...untimed, frameMs: (l, t) => (l === 0 && t < 30 ? 40 : 16.7) });
  assert.deepEqual(free.levels, [1, 0]);
  // Always slow at 0: each climb fails, and the waits between them grow.
  const { went } = run(new GpuBudget(UHD), 1800, () => 0, { ...untimed, frameMs: (l) => (l === 0 ? 40 : 16.7) });
  assertWaitsGrow(climbsIn(went));
});
