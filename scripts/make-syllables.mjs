// Builds src/data/syllables.json, every item's name split into syllables, for
// the Wraeclast run's Inscription (src/wraeclast): the player builds a name
// from the shuffled syllables of the names on the board.
//
// Each name is a list of its words, each word a list of its syllables, all
// lower case, so the name rebuilds (in lower case) as the syllables joined
// within a word and the words joined with a space; the word boundaries are
// what the answer line's spacing and the Word lengths supply read
// (tests/syllables.test.ts checks every name rebuilds, and that the file is
// what this script makes).
// - "of", "the" and "and" stay whole. No other word is a single tile.
// - A possessive keeps its mark on its last syllable (v / oll's).
// - A word that is two English words splits between them first: black /
//   heart. The parts come from SCOWL's word lists (wordlist-english), common
//   words only. A coined word may split anywhere both parts are words of 3
//   letters or more; a word that is a word of its own only where both parts
//   have 4 or more (Head / hunter, but not Pass / ion or Con / tempt). A few
//   words that only look like two (Burs / ting, Bur / rower) are left to the
//   patterns (NOT_COMPOUNDS).
// - Each part is then hyphenated with Liang's English patterns (the hyphen
//   package), a lone consonant it leaves joined to the syllable before it.
// - A part the patterns leave whole splits between its vowels (kal / ten /
//   halt); one of a single vowel sound splits before its vowel (gr / ip,
//   b / ond, bl / ack), or after it when it starts with one (a / sh).
// - A hyphen stays on the part before it: kn / ight- / er / rant.
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

/** Words that split into two words but aren't made of them. */
const NOT_COMPOUNDS = new Set(['bursting', 'burrower']);

/** @param {string} s */
const isWord = (s) => sizeOf.has(s.toLowerCase());
/** @param {string} s */
const sizeOfWord = (s) => sizeOf.get(s.toLowerCase()) ?? Infinity;

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
  if (NOT_COMPOUNDS.has(word.toLowerCase())) return null;
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

const VOWELS = 'aeiouyàáâäèéêëìíîïòóôöùúûü';
/** Consonant pairs that sound as one: a split goes before them, or after ck. */
const DIGRAPHS = ['ch', 'ph', 'sh', 'th', 'wh'];

/**
 * A word split between its vowels, for a one-word name the patterns leave
 * whole: one consonant between two vowels starts the next syllable
 * (Sva / linn), of two or more the last does (Kal / ten / halt), a pair that
 * sounds as one staying together. A final e after a consonant is silent
 * (E / le / vore, not E / le / vo / re).
 * @param {string} word
 */
function vowelSplit(word) {
  const w = word.toLowerCase();
  /** @param {number} i */
  const vowel = (i) => VOWELS.includes(w[i]) && !(w[i] === 'y' && i === 0) && !(w[i] === 'e' && i === w.length - 1 && i > 0 && !VOWELS.includes(w[i - 1]));
  /** Where each run of vowels starts and ends. @type {[number, number][]} */
  const groups = [];
  for (let i = 0; i < w.length; i++) {
    if (!vowel(i)) continue;
    if (groups.length && groups[groups.length - 1][1] === i) groups[groups.length - 1][1] = i + 1;
    else groups.push([i, i + 1]);
  }
  /** @type {number[]} */
  const cuts = [];
  for (let g = 1; g < groups.length; g++) {
    const from = groups[g - 1][1];
    const to = groups[g][0];
    if (to - from === 0) continue;
    let cut = to - 1;
    const pair = w.slice(to - 2, to);
    if (to - from >= 2 && DIGRAPHS.includes(pair)) cut = to - 2;
    else if (to - from >= 2 && pair === 'ck') cut = to;
    cuts.push(cut);
  }
  /** @type {string[]} */
  const out = [];
  let at = 0;
  for (const c of cuts) {
    out.push(word.slice(at, c));
    at = c;
  }
  out.push(word.slice(at));
  return out.filter((s) => s !== '');
}

/** The three small words that stay whole. */
const SMALL = new Set(['of', 'the', 'and']);

/**
 * A part of a word of one vowel sound split before its vowel (gr / ip,
 * b / ond), or after it when it starts with one (a / sh, i / ce); a part with
 * no vowel at all after its first letter.
 * @param {string} part
 */
function onsetSplit(part) {
  const w = part.toLowerCase();
  let at = [...w].findIndex((c, i) => VOWELS.includes(c) && !(c === 'y' && i === 0));
  if (at === 0) {
    while (at < w.length && VOWELS.includes(w[at])) at++;
    if (at >= w.length) at = 1;
  } else if (at < 0) at = 1;
  return [part.slice(0, at), part.slice(at)].filter((s) => s !== '');
}

/** A part of a word (no hyphens, no possessive mark) as its syllables. @param {string} part */
function partSyllables(part) {
  let out = joinLoneConsonants(hyphenateSync(part, { hyphenChar: '|' }).split('|')).filter((s) => s !== '');
  if (out.length === 1) out = vowelSplit(part);
  if (out.length === 1) out = onsetSplit(part);
  return out;
}

/**
 * One word (no spaces, a hyphen only at its end) as its syllables: its
 * possessive mark or hyphen set aside, then split as a compound and each part
 * by syllable, the mark put back on the last.
 * @param {string} word
 */
function piece(word) {
  if (SMALL.has(word)) return [word];
  const [, base, mark] = /** @type {RegExpExecArray} */ (/^(.*?)((?:['’]s?)?-?)$/.exec(word));
  if (!base) return [word];
  const out = (compoundOf(base) ?? [base]).flatMap(partSyllables);
  out[out.length - 1] += mark;
  return out;
}

/** One word of a name as its syllables: a hyphenated word's halves each split on their own. @param {string} word */
function wordSyllables(word) {
  return word
    .split(/(?<=-)/)
    .flatMap(piece)
    .filter((s) => s !== '');
}

/**
 * A name as its words, each word as its syllables, lower case.
 * @param {string} name
 * @returns {string[][]}
 */
export function syllablesOf(name) {
  return name.toLowerCase().split(' ').map(wordSyllables);
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
