#!/usr/bin/env node
// Scrapes the unique item list from poe2db.tw and downloads every item's art
// into public/items/. Writes the item index to src/data/uniques.json.
//
// Usage: npm run fetch-data
// Behind a proxy on Node 22+: NODE_USE_ENV_PROXY=1 npm run fetch-data

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readdir, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://poe2db.tw/us/Unique_item';
const IMG_DIR = path.join(ROOT, 'public', 'items');
const DATA_FILE = path.join(ROOT, 'src', 'data', 'uniques.json');

// Map the art folder (below Art/2DItems/) to a quiz category.
// Order matters: first matching prefix wins.
const CATEGORY_RULES = [
  ['Weapons/OneHandWeapons/OneHandMaces', 'One-Handed Maces'],
  ['Weapons/OneHandWeapons/OneHandSpears', 'Spears'],
  ['Weapons/OneHandWeapons/Scepters', 'Sceptres'],
  ['Weapons/OneHandWeapons/Wands', 'Wands'],
  ['Weapons/TwoHandWeapons/TwoHandMaces', 'Two-Handed Maces'],
  ['Weapons/TwoHandWeapons/WarStaves', 'Quarterstaves'],
  ['Weapons/TwoHandWeapons/Staves', 'Staves'],
  ['Weapons/TwoHandWeapons/Bows', 'Bows & Crossbows'],
  ['Weapons/TwoHandWeapons/Crossbows', 'Bows & Crossbows'],
  ['Offhand/Talismans', 'Talismans'],
  ['Offhand/Shields', 'Shields'],
  ['Offhand/Foci', 'Foci'],
  ['Quivers', 'Quivers'],
  ['Armours/BodyArmours', 'Body Armours'],
  ['Armours/Helmets', 'Helmets'],
  ['Armours/Gloves', 'Gloves'],
  ['Armours/Boots', 'Boots'],
  ['Amulets', 'Amulets'],
  ['Rings', 'Rings'],
  ['Belts', 'Belts'],
  ['Flasks', 'Flasks & Charms'],
  ['Charms', 'Flasks & Charms'],
  ['Jewels', 'Jewels'],
  ['Relics', 'Relics & Tablets'],
  ['Currency/PrecursorTablets', 'Relics & Tablets'],
];

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
  return CATEGORY_RULES.find(([prefix]) => rel.startsWith(prefix))?.[1];
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

  const items = [];
  const seen = new Set();
  const skipped = [];
  for (const m of body.matchAll(ENTRY)) {
    const [, img, slug, rawName, rawBase] = m;
    const name = decode(rawName);
    if (seen.has(name)) continue;
    seen.add(name);
    const category = categorize(img);
    if (!category) {
      skipped.push(`${name} (${img})`);
      continue;
    }
    // Hash the file name so the image URL does not give the answer away.
    const id = createHash('sha1').update(name).digest('hex').slice(0, 12);
    items.push({ id, name, base: decode(rawBase), category, slug, src: img });
  }
  if (items.length < 100) throw new Error(`Only ${items.length} items parsed; page layout changed?`);
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

  const keep = new Set(quiz.map((it) => `${it.id}.webp`));
  for (const f of await readdir(IMG_DIR)) if (!keep.has(f)) await unlink(path.join(IMG_DIR, f));

  quiz.sort((a, b) => a.name.localeCompare(b.name));
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const out = quiz.map(({ id, name, base, category }) => ({ id, name, base, category }));
  await writeFile(DATA_FILE, JSON.stringify(out, null, 1) + '\n');

  const perCat = {};
  for (const it of quiz) perCat[it.category] = (perCat[it.category] ?? 0) + 1;
  console.log(`${quiz.length} items (${downloaded} new images)`);
  console.table(perCat);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
