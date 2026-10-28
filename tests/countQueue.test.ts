// count.ts in a browser at the live game's address (globals set before it
// loads, as `counting` is settled then): a newcomer's first steps wait at the
// queue's head, so one who taps New game and closes the tab within a second
// is still counted, GoatCounter taking only four counts a second.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

mock.timers.enable({ apis: ['setTimeout'] });
// The queue's first wait, at most 2 s (count.ts JITTER_MS), here 1.5 s: the tab is closed before it's over.
Math.random = () => 0.75;

const sent: string[] = [];
const listeners = new Map<string, ((e: unknown) => void)[]>();
const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
set('location', { hostname: 'poe2.quest', pathname: '/', href: 'https://poe2.quest/', origin: 'https://poe2.quest', hash: '', search: '' });
set('navigator', { webdriver: false, userAgent: 'test', sendBeacon: (url: string) => (sent.push(url), true) });
set('document', {
  visibilityState: 'visible',
  referrer: '',
  title: 'PoE2.Quest',
  documentElement: { hasAttribute: () => false },
  addEventListener: () => {},
  removeEventListener: () => {},
});
set('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
set('addEventListener', (type: string, fn: (e: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]));
set('removeEventListener', (type: string, fn: (e: unknown) => void) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)));
const fire = (type: string, e: unknown = {}) => {
  for (const fn of listeners.get(type) ?? []) fn(e);
};

const { countActed, countPage, countStep, countVisit } = await import('../src/lib/count.ts');

/** What each beacon counted, in the order it went. */
const paths = () => sent.map((u) => new URL(u).searchParams.get('p'));

test('a newcomer who taps New game and leaves within a second is still counted as asking for a room', () => {
  // A first visit (no save); the idle moment that reads it never comes, so the first step reads it.
  countVisit(() => null, null, () => {});
  countPage();
  countActed();
  mock.timers.tick(300);
  // New game, its name saved: the room is asked for in the same tap.
  fire('click', { target: { closest: () => ({}) } });
  countStep('reach/create');
  countStep('reach/host');
  mock.timers.tick(600);
  fire('pagehide');
  // GoatCounter takes the first four in that second: the visit, then the newcomer's first steps.
  assert.deepEqual(paths().slice(0, 4), ['/', 'new/acted', 'new/create', 'new/host']);
  assert.ok(paths().includes('reach/page') && paths().includes('reach/host'), 'the rest still go, after');
});
