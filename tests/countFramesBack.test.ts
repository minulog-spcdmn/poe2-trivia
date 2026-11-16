// count.ts's count of a visit's first game (countGameFrames, stutter.ts
// VISIT) on a page come back to, here a reload (globals set before count.ts
// loads, as countFrames.test.ts sets them): its games count as games, but
// no visit goes, as the page arrived at sent it.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, createGame, type GameState } from '../src/lib/game.ts';

mock.timers.enable({ apis: ['setTimeout'] });

const sent: string[] = [];
const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
set('location', { hostname: 'poe2.quest', pathname: '/', href: 'https://poe2.quest/', origin: 'https://poe2.quest', hash: '', search: '' });
set('navigator', {
  webdriver: false,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  sendBeacon: (url: string) => (sent.push(url), true),
});
set('document', { visibilityState: 'visible', referrer: '', title: 'PoE2.Quest', documentElement: { hasAttribute: () => false }, addEventListener: () => {}, removeEventListener: () => {} });
set('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
set('addEventListener', () => {});
set('removeEventListener', () => {});

/** The page's animation frames, stepped by hand. */
let t = 0;
let pending: ((t: number) => void) | null = null;
set('requestAnimationFrame', (cb: (t: number) => void) => ((pending = cb), 1));
set('cancelAnimationFrame', () => void (pending = null));
// (How the page was reached: reloaded.)
set('performance', { now: () => t, getEntriesByType: () => [{ type: 'reload' }] });
const frames = (ms: number, times = 1) => {
  for (let i = 0; i < times; i++) {
    t += ms;
    const cb = pending;
    pending = null;
    cb?.(t);
  }
};

const { countGameFrames } = await import('../src/lib/count.ts');

const game = (phase: GameState['phase']): GameState => ({ ...createGame('p0', { ...DEFAULT_SETTINGS, mode: 'turns' }), phase });

test("a reloaded page's games count, but none as a visit's first: every reload would be one more chance to count as stuttered", () => {
  for (let i = 0; i < 2; i++) {
    countGameFrames(game('choosing'));
    frames(700);
    frames(16, 1500);
    countGameFrames(game('over'));
  }
  for (let i = 0; i < 5; i++) mock.timers.tick(1_000);
  assert.deepEqual(
    sent.map((u) => new URL(u).searchParams.get('p')),
    ['frames2/ios/some/begin', 'frames2/ios/some/begin'],
  );
});
