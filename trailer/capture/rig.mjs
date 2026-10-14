// Slow-motion capture rig: the page runs K times slower than real time (CSS/WAAPI
// timeline and rAF via CDP, performance.now/Date.now/timers patched to match),
// screenshots are grabbed as fast as possible and stamped in virtual time, so a
// later pass can resample them to a perfectly smooth 60 fps.
import { chromium } from 'file:///C:/projects/poe2-trivia/.claude/worktrees/poe2-patch-trailer-d80226/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'http://localhost:5199';
export const OUT = path.resolve('C:/Users/Minu/AppData/Local/Temp/claude/C--projects-poe2-trivia--claude-worktrees-poe2-patch-trailer-d80226/ef2fa5a8-db5c-4b9c-87a8-623477d0749d/scratchpad/clips');

let browser;
export async function launch() {
  // MAINANIM=1: animations run on the main thread, re-rastered every frame at the scale they're shown at (the
  // compositor's threaded animations keep the raster they started with: a card lifting at 4x came out in blocks)
  const extra = [...(process.env.MAINANIM ? ['--disable-threaded-animation'] : []), ...(process.env.NOLOWRES ? ['--disable-low-res-tiling'] : []), ...(process.env.GPUMEM ? ['--force-gpu-mem-available-mb=' + process.env.GPUMEM, '--force-max-texture-size=16384'] : []), ...(process.env.SWRASTER ? ['--disable-gpu-rasterization'] : [])];
  browser ??= await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...extra] });
  return browser;
}

const initScript = (K, doff = 0) => `(() => {
  let K = ${K};
  const pn = performance.now.bind(performance);
  let r0 = pn(), v0 = r0;
  const vnow = () => v0 + (pn() - r0) / K;
  window.__setK = (k) => { v0 = vnow(); r0 = pn(); K = k; return v0; };
  window.__vnow = vnow;
  window.__vmap = () => ({ r0, v0, K });
  // The page's sound: every connection to the speakers is also tapped, and the mix streamed out
  // in chunks stamped with the virtual time they play at (the sound itself plays at real speed).
  const oc = AudioNode.prototype.connect;
  const taps = new WeakMap();
  const tapFor = (ac) => {
    let t = taps.get(ac); if (t) return t;
    const sp = ac.createScriptProcessor(4096, 2, 2);
    const mute = ac.createGain(); mute.gain.value = 0;
    oc.call(sp, mute); oc.call(mute, ac.destination);
    sp.onaudioprocess = (e) => {
      if (!window.__audioOn || !window.__audioChunk) return;
      const ts = ac.getOutputTimestamp();
      const real = ts.performanceTime + (e.playbackTime - ts.contextTime) * 1000;
      const m = window.__vmap(); const v = m.v0 + (real - m.r0) / m.K;
      const L = e.inputBuffer.getChannelData(0), R = e.inputBuffer.getChannelData(1);
      let peak = 0; for (let i = 0; i < L.length; i += 4) { const a = Math.abs(L[i]) + Math.abs(R[i]); if (a > peak) peak = a; }
      if (peak < 1e-4) { window.__audioChunk(v, real, ac.sampleRate, ''); return; }
      const pcm = new Int16Array(L.length * 2);
      for (let i = 0; i < L.length; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
      const u8 = new Uint8Array(pcm.buffer); let bin = '';
      for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
      window.__audioChunk(v, real, ac.sampleRate, btoa(bin));
    };
    taps.set(ac, sp); return sp;
  };
  // No ambience beds in a capture: looping sources never start (one-shot sounds play as usual).
  const ost = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { if (this.loop && !this.loopEnd) { try { this.disconnect(); } catch (e) {} } return ost.apply(this, a); };
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = oc.call(this, dest, ...rest);
    try { if (dest instanceof AudioDestinationNode) oc.call(this, tapFor(this.context)); } catch (e) {}
    return r;
  };
  performance.now = vnow;
  const origin = performance.timeOrigin;
  const OD = Date;
  const DOFF = ${doff};
  OD.now = () => Math.round(origin + vnow() + DOFF);
  globalThis.Date = new Proxy(OD, { construct(t, a) { return a.length ? new t(...a) : new t(OD.now()); } });
  const st = setTimeout, si = setInterval;
  globalThis.setTimeout = (f, d = 0, ...a) => st(f, (d || 0) * K, ...a);
  globalThis.setInterval = (f, d = 0, ...a) => si(f, (d || 0) * K, ...a);
  // The trailer hides dev chrome.
  const css = document.createElement('style');
  css.textContent = 'html.clean .shell, html.clean .toasts, html.clean .pages-wait, html.clean .layer-fg { opacity: 0 !important; transition: none !important; } html.clean #__cur { display: none !important; } html.bgpass .shell, html.bgpass .toasts, html.bgpass .pages-wait, html.bgpass .layer-fg, html.bgpass canvas.fx { opacity: 0 !important; transition: none !important; } html.bgpass #__cur { display: none !important; } html.nocard .zc { display: none !important; } html.titlecard .zc .subtitle, html.titlecard .zc .news { display: none !important; } html { scrollbar-width: none !important; } ::-webkit-scrollbar { display: none !important; } small.beta, span.beta, .channel, #lab, .fab { display: none !important; } #app { margin-right: 0 !important; } .toasts { right: 22px !important; }';
  const add = () => document.head ? document.head.appendChild(css) : requestAnimationFrame(add);
  add();
  // An overlay of the cursor the page would show (its own engraved dart, lit over clickables).
  addEventListener('DOMContentLoaded', () => {
    const img = document.createElement('img');
    img.id = '__cur';
    img.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;display:none;will-change:transform';
    document.documentElement.appendChild(img);
    let last = '';
    addEventListener('pointermove', (e) => {
      if (window.__hideCursor) { img.style.display = 'none'; return; }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const c = el ? getComputedStyle(el).cursor : '';
      const urls = [...c.matchAll(/url\\("?([^")]+)"?\\)\\s*(\\d)(?:x|dppx)/g)];
      const hs = c.match(/\\)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s*,[^,]*$/);
      if (urls.length) {
        const u = urls[urls.length - 1]; const sc = +u[2];
        if (u[1] !== last) { img.src = u[1]; last = u[1]; img.onload = () => { img.style.width = (img.naturalWidth / sc * 1.35) + 'px'; }; }
        const hx = +(hs?.[1] || 0) * 1.35, hy = +(hs?.[2] || 0) * 1.35;
        img.style.display = 'block';
        img.style.transform = 'translate(' + (e.clientX - hx) + 'px,' + (e.clientY - hy) + 'px)';
      } else img.style.display = 'none';
    }, true);
  });
})();`;

export async function openPage({ K = 8, w = 1280, h = 720, dsf = 1.5, url, webgl = true, storage, startSlow = false, dateAt = null } = {}) {
  const b = await launch();
  // ZOOM=2: the same layout drawn at twice the CSS size (CSS zoom on a viewport twice as big, half the
  // device scale): Chrome draws a lifted or animated layer at no more than about twice the device scale,
  // so at 4x those came out in blocks; this way every layer is drawn at full detail.
  const Z = +(process.env.ZOOM || 1);
  if (Z !== 1) { w *= Z; h *= Z; dsf /= Z; }
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  if (Z !== 1) await ctx.addInitScript((z) => {
    const set = () => { if (document.documentElement) document.documentElement.style.zoom = String(z); };
    set(); addEventListener('DOMContentLoaded', set);
  }, Z);
  if (!webgl) await ctx.addInitScript(() => { delete window.WebGL2RenderingContext; delete window.WebGLRenderingContext; });
  if (storage) await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  // FULLFX=1: the effects layer at every device pixel (the app caps it at 1.5 a CSS px and 2560 x 1440 in
  // all, which a 4x capture shows as blocks). Rewritten as the dev server sends it; the app is untouched.
  // FLAT2D=1: a card lying face up keeps a 2D transform (no perspective, no rotateY), which Chrome rasters at
  // full scale; with them it rasters the card coarsely (blocks at a 4x capture). Rewritten as served.
  if (process.env.FLAT2D) await ctx.route('**/src/components/ChooseCategory.svelte*', async (route) => {
    const r = await route.fetch(); let body = await r.text();
    if (!/type=style/.test(route.request().url())) {
      body = body.replace('`transform:perspective(1200px) translateY(${y.toFixed(2)}px) rotate(${((1 - d) * rot).toFixed(2)}deg) rotate${axis}(${(180 * (1 - f)).toFixed(2)}deg) scale(${(1 + 0.05 * lift).toFixed(4)})`',
        "(f >= 0.999 ? `transform:translateY(${y.toFixed(2)}px) rotate(${((1 - d) * rot).toFixed(2)}deg) scale(${(1 + 0.05 * lift).toFixed(4)})` : `transform:perspective(1200px) translateY(${y.toFixed(2)}px) rotate(${((1 - d) * rot).toFixed(2)}deg) rotate${axis}(${(180 * (1 - f)).toFixed(2)}deg) scale(${(1 + 0.05 * lift).toFixed(4)})`)");
    }
    await route.fulfill({ response: r, body });
  });
  // FUMEFIX=1: the fume zones' fog masked by its radial fade alone. The app adds the dither tile to that mask
  // (mask-composite: add), which lifts its alpha everywhere in the fog's box, so the box shows, edge and all.
  if (process.env.FUMEFIX) await ctx.route('**/src/components/zonecard/fume.ts*', async (route) => {
    const r = await route.fetch(); let body = await r.text();
    body = body.replace("transparent),var(--dither)", "transparent)").replace("mask-size:100% 100%,auto;mask-repeat:no-repeat,repeat;mask-composite:add;image-rendering:pixelated", "mask-size:100% 100%;mask-repeat:no-repeat");
    if (body.includes('var(--dither)')) console.log('FUMEFIX: no match');
    await route.fulfill({ response: r, body });
  });
  if (process.env.FULLFX) await ctx.route('**/src/lib/fx/core.ts*', async (route) => {
    const r = await route.fetch(); let body = await r.text();
    body = body.replace(/quality === 0 \? 1\.5 :/, 'quality === 0 ? 8 :').replace(/MAX_PIXELS = 2560 \* 1440/, 'MAX_PIXELS = 8192 * 8192');
    await route.fulfill({ response: r, body });
  });
  await ctx.addInitScript(initScript(startSlow ? K : 1, dateAt ? dateAt - Date.now() : 0));
  // The server's clock check (a HEAD on the site) would correct a moved date: not answered.
  if (dateAt) await ctx.route((u) => true, (r) => (r.request().method() === 'HEAD' ? r.abort() : r.fallback()));
  const page = await ctx.newPage();
  if (Z !== 1) {     // the shots' coordinates (bounding boxes, in the zoomed page's own px) onto the viewport
    for (const k of ['move', 'click', 'dblclick']) { const f = page.mouse[k].bind(page.mouse); page.mouse[k] = (x, y, o) => f(x * Z, y * Z, o); }
  }
  const audio = { chunks: null };
  await ctx.exposeFunction('__audioChunk', (v, real, sr, b64) => { if (audio.chunks) audio.chunks.push([v, real, sr, b64]); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Animation.enable');
  if (startSlow) await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / K });
  const S = new Stage(page, startSlow ? K : 1, w, h);
  S.cdp = cdp; S.targetK = K; S.audio = audio;
  if (url) await page.goto(BASE + url);
  return S;
}

export class Stage {
  constructor(page, K, w, h) { Object.assign(this, { page, K, w, h, mx: w / 2, my: h + 40 }); }
  /** Switch the page's slowdown (JS clock and CSS timeline together). */
  async slow(k = this.targetK) {
    await this.page.evaluate((k) => window.__setK(k), k);
    await this.cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / k });
    this.K = k;
    this.kLog?.push([performance.now(), k]);
  }
  /** Wait `ms` of the page's (virtual) time. */
  wait(ms) { return new Promise((r) => setTimeout(r, ms * this.K)); }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  async lab(name, ...args) { return this.page.evaluate(([n, a]) => { const r = window.__lab[n](...a); return r && r.then ? r.then(() => 1) : 1; }, [name, args]); }
  /** Move the mouse along an eased curve over `ms` virtual ms. */
  async move(x, y, ms = 600, curve = 0.15) {
    const x0 = this.mx, y0 = this.my;
    const dx = x - x0, dy = y - y0;
    const nx = -dy * curve, ny = dx * curve;
    const t0 = Date.now(), T = ms * this.K;
    for (;;) {
      const u = Math.min(1, (Date.now() - t0) / T);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const arc = Math.sin(Math.PI * e);
      this.mx = x0 + dx * e + nx * arc; this.my = y0 + dy * e + ny * arc;
      await this.page.mouse.move(this.mx, this.my);
      if (u >= 1) break;
      await new Promise((r) => setTimeout(r, 12));
    }
  }
  async moveTo(sel, ms = 600, ox = 0.5, oy = 0.5) {
    const bb = await this.page.locator(sel).first().boundingBox();
    if (!bb) throw new Error('no box for ' + sel);
    await this.move(bb.x + bb.width * ox, bb.y + bb.height * oy, ms);
  }
  async click(ms = 120) { await this.page.mouse.down(); await this.wait(ms); await this.page.mouse.up(); }
  async clickOn(sel, ms = 600, ox = 0.5, oy = 0.5) { await this.moveTo(sel, ms, ox, oy); await this.wait(120); await this.click(); }

  /** Record frames into clips/<name>/ until stop(). */
  record(name, { quality = 92 } = {}) {
    name += process.env.SUFFIX || '';
    const dir = path.join(OUT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    // Layers (LAYERS=1): after each frame, the same moment with the UI hidden (html.clean), into <name>_bg,
    // so the compositor can move the UI and the backdrop behind it apart (parallax).
    const layers = !!process.env.LAYERS, bgDir = dir + '_bg', bgStamps = [];
    if (layers) { fs.rmSync(bgDir, { recursive: true, force: true }); fs.mkdirSync(bgDir, { recursive: true }); }
    const stamps = [];
    let on = true, n = 0;
    const t0 = performance.now();
    // Virtual time since t0, across any change of K while recording (slow(k) logs each).
    const kLog = this.kLog = [[t0, this.K]];
    const vt = (x) => { let v = 0; for (let i = 0; i < kLog.length; i++) { const r = kLog[i][0], e = i + 1 < kLog.length ? kLog[i + 1][0] : Infinity; if (x <= r) break; v += (Math.min(x, e) - r) / kLog[i][1]; } return v; };
    // Sound: chunks from now on, stamped against the page's virtual time at this moment.
    const audio = this.audio; if (audio) audio.chunks = [];
    const vStart = this.page.evaluate(() => { window.__audioOn = true; return window.__vnow(); }).catch(() => null);
    const loop = (async () => {
      while (on) {
        const a = performance.now();
        let buf;
        try { buf = await this.page.screenshot({ type: 'jpeg', quality, animations: 'allow', caret: 'initial', scale: 'device' }); } catch (e) { console.log('shot fail', e.message); break; }
        const b = performance.now();
        const f = `${String(n++).padStart(5, '0')}.jpg`;
        fs.writeFileSync(path.join(dir, f), buf);
        stamps.push([f, vt((a + b) / 2)]);
        if (layers) {
          try {
            await this.page.evaluate(() => document.documentElement.classList.add('bgpass'));
            const c = performance.now();
            const bb = await this.page.screenshot({ type: 'jpeg', quality, animations: 'allow', caret: 'initial', scale: 'device' });
            const d = performance.now();
            await this.page.evaluate(() => document.documentElement.classList.remove('bgpass'));
            fs.writeFileSync(path.join(bgDir, f), bb); bgStamps.push([f, vt((c + d) / 2)]);
          } catch (e) { console.log('bg shot fail', e.message); break; }
        }
      }
    })();
    const marks = [];
    return {
      mark: (label) => marks.push([label, vt(performance.now())]),
      stop: async () => {
        on = false; await loop; this.kLog = null;
        await this.page.evaluate(() => { window.__audioOn = false; }).catch(() => {});
        if (audio && audio.chunks) {
          const v0 = await vStart; const ch = audio.chunks; audio.chunks = null;
          const meta = []; const bufs = []; let off = 0;
          for (const [v, real, sr, b64] of ch) {
            const b = b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
            meta.push([v - v0, real, sr, off, b.length]); bufs.push(b); off += b.length;
          }
          fs.writeFileSync(path.join(dir, 'audio.pcm'), Buffer.concat(bufs));
          fs.writeFileSync(path.join(dir, 'audio.json'), JSON.stringify({ chunks: meta }));
        }
        fs.writeFileSync(path.join(dir, 'stamps.json'), JSON.stringify({ K: this.K, stamps, marks }));
        if (layers) fs.writeFileSync(path.join(bgDir, 'stamps.json'), JSON.stringify({ K: this.K, stamps: bgStamps, marks }));
        const dur = stamps.at(-1)?.[1] ?? 0;
        console.log(`${name}: ${n} frames over ${(dur / 1000).toFixed(2)} s virtual (${(n / (dur / 1000)).toFixed(0)} fps virtual)`);
      },
    };
  }
  async close() { await this.page.context().close(); }
}

export async function done() { await browser?.close(); }
