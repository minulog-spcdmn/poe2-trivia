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

test('a picture still on its way is never let go, so it is never asked for twice', async () => {
  const cache = new Map<string, Promise<string>>();
  const calls: string[] = [];
  const waiting: (() => void)[] = [];
  const slow = (src: string) => (calls.push(src), new Promise<string>((r) => waiting.push(() => r(`pic:${src}`))));
  for (const src of ['a', 'b', 'c', 'd']) void loadOnce(cache, src, slow, 2);
  // All four still on their way: kept, over the two.
  assert.deepEqual([...cache.keys()], ['a', 'b', 'c', 'd']);
  void loadOnce(cache, 'a', slow, 2);
  assert.deepEqual(calls, ['a', 'b', 'c', 'd']);
  waiting.forEach((w) => w());
  await Promise.all(cache.values());
  // Come in, the oldest go as the next is asked for.
  await loadOnce(cache, 'e', async (src) => `pic:${src}`, 2);
  assert.deepEqual([...cache.keys()], ['a', 'e']);
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

test('the backdrop gives its context back when it stops', () => {
  const src = readFileSync(new URL('../src/lib/backdrop.ts', import.meta.url), 'utf8');
  // (Unless the context is already lost, and to be given back by the browser.)
  const stop = src.slice(src.indexOf('  function stop(dead = false) {'), src.indexOf('  function lost() {'));
  assert.match(stop, /if \(!dead\) letGo\(gl!?\);/);
});
