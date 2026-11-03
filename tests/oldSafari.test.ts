// Safari before 16.4 (an iPhone on iOS 15, or 16 not updated) can't read a
// regular expression with a lookbehind: a script holding one fails to load
// there as a whole, before any of it runs. lib/offensive.ts is on the start
// page's path, so the game showed nothing at all there, and nothing counted
// it (the error count hadn't started either). Its rewrites match as the old
// ones did, and no lookbehind comes back into the game's code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { joinLetters, offensive } from '../src/lib/offensive.ts';
import { knockoutShapes } from '../src/lib/knockout.ts';

// The old ones, which Node reads, to set the new ones against.
const OLD_JOIN = (s: string) => s.replace(new RegExp('(?<=(?:^| )\\S) (?=\\S(?: |$))', 'gu'), '');
const OLD_CODES = new RegExp('(?<!\\d)14[^\\p{L}\\p{N}]{0,2}88(?!\\d)|(?<!k)kkk(?!k)', 'iu');
const OLD_SHAPES = (d: string) => d.split(new RegExp('(?<=Z)(?=M)'));
const NEW_CODES = /(?:^|\D)14[^\p{L}\p{N}]{0,2}88(?!\d)|(?:^|[^k])kkk(?!k)/iu;

const SAMPLES = [
  '',
  ' ',
  'a',
  'n i g g e r',
  'n  i g',
  ' a b ',
  'ab c d ef',
  'a b cd e f',
  'x\ty z',
  'a b c',
  '😀 b c',
  'é 😀',
  'big fag',
  'one two',
  'a b  c',
  'k k k',
  '14 88',
  '1488',
  'x1488',
  '21488',
  '14/88',
  '14 / 88',
  '148899',
  'KKK',
  'kkk',
  'kkkk',
  'akkk',
  'Kkkk',
  'xKKKy',
  'hello',
];

test('the rewrites without a lookbehind match as the old ones did', () => {
  for (const s of SAMPLES) {
    assert.equal(joinLetters(s), OLD_JOIN(s), JSON.stringify(s));
    assert.equal(NEW_CODES.test(s), OLD_CODES.test(s), JSON.stringify(s));
  }
  assert.ok(offensive('n i g g e r') && offensive('1488') && offensive('KKK_Member') && !offensive('Brazil kkkk') && !offensive('Unit14ab88'));
  for (const d of ['', 'M0 0Z', 'M0 0ZM1 1Z', 'M0 0L1 1ZM2 2ZM3 3L4 4Z', 'M0 0Z L1 1', 'M0 0ZZM1 1']) assert.deepEqual(knockoutShapes(d), OLD_SHAPES(d), d);
});

test("lib/offensive.ts's codes are the ones tested here", () => {
  assert.ok(readFileSync(new URL('../src/lib/offensive.ts', import.meta.url), 'utf8').includes(`const CODES = ${NEW_CODES.toString()};`));
});

/** The game's own code (as tests/polyfills.test.ts has it), with the pages it starts from. */
const GAME = ['src/components', 'src/lib', 'src/legal', 'src/statsPage'];
const files = (dir: string): string[] =>
  readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(`${dir}/${e.name}`) : /\.(ts|svelte)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
  );

test('no regular expression in the game holds a lookbehind', () => {
  const found: string[] = [];
  for (const file of [...GAME.flatMap(files), 'src/main.ts', 'src/App.svelte', 'src/Root.svelte'])
    readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // (Comments that say so aside.)
        if (/\(\?<[=!]/.test(line.replace(/\/\/.*$|^\s*\*.*$/, ''))) found.push(`${file}:${i + 1}: a lookbehind, which Safari before 16.4 can't read; match the character before instead`);
      });
  assert.deepEqual(found, []);
});

test("the build fails on a script holding a lookbehind, a package's too, and on nothing else", async () => {
  const { unreadableRegexes } = await import('../polyfillsFirst.ts');
  assert.deepEqual(unreadableRegexes('const a = /(?<=Z)(?=M)/; const b = /(?<!k)kkk/iu;'), ['/(?<=Z)(?=M)/', '/(?<!k)kkk/iu']);
  // Named groups, a lookahead, and the words in a string or a comment are read everywhere.
  assert.deepEqual(unreadableRegexes('const c = /(?<year>\\d{4})(?=-)/; const s = "(?<=Z)"; // (?<!x)'), []);
  assert.match(readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8'), /plugins: \[[^\]]*\breadableRegexes\(\)[\s\S]*worker: \{[^}]*readableRegexes\(\)/);
});
