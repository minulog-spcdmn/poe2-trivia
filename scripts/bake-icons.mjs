#!/usr/bin/env node
// Measures every category card's emblem and the items behind it (lib/ui,
// categoryIcons) and writes their fits to src/data/iconFits.json, and their
// clean masks to public/icons/masks/ (lossless WebP, through ffmpeg; PNG
// without it), so the cards are laid out and drawn clean from their first
// frame (lib/iconFit). Measured in
// Chromium with the page's own code (iconFit's fitOf), on the dev server,
// so the pictures are decoded as players' browsers decode them.
//
// Run it after the art or the items standing for a category change (a
// page that finds an icon missing says so in the console, in dev).
//
// Chromium: Playwright's own (npx playwright-core install chromium), or any
// Chromium or Chrome named by BOT_CHROMIUM.
//
//   npm run bake-icons

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'iconFits.json');
/** Where the masks go, from the site's base (public/). */
const MASKS = 'icons/masks/';

// The page's code imports the fits it bakes, so a missing or broken file (a
// merge's conflict markers) would stop it loading: start such a one afresh.
try {
  JSON.parse(readFileSync(OUT, 'utf8'));
} catch {
  writeFileSync(OUT, '{}\n');
}

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.BOT_CHROMIUM || undefined });
try {
  const page = await browser.newPage();
  // The app itself needn't run: a blank page on the server is enough to load the modules.
  await page.route('**/__bake', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>bake</title>' }));
  const base = server.resolvedUrls.local[0];
  await page.goto(new URL('__bake', base).href);
  const fits = await page.evaluate(async () => {
    const ui = await import('/src/lib/ui.ts');
    const { cleanMask, fitOf, pixelsOf } = await import('/src/lib/iconFit.svelte.ts');
    // The dev server's base is the site's root.
    const root = new URL('/', location.href).href;
    /** A canvas as PNG, base64. */
    const encode = async (c) => {
      const raw = new Uint8Array(await (await new Promise((done) => c.toBlob(done, 'image/png'))).arrayBuffer());
      let bin = '';
      for (let i = 0; i < raw.length; i += 0x8000) bin += String.fromCharCode(...raw.subarray(i, i + 0x8000));
      return btoa(bin);
    };
    const out = {};
    for (const url of new Set(ui.categoryIcons())) {
      if (!url.startsWith(root)) throw new Error(`${url} isn't under ${root}`);
      const p = await pixelsOf(url);
      if (!p) throw new Error(`no 2D canvas for ${url}`);
      const fit = fitOf(p.rgba, p.iw, p.ih);
      if (fit) out[url.slice(root.length)] = { fit, mask: await encode(cleanMask(p)) };
    }
    return out;
  });
  // Each mask named after its picture (its file's name, without the extension).
  const dir = path.join(ROOT, 'public', MASKS);
  mkdirSync(dir, { recursive: true });
  const kept = new Set();
  for (const [pic, entry] of Object.entries(fits)) {
    const stem = path.basename(pic, path.extname(pic));
    const png = path.join(dir, `${stem}.png`);
    writeFileSync(png, Buffer.from(entry.mask, 'base64'));
    let name = `${stem}.png`;
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-lossless', '1', '-compression_level', '6', path.join(dir, `${stem}.webp`)]);
      rmSync(png);
      name = `${stem}.webp`;
    } catch {
      console.warn(`no ffmpeg with libwebp: ${name} stays PNG`);
    }
    if (kept.has(name)) throw new Error(`two icons would share the mask ${name}`);
    kept.add(name);
    fits[pic] = { ...entry.fit, mask: MASKS + name };
  }
  // Masks of icons no card shows any more.
  for (const old of readdirSync(path.join(ROOT, 'public', MASKS))) if (!kept.has(old)) rmSync(path.join(ROOT, 'public', MASKS, old));
  const sorted = Object.fromEntries(Object.entries(fits).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`${Object.keys(sorted).length} icons → ${path.relative(ROOT, OUT)}, their masks in public/${MASKS}`);
} finally {
  await browser.close();
  await server.close();
}
