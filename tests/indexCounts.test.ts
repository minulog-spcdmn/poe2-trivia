// index.html's numbers (the description, the JSON-LD and the noscript a
// crawler reads) are typed in by hand. Held to the game's own here, so a data
// refresh that changes one (npm run fetch-data after a patch adds uniques)
// fails until the page says the new number.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { items } from './helpers.ts';
import { ACHIEVEMENTS } from '../src/lib/achievements.ts';
import { DELVE_LIVES } from '../src/lib/delve.ts';
import { MAX_PLAYERS } from '../src/lib/game.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];

/** Every number the pattern's first group catches, as a number (digits or a word). */
const all = (re: RegExp) => [...html.matchAll(re)].map((m) => (/^\d+$/.test(m[1]) ? Number(m[1]) : WORDS.indexOf(m[1].toLowerCase())));

test('index.html counts the items the game has', () => {
  const said = all(/(\d+) uniques and lineage gems/g);
  assert.ok(said.length >= 3, 'the description, the JSON-LD and the noscript each say how many');
  for (const n of said) assert.equal(n, items.length);
});

test('index.html counts the achievements the game has', () => {
  const said = all(/(\d+) achievements/g);
  assert.ok(said.length >= 1);
  for (const n of said) assert.equal(n, ACHIEVEMENTS.length);
});

test('index.html gives the room size and the lives the game has', () => {
  const friends = all(/up to (\w+) friends/gi);
  assert.ok(friends.length >= 1);
  for (const n of friends) assert.equal(n, MAX_PLAYERS - 1);
  assert.deepEqual(all(/"maxValue":(\d+)/g), [MAX_PLAYERS]);
  const lives = all(/with (\w+) lives/g);
  assert.ok(lives.length >= 1);
  for (const n of lives) assert.equal(n, DELVE_LIVES);
});

test('index.html’s JSON-LD parses', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  assert.doesNotThrow(() => JSON.parse(blocks[0][1]));
});
