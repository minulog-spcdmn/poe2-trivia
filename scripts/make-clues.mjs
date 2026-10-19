// Builds src/data/clues.json, what the Wraeclast run's supplies and zones
// reveal about an item (src/wraeclast), from its tooltip in itemStats.json:
// - req: its requirement lines ("Requires: Level 65, 34 Str"; a gem's
//   Support Requirements too),
// - mods: its mod lines in tooltip order, each [kind, text] with the kind as
//   ItemDetails draws it: a unique's implicits (i) and explicits (e); a
//   gem's Category line (p), descriptions (d), mods (e) and granted skills (t),
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
 * One item's clues.
 * @param {{ name: string, kind: string }} item
 * @param {[string, string][][]} sections its tooltip, as itemStats.json holds it
 */
export function cluesOf(item, sections) {
  const pattern = namePattern(item.name);
  const lines = sections.flat();
  const gem = item.kind === 'gem';
  /** @type {string[]} */
  const req = [];
  const r = lines.find(([k]) => k === 'r');
  if (r) req.push(`Requires: ${r[1]}`);
  if (gem) for (const [k, t] of lines) if (k === 'p' && t.startsWith('Support Requirements:')) req.push(t);
  /** @type {[string, string][]} */
  const mods = [];
  for (const [k, t] of lines) {
    const own = gem ? (k === 'p' && t.startsWith('Category:')) || 'det'.includes(k) : 'ie'.includes(k);
    const text = own ? clean(t) : null;
    if (text) mods.push([k, mask(text, pattern)]);
  }
  const f = lines.find(([k]) => k === 'f');
  return { req: req.map((t) => mask(t, pattern)), mods, flavor: f ? mask(f[1], pattern) : null };
}

/**
 * The whole file for these items, as this script writes it.
 * @param {{ id: string, name: string, kind: string }[]} items
 * @param {Record<string, [string, string][][]>} stats
 */
export function cluesFile(items, stats) {
  const lines = items.map((item) => `  ${JSON.stringify(item.id)}: ${JSON.stringify(cluesOf(item, stats[item.id]))}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const items = JSON.parse(readFileSync(ITEMS, 'utf8'));
  writeFileSync(OUT, cluesFile(items, JSON.parse(readFileSync(STATS, 'utf8'))));
  console.log(`Wrote ${items.length} items' clues to src/data/clues.json.`);
}
