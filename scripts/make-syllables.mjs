// Builds src/data/syllables.json, every item's name split into syllables, for
// the Wraeclast run's Inscription (src/wraeclast): the player builds a name
// from the shuffled syllables of the names on the board.
//
// Each name is a list of its words, each word a list of its syllables, so the
// name rebuilds as the syllables joined within a word and the words joined
// with a space (tests/syllables.test.ts checks every one does, and that the
// file is what this script makes).
// - Short words (4 letters or fewer: "of", "the", "Ahn") and possessives
//   ("Voll's", "Atziri's", "Brutus'") stay whole.
// - A word that is two English words splits between them, each part whole:
//   Black / heart, Bramble / jack. The parts come from SCOWL's word lists
//   (wordlist-english), common words only. A coined word may split anywhere
//   both parts are words of 3 letters or more; a word that is a word of its
//   own only where both parts have 4 or more (Head / hunter, but not
//   Pass / ion or Con / tempt).
// - The rest is hyphenated with Liang's English patterns (the hyphen
//   package), a lone consonant it leaves joined to the syllable before it.
// - A hyphen stays on the part before it: Knight- / errant.
// Run: node scripts/make-syllables.mjs (after npm run fetch-data)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
/** @type {(text: string, options: { hyphenChar: string }) => string} */
const hyphenateSync = require('hyphen/en-us').hyphenateSync;

const ITEMS = new URL('../src/data/items.json', import.meta.url);
const OUT = new URL('../src/data/syllables.json', import.meta.url);

// SCOWL's sizes up to 50 are its common words; past that come rare and archaic ones.
const SIZES = [10, 20, 35, 40, 50];
/** Each word's SCOWL size (smaller is more common), lower case. @type {Map<string, number>} */
const sizeOf = new Map();
for (const size of SIZES) {
  for (const variant of ['english', 'american', 'british']) {
    for (const w of /** @type {string[]} */ (require(`wordlist-english/${variant}-words-${size}.json`))) {
      const k = w.toLowerCase();
      if (!sizeOf.has(k)) sizeOf.set(k, size);
    }
  }
}

/** @param {string} s */
const isWord = (s) => sizeOf.has(s.toLowerCase());
/** @param {string} s */
const sizeOfWord = (s) => sizeOf.get(s.toLowerCase()) ?? Infinity;
/** @param {string} word */
const possessive = (word) => /['’]s?$/.test(word);

/** Whether one rank comes before another, element by element. @param {number[]} a @param {number[]} b */
function less(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/**
 * Where a word splits into two English words, or null. Of several splits the
 * one whose first part isn't a plural wins (Oak / sworn, not Oaks / worn),
 * then the commoner parts, then the shorter first part.
 * @param {string} word
 * @returns {string[] | null}
 */
function compoundOf(word) {
  const min = isWord(word) ? 4 : 3;
  /** @type {{ parts: string[], rank: number[] } | null} */
  let best = null;
  for (let i = min; i <= word.length - min; i++) {
    const a = word.slice(0, i);
    const b = word.slice(i);
    if (!/^\p{L}+$/u.test(a) || !/^\p{L}+$/u.test(b) || !isWord(a) || !isWord(b)) continue;
    const plural = /s$/i.test(a) && isWord(a.slice(0, -1)) ? 1 : 0;
    const rank = [plural, Math.max(sizeOfWord(a), sizeOfWord(b)), i];
    if (!best || less(rank, best.rank)) best = { parts: [a, b], rank };
  }
  return best?.parts ?? null;
}

/**
 * A lone consonant, which the patterns leave now and then (Dei / d / bell),
 * is no syllable: it joins the one before it.
 * @param {string[]} parts
 */
function joinLoneConsonants(parts) {
  /** @type {string[]} */
  const out = [];
  for (const p of parts) {
    if (out.length && /^[^aeiouy]$/i.test(p)) out[out.length - 1] += p;
    else out.push(p);
  }
  return out;
}

/** One word (no spaces, no hyphens) as its syllables. @param {string} word */
function piece(word) {
  if (word.length <= 4 || possessive(word)) return [word];
  const parts = compoundOf(word);
  if (parts) return parts;
  return joinLoneConsonants(hyphenateSync(word, { hyphenChar: '|' }).split('|'));
}

/** One word of a name as its syllables: a hyphenated word's halves each split on their own. @param {string} word */
function wordSyllables(word) {
  return word
    .split(/(?<=-)/)
    .flatMap(piece)
    .filter((s) => s !== '');
}

/**
 * A name as its words, each word as its syllables.
 * @param {string} name
 * @returns {string[][]}
 */
export function syllablesOf(name) {
  return name.split(' ').map(wordSyllables);
}

/**
 * The whole file for these items, as this script writes it.
 * @param {{ id: string, name: string }[]} items
 */
export function syllablesFile(items) {
  const lines = items.map((item) => `  ${JSON.stringify(item.id)}: ${JSON.stringify(syllablesOf(item.name))}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const items = JSON.parse(readFileSync(ITEMS, 'utf8'));
  writeFileSync(OUT, syllablesFile(items));
  console.log(`Wrote ${items.length} names to src/data/syllables.json.`);
}
