// Delve's light table is worked out in a worker (lib/lightsAhead.ts), and on
// the page should that one stop short: when it fails, and when it falls
// silent before the table is all here, as one a phone stopped in the
// background does, without a word. Silent for START_MS before its first
// stretch, PREP_STALL_MS after one, or PING_MS back from a long while in
// the background, it is let go; but not as the page thaws after being only
// frozen a while, the worker frozen with it. Run here against stand-ins for
// the browser's Worker and document.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { HIDDEN_CHECK_MS, PING_MS, PREP_STALL_MS, START_MS } = await import('../src/lib/prepPool.ts');
const { LIGHT_TABLE } = await import('../src/lib/descent.ts');

/** Workers made; each says only what the test has it say. */
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage() {}
  /** Hands a stretch over: the table worked out to `settled`, its arrays empty (the page takes it; no test here reads the light). */
  stretch(settled: number) {
    const none = new Float64Array(0);
    this.onmessage?.({ data: { table: { end: 0, settled, hall: none, rest: none, k: none, light: none, level: none, strata: [] } } });
  }
  terminate() {
    this.terminated = true;
  }
}

/** The page's document, hidden and shown again (hideFor). */
const listeners: (() => void)[] = [];
const doc = { hidden: false, addEventListener: (_: string, f: () => void) => listeners.push(f) };
/** The wall clock, wound on by hand: how long the page was hidden is timed by it (prepPool.ts onShownAgain). */
let away = 0;
const wallClock = Date.now;
Date.now = () => wallClock() + away;
function hideFor(ms: number) {
  doc.hidden = true;
  for (const f of listeners) f();
  away += ms;
  doc.hidden = false;
  for (const f of listeners) f();
}
Object.assign(globalThis, { Worker: FakeWorker, document: doc });

/** lib/lightsAhead.ts loaded afresh (the query makes it a module of its own), its worker not made yet; and that worker, made. */
async function started(fresh: string) {
  const { wantDelveLights } = (await import(`../src/lib/lightsAhead.ts?${fresh}`)) as typeof import('../src/lib/lightsAhead.ts');
  wantDelveLights();
  const w = workers.at(-1)!;
  return { w, wantDelveLights };
}

test('a worker that never hands a stretch over is let go after START_MS, and no other is made', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { w, wantDelveLights } = await started('mute');
  const made = workers.length;
  t.mock.timers.tick(START_MS - 1);
  assert.ok(!w.terminated, 'its script may be on its way');
  t.mock.timers.tick(1);
  assert.ok(w.terminated, 'let go: the page works it out');
  wantDelveLights();
  assert.equal(workers.length, made);
});

test('one that falls silent partway through is let go after PREP_STALL_MS; one that finishes is left be', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { w } = await started('stalled');
  w.stretch(100);
  t.mock.timers.tick(PREP_STALL_MS - 1);
  w.stretch(200);
  t.mock.timers.tick(PREP_STALL_MS - 1);
  assert.ok(!w.terminated, 'each stretch has as long again');
  t.mock.timers.tick(1);
  assert.ok(w.terminated);

  const { w: whole } = await started('whole');
  whole.stretch(LIGHT_TABLE);
  assert.ok(whole.terminated, 'done, it stops');
});

test('back after a long while with the table not all here, it has PING_MS to hand the next stretch over', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { w } = await started('asked');
  w.stretch(100);
  hideFor(HIDDEN_CHECK_MS - 1000);
  t.mock.timers.tick(PING_MS);
  assert.ok(!w.terminated, 'not after a short while');
  hideFor(HIDDEN_CHECK_MS);
  t.mock.timers.tick(PING_MS - 1);
  w.stretch(200);
  t.mock.timers.tick(PING_MS);
  assert.ok(!w.terminated, 'still at it');
  hideFor(HIDDEN_CHECK_MS);
  t.mock.timers.tick(PING_MS);
  assert.ok(w.terminated, 'stopped meanwhile, let go');
});

test('frozen with the page a while, the wait for its next stretch coming due as it thaws, it is waited on again, not let go', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { w } = await started('frozen');
  w.stretch(100);
  // (A minute frozen: the wall clock runs on; the timer comes due as the page thaws, before it hears it's shown again.)
  away += 60_000;
  t.mock.timers.tick(PREP_STALL_MS);
  assert.ok(!w.terminated, 'waited on again');
  w.stretch(200);
  t.mock.timers.tick(PREP_STALL_MS);
  assert.ok(w.terminated, 'silent after that, let go');
});
