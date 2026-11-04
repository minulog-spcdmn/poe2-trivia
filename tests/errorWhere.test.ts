import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import MagicString from 'magic-string';
import ts from 'typescript';
import { LABEL, isWhereTable, ownFrames, placeIn, whereOf, type WhereTable } from '../src/lib/errorWhere.ts';
import { scriptErrorEvent } from '../src/lib/count.ts';
import { moduleOf, namedFunctions, whereTable } from '../whereMaps.ts';

const ASSETS = 'https://poe2.quest/assets/';

test("a stack's frames in the game's own scripts, as each browser writes them, and nothing else of it", () => {
  const chrome = [
    "TypeError: Cannot read properties of null (reading 'x')",
    '    at Xe (https://poe2.quest/assets/Codex-AbC12_x.js:1:2345)',
    '    at chrome-extension://abcdef/content.js:4:5',
    '    at https://poe2.quest/assets/main-Q1w2e3.js:12:7',
  ].join('\n');
  assert.deepEqual(ownFrames({ stack: chrome }, ASSETS), [
    { file: 'Codex-AbC12_x.js', line: 1, col: 2345 },
    { file: 'main-Q1w2e3.js', line: 12, col: 7 },
  ]);
  // Safari and Firefox: name@url:line:col; a query on a script's address is left behind.
  assert.deepEqual(ownFrames({ stack: 'open@https://poe2.quest/assets/Lobby-z9.js?v=2:1:88\n@https://poe2.quest/assets/main-1.js:3:4' }, ASSETS), [
    { file: 'Lobby-z9.js', line: 1, col: 88 },
    { file: 'main-1.js', line: 3, col: 4 },
  ]);
  // The beta, and a server with a port.
  assert.deepEqual(ownFrames({ stack: 'at f (http://127.0.0.1:4173/beta/assets/a-1.js:2:3)' }, 'http://127.0.0.1:4173/beta/assets/'), [{ file: 'a-1.js', line: 2, col: 3 }]);
  // No stack: the error event's own file and place.
  assert.deepEqual(ownFrames({ file: `${ASSETS}x-1.js`, line: 1, col: 9 }, ASSETS), [{ file: 'x-1.js', line: 1, col: 9 }]);
  // The page itself, another site, a file in a folder, or no place: nothing.
  assert.deepEqual(ownFrames({ stack: 'at https://poe2.quest/:1:2\nat https://evil.example/assets/a.js:1:2\nat https://poe2.quest/assets/sub/a.js:1:2' }, ASSETS), []);
  assert.deepEqual(ownFrames({ file: `${ASSETS}x-1.js`, line: 0, col: 0 }, ASSETS), []);
  assert.deepEqual(ownFrames({}, ASSETS), []);
  // At most eight, from the top.
  const deep = Array.from({ length: 20 }, (_, i) => `at f (${ASSETS}m-${i}.js:1:1)`).join('\n');
  assert.equal(ownFrames({ stack: deep }, ASSETS).length, 8);
});

const TABLE: WhereTable = { labels: ['lib/a.ts', 'lib/a.ts:go', 'node_modules/svelte', 'bad label with spaces'], lines: [[0, 0, 10, 1, 5, -1, 5, 2], [0, 3]] };

test('a place in a script is the stretch it falls in, and only a well-formed label', () => {
  assert.equal(placeIn(TABLE, 1, 1), 'lib/a.ts');
  assert.equal(placeIn(TABLE, 1, 11), 'lib/a.ts:go');
  assert.equal(placeIn(TABLE, 1, 15), 'lib/a.ts:go');
  assert.equal(placeIn(TABLE, 1, 16), null);
  assert.equal(placeIn(TABLE, 1, 21), 'node_modules/svelte');
  assert.equal(placeIn(TABLE, 1, 9999), 'node_modules/svelte');
  assert.equal(placeIn(TABLE, 2, 1), null);
  assert.equal(placeIn(TABLE, 3, 1), null);
  assert.ok(isWhereTable(TABLE));
  assert.ok(!isWhereTable({ labels: [1], lines: [] }));
  assert.ok(!isWhereTable(null));
  assert.ok(LABEL.test('components/Codex.svelte:Codex.open') && LABEL.test('node_modules/@noble/ed25519') && !LABEL.test('lib/a.ts:x y') && !LABEL.test('https://poe2.quest/?room=ABC'));
});

test("where an error was: the first frame in the game's own source, else a package's, else nothing", async () => {
  const tables: Record<string, WhereTable> = { 'a.js': TABLE, 'b.js': { labels: ['lib/b.ts:pick'], lines: [[0, 0]] } };
  const asked: string[] = [];
  const table = async (file: string) => (asked.push(file), tables[file] ?? null);
  // The package's frame on top gives way to the game's own below it; each script's table is fetched once.
  assert.equal(await whereOf([{ file: 'a.js', line: 1, col: 30 }, { file: 'a.js', line: 1, col: 16 }, { file: 'b.js', line: 1, col: 1 }], table), 'lib/b.ts:pick');
  assert.deepEqual(asked, ['a.js', 'b.js']);
  assert.equal(await whereOf([{ file: 'a.js', line: 1, col: 30 }], table), 'node_modules/svelte');
  assert.equal(await whereOf([{ file: 'gone.js', line: 1, col: 1 }], table), null);
  assert.equal(await whereOf([{ file: 'a.js', line: 1, col: 30 }], () => Promise.reject(new Error('offline'))), null);
});

test("the count's event says where, or stays plain error/script; never the error's words or the address", async () => {
  const table = async () => TABLE;
  const stack = `TypeError: secret words a player typed\n    at f (${ASSETS}a-1.js:1:12)\n    at g (https://poe2.quest/?room=ABCD:1:1)`;
  assert.equal(await scriptErrorEvent({ stack }, ASSETS, table), 'error/script/lib/a.ts:go');
  assert.equal(await scriptErrorEvent({ stack: 'no frames' }, ASSETS, table), 'error/script');
  assert.equal(await scriptErrorEvent({ stack }, ASSETS, async () => null), 'error/script');
  assert.equal(await scriptErrorEvent({ stack }, ASSETS, () => Promise.reject(new Error('x'))), 'error/script');
});

test("a source's label: its path in src/, a package's name, or nothing for the bundler's own", () => {
  assert.equal(moduleOf('src/lib/codex.ts'), 'lib/codex.ts');
  assert.equal(moduleOf('src/components/Lobby.svelte'), 'components/Lobby.svelte');
  assert.equal(moduleOf('node_modules/svelte/src/internal/client/runtime.js'), 'node_modules/svelte');
  assert.equal(moduleOf('node_modules/@noble/ed25519/index.js'), 'node_modules/@noble/ed25519');
  assert.equal(moduleOf('node_modules/a/node_modules/peerjs/dist/x.mjs'), 'node_modules/peerjs');
  assert.equal(moduleOf('\0vite/preload-helper.js'), null);
  assert.equal(moduleOf('../elsewhere/x.ts'), null);
});

const SOURCE = `import { x } from './x';

export function loadCodex(raw: string): number {
  const parse = (s: string) => JSON.parse(s);
  return [1, 2].map((n) => n + parse(raw).k).length;
}

class Session {
  openRoom(code: string) {
    throw new Error('room ' + code);
  }
  #long = () => {
    return x;
  };
}

const plain = 1;
`;

test("a source's named functions: its own, its variable's, a class's method; a callback is the function around it", () => {
  const { names, byOffset } = namedFunctions(ts, SOURCE, 'lib/codex.ts');
  const at = (needle: string) => {
    const n = byOffset[SOURCE.indexOf(needle)];
    return n >= 0 ? names[n] : null;
  };
  assert.equal(at('import'), null);
  assert.equal(at('[1, 2]'), 'loadCodex');
  assert.equal(at('n + parse'), 'loadCodex');
  assert.equal(at('JSON.parse'), 'parse');
  assert.equal(at("throw new Error('room"), 'Session.openRoom');
  assert.equal(at('return x'), 'Session.long');
  assert.equal(at('plain'), null);
  // A component's: its script's functions, at their places in the whole file; its markup is in none.
  const svelte = `<script lang="ts">\n  function pick(n: number) {\n    return n * 2;\n  }\n</script>\n\n<button onclick={() => pick(1)}>Go</button>\n`;
  const c = namedFunctions(ts, svelte, 'components/Pick.svelte');
  assert.equal(c.names[c.byOffset[svelte.indexOf('n * 2')]], 'pick');
  assert.equal(c.byOffset[svelte.indexOf('onclick')], -1);
});

test("a built script's table, from its source map: a place in the minified script finds the function it came from", () => {
  // "Minified": the source's lines run together into one, as the build's scripts are, with its map.
  const s = new MagicString(SOURCE);
  for (let i = SOURCE.indexOf('\n'); i >= 0; i = SOURCE.indexOf('\n', i + 1)) s.overwrite(i, i + 1, ' ');
  s.prepend('/*banner*/');
  const code = s.toString();
  const map = s.generateMap({ hires: true, source: 'src/lib/codex.ts' });
  const { names, byOffset } = namedFunctions(ts, SOURCE, 'lib/codex.ts');
  const starts = [0, ...[...SOURCE.matchAll(/\n/g)].map((m) => m.index! + 1)];
  const table = whereTable(map.mappings, (_source, line, col) => {
    const n = byOffset[starts[line] + col];
    return n >= 0 ? `lib/codex.ts:${names[n]}` : 'lib/codex.ts';
  });
  const place = (needle: string) => placeIn(table, 1, code.indexOf(needle) + 1);
  assert.equal(place('throw new Error'), 'lib/codex.ts:Session.openRoom');
  assert.equal(place('JSON.parse'), 'lib/codex.ts:parse');
  assert.equal(place('n + parse'), 'lib/codex.ts:loadCodex');
  assert.equal(place('const plain'), 'lib/codex.ts');
  // The banner the source has no part in is no place of it.
  assert.equal(place('banner'), null);
  // A run of one label is kept as one stretch.
  assert.ok(table.lines[0].length < code.length / 4);
});

test('the build writes the tables and ships no source maps; the count reads them from beside the scripts', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /plugins: \[[^\]]*\bwhereMaps\(\)/);
  const plugin = readFileSync(new URL('../whereMaps.ts', import.meta.url), 'utf8');
  assert.match(plugin, /sourcemap: 'hidden'/);
  assert.match(plugin, /name\.endsWith\('\.map'\)\) delete bundle\[name\]/);
  assert.match(readFileSync(new URL('../src/lib/errorWhere.ts', import.meta.url), 'utf8'), /\$\{file\}\.where\.json/);
  assert.match(plugin, /\$\{file\.fileName\}\.where\.json/);
});
