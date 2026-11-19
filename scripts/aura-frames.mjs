// Stills of a player aura (the try-out, qa/benches/auras.ts) as it moves,
// for judging it without watching it: the aura's bench in headless Chromium
// on the real GPU (WebGL on, the effects drawn), shot every so often and laid
// out on one contact sheet, oldest first, left to right.
//
//   node scripts/aura-frames.mjs --aura breach [--size 112] [--shots 8] [--every 250] [--wait 7000] [--hue 1] [--sigil witch] [--k react=score] [--out <dir>] [--base http://localhost:5193/]
//
// Or a scene of the game's own (qa/scenes/) with everyone wearing auras (each
// their own, or --aura for all), the whole page at a size (CSS px):
//
//   node scripts/aura-frames.mjs --scene game/race-question [--aura each] [--vp 390x844] [--seat 0] [--k players=12]
//
// Writes <out>/<aura>-sheet.png (and each shot beside it). A dev server must
// be running at --base. One browser, closed at the end: run it once per look.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const { values: a } = parseArgs({
  options: {
    // (Without one: breach on the bench; in a scene, each their own.)
    aura: { type: 'string' },
    size: { type: 'string', default: '112' },
    shots: { type: 'string', default: '8' },
    every: { type: 'string', default: '250' },
    // (An aura's own program compiles the first time it shows: a few seconds on ANGLE.)
    wait: { type: 'string', default: '7000' },
    hue: { type: 'string', default: '1' },
    sigil: { type: 'string', default: '' },
    scene: { type: 'string', default: '' },
    vp: { type: 'string', default: '390x844' },
    seat: { type: 'string', default: '0' },
    k: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: 'screens/auras' },
    base: { type: 'string', default: 'http://localhost:5193/' },
  },
});

a.aura ??= a.scene ? 'each' : 'breach';
const out = path.resolve(a.out);
// (A scene's shots by the scene and its size.)
const named = a.scene ? `${a.scene.replaceAll('/', '-')}-${a.vp}` : a.aura;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chromium',
  args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu', '--ignore-gpu-blocklist'],
});
try {
  const [vw, vh] = a.scene ? a.vp.split('x').map(Number) : [640, 440];
  // (A phone's width is a phone: touch, its pixel ratio, its user agent.)
  const phone = a.scene && vw < 768;
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: phone ? 3 : 2, isMobile: !!phone, hasTouch: !!phone });
  // The dev server's live reload, answered here and never passed on: another
  // session saving a file would reload the page in the middle of the shots.
  const base = new URL(a.base);
  await context.routeWebSocket((u) => u.host === base.host, () => {});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // (A shader that won't compile only warns.)
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  // (--k react=<moment>: the bench's button for it, pressed every 3 s from the start, as the desk's panel would.)
  const react = a.k.find((kv) => kv.startsWith('react='))?.slice(6);
  const given = Object.fromEntries(
    a.k
      .filter((kv) => !kv.startsWith('react='))
      .map((kv) => kv.split('='))
      .map(([k, v]) => [`k.${k}`, v]),
  );
  const q = a.scene
    ? new URLSearchParams({ frame: 'f', s: a.scene, seat: a.seat, 'k.auras': a.aura, ...given })
    : new URLSearchParams({ frame: 'f', b: 'auras', 'k.aura': a.aura, 'k.size': a.size, 'k.hue': a.hue, o: '0', ...given });
  if (a.sigil) q.set(a.scene ? 'k.sigils' : 'k.sigil', a.scene ? '1' : a.sigil);
  await page.goto(`${a.base}qa.html?${q}`);
  if (react && !a.scene) await page.evaluate((key) => setInterval(() => postMessage({ qa: 'action', key }, location.origin), 3000), react);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(Number(a.wait));
  let clip = { x: 0, y: 0, width: vw, height: vh };
  if (!a.scene) {
    const box = await page.evaluate(() => {
      const r = document.querySelector('.pair')?.getBoundingClientRect();
      return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    });
    if (!box) throw new Error(`The bench drew nothing to shoot (is the dev server on, and the aura known?)\n${errors.join('\n')}`);
    const m = 120;
    clip = { x: Math.max(0, box.x - m), y: Math.max(0, box.y - m), width: Math.min(640, box.w + 2 * m), height: box.h + 2 * m };
    clip.width = Math.min(clip.width, 640 - clip.x);
    clip.height = Math.min(clip.height, vh - clip.y);
  }
  const shots = [];
  for (let i = 0; i < Number(a.shots); i++) {
    if (i) await page.waitForTimeout(Number(a.every));
    const png = await page.screenshot({ clip });
    const file = path.join(out, `${named}-${i}.png`);
    writeFileSync(file, png);
    shots.push(png.toString('base64'));
  }
  // The contact sheet: the shots in rows of four, each at half its pixels (its CSS size).
  const sheet = await context.newPage();
  const cols = Math.min(4, shots.length);
  await sheet.setViewportSize({ width: Math.ceil(cols * (clip.width + 6)), height: Math.ceil(Math.ceil(shots.length / cols) * (clip.height + 6)) });
  await sheet.setContent(
    `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${clip.width}px);gap:6px">${shots
      .map((s) => `<img src="data:image/png;base64,${s}" style="width:${clip.width}px;height:${clip.height}px">`)
      .join('')}</body>`,
  );
  await sheet.waitForLoadState('load');
  const sheetFile = path.join(out, `${named}-sheet.png`);
  await sheet.screenshot({ path: sheetFile, fullPage: true });
  console.log(`sheet: ${sheetFile}`);
  if (errors.length) console.log(`page errors:\n${[...new Set(errors)].join('\n')}`);
} finally {
  await browser.close();
}
