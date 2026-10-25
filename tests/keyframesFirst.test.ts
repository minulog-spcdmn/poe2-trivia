import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveKeyframes, renamed, splitKeyframes, type ChunkInfo } from '../keyframesFirst.ts';

// The build's keyframes-first plugin (keyframesFirst.ts): the @keyframes of the
// sheets fetched later go into a sheet the page links from the start, so
// adding one later doesn't restyle the whole page.

test('a sheet splits into its top-level @keyframes and the rest', () => {
  const css =
    '.a{color:red}@keyframes svelte-x-rise{0%{opacity:0}to{opacity:1}}.b{content:"}@keyframes q{"}' +
    '/* @keyframes c{} */@media (hover:hover){@keyframes inner{to{top:0}}}@-webkit-keyframes w{to{left:0}}.c{}';
  const { rest, keyframes } = splitKeyframes(css);
  assert.deepEqual(
    keyframes.map((k) => k.name),
    ['svelte-x-rise', 'w'],
  );
  assert.equal(keyframes[0].text, '@keyframes svelte-x-rise{0%{opacity:0}to{opacity:1}}');
  assert.equal(rest, '.a{color:red}.b{content:"}@keyframes q{"}/* @keyframes c{} */@media (hover:hover){@keyframes inner{to{top:0}}}.c{}');
});

const chunk = (fileName: string, o: Partial<ChunkInfo> = {}): ChunkInfo => ({ fileName, isEntry: false, imports: [], dynamicImports: [], css: [], ...o });

test('a later sheet’s @keyframes move to the entry’s sheet, once', () => {
  const chunks = [
    chunk('main.js', { isEntry: true, imports: ['shared.js'], dynamicImports: ['codex.js', 'game.js'], css: ['main.css'] }),
    chunk('shared.js', { css: ['shared.css'] }),
    chunk('codex.js', { dynamicImports: ['game.js'], css: ['codex.css'] }),
    chunk('game.js', { css: ['game.css'] }),
  ];
  const sheets = {
    'main.css': '.m{}@keyframes m{to{top:0}}',
    'shared.css': '.s{}@keyframes s{to{top:0}}',
    'codex.css': '.c{animation:c 1s}@keyframes c{to{top:1px}}',
    'game.css': '@keyframes g{to{top:2px}}.g{}@keyframes m{to{top:0}}',
  };
  const { sheets: out, hosts } = moveKeyframes(chunks, sheets);
  assert.deepEqual([...hosts], ['main.css']);
  assert.equal(out.get('codex.css'), '.c{animation:c 1s}');
  assert.equal(out.get('game.css'), '.g{}');
  // Linked from the start, before the entry's own: in that one now too.
  assert.equal(out.get('shared.css'), '.s{}');
  // The entry's own copy of m stays the one.
  assert.equal(out.get('main.css'), '.m{}@keyframes m{to{top:0}}@keyframes c{to{top:1px}}@keyframes g{to{top:2px}}@keyframes s{to{top:0}}');
});

test('a sheet is left as it is where moving could change what it draws', () => {
  const chunks = [
    chunk('main.js', { isEntry: true, dynamicImports: ['a.js', 'b.js'], css: ['main.css'] }),
    chunk('qa.js', { isEntry: true, imports: ['b.js'], css: ['qa.css'] }),
    chunk('a.js', { css: ['a.css'] }),
    chunk('b.js', { css: ['b.css'] }),
  ];
  const sheets = {
    'main.css': '.m{}',
    'qa.css': '.q{}',
    // The same name with other frames elsewhere: which one wins could change.
    'a.css': '@keyframes x{to{top:1px}}',
    'b.css': '@keyframes x{to{top:2px}}',
  };
  const { sheets: out, created } = moveKeyframes(chunks, sheets);
  assert.equal(out.size, 0);
  assert.equal(created.size, 0);
});

test('a page that links no sheet gets one made for the @keyframes', () => {
  const chunks = [
    chunk('main.js', { isEntry: true, dynamicImports: ['c.js'], css: ['main.css'] }),
    chunk('tool.js', { isEntry: true, dynamicImports: ['c.js'] }),
    chunk('c.js', { css: ['c.css'] }),
  ];
  const { sheets, hosts, created } = moveKeyframes(chunks, { 'main.css': '.m{}', 'c.css': '.c{}@keyframes y{to{top:0}}' });
  assert.equal(sheets.get('c.css'), '.c{}');
  assert.equal(sheets.get('main.css'), '.m{}@keyframes y{to{top:0}}');
  assert.deepEqual([...hosts], ['main.css']);
  assert.deepEqual([...created], [['tool.js', '@keyframes y{to{top:0}}']]);
});

test('an entry without a sheet of its own: the last one it links takes them', () => {
  const chunks = [
    chunk('index.js', { isEntry: true, imports: ['app.js', 'root.js'], dynamicImports: ['game.js'] }),
    chunk('app.js', { css: ['app.css'] }),
    chunk('root.js', { imports: ['app.js'], css: ['root.css'] }),
    chunk('game.js', { css: ['game.css'] }),
  ];
  const { sheets, hosts } = moveKeyframes(chunks, { 'app.css': '.a{}', 'root.css': '.r{}', 'game.css': '@keyframes g{to{top:0}}.g{}' });
  assert.deepEqual([...hosts], ['root.css']);
  assert.equal(sheets.get('root.css'), '.r{}@keyframes g{to{top:0}}');
  assert.equal(sheets.get('game.css'), '.g{}');
});

test('a sheet that takes @keyframes is named by its new contents', () => {
  assert.match(renamed('assets/main-CND4XNza.css', 'a{}'), /^assets\/main-[\w-]{8}\.css$/);
  assert.notEqual(renamed('assets/main-CND4XNza.css', 'a{}'), renamed('assets/main-CND4XNza.css', 'b{}'));
  assert.equal(renamed('assets/main-CND4XNza.css', 'a{}'), renamed('assets/main-CND4XNza.css', 'a{}'));
});
