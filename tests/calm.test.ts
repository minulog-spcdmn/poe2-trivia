// Work that waits for a calm moment (lib/idle.ts whenCalm): clear of what a
// tap or the game moving on sets off, each in a task of its own, in order,
// never put off for good, and all of it done as the page goes away.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import './asVite.ts';

// The page's events, as the module listens for them.
const listeners = new Map<string, (() => void)[]>();
const on = (type: string, f: () => void) => void listeners.set(type, [...(listeners.get(type) ?? []), f]);
const fire = (type: string) => listeners.get(type)?.forEach((f) => f());
const page = { visibilityState: 'visible', addEventListener: on };
Object.assign(globalThis, { addEventListener: on, document: page });

mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
// Each timer's callback numbered, to tell which task a job ran in.
let task = 0;
let inTask = 0;
const timer = globalThis.setTimeout;
globalThis.setTimeout = ((f: () => void, ms?: number) => timer(() => ((inTask = ++task), f()), ms)) as typeof setTimeout;
const { CALM_AT_MOST, CALM_MS, whenCalm } = await import('../src/lib/idle.ts');

const ran: string[] = [];
const tasks: number[] = [];
const job = (name: string) => () => void (ran.push(name), tasks.push(inTask));
const tick = (ms: number) => mock.timers.tick(ms);

test('asked for as the game moves on, it waits out that moment', () => {
  whenCalm(job('codex'));
  tick(CALM_MS - 1);
  assert.deepEqual(ran, []);
  tick(1);
  assert.deepEqual(ran, ['codex']);
  ran.length = 0;
});

test('a tap meanwhile puts it off until the tap has played out too', () => {
  whenCalm(job('codex'));
  tick(500);
  fire('pointerdown');
  tick(CALM_MS - 1);
  assert.deepEqual(ran, [], 'not among the frames of what the tap set off');
  tick(1);
  assert.deepEqual(ran, ['codex']);
  ran.length = 0;
});

test('each in a task of its own, in order; what one asks for follows it in the same calm', () => {
  tasks.length = 0;
  whenCalm(() => {
    job('codex')();
    whenCalm(job('achievements'));
  });
  whenCalm(job('records'));
  tick(CALM_MS);
  assert.deepEqual(ran, ['codex', 'records', 'achievements'], 'in order, and no second wait for calm');
  assert.equal(new Set(tasks).size, 3, 'one a task');
  ran.length = 0;
});

test('tapped at without end, it still runs, at the longest wait', () => {
  whenCalm(job('codex'));
  for (let t = 0; t < CALM_AT_MOST; t += 400) {
    fire('keydown');
    tick(400);
  }
  assert.deepEqual(ran, ['codex']);
  ran.length = 0;
});

test('the page going away does all that waits at once', () => {
  whenCalm(job('codex'));
  whenCalm(job('achievements'));
  page.visibilityState = 'hidden';
  fire('visibilitychange');
  assert.deepEqual(ran, ['codex', 'achievements']);
  page.visibilityState = 'visible';
  ran.length = 0;
  whenCalm(job('records'));
  fire('pagehide');
  assert.deepEqual(ran, ['records']);
  tick(CALM_AT_MOST);
  assert.deepEqual(ran, ['records'], 'and none of it twice');
});
