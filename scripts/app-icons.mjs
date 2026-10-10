#!/usr/bin/env node
// Draws the icons the game has once it's added to a phone's home screen (the
// web app manifest, vite.config.ts, and the apple-touch-icon in index.html)
// from the favicon's glyph: the gold mark on the favicon's dark ground, square
// and full bleed (the phone rounds or masks the corners itself), the mark
// inside the middle 80% that a maskable icon promises to keep. Re-run it after
// changing public/favicon.svg:
//   node scripts/app-icons.mjs
// Needs Chromium: playwright-core's own, or the browser CHROMIUM names.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/icons');
/** The share of the icon the mark's box takes. */
const MARK = 0.56;

const favicon = readFileSync(path.join(ROOT, 'public/favicon.svg'), 'utf8');
const ground = /<rect[^>]*fill="([^"]+)"/.exec(favicon)[1];
const defs = /<defs>.*<\/defs>/s.exec(favicon)[0];
const mark = /<path[^>]*\/>/s.exec(favicon)[0];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${defs}${mark}</svg>`);
// The mark's own box in the favicon's 32 units, to centre it.
const box = await page.evaluate(() => {
  const b = document.querySelector('path').getBBox();
  const m = document.querySelector('path').transform.baseVal.consolidate().matrix;
  const xs = [b.x, b.x + b.width].map((x) => m.a * x + m.e);
  const ys = [b.y, b.y + b.height].map((y) => m.d * y + m.f);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) };
});
const scale = (32 * MARK) / Math.max(box.w, box.h);
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${defs}<rect width="32" height="32" fill="${ground}"/><g transform="translate(16 16) scale(${scale}) translate(${-(box.x + box.w / 2)} ${-(box.y + box.h / 2)})">${mark}</g></svg>`;

for (const [file, size] of [
  ['app-192.png', 192],
  ['app-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${icon}`);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: false });
  console.log(`public/icons/${file}`);
}
await browser.close();
