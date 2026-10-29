#!/usr/bin/env node
// Scrapes unique items and lineage support gems from poe2db.tw and downloads
// their art into art-source/items/. Writes the item index to
// src/data/items.json, and their tooltips to src/data/itemStats.json
// (scripts/fetch-stats.mjs). An item drawn more than one way (Grand
// Spectrum's three jewels, each its own colour) keeps its other art as its
// variants: the list page shows only the first, so each unique's own page is
// read for the rest. The site shows upscaled copies of the art: run
// scripts/upscale-art.py afterwards for any new items (it says how),
// npm run looks and npm run bake-icons.
//
// Nothing is written until everything is fetched and checked: a run that
// stops leaves items.json, itemStats.json and the art as they were. An item
// that is no longer on poe2db stops it, unless the run says what became of
// it (scripts/refresh-plan.mjs): renamed, keeping its id, or dropped. It
// ends by saying what was added, renamed, dropped, changed and left out.
//
// Usage: npm run fetch-data
//   -- --rename "Old=>New"  Old is now called New: it keeps Old's id (codexes
//                           and achievements hold ids) and takes the new name
//   -- --drop "Name"        Name is gone for good
//   -- --shrink             accept noticeably fewer items (see below)
// Behind a proxy on Node 22+: NODE_USE_ENV_PROXY=1 npm run fetch-data

import { mkdir, writeFile, readdir, unlink, access, readFile } from 'node:fs/promises';
import { webpSize } from './webp-size.mjs';
import {
  collectStats,
  decode as decodeText,
  fetchRetry,
  hashId,
  ownBox,
  pageBoxes,
  readCommitted,
  statsReport,
  writeStats,
} from './fetch-stats.mjs';
import { artPlan, changedItems, reconcile, refreshArgs, summaryLines, withoutTooltip } from './refresh-plan.mjs';
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

const exists = (p) => access(p).then(() => true, () => false);

async function main() {
  const args = refreshArgs(process.argv.slice(2));
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

  // Nor when the items would shrink a lot: art and data deleted by a broken
  // fetch is worse than none (--shrink, when poe2db really dropped them).
  const beforeItems = await readFile(DATA_FILE, 'utf8').then((t) => JSON.parse(t), () => []);
  if (quiz.length < beforeItems.length * 0.9 && !args.shrink)
    throw new Error(`${quiz.length} items, ${beforeItems.length} before: page layout changed? (--shrink keeps the fewer)`);
  // Each item gone explained (--rename, --drop), or the run stops here. A renamed item takes its old id.
  const plan = reconcile(beforeItems, quiz, args);

  // Nothing is written until everything is fetched and checked, so a run
  // that fails leaves the data and art as they were. First the tooltips:
  // each unique's own box is its page's box with its art (the list's empty
  // hovers fall back to it).
  const ownBoxes = new Map(quiz.flatMap((it) => (it.boxes?.length ? [[it.id, ownBox(it.boxes, it.src.slice(ART.length)).html]] : [])));
  const variantBoxes = new Map(quiz.flatMap((it) => (it.variants ?? []).map((v) => [v.id, v.html])));
  const found = await collectStats(quiz, { ownBoxes, variantBoxes, committed: await readCommitted() });
  // A new item, or a new variant, with no tooltip waits for a refresh that has one.
  const bare = withoutTooltip(beforeItems, quiz, plan.added, found.missing);
  const leftOut = [...bare.items];
  for (const it of quiz)
    if (it.variants) {
      for (const v of it.variants) if (bare.variants.includes(v.id)) leftOut.push(`${it.name} (${v.base})`);
      it.variants = it.variants.filter((v) => !bare.variants.includes(v.id));
      if (!it.variants.length) delete it.variants;
    }
  const listed = quiz.filter((it) => !bare.items.includes(it.name));
  const added = plan.added.filter((name) => !bare.items.includes(name));
  /** Every picture to keep: each item's own, and its variants'. */
  const arts = listed.flatMap((it) => [it, ...(it.variants ?? [])]);

  // Then the art, held here: a picture not on disk yet, and a renamed item's,
  // whose art may have changed with its name (its file is its old id's).
  const onDisk = await readdir(IMG_DIR).catch(() => []);
  const artToDo = artPlan(
    arts.map((it) => it.id),
    onDisk,
    new Set(plan.renamed.map((r) => r.id)),
  );
  const fresh = new Map();
  const newArt = [];
  const downloads = arts.filter((it) => artToDo.fetch.includes(it.id));
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let it; (it = downloads.shift()); ) {
        const file = path.join(IMG_DIR, `${it.id}.webp`);
        const had = onDisk.includes(`${it.id}.webp`);
        const buf = Buffer.from(await (await fetchRetry(it.src)).arrayBuffer());
        webpSize(buf, it.src); // only a whole WebP file is kept
        if (had) {
          if (buf.equals(await readFile(file))) continue;
          newArt.push(it.name);
        }
        fresh.set(it.id, buf);
      }
    }),
  );

  listed.sort((a, b) => a.name.localeCompare(b.name));
  // Each item's art size (px of the original art): the site's pictures are
  // a whole number of times larger (artScale in src/lib/ui-paths.ts).
  const size = async (id) => webpSize(fresh.get(id) ?? (await readFile(path.join(IMG_DIR, `${id}.webp`))), `${id}.webp`);
  const out = [];
  for (const { id, name, base, group, category, kind, variants } of listed) {
    const [w, h] = await size(id);
    const more = [];
    for (const v of variants ?? []) {
      const [vw, vh] = await size(v.id);
      more.push({ id: v.id, base: v.base, w: vw, h: vh });
    }
    out.push({ id, name, base, group, category, kind, w, h, ...(more.length ? { variants: more } : {}) });
  }

  // Now the writing: the art, then the items and their tooltips.
  await mkdir(IMG_DIR, { recursive: true });
  for (const [id, buf] of fresh) await writeFile(path.join(IMG_DIR, `${id}.webp`), buf);
  // The site's copies: AVIF, full size and in each THUMBS folder (scripts/upscale-art.py).
  // A kept item's that are of its old art go, so they are made again.
  const siteDirs = [SITE_DIR, ...THUMBS.map((t) => path.join(SITE_DIR, String(t)))];
  for (const dir of siteDirs) await mkdir(dir, { recursive: true });
  const redo = new Set(listed.filter((it) => newArt.includes(it.name)).map((it) => `${it.id}.avif`));
  const keepSite = new Set(arts.map((it) => `${it.id}.avif`).filter((f) => !redo.has(f)));
  for (const f of artToDo.prune) await unlink(path.join(IMG_DIR, f));
  for (const dir of siteDirs)
    for (const f of await readdir(dir, { withFileTypes: true })) if (f.isFile() && !keepSite.has(f.name)) await unlink(path.join(dir, f.name));
  const missing = [];
  for (const it of arts) if (!(await Promise.all(siteDirs.map((d) => exists(path.join(d, `${it.id}.avif`))))).every(Boolean)) missing.push(it.id);

  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(out, null, 1) + '\n');
  await writeStats(listed, found.stats);

  const perCat = {};
  for (const it of listed) perCat[it.category] = (perCat[it.category] ?? 0) + 1;
  console.log(`${listed.length} items (${fresh.size} new images)`);
  console.table(perCat);
  for (const line of statsReport(listed, found)) console.log(line);
  if (missing.length) console.warn(`${missing.length} items have no upscaled art yet: run scripts/upscale-art.py (see its header).`);
  for (const line of summaryLines({ added, renamed: plan.renamed, dropped: plan.dropped, changed: changedItems(beforeItems, out), leftOut, newArt }))
    console.log(line);
  if (plan.renamed.length || added.length) console.log('src/data/fakes.json is by name: a new or renamed item needs its two fakes (tests/fakes.test.ts).');
}

main().catch((err) => {
  console.error(err.stop ? err.message : err);
  process.exit(1);
});
