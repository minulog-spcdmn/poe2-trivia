// The faces other screens use are loaded ahead once the page has settled
// (lib/fontsAhead.ts), all four in that one moment: the browser lays the
// whole page out again each time the font set changes, whatever changed in
// it, so one face at a time would be four of those. Nothing is fetched ahead
// with Save-Data on, the codex still has the faces at once when it's opened
// before they're in, and no face is ever loaded twice. On the way into a
// room they come at once (the lobby draws with Cinzel Black), with Save-Data
// on only that one.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const loads: string[] = [];
const idles: (() => void)[] = [];
const g = globalThis as Record<string, unknown>;
// A page with requestIdleCallback (the settling uses its idle moments), the
// stylesheet's family variables and a font set that logs what it's asked to load.
g.requestIdleCallback = (f: () => void) => (idles.push(f), idles.length);
const connection = { saveData: false };
Object.defineProperty(globalThis, 'navigator', { value: { connection }, configurable: true });
g.document = {
  documentElement: {},
  visibilityState: 'visible',
  fonts: { load: async (font: string) => void loads.push(font) },
};
const FAMILIES: Record<string, string> = {
  '--font-cinzel': "'Cinzel', serif",
  '--font-tooltip': "'Fontin SmallCaps', serif",
  '--font-tooltip-italic': "'Fontin', serif",
  '--font-body': "'EB Garamond', serif",
};
g.getComputedStyle = () => ({ getPropertyValue: (name: string) => FAMILIES[name] ?? '' });

const { loadFonts, loadFontsAhead } = await import('../src/lib/fontsAhead.ts');
const ALL = ["900 16px 'Cinzel'", "400 16px 'Fontin SmallCaps'", "italic 400 16px 'Fontin'", "500 16px 'EB Garamond'"];

/** The next idle moment, and what the faces it loaded resolve. */
async function idle() {
  idles.shift()?.();
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

test('with Save-Data on, nothing is queued', () => {
  connection.saveData = true;
  loadFontsAhead()();
  connection.saveData = false;
  assert.equal(idles.length, 0);
  assert.deepEqual(loads, []);
});

test('the four faces in one settled moment, none before it', async () => {
  loadFontsAhead();
  assert.deepEqual(loads, []);
  assert.equal(idles.length, 1);
  await idle();
  assert.deepEqual(loads, ALL);
  // (Nothing more is queued: no settled moment of their own for the others.)
  assert.equal(idles.length, 0);
});

test('the codex, opened after, loads none of them again; nor does another settled moment', async () => {
  await loadFonts();
  loadFontsAhead();
  await idle();
  assert.deepEqual(loads, ALL);
});

/** A fresh copy of the module, as a page that has loaded none of them yet. */
const fresh = (name: string) => import(`../src/lib/fontsAhead.ts?${name}`) as Promise<typeof import('../src/lib/fontsAhead.ts')>;

test('on the way into a room, the four at once, not waiting for a settled moment; the queue then loads none again', async () => {
  const { loadRoomFonts, loadFontsAhead: ahead } = await fresh('room');
  const from = loads.length;
  loadRoomFonts();
  assert.equal(idles.length, 0);
  assert.deepEqual(loads.slice(from), ALL);
  ahead();
  await idle();
  loadRoomFonts();
  assert.deepEqual(loads.slice(from), ALL);
});

test('on the way into a room with Save-Data on, the lobby\'s face only', async () => {
  const { loadRoomFonts } = await fresh('saving');
  const from = loads.length;
  connection.saveData = true;
  loadRoomFonts();
  connection.saveData = false;
  assert.equal(idles.length, 0);
  assert.deepEqual(loads.slice(from), [ALL[0]]);
});
