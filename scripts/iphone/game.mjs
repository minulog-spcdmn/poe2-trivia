// A game on the phone, played through its Web Inspector (docs/iphone.md): New
// game, a name if it asks, a mode, Begin, then rounds of cards, question,
// answer and reveal, whatever the game shows next. It prints the frames of
// each phase, as the page got them, and each click timed in parts.
//   [MODE=delve|turns|race] [ROUNDS=4] [SETUP=<js or setups/ file>] [TIMELINE=1] [PROFILE=1]
//     node scripts/iphone/game.mjs <url> <label> [out dir]
// Writes <label>.game.json into the out dir (.phone/runs/), with
// <label>.timeline.json (TIMELINE) and <label>.prof.json (PROFILE, for
// profile.mjs) beside it.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { button, log, open, phases, printPhases, runDir, setup, sleep, watchFrames } from './phone.mjs';

const [url, label, dir] = process.argv.slice(2);
if (!url || !label) {
  console.error('usage: node scripts/iphone/game.mjs <url> <label> [out dir]');
  process.exit(2);
}
const out = runDir(dir);
const MODE = process.env.MODE ?? 'delve';
const ROUNDS = +(process.env.ROUNDS ?? 4);
const SETUP = setup();

const page = await open(url, { fresh: true });
const { ev, until } = page;
await until(`document.readyState === 'complete' && !!${button('/^New game$/')}`, 'start page');
// (The start page's own loading settled first.)
await sleep(4000);
if (SETUP) log('setup:', await ev(SETUP));
const frames = await watchFrames(page);
const { mark } = frames;
const records = [];
page.on('Timeline.eventRecorded', (p) => records.push(p.record));
if (process.env.TIMELINE === '1') {
  await page.send('Timeline.enable').catch(() => {});
  await page.send('Timeline.start', { maxCallStackDepth: 4 }).catch(() => {});
}
const prof = [];
page.on('ScriptProfiler.trackingComplete', (p) => prof.push(p));
if (process.env.PROFILE === '1') await page.send('ScriptProfiler.startTracking', { includeSamples: true }).catch((e) => log('profiler', e.message));

/**
 * A click timed in parts: its handler, the work it queued (Svelte's flush),
 * the styles and layout it left, the wait for the next frame and that frame;
 * the nodes it added, then and later, and the next 40 frames' gaps over 40 ms.
 */
const timings = [];
const timedClick = async (sel, what) => {
  const r = await ev(`(async () => {
    const el = ${sel};
    let added = 0;
    const mo = new MutationObserver((ms) => { for (const m of ms) added += m.addedNodes.length; });
    mo.observe(document.body, { childList: true, subtree: true });
    const task = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = r; ch.port2.postMessage(0); });
    const t0 = performance.now();
    el.click();
    const t1 = performance.now();
    await task();
    const t2 = performance.now();
    void document.documentElement.offsetTop;
    const t3 = performance.now();
    const n1 = added;
    await new Promise((r) => requestAnimationFrame(r));
    const t4 = performance.now();
    await task();
    const t5 = performance.now();
    const gaps = [];
    let p = performance.now();
    for (let i = 0; i < 40; i++) { await new Promise((r) => requestAnimationFrame(r)); const t = performance.now(); gaps.push(Math.round(t - p)); p = t; }
    mo.disconnect();
    return { handler: t1 - t0, queued: t2 - t1, styleLayout: t3 - t2, toFrame: t4 - t3, frame: t5 - t4, nodes: n1, nodesLater: added - n1, big: gaps.filter((g) => g > 40) };
  })()`);
  const f = (x) => x.toFixed(0).padStart(4);
  log(`${what.padEnd(8)} handler ${f(r.handler)}  queued ${f(r.queued)}  style+layout ${f(r.styleLayout)}  to frame ${f(r.toFrame)}  frame ${f(r.frame)} ms  nodes ${r.nodes}+${r.nodesLater}  later gaps>40 [${r.big.join(' ')}]`);
  timings.push({ what, ...r });
};

// Into a room of one.
await mark('home');
await ev(`${button('/^New game$/')}.click()`);
const where = await until(`document.querySelector('input[aria-label="Your name"]')?.offsetParent ? 'name' : document.querySelector('button[data-mode]') ? 'lobby' : null`, 'name or lobby', 15000);
if (where === 'name') {
  await ev(`(() => { const f = [...document.querySelectorAll('input[aria-label="Your name"]')].find((x) => x.offsetParent); f.value = 'Tester'; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  await ev(`[...document.querySelectorAll('button[type="submit"]')].find((b) => b.offsetParent && /Start/.test(b.textContent)).click()`);
}
await until(`!!document.querySelector('button[data-mode="${MODE}"]')`, 'lobby');
await mark('lobby');
await sleep(2500);
await ev(`document.querySelector('button[data-mode="${MODE}"]').click()`);
await until(`!document.querySelector('button[data-cursor="begin"]')?.disabled`, 'begin enabled');
await sleep(2000);
await mark('begin');
await timedClick(`document.querySelector('button[data-cursor="begin"]')`, 'begin');

// Rounds: whatever the game shows, acted on.
const state = `(() => {
  if (document.querySelector('button.card:not([disabled])')) return 'cards';
  if (document.querySelector('[data-cursor^="opt:"]:not([disabled])')) return 'question';
  const n = document.querySelector('button[data-cursor="next"]');
  if (n && !n.disabled) return 'reveal';
  return null;
})()`;
let round = 0;
let last = null;
for (let steps = 0; steps < ROUNDS * 4 && round < ROUNDS; steps++) {
  const s = await until(`(() => { const s = ${state}; return s && s !== ${JSON.stringify(last)} ? s : null; })()`, 'the step after ' + last, 25000).catch(() => null);
  if (!s) break;
  last = s;
  await mark(`${s}${round}`);
  log(label, s, round);
  if (s === 'cards') {
    await sleep(3000);
    await mark(`pick${round}`);
    await timedClick(`(() => { const cs = [...document.querySelectorAll('button.card:not([disabled])')]; return cs.find((c) => !c.classList.contains('special')) ?? cs[0]; })()`, 'pick' + round);
  } else if (s === 'question') {
    await sleep(3500);
    await mark(`answer${round}`);
    await timedClick(`document.querySelector('[data-cursor^="opt:"]:not([disabled])')`, 'answer' + round);
  } else {
    await sleep(3000);
    await mark(`next${round}`);
    await timedClick(`document.querySelector('button[data-cursor="next"]')`, 'next' + round);
    round++;
  }
}
await sleep(2500);
await mark('end');
if (process.env.TIMELINE === '1') await page.send('Timeline.stop').catch(() => {});
if (process.env.PROFILE === '1') {
  await page.send('ScriptProfiler.stopTracking').catch(() => {});
  // (Its samples come a little after.)
  await sleep(3000);
  writeFileSync(join(out, `${label}.prof.json`), JSON.stringify(prof));
  log(`profile: node scripts/iphone/profile.mjs ${join(out, `${label}.prof.json`)}`);
}
await sleep(800);
const got = await frames.read();
page.close();
if (got.extra) log('extra', JSON.stringify(got.extra));
if (got.ins) for (const x of got.ins) log('inserted', x.mark, x.n, 'js~' + x.sinceRaf, 'style+layout ' + x.styleLayout, 'to frame ' + x.toRaf, 'frame ' + x.afterRaf, '|', x.top);
const rows = phases(got);
printPhases(rows);
writeFileSync(join(out, `${label}.game.json`), JSON.stringify({ label, url, MODE, SETUP, rows, timings, raf: got.raf, marks: got.marks }));
if (records.length) writeFileSync(join(out, `${label}.timeline.json`), JSON.stringify(records));
process.exit(0);
