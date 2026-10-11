#!/usr/bin/env node
// Fetches each item's tooltip from poe2db.tw (its properties, requirements,
// mods and flavour text) for the items in src/data/items.json, and writes
// them to src/data/itemStats.json. The game loads that file only when a
// player opens an item's details (ItemDetails.svelte). npm run fetch-data
// runs this at its end.
//
// Usage: npm run fetch-stats
// Behind a proxy on Node 22+: NODE_USE_ENV_PROXY=1 npm run fetch-stats

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'src', 'data', 'items.json');
const STATS_FILE = path.join(ROOT, 'src', 'data', 'itemStats.json');
const PAGES = ['https://poe2db.tw/us/Unique_item', 'https://poe2db.tw/us/Lineage_Supports'];

/**
 * A tooltip line's kind, by its class on poe2db: a property, the
 * requirements, an implicit or explicit mod, a gem's description, the
 * corrupted mark, the flavour text, and the title of a skill a gem brings
 * along (its properties are the hybrid ones).
 */
const KINDS = {
  property: 'p',
  hybridProperty: 'p',
  'TextGem TitleBar': 't',
  requirements: 'r',
  implicitMod: 'i',
  explicitMod: 'e',
  secDescrText: 'd',
  corrupted: 'c',
  FlavourText: 'f',
};

/** A long dash and the spaces round it (built from its code: tests/style.test.ts looks for the dash and its escapes). */
const EM_DASH_RUN = new RegExp(` *${String.fromCharCode(0x2014)} *`, 'g');

const decode = (s) =>
  s
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/**
 * A line's text. A value in the game's white is wrapped in {}, one in its
 * augmented blue in <>; the ranges' dash becomes a hyphen, as the game
 * writes them.
 */
function lineText(html, where) {
  const plain = decode(html.replace(/<[^>]+>/g, ''));
  if (/[{}<>]/.test(plain)) throw new Error(`${where}: a line already holds a bracket: ${plain}`);
  const marked = html
    .replace(/<span class="ndash">[^<]*<\/span>/g, '-')
    .replace(/<span class=['"]colourDefault['"]>([^<]*)<\/span>/g, '\u0001$1\u0002')
    .replace(/<span class=['"]colourAugmented['"]>([^<]*)<\/span>/g, '\u0003$1\u0004')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(marked)
    // The project writes no long dashes (CLAUDE.md): in a sentence, a semicolon.
    .replaceAll(EM_DASH_RUN, '; ')
    .replace(/\u0001/g, '{')
    .replace(/\u0002/g, '}')
    .replace(/\u0003/g, '<')
    .replace(/\u0004/g, '>')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** The tooltip's lines, in sections as its separators part them. */
function parse(html, where) {
  const start = html.indexOf('<div class="content">');
  const end = html.indexOf('<div class="itemboximage">');
  if (start < 0) throw new Error(`${where}: no tooltip content`);
  const content = html.slice(start, end > start ? end : undefined);
  const sections = [[]];
  const unknown = [];
  // Each line is a div with no div inside (those are the boxes around them).
  for (const [, cls, inner] of content.matchAll(/<div class="([\w -]+)">((?:(?!<div)[\s\S])*?)<\/div>/g)) {
    if (cls === 'separator') {
      if (sections.at(-1).length) sections.push([]);
      continue;
    }
    const kind = KINDS[cls];
    if (!kind) {
      // The help line every gem has ("Place into a Skill's Support Gem socket…").
      if (!cls.includes('fst-italic')) unknown.push(cls);
      continue;
    }
    // The game's own stat ids, for stats it has no words for: the game doesn't show them.
    if (/^\s*<span class="secondary">[^<]*<\/span>\s*$/.test(inner)) continue;
    const text = lineText(inner, where);
    if (!text) continue;
    // A gem's tabs: its own (titled "Support", as it says above) and each skill it brings.
    if (kind === 't') {
      if (sections.at(-1).length) sections.push([]);
      if (text !== 'Support') sections.at(-1).push(['t', text]);
      continue;
    }
    // A requirements line says "Requires:" once; the rest is its values.
    if (kind === 'r') {
      const m = /^(.*?):\s*(.*)$/.exec(text);
      if (!m) throw new Error(`${where}: requirements without a colon: ${text}`);
      sections.at(-1).push(m[1] === 'Requires' ? ['r', m[2]] : ['p', `${m[1]}: ${m[2]}`]);
      continue;
    }
    sections.at(-1).push([kind, text]);
  }
  if (!sections.at(-1).length) sections.pop();
  return { sections, unknown };
}

async function fetchRetry(url, tries = 6) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'poe2-trivia data fetcher', referer: 'https://poe2db.tw/' } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      if (i >= tries - 1) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

export async function fetchStats() {
  const items = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  // Each item's tooltip, by its name: the first link to it on the list pages.
  const hovers = new Map();
  for (const page of PAGES) {
    console.log(`Fetching ${page}`);
    let html = await (await fetchRetry(page)).text();
    // As in fetch-data: "Cultivated Uniques" repeats items with mutated mods.
    const cut = html.indexOf('<div id="CultivatedUniques"');
    if (cut > 0) html = html.slice(0, cut);
    const link =
      /<a class="(?:UniqueItem|gem_\w+)" data-hover="(https:\/\/cdn\.poe2db\.tw\/[^"]+)"[^>]*>(?:<span class="uniqueName">([^<]+)<\/span>|([^<]+)<\/a>)/g;
    for (const [, url, unique, gem] of html.matchAll(link)) {
      const name = decode(unique ?? gem).trim();
      if (!hovers.has(name)) hovers.set(name, url);
    }
  }

  const out = {};
  const missing = [];
  const unknown = new Set();
  const queue = items.filter((it) => {
    if (hovers.has(it.name)) return true;
    missing.push(it.name);
    return false;
  });
  let done = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let it; (it = queue.shift()); ) {
        const html = await (await fetchRetry(hovers.get(it.name))).text();
        const { sections, unknown: odd } = parse(html, it.name);
        for (const c of odd) unknown.add(`${c} (${it.name})`);
        // A unique's first line is poe2db's own grouping of its base ("Ezomyte Helmets"), not the game's.
        const first = sections[0]?.[0];
        if (it.kind === 'unique' && first?.[0] === 'p' && !first[1].includes(':')) sections[0].shift();
        if (!sections[0]?.length) sections.shift();
        out[it.id] = sections;
        if (++done % 50 === 0) console.log(`${done} tooltips`);
      }
    }),
  );

  const sorted = Object.fromEntries(items.flatMap((it) => (out[it.id] ? [[it.id, out[it.id]]] : [])));
  await writeFile(STATS_FILE, JSON.stringify(sorted) + '\n');
  console.log(`${Object.keys(sorted).length} of ${items.length} items have their tooltip`);
  if (missing.length) console.warn(`No tooltip found for:\n  ${missing.join('\n  ')}`);
  if (unknown.size) console.warn(`Lines of an unknown kind, left out: ${[...unknown].join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  fetchStats().catch((err) => {
    console.error(err);
    process.exit(1);
  });
