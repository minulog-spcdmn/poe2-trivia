import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';
import { fakeSyllablesFile, syllablesFile } from '../scripts/make-syllables.mjs';

// The Wraeclast run's tiles (scripts/make-syllables.mjs): every name split,
// lower case, so the Inscription can rebuild it, each tile 2 to 5 letters
// (but the o' of Cat O' Nine Tails), and the made-up names split the same way.
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

test("no tile holds a single letter, but the one word of one letter (Cat O' Nine Tails' o')", () => {
  const ones = items.flatMap((it) => syllables[it.id].flat().filter((s) => [...s.replace(/(?:['’]s?|-)$/, '')].length < 2).map((s) => `${it.name}: ${s}`));
  assert.deepEqual(ones, ["Cat O' Nine Tails: o'"]);
});

test("no tile is longer than 5 letters, not counting a trailing 's, ' or hyphen, and few reach 5", () => {
  const len = (s: string) => [...s.replace(/(?:['’]s?|-)$/, '')].length;
  const tiles = items.flatMap((it) => syllables[it.id].flat());
  assert.deepEqual(
    items.flatMap((it) => syllables[it.id].flat().filter((s) => len(s) > 5).map((s) => `${it.name}: ${s}`)),
    [],
  );
  assert.ok(tiles.filter((s) => len(s) === 5).length < tiles.length * 0.15);
});

test('names take fewer tiles than syllables: mostly 3 or 4', () => {
  const counts = items.map((it) => syllables[it.id].flat().length);
  const share = (f: (n: number) => boolean) => counts.filter(f).length / counts.length;
  assert.ok(share((n) => n === 3 || n === 4) > 0.6, `${share((n) => n === 3 || n === 4)}`);
  assert.ok(share((n) => n > 6) < 0.03);
});

test('syllables too short join, and a lone letter goes with its neighbour', () => {
  const byName = new Map(items.map((it) => [it.name, syllables[it.id]]));
  assert.deepEqual(byName.get('Amor Mandragora'), [['amor'], ['man', 'dra', 'gora']]);
  assert.deepEqual(byName.get('Mask of the Sanguimancer')?.[3], ['san', 'gui', 'man', 'cer']);
  assert.deepEqual(byName.get('Olrovasara'), [['ol', 'rova', 'sara']]);
  // The mark stays on the last tile and isn't counted: ae / ris / vane's.
  assert.deepEqual(byName.get("Aerisvane's Wings")?.[0], ['ae', 'ris', "vane's"]);
  assert.deepEqual(byName.get("Voll's Protector")?.[0], ["voll's"]);
  assert.deepEqual(byName.get("Berek's Grip"), [['be', "rek's"], ['grip']]);
  assert.deepEqual(byName.get('Blistering Bond')?.[1], ['bond']);
});

test('the small words stay whole, and compounds split between their words', () => {
  const byName = new Map(items.map((it) => [it.name, syllables[it.id]]));
  assert.deepEqual(byName.get('Belly of the Beast'), [['bel', 'ly'], ['of'], ['the'], ['beast']]);
  assert.deepEqual(byName.get('Blackheart'), [['black', 'heart']]);
  assert.deepEqual(byName.get('Bramblejack'), [['bram', 'ble', 'jack']]);
  assert.deepEqual(byName.get('The Burrower')?.[1], ['bur', 'row', 'er']);
  assert.deepEqual(byName.get('Kaltenhalt'), [['kal', 'ten', 'halt']]);
  assert.deepEqual(byName.get('Svalinn'), [['sva', 'linn']]);
});

test("the made-up names are split the same way, each rebuilding (node scripts/make-syllables.mjs)", () => {
  const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));
  const raw = readFileSync(new URL('../src/data/fakeSyllables.json', import.meta.url), 'utf8');
  assert.ok(raw === fakeSyllablesFile(fakes), 'src/data/fakeSyllables.json is out of date or edited by hand; run node scripts/make-syllables.mjs');
  const split: Record<string, string[][]> = JSON.parse(raw);
  const names = [...new Set(Object.values(fakes).flat())];
  assert.deepEqual(names.filter((n) => split[n]?.map((w) => w.join('')).join(' ') !== n.toLowerCase()), []);
});
