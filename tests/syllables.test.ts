import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';
import { syllablesFile } from '../scripts/make-syllables.mjs';

// The Wraeclast run's syllables (scripts/make-syllables.mjs): every name split
// so the Inscription can rebuild it.
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

test('every name rebuilds exactly from its syllables, the words joined by a space', () => {
  const wrong = items.filter((it) => syllables[it.id].map((w) => w.join('')).join(' ') !== it.name);
  assert.deepEqual(
    wrong.map((it) => `${it.name}: ${JSON.stringify(syllables[it.id])}`),
    [],
  );
});

test('no syllable is empty or holds a space, and no word is without one', () => {
  const bad: string[] = [];
  for (const [id, words] of Object.entries(syllables)) {
    if (!words.length) bad.push(`${id}: no words`);
    for (const word of words) {
      if (!word.length) bad.push(`${id}: an empty word`);
      for (const s of word) if (!s.trim() || /\s/.test(s)) bad.push(`${id}: ${JSON.stringify(s)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('small words and possessives stay whole, and compounds split between their words', () => {
  const byName = new Map(items.map((it) => [it.name, syllables[it.id]]));
  assert.deepEqual(byName.get("Voll's Protector")?.[0], ["Voll's"]);
  assert.deepEqual(byName.get("Atziri's Splendour")?.[0], ["Atziri's"]);
  assert.deepEqual(byName.get('Belly of the Beast')?.slice(1, 3), [['of'], ['the']]);
  assert.deepEqual(byName.get('Blackheart'), [['Black', 'heart']]);
  assert.deepEqual(byName.get('Bramblejack'), [['Bramble', 'jack']]);
});
