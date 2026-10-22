// Builds the home screen icons from public/favicon.svg: the same gold full
// stop of Maragsâ on the same dark ground, but square and full bleed (iOS and
// Android round or cut the corners themselves and would show the favicon's
// own rounded corners as black) and with more room around the glyph, as a
// home screen icon wants. public/apple-touch-icon.png is iOS's; the icon-*
// ones are Android's, named in public/manifest.webmanifest. The maskable one
// keeps the glyph well inside the middle 80%, the part every launcher's mask
// (circle, squircle, teardrop) leaves showing.
// Run after changing the favicon: node scripts/make-touch-icon.mjs
// Chromium: Playwright's own (npx playwright-core install chromium), or any
// Chromium or Chrome named by CHROMIUM.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/** Each icon: its file, its size and the glyph's height as a share of it (the favicon's is about 0.8). */
const ICONS = [
  { file: 'public/apple-touch-icon.png', size: 180, glyph: 0.64 },
  { file: 'public/icon-192.png', size: 192, glyph: 0.64 },
  { file: 'public/icon-512.png', size: 512, glyph: 0.64 },
  { file: 'public/icon-maskable-512.png', size: 512, glyph: 0.52 },
];

const favicon = readFileSync('public/favicon.svg', 'utf8');
const ground = favicon.match(/<rect [^>]*fill="(#[0-9a-f]+)"/i)[1];
const defs = favicon.match(/<defs>.*<\/defs>/s)[0];
const d = favicon.match(/<path [^>]*d="([^"]+)"/)[1];

// The glyph's box in font units (y runs upward), from the path's own points.
const nums = d.match(/-?[\d.]+/g).map(Number);
const xs = nums.filter((_, i) => i % 2 === 0);
const ys = nums.filter((_, i) => i % 2 === 1);
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const { file, size, glyph } of ICONS) {
  const scale = (glyph * size) / (y1 - y0);
  const tx = size / 2 - ((x0 + x1) / 2) * scale;
  const ty = size / 2 + ((y0 + y1) / 2) * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${defs}<rect width="${size}" height="${size}" fill="${ground}"/><path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)} ${(-scale).toFixed(4)})" d="${d}" fill="url(#g)"/></svg>`;
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.locator('svg').screenshot({ path: file, omitBackground: false });
  await page.close();
  console.log(`${file}: ${size} x ${size}, glyph scale ${scale.toFixed(4)}`);
}
await browser.close();
