import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, initialOf, isHeldName, nameProblem, nameSkeleton } from '../src/lib/names.ts';
import { offensive } from '../src/lib/offensive.ts';

test("a name's initial is its first letter, capitalised, whole even when it takes two code units", () => {
  assert.equal(initialOf('kalguur'), 'K');
  assert.equal(initialOf('  una of the vaal'), 'U');
  assert.equal(initialOf('ölmo'), 'Ö');
  assert.equal(initialOf('𝓗ost'), '𝓗', 'a letter outside the BMP stays whole');
  assert.equal(initialOf(''), '');
  assert.equal(initialOf('   '), '');
});

test('look-alike letters from any script count as the Latin letters they pass for', () => {
  // Cherokee, Lisu, Latin small capitals, Cyrillic, Greek.
  for (const fake of ['Ꮓoe Arcana', 'ꓜoe Arcana', 'ᴢoe ᴀrcana', 'Zое Аrcana', 'Ζoe Arcana']) assert.ok(isHeldName(fake), fake);
  assert.equal(nameSkeleton('Ᏼob'), nameSkeleton('Bob'));
  assert.equal(nameSkeleton('ʙob'), nameSkeleton('Bob'));
  // The hand-picked look-alikes still win over Unicode's list where both have one.
  assert.equal(nameSkeleton('νoid'), nameSkeleton('Void'));
  assert.equal(nameSkeleton('ηova'), nameSkeleton('Nova'));
  assert.match(nameProblem('Ᏼob', ['Bob']) ?? '', /looks too much like/);
  // Names of their own in other scripts stay theirs, told apart by their own letters.
  assert.equal(nameProblem('Мария', ['Bob']), null);
  assert.equal(nameProblem('さくら', ['Bob']), null);
  assert.equal(nameProblem('هاني', ['هادي']), null);
  assert.equal(nameProblem('حامد', ['דוד']), null);
  assert.match(nameProblem('هادي', ['هادي']) ?? '', /looks too much like/);
  // Modifier letters draw as signs (a tatweel, an apostrophe), and some letters as a stroke: none make another name.
  for (const fake of ['zoeـarcana', 'zoe_arcanaʼ', 'zoe一arcana', 'zoeㅡarcana']) assert.ok(isHeldName(fake), fake);
  assert.match(nameProblem('Boـb', ['Bob']) ?? '', /looks too much like/);
});

test('characters that draw nothing, or many letters wide, are taken out of a name', () => {
  // Two Hangul fillers (U+3164, which NFKC makes U+1160): letters to the regex, blank on screen.
  assert.equal(cleanName('\u3164\u3164'), '');
  assert.equal(cleanName('\u115F\u1160\uFFA0'), '');
  assert.equal(cleanName('\u2800\u2800'), '');
  assert.equal(cleanName('Bob\u3164'), 'Bob');
  assert.equal(cleanName('\uFDFD'.repeat(20)), '');
  assert.equal(cleanName('ab\u{12219}\u{12219}'), 'ab');
});

test('the word filter sees through look-alike letters too', () => {
  assert.ok(offensive('nigger'));
  assert.ok(offensive('nіggеr'), 'Cyrillic і and е');
  assert.ok(offensive('ɴigger'), 'a Latin small capital');
  assert.equal(offensive('Zoe Arcana'), false);
});
