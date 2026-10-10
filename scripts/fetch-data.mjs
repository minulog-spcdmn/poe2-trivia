#!/usr/bin/env node
// Scrapes unique items and lineage support gems from poe2db.tw and downloads
// their art into art-source/items/. Writes the item index to
// src/data/items.json. The site shows upscaled copies of the art: run
// scripts/upscale-art.py afterwards for any new items (it says how), and
// npm run looks.
//
// Usage: npm run fetch-data
// Behind a proxy on Node 22+: NODE_USE_ENV_PROXY=1 npm run fetch-data

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readdir, unlink, access, readFile } from 'node:fs/promises';
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

const ENTRY = new RegExp(
  '<img loading="lazy" src="(https://cdn\\.poe2db\\.tw/image/Art/2DItems/[^"]+)"[^>]*/></a></div>' +
    '<div class="flex-grow-1 ms-2"><div><a class="UniqueItem"[^>]*href="/us/([^"]+)">' +
    '<span class="uniqueName">([^<]+)</span>\\s*<span class="uniqueTypeLine">([^<]*)</span>',
  'g',
);

const decode = (s) =>
  s
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();

const categorize = (img) => {
  const rel = img.split('/Art/2DItems/')[1];
  const rule = CATEGORY_RULES.find(([prefix]) => rel.startsWith(prefix));
  return rule ? { group: rule[1], category: rule[2] } : null;
};

// Hash the file name so the image URL does not give the answer away.
const makeId = (name) => createHash('sha1').update(name).digest('hex').slice(0, 12);

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

/** A WebP file's width and height, from its header. */
async function webpSize(file) {
  const b = await readFile(file);
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  throw new Error(`${file}: unknown WebP kind ${kind}`);
}

async function main() {
  console.log(`Fetching ${SOURCE}`);
  const html = await (await fetchRetry(SOURCE)).text();

  // Only the regular sections; "Cultivated Uniques" repeats items with mutated mods.
  const cut = html.indexOf('<div id="CultivatedUniques"');
  const body = cut > 0 ? html.slice(0, cut) : html;

  const items = [];
  const seen = new Set();
  const skipped = [];
  for (const m of body.matchAll(ENTRY)) {
    const [, img, slug, rawName, rawBase] = m;
    const name = decode(rawName);
    if (seen.has(name)) continue;
    seen.add(name);
    const cat = categorize(img);
    if (!cat) {
      skipped.push(`${name} (${img})`);
      continue;
    }
    items.push({ id: makeId(name), name, base: decode(rawBase), ...cat, kind: 'unique', slug, src: img });
  }
  if (items.length < 100) throw new Error(`Only ${items.length} items parsed; page layout changed?`);

  console.log(`Fetching ${GEM_SOURCE}`);
  const gemHtml = await (await fetchRetry(GEM_SOURCE)).text();
  let gems = 0;
  for (const [, colour, img, rawName] of gemHtml.matchAll(GEM_ENTRY)) {
    const name = decode(rawName);
    if (seen.has(name)) continue;
    seen.add(name);
    const attr = GEM_COLOURS[colour] ?? 'Lineage';
    items.push({
      id: makeId(name),
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

  await mkdir(IMG_DIR, { recursive: true });
  let downloaded = 0;
  const queue = [...quiz];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let it; (it = queue.shift()); ) {
        const file = path.join(IMG_DIR, `${it.id}.webp`);
        if (await exists(file)) continue;
        const buf = Buffer.from(await (await fetchRetry(it.src)).arrayBuffer());
        await writeFile(file, buf);
        downloaded++;
      }
    }),
  );

  // The site's copies: AVIF, full size and in each THUMBS folder (scripts/upscale-art.py).
  const keepArt = new Set(quiz.map((it) => `${it.id}.webp`));
  const keepSite = new Set(quiz.map((it) => `${it.id}.avif`));
  const siteDirs = [SITE_DIR, ...THUMBS.map((t) => path.join(SITE_DIR, String(t)))];
  for (const dir of siteDirs) await mkdir(dir, { recursive: true });
  for (const f of await readdir(IMG_DIR)) if (!keepArt.has(f)) await unlink(path.join(IMG_DIR, f));
  for (const dir of siteDirs)
    for (const f of await readdir(dir, { withFileTypes: true })) if (f.isFile() && !keepSite.has(f.name)) await unlink(path.join(dir, f.name));
  const missing = [];
  for (const it of quiz) if (!(await Promise.all(siteDirs.map((d) => exists(path.join(d, `${it.id}.avif`))))).every(Boolean)) missing.push(it.id);

  quiz.sort((a, b) => a.name.localeCompare(b.name));
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  // Each item's art size (px of the original art): the site's pictures are
  // a whole number of times larger (artScale in src/lib/ui-paths.ts).
  const out = [];
  for (const { id, name, base, group, category, kind } of quiz) {
    const [w, h] = await webpSize(path.join(IMG_DIR, `${id}.webp`));
    out.push({ id, name, base, group, category, kind, w, h });
  }
  await writeFile(DATA_FILE, JSON.stringify(out, null, 1) + '\n');

  const perCat = {};
  for (const it of quiz) perCat[it.category] = (perCat[it.category] ?? 0) + 1;
  console.log(`${quiz.length} items (${downloaded} new images)`);
  console.table(perCat);
  if (missing.length) console.warn(`${missing.length} items have no upscaled art yet: run scripts/upscale-art.py (see its header).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
