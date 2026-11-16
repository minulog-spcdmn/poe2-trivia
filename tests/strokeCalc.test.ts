// Firefox takes a stroke's width, its dashes and their offset from a calc()
// only as a length: calc(var(--w) + 1.8), a bare number in the SVG's own
// units to Chrome and Safari, is no value at all to Firefox, and the line
// takes what it inherits instead (a width of 1, no dashes), not the rule
// before it. The descent's ouroboros lost its bodies' lines so, a hair wide
// at its scale, and only the heads, drawn as fills, still showed: bright
// heads on an empty ring for whoever hadn't passed 100 yet. A bare number
// outside calc() is fine (stroke-width: var(--w)). So every calc() on these
// names a unit: calc((var(--w) + 1.8) * 1px). A test can't tell what a
// variable holds, so a calc() on a variable that is a length already says
// so by a fallback, calc(var(--mark-stroke, 1.15px) * 2.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import postcss from 'postcss';

const LENGTHS = /^stroke-(width|dasharray|dashoffset)$/;

/** Each calc() of a value, whole (one inside another with the outer). */
const calcs = (value: string) => {
  const out: string[] = [];
  for (let i = value.indexOf('calc('); i >= 0; ) {
    let depth = 0;
    let j = i + 4;
    for (; j < value.length; j++) {
      if (value[j] === '(') depth++;
      else if (value[j] === ')' && --depth === 0) break;
    }
    out.push(value.slice(i, j + 1));
    i = value.indexOf('calc(', j);
  }
  return out;
};
/** Whether a calc() names a unit: a number with one (any: px, vw, %), a variable's name aside, and a number's own e (1e3) too. */
const named = (calc: string) =>
  /\d(?:[a-z]+|%)/i.test(
    calc
      .replace(/--[\w-]+/g, '')
      .replace(/\d(?:\.\d+)?e[+-]?\d+/gi, '0'),
  );
const HOW = 'write it as a length: calc((...) * 1px)';

/** Every source file of the game's with a style sheet or a script: its path, its sheet, and the rest of it. */
const sources = (): { path: string; css: string; rest: string }[] => {
  const out: { path: string; css: string; rest: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const at = join(dir, name);
      const path = at.split(sep).join('/');
      if (statSync(at).isDirectory()) walk(at);
      else if (name.endsWith('.css')) out.push({ path, css: readFileSync(at, 'utf8'), rest: '' });
      else if (name.endsWith('.ts')) out.push({ path, css: '', rest: readFileSync(at, 'utf8') });
      else if (name.endsWith('.svelte')) {
        const src = readFileSync(at, 'utf8');
        const from = src.indexOf('<style');
        const to = src.lastIndexOf('</style>');
        out.push(from < 0 ? { path, css: '', rest: src } : { path, css: src.slice(src.indexOf('>', from) + 1, to), rest: src.slice(0, from) + src.slice(to) });
      }
    }
  };
  walk('src');
  return out;
};
const SOURCES = sources();

test('the check itself: a unit in each calc(), whatever stands beside it', () => {
  assert.ok(named('calc((var(--w) + 1.8) * 1px)'));
  assert.ok(named('calc(var(--w) * 0.1vw)'));
  assert.ok(named('calc(var(--w) * 1PX)'));
  assert.ok(named('calc(var(--mark-stroke, 1.15px) * 2.4)'));
  assert.ok(!named('calc(var(--w) + 1.8)'));
  assert.ok(!named('calc(var(--w2px) * 2)'), 'a variable’s name is no unit');
  assert.ok(!named('calc(var(--t) * 1e3)'), 'nor a number’s own e');
  assert.ok(!named('calc(var(--t) * 1.5e-3)'));
  assert.ok(named('calc(var(--t) * 1e3px)'));
  assert.ok(named('calc(var(--w) * 2em)'));
  assert.deepEqual(calcs('calc(var(--a) * 2) 4px calc(calc(1px * 2) + 1px)'), ['calc(var(--a) * 2)', 'calc(calc(1px * 2) + 1px)']);
});

test("a stroke's width, dashes or offset worked out by calc() names its unit (Firefox takes no bare number there)", () => {
  const bad: string[] = [];
  let checked = 0;
  for (const { path, css } of SOURCES) {
    if (!css) continue;
    const sheet = postcss.parse(css);
    // The sheet's variables worked out by a calc() with no unit: read by a stroke outside any calc(), the same bare number.
    const bare = new Set<string>();
    sheet.walkDecls(/^--/, (d) => void (calcs(d.value).some((c) => !named(c)) && bare.add(d.prop)));
    sheet.walkDecls(LENGTHS, (d) => {
      const all = calcs(d.value);
      if (all.length) checked++;
      for (const c of all) if (!named(c)) bad.push(`${path}: ${d.prop}: ${d.value} (${HOW})`);
      const outside = all.reduce((v, c) => v.replace(c, ''), d.value);
      for (const [, name] of outside.matchAll(/var\(\s*(--[\w-]+)/g)) if (bare.has(name)) bad.push(`${path}: ${d.prop}: ${d.value}, where ${name} is a calc() with no unit (${HOW})`);
    });
  }
  assert.ok(checked >= 10, 'found the strokes worked out by calc() (the seals’, the marks’, the ouroboros’)');
  assert.deepEqual(bad, []);
});

test('nor in the markup or in script: a style attribute, a style: directive, a string set by hand', () => {
  const bad: string[] = [];
  for (const { path, rest } of SOURCES)
    for (const [found, value] of rest.matchAll(/stroke-(?:width|dasharray|dashoffset)[^;\n]{0,80}?(calc\([^;\n]*)/g)) for (const c of calcs(value)) if (!named(c)) bad.push(`${path}: ${found.trim()} (${HOW})`);
  assert.deepEqual(bad, []);
});
