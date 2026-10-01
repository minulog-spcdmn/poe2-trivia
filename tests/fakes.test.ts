import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

/** Letters only, without accents or case: "Oisín's Oath" → "oisinsoath". */
const letters = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = row;
  }
  return prev[b.length];
}

/** Fewer changed letters than this and a quick glance could take the fake for a real item. */
const MIN_DISTANCE = 3;

test('every item has two fake names, and every entry is a current item', () => {
  const names = new Set(items.map((it) => it.name));
  assert.deepEqual(items.filter((it) => !fakes[it.name]?.length).map((it) => it.name), [], 'items without fakes');
  assert.deepEqual(Object.keys(fakes).filter((name) => !names.has(name)), [], 'fakes for items that no longer exist');
  for (const [name, list] of Object.entries(fakes)) assert.equal(list.length, 2, name);
});

test('fake names are never real, never repeated, and never a letter or two from a real name', () => {
  const real = items.map((it) => letters(it.name));
  const seen = new Map<string, string>();
  const bad: string[] = [];
  for (const [name, list] of Object.entries(fakes)) {
    for (const fake of list) {
      const f = letters(fake);
      if (fake !== fake.trim() || !f) bad.push(`${name}: "${fake}" is blank or padded`);
      const near = real.find((r) => distance(r, f) < MIN_DISTANCE);
      if (near) bad.push(`${name}: "${fake}" is too close to a real name`);
      if (seen.has(f)) bad.push(`${name}: "${fake}" is also a fake for ${seen.get(f)}`);
      seen.set(f, name);
    }
  }
  assert.deepEqual(bad, []);
});
