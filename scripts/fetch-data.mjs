#!/usr/bin/env node
// Scrapes unique items and lineage support gems from poe2db.tw and downloads
// their art into art-source/items/. Writes the item index to
// src/data/items.json, and their tooltips to src/data/itemStats.json
// (scripts/fetch-stats.mjs). An item drawn more than one way (Grand
// Spectrum's three jewels, each its own colour) keeps its other art as its
// variants: the list page shows only the first, so each unique's own page is
// read for the rest. The site shows upscaled copies of the art: run
// scripts/upscale-art.py afterwards for any new items (it says how), and
// npm run looks.
//
// Usage: npm run fetch-data (-- --shrink: see below)
// Behind a proxy on Node 22+: NODE_USE_ENV_PROXY=1 npm run fetch-data

import { mkdir, writeFile, readdir, unlink, access, readFile } from 'node:fs/promises';
import { webpSize } from './webp-size.mjs';
import { decode as decodeText, fetchStats, hashId, pageBoxes } from './fetch-stats.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://poe2db.tw/us/Unique_item';
const IMG_DIR = path.join(ROOT, 'art-source', 'items');
const SITE_DIR = path.join(ROOT, 'public', 'items');
/** The smaller copies' folders under SITE_DIR (THUMBS in scripts/upscale-art.py, ITEM_THUMBS in src/lib/ui-paths.ts). */
const THUMBS = [256, 128];
const DATA_FILE = path.join(ROOT, 'src', 'data', 'items.json');

// Map the art folder (below Art/2DItems/) to a fine-grained group and a broad
// quiz category. Categories are deliberately broad and similar in size so no
// pick is an obvious "easy" one. Order matters: first matching prefix wins.
const CATEGORY_RULES = [
  ['Weapons/OneHandWeapons/OneHandMaces', 'One-Handed Maces', 'One-Handed Weapons'],
  ['Weapons/OneHandWeapons/OneHandSpears', 'Spears', 'One-Handed Weapons'],
  ['Weapons/OneHandWeapons/Scepters', 'Sceptres', 'One-Handed Weapons'],
  ['Weapons/OneHandWeapons/Wands', 'Wands', 'One-Handed Weapons'],
  ['Weapons/TwoHandWeapons/TwoHandMaces', 'Two-Handed Maces', 'Two-Handed Weapons'],
  ['Weapons/TwoHandWeapons/WarStaves', 'Quarterstaves', 'Two-Handed Weapons'],
  ['Weapons/TwoHandWeapons/Staves', 'Staves', 'Two-Handed Weapons'],
  ['Weapons/TwoHandWeapons/Bows', 'Bows', 'Two-Handed Weapons'],
  ['Weapons/TwoHandWeapons/Crossbows', 'Crossbows', 'Two-Handed Weapons'],
  // Druid talismans are two-handed weapons, though their art sits with the off-hands.
  ['Offhand/Talismans', 'Talismans', 'Two-Handed Weapons'],
  ['Offhand/Shields', 'Shields', 'Off-Hands'],
  ['Offhand/Foci', 'Foci', 'Off-Hands'],
  ['Quivers', 'Quivers', 'Off-Hands'],
  ['Armours/BodyArmours', 'Body Armours', 'Body Armours'],
  ['Armours/Helmets', 'Helmets', 'Helmets'],
  ['Armours/Gloves', 'Gloves', 'Gloves & Boots'],
  ['Armours/Boots', 'Boots', 'Gloves & Boots'],
  ['Rings', 'Rings', 'Rings'],
  ['Amulets', 'Amulets', 'Amulets & Belts'],
  ['Belts', 'Belts', 'Amulets & Belts'],
  ['Flasks', 'Flasks', 'Flasks, Charms, Jewels, Relics & Tablets'],
  ['Charms', 'Charms', 'Flasks, Charms, Jewels, Relics & Tablets'],
  ['Jewels', 'Jewels', 'Flasks, Charms, Jewels, Relics & Tablets'],
  ['Relics', 'Relics', 'Flasks, Charms, Jewels, Relics & Tablets'],
  ['Currency/PrecursorTablets', 'Tablets', 'Flasks, Charms, Jewels, Relics & Tablets'],
];

const GEM_SOURCE = 'https://poe2db.tw/us/Lineage_Supports';
const GEM_CATEGORY = 'Lineage Gems';
const GEM_COLOURS = { gem_red: 'Strength', gem_green: 'Dexterity', gem_blue: 'Intelligence' };
const GEM_ENTRY = new RegExp(
  '<a class="(gem_\\w+)"[^>]*href="/us/[^"]+"><img loading="lazy" src="(https://cdn\\.poe2db\\.tw/image/Art/2DItems/Gems/[^"]+)"[^>]*/></a></div>' +
    '<div class="flex-grow-1 ms-2"><div><a class="gem_\\w+"[^>]*>([^<]+)</a>',
  'g',
);

// The list leaves some items' pictures out: those come from the item's own page.
const ENTRY = new RegExp(
  '<div class="flex-shrink-0">(?:<a[^>]*><img loading="lazy" src="(https://cdn\\.poe2db\\.tw/image/Art/2DItems/[^"]+)"[^>]*/></a>)?</div>' +
    '<div class="flex-grow-1 ms-2"><div><a class="UniqueItem"[^>]*href="/us/([^"]+)">' +
    '<span class="uniqueName">([^<]+)</span>\\s*<span class="uniqueTypeLine">([^<]*)</span>',
  'g',
);

// As fetch-stats decodes the item pages' names (pageBoxes), so the two match.
const decode = (s) => decodeText(s).trim();

const ART = 'https://cdn.poe2db.tw/image/Art/2DItems/';

const categorize = (img) => {
  const rel = img.split('/Art/2DItems/')[1];
  const rule = CATEGORY_RULES.find(([prefix]) => rel.startsWith(prefix));
  return rule ? { group: rule[1], category: rule[2] } : null;
};

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

const exists = (p) => access(p).then(() => true, () => false);

async function main() {
  console.log(`Fetching ${SOURCE}`);
  const html = await (await fetchRetry(SOURCE)).text();

  // Only the regular sections; "Cultivated Uniques" repeats items with mutated mods.
  const cut = html.indexOf('<div id="CultivatedUniques"');
  const body = cut > 0 ? html.slice(0, cut) : html;

  const entries = [];
  const seen = new Set();
  for (const [, img, slug, rawName, rawBase] of body.matchAll(ENTRY)) {
    const name = decode(rawName);
    if (seen.has(name)) continue;
    seen.add(name);
    entries.push({ name, base: decode(rawBase), slug, img });
  }
  if (entries.length < 100) throw new Error(`Only ${entries.length} items parsed; page layout changed?`);

  // Each unique's own page: its picture where the list leaves it out, and
  // any other art it has (its variants, below). A box for another item, or
  // without a picture, counts for neither.
  console.log(`Fetching each unique's page (${entries.length})`);
  const queue = [...entries];
  let read = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let e; (e = queue.shift()); ) {
        const page = await (await fetchRetry(`https://poe2db.tw/us/${e.slug}`)).text();
        e.boxes = pageBoxes(page).filter((b) => b.name === e.name && b.art);
        if (++read % 100 === 0) console.log(`${read} pages`);
      }
    }),
  );

  const items = [];
  const skipped = [];
  let pictureless = 0;
  for (const { name, base, slug, img, boxes } of entries) {
    const src = img ?? (boxes[0] && ART + boxes[0].art);
    if (!src) pictureless++;
    const cat = src && categorize(src);
    if (!cat) {
      skipped.push(`${name} (${src ?? 'no picture'})`);
      continue;
    }
    items.push({ id: hashId(name), name, base, ...cat, kind: 'unique', slug, src, boxes });
  }
  // Before anything is deleted: a page that changed its layout leaves most items without a picture or a category.
  if (items.length < 100) throw new Error(`Only ${items.length} items have their art; page layout changed?`);
  if (pictureless > entries.length / 20)
    throw new Error(`${pictureless} of ${entries.length} uniques have no picture on the list or their page; page layout changed?`);

  console.log(`Fetching ${GEM_SOURCE}`);
  const gemHtml = await (await fetchRetry(GEM_SOURCE)).text();
  let gems = 0;
  for (const [, colour, img, rawName] of gemHtml.matchAll(GEM_ENTRY)) {
    const name = decode(rawName);
    if (seen.has(name)) continue;
    seen.add(name);
    const attr = GEM_COLOURS[colour] ?? 'Lineage';
    items.push({
      id: hashId(name),
      name,
      base: `${attr} Lineage Support`,
      group: attr,
      category: GEM_CATEGORY,
      kind: 'gem',
      src: img,
    });
    gems++;
  }
  if (gems < 20) throw new Error(`Only ${gems} lineage gems parsed; page layout changed?`);
  if (skipped.length) console.warn(`Skipped (no category):\n  ${skipped.join('\n  ')}`);

  // Drop items whose art is shared with another item: they cannot be told apart.
  const artCount = new Map();
  for (const it of items) artCount.set(it.src, (artCount.get(it.src) ?? 0) + 1);
  const quiz = items.filter((it) => artCount.get(it.src) === 1);

  // Each unique's other art, from its own page: a box whose picture is
  // neither its own nor another item's. Boxes that differ only in their mods
  // (a league's version, a base it also drops as) share its art and add none.
  // Nor does a picture two items' pages both show: it tells neither apart.
  const pagesWith = new Map();
  for (const it of quiz) for (const src of new Set((it.boxes ?? []).map((b) => ART + b.art))) pagesWith.set(src, (pagesWith.get(src) ?? 0) + 1);
  for (const it of quiz) {
    const variants = [];
    for (const { base, art, html } of it.boxes ?? []) {
      const src = ART + art;
      if (artCount.has(src) || pagesWith.get(src) > 1 || variants.some((v) => v.src === src)) continue;
      variants.push({ id: hashId(art), base, src, html });
    }
    if (variants.length) it.variants = variants;
  }
  const withVariants = quiz.filter((it) => it.variants);
  if (withVariants.length) console.log(`Drawn more than one way: ${withVariants.map((it) => `${it.name} (${it.variants.length + 1})`).join(', ')}`);
  /** Every picture to keep: each item's own, and its variants'. */
  const arts = quiz.flatMap((it) => [it, ...(it.variants ?? [])]);

  // Nor when the items would shrink a lot: art and data deleted by a broken
  // fetch is worse than none (--shrink, when poe2db really dropped them).
  const before = await readFile(DATA_FILE, 'utf8').then((t) => JSON.parse(t).length, () => 0);
  if (quiz.length < before * 0.9 && !process.argv.includes('--shrink'))
    throw new Error(`${quiz.length} items, ${before} before: page layout changed? (--shrink keeps the fewer)`);

  await mkdir(IMG_DIR, { recursive: true });
  let downloaded = 0;
  const downloads = [...arts];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let it; (it = downloads.shift()); ) {
        const file = path.join(IMG_DIR, `${it.id}.webp`);
        if (await exists(file)) continue;
        const buf = Buffer.from(await (await fetchRetry(it.src)).arrayBuffer());
        webpSize(buf, it.src); // only a whole WebP file is kept
        await writeFile(file, buf);
        downloaded++;
      }
    }),
  );

  // The site's copies: AVIF, full size and in each THUMBS folder (scripts/upscale-art.py).
  const keepArt = new Set(arts.map((it) => `${it.id}.webp`));
  const keepSite = new Set(arts.map((it) => `${it.id}.avif`));
  const siteDirs = [SITE_DIR, ...THUMBS.map((t) => path.join(SITE_DIR, String(t)))];
  for (const dir of siteDirs) await mkdir(dir, { recursive: true });
  for (const f of await readdir(IMG_DIR)) if (!keepArt.has(f)) await unlink(path.join(IMG_DIR, f));
  for (const dir of siteDirs)
    for (const f of await readdir(dir, { withFileTypes: true })) if (f.isFile() && !keepSite.has(f.name)) await unlink(path.join(dir, f.name));
  const missing = [];
  for (const it of arts) if (!(await Promise.all(siteDirs.map((d) => exists(path.join(d, `${it.id}.avif`))))).every(Boolean)) missing.push(it.id);

  quiz.sort((a, b) => a.name.localeCompare(b.name));
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  // Each item's art size (px of the original art): the site's pictures are
  // a whole number of times larger (artScale in src/lib/ui-paths.ts).
  const size = async (id) => webpSize(await readFile(path.join(IMG_DIR, `${id}.webp`)), `${id}.webp`);
  const out = [];
  for (const { id, name, base, group, category, kind, variants } of quiz) {
    const [w, h] = await size(id);
    const more = [];
    for (const v of variants ?? []) {
      const [vw, vh] = await size(v.id);
      more.push({ id: v.id, base: v.base, w: vw, h: vh });
    }
    out.push({ id, name, base, group, category, kind, w, h, ...(more.length ? { variants: more } : {}) });
  }
  await writeFile(DATA_FILE, JSON.stringify(out, null, 1) + '\n');

  const perCat = {};
  for (const it of quiz) perCat[it.category] = (perCat[it.category] ?? 0) + 1;
  console.log(`${quiz.length} items (${downloaded} new images)`);
  console.table(perCat);
  if (missing.length) console.warn(`${missing.length} items have no upscaled art yet: run scripts/upscale-art.py (see its header).`);
  // Each variant's tooltip, from the box read above.
  await fetchStats(new Map(quiz.flatMap((it) => (it.variants ?? []).map((v) => [v.id, v.html]))));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
