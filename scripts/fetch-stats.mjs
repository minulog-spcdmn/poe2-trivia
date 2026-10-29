#!/usr/bin/env node
// Fetches each item's tooltip from poe2db.tw (its properties, requirements,
// mods and flavour text) for the items in src/data/items.json (and for each
// of an item's variants, by the variant's id), and writes
// them to src/data/itemStats.json. The game fetches that file ahead in an
// idle moment and reads it only when a player first opens an item's details
// (ItemDetails.svelte). npm run fetch-data collects them too (collectStats),
// before it writes anything. A tooltip comes from the item's hover on the
// list page; where that is empty or comes to no line, from its box on its
// own page; failing both, the committed one is kept.
//
// Usage: npm run fetch-stats
// Behind a proxy on Node 22+: NODE_USE_ENV_PROXY=1 npm run fetch-stats

import { createHash } from 'node:crypto';
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

/** HTML's entities in poe2db's text, as text (fetch-data decodes names with it too). */
export const decode = (s) =>
  s
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/**
 * The colours a value is shown in, by its class on poe2db, as one letter:
 * the game's white, its augmented blue (a value the item's mods raise), and
 * each damage type's own.
 */
const COLOURS = {
  colourDefault: 'w',
  colourAugmented: 'a',
  colourPhysicalDamage: 'p',
  colourFireDamage: 'f',
  colourColdDamage: 'c',
  colourLightningDamage: 'l',
  colourChaosDamage: 'h',
};
const unknownColours = new Set();

/**
 * A line's text. A coloured value is wrapped as {x|value}, x its colour's
 * letter (COLOURS); the ranges' dash becomes a hyphen, as the game writes
 * them.
 */
function lineText(html, where) {
  const plain = decode(html.replace(/<[^>]+>/g, ''));
  if (/[{}]/.test(plain)) throw new Error(`${where}: a line already holds a brace: ${plain}`);
  const marked = html
    .replace(/<span class="ndash">[^<]*<\/span>/g, '-')
    .replace(/<span class=['"](colour\w+)['"]>([^<]*)<\/span>/g, (all, cls, v) => {
      const c = COLOURS[cls];
      if (!c) unknownColours.add(cls);
      return c ? `\u0001${c}|${v}\u0002` : v;
    })
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(marked)
    // The project writes no long dashes (CLAUDE.md): in a sentence, a semicolon.
    .replaceAll(EM_DASH_RUN, '; ')
    .replace(/\u0001/g, '{')
    .replace(/\u0002/g, '}')
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

/**
 * The item boxes on an item's own page: one for each version of it poe2db
 * knows (another base it drops as, a version a league changed), each its
 * base, its art (the path below Art/2DItems/) and its html, to parse() on
 * its own. Grand Spectrum comes as a Ruby, an Emerald and a Sapphire, each
 * drawn in its own colour; the list pages show only the first.
 */
export function pageBoxes(html) {
  return html
    .split('<div class="newItemPopup UniquePopup')
    .slice(1)
    .map((box) => ({
      name: decode(/<div class="itemName">\s*<span class="lc">([^<]*)/.exec(box)?.[1] ?? '').trim(),
      base: decode(/<div class="itemName typeLine">\s*<span class="lc">([^<]*)/.exec(box)?.[1] ?? '').trim(),
      art: /<div class="itemboximage">\s*<img[^>]*src="https:\/\/cdn\.poe2db\.tw\/image\/Art\/2DItems\/([^"]+)"/.exec(box)?.[1] ?? null,
      html: box,
    }));
}

/**
 * An id that names a picture's file: a hash, so its URL doesn't give the
 * item away. An item's is its name's (fetch-data), a variant's its art's path.
 */
export const hashId = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

export async function fetchRetry(url, tries = 6) {
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

/**
 * The hover poe2db links for a tooltip it has nothing in: the hovers are
 * named by their content's SHA-256, and this is the empty string's. 26
 * uniques' list links pointed at it in October 2026, all of them still on
 * the list and their own pages.
 */
export const EMPTY_HOVER = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
export const isEmptyHover = (url) => url.endsWith(`/${EMPTY_HOVER}`);

/**
 * The links on a list page, by item name: its tooltip (the first link with
 * one that isn't empty) and its own page (the first link's).
 */
export function listLinks(html, hovers = new Map(), pages = new Map()) {
  // As in fetch-data: "Cultivated Uniques" repeats items with mutated mods.
  const cut = html.indexOf('<div id="CultivatedUniques"');
  if (cut > 0) html = html.slice(0, cut);
  const link =
    /<a class="(?:UniqueItem|gem_\w+)" data-hover="(https:\/\/cdn\.poe2db\.tw\/[^"]+)"[^>]*>(?:<span class="uniqueName">([^<]+)<\/span>|([^<]+)<\/a>)/g;
  for (const m of html.matchAll(link)) {
    const [, url, unique, gem] = m;
    const name = decode(unique ?? gem).trim();
    const slug = /href="\/us\/([^"]+)"/.exec(m[0])?.[1];
    if (slug && !pages.has(name)) pages.set(name, `https://poe2db.tw/us/${slug}`);
    if (!hovers.has(name) && !isEmptyHover(url)) hovers.set(name, url);
  }
  return { hovers, pages };
}

/**
 * A tooltip's sections, as the game shows them, or null when the html has
 * none: no content, or content that comes to no line at all. `unknown`
 * collects the lines of a kind it leaves out.
 */
export function tooltipOf(html, it, unknown = new Set()) {
  if (!html?.includes('<div class="content">')) return null;
  const { sections, unknown: odd } = parse(html, it.name);
  for (const c of odd) unknown.add(`${c} (${it.name})`);
  // A unique's first line is poe2db's own grouping of its base ("Ezomyte Helmets"), not the game's.
  const first = sections[0]?.[0];
  if (it.kind === 'unique' && first?.[0] === 'p' && !first[1].includes(':')) sections[0].shift();
  if (!sections[0]?.length) sections.shift();
  return sections.some((s) => s.length) ? sections : null;
}

/**
 * The box on a unique's own page that is the item itself, not one of its
 * variants: the one with its art (`ownArt`, the path below Art/2DItems/),
 * else the first. `boxes` are pageBoxes' for its name, with art.
 */
export const ownBox = (boxes, ownArt) => boxes.find((b) => b.art === ownArt) ?? boxes[0];

/**
 * Every item's tooltip, and each variant's, by id. Each comes from the
 * first source that has one: its hover on the list page, then its box on
 * its own page, then the tooltip committed before. Nothing is written.
 * - `ownBoxes`: each unique's own box html by id, as fetch-data has read
 *   them; without them its page is fetched when its hover fails.
 * - `variantBoxes`: each variant's box html by the variant's id, likewise.
 * - `committed`: the tooltips in itemStats.json, by id.
 * - `fetchText`: a URL's body (the network, unless a test stands in).
 * Returns the tooltips and where they didn't come from a hover: `fromPage`
 * (with `differ`, those unlike the committed one), `kept` (the committed
 * one) and `missing` (none at all, by id: a variant's id when it's the
 * variant's).
 */
export async function collectStats(items, { ownBoxes = null, variantBoxes = null, committed = {}, fetchText = null, log = console.log } = {}) {
  const get = fetchText ?? (async (url) => (await fetchRetry(url)).text());
  const hovers = new Map();
  const pages = new Map();
  for (const page of PAGES) {
    log(`Fetching ${page}`);
    listLinks(await get(page), hovers, pages);
  }

  const out = {};
  const unknown = new Set();
  const fromPage = [];
  const differ = [];
  const kept = [];
  const missing = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const queue = [...items];
  let done = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let it; (it = queue.shift()); ) {
        // Its own page's boxes, once, when they are needed and weren't handed over.
        let boxes;
        const pageBoxesOf = async () => {
          const page = pages.get(it.name);
          boxes ??= page ? pageBoxes(await get(page)).filter((b) => b.name === it.name && b.art) : [];
          return boxes;
        };
        const variantIds = new Set((it.variants ?? []).map((v) => v.id));
        const hover = hovers.get(it.name);
        let t = hover ? tooltipOf(await get(hover), it, unknown) : null;
        if (!t && it.kind === 'unique') {
          const html = ownBoxes ? ownBoxes.get(it.id) : (await pageBoxesOf()).find((b) => !variantIds.has(hashId(b.art)))?.html;
          t = tooltipOf(html, it, unknown);
          if (t) {
            fromPage.push(it.name);
            if (committed[it.id] && !same(t, committed[it.id])) differ.push(it.name);
          }
        }
        if (!t && committed[it.id]) {
          t = committed[it.id];
          kept.push(it.name);
        }
        if (t) out[it.id] = t;
        else missing.push(it.id);
        // Its other art (fetch-data: Item.variants), each with its own box on the item's page.
        for (const v of it.variants ?? []) {
          const html = variantBoxes ? variantBoxes.get(v.id) : (await pageBoxesOf()).find((b) => hashId(b.art) === v.id)?.html;
          let vt = tooltipOf(html, it, unknown);
          if (!vt && committed[v.id]) {
            vt = committed[v.id];
            kept.push(`${it.name} (${v.base})`);
          }
          if (vt) out[v.id] = vt;
          else missing.push(v.id);
        }
        if (++done % 50 === 0) log(`${done} tooltips`);
      }
    }),
  );
  return { stats: out, fromPage, differ, kept, missing, unknown };
}

/** itemStats.json's text: the tooltips of `items` and their variants, in their order. */
export function statsFile(items, stats) {
  const ids = items.flatMap((it) => [it.id, ...(it.variants ?? []).map((v) => v.id)]);
  return JSON.stringify(Object.fromEntries(ids.flatMap((id) => (stats[id] ? [[id, stats[id]]] : [])))) + '\n';
}

/** What collectStats found, said. */
export function statsReport(items, { stats, fromPage, differ, kept, missing, unknown }) {
  const names = new Map(items.flatMap((it) => [[it.id, it.name], ...(it.variants ?? []).map((v) => [v.id, `${it.name} (${v.base})`])]));
  const ids = [...names.keys()];
  const lines = [`${ids.filter((id) => stats[id]).length} of ${ids.length} items and variants have their tooltip`];
  if (fromPage.length)
    lines.push(`${fromPage.length} tooltips from their item pages (their hover was empty or failed); ${differ.length} differ from the committed ones${differ.length ? `: ${differ.join(', ')}` : ''}`);
  if (kept.length) lines.push(`Kept the committed tooltip (poe2db had none): ${kept.join(', ')}`);
  if (missing.length) lines.push(`No tooltip found for:\n  ${missing.map((id) => names.get(id) ?? id).join('\n  ')}`);
  if (unknown.size) lines.push(`Lines of an unknown kind, left out: ${[...unknown].join(', ')}`);
  if (unknownColours.size) lines.push(`Values in a colour of an unknown kind, shown plain: ${[...unknownColours].join(', ')}`);
  return lines;
}

export const readCommitted = () => readFile(STATS_FILE, 'utf8').then((t) => JSON.parse(t), () => ({}));
export const writeStats = (items, stats) => writeFile(STATS_FILE, statsFile(items, stats));

/** npm run fetch-stats: the tooltips of the items in items.json, fetched and written. */
async function main() {
  const items = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  const found = await collectStats(items, { committed: await readCommitted() });
  await writeStats(items, found.stats);
  for (const line of statsReport(items, found)) console.log(line);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
