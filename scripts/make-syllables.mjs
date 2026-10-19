// Builds src/data/syllables.json, every item's name split into syllables, for
// the Wraeclast run's Inscription (src/wraeclast): the player builds a name
// from the shuffled syllables of the names on the board.
//
// Each name is a list of its words, each word a list of its syllables, all
// lower case, so the name rebuilds (in lower case) as the syllables joined
// within a word and the words joined with a space; the word boundaries are
// what the answer line's spacing and the Word lengths supply read
// (tests/syllables.test.ts checks every name rebuilds, no tile is longer than
// 4 letters, and that the file is what this script makes).
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
// - A syllable longer than 4 letters (a possessive mark or a hyphen not
//   counted) is cut again near its middle at a vowel, before the consonants
//   that start the next vowel's syllable, until none is: man / dra / go /
//   ra, not man / drago / ra; one of a single vowel sound before its vowel
//   (str / ict). A word of one letter (the o' of Cat O' Nine Tails) can't
//   split and stays one tile.
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

/** The most letters a tile holds, not counting a possessive mark or a hyphen. */
const LONGEST = 4;
/** Consonants that start a syllable together (dr / ago, not d / rago). */
const ONSETS = new Set([
  ...['bl', 'br', 'ch', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'kl', 'kr', 'ph', 'pl', 'pr', 'qu', 'sc', 'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'th', 'tr', 'tw', 'wh', 'wr'],
  ...['chr', 'phr', 'sch', 'scr', 'shr', 'spl', 'spr', 'squ', 'str', 'thr'],
]);
/** Letter pairs a cut never goes between. */
const KEEP = new Set(['ch', 'ck', 'gh', 'ph', 'qu', 'sh', 'th', 'wh']);
/** Vowel pairs that sound as one, which a cut never goes between either. */
const DIPHTHONGS = new Set(['ai', 'au', 'ay', 'ea', 'ee', 'ei', 'eu', 'ey', 'ie', 'oa', 'oe', 'oi', 'oo', 'ou', 'oy', 'ue', 'ui']);

/**
 * Which letters of a part are vowels: a y before a vowel (or at the start)
 * and the u of qu are consonants here.
 * @param {string} w the part, lower case
 */
function vowelsOf(w) {
  return [...w].map((c, i) => VOWELS.includes(c) && !(c === 'y' && (i === 0 || (i + 1 < w.length && VOWELS.includes(w[i + 1])))) && !(c === 'u' && w[i - 1] === 'q'));
}

/**
 * Whether letter i is a silent final e: after a consonant, but not the e of
 * a final syllable like ble or tle (cru / ci / ble).
 * @param {string} w @param {boolean[]} vowel @param {number} i
 */
const silentE = (w, vowel, i) => i === w.length - 1 && i > 0 && w[i] === 'e' && !vowel[i - 1] && !(w[i - 1] === 'l' && i > 1 && !vowel[i - 2]);

/**
 * What a cut before letter i costs: 1 where the next tile starts with a
 * consonant, or consonants that start a syllable together, before its vowel
 * (man / dra / go), and none of them would rather go with the tile before
 * (an s may: mas / ter and ma / ster both read), 1 more if that vowel is a
 * silent e (par / a / dise, not par / adi / se); 2 between two vowels that
 * don't sound as one (ae / ris); 3 anywhere else; 10 inside a pair that sounds
 * as one (c / h, o / u).
 * @param {string} w @param {boolean[]} vowel @param {number} i
 */
function cutCost(w, vowel, i) {
  const pair = w.slice(i - 1, i + 1);
  if (KEEP.has(pair)) return 10;
  if (vowel[i]) return !vowel[i - 1] ? 3 : DIPHTHONGS.has(pair) ? 10 : 2;
  let end = i;
  while (end < w.length && !vowel[end]) end++;
  if (end === w.length) return 3;
  const onset = w.slice(i, end);
  const starts = onset.length === 1 || ONSETS.has(onset);
  const keepsAll = vowel[i - 1] || w[i - 1] === 's' || !ONSETS.has(w[i - 1] + onset);
  return (starts && keepsAll ? 1 : 3) + (silentE(w, vowel, end) ? 1 : 0);
}

/**
 * A part longer than LONGEST letters cut into tiles of at most that many: one
 * of a single vowel sound that starts with a consonant before its vowel, as
 * onsetSplit does (str / ict, st / one), where both halves are short enough;
 * any other at the cheapest cuts (cutCost, 4 more for a tile with no vowel),
 * so as few cuts as read well, and of those the most even tiles (ama / na,
 * not a / mana; gai / nst, not g / ai / nst).
 * @param {string} part
 * @returns {string[]}
 */
function shorten(part) {
  if ([...part].length <= LONGEST) return [part];
  const w = part.toLowerCase();
  const vowel = vowelsOf(w);
  const sounds = vowel.filter((v, i) => v && !vowel[i - 1] && !silentE(w, vowel, i)).length;
  const at = vowel.indexOf(true);
  if (sounds <= 1 && at > 0 && at <= LONGEST && w.length - at <= LONGEST) return [part.slice(0, at), part.slice(at)];
  // best[j]: the cheapest way to cut the first j letters, as [cost, sum of squared tile lengths, cut before].
  /** @type {[number, number, number][]} */
  const best = [[0, 0, -1]];
  for (let j = 1; j <= w.length; j++) {
    /** @type {[number, number, number] | null} */
    let pick = null;
    for (let k = Math.max(0, j - LONGEST); k < j; k++) {
      const [cost, even] = best[k];
      const tile = vowel.slice(k, j).some(Boolean) ? 0 : 4;
      const here = /** @type {[number, number, number]} */ ([cost + (k > 0 ? cutCost(w, vowel, k) : 0) + tile, even + (j - k) ** 2, k]);
      if (!pick || less(here, pick)) pick = here;
    }
    best.push(/** @type {[number, number, number]} */ (pick));
  }
  /** @type {string[]} */
  const out = [];
  for (let j = w.length; j > 0; j = best[j][2]) out.unshift(part.slice(best[j][2], j));
  return out;
}

/** A part of a word (no hyphens, no possessive mark) as its syllables. @param {string} part */
function partSyllables(part) {
  let out = joinLoneConsonants(hyphenateSync(part, { hyphenChar: '|' }).split('|')).filter((s) => s !== '');
  if (out.length === 1) out = vowelSplit(part);
  if (out.length === 1) out = onsetSplit(part);
  return out.flatMap(shorten);
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
