// The faces other screens use are loaded ahead one at a time, each in an idle
// moment of its own once the page has settled (lib/fontsAhead.ts), not all
// four in one go: on the iPhone that was a long frame decoding them and
// another laying the page out again. The codex, opened before they're all
// in, still has the rest at once, and no face is ever loaded twice.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const loads: string[] = [];
const idles: (() => void)[] = [];
const g = globalThis as Record<string, unknown>;
// A page with requestIdleCallback (the settling uses its idle moments), the
// stylesheet's family variables and a font set that logs what it's asked to load.
g.requestIdleCallback = (f: () => void) => (idles.push(f), idles.length);
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
g.document = {
  documentElement: {},
  visibilityState: 'visible',
  fonts: { load: async (font: string) => void loads.push(font) },
};
const FAMILIES: Record<string, string> = {
  '--font-cinzel': "'Cinzel', serif",
  '--font-tooltip': "'Fontin SmallCaps', serif",
  '--font-tooltip-italic': "'Fontin Italic', serif",
  '--font-body': "'EB Garamond', serif",
};
g.getComputedStyle = () => ({ getPropertyValue: (name: string) => FAMILIES[name] ?? '' });

const { loadFonts, loadFontsAhead } = await import('../src/lib/fontsAhead.ts');

/** The next idle moment, and what the face it loaded resolves. */
async function idle() {
  idles.shift()?.();
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

test('one face per idle moment, then the codex has the rest at once, and none twice', async () => {
  loadFontsAhead();
  assert.deepEqual(loads, []);
  await idle();
  assert.deepEqual(loads, ["900 16px 'Cinzel'"]);
  // (The next idle moment is asked for only once that face is in.)
  assert.equal(idles.length, 1);
  await idle();
  assert.deepEqual(loads, ["900 16px 'Cinzel'", "400 16px 'Fontin SmallCaps'"]);
  await loadFonts();
  assert.deepEqual(loads, ["900 16px 'Cinzel'", "400 16px 'Fontin SmallCaps'", "italic 400 16px 'Fontin Italic'", "500 16px 'EB Garamond'"]);
  await idle();
  await idle();
  assert.equal(loads.length, 4);
});
