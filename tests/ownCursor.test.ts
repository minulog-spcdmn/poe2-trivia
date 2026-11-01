// The app's own pointer (lib/ownCursor.ts): every element inherits its
// cursor (app.css), and the pressed pointer, set on one element alone, hands
// that element's children the cursor handed down to them (themedCursors.ts),
// so what they hold isn't restyled; not in WebKit, which makes a named picture
// cursor afresh at each restyle and restyles all the element holds with it.
// Which browsers are WebKit, and the CSS as the build makes it.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss, { type Rule } from 'postcss';
import { themedCursors } from '../themedCursors.ts';

const { rebuildsCursorImages, shield, unshield } = await import('../src/lib/ownCursor.ts');

test('WebKit is Safari and every browser on iOS; not Chrome, Edge, Opera or Firefox', () => {
  const webkit = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/156.0.8078.54 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15',
    'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/138.0 Version/18.0 Mobile/15E148 Safari/604.1',
  ];
  const others = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/124.0.0.0',
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.6; rv:143.0) Gecko/20100101 Firefox/143.0',
  ];
  for (const ua of webkit) assert.equal(rebuildsCursorImages(ua), true, ua);
  for (const ua of others) assert.equal(rebuildsCursorImages(ua), false, ua);
});

const APP = postcss([themedCursors]).process(readFileSync('src/app.css', 'utf8'), { from: undefined }).root;
const rules: Rule[] = [];
APP.walkRules((r) => void rules.push(r));
const cursorOf = (r: Rule) => r.nodes.filter((d) => d.type === 'decl' && /^(--)?cursor(-now)?$/.test(d.prop)).map((d) => `${(d as postcss.Declaration).prop}: ${(d as postcss.Declaration).value}`);
const ruleOf = (selector: string) => {
  const i = rules.findIndex((r) => r.selector === selector);
  assert.ok(i >= 0, `app.css has ${selector}`);
  return { i, cursor: cursorOf(rules[i]) };
};

test('as built, every element inherits its cursor; text fields and <html> hand theirs down', () => {
  const every = ruleOf(':where(*)');
  // (Left as it is by the build: handed down, it would name a picture on every element again.)
  assert.deepEqual(every.cursor, ['cursor: inherit']);
  assert.ok(!rules.some((r) => r.selector.includes('data-cursor-inherited')), 'no rule for WebKit alone');
  // Text fields keep their own (as specific, and later).
  const text = rules.findIndex((r) => /^:where\(input/.test(r.selector) && cursorOf(r).includes('cursor: var(--cursor-now)'));
  assert.ok(text > every.i, 'text fields are styled after the rule for every element');
  assert.deepEqual(ruleOf('html').cursor, ['--cursor-now: var(--cursor, default)', 'cursor: var(--cursor-now)']);
});

test('the build hands a cursor down, but leaves the CSS-wide keywords as they are', () => {
  const css = 'a{cursor:pointer}b{cursor:crosshair}c{cursor:Inherit}d{cursor:unset}e{cursor:initial}f{cursor:revert}g{cursor:revert-layer}';
  assert.equal(
    postcss([themedCursors]).process(css, { from: undefined }).css,
    'a{--cursor-now:var(--cursor-pointer, pointer);cursor:var(--cursor-now)}b{--cursor-now:crosshair;cursor:var(--cursor-now)}' +
      'c{cursor:Inherit}d{cursor:unset}e{cursor:initial}f{cursor:revert}g{cursor:revert-layer}',
  );
});

/** An element's inline style, as far as shield uses it. */
function el(cursor = '') {
  const props = new Map<string, string>(cursor ? [['cursor', cursor]] : []);
  return {
    style: {
      getPropertyValue: (p: string) => props.get(p) ?? '',
      setProperty: (p: string, v: string) => void props.set(p, v),
      removeProperty: (p: string) => {
        const was = props.get(p) ?? '';
        props.delete(p);
        return was;
      },
    },
  };
}

test('pressed, an element’s children take the cursor handed down to them, and give it back on release', () => {
  const plain = el();
  const own = el('crosshair');
  const kids = [plain, own, el(), {}];
  const set = shield({ children: kids });
  assert.equal(set.length, 2, 'the two with no inline cursor of their own');
  assert.equal(plain.style.getPropertyValue('cursor'), 'var(--cursor-now, auto)');
  assert.equal(own.style.getPropertyValue('cursor'), 'crosshair', 'one of its own is left as it is');
  unshield(set);
  assert.equal(plain.style.getPropertyValue('cursor'), '');
  assert.equal(own.style.getPropertyValue('cursor'), 'crosshair');
});

test('release leaves a cursor set on a child since the press', () => {
  const child = el();
  const set = shield({ children: [child] });
  child.style.setProperty('cursor', 'grabbing');
  unshield(set);
  assert.equal(child.style.getPropertyValue('cursor'), 'grabbing');
});

test('ownCursor no longer marks WebKit for app.css, and keeps WebKit’s pressed children as they are', () => {
  const src = readFileSync('src/lib/ownCursor.ts', 'utf8');
  assert.doesNotMatch(src, /data-cursor-inherited/);
  assert.match(src, /rebuildsCursorImages\(navigator\.userAgent\) \? \[\] : shield\(target\)/);
});
