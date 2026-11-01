// Chrome on this PC's own screen, headed, for traces of what holds a frame
// up (docs/development.md, "Finding a stutter"). Headless Chrome draws with
// no real GPU, so it can't show what a player's GPU spends its time on.
//
// Every script in this folder starts from here: open() starts Chrome, its
// window as big as the screen, with a profile of its own kept between runs
// (a warm shader cache, as a player's), and has the page keep every frame's
// time, its long animation frames and the scripts' marks; trace() streams a
// Chrome trace into .pc/runs/<label>.json, one event per line, for read.py.
// Its window opens behind the others and gives the keyboard back
// (behind.ps1), drawing every frame all the same; FRONT=1 keeps it in front.
// It's muted: the sound still plays in the page, so it costs what a
// player's does, but never reaches the speakers.
// It slows every other session on this machine, so one run at a time, and
// only for what nothing else settles.
//
// Variants, without editing the code: CSS="<rules>" adds a style sheet once
// the page is up, INIT="<js>" runs before the page's own scripts, and
// CATS="<categories>" picks the trace's categories.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../..', import.meta.url));
/** Where the scripts write their runs and Chrome's profile: kept out of the repo (.gitignore). */
export const work = join(root, '.pc');
export const runs = join(work, 'runs');
const { chromium } = createRequire(join(root, 'package.json'))('playwright-core');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// (Kept in the page: every frame's time, the long animation frames with the scripts in them, and the marks.)
const RECORD = `window.__frames = []; window.__loaf = []; window.__marks = [];
(() => {
  let last = performance.now();
  const f = (n) => { window.__frames.push([Math.round(n), +(n - last).toFixed(1)]); last = n; requestAnimationFrame(f); };
  requestAnimationFrame(f);
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), style: Math.round(e.startTime + e.duration - e.styleAndLayoutStart), scripts: e.scripts.map((s) => [Math.round(s.duration), s.invoker, (s.sourceURL || '').split('/').pop(), s.sourceFunctionName]) }); }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
})();`;

/**
 * On Windows, behind.ps1 waiting for Chrome's window, to put it behind the
 * others and give the foreground back; resolved once it knows which window
 * that is, so Chrome starts after. Not with FRONT=1.
 */
function behind() {
  if (process.platform !== 'win32' || process.env.FRONT) return Promise.resolve();
  const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('behind.ps1', import.meta.url))], { stdio: ['ignore', 'pipe', 'inherit'] });
  ps.unref();
  return new Promise((ready) => {
    ps.stdout.on('data', (d) => {
      if (String(d).includes('ready')) ready();
      if (String(d).includes('no window')) console.warn('behind.ps1: no Chrome window found to put behind');
    });
    ps.on('error', () => ready());
    ps.on('exit', () => ready());
  });
}

/** Chrome on the screen (behind the other windows: behind.ps1), its first tab, and the page's records set up. */
export async function open() {
  mkdirSync(runs, { recursive: true });
  await behind();
  const ctx = await chromium.launchPersistentContext(join(work, 'profile'), { channel: 'chrome', headless: false, viewport: null, args: ['--start-maximized', '--mute-audio'] });
  await ctx.addInitScript(RECORD);
  if (process.env.INIT) await ctx.addInitScript(process.env.INIT);
  if (process.env.CSS) await ctx.addInitScript(`document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(process.env.CSS)}; document.head.append(st); });`);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  return { ctx, page };
}

/** Marks a moment in the page's records and in the trace (where read.py splits the phases). */
export const mark = (page, name) => page.evaluate((n) => { performance.mark(n); window.__marks.push([Math.round(performance.now()), n]); }, name);

/**
 * Starts a trace into .pc/runs/<label>.json. Returns the function that ends
 * it: it saves what the page kept beside it (<label>.json.frames.json) and
 * returns that too.
 */
export async function trace(ctx, page, label) {
  const out = join(runs, `${label}.json`);
  const cdp = await ctx.newCDPSession(page);
  const ws = createWriteStream(out);
  ws.write('{"traceEvents":[\n');
  let first = true;
  cdp.on('Tracing.dataCollected', (e) => {
    for (const ev of e.value) {
      ws.write((first ? '' : ',\n') + JSON.stringify(ev));
      first = false;
    }
  });
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  const cats = (process.env.CATS ?? 'toplevel,gpu,blink.user_timing,devtools.timeline').split(',');
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: cats, recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
  return async () => {
    const kept = await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, frames: window.__frames, loaf: window.__loaf, marks: window.__marks }));
    await cdp.send('Tracing.end');
    await done;
    await new Promise((r) => ws.end('\n]}\n', r));
    writeFileSync(`${out}.frames.json`, JSON.stringify(kept));
    console.log(`trace: ${out}`);
    return kept;
  };
}
