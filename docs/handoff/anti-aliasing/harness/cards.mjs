// (Run from the repo root, against a running dev server.)
// node cards.mjs <base> <outDir> <jobs: size:variant:mode,...> [frames]
// mode: rest, tilt (a slow pointer's tilt), enter (the hover's start), flip.
// Variants in cards.json (k: density multiplier, the ideal at 4).
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
const SIZES = {
  fhd: { w: 1920, h: 970, dpr: 1 },
  laptop: { w: 1440, h: 725, dpr: 2 },
  qhd: { w: 2560, h: 1310, dpr: 1 },
  phone: { w: 390, h: 844, dpr: 3, touch: true },
};
const VARIANTS = JSON.parse(fs.readFileSync(new URL('./cards.json', import.meta.url), 'utf8'));
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
    for (let k = 0; k < FRAMES; k++) {
      await page.evaluate(([k, mode]) => {
        const card = document.querySelectorAll('.choose .cards > .card')[1];
        if (mode === 'enter') {
          for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.currentTime = (k * 1000) / 60;
        } else if (mode === 'tilt') {
          const f = card.querySelector('.frame');
          f.style.setProperty('--rx', `${(3 + k * 0.06).toFixed(3)}deg`);
          f.style.setProperty('--ry', `${(5 + k * 0.08).toFixed(3)}deg`);
        } else {
          card.classList.remove('down'); for (const a of card.querySelector('.turn').getAnimations()) if (a.id === 'bench-turn') a.currentTime = 150 + (k * 1000) / 60 / 4;
        }
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, [k, mode]);
      await page.screenshot({ path: path.join(dir, `${String(k).padStart(3, '0')}.png`), clip: box, scale: 'device', animations: 'allow' });
    }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ s, v, mode, dpr, k: variant.k ?? 1 }));
    console.log('done', job, await page.evaluate(() => [...document.querySelectorAll('.choose .glyph')].map((g) => g.style.getPropertyValue('--fine') ? 'fine' : 'base').join(',')));
    await ctx.close();
  }));
} finally {
  await browser.close();
}
