// A press on a screen on its way out (lib/leaving.ts) is stopped as it comes
// down to the screen. The click's sound and the press's sparks listen at the
// window, which hears it first: they skip what is going themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clickedControl } from '../src/lib/sound.ts';

test('a press on a control of a screen on its way out is not heard, and throws no sparks', () => {
  // A button, in a screen that is going or not: closest() as the page's elements answer it, for the selectors asked.
  const button = (within: string[]) => {
    const el = { disabled: false, closest: (sel: string) => (sel.startsWith('button') || sel.split(',').some((s) => within.includes(s.trim())) ? el : null) };
    return el as unknown as Element;
  };
  const here = button([]);
  assert.equal(clickedControl(here), here);
  assert.equal(clickedControl(button(['[data-leaving]'])), null);
  assert.equal(clickedControl(button(['[inert]'])), null);
  assert.equal(clickedControl(button(['[data-sfx="none"]'])), null);
  // (The sparks': lib/fx/ui.ts, which only the page loads.)
  const fx = readFileSync('src/lib/fx/ui.ts', 'utf8');
  assert.match(fx, /const NO_PRESS = `[^`]*\$\{GONE\}`/);
  assert.equal(fx.match(/el\.closest\(NO_PRESS\)/g)?.length, 2, 'the pointer press and the key press');
});
