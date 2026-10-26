// Work run ahead of need waits for the page to settle (lib/settled.ts): for
// whatever is making an entrance to let go, then for an idle moment. Where
// there's no requestIdleCallback (Safari), that is a few frames in a row on
// time with time to spare, not a fixed timer that lands on the start page's
// busiest frames. One piece at a time, and none waits for ever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALM_FRAMES, HOLD_WAIT_MS, PATIENCE_MS, calmFrame, settler, type Env } from '../src/lib/settled.ts';

const FRAME_MS = 1000 / 60;

/**
 * A page on a fake clock: `frames(n, cost)` draws n frames 60 a second, each
 * taking `cost` ms to draw (the task after it runs that much later); timers
 * run as the clock passes them. `idle` gives it a requestIdleCallback, whose
 * callbacks run when `idleNow()` says.
 */
function page({ idle = false } = {}) {
  let clock = 0;
  let ids = 0;
  let hidden = false;
  const raf = new Map<number, (t: number) => void>();
  const timers: { at: number; f: () => void; id: number }[] = [];
  const idles: (() => void)[] = [];
  const tasks: (() => void)[] = [];
  const runTimers = (to: number) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const t = timers[0];
      if (!t || t.at > to) break;
      timers.shift();
      clock = Math.max(clock, t.at);
      t.f();
    }
    clock = Math.max(clock, to);
  };
  const env: Env = {
    now: () => clock,
    frame: (f) => (raf.set(++ids, f), ids),
    cancelFrame: (id) => void raf.delete(id),
    task: (f) => void tasks.push(f),
    later: (f, ms) => {
      const t = { at: clock + ms, f, id: ++ids };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    idle: idle ? (f) => void idles.push(f) : undefined,
    hidden: () => hidden,
  };
  /** One frame at the next vsync: its callbacks, then (`cost` ms later) the tasks they queued. */
  const frame = (cost: number) => {
    runTimers(Math.ceil(clock / FRAME_MS + 1e-9) * FRAME_MS);
    const t = clock;
    const now = [...raf.values()];
    raf.clear();
    for (const f of now) f(t);
    runTimers(t + cost);
    for (let f; (f = tasks.shift()); ) f();
  };
  return {
    env,
    frames: (n: number, cost = 2) => {
      for (let i = 0; i < n; i++) frame(cost);
    },
    wait: (ms: number) => runTimers(clock + ms),
    idleNow: () => idles.splice(0).forEach((f) => f()),
    hide: () => (hidden = true),
    get clock() {
      return clock;
    },
  };
}

test('a frame on time with time to spare is idle; a late one, or one that took most of its time, is not', () => {
  assert.equal(calmFrame(FRAME_MS, 3, FRAME_MS), true);
  assert.equal(calmFrame(2 * FRAME_MS, 3, FRAME_MS), false);
  assert.equal(calmFrame(FRAME_MS, 12, FRAME_MS), false);
  // (The first frame watched has nothing to be on time for.)
  assert.equal(calmFrame(NaN, 1, FRAME_MS), false);
});

test('without requestIdleCallback, work waits for frames in a row with time to spare, not for a timer', () => {
  const p = page();
  const s = settler(p.env);
  let ran = 0;
  s.when(() => ran++);
  // Busy frames (the start page coming in, the circle's layers going on): nothing runs, however long.
  p.frames(60, 14);
  assert.equal(ran, 0);
  // Calm ones: it runs once enough have come in a row.
  p.frames(CALM_FRAMES);
  assert.equal(ran, 1);
});

test('one busy frame among calm ones starts the count over', () => {
  const p = page();
  const s = settler(p.env);
  let ran = 0;
  s.when(() => ran++);
  p.frames(CALM_FRAMES - 1);
  p.frames(1, 30);
  p.frames(CALM_FRAMES - 1);
  assert.equal(ran, 0);
  p.frames(2);
  assert.equal(ran, 1);
});

test('nothing runs while an entrance holds the page, and it runs once it has let go and the page is calm', () => {
  const p = page();
  const s = settler(p.env);
  let ran = 0;
  const release = s.hold();
  s.when(() => ran++);
  p.frames(100);
  assert.equal(ran, 0);
  release();
  p.frames(CALM_FRAMES + 1);
  assert.equal(ran, 1);
});

test('a hold taken while the page is being watched still holds the work back', () => {
  const p = page();
  const s = settler(p.env);
  let ran = 0;
  s.when(() => ran++);
  p.frames(2);
  const release = s.hold();
  p.frames(50);
  assert.equal(ran, 0);
  release();
  p.frames(CALM_FRAMES + 1);
  assert.equal(ran, 1);
});

test('work defers to holds only for a while: one never let go, or one after another, keeps it waiting no longer', () => {
  for (const kind of ['never let go', 'one after another']) {
    const p = page();
    const s = settler(p.env);
    let ran = 0;
    let release = s.hold();
    s.when(() => ran++);
    for (let t = 0; t < HOLD_WAIT_MS - 100; t += 500) {
      p.frames(Math.round(500 / FRAME_MS));
      if (kind === 'one after another') {
        const before = release;
        release = s.hold();
        before();
      }
    }
    assert.equal(ran, 0, kind);
    p.frames(Math.ceil(200 / FRAME_MS) + CALM_FRAMES + 1);
    assert.equal(ran, 1, kind);
  }
});

test('the time a piece defers to holds is its own: the next one waits for them afresh', () => {
  const p = page();
  const s = settler(p.env);
  const log: string[] = [];
  s.when(() => log.push('a'));
  s.when(() => log.push('b'));
  p.frames(CALM_FRAMES + 1);
  assert.deepEqual(log, ['a']);
  const release = s.hold();
  p.frames(Math.round((HOLD_WAIT_MS - 500) / FRAME_MS));
  assert.deepEqual(log, ['a']);
  release();
  p.frames(CALM_FRAMES + 1);
  assert.deepEqual(log, ['a', 'b']);
});

test('a page that never looks idle gets the work after a while all the same', () => {
  const p = page();
  const s = settler(p.env);
  let ran = 0;
  s.when(() => ran++);
  p.frames(Math.floor((PATIENCE_MS - 100) / FRAME_MS), 14);
  assert.equal(ran, 0);
  p.frames(Math.ceil(200 / FRAME_MS), 14);
  assert.equal(ran, 1);
});

test('one piece at a time: the next waits for the last to be done, and for the page to settle again', async () => {
  const p = page();
  const s = settler(p.env);
  const log: string[] = [];
  let done = () => {};
  s.when(() => {
    log.push('pages');
    return new Promise<void>((r) => (done = r));
  });
  s.when(() => log.push('font 1'));
  s.when(() => log.push('font 2'));
  p.frames(CALM_FRAMES + 10);
  assert.deepEqual(log, ['pages']);
  done();
  await Promise.resolve();
  await Promise.resolve();
  // (The first frame watched is what the next is on time against.)
  p.frames(CALM_FRAMES);
  assert.deepEqual(log, ['pages']);
  p.frames(1);
  assert.deepEqual(log, ['pages', 'font 1']);
  p.frames(CALM_FRAMES + 1);
  assert.deepEqual(log, ['pages', 'font 1', 'font 2']);
});

test('work taken back never runs, and the rest still does', () => {
  const p = page();
  const s = settler(p.env);
  const log: string[] = [];
  const undo = s.when(() => log.push('a'));
  s.when(() => log.push('b'));
  undo();
  p.frames(CALM_FRAMES * 3);
  assert.deepEqual(log, ['b']);
});

test('a hidden page draws no frames, and gets the work without them', () => {
  const p = page();
  const s = settler(p.env);
  let ran = 0;
  p.hide();
  s.when(() => ran++);
  p.wait(1000);
  assert.equal(ran, 1);
});

test('with requestIdleCallback, its idle moment is used, once nothing holds the page', () => {
  const p = page({ idle: true });
  const s = settler(p.env);
  let ran = 0;
  const release = s.hold();
  s.when(() => ran++);
  p.idleNow();
  assert.equal(ran, 0);
  release();
  p.idleNow();
  assert.equal(ran, 1);
});

test('with requestIdleCallback, a hold taken before the idle moment comes still holds', () => {
  const p = page({ idle: true });
  const s = settler(p.env);
  let ran = 0;
  s.when(() => ran++);
  const release = s.hold();
  p.idleNow();
  assert.equal(ran, 0);
  release();
  p.idleNow();
  assert.equal(ran, 1);
});
