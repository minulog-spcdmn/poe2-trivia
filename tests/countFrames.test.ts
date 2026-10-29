// count.ts's count of a game's frames (countGameFrames, lib/stutter.ts) in a
// browser at the live game's address (globals set before it loads, as
// `counting` is settled then): measured only while a game is under way and
// the page is seen, one path a game, sent as it ends, is left, or the page is.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, createGame, type GameState } from '../src/lib/game.ts';

mock.timers.enable({ apis: ['setTimeout'] });

const sent: string[] = [];
const listeners = new Map<string, ((e: unknown) => void)[]>();
const docListeners = new Map<string, (() => void)[]>();
const stored = new Map<string, string>();
const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const doc = {
  visibilityState: 'visible',
  referrer: '',
  title: 'PoE2.Quest',
  documentElement: { hasAttribute: () => false },
  addEventListener: (type: string, fn: () => void) => docListeners.set(type, [...(docListeners.get(type) ?? []), fn]),
  removeEventListener: () => {},
};
set('location', { hostname: 'poe2.quest', pathname: '/', href: 'https://poe2.quest/', origin: 'https://poe2.quest', hash: '', search: '' });
set('navigator', {
  webdriver: false,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  sendBeacon: (url: string) => (sent.push(url), true),
});
set('document', doc);
set('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
set('addEventListener', (type: string, fn: (e: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]));
set('removeEventListener', () => {});

/** The page's animation frames, stepped by hand. */
let t = 0;
let pending: ((t: number) => void) | null = null;
set('requestAnimationFrame', (cb: (t: number) => void) => ((pending = cb), 1));
set('cancelAnimationFrame', () => void (pending = null));
/** `times` frames, each `ms` after the last; none while the page is hidden. */
const frames = (ms: number, times = 1) => {
  for (let i = 0; i < times; i++) {
    t += ms;
    if (doc.visibilityState !== 'visible') continue;
    const cb = pending;
    pending = null;
    cb?.(t);
  }
};
const fireDoc = (type: string) => {
  for (const fn of docListeners.get(type) ?? []) fn();
};

const { countGameFrames, gameMoment } = await import('../src/lib/count.ts');
const { OPT_OUT_KEY } = await import('../src/lib/countOptOut.ts');

/** What each beacon counted, in the order it went. */
const paths = () => sent.map((u) => new URL(u).searchParams.get('p'));
const game = (phase: GameState['phase']): GameState => ({ ...createGame('p0', { ...DEFAULT_SETTINGS, mode: 'turns' }), phase });

test("a game's moments: the deal, a question, its reveal; none in the lobby or the results", () => {
  assert.equal(gameMoment(null), null);
  assert.equal(gameMoment(game('lobby')), null);
  assert.equal(gameMoment(game('choosing')), 'deal');
  assert.equal(gameMoment(game('question')), 'question');
  assert.equal(gameMoment(game('reveal')), 'reveal');
  assert.equal(gameMoment(game('over')), null);
});

test('nothing is measured in the lobby', () => {
  countGameFrames(game('lobby'));
  assert.equal(pending, null, 'no frames asked for');
});

test("a game's frames count once, as it ends, under the device's class", () => {
  countGameFrames(game('choosing'));
  frames(16, 300);
  countGameFrames(game('question'));
  frames(16, 1200);
  countGameFrames(game('reveal'));
  frames(16, 300);
  assert.ok(pending, 'measured while the game is on');
  countGameFrames(game('over'));
  assert.equal(pending, null, 'and no longer once it is decided');
  mock.timers.tick(3_000);
  assert.deepEqual(paths(), ['frames/ios/smooth']);
  // The results screen and the lobby after it add nothing.
  countGameFrames(game('lobby'));
  mock.timers.tick(3_000);
  assert.equal(sent.length, 1);
});

test('the time the page is hidden is no stutter, however long', () => {
  sent.length = 0;
  countGameFrames(game('question'));
  frames(16, 800);
  doc.visibilityState = 'hidden';
  fireDoc('visibilitychange');
  frames(16, 10_000);
  t += 600_000;
  doc.visibilityState = 'visible';
  fireDoc('visibilitychange');
  frames(16, 800);
  countGameFrames(game('over'));
  mock.timers.tick(3_000);
  assert.deepEqual(paths(), ['frames/ios/smooth']);
});

test('a game the page is left in counts as far as it got, ahead of the queue going', () => {
  sent.length = 0;
  countGameFrames(game('choosing'));
  frames(16, 1500);
  // A long hitch at each of a few reveals: 3.5 s of 48.
  for (let i = 0; i < 5; i++) {
    countGameFrames(game('reveal'));
    frames(700);
    frames(16, 60);
    countGameFrames(game('question'));
    frames(16, 200);
  }
  listeners.get('pagehide')?.forEach((fn) => fn({}));
  assert.deepEqual(paths(), ['frames/ios/many/reveal']);
});

test('a game left mid-way counts as it is left', () => {
  sent.length = 0;
  countGameFrames(game('question'));
  frames(16, 1500);
  countGameFrames(null);
  mock.timers.tick(3_000);
  assert.deepEqual(paths(), ['frames/ios/smooth']);
});

test('nothing goes from a browser that opted out, mid-game too', () => {
  sent.length = 0;
  countGameFrames(game('question'));
  frames(16, 1500);
  stored.set(OPT_OUT_KEY, '1');
  countGameFrames(game('reveal'));
  assert.equal(pending, null, 'no more frames asked for');
  countGameFrames(game('over'));
  mock.timers.tick(3_000);
  assert.deepEqual(paths(), []);
});
