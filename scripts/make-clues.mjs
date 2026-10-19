// Builds src/data/clues.json, what the Wraeclast run's supplies and zones
// reveal about an item (src/wraeclast), from its tooltip in itemStats.json:
// - base: its base type (Gold Ring, or a gem's Lineage Support),
// - mods: its mod lines in tooltip order, each [kind, text, shared] with the
//   kind as ItemDetails draws it (a unique's implicits (i) and explicits (e);
//   a gem's Category line (p), descriptions (d), mods (e) and granted skills
//   (t)) and shared the number of items with the same line once its numbers
//   are set aside (sameLine: parentheses off, any number or range a #). A
//   line shared by 3 or more is common: the only kind a Scroll of Wisdom or
//   a Plain zone shows, since a line only its own item has gives it away.
// - flavor: its flavour text, or null.
// Values keep their colour marks ({w|65}), as the tooltip writes them.
//
// Every word of the item's own name (3 letters or more, but not "of", "the"
// or "and") is masked wherever it shows, with its possessive and plural
// forms, case-insensitive, whole words only. The mask is ▮▮▮ whatever the
// word's length, so it never tells the length. Placeholder mods
// ("[2 Random Jewel Modifiers]") and the stat ids the wiki leaks into a few
// lines ("local weapon implicit hidden ... [30]") are left out.
// tests/clues.test.ts checks no clue still holds a word of its own name, and
// that the file is what this script makes.
// Run: node scripts/make-clues.mjs (after npm run fetch-data)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ITEMS = new URL('../src/data/items.json', import.meta.url);
const STATS = new URL('../src/data/itemStats.json', import.meta.url);
const OUT = new URL('../src/data/clues.json', import.meta.url);

export const MASK = '▮▮▮';
const SMALL = new Set(['of', 'the', 'and']);

/**
 * The words of a name a clue mustn't show: 3 letters or more, possessives' marks off.
 * @param {string} name
 */
export function nameWords(name) {
  return [
    ...new Set(
      name
        .split(/[\s-]+/)
        .map((w) => w.replace(/['’]s?$/, ''))
        .filter((w) => [...w].length >= 3 && !SMALL.has(w.toLowerCase())),
    ),
  ];
}

/** @param {string} s */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One pattern for every form of a name's words: the word, its plurals
 * (-s, -es, and -ies for a word ending in y), each with a possessive mark.
 * @param {string} name
 */
export function namePattern(name) {
  const forms = nameWords(name).map((w) => {
    const word = /y$/i.test(w) ? `${escape(w.slice(0, -1))}(?:${escape(w.slice(-1))}(?:s|es)?|ies)` : `${escape(w)}(?:s|es)?`;
    return `${word}(?:['’]s?)?`;
  });
  if (!forms.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

/** @param {string} text @param {RegExp | null} pattern */
const mask = (text, pattern) => (pattern ? text.replace(pattern, MASK) : text);

/**
 * A line with the wiki's leaked stat ids and wholly bracketed placeholders
 * taken out, or null if nothing's left.
 * @param {string} text
 */
function clean(text) {
  const kept = text
    .split('\n')
    .filter((line) => !/^\[[^\]]*\]$/.test(line.trim()) && !/^local .*\[\d+\]$/.test(line.trim()))
    .map((line) => line.replace(/\s*\[\d+(?:,\d+)*\]$/, ''));
  return kept.length ? kept.join('\n') : null;
}

/**
 * A mod line as lines are compared across items: colour marks and
 * parentheses off, any number or range (10-20, 1.5) a #. "+(10-20) to
 * maximum Life" and "+35 to maximum Life" are the same line.
 * @param {string} text
 */
export const sameLine = (text) =>
  text
    .replace(/\{\w+\|([^{}]*)\}/g, '$1')
    .replace(/[()]/g, '')
    .replace(/[+-]?\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * One item's mod lines in tooltip order, each [kind, text] as the tooltip
 * writes it (not yet masked).
 * @param {{ kind: string }} item
 * @param {[string, string][][]} sections its tooltip, as itemStats.json holds it
 * @returns {[string, string][]}
 */
function modLines(item, sections) {
  const gem = item.kind === 'gem';
  /** @type {[string, string][]} */
  const mods = [];
  for (const [k, t] of sections.flat()) {
    const own = gem ? (k === 'p' && t.startsWith('Category:')) || 'det'.includes(k) : 'ie'.includes(k);
    const text = own ? clean(t) : null;
    if (text) mods.push([k, text]);
  }
  return mods;
}

/**
 * How many items have each mod line (sameLine), an item counted once however
 * often it has a line.
 * @param {{ id: string, kind: string }[]} items
 * @param {Record<string, [string, string][][]>} stats
 */
export function sharedLines(items, stats) {
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const item of items) for (const line of new Set(modLines(item, stats[item.id]).map(([, t]) => sameLine(t)))) count.set(line, (count.get(line) ?? 0) + 1);
  return count;
}

/**
 * One item's clues.
 * @param {{ name: string, base: string, kind: string }} item
 * @param {[string, string][][]} sections its tooltip, as itemStats.json holds it
 * @param {Map<string, number>} shared how many items have each line (sharedLines)
 */
export function cluesOf(item, sections, shared) {
  const pattern = namePattern(item.name);
  const mods = modLines(item, sections).map(([k, t]) => [k, mask(t, pattern), shared.get(sameLine(t)) ?? 1]);
  const f = sections.flat().find(([k]) => k === 'f');
  return { base: mask(item.base, pattern), mods, flavor: f ? mask(f[1], pattern) : null };
}

/**
 * The whole file for these items, as this script writes it.
 * @param {{ id: string, name: string, base: string, kind: string }[]} items
 * @param {Record<string, [string, string][][]>} stats
 */
export function cluesFile(items, stats) {
  const shared = sharedLines(items, stats);
  const lines = items.map((item) => `  ${JSON.stringify(item.id)}: ${JSON.stringify(cluesOf(item, stats[item.id], shared))}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const items = JSON.parse(readFileSync(ITEMS, 'utf8'));
  writeFileSync(OUT, cluesFile(items, JSON.parse(readFileSync(STATS, 'utf8'))));
  console.log(`Wrote ${items.length} items' clues to src/data/clues.json.`);
}
