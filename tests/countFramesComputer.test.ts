// count.ts's count of a game's frames (countGameFrames) on a computer, set
// apart from countFrames.test.ts's phone since the device is read once a
// page: hidden, a computer's game isn't counted there and then, as a phone's
// is. Switched away from in the middle of a game and counted there, it would
// be mostly its begin, and the rest of it never seen.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, createGame, type GameState } from '../src/lib/game.ts';

mock.timers.enable({ apis: ['setTimeout'] });

const sent: string[] = [];
const listeners = new Map<string, ((e: unknown) => void)[]>();
const docListeners = new Map<string, (() => void)[]>();
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
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  sendBeacon: (url: string) => (sent.push(url), true),
});
set('document', doc);
const stored = new Map<string, string>();
set('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
set('addEventListener', (type: string, fn: (e: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]));
set('removeEventListener', () => {});

/** The page's animation frames, stepped by hand. */
let t = 0;
let pending: ((t: number) => void) | null = null;
set('requestAnimationFrame', (cb: (t: number) => void) => ((pending = cb), 1));
set('performance', { now: () => t });
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
const show = (state: 'visible' | 'hidden') => {
  doc.visibilityState = state;
  fireDoc('visibilitychange');
};

const { countGameFrames } = await import('../src/lib/count.ts');

const paths = () => sent.map((u) => new URL(u).searchParams.get('p'));
const game = (phase: GameState['phase']): GameState => ({ ...createGame('p0', { ...DEFAULT_SETTINGS, mode: 'turns' }), phase });

test("a computer's game switched away from counts as a whole, as it ends", () => {
  countGameFrames(game('choosing'));
  // A hitch as the game began, then 22 s smooth: switched away from there, it would read "some/begin".
  t += 400;
  frames(16, 1400);
  show('hidden');
  assert.deepEqual(paths(), [], 'not counted as it was hidden');
  show('visible');
  countGameFrames(game('question'));
  frames(16, 4000);
  countGameFrames(game('over'));
  mock.timers.tick(3_000);
  assert.deepEqual(paths(), ['frames2/desktop-chrome/smooth'], 'the whole game, once');
});

test("a computer's game the page is left in counts as it's left", () => {
  sent.length = 0;
  countGameFrames(game('question'));
  frames(16, 1500);
  show('hidden');
  listeners.get('pagehide')?.forEach((fn) => fn({}));
  assert.deepEqual(paths(), ['frames2/desktop-chrome/smooth']);
});
