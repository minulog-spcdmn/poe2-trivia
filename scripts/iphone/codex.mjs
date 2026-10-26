// The codex on the phone, as a thumb goes through it (docs/iphone.md): opened
// from the start page, down to where the items start, scrolled through them
// and back (by the browser, as a swipe is, then by the page's script), then
// two items opened and closed. It prints each phase's frames
// as the page got them, and the page process's CPU use over the run (its
// share of one core, all threads/the main one: low while it stutters means
// the time went outside the page, to the compositor).
//   [SETUP=<js or setups/ file>] [AFTER=<js>] [TIMELINE=1] node scripts/iphone/codex.mjs <url> <label> [out dir]
// The build wants a full codex, as build.mjs seeds it. AFTER runs once the
// codex is open (to change something there). Writes <label>.codex.json into
// the out dir (.phone/runs/), and <label>.timeline.json with TIMELINE.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { button, log, open, phases, printPhases, runDir, setup, sleep, watchFrames } from './phone.mjs';

const [url, label, dir] = process.argv.slice(2);
if (!url || !label) {
  console.error('usage: node scripts/iphone/codex.mjs <url> <label> [out dir]');
  process.exit(2);
}
const out = runDir(dir);
const SETUP = setup();

const page = await open(url, { fresh: true });
const { ev, until } = page;
await until(`document.readyState === 'complete' && !!${button('/^Codex/')}`, 'start page');
await sleep(4000);
if (SETUP) log('setup:', await ev(SETUP));
const frames = await watchFrames(page);
const { mark } = frames;
const records = [];
if (process.env.TIMELINE === '1') {
  page.on('Timeline.eventRecorded', (p) => records.push(p.record));
  await page.send('Timeline.enable');
  await page.send('Timeline.start', { maxCallStackDepth: 4 });
}
// (About every 500 ms; its samples carry no times on iOS, so the run's whole.)
const cpu = [];
page.on('CPUProfiler.trackingUpdate', (p) => cpu.push([p.event.usage, p.event.threads?.find((t) => t.type === 'main')?.usage ?? 0]));
await page.send('CPUProfiler.startTracking').catch(() => {});

await mark('open');
await ev(`${button('/^Codex/')}.click()`);
await until(`!!document.querySelector('button.tile')`, 'codex');
await sleep(4000);
if (process.env.AFTER) log('after open:', await ev(process.env.AFTER));
await mark('still');
await sleep(3000);
// Down to where the items start (the top of the codex is its records, not the grid).
log('grid at', await ev(`(() => { const t = document.querySelector('button.tile'); const y = t.getBoundingClientRect().top + document.scrollingElement.scrollTop - 90; document.scrollingElement.scrollTop = y; return Math.round(y) + ' of ' + document.scrollingElement.scrollHeight + ' px'; })()`));
await sleep(2000);
await mark('gridStill');
await sleep(2000);
// Through the items and back as a thumb goes, scrolled by the browser itself
// (as a swipe is, off the page's main thread): 3000 px down in five strokes
// of 600 and back up the same.
await mark('scroll');
log('scrolled', await ev(`new Promise((done) => { const el = document.scrollingElement; const y0 = el.scrollTop; const strokes = [600, 600, 600, 600, 600, -600, -600, -600, -600, -600]; let k = 0, most = 0; const next = () => { most = Math.max(most, el.scrollTop - y0); if (k === strokes.length) return done(Math.round(most) + ' px down, back to ' + Math.round(el.scrollTop - y0)); window.scrollBy({ top: strokes[k++], behavior: 'smooth' }); setTimeout(next, 800); }; next(); })`));
await sleep(800);
// The same again with the page moving itself, 30 px a frame, as only the
// middle-button autoscroll does (autoscroll.ts). Not what a thumb gets: a
// scroll on the main thread makes WebKit repaint whatever crosses the edge of
// a fixed layer that ends where the screen does, so this catches the
// backdrop sized to the viewport again (installedApp.ts).
await mark('scripted');
await ev(`new Promise((done) => { let n = 0; const step = () => { document.scrollingElement.scrollTop += n < 100 ? 30 : -30; if (++n < 200) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); })`);
await sleep(800);
for (let k = 0; k < 2; k++) {
  await mark(`item${k}`);
  log(`item${k}:`, await ev(`(() => { const ts = [...document.querySelectorAll('button.tile')].filter((t) => { const r = t.getBoundingClientRect(); return r.top > 80 && r.bottom < innerHeight - 80; }); const t = ts[${k} * 3]; if (!t) return 'no tile on screen'; t.click(); return t.getAttribute('aria-label') ?? t.textContent.trim().slice(0, 30); })()`));
  await until(`!!document.querySelector('button.close')`, 'item window', 10000);
  await sleep(4500);
  await mark(`item${k}Still`);
  await sleep(3000);
  await mark(`item${k}Close`);
  await ev(`document.querySelector('button.close').click()`);
  await sleep(1500);
}
await mark('end');
await page.send('CPUProfiler.stopTracking').catch(() => {});
if (process.env.TIMELINE === '1') await page.send('Timeline.stop').catch(() => {});
await sleep(1000);
const got = await frames.read();
page.close();
// What setups/rafTime.js found: each phase's animation-frame callbacks and timers, by their source.
if (got.rafStats)
  for (const [phase, by] of Object.entries(got.rafStats)) {
    console.log('  ' + phase);
    for (const [k, [n, js, dirty]] of Object.entries(by).sort((a, b) => b[1][1] + b[1][2] - a[1][1] - a[1][2]).slice(0, 8))
      console.log(`    js ${js.toFixed(0).padStart(5)} ms  left dirty ${dirty.toFixed(0).padStart(5)} ms  ${String(n).padStart(4)}x  ${k}`);
  }
const rows = phases(got);
printPhases(rows);
const mean = (i) => (cpu.length ? Math.round(cpu.reduce((s, c) => s + c[i], 0) / cpu.length) : '-');
log(`cpu ${mean(0)}% all threads, ${mean(1)}% main`);
writeFileSync(join(out, `${label}.codex.json`), JSON.stringify({ label, url, SETUP, rows, raf: got.raf, marks: got.marks, cpu }));
if (records.length) writeFileSync(join(out, `${label}.timeline.json`), JSON.stringify(records));
process.exit(0);
