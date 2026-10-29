#!/usr/bin/env node
// Downloads the art of the 25 Path of Exile fossils into art-source/fossils/
// (<id>.webp), from poedb's image server. The icons are 78 x 78 WebP files; the
// site shows upscaled copies, which scripts/upscale-art.py --fossils makes
// into public/fossils/ afterwards. poe2db has no fossils, so they do not go
// through scripts/fetch-data.mjs.
//
// The file names are the ones each fossil's own poedb item page gives as its
// Icon, which are not always the fossil's name: the game's files call
// Scorched AmberFireFly, Frigid AmberFang, Bound Resonating, Opulent Perfect,
// Deft Enchanted, Fundamental Encrusted and Hollow AmberEye, spell Aberrant
// "Abberant", and give Sanctified the file called Gilded and Gilded the one
// called Sanctified. The picture each page shows is the one kept here, so a
// fossil is drawn the way the game draws it.
//
// Files already in art-source/fossils/ are kept unless the run says --all.
// Every download is checked to be a whole WebP of the size the other icons
// have before it is written.
//
// Usage: node scripts/fetch-fossil-art.mjs [--all]

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webpSize } from './webp-size.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, 'art-source', 'fossils');
const BASE = 'https://cdn.poedb.tw/image/Art/2DItems/Currency/Delve/';

// id -> the icon's file name on poedb (without .webp).
export const FOSSIL_ICONS = {
  scorched: 'AmberFireFly',
  frigid: 'AmberFang',
  metallic: 'MetallicFossil',
  jagged: 'JaggedFossil',
  aberrant: 'AbberantFossil',
  pristine: 'PristineFossil',
  dense: 'DenseFossil',
  corroded: 'CorrodedFossil',
  prismatic: 'PrismaticFossil',
  aetheric: 'AethericFossil',
  serrated: 'SerratedFossil',
  lucent: 'LucentFossil',
  shuddering: 'ShudderingFossil',
  bound: 'ResonatingFossil',
  opulent: 'PerfectFossil',
  deft: 'EnchantedFossil',
  fundamental: 'EncrustedFossil',
  faceted: 'FacetedFossil',
  bloodstained: 'BloodstainedFossil',
  hollow: 'AmberEye',
  fractured: 'FracturedFossil',
  glyphic: 'GlyphicFossil',
  tangled: 'TangledFossil',
  sanctified: 'GildedFossil',
  gilded: 'SanctifiedFossil',
};

const exists = (p) => access(p).then(() => true, () => false);

async function download(url, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'poe2-trivia data fetcher' } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (i >= tries - 1) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

async function main() {
  const redo = process.argv.includes('--all');
  await mkdir(OUT_DIR, { recursive: true });
  let got = 0;
  for (const [id, file] of Object.entries(FOSSIL_ICONS)) {
    const dest = path.join(OUT_DIR, `${id}.webp`);
    if (!redo && (await exists(dest))) continue;
    const url = `${BASE}${file}.webp`;
    const bytes = await download(url);
    const [w, h] = webpSize(bytes, url);
    if (w !== 78 || h !== 78) throw new Error(`${url} is ${w} x ${h}, not 78 x 78`);
    await writeFile(dest, bytes);
    got++;
    console.log(`${id} <- ${file}.webp (${bytes.length} bytes)`);
  }
  console.log(got ? `Fetched ${got} of ${Object.keys(FOSSIL_ICONS).length} fossil icons.` : 'All fossil art is already there.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
