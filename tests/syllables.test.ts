import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';
import { syllablesFile } from '../scripts/make-syllables.mjs';

// The Wraeclast run's syllables (scripts/make-syllables.mjs): every name split,
// lower case, so the Inscription can rebuild it, and no tile a whole word but
// "of", "the" and "and".
const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const raw = readFileSync(new URL('../src/data/syllables.json', import.meta.url), 'utf8');
const syllables: Record<string, string[][]> = JSON.parse(raw);

test('the file is what its script makes, never edited by hand (node scripts/make-syllables.mjs)', () => {
  assert.ok(raw === syllablesFile(items), 'src/data/syllables.json is out of date or edited by hand; run node scripts/make-syllables.mjs');
});

test('every item has its syllables, and only items do (node scripts/make-syllables.mjs)', () => {
  assert.deepEqual(
    items.filter((it) => !syllables[it.id]).map((it) => it.name),
    [],
  );
  const ids = new Set(items.map((it) => it.id));
  assert.deepEqual(
    Object.keys(syllables).filter((id) => !ids.has(id)),
    [],
  );
});

test('every name rebuilds exactly from its syllables, the words joined by a space (in lower case)', () => {
  const wrong = items.filter((it) => syllables[it.id].map((w) => w.join('')).join(' ') !== it.name.toLowerCase());
  assert.deepEqual(
    wrong.map((it) => `${it.name}: ${JSON.stringify(syllables[it.id])}`),
    [],
  );
});

test('no syllable is empty, holds a space or a capital, and no word is without one', () => {
  const bad: string[] = [];
  for (const [id, words] of Object.entries(syllables)) {
    if (!words.length) bad.push(`${id}: no words`);
    for (const word of words) {
      if (!word.length) bad.push(`${id}: an empty word`);
      for (const s of word) if (!s.trim() || /\s/.test(s) || s !== s.toLowerCase()) bad.push(`${id}: ${JSON.stringify(s)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("no tile is a whole word but 'of', 'the' and 'and' (a word of one letter can't split)", () => {
  const whole = items.flatMap((it) =>
    syllables[it.id].filter((w) => w.length === 1 && !['of', 'the', 'and'].includes(w[0]) && w[0].replace(/\P{L}/gu, '').length > 1).map((w) => `${it.name}: ${w[0]}`),
  );
  assert.deepEqual(whole, []);
});

test('the small words stay whole, possessives keep their mark, compounds split between their words and then by syllable', () => {
  const byName = new Map(items.map((it) => [it.name, syllables[it.id]]));
  assert.deepEqual(byName.get('Belly of the Beast'), [['bel', 'ly'], ['of'], ['the'], ['b', 'east']]);
  assert.deepEqual(byName.get("Voll's Protector")?.[0], ['v', "oll's"]);
  assert.deepEqual(byName.get("Berek's Grip"), [['be', "rek's"], ['gr', 'ip']]);
  assert.deepEqual(byName.get('Blistering Bond')?.[1], ['b', 'ond']);
  assert.deepEqual(byName.get('Blackheart'), [['bl', 'ack', 'h', 'eart']]);
  assert.deepEqual(byName.get('Bramblejack'), [['bram', 'ble', 'j', 'ack']]);
  // Words that only look like two are left to the patterns.
  assert.deepEqual(byName.get('Bursting Decay')?.[0], ['burst', 'ing']);
  assert.deepEqual(byName.get('The Burrower')?.[1], ['bur', 'row', 'er']);
  // A word the patterns leave whole splits between its vowels.
  assert.deepEqual(byName.get('Kaltenhalt'), [['kal', 'ten', 'halt']]);
  assert.deepEqual(byName.get('Svalinn'), [['sva', 'linn']]);
});
