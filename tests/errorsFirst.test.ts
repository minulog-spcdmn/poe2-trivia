// The errors from before any module runs (src/lib/errorsFirst.ts), kept by
// the inline script every page gets (polyfillsFirst.ts) and counted once
// main.ts's own code runs (count.ts countScriptErrors), as those after are:
// the modules main.ts imports run before it, and a throw at the top of one
// of them leaves the page blank. Here count.ts is in a browser at the live
// game's address (globals set before it loads, as countOptOutSend.test.ts does).
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sent: string[] = [];
const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
set('location', { hostname: 'poe2.quest', pathname: '/', origin: 'https://poe2.quest', href: 'https://poe2.quest/' });
set('navigator', { webdriver: false, sendBeacon: (url: string) => (sent.push(url), true) });
set('document', {
  visibilityState: 'visible',
  referrer: '',
  title: 'PoE2.Quest',
  documentElement: { hasAttribute: () => false },
  addEventListener: () => {},
  removeEventListener: () => {},
});
set('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
// The window's events.
const page = new EventTarget();
set('addEventListener', page.addEventListener.bind(page));
set('removeEventListener', page.removeEventListener.bind(page));

/** An error event as the browser makes one, thrown in `file`. */
const thrown = (file: string) => Object.assign(new Event('error'), { filename: file, error: new Error('x') });
/** An unhandled rejection's event, of an error with this stack. */
const rejected = (stack: string) => Object.assign(new Event('unhandledrejection'), { reason: { stack, message: 'x' } });
const GAME = 'https://poe2.quest/assets/session-1.js';
const EXTENSION = 'chrome-extension://abc/content.js';
const counted = () => sent.filter((url) => /p=error%2Fscript/.test(url)).length;

const { polyfillsScript } = await import('../polyfillsFirst.ts');
const script = await polyfillsScript();

// Counts go out in turn, the first after a random wait of at most 2 s (count.ts release): the clock is moved on by hand.
mock.timers.enable({ apis: ['setTimeout'] });
const later = () => mock.timers.tick(2_000);

test('an error from before main.ts ran is counted once it does, once a page load, and the page keeps no more after', async () => {
  // The page is read: the inline script runs, then the modules main.ts imports, which throw.
  vm.runInThisContext(script);
  page.dispatchEvent(thrown(EXTENSION));
  page.dispatchEvent(rejected(`TypeError: x\n    at Session (${GAME}:1:2)`));
  page.dispatchEvent(thrown(GAME));
  // main.ts's first line.
  const { countScriptErrors } = await import('../src/lib/count.ts');
  countScriptErrors();
  assert.equal((globalThis as Record<string, unknown>).__errorsFirst, undefined, 'taken');
  later();
  assert.equal(counted(), 1);
  page.dispatchEvent(thrown(GAME));
  later();
  assert.equal(counted(), 1, 'once a page load');
});

test('only an error of the game\'s own kept from before is counted; one after still is', async () => {
  vm.runInThisContext(script);
  page.dispatchEvent(thrown(EXTENSION));
  // (A page of its own: the query makes it a module of its own.)
  const fresh = '../src/lib/count.ts?fresh';
  const { countScriptErrors } = (await import(fresh)) as typeof import('../src/lib/count.ts');
  const before = counted();
  countScriptErrors();
  later();
  assert.equal(counted(), before);
  page.dispatchEvent(thrown(GAME));
  later();
  assert.equal(counted(), before + 1);
});

test('the inline script keeps ten at most, none once taken, and leaves only the name they are taken by', () => {
  const events = new EventTarget();
  const bare = vm.createContext({ addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) });
  vm.runInContext('var before = Object.getOwnPropertyNames(globalThis);', bare);
  vm.runInContext(script, bare);
  // (Copied out of the context: its arrays are another realm's.)
  assert.deepEqual([...vm.runInContext('Object.getOwnPropertyNames(globalThis).filter((n) => !before.includes(n) && n !== "before").sort()', bare)], [
    '__errorsFirst',
    // (Which a bare context lacks.)
    'structuredClone',
  ]);
  for (let i = 0; i < 12; i++) events.dispatchEvent(thrown(GAME));
  const kept = vm.runInContext('__errorsFirst()', bare) as Event[];
  assert.equal(kept.length, 10);
  events.dispatchEvent(thrown(GAME));
  assert.equal(kept.length, 10);
});

test('it is run as a script, not imported', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.doesNotMatch(read('src/lib/errorsFirst.ts'), /^(import|export) /m);
  for (const entry of ['src/main.ts', 'src/lib/countErrors.ts', 'src/lib/count.ts']) assert.doesNotMatch(read(entry), /^import .*errorsFirst/m, entry);
});
