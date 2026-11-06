#!/usr/bin/env node
// The QA sweep: every scene of the QA desk (src/qa, docs/qa.md), from every
// seat, at every size it is walked at, each in a browser that really is
// that device (its pixel ratio, touch, a phone's user agent), shot and
// checked the way the desk's frames check themselves (src/qa/frame/checks.ts:
// off the screen, text cut off, console errors, pictures, em dashes), and
// with --banding, scripts/find-banding.py on top, and with --faint, how
// faint its text is on what's actually behind it in the shot
// (src/qa/legible.ts). It prints what it found:
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
// --map instead runs every place (a scene's first state, a state with a key
// of its own) and every piece once on a dev server of its own with the
// browser's coverage on, and writes src/data/sceneFiles.json: which lines
// of the game's files each runs, and the class names its page has, for the
// desk's "This change" (src/qa/change.ts). Run it when scenes or screens
// have changed much.
//
// --redraws instead checks what Chrome draws again (src/qa/redraws.ts,
// docs/qa.md, "Redraws"), on fixed frames at full motion: each scene's first
// state at rest with WebGL refused (--webgl: the few whose effects change
// the page, WEBGL_SCENES, with it), or with --moments the moments (MOMENTS:
// a deal, a dig's deal, a pick, the pointer across a card, a name plate). It fails on a layer drawn again 50k px a
// frame or more at rest (the page 100k, its layers together), and on a
// moment past its baseline (src/qa/redrawBaselines.json; --baseline writes
// it). It runs in CI on every pull request; here only with --only or
// --moments. --canary has it watch a box drawn again every frame, which
// has to fail.
//
//   npm run sweep -- [--sizes walk|full|phone,uhd,...] [--only <regex>] [--change] [--webgl] [--banding] [--faint]
//                 [--url URL] [--no-build] [--concurrency N]
//   npm run sweep -- --map [--only <regex>]
//   npm run sweep -- --redraws --only <regex> [--webgl] [--shard i/n] [--canary]
//   npm run sweep -- --redraws --moments [--only <moment>] [--baseline]
//   (from PowerShell, where npm eats the flags: npm run sweep full webgl only=lobby)

import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { TraceMap, decodedMappings } from '@jridgewell/trace-mapping';
import { buildBeta as viteBeta } from './beta-build.mjs';
import { SIZES } from '../src/qa/sizes.ts';
import { carry, decodeMap, encodeMap } from '../src/qa/change.ts';
import { FLOOR, MARK, MOMENTS, PAGE_FLOOR, WEBGL_SCENES, atRest, kpx, overBaseline, pageAtRest, readTrace, redraws, unread, withoutMark } from '../src/qa/redraws.ts';
import { changeHere, linesSinceMap } from '../qaServer.ts';

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
  faint: { type: 'boolean', default: false },
  change: { type: 'boolean', default: false },
  map: { type: 'boolean', default: false },
  redraws: { type: 'boolean', default: false },
  moments: { type: 'boolean', default: false },
  baseline: { type: 'boolean', default: false },
  canary: { type: 'boolean', default: false },
  shard: { type: 'string' },
  concurrency: { type: 'string', default: String(Math.max(2, os.availableParallelism() - 2)) },
  help: { type: 'boolean', short: 'h', default: false },
};
const { values, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true, allowNegative: true });
// Bare words, for PowerShell (see capture-screens.mjs): full, webgl, banding, faint, change, map, no-build, name=value.
for (const word of positionals) {
  if (word === 'full' || word === 'walk') values.sizes = word;
  else if (['webgl', 'banding', 'faint', 'change', 'map', 'redraws', 'moments', 'baseline', 'canary', 'help'].includes(word)) values[word] = true;
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
  --faint                measure each run of text against what's behind it in the shot (src/qa/legible.ts),
                         not only the page's own dark; the faint ones' numbers go in the manifest
  --change               only the places this branch's changes touch (as the desk's This change)
  --url URL              shoot a running server (the dev server, the beta) instead of building one
  --no-build             serve screens/qa-build/ as the last sweep built it
  --concurrency N        pages at once (default: all threads but two, ${OPTIONS.concurrency.default})
  --map                  write src/data/sceneFiles.json instead: the lines and classes each place runs
  --redraws              check what Chrome draws again instead (docs/qa.md, Redraws): every scene's first
                         state at rest, WebGL refused; here only with --only (CI runs them all)
  --webgl                with --redraws: the scenes whose effects change the page (WEBGL_SCENES), with WebGL
  --moments              with --redraws: the moments instead, MOMENTS' (--only: those whose key matches)
  --baseline             with --redraws: write the moments as measured into src/qa/redrawBaselines.json
  --shard i/n            with --redraws: only the i-th of n parts of the scenes at rest (CI's jobs)
  --canary               with --redraws --only: the scenes with a box drawn again every frame put in, which
                         has to fail (it passes when it does): CI's proof the check still reads its traces`);
  process.exit(0);
}
if (values.baseline) values.moments = true;
const shard = values.shard?.match(/^(\d+)\/(\d+)$/)?.slice(1).map(Number);
if (values.shard && !(shard && shard[0] >= 1 && shard[0] <= shard[1])) {
  console.error(`--shard takes i/n, the i-th of n parts (1/4), not "${values.shard}".`);
  process.exit(1);
}
if (values.redraws && values.map) {
  console.error('--redraws and --map are two runs of their own: one at a time.');
  process.exit(1);
}
if (values.canary && (!values.redraws || values.moments || !values.only)) {
  console.error('--canary watches a scene or two at rest with a box drawn again every frame: --redraws --canary --only <regex>.');
  process.exit(1);
}
if (values.redraws && values.sizes !== 'walk' && !SIZES.some((s) => s.key === values.sizes)) {
  console.error(`--redraws checks at one size (src/qa/sizes.ts has ${SIZES.map((s) => s.key).join(', ')}), not "${values.sizes}".`);
  process.exit(1);
}
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
  const status = viteBeta(root, out);
  if (status !== 0) process.exit(status);
  console.log(`Built in ${((Date.now() - started) / 1000).toFixed(0)} s.`);
}

/** Serves the files under `dir`; resolves to its address. */
async function serveDir(dir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (file !== dir && !file.startsWith(dir + path.sep)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end();
    // (No Date header: the game's clock (lib/clock.ts) takes a server's time over the page's own, and a
    // watched page's is CLOCK's, 20 October, not today, so a scene shows the same on any day.)
    res.sendDate = false;
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
// (--redraws traces, which is a browser's own: it launches one for each page traced at once.)
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

/** Each module's code points (where its sourcemap maps code to its file), by its address: read once, the dev server's never change. */
const modules = new Map();
/**
 * A module of `entry` (the dev server's coverage of a page, one module a
 * file, each with its sourcemap inline): its file, and each point of its
 * code that its sourcemap maps to a line of that file (offsets and lines).
 */
function moduleOf(entry) {
  if (modules.has(entry.url)) return modules.get(entry.url);
  let found = null;
  const url = new URL(entry.url);
  const at = url.pathname.indexOf('/src/');
  const inline = /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)\s*$/.exec(entry.source);
  if (at >= 0 && /\.(svelte|ts|js|mjs)$/.test(url.pathname) && !url.search.includes('type=style') && inline) {
    const file = decodeURIComponent(url.pathname.slice(at + 1));
    const map = new TraceMap(JSON.parse(Buffer.from(inline[1], 'base64').toString('utf8')));
    const name = file.slice(file.lastIndexOf('/') + 1);
    const own = map.sources.map((s) => map.sources.length === 1 || (!!s && s.split(/[\/]/).pop().split('?')[0] === name));
    const starts = [0];
    for (let i = 0; i < entry.source.length; i++) if (entry.source.charCodeAt(i) === 10) starts.push(i + 1);
    const offsets = [];
    const lines = [];
    decodedMappings(map).forEach((segments, line) => {
      for (const s of segments) if (s.length >= 4 && own[s[1]]) offsets.push(starts[line] + s[0]), lines.push(s[2] + 1);
    });
    found = { file, offsets, lines };
  }
  modules.set(entry.url, found);
  return found;
}

/**
 * The lines of the game's files (src/, src/qa/'s scenes and benches too)
 * `entries` ran, from V8's block coverage: by file, the lines that ran in
 * a function (`ran`), the lines in a function at all (`fn`), and those of
 * code that runs as its module loads (`top`), which being imported runs,
 * so they say nothing of what a page showed.
 */
function ranLines(entries) {
  const out = new Map();
  for (const e of entries) {
    const m = moduleOf(e);
    if (!m) continue;
    // Each offset painted with what ran there, the innermost range last: 1 ran, 2 in a function that didn't, 0 the module's top level.
    const paint = new Uint8Array(e.source.length + 1);
    const ranges = [];
    for (const f of e.functions) {
      const r0 = f.ranges[0];
      if (r0.startOffset === 0 && r0.endOffset >= e.source.length - 1) continue;
      for (const r of f.ranges) ranges.push(r);
    }
    ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    for (const r of ranges) paint.fill(r.count > 0 ? 1 : 2, r.startOffset, r.endOffset);
    const got = out.get(m.file) ?? { ran: new Set(), fn: new Set(), top: new Set() };
    out.set(m.file, got);
    for (let i = 0; i < m.offsets.length; i++) {
      const v = paint[m.offsets[i]];
      const line = m.lines[i];
      if (v === 1) got.ran.add(line);
      if (v) got.fn.add(line);
      else got.top.add(line);
    }
  }
  return out;
}

/**
 * Records every class name the page's elements ever have, from before
 * anything of it runs (window.__qaClasses): what a changed CSS rule's
 * places are found by.
 */
function noteClasses() {
  const seen = new Set();
  const note = (el) => {
    const c = el.getAttribute?.('class');
    if (c) for (const x of c.split(/\s+/)) if (x && !x.startsWith('svelte-')) seen.add(x);
  };
  const deep = (node) => {
    if (node.nodeType !== 1) return;
    note(node);
    for (const el of node.querySelectorAll('[class]')) note(el);
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        note(r.target);
        if (r.oldValue) for (const x of r.oldValue.split(/\s+/)) if (x && !x.startsWith('svelte-')) seen.add(x);
      } else for (const n of r.addedNodes) deep(n);
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  window.__qaClasses = () => {
    deep(document.documentElement);
    return [...seen];
  };
}

/**
 * Opens each job's frame at `base`, waits for its check, and shoots it into
 * `outDir`. A context per
 * worker and size, its jobs one after another: pages of one site in one
 * context share a renderer, so the workers' own contexts are what lets them
 * run side by side. Each frame keeps its own storage keys (its slot) besides.
 */
async function shootAll(base, jobs, outDir, { concurrency: at = concurrency } = {}) {
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
        const q = new URLSearchParams({ frame: `j${n}`, s: j.scene, seat: String(j.seat), size: j.size });
        // (No outlines round what's wrong when the shot is measured: they'd be measured too.)
        if (values.faint) q.set('o', '0');
        for (const [k, v] of j.values ?? []) q.set(`k.${k}`, v);
        await page.goto(`${base}qa.html?${q}`, { waitUntil: 'load', timeout: 60000 });
        const loaded = Date.now();
        await page.waitForFunction(() => window.__qa, null, { timeout: 60000 });
        const checked = Date.now();
        const r = await page.evaluate(() => window.__qa);
        // (A frame that couldn't start says why, src/qa/main.ts.)
        if (r.failed) throw new Error(r.failed);
        const file = fileOf(j);
        // At CSS pixels (a quarter of a 4K-at-200% shot's), unless banding is looked for, which shows only in the device's own.
        // (A 4K page under a full sweep's load can take a while to give up its pixels: once more, with longer, before calling it failed.)
        const shoot = (timeout) => page.screenshot({ path: path.join(outDir, file), animations: values.webgl ? 'allow' : 'disabled', caret: 'hide', scale: values.banding ? 'device' : 'css', timeout });
        await shoot(45000).catch(() => shoot(90000));
        // Its text against what's behind it in the shot, in place of the frame's own look against the page's dark: the runs too faint there, measured.
        let texts;
        if (values.faint) {
          const found = await page.evaluate((png) => window.__qaFaint(png), readFileSync(path.join(outDir, file)).toString('base64'));
          texts = found.texts;
          r.problems = [...r.problems.filter((p) => p.kind !== 'faint'), ...found.problems];
        }
        const times = { load: loaded - started, check: checked - loaded, shot: Date.now() - checked };
        shots.push({ ...j, file, settled: r.settled, problems: r.problems, texts, ms: Date.now() - started, times });
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
  return { shots };
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

/**
 * Opens each of `jobs` (a place from one of its seats, or a piece) at
 * `base` with the browser's coverage on, `at` at once, each at a desktop's
 * size, and gives what each ran: its lines (ranLines) and the class names
 * its page had.
 */
async function mapAll(base, jobs, at) {
  const size = SIZES.find((s) => s.key === 'desktop');
  const got = new Map();
  let next = 0;
  let done = 0;
  const worker = async (w) => {
    const context = await browsers[w % browsers.length].newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: size.dpr, reducedMotion: values.webgl ? 'no-preference' : 'reduce' });
    await context.addInitScript(noteClasses);
    if (!values.webgl)
      await context.addInitScript(() => {
        delete window.WebGL2RenderingContext;
        delete window.WebGLRenderingContext;
      });
    while (next < jobs.length) {
      const n = next++;
      const j = jobs[n];
      const page = await context.newPage();
      try {
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
        const q = new URLSearchParams(j.piece ? { frame: `m${n}`, b: j.piece, size: 'desktop' } : { frame: `j${n}`, s: j.place, seat: String(j.seat), size: 'desktop' });
        for (const [k, v] of j.values ?? []) q.set(`k.${k}`, v);
        await page.goto(`${base}qa.html?${q}`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => window.__qa, null, { timeout: 120000 });
        const classes = await page.evaluate(() => window.__qaClasses());
        got.set(j, { lines: ranLines(await page.coverage.stopJSCoverage()), classes });
      } catch (e) {
        console.error(`\n${j.place}${j.piece ? '' : `, seat ${j.seat}`} failed: ${e.message.split('\n')[0]}`);
      } finally {
        await page.close();
        done++;
        if (process.stdout.isTTY) process.stdout.write(`\r${done}/${jobs.length}`);
      }
    }
    await context.close();
  };
  await Promise.all(Array.from({ length: Math.min(at, jobs.length) }, (_, w) => worker(w)));
  if (process.stdout.isTTY) process.stdout.write('\n');
  return got;
}

if (values.map) {
  const MAP = path.join(ROOT, 'src', 'data', 'sceneFiles.json');
  const commit = git(ROOT, 'rev-parse', 'HEAD');
  // Files of the game's this checkout has changed since its commit: the map has their lines as they are now, so it keeps each one's content (a blob in git's store) to carry them from.
  const changedNow = new Set([...(git(ROOT, 'diff', '--name-only', 'HEAD', '--', 'src') ?? '').split('\n'), ...(git(ROOT, 'ls-files', '--others', '--exclude-standard', '--', 'src') ?? '').split('\n')].filter(Boolean));
  if (changedNow.size) console.warn(`The checkout has ${changedNow.size} files in src/ changed since ${commit.slice(0, 7)}: the map is made of them as they are, and keeps their content to carry its lines from. Mapping a clean checkout keeps it simplest.`);
  const served = await serveDev();
  const desk = await browsers[0].newPage();
  await desk.goto(`${served.base}qa.html`, { timeout: 120000 });
  await desk.waitForFunction(() => window.__qaDesk, null, { timeout: 60000 });
  const listed = await desk.evaluate(() => ({ scenes: window.__qaDesk.scenes().filter((s) => s.place), pieces: window.__qaDesk.pieces?.() ?? [] }));
  await desk.close();
  // Every place (a scene's first state, a state with a key of its own) from each of its seats, and each piece in its first state.
  const all = [...listed.scenes.map((s) => s.key), ...listed.pieces.map((p) => p.key)];
  const jobs = [
    ...listed.scenes.filter((s) => !only || only.test(s.key)).flatMap((s) => Array.from({ length: s.seats }, (_, seat) => ({ place: s.key, values: s.values, seat }))),
    ...listed.pieces.filter((p) => !only || only.test(p.key)).map((p) => ({ place: p.key, piece: p.key, values: p.values })),
  ];
  // The dev server builds each module as a page first asks for it: more than a few pages at once and they time out waiting.
  const at = Math.min(concurrency, 4);
  console.log(`Running ${jobs.length} frames with coverage on, ${at} at once…`);
  const got = await mapAll(served.base, jobs, at);
  await Promise.all(browsers.map((b) => b.close()));
  served.close();

  // Each place's lines and classes, its seats' together.
  const byPlace = new Map();
  for (const [j, g] of got) {
    const p = byPlace.get(j.place) ?? { lines: new Map(), classes: new Set() };
    byPlace.set(j.place, p);
    for (const c of g.classes) p.classes.add(c);
    for (const [file, l] of g.lines) {
      const had = p.lines.get(file) ?? { ran: new Set(), fn: new Set(), top: new Set() };
      p.lines.set(file, had);
      for (const k of ['ran', 'fn', 'top']) for (const n of l[k]) had[k].add(n);
    }
  }
  // Each file's lines: those in a function, with the places that ran each; then those only of its module's top level.
  const files = new Map();
  for (const [key, p] of byPlace)
    for (const [file, l] of p.lines) {
      const lines = files.get(file) ?? new Map();
      files.set(file, lines);
      for (const n of l.fn) if (!(lines.get(n) instanceof Set)) lines.set(n, new Set());
      for (const n of l.ran) lines.get(n).add(key);
    }
  for (const p of byPlace.values()) for (const [file, l] of p.lines) for (const n of l.top) if (!files.get(file).has(n)) files.get(file).set(n, 'module');
  const classes = new Map();
  for (const [key, p] of byPlace) for (const c of p.classes) (classes.get(c) ?? classes.set(c, new Set()).get(c)).add(key);
  let places = all.filter((k) => byPlace.has(k));

  // With --only, a few places mapped again (new ones, say): merged into the
  // map as it was, its lines carried to now's, every other place kept
  // (those no longer there go).
  if (only) {
    const was = existsSync(MAP) ? JSON.parse(readFileSync(MAP, 'utf8')) : null;
    if (!was?.places) console.warn('The map as it was holds no lines (it was made before it went line by line): it has only these places now. npm run sweep -- --map maps them all.');
    else {
      const old = decodeMap(was);
      const there = new Set(all);
      const keep = (k) => there.has(k) && !byPlace.has(k);
      const moved = linesSinceMap(ROOT, was, [...old.files.keys()], 'tree');
      let lost = 0;
      for (const [file, lines] of old.files) {
        const drift = moved.get(file);
        if (drift === 'unknown') {
          lost++;
          continue;
        }
        const fresh = files.get(file);
        const into = fresh ?? new Map();
        for (const [l, v] of lines) {
          const n = drift ? carry(l, drift, 'old') : l;
          if (n === null) continue;
          // (A file mapped just now has its code as it is: only the other places' runs come from the map as it was.)
          if (fresh) {
            const now = fresh.get(n);
            if (now instanceof Set && v instanceof Set) for (const k of v) if (keep(k)) now.add(k);
          } else into.set(n, v === 'module' ? 'module' : new Set([...v].filter(keep)));
        }
        if (!fresh) files.set(file, into);
      }
      if (lost) console.warn(`${lost} files' lines couldn't be carried from the map's commit (${was.commit.slice(0, 7)}, not in this checkout's git): left out.`);
      for (const [c, ks] of old.classes) for (const k of ks) if (keep(k)) (classes.get(c) ?? classes.set(c, new Set()).get(c)).add(k);
      places = all.filter((k) => byPlace.has(k) || old.places.includes(k));
    }
  }
  const dirty = Object.fromEntries([...changedNow].filter((f) => files.has(f) && existsSync(path.join(ROOT, f))).map((f) => [f, git(ROOT, 'hash-object', '-w', '--', f)]));
  writeFileSync(MAP, encodeMap({ commit, dirty, places, files, classes }));
  const failed = jobs.length - got.size;
  console.log(`src/data/sceneFiles.json: ${files.size} files over ${places.length} places (${byPlace.size} mapped now), ${classes.size} class names${failed ? `; ${failed} frames failed` : ''}.`);
  process.exit(failed ? 1 : 0);
}

// ---- --redraws ----------------------------------------------------------------

/** The size the redraws are checked at: a desktop's, where the cards stand tall and sharp (or the one size --sizes names). */
const REDRAW_SIZE = SIZES.some((s) => s.key === values.sizes) ? values.sizes : 'desktop';
/** The trace's categories: the raster tasks (cc) and the frame viewer's snapshots of the layer tree. */
const REDRAW_TRACE = ['cc', 'disabled-by-default-cc.debug'];
/** The machine, for CI's log: one runner draws in software at twice the speed of another. */
const runner = () => `on ${os.cpus().length} × ${os.cpus()[0]?.model.trim() ?? 'an unknown CPU'}`;
/** A frame, of the page's own time. */
const FRAME = 1000 / 60;
/**
 * How long a scene is watched at rest: 5 s, so a light that passes every 5 s
 * counts for its share. With WebGL (--webgl), 2 s: every scene is watched its
 * 5 s with WebGL refused as well, lights that pass now and then included, and
 * with WebGL it's watched for what the effects do to the page, which they do
 * on nearly every frame while they do it (a shake's translate), from the same
 * point at rest (settled). Drawn in software a frame with WebGL takes a CI
 * runner up to 3 s: 5 s of game/delve-dig would take 14 minutes.
 */
const AT_REST_FRAMES = values.webgl ? 120 : 300;
/** The frames of the trace a page's first watch comes after (warmUp). */
const WARM_FRAMES = 5;

/**
 * A browser of its own for each page traced at once (a trace is the whole
 * browser's): Chrome's headless shell, which draws in software here as
 * in CI, on fixed frames. Each frame is sent from here (begin-frame
 * control, frameDriver), FRAME ms of the page's own time (virtual time:
 * its clocks, timers and animations, from before it loads), however long
 * it takes to draw. So the page plays as it would at 60 fps on any
 * machine, a CI runner at a frame a second included, and what's drawn
 * again comes out the same from run to run, or nearly (docs/qa.md,
 * "Redraws").
 */
// (And an image decoded before the tile it's in is drawn, not drawn without it and again once it's
// decoded, as Chrome otherwise does: when a decode lands depends on real time. And a layer of its own
// that nothing changed in composited as it was last frame, not put together again: what's drawn
// again is the same, and a frame of category cards takes a CI runner 13 ms, not 700.)
const launchTraced = () =>
  chromium.launch({
    headless: true,
    args: [
      '--enable-begin-frame-control',
      '--run-all-compositor-stages-before-draw',
      '--enable-unsafe-swiftshader',
      '--enable-features=AllowUndamagedNonrootRenderPassToSkip',
      '--disable-checker-imaging',
    ],
  });

/**
 * `promise`, or a failure once a minute passes without it: a page that hangs
 * (a frame that never comes back, its renderer gone) fails its scene, which is
 * tried once more, instead of holding the job until its time runs out. (A
 * frame with WebGL takes a CI runner 3 s at most.)
 */
async function withinAMinute(promise, what) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, fail) => (timer = setTimeout(() => fail(new Error(`${what} took over a minute: the page hung`)), 60000)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** Chrome's frame clock (base::TimeTicks), in ms: the monotonic clock Node's hrtime reads too, on each platform. */
const ticks = () => Number(process.hrtime.bigint()) / 1e6;

/**
 * How often a frame comes while a page loads and comes to rest, in ms of
 * its own time: two a second, about as often as a CI runner draws one then
 * (a page coming up is drawn all again each frame, 0.7 s in software), so
 * loading costs about what it would in real time.
 */
const SETTLE = 500;

/**
 * Drives `page`'s frames and its time, which is virtual from before it
 * loads (its clocks, timers and animations): it moves only as frames are
 * sent, so how fast a runner loads a page doesn't move where in a light's
 * cycle (the title's gleam, the rooms list's refresh) a watch begins.
 * settle() sends a frame every SETTLE ms of the page's time while it loads
 * and comes to rest, the time standing still while a fetch is pending and
 * moving no faster than real time (what comes in real time, a worker's
 * work, lands about when it would); frames() one every `ms` (FRAME, a 60th
 * of a second, unless asked), however long each takes to draw.
 */
async function frameDriver(context, page, ms = FRAME) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  let last = ticks();
  let time = 0;
  const opened = Date.now();
  /** A frame `step` ms of the page's time on, its time moving by `policy` (Emulation's). */
  const frame = async (step, policy = 'advance') => {
    const expired = new Promise((r) => cdp.once('Emulation.virtualTimeBudgetExpired', r));
    await cdp.send('Emulation.setVirtualTimePolicy', { policy, budget: step });
    await withinAMinute(expired, 'The page’s time');
    await withinAMinute(cdp.send('HeadlessExperimental.beginFrame', { frameTimeTicks: (last += step), interval: step }), 'A frame');
    time += step;
  };
  // (A page still navigating has nothing to ask yet.)
  const says = (until) => page.evaluate(until).then(Boolean, () => false);
  const settleFrame = async () => {
    await frame(SETTLE, 'pauseIfNetworkFetchesPending');
    const ahead = time - (Date.now() - opened);
    if (ahead > 0) await new Promise((r) => setTimeout(r, ahead));
  };
  return {
    /** Frames while `promise` (a navigation) is pending: what it comes to. */
    async during(promise) {
      let done = false;
      promise.then(
        () => (done = true),
        () => (done = true),
      );
      while (!done) await settleFrame();
      return promise;
    },
    /** Frames every SETTLE ms of the page's time until `until` (run in the page) says so, or `most` ms of it pass, when `what`, if given, fails. */
    async settle(until, most, what) {
      for (let waited = 0; !(await says(until)); waited += SETTLE) {
        if (waited < most) await settleFrame();
        else if (what) throw new Error(`${what} took over ${most / 1000} s of the page’s time`);
        else return;
      }
    },
    /** On to the next whole second of the page's own clock (performance.now). */
    async toSecond() {
      const now = await page.evaluate(() => performance.now());
      const left = Math.ceil(now / 1000) * 1000 - now;
      if (left >= 1) await frame(left, 'pauseIfNetworkFetchesPending');
    },
    /** Up to `most` frames, or, past `least`, until `until` (run in the page) says so: how many. */
    async frames(most, until, least = 0) {
      let n = 0;
      while (n < most) {
        await frame(ms);
        n++;
        if (until && n >= least && (await page.evaluate(until))) break;
      }
      return n;
    },
  };
}

/** In the page, before a watch: from now on, each attribute written (a style, a class, a data- one a stylesheet reads) and the frames it was written in (window.__writes, the frames counted in window.__frames), and each animation that ran of anything but a transform or opacity (window.__painted). */
function noteWrites() {
  // (An element's tag and classes, Svelte's left out.)
  const name = (el) => `${el.tagName.toLowerCase()}${[...el.classList].filter((c) => !c.startsWith('svelte-')).map((c) => `.${c}`).join('')}`;
  const writes = (window.__writes = new Map());
  window.__frames = 0;
  new MutationObserver((list) => {
    for (const m of list) {
      if (!(m.target instanceof Element)) continue;
      const key = `${name(m.target)}’s ${m.attributeName}`;
      if (!writes.has(key)) writes.set(key, new Set());
      writes.get(key).add(window.__frames);
    }
  }).observe(document.documentElement, { subtree: true, attributes: true });
  const COMPOSITED = new Set(['offset', 'easing', 'composite', 'computedOffset', 'transform', 'opacity', 'translate', 'rotate', 'scale']);
  const painted = (window.__painted = new Set());
  const seen = new WeakSet();
  const count = () => {
    window.__frames++;
    // (Each frame: a moment's are over by the watch's end.)
    for (const a of document.getAnimations()) {
      if (seen.has(a) || a.playState !== 'running' || !a.effect?.target) continue;
      seen.add(a);
      const props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((p) => !COMPOSITED.has(p));
      if (props.length) painted.add(`${(a.animationName ?? a.id) || 'an animation'} on ${name(a.effect.target)} (${props.join(', ')})`.replace(/svelte-\w+-/, ''));
    }
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
}

/**
 * In the page, after a watch: what was written on half the frames or more,
 * and what animated anything but its transform or opacity, where to look
 * when something's drawn again; everything written, on how many of the
 * frames, for the report; and the last frame anything was written in and
 * how many animations that end are still running, to tell whether a
 * moment's window holds all of it.
 */
function writesNoted() {
  const n = Math.max(1, window.__frames);
  const share = ([k, f]) => `${k} (${Math.round((f.size / n) * 100)}%)`;
  const all = [...window.__writes].sort((a, b) => b[1].size - a[1].size);
  const last = all.reduce((a, [, f]) => Math.max(a, ...f), 0);
  const running = document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity)).length;
  return { changing: all.filter(([, f]) => f.size >= n / 2).map(share), writes: all.map(([k, f]) => `${share([k, f])}, last on frame ${Math.max(...f)}`), painted: [...window.__painted], last, running };
}

/**
 * In the page: WebGL refused, as a browser without it does: what's watched
 * is the page as a player without WebGL has it, over the CSS backdrop it
 * falls back to (Background.svelte's), its billows and arms with it.
 */
function refuseWebGL() {
  delete window.WebGL2RenderingContext;
  delete window.WebGLRenderingContext;
  for (const C of [window.HTMLCanvasElement, window.OffscreenCanvas]) {
    if (!C) continue;
    const get = C.prototype.getContext;
    C.prototype.getContext = function (type, ...rest) {
      return /webgl/i.test(type) ? null : get.call(this, type, ...rest);
    };
  }
}

/** The date a watched page has it be (Date, Date.now) as it loads: inside dailies.json's days, so a daily is dealt as on any day. */
const CLOCK = Date.parse('2026-10-20T12:00:00Z');

/**
 * In the page: Math.random from `seed` and the page's path (a frame of it
 * its own; not its origin, whose port changes each run, nor its query,
 * whose frame name is the scene's place in its part), and the date from
 * `clock` on, moving with the page's own time: so what's drawn at random
 * or from the time (a heading, where a shake starts, a run's start line)
 * comes out the same each run. window.__reseed() starts both over, the
 * date at the next 10 minutes from `clock` (on, never back, as each part
 * of a moment takes less): a moment's first run and its watched one draw
 * the same.
 */
function seedPage({ seed, clock }) {
  let s = seed >>> 0;
  for (const c of location.pathname) s = Math.imul(s ^ c.charCodeAt(0), 0x9e3779b1) >>> 0;
  const start = s;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const RealDate = Date;
  let from = clock;
  const now = () => Math.floor(from + performance.now());
  function SeededDate(...args) {
    if (!new.target) return new RealDate(now()).toString();
    return Reflect.construct(RealDate, args.length ? args : [now()], new.target);
  }
  Object.setPrototypeOf(SeededDate, RealDate);
  SeededDate.prototype = RealDate.prototype;
  SeededDate.now = now;
  window.Date = SeededDate;
  const STEP = 10 * 60 * 1000;
  window.__reseed = () => {
    s = start;
    from = clock + Math.ceil((now() - clock + 1) / STEP) * STEP - performance.now();
  };
}

/** A page to watch, with what each frame of it was drawn again, and when: its context, page and frame driver (on the page's time from before it loads). */
async function watchedPage(browser, webgl, seed, ms = FRAME) {
  const size = SIZES.find((s) => s.key === REDRAW_SIZE);
  const context = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: size.dpr, reducedMotion: 'no-preference' });
  await context.addInitScript(seedPage, { seed, clock: CLOCK });
  if (!webgl) await context.addInitScript(refuseWebGL);
  const page = await context.newPage();
  return { context, page, drive: await frameDriver(context, page, ms) };
}

/** `url` loaded, its frames driven, until `ready` (run in the page) says so, within 2 minutes of the page's time. */
async function load(page, drive, url, ready) {
  await drive.during(page.goto(url, { waitUntil: 'commit', timeout: 60000 }));
  await drive.settle(ready, 120000, 'Loading');
}

/**
 * In the page: a small layer of its own, drawn as a watch starts, so a
 * trace read right always has a tile of a layer known (MARK; unread()).
 * Over everything and last, so it moves nothing else onto a layer; not of
 * one colour, which Chrome draws without a raster task.
 */
function mark(id) {
  const el = document.createElement('div');
  el.id = id;
  el.style.cssText = 'position:fixed;left:0;top:0;width:8px;height:8px;z-index:2147483647;pointer-events:none;will-change:transform;background:linear-gradient(90deg,#000 50%,#fff 50%)';
  document.body.append(el);
}

/**
 * In the page, for --canary: the October bugs' kind, a box with no layer
 * of its own whose look is written every frame, so Chrome draws it again
 * (and what's round it in its layer) on every frame. The check has to
 * fail it.
 */
function canary() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:40px;top:40px;width:400px;height:300px;z-index:2147483646;pointer-events:none';
  document.body.append(el);
  let i = 0;
  const tick = () => {
    el.style.background = `linear-gradient(90deg, hsl(${i++ % 360} 40% 20%), hsl(${(i + 180) % 360} 40% 20%))`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * `frames` (a frameDriver's) watched with the browser tracing: how many,
 * what changed meanwhile, and what was drawn again (the mark left out). A
 * trace that doesn't read as one always does (unread) fails the watch.
 */
async function watched(browser, page, frames) {
  await page.evaluate(noteWrites);
  await browser.startTracing(page, { categories: REDRAW_TRACE });
  let n, trace;
  try {
    await page.evaluate(mark, MARK.slice(MARK.indexOf('#') + 1));
    if (values.canary) await page.evaluate(canary);
    n = await frames();
  } finally {
    trace = await browser.stopTracing();
  }
  const r = redraws(readTrace(trace));
  const missing = unread(r);
  if (missing) throw new Error(missing);
  return { frames: n, ...(await page.evaluate(writesNoted)), ...withoutMark(r), traced: trace.length };
}

/**
 * In the page: from now on, window.__quiet() says whether the page is at
 * rest, where a scene is watched from: `still` ms of its time with no style
 * or class written (a rune circle's pen done drawing), with no animation
 * that ends still running (an entrance) nor one waiting out its delay
 * (GameOver's gleam, 1.4 s in), so what loops is looping; or `most` ms
 * passed (a shake that never stops is watched all the same). The same with
 * WebGL and without, so both watch from the same point.
 */
function listenQuiet({ still, most }) {
  const t0 = performance.now();
  let last = t0;
  const seen = new MutationObserver(() => (last = performance.now()));
  seen.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  const settling = () =>
    document.getAnimations().some((a) => {
      if (a.playState !== 'running' || !a.effect) return false;
      const t = a.effect.getComputedTiming();
      return Number.isFinite(t.endTime) || (a.currentTime ?? 0) < (t.delay ?? 0);
    });
  window.__quiet = () => {
    const now = performance.now();
    const quiet = (now - last >= still && !settling()) || now - t0 >= most;
    if (quiet) seen.disconnect();
    return quiet;
  };
}

/**
 * The page's frames driven on until it's at rest (listenQuiet's, after the
 * half second that follows its coming to rest: a toast, a sound's first
 * beat, a rune circle's pen), then on to a whole second of its time. Its
 * loading paced to real time, a page comes to rest on the runner's time, a
 * second or so apart from one run to the next (over/n-lost with WebGL at 7 s,
 * then 8): a light that passes every few seconds can fall in a window on one
 * run and out of it on the next (docs/qa.md, "Redraws", says how far).
 */
async function settled(page, drive) {
  await drive.settle(() => false, SETTLE);
  await page.evaluate(listenQuiet, { still: 1000, most: 15000 });
  await drive.settle(() => window.__quiet(), 20000, 'Coming to rest');
  await warmUp(page, drive);
  await drive.toSecond();
}

/** Pages traced already (warmUp). */
const warm = new WeakSet();
/**
 * Once a page first comes to rest, a trace of a few frames that's read for
 * nothing: on a page's first trace, Chrome draws some of its layers once
 * more, each whole (an arcane circle's spinning layer, a plate's weave, a
 * board's panel: on 84 of 114 pages), which no later trace on the page
 * draws, whatever ran before it untraced (docs/qa.md, "Redraws").
 */
async function warmUp(page, drive) {
  if (warm.has(page)) return;
  warm.add(page);
  const browser = page.context().browser();
  await browser.startTracing(page, { categories: REDRAW_TRACE });
  try {
    await drive.frames(WARM_FRAMES);
  } finally {
    await browser.stopTracing();
  }
}

/** A number for `text`, to seed a page's Math.random by. */
const seedOf = (text) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/**
 * The scenes to watch at rest: each place, a scene's first state or a state
 * with a key of its own (with --webgl, of WEBGL_SCENES' only), slowest first, so a slow one is watched beside the
 * rest, not after them. With --shard i/n, the i-th of n parts as even in
 * time as COST makes them: each scene, slowest first, into the part with
 * the least time so far. (The same parts in every job: they're dealt from
 * the same build's scenes.)
 */
function scenesToWatch(scenes) {
  const seen = new Set();
  const webgl = new Set(WEBGL_SCENES.map((w) => w.scene));
  // (The places: each scene's first state, and every state with a key of its own, a scene's that was folded into another's controls.)
  const all = scenes.filter((s) => s.place !== false && !seen.has(s.key) && seen.add(s.key)).filter((s) => !values.webgl || webgl.has(s.key));
  const slowestFirst = [...all].sort((a, b) => costOf(b.key) - costOf(a.key));
  if (!shard) return slowestFirst;
  const parts = Array.from({ length: shard[1] }, () => ({ cost: 0, scenes: [] }));
  for (const s of slowestFirst) {
    const part = parts.reduce((least, p) => (p.cost < least.cost ? p : least));
    part.cost += costOf(s.key);
    part.scenes.push(s);
  }
  return parts[shard[0] - 1].scenes;
}

/**
 * The seconds a CI runner takes to watch a scene at rest (two at once, WebGL
 * refused), for those that take longer than most: the median of three runs
 * (4 November 2026). The Delve's and the turns' cards, whose faces take it
 * up to 1.6 s a frame to composite in software, with nothing drawn again.
 * Any other scene takes about USUAL. Only for dealing the parts: a scene
 * slower or quicker now than here only makes its part longer or shorter.
 */
const COST = {
  'game/turns-kick': 480,
  'game/delve-zone': 410,
  'game/delve-notice': 400,
  'game/delve-depth': 390,
  'game/delve-cards': 390,
  'game/turns-offline': 380,
  'game/starts': 380,
  'game/delve-together-votes': 370,
  'game/delve-answer': 340,
  'game/turns-late': 340,
  'game/delve-deep': 330,
  'game/delve-finds': 260,
  'game/delve-together-cards': 260,
  'game/turns-choosing': 250,
  'game/delve-together-dig': 230,
  'game/delve-dig': 220,
  'game/deathmatch': 140,
  'game/deathmatch-out': 100,
  'game/deathmatch-miss': 90,
  'game/delve-blow': 70,
};
const USUAL = 40;
const costOf = (key) => COST[key] ?? USUAL;

/** Each of `firsts` at rest, from its first seat: the layers drawn again, and what changes meanwhile. */
async function scenesAtRest(base, firsts, browsers) {
  const out = [];
  let next = 0;
  await Promise.all(
    browsers.map(async (browser) => {
      while (next < firsts.length) {
        const n = next++;
        const s = firsts[n];
        // (A frame that didn't load, a page timing out on a busy runner, is tried once more before it counts.)
        for (let attempt = 0; attempt < 2; attempt++) {
          const { context, page, drive } = await watchedPage(browser, values.webgl, seedOf(s.key));
          // (Where the time goes, for CI's log.)
          const took = [];
          let since = Date.now();
          const step = (what) => {
            took.push(`${what} ${((Date.now() - since) / 1000).toFixed(1)} s`);
            since = Date.now();
          };
          try {
            const q = new URLSearchParams({ frame: `r${n}`, s: s.key, seat: '0', size: REDRAW_SIZE });
            for (const [k, v] of s.values ?? []) q.set(`k.${k}`, v);
            await load(page, drive, `${base}qa.html?${q}`, () => window.__qa);
            const r0 = await page.evaluate(() => window.__qa);
            if (r0.failed) throw new Error(r0.failed);
            step('at rest');
            await settled(page, drive);
            step(`quiet at ${((await page.evaluate(() => performance.now())) / 1000).toFixed(1)} s of its time`);
            const r = await watched(browser, page, () => drive.frames(AT_REST_FRAMES));
            step(`${r.frames} frames, traced (${(r.traced / 1e6).toFixed(0)} MB)`);
            const problems = [...r.layers.map((l) => atRest(l, r.frames)), pageAtRest(r.again, r.frames, r.layers)].filter(Boolean);
            out.push({ scene: s.key, frames: r.frames, again: Math.round(r.again / r.frames), problems, changing: r.changing, painted: r.painted, layers: r.layers.slice(0, 8), writes: r.writes });
            if (!process.stdout.isTTY) console.log(`  ${s.key}: ${took.join(', ')}`);
            break;
          } catch (e) {
            if (!process.stdout.isTTY) console.log(`  ${s.key}: ${[...took, `then ${e.message.split('\n')[0]}`].join(', ')}`);
            if (attempt === 1) out.push({ scene: s.key, failed: e.message.split('\n')[0], problems: [] });
          } finally {
            await context.close();
          }
        }
        if (process.stdout.isTTY) process.stdout.write(`\r${out.length}/${firsts.length}`);
      }
    }),
  );
  if (process.stdout.isTTY) process.stdout.write('\n');
  return out.sort((a, b) => (a.scene < b.scene ? -1 : 1));
}

/**
 * The moments (src/qa/redraws.ts MOMENTS), each in a page of its own (with
 * WebGL or not, at the screen's rate MOMENTS has): set off and watched for
 * its `seconds` of the page's time, as the pixels drawn again a 60th of a
 * second. Each runs once first, unwatched: what a worker makes for it (a
 * card plate's print, an arcane plate's geometry) comes in real time, so in
 * the watched run it would land on another frame each run; made then, it's
 * kept for the visit, as for a player's second deal. Then Math.random and
 * the date start over, and it's watched. One that fails to run (its page
 * hung) is tried once more, as a scene at rest is.
 */
async function moments(base, browser) {
  const out = [];
  const pick = values.only ? new RegExp(values.only) : null;
  for (const m of MOMENTS.filter((m) => !pick || pick.test(m.key))) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        out.push(await moment(base, browser, m));
        break;
      } catch (e) {
        if (!process.stdout.isTTY) console.log(`  ${m.key}: then ${e.message.split('\n')[0]}`);
        if (attempt === 1) out.push({ key: m.key, label: m.label, webgl: m.webgl, hz: m.hz, failed: e.message.split('\n')[0] });
      }
    }
  }
  return out;
}

/** One of MOMENTS, `m`, run once and then watched: what it draws again. */
async function moment(base, browser, m) {
  const { context, page, drive } = await watchedPage(browser, m.webgl, seedOf(m.key), 1000 / m.hz);
  /** Frames for `s` seconds of the page's own time. */
  const frames = (s) => Math.round(s * m.hz);
  // (Where the time goes, for CI's log.)
  let since = Date.now();
  const took = () => {
    const s = (Date.now() - since) / 1000;
    since = Date.now();
    return `${s.toFixed(1)} s`;
  };
  try {
    // (The plate lit, as a question's at its reveal, with no right answer's glint: its spark, once a second, is PAINTED's, #340.)
    if (m.key === 'plate') await load(page, drive, `${base}qa.html?${new URLSearchParams({ frame: 'm0', b: 'plate', size: REDRAW_SIZE, 'k.glint': 'false' })}`, () => window.__qa);
    else await load(page, drive, `${base}cards.html?stage`, () => window.__cb?.ready);
    // (The bench's items: every category by name, the dig's way out last.)
    const deal = () => page.evaluate(() => window.__cb.deal(window.__cb.items.slice(0, 3).map((i) => ({ category: i.value, kind: null }))));
    // The pointer over the middle card: its events sent in the page, and the card held hovered (CSS's
    // :hover) through DevTools. (A real pointer's, while the page's time stands still between frames,
    // crashes Chrome's renderer.)
    const MIDDLE = '.choose .cards > .card';
    let cdp;
    const hover = async (on) => {
      if (!cdp) {
        cdp = await context.newCDPSession(page);
        await cdp.send('DOM.enable');
        await cdp.send('CSS.enable');
      }
      await cdp.send('DOM.getDocument');
      const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('${MIDDLE}')[1]` });
      const { nodeId } = await cdp.send('DOM.requestNode', { objectId: result.objectId });
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: on ? ['hover'] : [] });
    };
    let box;
    /** A pointer event at the i-th of 60 steps across the card, from near its top left to near its bottom right. */
    const point = (type, i) => page.evaluate(([sel, type, x, y]) => document.querySelectorAll(sel)[1].dispatchEvent(new PointerEvent(type, { pointerType: 'mouse', clientX: x, clientY: y, bubbles: type === 'pointermove' })), [MIDDLE, type, box.x + box.width * (0.2 + (0.6 * i) / 60), box.y + box.height * (0.25 + (0.5 * i) / 60)]);
    const enter = async () => {
      box = await page.locator(MIDDLE).nth(1).boundingBox();
      await hover(true);
      await point('pointerenter', 0);
    };
    /**
     * How each is set off: what's done first, each come to rest before
     * it's watched (`before`); what sets it off (`go`, given `step`, to
     * call between the pointer's moves: a frame); what's done once it's
     * over, before it's run again (`after`).
     */
    const how = {
      deal: { go: deal },
      dig: { go: () => page.evaluate(() => window.__cb.deal([{ category: window.__cb.items[0].value, kind: 'azurite' }, { category: window.__cb.items.at(-1).value, kind: null }])) },
      pick: { before: [deal], go: () => page.evaluate(() => window.__lab.ask()) },
      // The pointer across the lifted card, a move a frame for a second (the card's own hover, its
      // colours and glows coming up, over before it's watched).
      glare: {
        before: [deal, enter],
        go: async (step) => {
          for (let i = 0; i <= 60; i++) {
            await point('pointermove', i);
            await step();
          }
        },
        after: async () => {
          await point('pointerleave', 60);
          await hover(false);
        },
      },
      // The plate put up again, as the desk's Replay does: its field fades in and the pen draws its lines.
      plate: { go: () => page.evaluate(() => postMessage({ qa: 'replay' }, location.origin)) },
    }[m.key];
    if (!how) throw new Error(`The moment “${m.key}” is in MOMENTS but not in moment()’s how: say how it’s set off there.`);
    const reseed = () => page.evaluate(() => window.__reseed());
    /** What comes before it done, each come to rest, and the page's chance and date started over. */
    const ready = async () => {
      await reseed();
      for (const b of how.before ?? []) {
        await b();
        await settled(page, drive);
      }
      await reseed();
    };
    await settled(page, drive);
    const loaded = took();
    await ready();
    await how.go(() => drive.frames(1));
    await how.after?.();
    await settled(page, drive);
    await ready();
    const once = took();
    // (Its `seconds` from when it's set off, however long it plays: docs/qa.md, “Redraws”.)
    const r = await watched(browser, page, async () => {
      let n = 0;
      await how.go(async () => (n += await drive.frames(1)));
      return n + (await drive.frames(Math.max(0, frames(m.seconds) - n)));
    });
    // (A 60th of a second's worth, whatever the screen's rate.)
    const perFrame = Math.round((r.again / Math.max(1, r.frames)) * (m.hz / 60));
    if (!process.stdout.isTTY) console.log(`  ${m.key}: ${r.frames} frames at ${m.hz} Hz, ${kpx(perFrame)} drawn again a 60th of a second; last written ${(r.last / m.hz).toFixed(2)} s in, ${r.running} animations still running at the end; at rest ${loaded}, run once ${once}, traced ${took()}`);
    return { key: m.key, label: m.label, webgl: m.webgl, hz: m.hz, perFrame, frames: r.frames, px: r.px, again: r.again, last: r.last, running: r.running, changing: r.changing, painted: r.painted, layers: r.layers.slice(0, 6), writes: r.writes };
  } finally {
    await context.close();
  }
}

async function checkRedraws(base, scenes) {
  const traceBrowsers = [];
  let atRestFound = [];
  let momentsFound = [];
  try {
    if (values.moments) {
      console.log(`Redraws in the moments, at ${REDRAW_SIZE}, on fixed frames, from ${base}, ${runner()}`);
      const b = await launchTraced();
      traceBrowsers.push(b);
      momentsFound = await moments(base, b);
    } else {
      const firsts = scenesToWatch(scenes);
      if (!firsts.length) throw new Error(only ? `No scene's key matches ${only}${values.webgl ? ' among the WebGL scenes' : ''}.` : 'No scenes.');
      // (Two at once: a CI runner has four threads, and a page drawing in software keeps more than one busy.
      // With WebGL one at a time: a page drawing WebGL in software keeps them all busy, and two took a
      // runner over 12 minutes where one after the other take 4 to 8.)
      const at = Math.min(firsts.length, values.webgl ? 1 : 2);
      console.log(`Redraws at rest: ${firsts.length} scenes${shard ? ` (part ${shard[0]} of ${shard[1]})` : ''}, ${at} at once, at ${REDRAW_SIZE}, ${values.webgl ? 'with WebGL' : 'WebGL refused'}, on fixed frames, from ${base}, ${runner()}`);
      for (let i = 0; i < at; i++) traceBrowsers.push(await launchTraced());
      atRestFound = await scenesAtRest(base, firsts, traceBrowsers);
    }
  } finally {
    await Promise.all(traceBrowsers.map((b) => b.close()));
  }
  const BASELINE = path.join(ROOT, 'src', 'qa', 'redrawBaselines.json');
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  // (The baselines are of one size, CI's: at another there's nothing to hold a moment to.)
  const sameSize = !baseline.size || baseline.size === REDRAW_SIZE;
  for (const m of momentsFound) {
    if (m.failed) continue;
    m.baseline = sameSize ? baseline.moments?.[m.key] : undefined;
    // (In CI, one with none fails: a moment held to nothing would pass whatever it drew.)
    m.problem = overBaseline(m.key, m.perFrame, m.baseline, !!process.env.CI);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(SCREENS, `redraws-${stamp}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ at: new Date().toISOString(), head: git(ROOT, 'rev-parse', 'HEAD'), size: REDRAW_SIZE, webgl: !!values.webgl, atRest: atRestFound, moments: momentsFound }, null, 1));

  // Where to look, for a scene or a moment that fails.
  const clues = (r) => [...(r.changing.length ? [`    written on most frames: ${r.changing.slice(0, 4).join(', ')}`] : []), ...(r.painted.length ? [`    animating what isn’t its transform or opacity: ${r.painted.slice(0, 4).join('; ')}`] : [])];
  const HOW = 'To find what draws it again and fix it: docs/development.md, “Finding a stutter” (a layer of its own, or a transform or opacity animated instead; never drawn less well).';
  const lines = [];
  const bad = atRestFound.filter((s) => s.failed || s.problems.length);
  for (const s of atRestFound) {
    if (s.failed) lines.push(`  ${s.scene}: failed: ${s.failed}`);
    for (const p of s.problems) lines.push(`  ${s.scene}: ${p}`);
    if (s.problems.length) lines.push(...clues(s));
  }
  if (atRestFound.length) lines.unshift(`At rest: ${atRestFound.length} scenes, ${bad.length} with a layer drawn again ${kpx(FLOOR)} a frame or more, or the page ${kpx(PAGE_FLOOR)}${bad.length ? ':' : '.'}`);
  for (const m of momentsFound) {
    if (m.failed) {
      lines.push(`${m.label}: failed: ${m.failed}`);
      continue;
    }
    const of = m.baseline !== undefined ? `baseline ${kpx(m.baseline)}` : sameSize ? 'no baseline yet' : `no baseline at ${REDRAW_SIZE}`;
    lines.push(`${m.label}${m.webgl ? ' (with WebGL)' : ''}: ${kpx(m.perFrame)} drawn again a 60th of a second, over ${m.frames} frames at ${m.hz} Hz; ${of}`);
    if (m.problem) {
      lines.push(`  FAILS: ${m.problem}. Drawn again most:`);
      for (const l of m.layers.slice(0, 4)) lines.push(`    ${l.name} (${l.w}×${l.h}): on ${Math.round((Math.min(l.commits, m.frames) / m.frames) * 100)}% of the frames, ${kpx((l.again / Math.max(1, m.frames)) * (m.hz / 60))} a 60th of a second`);
      lines.push(...clues(m));
    }
  }
  if (atRestFound.some((s) => s.problems.length) || momentsFound.some((m) => m.problem)) lines.push(HOW);
  for (const l of lines) console.log(l);
  const measured = { size: REDRAW_SIZE, moments: Object.fromEntries(momentsFound.filter((m) => !m.failed).map((m) => [m.key, m.perFrame])) };
  if (values.baseline && momentsFound.length && !sameSize) console.log(`Not written into ${path.relative(ROOT, BASELINE)}: its baselines are at ${baseline.size}, CI's size, not ${REDRAW_SIZE}.`);
  else if (values.baseline && momentsFound.length) {
    // (The moments not run this time, another job's, kept.)
    writeFileSync(BASELINE, `${JSON.stringify({ ...baseline, ...measured, moments: { ...baseline.moments, ...measured.moments } }, null, 2)}\n`);
    console.log(`Wrote the moments into ${path.relative(ROOT, BASELINE)}.`);
  }
  // In CI, the job's summary: what was found, and the moments as measured, to commit as the baseline when a change means them.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const title = values.moments ? 'Redraws in the moments' : `Redraws at rest${values.webgl ? ', with WebGL' : ''}${shard ? `, part ${shard[0]} of ${shard[1]}` : ''}`;
    const md = [`## ${title}`, '', ...lines.map((l) => `    ${l}`), ''];
    if (momentsFound.length) md.push('The moments as measured here, for `src/qa/redrawBaselines.json` when a change means them to cost more (or less):', '', '```json', JSON.stringify(measured, null, 2), '```');
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`, { flag: 'a' });
  }
  console.log(`Report: screens/redraws-${stamp}/report.json`);
  if (values.canary) {
    // (Failed by what it watched, not by a page that didn't load or a trace not read.)
    const caught = atRestFound.length > 0 && atRestFound.every((s) => s.problems.length);
    console.log(caught ? 'The canary failed, as it should: the check sees a page drawn again every frame.' : 'The canary passed: the check would pass a page drawn again every frame, so it reads the trace wrong (an update to Chrome or Playwright?). src/qa/redraws.ts reads it.');
    return caught ? 0 : 1;
  }
  return bad.length + momentsFound.filter((m) => m.failed || m.problem).length ? 1 : 0;
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
  // (Listed in the headless shell, the one browser the check needs: CI installs no other.)
  const lister = values.moments ? null : await chromium.launch({ headless: true });
  const every = lister ? await listScenes(served.base, lister).finally(() => lister.close()) : [];
  const code = await checkRedraws(
    served.base,
    every.filter((s) => !only || only.test(s.key)),
  ).catch((e) => {
    console.error(e.message);
    return 1;
  });
  served.close();
  process.exit(code);
}
let scenes = (await listScenes(served.base)).filter((s) => !only || only.test(s.key));
if (values.change) {
  // As the desk's This change has it (src/qa/change.ts): the places that run what this branch changes, and with what changes every screen, the first place of each.
  const change = changeHere(ROOT);
  const keys = new Set(change?.places.map((p) => p.key));
  const everywhere = (change?.everywhere ?? []).filter((e) => e.of === 'screens');
  const firsts = new Set();
  if (everywhere.length) for (const s of scenes) if (s.place && ![...firsts].some((k) => k.split('/')[0] === s.key.split('/')[0])) firsts.add(s.key);
  scenes = scenes.filter((s) => s.place && (keys.has(s.key) || firsts.has(s.key)));
  const also = everywhere.length ? ` It changes what every screen runs (${everywhere.map((e) => e.file.split('/').pop()).join(', ')}): the first place of each too.` : '';
  const none = [...(change?.uncovered ?? []), ...(change?.unrun ?? []).map((u) => `${u.file} (${u.what})`)];
  console.log(`This change: ${change?.files.length ?? 0} files changed, ${scenes.length} places run them.${also}${none.length ? ` No place runs ${none.join(', ')}.` : ''}`);
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
