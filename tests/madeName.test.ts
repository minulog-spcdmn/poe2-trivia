import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMPOUND_SHARE, MADE_FIRST, MADE_PREFIX, MADE_SECOND, MADE_SUFFIX, ensureName, isMadeName, makeName, remakeName } from '../src/lib/madeName.ts';
import { MAX_NAME, MIN_NAME, cleanName, nameProblem, nameSkeleton, nameUsable } from '../src/lib/names.ts';
import { readStored, writeStored } from '../src/lib/storage.ts';
import { CLASSES } from '../src/lib/classSigils.ts';
import { memoryStorage } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);
beforeEach(() => store.clear());

const items = (JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8')) as { name: string }[]).map((it) => it.name.toLowerCase());
const pairs = MADE_FIRST.flatMap((a) => MADE_SECOND.map((b) => `${a} ${b}`));
const compounds = MADE_PREFIX.flatMap((a) => MADE_SUFFIX.map((b) => a + b));
const every = [...pairs, ...compounds];
const words = [...MADE_FIRST, ...MADE_SECOND, ...MADE_PREFIX, ...MADE_SUFFIX];
/** A run of given draws, then the last again. */
const draws = (...r: number[]) => () => (r.length > 1 ? r.shift()! : r[0]);

test('every name the lists make passes the name checks and fits', () => {
  for (const name of every) {
    assert.equal(cleanName(name), name, name);
    assert.equal(nameProblem(name, []), null, name);
    assert.ok(nameUsable(name), name);
    assert.ok(name.length >= MIN_NAME && name.length <= MAX_NAME, `${name}: ${name.length} letters`);
  }
});

test('no made name, nor a word of one, is a unique’s name', () => {
  const uniques = new Set(items);
  for (const word of words) assert.ok(!uniques.has(word.toLowerCase()), word);
  for (const name of every) assert.ok(!uniques.has(name.toLowerCase()) && !uniques.has(`the ${name.toLowerCase()}`), name);
});

// The classes a sigil can show, and the ascendancies: a name made of one would seem to claim it (or clash with the sigil worn).
const ASCENDANCIES = ['titan', 'warbringer', 'smith of kitava', 'deadeye', 'pathfinder', 'amazon', 'ritualist', 'stormweaver', 'chronomancer', 'infernalist', 'blood mage', 'lich', 'tactician', 'gemling legionnaire', 'witchhunter', 'invoker', 'acolyte of chayula', 'oracle', 'shaman', 'raider', 'warden', 'gladiator', 'assassin', 'disciple of varashta', 'spirit walker', 'martial artist'];
test('no made word is a class or an ascendancy, nor its start', () => {
  const stems = [...CLASSES, ...ASCENDANCIES].map((c) => c.split(' ')[0].slice(0, 6));
  for (const word of [...words, ...compounds]) {
    const w = word.toLowerCase();
    assert.ok(!stems.some((c) => w.startsWith(c) || c.startsWith(w.slice(0, 6))), word);
  }
});

test('the lists make 3778 names, none like another', () => {
  assert.equal(new Set(MADE_FIRST).size, 54);
  assert.equal(new Set(MADE_SECOND).size, 67);
  assert.equal(new Set(MADE_PREFIX).size, 20);
  assert.equal(new Set(MADE_SUFFIX).size, 8);
  assert.equal(new Set(every.map(nameSkeleton)).size, every.length);
});

test('a single-word name reads as one: no letter doubled where its halves meet, no start that is a first word (Iron + keeper)', () => {
  for (const a of MADE_PREFIX) {
    assert.ok(!MADE_FIRST.includes(a), a);
    for (const b of MADE_SUFFIX) assert.notEqual(a.at(-1)!.toLowerCase(), b[0], a + b);
  }
});

test('a name is made from both ends of the lists, a single word about one time in twelve', () => {
  assert.equal(makeName(draws(0.5, 0)), `${MADE_FIRST[0]} ${MADE_SECOND[0]}`);
  assert.equal(makeName(draws(0.999999)), `${MADE_FIRST.at(-1)} ${MADE_SECOND.at(-1)}`);
  assert.equal(makeName(draws(0, 0)), MADE_PREFIX[0] + MADE_SUFFIX[0]);
  assert.equal(makeName(draws(0, 0.999999)), MADE_PREFIX.at(-1)! + MADE_SUFFIX.at(-1)!);
  assert.equal(COMPOUND_SHARE, 1 / 12);
  // The browser's own randomness: 24000 names, about 2000 single words (four standard deviations either way).
  const all = new Set(every);
  let one = 0;
  for (let i = 0; i < 24000; i++) {
    const name = makeName();
    assert.ok(all.has(name), name);
    if (!name.includes(' ')) one++;
  }
  assert.ok(Math.abs(one - 2000) < 4 * Math.sqrt(24000 * (1 / 12) * (11 / 12)), `${one} single words in 24000`);
});

test('a browser without a name is given a made one, kept as made; a name it has stays', () => {
  ensureName();
  const made = readStored('name');
  assert.ok(made && every.includes(made));
  assert.ok(isMadeName(made));
  ensureName();
  assert.equal(readStored('name'), made, 'made once');
  writeStored('name', 'Kalguur');
  assert.ok(!isMadeName('Kalguur'), 'renamed: chosen now');
  store.clear();
  writeStored('name', 'Doryani');
  ensureName();
  assert.equal(readStored('name'), 'Doryani');
  assert.ok(!isMadeName('Doryani'));
});

test('a made name a room found taken gives way to another, saved; a chosen one stays', () => {
  ensureName();
  const made = readStored('name')!;
  const next = remakeName(made);
  assert.ok(next && every.includes(next) && nameSkeleton(next) !== nameSkeleton(made));
  assert.equal(readStored('name'), next);
  assert.ok(isMadeName(next), 'still a made name, never sent by sync');
  writeStored('name', 'Kalguur');
  assert.equal(remakeName(next), null);
  assert.equal(readStored('name'), 'Kalguur');
  assert.equal(remakeName('Kalguur'), null);
});
