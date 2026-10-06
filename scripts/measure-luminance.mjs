#!/usr/bin/env node
// Measures how bright Delve's backdrop is drawn, depth by depth, from the
// real renderer (lib/backdrop.ts) in headless Chromium, and works out the
// tables lib/descent.ts keeps its light by (ENV_ADD, ENV_HALL, MEASURED).
// Re-run it after changing what the backdrop draws or a stratum's look, and
// paste what `calibrate` prints over those tables.
//
// It serves a page that mounts only the backdrop (no app), through Vite with
// the project's own config, and reads the drawn frame back with readPixels:
// the average Rec. 709 luma of the 8-bit pixels, 0 to 1. The backdrop's
// reduced motion is switched from here (a stand-in for matchMedia), so with
// it on every frame is the same (the clock at 0, the embers still) and with
// it off the scene moves and several frames are averaged.
//
// Usage:
//   node scripts/measure-luminance.mjs curve [--from 1] [--to 200] [--motion] [--frames 6] [--skip 3] [--out f.json]
//     The average luma drawn at each depth, and its change from the one before
//     (with --motion, the average of --frames frames).
//   node scripts/measure-luminance.mjs calibrate --to 0
//     What each environment adds and how it darkens the hall at e = 0.25,
//     0.5, 0.75 and 1 (ENV_ADD, ENV_HALL; --e and --env for others): paste
//     them into lib/descent.ts, then
//   node scripts/measure-luminance.mjs calibrate --skip-env
//     Each depth to 91 (the last the zones show alone) drawn at light 1 and
//     0 against the estimate (MEASURED): paste it in too, and set every
//     zone's `measured` back to true in src/data/backdrops.json (the
//     corrections hold for the looks they were measured with).
//   node scripts/measure-luminance.mjs paired [--from 2] [--to 200] [--frames 8] [--out f.json]
//     With motion: each depth's change from the one before, the two shown by
//     turns so the scene's slow breathing (several % over a few seconds)
//     weighs on both alike.
//   node scripts/measure-luminance.mjs shots --depths 28-42,85-95 --dir out/ [--motion]
//     A screenshot of each depth.
// Options: --size 900x640 (the estimate's own screen; keep it), --port 5297.
// Needs Playwright with Chromium (PLAYWRIGHT: the module to import, CHROMIUM:
// the browser to launch, if not where Playwright looks); WebGL runs on
// SwiftShader, slowly: a few seconds a depth.

import { createServer } from 'vite';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith('--') ? args.shift() : 'curve';
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const [W, H] = String(opt('size', '900x640')).split('x').map(Number);
const ranges = (s) =>
  String(s)
    .split(',')
    .flatMap((r) => {
      const [a, b = a] = r.split('-').map(Number);
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    });

// The page: the backdrop alone, full screen, with reduced motion in our hands
// and the drawing buffer kept so it can be read back.
const PAGE = `<!doctype html><html><head><meta charset="UTF-8" />
<style>html, body { margin: 0; background: #000; overflow: hidden } canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block }</style>
</head><body><canvas id="c"></canvas>
<script type="module">
const motion = { matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null, fs: new Set(),
  addEventListener(t, f) { this.fs.add(f); }, removeEventListener(t, f) { this.fs.delete(f); },
  addListener(f) { this.fs.add(f); }, removeListener(f) { this.fs.delete(f); }, dispatchEvent() { return true; } };
const real = matchMedia.bind(window);
window.matchMedia = (q) => (q.includes('prefers-reduced-motion') ? motion : real(q));
let gl = null;
let draws = 0;
const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, attrs) {
  const c = getContext.call(this, type, type === 'webgl2' ? { ...attrs, preserveDrawingBuffer: true } : attrs);
  if (type === 'webgl2' && c && !gl) {
    gl = c;
    const draw = c.drawArrays.bind(c);
    c.drawArrays = (...a) => { draw(...a); if (c.getParameter(c.FRAMEBUFFER_BINDING) === null) draws++; };
  }
  return c;
};
const D = await import('/src/lib/descent.ts');
const { startBackdrop } = await import('/src/lib/backdrop.ts');
startBackdrop(document.getElementById('c'), () => console.log('context lost'));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function drawn() {
  const n = draws;
  for (let i = 0; i < 400 && draws === n; i++) await frame();
  if (draws === n) throw new Error('no frame drawn');
}
function luma() {
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return s / (w * h) / 255;
}
let changed = false;
const redraw = async () => { motion.fs.forEach((f) => f()); await drawn(); };
window.M = {
  D,
  /** Shows depth d, held still, and returns the scene drawn. */
  async depth(d) {
    motion.matches = true;
    // (A scene changed by set() is worked out afresh: shown somewhere else first.)
    if (changed) { D.setDescent(d + 0.001); await redraw(); changed = false; }
    D.setDescent(d);
    await redraw();
    const s = D.currentDescent();
    return { light: s.light, close: s.close, features: s.features };
  },
  /** Changes the scene shown (light, close, features, env as [i, e] pairs, the rest 0) and redraws it, held still. */
  async set(o) {
    changed = true;
    const s = D.currentDescent();
    for (const k of ['light', 'close', 'features']) if (k in o) s[k] = o[k];
    if (o.env) { s.look.env.fill(0); for (const [i, e] of o.env) s.look.env[i] = e; }
    if (o.look) for (const [k, v] of Object.entries(o.look)) s.look[k] = Array.isArray(v) ? [...v] : v;
    await redraw();
    return luma();
  },
  /**
   * The luma held still, or with motion that of n frames, every skip-th
   * frame drawn. (SwiftShader draws a frame in a good part of a second, and the
   * backdrop's clock steps at most a tenth of a second a frame, so they are
   * about 0.3 s of its time apart.)
   */
  async luma(moving = false, n = 6, skip = 3) {
    if (!moving) return luma();
    motion.matches = false;
    await redraw();
    const out = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < skip; k++) await drawn();
      out.push(luma());
    }
    motion.matches = true;
    await redraw();
    return out;
  },
  /**
   * With motion: depths a and b shown by turns (a b b a a b b a ...), each
   * for a frame drawn after one more, so the backdrop's slow breathing
   * weighs on both alike. Returns each one's average luma.
   */
  async paired(a, b, n = 8) {
    const sum = { [a]: 0, [b]: 0 };
    for (let i = 0; i < n; i++) {
      for (const d of i % 2 ? [b, a] : [a, b]) {
        motion.matches = true;
        D.setDescent(d);
        await redraw();
        motion.matches = false;
        await redraw();
        await drawn();
        sum[d] += luma();
      }
    }
    motion.matches = true;
    return [sum[a] / n, sum[b] / n];
  },
};
window.ready = true;
</script></body></html>`;

const server = await createServer({
  root: ROOT,
  configFile: path.join(ROOT, 'vite.config.ts'),
  logLevel: 'warn',
  server: { port: Number(opt('port', 5297)), strictPort: false, hmr: false, watch: null },
  plugins: [
    {
      name: 'measure-page',
      configureServer(s) {
        s.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/__measure')) return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(await s.transformIndexHtml(req.url, PAGE));
        });
      },
    },
  ],
});
await server.listen();
const url = `${server.resolvedUrls.local[0]}__measure.html`;

const pw = await import(process.env.PLAYWRIGHT ?? 'playwright').catch(() => import('/opt/node-tools/node_modules/playwright/index.mjs'));
const browser = await pw.chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => console.error('[page]', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await page.goto(url);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
const M = (f, a) => page.evaluate(f, a);

try {
  if (mode === 'curve') {
    const from = Number(opt('from', 1));
    const to = Number(opt('to', 200));
    const moving = !!opt('motion', false);
    const frames = Number(opt('frames', 6));
    const rows = [];
    let prev = NaN;
    for (let d = from; d <= to; d++) {
      const s = await M((d) => M.depth(d), d);
      const l = await M(([m, n, k]) => M.luma(m, n, k), [moving, frames, Number(opt('skip', 3))]);
      const mean = Array.isArray(l) ? l.reduce((a, b) => a + b, 0) / l.length : l;
      rows.push({ d, mean, frames: Array.isArray(l) ? l : undefined, ...s });
      console.log([d, mean.toFixed(5), Number.isNaN(prev) ? '' : `${(100 * (mean / prev - 1)).toFixed(2)}%`, s.light.toFixed(3)].join('\t'));
      prev = mean;
    }
    const out = opt('out', null);
    if (out) writeFileSync(out, JSON.stringify(rows));
  } else if (mode === 'paired') {
    // Each depth against the one before, with motion, by turns (see M.paired).
    const from = Number(opt('from', 2));
    const to = Number(opt('to', 200));
    const n = Number(opt('frames', 8));
    const rows = [];
    for (let d = from; d <= to; d++) {
      const [a, b] = await M(([a, b, n]) => M.paired(a, b, n), [d - 1, d, n]);
      rows.push({ d, before: a, mean: b, change: b / a - 1 });
      console.log([d, b.toFixed(5), `${(100 * (b / a - 1)).toFixed(2)}%`].join('\t'));
    }
    const out = opt('out', null);
    if (out) writeFileSync(out, JSON.stringify(rows));
  } else if (mode === 'shots') {
    const dir = String(opt('dir', '.'));
    mkdirSync(dir, { recursive: true });
    for (const d of ranges(opt('depths', '1-10'))) {
      await M((d) => M.depth(d), d);
      if (opt('motion', false)) await M(() => M.luma(true, 1));
      await page.screenshot({ path: path.join(dir, `d${String(d).padStart(3, '0')}.png`) });
      console.log('shot', d);
    }
  } else if (mode === 'calibrate') {
    const to = Number(opt('to', 91));
    const E = String(opt('e', '0.25,0.5,0.75,1')).split(',').map(Number);
    const only = opt('env', null);
    // Each environment at full features, no dark closed in, in its own stratum's hall.
    const add = [];
    const hall = [];
    const STRATA = opt('skip-env', false) ? 0 : await M(() => M.D.STRATA.length);
    for (let i = 0; i < STRATA; i++) {
      if (only !== null && !ranges(only).includes(i)) continue;
      await M((i) => M.depth(10 * i + 1), i);
      const base = { close: 0, features: 1 };
      const h0 = (await M((o) => M.set(o), { ...base, light: 1, env: [] })) - (await M((o) => M.set(o), { ...base, light: 0, env: [] }));
      const a = [0];
      const k = [1];
      for (const e of E) {
        const l0 = await M((o) => M.set(o), { ...base, light: 0, env: [[i, e]] });
        const l1 = await M((o) => M.set(o), { ...base, light: 1, env: [[i, e]] });
        const e0 = await M((o) => M.set(o), { ...base, light: 0, env: [] });
        a.push(l0 - e0);
        k.push((l1 - l0) / h0);
      }
      add.push(a);
      hall.push(k);
      console.error('env', i, a.map((v) => v.toFixed(5)).join(' '), k.map((v) => v.toFixed(3)).join(' '));
    }
    const fmt = (rows, n) => rows.map((r) => `  [${r.map((v) => +v.toFixed(n)).join(', ')}],`).join('\n');
    if (add.length) {
      console.log(`export const ENV_ADD: number[][] = [\n${fmt(add, 5)}\n];`);
      console.log(`export const ENV_HALL: number[][] = [\n${fmt(hall, 3)}\n];`);
    }
    // Each depth, drawn at light 1 and 0, against the estimate (worked out
    // with the ENV_ tables in lib/descent.ts as they stand: paste the ones
    // just printed first, then run again with --skip-env for MEASURED).
    const rows = [];
    for (let d = 1; d <= to; d++) {
      await M((d) => M.depth(d), d);
      const l1 = await M((o) => M.set(o), { light: 1 });
      const l0 = await M((o) => M.set(o), { light: 0 });
      const est = await M((d) => { const x = M.D.descent(d); return M.D.estimateLuminance(x.look, x.close, x.features); }, d);
      rows.push([(l1 - l0) / est.hall, l0 / est.rest]);
      console.error(d, l1.toFixed(5), l0.toFixed(5), ((l1 - l0) / est.hall).toFixed(3), (l0 / est.rest).toFixed(3));
    }
    console.log(`export const MEASURED: (readonly [number, number])[] = [\n${rows.map((r) => `[${r.map((v) => +v.toFixed(3)).join(', ')}]`).join(', ')}\n];`);
  }
} finally {
  await browser.close();
  await server.close();
}
