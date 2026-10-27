// The codex on the phone, as a thumb goes through it (docs/iphone.md): opened
// from the start page, down to where the items start, scrolled through them
// and back, then two items opened and closed, each tap a finger's (phone.mjs,
// tap). It prints each phase's frames as the page got them, and the page
// process's CPU use over the run (its share of one core, all threads/the
// main one: low while it stutters means the time went outside the page, to
// the compositor).
//   [SETUP=<js or setups/ file>] [AFTER=<js>] [TIMELINE=1] node scripts/iphone/codex.mjs <url> <label> [out dir]
// The build wants a full codex, as build.mjs seeds it. AFTER runs once the
// codex is open (to change something there). Writes <label>.codex.json into
// the out dir (.phone/runs/), and <label>.timeline.json with TIMELINE.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { button, log, open, phases, printPhases, printRafStats, runDir, setup, sleep, watchFrames } from './phone.mjs';

const [url, label, dir] = process.argv.slice(2);
if (!url || !label) {
  console.error('usage: node scripts/iphone/codex.mjs <url> <label> [out dir]');
  process.exit(2);
}
const out = runDir(dir);
const SETUP = setup();

const page = await open(url, { fresh: true });
const { ev, until, tap } = page;
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
await tap(button('/^Codex/'));
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
// Through the items and back, 30 px a frame.
await mark('scroll');
await ev(`new Promise((done) => { let n = 0; const step = () => { document.scrollingElement.scrollTop += n < 100 ? 30 : -30; if (++n < 200) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); })`);
await sleep(800);
for (let k = 0; k < 2; k++) {
  await mark(`item${k}`);
  const tile = `[...document.querySelectorAll('button.tile')].filter((t) => { const r = t.getBoundingClientRect(); return r.top > 80 && r.bottom < innerHeight - 80; })[${k} * 3]`;
  log(`item${k}:`, await ev(`(() => { const t = ${tile}; return t ? t.getAttribute('aria-label') ?? t.textContent.trim().slice(0, 30) : 'no tile on screen'; })()`));
  await tap(tile);
  await until(`!!document.querySelector('button.close')`, 'item window', 10000);
  await sleep(4500);
  await mark(`item${k}Still`);
  await sleep(3000);
  await mark(`item${k}Close`);
  await tap(`document.querySelector('button.close')`);
  await sleep(1500);
}
await mark('end');
await page.send('CPUProfiler.stopTracking').catch(() => {});
if (process.env.TIMELINE === '1') await page.send('Timeline.stop').catch(() => {});
await sleep(1000);
const got = await frames.read();
page.close();
printRafStats(got.rafStats);
const rows = phases(got);
printPhases(rows);
const mean = (i) => (cpu.length ? Math.round(cpu.reduce((s, c) => s + c[i], 0) / cpu.length) : '-');
log(`cpu ${mean(0)}% all threads, ${mean(1)}% main`);
writeFileSync(join(out, `${label}.codex.json`), JSON.stringify({ label, url, SETUP, rows, raf: got.raf, marks: got.marks, cpu }));
if (records.length) writeFileSync(join(out, `${label}.timeline.json`), JSON.stringify(records));
process.exit(0);
