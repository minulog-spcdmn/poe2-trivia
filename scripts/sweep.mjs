#!/usr/bin/env node
// The QA sweep: every scene of the QA desk (src/qa, docs/qa.md), from every
// seat, at every size it is walked at, each in a browser that really is
// that device (its pixel ratio, touch, a phone's user agent), shot and
// checked the way the desk's frames check themselves (src/qa/frame/checks.ts:
// off the screen, text cut off, console errors, pictures, em dashes), and
// with --banding, scripts/find-banding.py on top. It prints what it found:
// it's for the machine, so nobody has to look through its shots.
//
// By default it builds the beta (the only build with the desk) into
// screens/qa-build/ and serves that, many times faster to load than the dev
// server's hundreds of modules a page; --url points it at a server instead
// (the dev server, or https://poe2.quest/beta/). WebGL is hidden and motion
// reduced (CLAUDE.md, the headless-check skill) unless --webgl.
//
// Writes the shots and a manifest.json into screens/qa-<timestamp>/.
//
// --map instead runs every scene once on a dev server of its own with the
// browser's coverage on, and writes src/data/sceneFiles.json: which of the
// game's files each scene runs, for the desk's "This change"
// (src/qa/change.ts). Run it when scenes or screens have changed much.
//
// --redraws instead checks what Chrome draws again (src/qa/redraws.ts,
// docs/qa.md, "Redraws"): each scene's first state at rest, and the card
// bench's moments (a deal, a dig's deal, a pick), traced with WebGL and full
// motion on. It fails on a layer drawn again on most frames at rest, and on
// a moment past its baseline (src/qa/redraws.json; --baseline writes it).
// It runs in CI on every pull request; here only with --only.
//
//   npm run sweep -- [--sizes walk|full|phone,uhd,...] [--only <regex>] [--change] [--webgl] [--banding]
//                 [--url URL] [--no-build] [--concurrency N]
//   npm run sweep -- --map
//   npm run sweep -- --redraws --only <regex> [--moments] [--baseline]
//   (from PowerShell, where npm eats the flags: npm run sweep full webgl only=lobby)

import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { SIZES } from '../src/qa/sizes.ts';
import { touched } from '../src/qa/change.ts';
import { FEWEST_FRAMES, MOMENTS, atRest, kpx, overBaseline, readTrace, redraws } from '../src/qa/redraws.ts';
import { changedFiles } from '../qaServer.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCREENS = path.join(ROOT, 'screens');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

const OPTIONS = {
  sizes: { type: 'string', default: 'walk' },
  only: { type: 'string' },
  url: { type: 'string' },
  build: { type: 'boolean', default: true },
  webgl: { type: 'boolean', default: false },
  banding: { type: 'boolean', default: false },
  change: { type: 'boolean', default: false },
  map: { type: 'boolean', default: false },
  redraws: { type: 'boolean', default: false },
  moments: { type: 'boolean', default: false },
  baseline: { type: 'boolean', default: false },
  concurrency: { type: 'string', default: String(Math.max(2, os.availableParallelism() - 2)) },
  help: { type: 'boolean', short: 'h', default: false },
};
const { values, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true, allowNegative: true });
// Bare words, for PowerShell (see capture-screens.mjs): full, webgl, banding, change, map, no-build, name=value.
for (const word of positionals) {
  if (word === 'full' || word === 'walk') values.sizes = word;
  else if (['webgl', 'banding', 'change', 'map', 'redraws', 'moments', 'baseline', 'help'].includes(word)) values[word] = true;
  else if (word === 'no-build') values.build = false;
  else if (word.includes('=')) values[word.split('=')[0]] = word.slice(word.indexOf('=') + 1);
  else {
    console.error(`Don't know "${word}" (--help for the options).`);
    process.exit(1);
  }
}
if (values.help) {
  console.log(`The QA sweep: every scene, seat and size, shot and checked.

  --sizes walk|full|a,b  walk (default): the usual sizes and each scene's own;
                         full: every size in src/qa/sizes.ts; or keys: ${SIZES.map((s) => s.key).join(', ')}
  --only REGEX           only scenes whose key matches (lobby, game/delve, over/n-)
  --webgl                keep WebGL (the effects, on the GPU) and full motion
  --banding              run scripts/find-banding.py on each shot (implies --webgl; needs numpy and Pillow)
  --change               only the scenes this branch's changes touch (as the desk's This change)
  --url URL              shoot a running server (the dev server, the beta) instead of building one
  --no-build             serve screens/qa-build/ as the last sweep built it
  --concurrency N        pages at once (default: all threads but two, ${OPTIONS.concurrency.default})
  --map                  write src/data/sceneFiles.json instead: the game's files each scene runs
  --redraws              check what Chrome draws again instead (docs/qa.md, Redraws): every scene's first
                         state at rest, and the card bench's moments; here only with --only (CI runs it all)
  --moments              with --redraws: the card bench's moments (alone, or with --only's scenes)
  --baseline             with --redraws: write the moments as measured into src/qa/redraws.json`);
  process.exit(0);
}
if (values.baseline) values.moments = true;
if (values.redraws && !values.only && !values.moments && !process.env.CI) {
  // Every scene in a browser drawing WebGL at full motion: CI's to run, not a machine others share.
  console.error('The redraw check runs in CI on every pull request; here only a scene or two (--redraws --only <regex>) or the moments (--redraws --moments).');
  process.exit(1);
}
if (values.banding) values.webgl = true;
const concurrency = Math.max(1, Number(values.concurrency) || 1);
const only = values.only ? new RegExp(values.only) : null;
const t0 = Date.now();
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

// ---- serving ------------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webm': 'video/webm' };

/** Builds the beta of the checkout at `root` into `out`. */
function buildBeta(root, out, what) {
  console.log(`Building the beta of ${what}…`);
  const started = Date.now();
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const r = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, env: { ...process.env, VITE_CHANNEL: 'beta' }, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`Built in ${((Date.now() - started) / 1000).toFixed(0)} s.`);
}

/** Serves the files under `dir`; resolves to its address. */
async function serveDir(dir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir)) return void res.writeHead(403).end();
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

// ---- shooting -----------------------------------------------------------------

// Drawn on the GPU always: the game's blurs and shadows in software, a page
// at a time through one compositor, are what a sweep would spend its time
// on. (Without --webgl the pages still have no WebGL: hidden from them below.)
// New headless (not the headless shell): the real GPU, and a process a site.
const launch = () =>
  chromium.launch({
    ...(process.env.CHROMIUM || process.env.BOT_CHROMIUM ? { executablePath: process.env.CHROMIUM || process.env.BOT_CHROMIUM } : { channel: 'chromium' }),
    args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu', '--ignore-gpu-blocklist'],
  });
/**
 * A browser for every few workers: one browser's own process (its GPU
 * process, its compositing, its screenshots) is what a crowd of pages ends
 * up waiting on, past about four of them.
 */
const PER_BROWSER = 4;
// (--redraws traces, which is a browser's own: it launches one a page.)
const browsers = values.redraws ? [] : await Promise.all(Array.from({ length: Math.ceil(concurrency / PER_BROWSER) }, launch));

/** Every state of every scene the desk at `base` has: its scene's key, its number there and controls, label, seats, the sizes it is walked at. */
async function listScenes(base, browser = browsers[0]) {
  const desk = await browser.newPage();
  // (A dev server just started builds the desk's modules as it first asks for them: that can take a while.)
  await desk.goto(`${base}qa.html`, { timeout: 120000 });
  await desk.waitForFunction(() => window.__qaDesk, null, { timeout: 60000 });
  const scenes = await desk.evaluate(() => window.__qaDesk.scenes());
  await desk.close();
  return scenes;
}

const fileOf = (j) => `${j.scene.replace(/\//g, '--')}${j.n ? `-${j.n}` : ''}__${j.seat}__${j.size}.png`;

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

/**
 * Opens each job's frame at `base`, waits for its check, and shoots it into
 * `outDir` (with `coverage`: notes the files it ran instead). A context per
 * worker and size, its jobs one after another: pages of one site in one
 * context share a renderer, so the workers' own contexts are what lets them
 * run side by side. Each frame keeps its own storage keys (its slot) besides.
 */
async function shootAll(base, jobs, outDir, { coverage = false, concurrency: at = concurrency } = {}) {
  mkdirSync(outDir, { recursive: true });
  const contexts = new Map();
  const contextFor = (worker, key) => {
    const id = `${worker}|${key}`;
    if (!contexts.has(id)) {
      const size = SIZES.find((s) => s.key === key);
      contexts.set(
        id,
        (async () => {
          const c = await browsers[worker % browsers.length].newContext({
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
  };
  const shots = [];
  const ran = new Map();
  let next = 0;
  let done = 0;
  const worker = async (w) => {
    while (next < jobs.length) {
      const n = next++;
      const j = jobs[n];
      const started = Date.now();
      const page = await (await contextFor(w, j.size)).newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        if (coverage) await page.coverage.startJSCoverage({ resetOnNavigation: false });
        const q = new URLSearchParams({ frame: `j${n}`, s: j.scene, seat: String(j.seat), size: j.size });
        for (const [k, v] of j.values ?? []) q.set(`k.${k}`, v);
        await page.goto(`${base}qa.html?${q}`, { waitUntil: 'load', timeout: 60000 });
        const loaded = Date.now();
        await page.waitForFunction(() => window.__qa, null, { timeout: 60000 });
        const checked = Date.now();
        if (coverage) {
          ran.set(j, ranFiles(await page.coverage.stopJSCoverage()));
          continue;
        }
        const r = await page.evaluate(() => window.__qa);
        // (A frame that couldn't start says why, src/qa/main.ts.)
        if (r.failed) throw new Error(r.failed);
        const file = fileOf(j);
        // At CSS pixels (a quarter of a 4K-at-200% shot's), unless banding is looked for, which shows only in the device's own.
        // (A 4K page under a full sweep's load can take a while to give up its pixels: once more, with longer, before calling it failed.)
        const shoot = (timeout) => page.screenshot({ path: path.join(outDir, file), animations: values.webgl ? 'allow' : 'disabled', caret: 'hide', scale: values.banding ? 'device' : 'css', timeout });
        await shoot(45000).catch(() => shoot(90000));
        const times = { load: loaded - started, check: checked - loaded, shot: Date.now() - checked };
        shots.push({ ...j, file, settled: r.settled, problems: r.problems, ms: Date.now() - started, times });
      } catch (e) {
        shots.push({ ...j, file: null, failed: e.message.split('\n')[0], problems: [], ms: Date.now() - started, errors });
      } finally {
        await page.close();
        done++;
        if (process.stdout.isTTY) process.stdout.write(`\r${done}/${jobs.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(at, jobs.length) }, (_, w) => worker(w)));
  if (process.stdout.isTTY) process.stdout.write('\n');
  await Promise.all([...contexts.values()].map(async (c) => (await c).close()));
  return { shots, ran };
}

/** The jobs for `scenes`: every seat at every size picked. */
function jobsFor(scenes) {
  const pick = (s) => (values.sizes === 'walk' ? s.sizes : values.sizes === 'full' ? SIZES.map((x) => x.key) : values.sizes.split(',').map((k) => k.trim()));
  for (const k of new Set(scenes.flatMap(pick))) {
    if (!SIZES.some((s) => s.key === k)) {
      console.error(`No size "${k}" (src/qa/sizes.ts has ${SIZES.map((s) => s.key).join(', ')}).`);
      process.exit(1);
    }
  }
  return scenes.flatMap((s) => pick(s).flatMap((size) => Array.from({ length: s.seats }, (_, seat) => ({ scene: s.key, n: s.n, values: s.values, label: s.label, seat, size }))));
}

// ---- --map --------------------------------------------------------------------

if (values.map) {
  const served = await serveDev();
  values.sizes = 'desktop';
  const every = await listScenes(served.base);
  const scenes = every.filter((s) => !only || only.test(s.key));
  const jobs = jobsFor(scenes);
  // The dev server builds each module as a page first asks for it: more than a few pages at once and they time out waiting.
  const at = Math.min(concurrency, 4);
  console.log(`Running ${jobs.length} frames with coverage on, ${at} at once…`);
  const { ran } = await shootAll(served.base, jobs, path.join(SCREENS, 'qa-map'), { coverage: true, concurrency: at });
  await Promise.all(browsers.map((b) => b.close()));
  served.close();
  // Every file's scenes; and the files at least 60% of the scenes run, which say nothing about any one.
  const byScene = new Map();
  for (const [j, files] of ran) byScene.set(j.scene, new Set([...(byScene.get(j.scene) ?? []), ...files]));
  const counts = new Map();
  for (const files of byScene.values()) for (const f of files) counts.set(f, (counts.get(f) ?? 0) + 1);
  let global = [...counts].filter(([, n]) => n >= byScene.size * 0.6).map(([f]) => f).sort();
  let files = {};
  for (const f of [...counts.keys()].filter((f) => !global.includes(f)).sort()) files[f] = [...byScene].filter(([, fs]) => fs.has(f)).map(([k]) => k);
  // With --only, a few scenes mapped again (new ones, say): merged into the
  // map as it was, every other scene's files kept, its global files too
  // (those of scenes no longer there go).
  if (only) {
    const was = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'sceneFiles.json'), 'utf8'));
    global = was.global;
    const merged = {};
    const there = new Set(every.map((s) => s.key));
    for (const [f, ks] of Object.entries(was.files)) merged[f] = ks.filter((k) => !byScene.has(k) && there.has(k));
    for (const [k, fs] of byScene) for (const f of fs) if (!global.includes(f)) (merged[f] ??= []).push(k);
    files = Object.fromEntries(Object.entries(merged).filter(([, ks]) => ks.length).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  // One entry a line, so a merge conflict is easy to see (and to settle by running --map again).
  const lines = Object.entries(files).map(([f, ks]) => `    ${JSON.stringify(f)}: ${JSON.stringify(ks)}`);
  const out = `{\n  "global": ${JSON.stringify(global)},\n  "files": {\n${lines.join(',\n')}\n  }\n}\n`;
  writeFileSync(path.join(ROOT, 'src', 'data', 'sceneFiles.json'), out);
  const failed = jobs.filter((j) => !ran.has(j)).length;
  console.log(`src/data/sceneFiles.json: ${Object.keys(files).length} files over ${byScene.size} scenes, ${global.length} global${failed ? `; ${failed} frames failed` : ''}.`);
  process.exit(0);
}

// ---- --redraws ----------------------------------------------------------------

/** The size the redraws are checked at: a desktop's, where the cards stand tall and sharp (or the one size --sizes names). */
const REDRAW_SIZE = SIZES.some((s) => s.key === values.sizes) ? values.sizes : 'desktop';
/** The trace's categories: the raster tasks (cc) and the frame viewer's snapshots of the layer tree. */
const REDRAW_TRACE = ['cc', 'disabled-by-default-cc.debug'];
/**
 * A browser of its own for each page traced (a trace is the whole
 * browser's). Without a GPU (CI) WebGL draws in SwiftShader, which Chrome
 * asks to be let in.
 */
const launchTraced = () =>
  chromium.launch({
    ...(process.env.CHROMIUM || process.env.BOT_CHROMIUM ? { executablePath: process.env.CHROMIUM || process.env.BOT_CHROMIUM } : { channel: 'chromium' }),
    args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--enable-unsafe-swiftshader']), '--enable-gpu', '--ignore-gpu-blocklist'],
  });

/**
 * In the page: counts its frames until `least` ms and `frames` frames have
 * passed (with `still`, also until no animation with an end is running),
 * `most` ms at the most, noting meanwhile what changes on most frames (a
 * style or a class written) and, at the end, what animates other than its
 * transform or opacity.
 */
async function watchFrames({ least, frames: fewest, most, still }) {
  const name = (el) => `${el.tagName.toLowerCase()}${[...el.classList].filter((c) => !c.startsWith('svelte-')).map((c) => `.${c}`).join('')}`;
  const changed = new Map();
  const seen = new MutationObserver((list) => {
    for (const m of list) if (m.target instanceof Element) changed.set(`${name(m.target)}’s ${m.attributeName}`, (changed.get(`${name(m.target)}’s ${m.attributeName}`) ?? 0) + 1);
  });
  seen.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  const busy = () => document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));
  const t0 = performance.now();
  let n = 0;
  await new Promise((done) => {
    const frame = () => {
      n++;
      const t = performance.now() - t0;
      if ((t >= least && n >= fewest && !(still && busy())) || t >= most) done();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  seen.disconnect();
  const COMPOSITED = new Set(['offset', 'easing', 'composite', 'computedOffset', 'transform', 'opacity', 'translate', 'rotate', 'scale']);
  const painted = document
    .getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.target)
    .flatMap((a) => {
      const props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((p) => !COMPOSITED.has(p));
      return props.length ? [`${(a.animationName ?? a.id) || 'an animation'} on ${name(a.effect.target)} (${props.join(', ')})`.replace(/svelte-\w+-/, '')] : [];
    });
  return { frames: n, ms: Math.round(performance.now() - t0), changing: [...changed].filter(([, c]) => c >= n * 0.5).map(([k]) => k), painted: [...new Set(painted)] };
}

/** `during` run with the browser tracing, and what was drawn again meanwhile. */
async function traced(browser, page, during) {
  await browser.startTracing(page, { categories: REDRAW_TRACE });
  let r, trace;
  try {
    r = await during();
  } finally {
    trace = await browser.stopTracing();
  }
  return { ...r, ...redraws(readTrace(trace.toString())) };
}

const contextFor = (browser) => {
  const size = SIZES.find((s) => s.key === REDRAW_SIZE);
  return browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: size.dpr, reducedMotion: 'no-preference' });
};

/** Each scene's first state at rest, from its first seat: the layers drawn again on most frames, and what changes meanwhile. */
async function scenesAtRest(base, scenes, browsers) {
  const firsts = scenes.filter((s, i) => scenes.findIndex((t) => t.key === s.key) === i);
  const out = [];
  let next = 0;
  await Promise.all(
    browsers.map(async (browser) => {
      while (next < firsts.length) {
        const s = firsts[next++];
        const context = await contextFor(browser);
        const page = await context.newPage();
        try {
          const q = new URLSearchParams({ frame: `r${next}`, s: s.key, seat: '0', size: REDRAW_SIZE });
          for (const [k, v] of s.values ?? []) q.set(`k.${k}`, v);
          await page.goto(`${base}qa.html?${q}`, { waitUntil: 'load', timeout: 60000 });
          await page.waitForFunction(() => window.__qa, null, { timeout: 90000 });
          const r0 = await page.evaluate(() => window.__qa);
          if (r0.failed) throw new Error(r0.failed);
          // (What follows a scene's coming to rest, a toast, a sound's first beat, past.)
          await page.waitForTimeout(500);
          const r = await traced(browser, page, () => page.evaluate(watchFrames, { least: 2000, frames: 20, most: 8000, still: false }));
          const problems = r.layers.map((l) => atRest(s.key, l, r.frames)).filter(Boolean);
          out.push({ scene: s.key, frames: r.frames, ms: r.ms, problems, changing: r.changing, painted: r.painted, layers: r.layers.slice(0, 8) });
        } catch (e) {
          out.push({ scene: s.key, failed: e.message.split('\n')[0], problems: [] });
        } finally {
          await context.close();
          if (process.stdout.isTTY) process.stdout.write(`\r${out.length}/${firsts.length}`);
        }
      }
    }),
  );
  if (process.stdout.isTTY) process.stdout.write('\n');
  return out.sort((a, b) => (a.scene < b.scene ? -1 : 1));
}

/**
 * The card bench's moments (src/qa/redraws.ts MOMENTS), on its stage
 * (cards.html?stage): each set off and watched until it's over, as the
 * pixels drawn again a frame. Each measured three times, the middle kept:
 * a frame's timing moves the rest a little.
 */
async function moments(base, browser) {
  const context = await contextFor(browser);
  const page = await context.newPage();
  const out = [];
  try {
    await page.goto(`${base}cards.html?stage`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__cb?.ready, null, { timeout: 90000 });
    const rest = () => page.evaluate(watchFrames, { least: 1000, frames: 1, most: 10000, still: true });
    await rest();
    // (The bench's items: every category by name, the dig's way out last.)
    const deal = () => page.evaluate(() => window.__cb.deal(window.__cb.items.slice(0, 3).map((i) => ({ category: i.value, kind: null }))));
    const setOff = {
      deal,
      dig: () => page.evaluate(() => window.__cb.deal([{ category: window.__cb.items[0].value, kind: 'azurite' }, { category: window.__cb.items.at(-1).value, kind: null }])),
      pick: () => page.evaluate(() => window.__lab.ask()),
    };
    for (const m of MOMENTS) {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        // (A pick is of cards dealt first, unwatched.)
        if (m.key === 'pick') {
          await deal();
          await rest();
        }
        const r = await traced(browser, page, async () => {
          await setOff[m.key]();
          return page.evaluate(watchFrames, { least: 1500, frames: 8, most: 10000, still: true });
        });
        runs.push({ ...r, perFrame: r.again / Math.max(1, r.frames) });
        await rest();
      }
      runs.sort((a, b) => a.perFrame - b.perFrame);
      const r = runs[1];
      out.push({ key: m.key, label: m.label, perFrame: Math.round(r.perFrame), runs: runs.map((x) => Math.round(x.perFrame)), frames: r.frames, ms: r.ms, px: r.px, again: r.again, painted: r.painted, layers: r.layers.slice(0, 6) });
    }
  } finally {
    await context.close();
  }
  return out;
}

async function checkRedraws(base, scenes) {
  const at = Math.max(1, Math.min(concurrency, values.only ? 2 : concurrency));
  const traceBrowsers = await Promise.all(Array.from({ length: at }, launchTraced));
  let atRestFound = [];
  let momentsFound = [];
  try {
    if (values.only || !values.moments) {
      console.log(`Redraws at rest: ${new Set(scenes.map((s) => s.key)).size} scenes, ${at} at once, at ${REDRAW_SIZE}, from ${base}`);
      atRestFound = await scenesAtRest(base, scenes, traceBrowsers);
    }
    if (values.moments || !values.only) {
      console.log('Redraws in the card bench’s moments…');
      momentsFound = await moments(base, traceBrowsers[0]);
    }
  } finally {
    await Promise.all(traceBrowsers.map((b) => b.close()));
  }
  const BASELINE = path.join(ROOT, 'src', 'qa', 'redraws.json');
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  for (const m of momentsFound) {
    m.baseline = baseline.moments?.[m.key];
    m.problem = overBaseline(m.key, m.perFrame, m.baseline);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(SCREENS, `redraws-${stamp}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ at: new Date().toISOString(), head: git(ROOT, 'rev-parse', 'HEAD'), size: REDRAW_SIZE, atRest: atRestFound, moments: momentsFound }, null, 1));

  const lines = [];
  const bad = atRestFound.filter((s) => s.failed || s.problems.length);
  for (const s of atRestFound) {
    if (s.failed) lines.push(`  ${s.scene}: failed: ${s.failed}`);
    else if (s.frames < FEWEST_FRAMES) lines.push(`  ${s.scene}: only ${s.frames} frames in ${s.ms} ms, too few to tell`);
    for (const p of s.problems) lines.push(`  ${s.scene}: ${p}`);
    if (s.problems.length) {
      if (s.changing.length) lines.push(`    changing every frame: ${s.changing.slice(0, 4).join(', ')}`);
      if (s.painted.length) lines.push(`    animating what isn’t its transform or opacity: ${s.painted.slice(0, 4).join('; ')}`);
    }
  }
  if (atRestFound.length) console.log(`At rest: ${atRestFound.length} scenes, ${bad.length} with a layer drawn again on most frames${bad.length ? ':' : '.'}`);
  for (const l of lines) console.log(l);
  for (const m of momentsFound) {
    const of = m.baseline === undefined ? 'no baseline yet' : `baseline ${kpx(m.baseline)}`;
    console.log(`${m.label}: ${kpx(m.perFrame)} drawn again a frame (${m.runs.map(kpx).join(', ')}; ${m.frames} frames in ${m.ms} ms), ${of}${m.problem ? `\n  FAILS: ${m.problem}` : ''}`);
    if (m.problem) {
      for (const l of m.layers.slice(0, 4)) console.log(`    ${l.name} (${l.w}×${l.h}): drawn in ${l.commits} commits, ${kpx(l.again / Math.max(1, m.frames))} again a frame`);
      if (m.painted.length) console.log(`    animating what isn’t its transform or opacity: ${m.painted.slice(0, 4).join('; ')}`);
    }
  }
  const measured = { size: REDRAW_SIZE, moments: Object.fromEntries(momentsFound.map((m) => [m.key, m.perFrame])) };
  if (values.baseline && momentsFound.length) {
    writeFileSync(BASELINE, `${JSON.stringify({ ...baseline, ...measured }, null, 2)}\n`);
    console.log(`Wrote the moments into ${path.relative(ROOT, BASELINE)}.`);
  }
  // In CI, the job's summary: what was found, and the moments as measured, to commit as the baseline when a change means them.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '## Redraws',
      '',
      atRestFound.length ? `At rest: ${atRestFound.length} scenes, ${bad.length} with a layer drawn again on most frames.` : '',
      '',
      ...lines.map((l) => `    ${l}`),
      '',
      '| Moment | Drawn again a frame | Runs | Baseline |',
      '| --- | --- | --- | --- |',
      ...momentsFound.map((m) => `| ${m.label} | ${kpx(m.perFrame)}${m.problem ? ' (fails)' : ''} | ${m.runs.map(kpx).join(', ')} | ${m.baseline === undefined ? 'none' : kpx(m.baseline)} |`),
      '',
      'The moments as measured here, for `src/qa/redraws.json` when a change means them to cost more (or less):',
      '',
      '```json',
      JSON.stringify(measured, null, 2),
      '```',
    ];
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`, { flag: 'a' });
  }
  console.log(`Report: screens/redraws-${stamp}/report.json`);
  const failed = bad.length + momentsFound.filter((m) => m.problem).length;
  return failed ? 1 : 0;
}

// ---- the sweep ----------------------------------------------------------------

const BUILD = path.join(SCREENS, 'qa-build');
let served;
if (values.url) served = { base: values.url.endsWith('/') ? values.url : `${values.url}/`, close: () => {} };
else {
  if (values.build || !existsSync(path.join(BUILD, 'qa.html'))) buildBeta(ROOT, BUILD, 'this checkout (npm run sweep -- --no-build skips this next time)');
  served = await serveDir(BUILD);
}
if (values.redraws) {
  const lister = await launch();
  const every = await listScenes(served.base, lister).finally(() => lister.close());
  const code = await checkRedraws(
    served.base,
    every.filter((s) => !only || only.test(s.key)),
  );
  served.close();
  process.exit(code);
}
let scenes = (await listScenes(served.base)).filter((s) => !only || only.test(s.key));
if (values.change) {
  // As the desk's This change has it (src/qa/change.ts): the files changed since main, and the scenes that run them.
  const changed = changedFiles(ROOT);
  const map = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'sceneFiles.json'), 'utf8'));
  const t = touched(changed?.files ?? [], map, scenes.map((s) => ({ key: s.key, screen: s.key.split('/')[0] })));
  const keys = new Set(t.scenes.map((s) => s.key));
  scenes = scenes.filter((s) => keys.has(s.key));
  console.log(`This change: ${changed?.files.length ?? 0} files changed, ${scenes.length} scenes touch them.${t.uncovered.length ? ` No scene runs ${t.uncovered.join(', ')}.` : ''}`);
}
const jobs = jobsFor(scenes);
if (!jobs.length) {
  console.error(only ? `No scene's key matches ${only}.` : 'No scenes.');
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dirName = `qa-${stamp}`;
const outDir = path.join(SCREENS, dirName);
console.log(`${jobs.length} shots of ${scenes.length} scenes, ${concurrency} at once, from ${served.base}`);
const { shots } = await shootAll(served.base, jobs, outDir);
served.close();

await Promise.all(browsers.map((b) => b.close()));

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
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (i < queue.length) await run(queue[i++]);
      }),
    );
  }
}

// ---- what it found ------------------------------------------------------------

const manifest = {
  dir: dirName,
  at: new Date().toISOString(),
  url: values.url ?? 'beta build',
  head: git(ROOT, 'rev-parse', 'HEAD'),
  dirty: (git(ROOT, 'status', '--porcelain') ?? '') !== '',
  sizes: values.sizes,
  webgl: values.webgl,
  shots,
};
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));

const bad = shots.filter((s) => s.failed || s.problems.length);
console.log(`${shots.length} shots in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${bad.length} with something to look at; screens/${dirName}/`);
for (const s of bad) {
  const what = s.failed ? `failed: ${s.failed}` : s.problems.map((p) => `${p.kind}${p.count > 1 ? ` x${p.count}` : ''}: ${p.examples[0]}`).join('; ');
  // (A state past a scene's first by its label: two of one scene's states otherwise read the same.)
  console.log(`  ${s.scene}${s.n ? ` “${s.label}”` : ''} (seat ${s.seat}, ${s.size}): ${what}`);
}
const unsettled = shots.filter((s) => s.settled === false).length;
if (unsettled) console.log(`${unsettled} never came to rest within 8 s (checked as they were).`);
