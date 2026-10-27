// Where a phone's toast stack stands (components/Toasts.svelte), worked out
// from its CSS as the browser would: under the header, or clear of the notch,
// and while the keyboard is up, below the top of what shows (--visual-top,
// the visual viewport's offsetTop) once the header has scrolled away. The
// stylesheet alone says where, so this reads the rule rather than a copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const SOURCE = readFileSync('src/components/Toasts.svelte', 'utf8');
const CSS = postcss.parse(SOURCE.slice(SOURCE.indexOf('<style>') + '<style>'.length, SOURCE.lastIndexOf('</style>')));
const TOP = (() => {
  let value = '';
  CSS.walkRules('.toasts.narrow', (r) => r.walkDecls('top', (d) => void (value = d.value)));
  assert.ok(value, '.toasts.narrow sets top');
  return value;
})();

/** The stack's top in px under a header `header` tall (0 on the start page; its safe-area padding counts), with what shows `visualTop` down the page and a safe area `safeTop` at the top. */
function top(header: number, visualTop: number, safeTop = 0): number {
  const sum = TOP.replaceAll('var(--header)', `${header}px`)
    .replaceAll('var(--visual-top, 0px)', `${visualTop}px`)
    .replaceAll('env(safe-area-inset-top)', `${safeTop}px`)
    .replace(/(\d+)px/g, '$1')
    .replaceAll('calc(', '(')
    .replaceAll('max(', 'Math.max(');
  // Only numbers, sums and max() are left, or the rule has a term this doesn't fill in.
  assert.match(sum, /^(Math\.max|[\d\s+\-(),])+$/, `top: ${TOP} has a term the test doesn't know`);
  return Function(`return ${sum}`)() as number;
}

test('with no header the toast stack keeps to the top of what shows', () => {
  assert.equal(top(0, 0), 10);
  assert.equal(top(0, 37), 47);
  assert.equal(top(0, 172), 182);
  // An installed app's safe area: as far below the top of what shows.
  assert.equal(top(0, 0, 47), 47);
  assert.equal(top(0, 172, 47), 219);
});

test('under a header the toast stack moves only once the header has scrolled away', () => {
  assert.equal(top(50, 0), 56);
  // 13px of the header still showing: the stack stays 6px under it.
  assert.equal(top(50, 37), 56);
  assert.equal(top(50, 46), 56);
  // The header gone: 10px below the top of what shows.
  assert.equal(top(50, 56), 66);
  assert.equal(top(50, 172), 182);
  // A header padded down past the notch: under it, then the notch's height below the top of what shows.
  assert.equal(top(97, 0, 47), 103);
  assert.equal(top(97, 172, 47), 219);
});
