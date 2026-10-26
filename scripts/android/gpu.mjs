// Whether an emulator's Chrome draws on the PC's GPU, and how it keeps up:
// Chrome's GPU status, the page's WebGL renderer, then the frames of the
// start page (its WebGL backdrop animating) and of a codex scroll. The frame
// rates say whether the emulator is starved (one alone holds 60, two at once
// 50 to 60), never what a phone would get.
//   node scripts/android/gpu.mjs [DevTools port=9333] [url=http://10.0.2.2:4403/]

import { browser, page, sleep } from './cdp.mjs';

const port = process.argv[2] ?? '9333';
const url = process.argv[3] ?? 'http://10.0.2.2:4403/';

const b = await browser(port);
const gpu = (await b.send('SystemInfo.getInfo')).result?.gpu;
const status = gpu?.featureStatus ?? {};
console.log(`${b.version} | ${gpu?.devices?.[0]?.deviceString} | compositing ${status.gpu_compositing} | webgl ${status.webgl2} | vulkan ${status.vulkan}`);
b.close();

const p = await page(port);
await p.send('Page.navigate', { url });
for (let i = 0; i < 60; i++) {
  await sleep(500);
  const ready = await p.ev(`document.readyState === 'complete' && [...document.querySelectorAll('button')].some((b) => /^New game$/.test(b.textContent.trim()))`).catch(() => false);
  if (ready) break;
}
// (The backdrop and the fonts settle in the first seconds.)
await sleep(4000);
const renderer = await p.ev(`(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(!!c); })()`);
console.log(`WebGL renderer: ${renderer}`);

const stats = (t) => {
  const s = [...t].sort((a, b) => a - b);
  const q = (x) => s[Math.min(s.length - 1, Math.floor(x * s.length))].toFixed(1);
  const fps = t.length / (t.reduce((a, b) => a + b, 0) / 1000);
  return `${fps.toFixed(1)} fps, median ${q(0.5)} ms, p95 ${q(0.95)} ms, max ${s.at(-1).toFixed(0)} ms, ${t.filter((x) => x > 25).length} of ${t.length} over 25 ms`;
};
const start = await p.ev(`new Promise((done) => { const t = []; let last = performance.now(); const end = last + 6000; (function f() { requestAnimationFrame((now) => { t.push(now - last); last = now; if (now < end) f(); else done(t); }); })(); })`);
console.log(`start page    ${stats(start)}`);

await p.send('Page.navigate', { url: url.replace(/#.*$/, '') + '#codex' });
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if (await p.ev(`document.scrollingElement.scrollHeight > innerHeight * 3`).catch(() => false)) break;
}
await sleep(3000);
const scroll = await p.ev(`new Promise((done) => { const t = []; let last = performance.now(); const start = last; const H = document.scrollingElement.scrollHeight - innerHeight; (function f() { requestAnimationFrame((now) => { t.push(now - last); last = now; const k = (now - start) / 5000; scrollTo(0, Math.min(H, k * 6000)); if (k < 1) f(); else done(t); }); })(); })`);
console.log(`codex scroll  ${stats(scroll)}`);
await p.send('Page.navigate', { url: 'about:blank' });
p.close();
process.exit(0);
