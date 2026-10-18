#!/usr/bin/env node
// The QA sweep: every scene of the QA desk (src/qa, docs/qa.md), from every
// seat, at every size it is walked at, each in a browser that really is
// that device (its pixel ratio, touch, a phone's user agent), shot and
// checked the way the desk's frames check themselves (src/qa/frame/checks.ts:
// off the screen, text cut off, console errors, pictures, em dashes), and
// with --banding, scripts/find-banding.py on top. The desk marks every stop
// the sweep found something at, and walks the sizes it found it at too.
//
// By default it builds the beta (the only build with the desk) into
// screens/qa-build/ and serves that, many times faster to load than the dev
// server's hundreds of modules a page; --url points it at a server instead
// (the dev server, or https://poe2.quest/beta/). WebGL is hidden and motion
// reduced (CLAUDE.md, the headless-check skill) unless --webgl.
//
// Writes the shots and a manifest.json into screens/qa-<timestamp>/, and
// screens/qa-latest.json, which the dev server hands the desk.
//
// --map instead runs every scene once on a dev server of its own with the
// browser's coverage on, and writes src/data/sceneFiles.json: which of the
// game's files each scene runs, for the desk's "This change"
// (src/qa/change.ts). Run it when scenes or screens have changed much.
//
//   npm run qa -- [--sizes walk|full|phone,uhd,...] [--only <regex>] [--webgl] [--banding]
//                 [--url URL] [--no-build] [--concurrency N]
//   npm run qa -- --map
//   (from PowerShell, where npm eats the flags: npm run qa full webgl only=lobby)

import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { SIZES } from '../src/qa/sizes.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCREENS = path.join(ROOT, 'screens');
const BUILD = path.join(SCREENS, 'qa-build');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

const OPTIONS = {
  sizes: { type: 'string', default: 'walk' },
  only: { type: 'string' },
  url: { type: 'string' },
  build: { type: 'boolean', default: true },
  webgl: { type: 'boolean', default: false },
  banding: { type: 'boolean', default: false },
  map: { type: 'boolean', default: false },
  concurrency: { type: 'string', default: String(Math.max(2, os.availableParallelism() - 2)) },
  help: { type: 'boolean', short: 'h', default: false },
};
const { values, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true, allowNegative: true });
// Bare words, for PowerShell (see capture-screens.mjs): full, webgl, banding, no-build, name=value.
for (const word of positionals) {
  if (word === 'full' || word === 'walk') values.sizes = word;
  else if (word === 'webgl' || word === 'banding' || word === 'map' || word === 'help') values[word] = true;
  else if (word === 'no-build') values.build = false;
  else if (word.includes('=')) values[word.split('=')[0]] = word.slice(word.indexOf('=') + 1);
  else {
    console.error(`Don't know "${word}" (--help for the options).`);
    process.exit(1);
  }
}
if (values.help) {
  console.log(`The QA sweep: every scene, seat and size, shot and checked.

  --sizes walk|full|a,b  walk (default): each scene's own sizes, as the desk walks them;
                         full: every size in src/qa/sizes.ts; or keys: ${SIZES.map((s) => s.key).join(', ')}
  --only REGEX           only scenes whose key matches (lobby, game/delve, over/n-)
  --webgl                keep WebGL (the effects, on the GPU) and full motion
  --banding              run scripts/find-banding.py on each shot (implies --webgl; needs numpy and Pillow)
  --url URL              shoot a running server (the dev server, the beta) instead of building one
  --no-build             serve screens/qa-build/ as the last sweep built it
  --concurrency N        pages at once (default: all threads but two, ${OPTIONS.concurrency.default})
  --map                  write src/data/sceneFiles.json instead: the game's files each scene runs`);
  process.exit(0);
}
if (values.banding) values.webgl = true;
const concurrency = Math.max(1, Number(values.concurrency) || 1);
const only = values.only ? new RegExp(values.only) : null;

// ---- what to shoot ------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webm': 'video/webm' };

/** Builds the beta into screens/qa-build/ (unless told not to) and serves it; resolves to its address. */
async function serveBuild() {
  if (values.build || !existsSync(path.join(BUILD, 'qa.html'))) {
    console.log('Building the beta for the sweep (npm run qa -- --no-build skips this next time)…');
    const t0 = Date.now();
    const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    const r = spawnSync(process.execPath, [vite, 'build', '--outDir', BUILD, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, env: { ...process.env, VITE_CHANNEL: 'beta' }, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
    console.log(`Built in ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let file = path.join(BUILD, decodeURIComponent(url.pathname));
    if (!file.startsWith(BUILD)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

/** A dev server of the sweep's own, for --map: one module a file, so coverage says which files ran. */
async function serveDev() {
  const { createServer: viteServer } = await import('vite');
  const server = await viteServer({ root: ROOT, logLevel: 'error', server: { port: 0, strictPort: false, hmr: false } });
  await server.listen();
  return { base: server.resolvedUrls.local[0], close: () => server.close() };
}

const served = values.map ? await serveDev() : values.url ? { base: values.url.endsWith('/') ? values.url : `${values.url}/`, close: () => {} } : await serveBuild();
const base = served.base;

// Drawn on the GPU always: the game's blurs and shadows in software, a page
// at a time through one compositor, are what a sweep would spend its time
// on. (Without --webgl the pages still have no WebGL: hidden from them below.)
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || process.env.BOT_CHROMIUM || undefined,
  args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu', '--ignore-gpu-blocklist'],
});

const desk = await browser.newPage();
await desk.goto(`${base}qa.html`);
await desk.waitForFunction(() => window.__qaDesk, null, { timeout: 60000 });
const scenes = (await desk.evaluate(() => window.__qaDesk.scenes())).filter((s) => !only || only.test(s.key));
await desk.close();

if (values.map) values.sizes = 'desktop';
const pick = (s) => (values.sizes === 'walk' ? s.sizes : values.sizes === 'full' ? SIZES.map((x) => x.key) : values.sizes.split(',').map((k) => k.trim()));
for (const k of new Set(scenes.flatMap(pick))) {
  if (!SIZES.some((s) => s.key === k)) {
    console.error(`No size "${k}" (src/qa/sizes.ts has ${SIZES.map((s) => s.key).join(', ')}).`);
    process.exit(1);
  }
}
const jobs = scenes.flatMap((s) => pick(s).flatMap((size) => Array.from({ length: s.seats }, (_, seat) => ({ scene: s.key, label: s.label, seat, size }))));
if (!jobs.length) {
  console.error(only ? `No scene's key matches ${only}.` : 'No scenes.');
  process.exit(1);
}

// ---- shooting -----------------------------------------------------------------

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dirName = `qa-${stamp}`;
const outDir = path.join(SCREENS, dirName);
mkdirSync(outDir, { recursive: true });

/**
 * A context per worker and size, its jobs one after another: pages of one
 * site in one context share a renderer, so the workers' own contexts are
 * what lets them run side by side. Each frame keeps its own storage keys
 * (its slot) besides.
 */
const contexts = new Map();
async function contextFor(worker, key) {
  const id = `${worker}|${key}`;
  if (!contexts.has(id)) {
    const size = SIZES.find((s) => s.key === key);
    contexts.set(
      id,
      (async () => {
        const c = await browser.newContext({
          viewport: { width: size.w, height: size.h },
          deviceScaleFactor: size.dpr,
          isMobile: !!size.touch,
          hasTouch: !!size.touch,
          ...(size.touch ? { userAgent: MOBILE_UA } : {}),
          reducedMotion: values.webgl ? 'no-preference' : 'reduce',
        });
        if (!values.webgl)
          await c.addInitScript(() => {
            delete window.WebGL2RenderingContext;
            delete window.WebGLRenderingContext;
          });
        return c;
      })(),
    );
  }
  return contexts.get(id);
}

const fileOf = (j) => `${j.scene.replace(/\//g, '--')}__${j.seat}__${j.size}.png`;
/** --map: the game's files each job ran. */
const ran = new Map();
/**
 * The game's files of `entries` (the dev server's, one module a file) that
 * ran some function beyond their module's top level (whose range is the
 * whole file): a component that mounted, a function called.
 */
function ranFiles(entries) {
  const files = new Set();
  for (const e of entries) {
    const at = e.url.indexOf('/src/');
    if (at < 0) continue;
    const file = decodeURIComponent(e.url.slice(at + 1).split('?')[0]);
    if (file.startsWith('src/qa/')) continue;
    const top = (f) => f.ranges[0].startOffset === 0 && f.ranges[0].endOffset >= e.source.length - 1;
    if (e.functions.some((f) => !top(f) && f.ranges[0].count > 0)) files.add(file);
  }
  return files;
}
const shots = [];
let next = 0;
let done = 0;
const t0 = Date.now();
async function worker(w) {
  while (next < jobs.length) {
    const n = next++;
    const j = jobs[n];
    const started = Date.now();
    const page = await (await contextFor(w, j.size)).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      if (values.map) await page.coverage.startJSCoverage({ resetOnNavigation: false });
      const q = new URLSearchParams({ frame: `j${n}`, s: j.scene, seat: String(j.seat), size: j.size });
      await page.goto(`${base}qa.html?${q}`, { waitUntil: 'load', timeout: 60000 });
      const loaded = Date.now();
      await page.waitForFunction(() => window.__qa, null, { timeout: 60000 });
      const checked = Date.now();
      if (values.map) {
        ran.set(j, ranFiles(await page.coverage.stopJSCoverage()));
        continue;
      }
      const r = await page.evaluate(() => window.__qa);
      const file = fileOf(j);
      // At CSS pixels (a quarter of a 4K-at-200% shot's), unless banding is looked for, which shows only in the device's own.
      await page.screenshot({ path: path.join(outDir, file), animations: values.webgl ? 'allow' : 'disabled', caret: 'hide', scale: values.banding ? 'device' : 'css' });
      const times = { load: loaded - started, check: checked - loaded, shot: Date.now() - checked };
      shots.push({ ...j, file, settled: r.settled, problems: r.problems, ms: Date.now() - started, times });
    } catch (e) {
      shots.push({ ...j, file: null, failed: e.message.split('\n')[0], problems: [], ms: Date.now() - started, errors });
    } finally {
      await page.close();
      done++;
      if (process.stdout.isTTY) process.stdout.write(`\r${done}/${jobs.length} shots`);
    }
  }
}
console.log(`${jobs.length} shots of ${scenes.length} scenes, ${concurrency} at once, from ${base}`);
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, (_, w) => worker(w)));
if (process.stdout.isTTY) process.stdout.write('\n');
await browser.close();
served.close();

if (values.map) {
  // Every file's scenes; and the files at least 60% of the scenes run, which say nothing about any one.
  const byScene = new Map();
  for (const [j, files] of ran) byScene.set(j.scene, new Set([...(byScene.get(j.scene) ?? []), ...files]));
  const counts = new Map();
  for (const files of byScene.values()) for (const f of files) counts.set(f, (counts.get(f) ?? 0) + 1);
  const global = [...counts].filter(([, n]) => n >= byScene.size * 0.6).map(([f]) => f).sort();
  const files = {};
  for (const f of [...counts.keys()].filter((f) => !global.includes(f)).sort()) files[f] = [...byScene].filter(([, fs]) => fs.has(f)).map(([k]) => k);
  // One entry a line, so a merge conflict is easy to see (and to settle by running --map again).
  const lines = Object.entries(files).map(([f, ks]) => `    ${JSON.stringify(f)}: ${JSON.stringify(ks)}`);
  const out = `{\n  "global": ${JSON.stringify(global)},\n  "files": {\n${lines.join(',\n')}\n  }\n}\n`;
  writeFileSync(path.join(ROOT, 'src', 'data', 'sceneFiles.json'), out);
  const failed = jobs.filter((j) => !ran.has(j)).length;
  console.log(`src/data/sceneFiles.json: ${Object.keys(files).length} files over ${byScene.size} scenes, ${global.length} global${failed ? `; ${failed} frames failed` : ''}.`);
  process.exit(0);
}

// ---- banding ------------------------------------------------------------------

/** A Python that has numpy and Pillow, for find-banding.py: QA_PYTHON, or the first that does. */
function python() {
  for (const cmd of [process.env.QA_PYTHON, path.join(ROOT, '.venv-art', 'Scripts', 'python.exe'), path.join(ROOT, '.venv-art', 'bin', 'python'), 'python3', 'python', 'py'].filter(Boolean)) {
    const r = spawnSync(cmd, ['-c', 'import numpy, PIL'], { stdio: 'ignore' });
    if (r.status === 0) return cmd;
  }
  return null;
}
if (values.banding) {
  const py = python();
  if (!py) console.warn('Banding not checked: no Python with numpy and Pillow (pip install numpy pillow, or set QA_PYTHON).');
  else {
    console.log('Checking for banding…');
    const script = path.join(ROOT, 'scripts', 'find-banding.py');
    const queue = shots.filter((s) => s.file);
    const run = (s) =>
      new Promise((resolve) => {
        const p = spawn(py, [script, path.join(outDir, s.file), path.join(outDir, s.file.replace(/\.png$/, '.banding.png'))]);
        let out = '';
        p.stdout.on('data', (d) => (out += d));
        p.on('close', () => {
          const m = /([\d.]+)%\)/.exec(out);
          const share = m ? Number(m[1]) : 0;
          // A few stray steps are noise; past a tenth of a percent the eye finds them.
          if (share > 0.1) s.problems.push({ kind: 'banding', count: 1, examples: [`${share}% of the screen bands`] });
          resolve();
        });
      });
    let i = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (i < queue.length) await run(queue[i++]);
    }));
  }
}

// ---- what it found ------------------------------------------------------------

const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const manifest = {
  dir: dirName,
  at: new Date().toISOString(),
  url: values.url ?? 'beta build',
  head: git('rev-parse', 'HEAD'),
  dirty: git('status', '--porcelain') !== '',
  sizes: values.sizes,
  webgl: values.webgl,
  shots,
};
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
writeFileSync(path.join(SCREENS, 'qa-latest.json'), JSON.stringify(manifest));

const bad = shots.filter((s) => s.failed || s.problems.length);
console.log(`${shots.length} shots in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${bad.length} with something to look at; screens/${dirName}/`);
for (const s of bad) {
  const what = s.failed ? `failed: ${s.failed}` : s.problems.map((p) => `${p.kind}${p.count > 1 ? ` x${p.count}` : ''}: ${p.examples[0]}`).join('; ');
  console.log(`  ${s.scene} (seat ${s.seat}, ${s.size}): ${what}`);
}
const unsettled = shots.filter((s) => s.settled === false).length;
if (unsettled) console.log(`${unsettled} never came to rest within 8 s (checked as they were).`);
