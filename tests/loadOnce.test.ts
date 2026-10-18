import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadOnce } from '../src/lib/loadOnce.ts';

/** A load that counts its calls and answers with its picture's name. */
function counted() {
  const calls: string[] = [];
  return { calls, load: async (src: string) => (calls.push(src), `pic:${src}`) };
}

test('a picture asked for twice is loaded once', async () => {
  const cache = new Map<string, Promise<string>>();
  const { calls, load } = counted();
  const a = loadOnce(cache, 'a', load);
  assert.equal(loadOnce(cache, 'a', load), a);
  assert.equal(await a, 'pic:a');
  assert.deepEqual(calls, ['a']);
});

test('the cache keeps only the latest asked for, however many games are played', async () => {
  const cache = new Map<string, Promise<string>>();
  const { calls, load } = counted();
  for (let i = 0; i < 500; i++) await loadOnce(cache, `p${i}`, load, 40);
  assert.equal(cache.size, 40);
  assert.deepEqual([...cache.keys()], Array.from({ length: 40 }, (_, i) => `p${460 + i}`));
  assert.equal(calls.length, 500);
});

test('a picture asked for again is the last to go', async () => {
  const cache = new Map<string, Promise<string>>();
  const { calls, load } = counted();
  for (const src of ['a', 'b', 'c']) await loadOnce(cache, src, load, 3);
  await loadOnce(cache, 'a', load, 3);
  await loadOnce(cache, 'd', load, 3);
  assert.deepEqual([...cache.keys()], ['c', 'a', 'd']);
  assert.deepEqual(calls, ['a', 'b', 'c', 'd']);
});

test('a hiccup is tried again; a picture that never loads is let go, to be tried afresh', async () => {
  const cache = new Map<string, Promise<string>>();
  let fails = 1;
  const flaky = async (src: string) => {
    if (fails-- > 0) throw new Error('dropped');
    return `pic:${src}`;
  };
  assert.equal(await loadOnce(cache, 'a', flaky, 40, 0), 'pic:a');

  let tries = 0;
  const gone = async () => {
    tries++;
    throw new Error('gone');
  };
  await assert.rejects(loadOnce(cache, 'b', gone, 40, 0));
  assert.equal(tries, 3);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('a'), true);
});

test('on a touch screen the circles’ glow holds still, so a ring is one layer, not three', () => {
  const css = readFileSync(new URL('../src/components/ArcaneStage.svelte', import.meta.url), 'utf8');
  const coarse = css.match(/@media \(pointer: coarse\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.match(coarse, /:global\(\.glow\)\s*\{[^}]*animation:\s*none/);
});

test('the backdrop gives its context back when it stops', () => {
  const src = readFileSync(new URL('../src/lib/backdrop.ts', import.meta.url), 'utf8');
  const stop = src.slice(src.indexOf('  function stop() {'), src.indexOf('  // A lost context stays lost'));
  assert.match(stop, /letGo\(gl!?\);/);
});
