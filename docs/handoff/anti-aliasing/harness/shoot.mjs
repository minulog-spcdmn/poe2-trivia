// (Run from the repo root, against a running dev server.)
// Steps a turning rune circle frame by frame (1/60 s apart) and saves each
// frame at the device's pixels, per screen size and per variant, so the
// flicker can be measured offline (measure.py).
// node shoot.mjs <base> <outDir> <sizes,comma> <variants,comma> [frames] [circle]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');

const [base, outDir, sizesArg, variantsArg, framesArg = '48', circle = 'eye'] = process.argv.slice(2);
const FRAMES = Number(framesArg);
const SIZES = {
  phone: { w: 390, h: 844, dpr: 3, touch: true },
  laptop: { w: 1440, h: 725, dpr: 2 },
  desktop: { w: 1440, h: 900, dpr: 1 },
  fhd: { w: 1920, h: 970, dpr: 1 },
  qhd: { w: 2560, h: 1310, dpr: 1 },
  uhd150: { w: 2560, h: 1440, dpr: 1.5 },
  uhd: { w: 3840, h: 2160, dpr: 1 },
};
const QA_SIZE = { phone: 'phone390', laptop: 'laptop', desktop: 'desktop', fhd: 'fhd', qhd: 'qhd', uhd150: 'uhd150', uhd: 'uhd' };
// Variant: extra CSS before the app loads, and the device scale multiplier (ref draws at 4x).
const VARIANTS = {
  now: { css: '' },
  nosettle: { css: '.summon{animation:none!important}' },
  repaint: { css: '.summon .layer{will-change:auto!important}' },
  nohatch: { css: '.summon .hatch{visibility:hidden!important}' },
  wide: { css: '.arcane path,.arcane circle{stroke-width:1!important;stroke-opacity:.5}.arcane .thin{stroke-width:.7!important}.arcane .hair{stroke-width:.44!important}.arcane .sign{stroke-width:.84!important}.arcane .hatch{stroke-width:.4!important}' },
  gamma: { css: '.summon .layer > svg:not(.glow){filter:url(#aag)}', defs: true },
  ss: { css: '', inject: 'ss.js' },
  ref: { css: '.summon .layer{will-change:auto!important}', k: 4 },
  repaint: { css: '.summon .layer{will-change:auto!important}', repaint: true },
};

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const jobs = sizesArg.split(',').flatMap((s) => variantsArg.split(',').map((v) => [s, v]));
  let next = 0;
  const work = async () => {
    while (next < jobs.length) {
      const [s, v] = jobs[next++];
      const size = SIZES[s];
      const variant = VARIANTS[v];
      const dpr = size.dpr * (variant.k ?? 1);
      const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: dpr, isMobile: !!size.touch, hasTouch: !!size.touch, reducedMotion: 'no-preference' });
      await ctx.addInitScript(([css, defs]) => {
        delete window.WebGL2RenderingContext;
        delete window.WebGLRenderingContext;
        if (css) document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.append(st); });
        if (defs) document.addEventListener('DOMContentLoaded', () => {
          const d = document.createElement('div');
          d.innerHTML = '<svg width="0" height="0" style="position:absolute"><filter id="aag" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="gamma" exponent="0.69"/></feComponentTransfer></filter></svg>';
          document.body.append(d.firstChild);
        });
      }, [variant.css, !!variant.defs]);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error('pageerror', e.message));
      const q = new URLSearchParams({ frame: 'p0', b: 'circle', size: QA_SIZE[s], 'k.side': 'whole', 'k.circle': circle });
      await page.goto(`${base}qa.html?${q}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__qa, null, { timeout: 120000 });
      await page.waitForSelector('.summon', { timeout: 60000 });
      // Let the summoning finish and the circle settle (its turning keeps on).
      await page.waitForTimeout(7000);
      if (variant.repaint) await page.evaluate(() => { window.__repaint = true; });
      if (variant.inject) console.log('ss layers', await page.evaluate(`(${fs.readFileSync(new URL('./' + variant.inject, import.meta.url), 'utf8')})(${dpr})`));
      const box = await page.evaluate(() => {
        const r = document.querySelector('.summon').getBoundingClientRect();
        for (const a of document.getAnimations()) a.pause();
        if (window.__repaint) {
          // Nothing left on the compositor: each animation's value set inline, the turns by script each frame.
          window.__turns = [];
          for (const a of document.getAnimations()) {
            const el = a.effect?.target;
            if (!el) continue;
            if (/(^|-)turn$/.test(a.animationName ?? '')) {
              const t = a.effect.getComputedTiming();
              window.__turns.push({ el, dur: Number(t.duration), rev: t.direction === 'reverse', t0: Number(a.currentTime ?? 0) });
              a.cancel();
              continue;
            }
            const props = new Set(a.effect.getKeyframes().flatMap((f) => Object.keys(f)).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)));
            const cs = getComputedStyle(el);
            const vals = [...props].map((p) => [p, cs[p]]);
            a.cancel();
            for (const [p, v] of vals) el.style[p] = v;
          }
        }
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      const dir = path.join(outDir, `${circle}-${s}-${v}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ size: s, variant: v, dpr, box }));
      for (let k = 0; k < FRAMES; k++) {
        await page.evaluate((k) => {
          for (const t of window.__turns ?? []) {
            const ms = t.t0 + (k * 1000) / 60;
            const f = (ms / t.dur) % 1;
            t.el.style.rotate = `${(360 * (t.rev ? 1 - f : f)).toFixed(4)}deg`;
          }
          for (const a of document.getAnimations()) {
            if (!/(^|-)turn$/.test(a.animationName ?? '')) continue;
            a.__t0 ??= Number(a.currentTime ?? 0);
            a.currentTime = a.__t0 + (k * 1000) / 60;
          }
          return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        }, k);
        await page.screenshot({ path: path.join(dir, `${String(k).padStart(3, '0')}.png`), clip: box, scale: 'device', animations: 'allow' });
      }
      console.log('done', s, v, dpr, JSON.stringify(box), 'turns by script', await page.evaluate(() => (window.__turns ?? []).length), 'anims left', await page.evaluate(() => document.getAnimations().length), await page.evaluate(() => document.getAnimations().filter((a) => /(^|-)turn$/.test(a.animationName ?? '')).length));
      await ctx.close();
    }
  };
  await Promise.all(Array.from({ length: Number(process.env.JOBS ?? 10) }, work));
} finally {
  await browser.close();
}
