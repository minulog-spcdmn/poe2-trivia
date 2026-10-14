// YouTube thumbnails (1280x720, drawn at 2x and saved as JPEG), in the app's fonts.
import { launch, done } from './rig.mjs';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'C:/projects/poe2-trivia/.claude/worktrees/poe2-patch-trailer-d80226';
const b64 = (p) => fs.readFileSync(p).toString('base64');
const font = (fam, file, w = 400) => `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${b64(path.join(ROOT, file))}) format('woff2');font-weight:${w};}`;
const img = (p) => `data:image/jpeg;base64,${b64(path.resolve('..', p))}`;
const CSS = `${font('Maragsa', 'src/assets/fonts/maragsa-display.woff2')}${font('Cinzel', 'node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff2', 600)}
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#0a0908}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.gold{background-image:linear-gradient(180deg,#fff4d2 10%,#f0cf86 45%,#b8873a 85%);-webkit-background-clip:text;background-clip:text;color:transparent}
.t{font-family:Maragsa;line-height:1;filter:drop-shadow(0 0 30px rgba(255,190,100,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.9))}
.k{font-family:Cinzel;font-weight:600;letter-spacing:.32em;color:#f1d99b;text-transform:uppercase;filter:drop-shadow(0 2px 4px rgba(0,0,0,.95))}`;
const PAGES = {
  // A: the title card itself, closer, lifted, a warm light behind the word
  thumb_a: `<div class="bg" style="background-image:url(${img('thumb/src_title.jpg')});background-size:155%;background-position:50% 47%;filter:brightness(1.35) contrast(1.12) saturate(1.15)"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 42% 30% at 50% 56%,rgba(255,170,70,.28),rgba(255,170,70,0) 70%);mix-blend-mode:screen"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 75% 75% at 50% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55))"></div>`,
  // B: depth 103, Alva's streak in white fire above; Delve on clean dark below
  thumb_b: `<div class="bg" style="background-image:url(${img('thumb/src_streak.jpg')});background-size:200%;background-position:50% 4%;filter:brightness(.95) saturate(1.15)"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(0deg,#070605 0%,#070605 33%,rgba(7,6,5,.6) 42%,rgba(7,6,5,0) 50%)"></div>
    <div style="position:absolute;left:0;right:0;bottom:30px;text-align:center">
      <div class="k" style="font-size:30px;margin-bottom:2px">PoE2.Quest</div>
      <div class="t gold" style="font-size:220px">Delve</div></div>`,
};
const b = await launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
for (const [name, html] of Object.entries(PAGES)) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
  await page.screenshot({ path: `../thumb/${name}_2x.png` });
}
await done();
