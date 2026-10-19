import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';
import { cluesFile } from '../scripts/make-clues.mjs';

// The Wraeclast run's clues (scripts/make-clues.mjs): what its supplies and
// zones reveal, with every word of the item's own name masked.
const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
type Clues = { req: string[]; mods: [string, string][]; flavor: string | null };
const raw = readFileSync(new URL('../src/data/clues.json', import.meta.url), 'utf8');
const clues: Record<string, Clues> = JSON.parse(raw);
const stats = JSON.parse(readFileSync(new URL('../src/data/itemStats.json', import.meta.url), 'utf8'));

test('the file is what its script makes from the tooltips, never edited by hand (node scripts/make-clues.mjs)', () => {
  assert.ok(raw === cluesFile(items, stats), 'src/data/clues.json is out of date or edited by hand; run node scripts/make-clues.mjs');
});

const MASK = '▮▮▮';
const SMALL = new Set(['of', 'the', 'and']);
/** A clue as it reads: colour marks ({w|65}) off. */
const plain = (text: string) => text.replace(/\{[a-z]\|([^{}|]*)\}/g, '$1');
const allText = (c: Clues) => [...c.req, ...c.mods.map(([, t]) => t), ...(c.flavor === null ? [] : [c.flavor])];

test('every item has its clues, and only items do (node scripts/make-clues.mjs)', () => {
  assert.deepEqual(
    items.filter((it) => !clues[it.id]).map((it) => it.name),
    [],
  );
  const ids = new Set(items.map((it) => it.id));
  assert.deepEqual(
    Object.keys(clues).filter((id) => !ids.has(id)),
    [],
  );
});

test('no clue shows a word of its own item name, in any form', () => {
  const leaks: string[] = [];
  for (const it of items) {
    const words = it.name
      .split(/[\s-]+/)
      .map((w) => w.replace(/['’]s?$/, ''))
      .filter((w) => [...w].length >= 3 && !SMALL.has(w.toLowerCase()));
    for (const text of allText(clues[it.id])) {
      for (const w of words) {
        const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const form = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?:s|es)?(?:['’]s?)?(?![\\p{L}\\p{N}])`, 'iu');
        if (form.test(plain(text))) leaks.push(`${it.name}: "${w}" in ${JSON.stringify(text)}`);
      }
    }
  }
  assert.deepEqual(leaks, []);
});

test('the mask is one width whatever the word, and stands alone', () => {
  const bad: string[] = [];
  for (const [id, c] of Object.entries(clues))
    for (const text of allText(c)) {
      // Never a longer or shorter run of mask marks, and never glued to letters (which would leak a word's ending).
      for (const m of text.matchAll(/[\p{L}\p{N}]*▮+[\p{L}\p{N}]*/gu)) if (m[0] !== MASK) bad.push(`${id}: ${m[0]}`);
    }
  assert.deepEqual(bad, []);
});

test('the clues hold what each kind of item has', () => {
  const bad: string[] = [];
  for (const it of items) {
    const c = clues[it.id];
    if (!c.req.length) bad.push(`${it.name}: no requirements`);
    if (c.flavor === null) bad.push(`${it.name}: no flavour text`);
    for (const [kind, text] of c.mods) {
      if (!text.trim()) bad.push(`${it.name}: an empty mod line`);
      // Placeholders and the wiki's leaked stat ids stay out.
      for (const line of text.split('\n')) if (/^\[[^\]]*\]$/.test(line.trim()) || /\bhidden\b.*\[\d+\]$/.test(line)) bad.push(`${it.name}: ${line}`);
      if (!(it.kind === 'gem' ? 'pdet' : 'ie').includes(kind)) bad.push(`${it.name}: a ${kind} line`);
    }
    // A gem's Category line comes first, as the tooltip shows it.
    if (it.kind === 'gem' && !c.mods[0]?.[1].startsWith('Category:')) bad.push(`${it.name}: no Category line first`);
  }
  assert.deepEqual(bad, []);
});

test('a gem whose Category repeats its name has it masked', () => {
  const byName = new Map(items.map((it) => [it.name, clues[it.id]]));
  assert.equal(byName.get("Ailith's Chimes")?.mods[0][1], `Category: {w|${MASK} ${MASK}}`);
  assert.equal(byName.get("Dominus' Grasp")?.mods[0][1], `Category: {w|${MASK} ${MASK}}`);
});
