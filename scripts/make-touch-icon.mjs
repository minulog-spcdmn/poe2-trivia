// Builds public/apple-touch-icon.png, the icon iOS puts on the home screen,
// from public/favicon.svg: the same gold full stop of Maragsâ on the same
// dark ground, but square and full bleed (iOS rounds the corners itself and
// would show the favicon's own rounded corners as black) and with more room
// around the glyph, as a home screen icon wants.
// Run after changing the favicon: node scripts/make-touch-icon.mjs
// Chromium: Playwright's own (npx playwright-core install chromium), or any
// Chromium or Chrome named by CHROMIUM.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const SIZE = 180;
/** The glyph's height as a share of the icon (the favicon's is about 0.8). */
const GLYPH = 0.64;

const favicon = readFileSync('public/favicon.svg', 'utf8');
const ground = favicon.match(/<rect [^>]*fill="(#[0-9a-f]+)"/i)[1];
const defs = favicon.match(/<defs>.*<\/defs>/s)[0];
const d = favicon.match(/<path [^>]*d="([^"]+)"/)[1];

// The glyph's box in font units (y runs upward), from the path's own points.
const nums = d.match(/-?[\d.]+/g).map(Number);
const xs = nums.filter((_, i) => i % 2 === 0);
const ys = nums.filter((_, i) => i % 2 === 1);
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const scale = (GLYPH * SIZE) / (y1 - y0);
const tx = SIZE / 2 - ((x0 + x1) / 2) * scale;
const ty = SIZE / 2 + ((y0 + y1) / 2) * scale;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${defs}<rect width="${SIZE}" height="${SIZE}" fill="${ground}"/><path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)} ${(-scale).toFixed(4)})" d="${d}" fill="url(#g)"/></svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.locator('svg').screenshot({ path: 'public/apple-touch-icon.png', omitBackground: false });
await browser.close();
console.log(`public/apple-touch-icon.png: ${SIZE} x ${SIZE}, glyph scale ${scale.toFixed(4)}`);
