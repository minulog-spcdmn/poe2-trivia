// The on-brand thumbnail: the game's own question stage, Mageblood burning into view in the arcane circle;
// Delve in Maragsa gold; the dilemma (Headhunter or Mageblood) as the game's own answer buttons.
import { launch, done } from './rig.mjs';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'C:/projects/poe2-trivia/.claude/worktrees/poe2-patch-trailer-d80226';
const b64 = (p) => fs.readFileSync(p).toString('base64');
const font = (fam, file, w = 400) => `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${b64(path.join(ROOT, file))}) format('woff2');font-weight:${w};}`;
const png = (p) => `data:image/png;base64,${b64(path.resolve('..', p))}`;
const CSS = `${font('Maragsa', 'src/assets/fonts/maragsa-display.woff2')}${font('Cinzel', 'node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff2', 600)}
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#0a0908}
.abs{position:absolute}
.gold{background-image:linear-gradient(180deg,#fff6da 8%,#f3d38c 42%,#c08d3c 80%,#8a5f22 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.word{font-family:Maragsa;line-height:.9;filter:drop-shadow(0 0 24px rgba(255,190,100,.45)) drop-shadow(0 5px 6px rgba(0,0,0,.95))}
.tag{font-family:Cinzel;font-weight:600;letter-spacing:.32em;text-transform:uppercase;color:#f1d99b;filter:drop-shadow(0 2px 3px #000)}`;
const html = `
  <div class="abs" style="left:-40px;top:-20px;width:880px;height:760px;background:url(${png('thumb/mb_art.png')}) center/cover;filter:brightness(1.45) contrast(1.15) saturate(1.15)"></div>
  <div class="abs" style="left:-40px;top:-20px;width:880px;height:760px;background:radial-gradient(ellipse 48% 52% at 52% 52%,rgba(255,170,80,.16),rgba(0,0,0,0) 70%);mix-blend-mode:screen"></div>
  <div class="abs" style="inset:0;background:linear-gradient(90deg,rgba(10,9,8,0) 48%,rgba(10,9,8,.9) 66%,#0a0908 74%),radial-gradient(ellipse 70% 80% at 32% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.6))"></div>
  <div class="abs" style="right:52px;top:96px;width:440px;text-align:center">
    <div class="tag" style="font-size:27px;margin-bottom:6px">PoE2.Quest</div>
    <div class="word gold" style="font-size:196px">Delve</div>
    <div class="abs" style="left:20px;right:20px;top:282px;height:1.5px;background:linear-gradient(90deg,transparent,#c9a45c,transparent)"></div>
    <img src="${png('thumb/mb_btn_hh.png')}" style="display:block;width:400px;margin:56px auto 0;filter:drop-shadow(0 6px 10px rgba(0,0,0,.8))">
    <img src="${png('thumb/mb_btn_mb.png')}" style="display:block;width:400px;margin:14px auto 0;filter:drop-shadow(0 6px 10px rgba(0,0,0,.8))">
  </div>`;
const b = await launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
await page.screenshot({ path: '../thumb/thumb_f_2x.png' });
await done();
