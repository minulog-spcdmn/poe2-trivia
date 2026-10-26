import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { screenHeight } from '../src/lib/viewport.ts';

// An iPhone 14's screen, as screen.width and screen.height give it.
const [SW, SH] = [390, 844];

test('a viewport handed back shorter keeps the screen’s height', () => {
  const tallest = new Map<number, number>();
  assert.equal(screenHeight(tallest, 390, 844, SW, SH), 844);
  // Back from another app, 47px short: the layers still fill the screen.
  assert.equal(screenHeight(tallest, 390, 797, SW, SH), 844);
});

test('each way up has its own height', () => {
  const tallest = new Map<number, number>();
  screenHeight(tallest, 390, 844, SW, SH);
  assert.equal(screenHeight(tallest, 844, 390, SW, SH), 390);
  assert.equal(screenHeight(tallest, 390, 844, SW, SH), 844);
});

test('a reading half old and half new as the phone turns is held to the screen', () => {
  const tallest = new Map<number, number>();
  // The new width with the old height: no taller than the screen on its side.
  assert.equal(screenHeight(tallest, 844, 844, SW, SH), 390);
  assert.equal(screenHeight(tallest, 844, 390, SW, SH), 390);
  // And upright, never past the screen's length.
  assert.equal(screenHeight(tallest, 390, 900, SW, SH), 844);
});

// The page held to the screen (holdViewport, app.css's html.held). html's
// overflow is visible, so the page scrolls by the body's overflow-x, and
// Chrome takes the page's overscroll-behavior from the body too, never html:
// held on html alone, a swipe down mid-turn on Android reloaded the game.

const APP = postcss.parse(readFileSync(new URL('../src/app.css', import.meta.url), 'utf8'));

/** The overscroll-behavior declarations of the rules that name `selector`, the last of each kept. */
function overscrollOf(selector: string) {
  const found = new Map<string, string>();
  APP.walkRules((r) => {
    if (r.selectors.includes(selector)) r.walkDecls(/^overscroll-behavior/, (d) => void found.set(d.prop, d.value));
  });
  return found;
}

test('a held page holds the body against pull to refresh, not html alone', () => {
  for (const selector of ['html.held', 'html.held body']) {
    const held = overscrollOf(selector);
    assert.equal(held.get('overscroll-behavior-y'), 'none', `${selector} holds the page up and down`);
    // Sideways stays free: a desktop trackpad's swipe goes back and forward.
    for (const prop of ['overscroll-behavior', 'overscroll-behavior-x']) {
      assert.equal(held.get(prop) ?? 'auto', 'auto', `${selector} leaves ${prop} as it is`);
    }
  }
});
