import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The game's page held to the screen (app.css's html.held, lib/viewport.ts):
// Android Chrome reads a pull to refresh from the body, which its overflow-x
// makes a scroller, so holding html alone let a swipe down reload a game
// mid-turn. Both have to be held.

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector list has `selector` in it. */
function declarationsFor(selector: string): string {
  let found = '';
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(',').some((s) => s.trim().replace(/\s+/g, ' ') === selector)) found += body;
  }
  return found;
}

test('a held page holds the body against pull to refresh, not html alone', () => {
  for (const selector of ['html.held', 'html.held body']) {
    assert.match(declarationsFor(selector), /overscroll-behavior(-y)?:\s*none/, `${selector} has no overscroll-behavior-y: none`);
  }
});
