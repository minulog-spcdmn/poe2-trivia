// node motion.mjs <base> <outDir> <jobs: size:variant:mode,...> [frames]   (GLARE=1 STEP=2 for the runs in the README)
// Steps a card's hover tilt (--rx/--ry a little each frame, as a slow pointer
// moves it) or its turn over (1/60 s a frame), saving each frame at device
// pixels, clipped to the card. Everything else is paused.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = req('playwright-core');
const [base, outDir, jobsArg, framesArg = '32'] = process.argv.slice(2);
const FRAMES = Number(framesArg);
const STEP = Number(process.env.STEP ?? 1);
const GLARE = process.env.GLARE === '1';
const SIZES = {
  fhd: { w: 1920, h: 970, dpr: 1 },
  uhd150: { w: 2560, h: 1440, dpr: 1.5 },
  uhd: { w: 3840, h: 2160, dpr: 1 },
  laptop: { w: 1440, h: 725, dpr: 2 },
  qhd: { w: 2560, h: 1310, dpr: 1 },
  phone: { w: 390, h: 844, dpr: 3, touch: true },
};
const VARIANTS = JSON.parse(fs.readFileSync(new URL('./motion.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  await Promise.all(jobsArg.split(',').map(async (job) => {
    const [s, v, mode] = job.split(':');
    const size = SIZES[s];
    const variant = VARIANTS[v];
    const dpr = size.dpr * (variant.k ?? 1);
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
    await ctx.addInitScript((css) => {
      delete window.WebGL2RenderingContext;
      delete window.WebGLRenderingContext;
      document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.append(st); });
    }, (variant.css ?? '') + '.choose .card .frame{transition:none!important}');
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.goto(`${base}cards.html?stage`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__cb?.ready, null, { timeout: 120000 });
    await page.evaluate(() => window.__cb.deal(window.__cb.items.slice(0, 3).map((i) => ({ category: i.value, kind: null }))));
    await page.waitForFunction(() => { const c = document.querySelectorAll('.choose .cards > .card'); return c.length === 3 && ![...c].some((x) => x.classList.contains('down')); }, null, { timeout: 60000 });
    await page.waitForTimeout(3000);
    if (variant.affine) await page.evaluate(() => { window.__affine = true; });
    if (variant.inject) console.log('inject', v, await page.evaluate(`(${fs.readFileSync(new URL('./' + variant.inject, import.meta.url), 'utf8')})()`));
    const box = await page.evaluate(() => { const r = document.querySelectorAll('.choose .cards > .card')[1].getBoundingClientRect(); return { x: Math.floor(r.x - 20), y: Math.floor(r.y - 30), width: Math.ceil(r.width + 40), height: Math.ceil(r.height + 60) }; });
    const dir = path.join(outDir, `${s}-${v}-${mode}`);
    fs.mkdirSync(dir, { recursive: true });
    if (mode === 'enter') {
      await page.evaluate(() => document.querySelectorAll('.choose .cards > .card')[1].querySelector('.frame').style.setProperty('transition', 'transform .35s var(--ease-out)', 'important'));
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35);
      await page.waitForTimeout(16);
    } else if (mode === 'tilt') {
      // Hover the card (its class and glow as in a game), then hold the pointer's tilt by hand.
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35);
      await page.waitForTimeout(1500);
    } else if (mode === 'rest') {
    } else {
      await page.evaluate(() => window.__cb.flip(1));
      await page.waitForTimeout(20);
    }
    await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
    const corners = [];
    for (let k = 0; k < FRAMES; k++) {
      await page.evaluate(([k, mode, STEP, GLARE]) => {
        const card = document.querySelectorAll('.choose .cards > .card')[1];
        if (mode === 'enter') {
          for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.currentTime = (k * 1000) / 60;
        } else if (mode === 'tilt') {
          const f = card.querySelector('.frame');
          f.style.setProperty('--tilt-x', `${(3 + k * 0.04 * STEP).toFixed(3)}deg`);
          f.style.setProperty('--tilt-y', `${(5 + k * 0.05 * STEP).toFixed(3)}deg`);
          if (GLARE) { const rx = 3 + k * 0.04 * STEP, ry = 5 + k * 0.05 * STEP; f.querySelector('.glare').style.setProperty('--gx', `${((0.5 + ry / 24) * 100).toFixed(1)}%`); f.querySelector('.glare').style.setProperty('--gy', `${((0.5 - rx / 20) * 100).toFixed(1)}%`); }
          if (window.__affine) {
            // The 3D tilt's closest 2D transform: its corners projected, an affine fit to them (about the centre).
            const m = new DOMMatrix(`perspective(900px) rotateX(${(3 + k * 0.04).toFixed(3)}deg) rotateY(${(5 + k * 0.05).toFixed(3)}deg) translateY(-10px) scale(1.04)`);
            const w = f.offsetWidth / 2, h = f.offsetHeight / 2;
            const src = [[-w, -h], [w, -h], [w, h], [-w, h]];
            const dst = src.map(([x, y]) => { const p = m.transformPoint(new DOMPoint(x, y, 0, 1)); return [p.x / p.w, p.y / p.w]; });
            // Least squares: dst = A * [x, y, 1].
            const fit = (j) => { let sxx = 0, syy = 0, sx = 0, sy = 0, sxy = 0, n = 4, bx = 0, by = 0, b1 = 0; for (let i = 0; i < 4; i++) { const [x, y] = src[i], d = dst[i][j]; sxx += x * x; syy += y * y; sxy += x * y; sx += x; sy += y; bx += x * d; by += y * d; b1 += d; } /* symmetric corners: sx = sy = sxy = 0 */ return [bx / sxx, by / syy, b1 / n]; };
            const [a, c, e] = fit(0), [b, d, g] = fit(1);
            f.style.setProperty('--aff', `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${g})`);
          }
        } else {
          card.classList.remove('down'); for (const a of card.querySelector('.turn').getAnimations()) if (a.id === 'bench-turn') a.currentTime = 150 + (k * 1000) / 60 / 4;
        }
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, [k, mode, STEP, GLARE]);
      corners.push(await page.evaluate(() => {
        const f = document.querySelectorAll('.choose .cards > .card')[1].querySelector('.frame');
        let ps = f.querySelectorAll(':scope > i.aa-probe');
        if (!ps.length) {
          for (const at of ['left:0;top:0', 'right:0;top:0', 'right:0;bottom:0', 'left:0;bottom:0']) { const i = document.createElement('i'); i.className = 'aa-probe'; i.style.cssText = `position:absolute;${at};width:0;height:0`; f.append(i); }
          ps = f.querySelectorAll(':scope > i.aa-probe');
        }
        return { w: f.clientWidth, h: f.clientHeight, q: [...ps].map((p) => { const r = p.getBoundingClientRect(); return [r.left, r.top]; }) };
      }));
      await page.screenshot({ path: path.join(dir, `${String(k).padStart(3, '0')}.png`), clip: box, scale: 'device', animations: 'allow' });
    }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ s, v, mode, dpr, k: variant.k ?? 1, box, corners }));
    console.log('done', job, await page.evaluate(() => [...document.querySelectorAll('.choose .glyph')].map((g) => g.style.getPropertyValue('--fine') ? 'fine' : 'base').join(',')));
    await ctx.close();
  }));
} finally {
  await browser.close();
}
