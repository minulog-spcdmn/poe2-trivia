// The battery saver is a touch device's alone (lib/fx/core.ts,
// SAVER_OFFERED): a phone's or a tablet's, for its battery. Nobody else gets
// the game with its motion held (the owner's call, as with the still mode,
// tests/still.test.ts). So: on a touch device what was saved is followed,
// the effects switch before it too, a keyboard or a mouse plugged in or
// not; anywhere else it isn't, whatever was saved while every device had
// the switch, it's left as saved, and nothing switches it on; the lab keeps
// its switch on any device; and the settings show the switch only where
// it's offered. Each case is a page loaded afresh (asVite's ?page=), its
// storage and all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './asVite.ts';

const store = new Map<string, string>();
const attrs = new Set<string>();
/** What the page's device says of itself: a touch screen at all, and whether its main pointer is the finger. */
const DEVICES = {
  phone: { touch: true, finger: true },
  // (Its main pointer the trackpad's: an iPad in a keyboard case, a phone with a mouse plugged in.)
  'tablet with a keyboard': { touch: true, finger: false },
  desktop: { touch: false, finger: false },
};
let device: (typeof DEVICES)[keyof typeof DEVICES] = DEVICES.desktop;
const g = globalThis as Record<string, unknown>;
g.document = {
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
  documentElement: {
    hasAttribute: (n: string) => attrs.has(n),
    getAttribute: (n: string) => (attrs.has(n) ? '' : null),
    setAttribute: (n: string) => void attrs.add(n),
    toggleAttribute: (n: string, on: boolean) => void (on ? attrs.add(n) : attrs.delete(n)),
  },
  body: {},
  createElement: () => ({ getContext: () => null }),
};
g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
g.matchMedia = (q: string) => ({ matches: (q === '(any-pointer: coarse)' && device.touch) || (q === '(pointer: coarse)' && device.finger), addEventListener() {}, removeEventListener() {} });
g.Element = class {};
g.WebGL2RenderingContext = class {};
g.devicePixelRatio = 1;
g.requestAnimationFrame = () => 1;
g.cancelAnimationFrame = () => {};
g.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

/** A page of the game's loaded afresh on a device, with what an earlier visit saved; `lab`: the lab's page. */
async function page(name: string, on: keyof typeof DEVICES, saved: Record<string, string>, lab = false) {
  store.clear();
  attrs.clear();
  if (lab) attrs.add('data-lab');
  device = DEVICES[on];
  const storage = (await import(`../src/lib/storage.ts?page=${name}`)) as typeof import('../src/lib/storage.ts');
  for (const [k, v] of Object.entries(saved)) storage.writeStored(k, v);
  const fx = (await import(`../src/lib/fx/core.ts?page=${name}`)) as typeof import('../src/lib/fx/core.ts');
  const is = () => ({ offered: fx.SAVER_OFFERED, on: fx.batterySaver(), marked: attrs.has('data-saver') });
  return { fx, storage, is };
}
const ON = { offered: true, on: true, marked: true };
const OFF = { offered: true, on: false, marked: false };
const NONE = { offered: false, on: false, marked: false };

test('on a touch device the battery saver is offered, and what was saved is followed', async () => {
  assert.deepEqual((await page('phone-on', 'phone', { saver: '1' })).is(), ON);
  assert.deepEqual((await page('phone-off', 'phone', { saver: '0' })).is(), OFF);
  assert.deepEqual((await page('phone-new', 'phone', {})).is(), OFF);
  // (The effects switch it replaced: off there is on here.)
  assert.deepEqual((await page('phone-fx-off', 'phone', { fx: '0' })).is(), ON);
  const p = await page('phone-switch', 'phone', {});
  p.fx.setBatterySaver(true);
  assert.deepEqual(p.is(), ON);
  assert.equal(p.storage.readStored('saver'), '1');
});

test('a touch device with a keyboard or a mouse plugged in keeps its saver, its main pointer a fine one', async () => {
  assert.deepEqual((await page('docked-on', 'tablet with a keyboard', { saver: '1' })).is(), ON);
  assert.deepEqual((await page('docked-new', 'tablet with a keyboard', {})).is(), OFF);
});

test('anywhere else it isn’t there, whatever was saved while every device had the switch', async () => {
  const had = await page('desktop-on', 'desktop', { saver: '1' });
  assert.deepEqual(had.is(), NONE);
  assert.equal(had.storage.readStored('saver'), '1', 'left as saved');
  const hadFxOff = await page('desktop-fx-off', 'desktop', { fx: '0' });
  assert.deepEqual(hadFxOff.is(), NONE);
  assert.equal(hadFxOff.storage.readStored('fx'), '0', 'left as saved');
  assert.deepEqual((await page('desktop-new', 'desktop', {})).is(), NONE);
});

test('and nothing switches it on there: the page would have no switch to let it go', async () => {
  const p = await page('desktop-asked', 'desktop', { fx: '0' });
  p.fx.setBatterySaver(true);
  assert.deepEqual(p.is(), NONE);
  assert.equal(p.storage.readStored('saver'), null, 'nothing saved');
  assert.equal(p.storage.readStored('fx'), '0', 'nor what was saved touched');
});

test('the lab keeps its switch on any device', async () => {
  assert.deepEqual((await page('lab-on', 'desktop', { saver: '1' }, true)).is(), ON);
  const p = await page('lab-switch', 'desktop', {}, true);
  assert.deepEqual(p.is(), OFF);
  p.fx.setBatterySaver(true);
  assert.deepEqual(p.is(), ON);
});

test('its switch is in the settings only where it’s offered', () => {
  assert.match(readFileSync('src/components/Settings.svelte', 'utf8'), /\{#if SAVER_OFFERED\}\s*<div class="row">\s*<span class="label">Battery saver<\/span>/);
});
