import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

// A browser without them (Chrome 92): taken away before the fill-ins load. (Each test file runs in a process of its own.)
const g = globalThis as Record<string, unknown>;
delete (Object as unknown as Record<string, unknown>).hasOwn;
delete (Array.prototype as unknown as Record<string, unknown>).findLast;
delete (Array.prototype as unknown as Record<string, unknown>).findLastIndex;
delete (Array.prototype as unknown as Record<string, unknown>).toSorted;
delete g.structuredClone;
delete (AbortSignal.prototype as unknown as Record<string, unknown>).throwIfAborted;
await import('../src/lib/polyfills.ts');

test('Object.hasOwn: own keys only', () => {
  assert.equal(Object.hasOwn({ a: 1 }, 'a'), true);
  assert.equal(Object.hasOwn({ a: 1 }, 'toString'), false);
  assert.equal(Object.hasOwn(Object.create({ a: 1 }), 'a'), false);
});

test('findLast and findLastIndex search from the end, and stay out of a for-in', () => {
  const list = [1, 2, 3, 4];
  assert.equal(list.findLast((n) => n % 2 === 1), 3);
  assert.equal(list.findLastIndex((n) => n % 2 === 1), 2);
  assert.equal(list.findLast((n) => n > 9), undefined);
  assert.equal(list.findLastIndex((n) => n > 9), -1);
  const keys: string[] = [];
  for (const k in list) keys.push(k);
  assert.deepEqual(keys, ['0', '1', '2', '3']);
});

test('toSorted sorts a copy and leaves the list as it was', () => {
  const list = [3, 1, 2];
  assert.deepEqual(list.toSorted((a, b) => a - b), [1, 2, 3]);
  assert.deepEqual(list.toSorted(), [1, 2, 3]);
  assert.deepEqual(list, [3, 1, 2]);
});

test('structuredClone copies deep, keeps undefined, shared and circular parts', () => {
  const shared = { n: 1 };
  const from: Record<string, unknown> = { a: [shared, shared, undefined], m: new Map([['k', new Set([1])]]), d: new Date(5), u: undefined };
  from.self = from;
  const c = structuredClone(from);
  assert.notEqual(c, from);
  assert.deepEqual((c.a as unknown[])[0], shared);
  assert.notEqual((c.a as unknown[])[0], shared);
  assert.equal((c.a as unknown[])[0], (c.a as unknown[])[1]);
  assert.equal((c.a as unknown[]).length, 3);
  assert.ok('u' in c);
  assert.equal(c.self, c);
  assert.deepEqual(c.m, new Map([['k', new Set([1])]]));
  assert.equal((c.d as Date).getTime(), 5);
});

test('throwIfAborted throws once aborted', () => {
  const ctl = new AbortController();
  ctl.signal.throwIfAborted();
  ctl.abort();
  assert.throws(() => ctl.signal.throwIfAborted());
});

test('structuredClone throws on what cannot be cloned, keeps a "__proto__" key and an array\'s length', () => {
  assert.throws(() => structuredClone({ f: () => 1 }), { name: 'DataCloneError' });
  const parsed = JSON.parse('{"__proto__": {"x": 1}}') as Record<string, unknown>;
  const c = structuredClone(parsed);
  assert.deepEqual(Object.keys(c), ['__proto__']);
  assert.equal(Object.getPrototypeOf(c), Object.prototype);
  assert.equal(structuredClone(new Array(3)).length, 3);
  const day = new Date(5);
  const both = structuredClone([day, day]);
  assert.equal(both[0], both[1]);
  assert.equal(structuredClone(new Uint8Array([1, 2]).buffer).byteLength, 2);
});

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the inline script the pages get fills them in where missing and leaves no names behind', async () => {
  const { polyfillsScript } = await import('../polyfillsFirst.ts');
  const script = await polyfillsScript();
  const page = vm.createContext({ AbortSignal, DOMException });
  vm.runInContext('delete Object.hasOwn; delete Array.prototype.findLast; delete Array.prototype.toSorted; var before = Object.getOwnPropertyNames(globalThis).length;', page);
  vm.runInContext(script, page);
  assert.equal(vm.runInContext('Object.hasOwn({ a: 1 }, "a") && [1, 2].findLast((n) => n < 2) === 1 && [2, 1].toSorted()[0] === 1', page), true);
  assert.equal(vm.runInContext('Object.getOwnPropertyNames(globalThis).length - before', page), 1, 'only structuredClone, which a bare context lacks');
});

test('the pages run it before any module, and the CSP lets it run by its hash', () => {
  const config = read('vite.config.ts');
  assert.match(config, /polyfillsFirst\(\), csp\(env\)/);
  assert.match(config, /content="\$\{policy\(await polyfillsScript\(\)\)\}"/);
  assert.match(config, /script-src 'self' 'sha256-\$\{createHash\('sha256'\)\.update\(inline\)/);
  // Run as a script, so nothing to import or export, and no module imports it as well.
  assert.doesNotMatch(read('src/lib/polyfills.ts'), /^(import|export) /m);
  for (const entry of ['src/main.ts', 'src/statsPage/main.ts']) assert.doesNotMatch(read(entry), /^import .*polyfills/m, entry);
});

/** The game's own code (not the dev pages, which only run in a current browser). */
const GAME = ['src/components', 'src/lib', 'src/legal', 'src/statsPage'];
/** Built-ins newer than Chrome 92 and the version that brought them; those filled in are left out. */
const NEWER: [RegExp, string][] = [
  // (Called or not: a method passed along is as missing.)
  [/\.(toReversed|toSpliced)\b/, 'Chrome 110'],
  [/\b(Object|Map)\.groupBy\b/, 'Chrome 117'],
  [/\bPromise\.withResolvers\b/, 'Chrome 119'],
  [/\bArray\.fromAsync\b/, 'Chrome 121'],
  // (These names are common enough elsewhere that only a call counts.)
  [/\.(union|intersection|difference)\(/, 'Chrome 122'],
  [/\.(symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\b/, 'Chrome 122'],
  [/\.(isWellFormed|toWellFormed)\b/, 'Chrome 111'],
  [/\bAbortSignal\.(timeout|any)\b/, 'Chrome 103 and 116'],
  [/\bURL\.(canParse|parse)\(/, 'Chrome 120 and 126'],
  [/\b(Promise\.try|RegExp\.escape|Iterator\.from)\b/, 'Chrome 128 on'],
  [/\.checkVisibility\b/, 'Chrome 105'],
];

test('the game calls no built-in newer than Chrome 92 that is not filled in', () => {
  const files = (dir: string): string[] =>
    readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(`${dir}/${e.name}`) : /\.(ts|svelte)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
    );
  const found: string[] = [];
  for (const file of [...GAME.flatMap(files), 'src/main.ts', 'src/App.svelte', 'src/Root.svelte'])
    read(file)
      .split('\n')
      .forEach((line, i) => {
        for (const [api, since] of NEWER) if (api.test(line)) found.push(`${file}:${i + 1} needs ${since}: fill it in src/lib/polyfills.ts or use an older way`);
      });
  assert.deepEqual(found, []);
});
