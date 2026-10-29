// The app's own pointer (lib/ownCursor.ts) in WebKit: there every element
// inherits the cursor rather than naming the one handed down to it, as WebKit
// makes a named picture cursor afresh at each restyle and restyles all the
// element holds with it (app.css). Which browsers are WebKit, and the CSS as
// the build makes it (themedCursors.ts).
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss, { type Rule } from 'postcss';
import { themedCursors } from '../themedCursors.ts';

const { rebuildsCursorImages } = await import('../src/lib/ownCursor.ts');

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

test('as built, every element takes the cursor handed down to it, but in WebKit inherits it', () => {
  const handed = ruleOf(':where(*)');
  const inherited = ruleOf(':where(:root[data-cursor-inherited] *)');
  assert.deepEqual(handed.cursor, ['cursor: var(--cursor-now, auto)']);
  // (Left as it is by the build: handed down, it would name a picture again.)
  assert.deepEqual(inherited.cursor, ['cursor: inherit']);
  assert.ok(inherited.i > handed.i, 'the WebKit rule comes after the one it stands in for');
  // Text fields keep their own (as specific, and later).
  const text = rules.findIndex((r) => /^:where\(input/.test(r.selector) && cursorOf(r).includes('cursor: var(--cursor-now)'));
  assert.ok(text > inherited.i, 'text fields are styled after the WebKit rule');
  assert.deepEqual(ruleOf('html').cursor, ['--cursor-now: var(--cursor, default)', 'cursor: var(--cursor-now)']);
});

test('ownCursor marks WebKit with the attribute app.css reads', () => {
  assert.match(readFileSync('src/lib/ownCursor.ts', 'utf8'), /setAttribute\('data-cursor-inherited', ''\)/);
});
