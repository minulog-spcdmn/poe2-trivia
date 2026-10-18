#!/usr/bin/env node
// Screenshots pages of the app at the design canvas's sizes, for design
// review and handoff: each page at each size of a preset, in headless
// Chromium, once its fonts are in (document.fonts.ready, then each of the
// project's faces the page actually uses loaded and checked: Maragsa,
// Maragsa Title, Cinzel, EB Garamond, Fontin SmallCaps, Fontin), the network
// is idle, its pictures are decoded and its layout has stopped moving.
// Writes the shots, named <page>-<size>-<w>x<h>.png, and a manifest.json
// (each shot's url, size, device scale and which fonts were confirmed) into
// screens/<timestamp>/ (kept out of the repo by .gitignore).
//
// By default WebGL is hidden before the page loads and motion is reduced, as
// CLAUDE.md says for checking anything but the effects: src/lib/fx/ stays
// off and nothing crawls. --webgl keeps the effects (on the GPU) and the motion.
//
// Needs a server to point at: the dev server (npm run dev, the default URL),
// a preview build, or the beta (--url https://poe2.quest/beta/).
// Chromium: Playwright's own (npx playwright-core install chromium), or any
// Chromium or Chrome named by CHROMIUM (or BOT_CHROMIUM).
//
//   npm run screens -- [--preset quick|walk|full] [--url http://localhost:5173/] [--page / --page /qa.html ...]
//                      [--out dir] [--full-page] [--dpr N] [--webgl] [--concurrency 4]
//   (or node scripts/capture-screens.mjs --preset full; from PowerShell, where npm eats the flags,
//   npm run screens full webgl page=/lab.html; --help or the bare word help for the rest)

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { PRESETS as SIZE_SETS, SIZES } from '../src/qa/sizes.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The sizes, from the one list the QA desk uses too (src/qa/sizes.ts): the
 * design canvas's three (quick), the desk's walk (walk: a phone, a 13-inch
 * laptop and a 4K screen at 150% and 100%) and every size (full). Each shot
 * gets its size's own device scale unless --dpr names one.
 */
const PRESETS = Object.fromEntries(
  Object.entries(SIZE_SETS).map(([name, keys]) => [
    name,
    keys.map((k) => {
      const s = SIZES.find((x) => x.key === k);
      return { name: s.key, w: s.w, h: s.h, dpr: s.dpr, touch: !!s.touch };
    }),
  ]),
);

/** The faces app.css declares (and @fontsource brings in), the ones whose loading is confirmed. */
const FAMILIES = ['Maragsa', 'Maragsa Title', 'Cinzel', 'EB Garamond', 'Fontin SmallCaps', 'Fontin'];

/** Chromium on Android, for the touch sizes, so the page sees a phone or tablet as Claude's own browser pane does. */
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

const OPTIONS = {
  preset: { type: 'string', default: 'quick' },
  url: { type: 'string', default: 'http://localhost:5173/' },
  page: { type: 'string', multiple: true },
  out: { type: 'string' },
  'full-page': { type: 'boolean', default: false },
  dpr: { type: 'string' },
  webgl: { type: 'boolean', default: false },
  concurrency: { type: 'string', default: '4' },
  timeout: { type: 'string', default: '15' },
  help: { type: 'boolean', short: 'h', default: false },
};
const parsed = parseArgs({ options: OPTIONS, allowPositionals: true });
// PowerShell drops the `--` in `npm run screens -- --preset full`, and npm
// then takes the flags as its own settings (npm_config_*) and hands on only
// their values (as scripts/room-bot.mjs works around too): so those settings
// count, and so do bare words: `full`, `walk` or `quick` (the preset), a path
// starting with / (a page), `name=value` and a bare flag name (`webgl`).
// npm reads `--concurrency 3` as a bare setting (true) and the 3 as a word:
// such an option takes the first word nothing else claims.
const opts = { ...parsed.values };
const given = (name) => process.argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`) || (name === 'help' && a === '-h'));
const awaiting = [];
for (const [name, def] of Object.entries(OPTIONS)) {
  if (given(name)) continue;
  const env = process.env[`npm_config_${name.replace(/-/g, '_')}`];
  if (env === undefined || env === '') continue;
  if (def.type === 'string' && env === 'true') awaiting.push(name);
  else opts[name] = def.type === 'boolean' ? env === 'true' : def.multiple ? [env] : env;
}
/**
 * A page as given, made a path: Git Bash rewrites a leading / into its own
 * install folder (/lab.html arrives as C:/Program Files/Git/lab.html),
 * so that prefix is taken back off, and lab.html without the slash works too.
 */
const GIT_PREFIX = /^[A-Za-z]:[\\/]Program Files(?: \(x86\))?[\\/]Git(?=[\\/]|$)/i;
function asPage(w) {
  const p = w.replace(GIT_PREFIX, '').replace(/\\/g, '/');
  return p.startsWith('/') ? p : `/${p}`;
}
const isPage = (w) => w.startsWith('/') || GIT_PREFIX.test(w) || /^[\w.-]+\.html([?#].*)?$/.test(w);
// npm hands the numbers on in the order typed, but they can't be told apart.
const numeric = awaiting.filter((n) => ['dpr', 'concurrency', 'timeout'].includes(n));
if (numeric.length > 1) {
  console.error(`npm took --${numeric.join(', --')} as its own (no -- before them), so their numbers can't be told apart. Write them as ${numeric.map((n) => `${n}=N`).join(' ')}.`);
  process.exit(2);
}
for (const word of parsed.positionals) {
  const fits = { page: { test: isPage }, url: /^https?:\/\//, preset: /^(quick|walk|full)$/, dpr: /^[\d.]+$/, concurrency: /^\d+$/, timeout: /^[\d.]+$/, out: { test: (w) => !/^[\d.]+$/.test(w) && !/^https?:\/\//.test(w) && !(w in PRESETS) && !(w.split('=')[0] in OPTIONS) && !isPage(w) } };
  const taker = awaiting.findIndex((name) => fits[name]?.test(word));
  if (taker >= 0) {
    const [name] = awaiting.splice(taker, 1);
    opts[name] = OPTIONS[name].multiple ? [...(opts[name] ?? []), word] : word;
    continue;
  }
  const [name, ...rest] = word.split('=');
  const value = rest.join('=');
  if (word in PRESETS) opts.preset = word;
  else if (isPage(word)) opts.page = [...(opts.page ?? []), word];
  else if (OPTIONS[name]?.type === 'boolean') opts[name] = rest.length ? value === 'true' : true;
  else if (OPTIONS[name] && rest.length) opts[name] = OPTIONS[name].multiple ? [...(opts[name] ?? []), value] : value;
  else if (/^https?:\/\//.test(word)) opts.url = word;
  else {
    console.error(`Don't know "${word}" (--help for the options; from PowerShell, npm run screens full webgl page=/lab.html works too).`);
    process.exit(2);
  }
}

/** The app's pages: every .html at the top of the repo is one of Vite's entries. */
const entries = readdirSync(ROOT)
  .filter((f) => f.endsWith('.html'))
  .map((f) => (f === 'index.html' ? '/' : `/${f}`));

if (opts.help) {
  console.log(`Screenshots pages of the app at the design sizes.

Usage: npm run screens -- [options]   (or node scripts/capture-screens.mjs [options])

  --preset quick|walk|full  (sizes from src/qa/sizes.ts)
                       quick (default): ${PRESETS.quick.map((s) => `${s.name} ${s.w}x${s.h}`).join(', ')}
                       walk: ${PRESETS.walk.map((s) => `${s.name} ${s.w}x${s.h}`).join(', ')}
                       full: ${PRESETS.full.map((s) => `${s.name} ${s.w}x${s.h}`).join(', ')}
  --url URL            the app's base (default http://localhost:5173/; the beta: https://poe2.quest/beta/)
  --page PATH          a page under it, as often as wanted (default /); this checkout's pages:
                       ${entries.join(' ')}
  --out DIR            where the shots go (default screens/<timestamp>/)
  --full-page          the whole scrolling page, not only the viewport
  --dpr N              device scale for every size (default: each size's own, from src/qa/sizes.ts)
  --webgl              keep WebGL (the effects, on the GPU) and full motion; by default WebGL
                       is hidden and motion reduced (CLAUDE.md)
  --concurrency N      shots taken at once, each in its own context (default 4)
  --timeout S          seconds each wait (fonts, network, pictures, layout) may take before it
                       warns and goes on (default 15)
  -h, --help           this`);
  process.exit(0);
}

const sizes = PRESETS[opts.preset];
if (!sizes) {
  console.error(`No preset "${opts.preset}" (quick, walk or full).`);
  process.exit(1);
}
const pages = [...new Set((opts.page?.length ? opts.page : ['/']).map(asPage).map((p) => (p === '/index.html' ? '/' : p)))];
const base = opts.url.endsWith('/') ? opts.url : `${opts.url}/`;
const timeout = Number(opts.timeout) * 1000;
const concurrency = Number(opts.concurrency);
if (!(timeout >= 1000)) {
  console.error(`--timeout takes seconds, at least 1, not "${opts.timeout}".`);
  process.exit(2);
}
if (!(Number.isInteger(concurrency) && concurrency >= 1)) {
  console.error(`--concurrency takes a whole number, at least 1, not "${opts.concurrency}".`);
  process.exit(2);
}
const dpr = opts.dpr !== undefined ? Number(opts.dpr) : undefined;
if (dpr !== undefined && !(dpr > 0 && dpr <= 4)) {
  console.error(`--dpr takes a number above 0 and up to 4, not "${opts.dpr}".`);
  process.exit(2);
}
const now = new Date();
const stamp = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace(/:/g, '-');
const outDir = path.resolve(opts.out ?? path.join(ROOT, 'screens', stamp));

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(base);
for (const p of pages) {
  const file = p.split(/[?#]/)[0];
  if (isLocal && !entries.includes(file === '' ? '/' : file)) console.warn(`warning: ${p} isn't one of this checkout's pages (${entries.join(' ')})`);
}

/** A page path as a file name: / is index, /lab.html?x=1 is lab_x-1. */
function pageName(p) {
  const [file, rest = ''] = p.split(/(?=[?#])/);
  const name = file.replace(/^\/+/, '').replace(/\.html$/, '').replace(/\/+$/, '') || 'index';
  const extra = rest.replace(/^[?#]/, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return (extra ? `${name}_${extra}` : name).replace(/[\\/]/g, '-');
}

/** Races a promise against the timeout; on timeout it resolves to `fallback`. */
const within = (promise, ms, fallback) =>
  Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))]);

// Fail early and plainly when nothing is listening.
try {
  await fetch(base, { method: 'GET', signal: AbortSignal.timeout(10000) });
} catch {
  console.error(`Nothing answers at ${base}. Start the dev server (npm run dev) or pass --url.`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || process.env.BOT_CHROMIUM || undefined,
  // With the effects on, render them on the GPU rather than in software.
  args: opts.webgl ? [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu', '--ignore-gpu-blocklist'] : [],
});

/** Each page's file-name stem, made unique (/lab and /lab.html would both be lab). */
const stems = new Map();
for (const p of pages) {
  let stem = pageName(p);
  for (let n = 2; [...stems.values()].includes(stem); n++) stem = `${pageName(p)}-${n}`;
  stems.set(p, stem);
}

/** Takes one shot: a fresh context (its own storage) at the size, the page loaded and settled. */
async function shoot(pagePath, size) {
  const scale = dpr ?? size.dpr;
  const url = new URL(pagePath.replace(/^\/+/, ''), base).href;
  const file = `${stems.get(pagePath)}-${size.name}-${size.w}x${size.h}.png`;
  const warnings = [];
  let context;
  try {
    context = await browser.newContext({
      viewport: { width: size.w, height: size.h },
      deviceScaleFactor: scale,
      isMobile: !!size.touch,
      hasTouch: !!size.touch,
      ...(size.touch ? { userAgent: MOBILE_UA } : {}),
      reducedMotion: opts.webgl ? 'no-preference' : 'reduce',
    });
    if (!opts.webgl)
      await context.addInitScript(() => {
        delete window.WebGL2RenderingContext;
        delete window.WebGLRenderingContext;
      });
    const page = await context.newPage();
    page.on('pageerror', (e) => warnings.push(`page error: ${e.message}`));
    await page.goto(url, { waitUntil: 'load', timeout: timeout * 2 });
    await page.waitForLoadState('networkidle', { timeout }).catch(() => warnings.push('network never went idle'));

    // Fonts: the set settled, then each project face the page's text uses
    // (every one of them in its elements' font stacks, with the weight, style
    // and some of the text, so the right unicode-range subset is asked for),
    // loaded and checked, and a face of that family actually loaded.
    const fonts = await page.evaluate(
      async ({ families, ms }) => {
        const wait = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), ms))]);
        const fontsReady = (await wait(document.fonts.ready.then(() => 'ok'))) === 'ok';
        const clean = (f) => f.trim().replace(/^['"]|['"]$/g, '');
        const wanted = new Map();
        for (const el of document.querySelectorAll('body *')) {
          const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
          const text = own || (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value || el.placeholder : '');
          if (!text) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          for (const fam of cs.fontFamily.split(',').map(clean)) {
            if (!families.includes(fam)) continue;
            const spec = `${cs.fontStyle === 'normal' ? '' : 'italic '}${cs.fontWeight} 16px "${fam}"`;
            const prev = wanted.get(spec) ?? { family: fam, spec, text: '' };
            if (prev.text.length < 200) prev.text += text.slice(0, 200);
            wanted.set(spec, prev);
          }
        }
        const confirmed = [];
        const missing = [];
        for (const w of wanted.values()) {
          const loaded = await wait(document.fonts.load(w.spec, w.text).then(() => 'ok', () => 'error'));
          const ok =
            loaded === 'ok' &&
            document.fonts.check(w.spec, w.text) &&
            [...document.fonts].some((f) => clean(f.family) === w.family && f.status === 'loaded');
          (ok ? confirmed : missing).push(w.spec);
        }
        return { fontsReady, confirmed: confirmed.sort(), missing: missing.sort() };
      },
      { families: FAMILIES, ms: timeout },
    );
    if (!fonts.fontsReady) warnings.push('document.fonts.ready never resolved');
    if (fonts.missing.length) warnings.push(`fonts not confirmed: ${fonts.missing.join('; ')}`);

    // Pictures: every one that's loading (lazy ones off screen aside) loaded and decoded.
    const pictures = await within(
      page.evaluate(() =>
        Promise.all(
          [...document.images]
            .filter((i) => i.complete || i.loading !== 'lazy')
            .map((i) =>
              (i.complete
                ? Promise.resolve()
                : new Promise((r) => {
                    i.addEventListener('load', r, { once: true });
                    i.addEventListener('error', r, { once: true });
                  }))
                .then(() => i.decode())
                .catch(() => {}),
            ),
        ).then(() => 'ok'),
      ),
      timeout,
      'timeout',
    );
    if (pictures !== 'ok') warnings.push('pictures still decoding');

    // Layout: polled until two snapshots in a row (page size and every
    // element's layout box) match the one before, rather than a fixed sleep.
    const settled = await page.evaluate(async (ms) => {
      const snap = () => {
        const parts = [document.documentElement.scrollWidth, document.documentElement.scrollHeight, document.body.scrollHeight];
        // Layout boxes (offset*), which leave transforms out: an animation
        // that only moves or scales something (with --webgl's full motion)
        // isn't the layout still changing.
        for (const el of document.querySelectorAll('body *'))
          if (el instanceof HTMLElement) parts.push(el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight);
        return parts.join(',');
      };
      const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100)));
      const end = performance.now() + ms;
      let last = snap();
      let same = 0;
      while (performance.now() < end) {
        await frame();
        const now = snap();
        same = now === last ? same + 1 : 0;
        last = now;
        if (same >= 2) return true;
      }
      return false;
    }, timeout);
    if (!settled) warnings.push('layout kept moving');

    await page.screenshot({ path: path.join(outDir, file), fullPage: opts['full-page'], animations: opts.webgl ? 'allow' : 'disabled', caret: 'hide' });
    return { file, page: pagePath, url, size: size.name, width: size.w, height: size.h, dpr: scale, mobile: !!size.touch, fonts, settled, warnings };
  } catch (e) {
    warnings.push(`failed: ${e.message.split('\n')[0]}`);
    return { file: null, page: pagePath, url, size: size.name, width: size.w, height: size.h, dpr: scale, mobile: !!size.touch, warnings };
  } finally {
    await context?.close();
  }
}

const jobs = pages.flatMap((p) => sizes.map((s) => [p, s]));
const shots = [];
let next = 0;
const started = Date.now();
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const [p, s] = jobs[next++];
      const shot = await shoot(p, s);
      shots.push(shot);
      const fontLine = shot.fonts ? `${shot.fonts.confirmed.length} font faces confirmed` : '';
      console.log(`${shot.file ?? `${stems.get(p)} ${s.name} FAILED`}  ${fontLine}${shot.warnings.length ? `  • ${shot.warnings.join(' • ')}` : ''}`);
    }
  }),
);
await browser.close();

const order = (s) => jobs.findIndex(([p, z]) => p === s.page && z.name === s.size);
shots.sort((a, b) => order(a) - order(b));
writeFileSync(
  path.join(outDir, 'manifest.json'),
  `${JSON.stringify(
    {
      created: new Date().toISOString(),
      base,
      preset: opts.preset,
      webgl: opts.webgl,
      reducedMotion: !opts.webgl,
      fullPage: opts['full-page'],
      shots,
    },
    null,
    2,
  )}\n`,
);
const failed = shots.filter((s) => !s.file).length;
console.log(`${shots.length - failed} shots in ${((Date.now() - started) / 1000).toFixed(1)} s • ${outDir.startsWith(ROOT + path.sep) ? path.relative(ROOT, outDir) : outDir}`);
process.exit(failed ? 1 : 0);
