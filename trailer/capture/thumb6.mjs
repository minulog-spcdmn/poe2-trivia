// The silhouette thumbnail, v3: Mageblood veiled black, backlit by azurite blue, over the site's own azurite-vein shader (captured at 4x); the site's own wordmark
// (Maragsa Title, the start page's gold and shadows); Delve; a question mark.
import { launch, done } from './rig.mjs';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'C:/projects/poe2-trivia/.claude/worktrees/poe2-patch-trailer-d80226';
const b64 = (p) => fs.readFileSync(p).toString('base64');
const MAR = b64(path.join(ROOT, 'src/assets/fonts/maragsa-display.woff2'));
const CIN = b64(path.join(ROOT, 'node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff2'));
const CIN7 = b64(path.join(ROOT, 'node_modules/@fontsource/cinzel/files/cinzel-latin-700-normal.woff2'));
const jpg = (p) => `data:image/jpeg;base64,${b64(path.resolve('..', p))}`;
const MB = `data:image/avif;base64,${b64(path.join(ROOT, 'public/items/addddbd50fac.avif'))}`;
const CSS = `@font-face{font-family:'Maragsa Title';src:url(data:font/woff2;base64,${MAR}) format('woff2');font-weight:100 900}
@font-face{font-family:'Cinzel';src:url(data:font/woff2;base64,${CIN}) format('woff2');font-weight:600}@font-face{font-family:'Cinzel';src:url(data:font/woff2;base64,${CIN7}) format('woff2');font-weight:700}
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#05070d}
.abs{position:absolute}
/* the start page's title (GameTitle.svelte): its gold and its shadows */
.title{font-family:'Maragsa Title';font-weight:900;letter-spacing:.02em;line-height:1;padding-bottom:.3em;margin-bottom:-.3em;
  background-image:linear-gradient(180deg,#fff1c9 .1em,#d7b068 .5em,#8b6526 .95em);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 4px 18px rgba(0,0,0,.9)) drop-shadow(0 0 34px rgba(224,170,90,.36))}
.meta{font-family:Cinzel;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:#d6e8ff;filter:drop-shadow(0 2px 3px #000) drop-shadow(0 0 12px rgba(90,150,255,.55))}`;
const html = `
  <div class="abs" style="inset:0;background:url(${jpg('thumb/src_vein_bg.jpg')}) center/cover;filter:brightness(1.25) saturate(1.15);transform:none"></div>
  <div class="abs" style="inset:0;background:radial-gradient(circle at 31% 50%,rgba(235,245,255,.95) 0,rgba(150,200,255,.75) 4%,rgba(70,140,255,.45) 12%,rgba(40,90,220,.18) 26%,rgba(10,30,120,0) 42%)"></div>
  <div class="abs" style="left:0;right:45%;top:calc(50% - 1px);height:3px;background:linear-gradient(90deg,rgba(150,200,255,0),rgba(215,235,255,.9) 52%,rgba(150,200,255,0));filter:blur(1.5px)"></div>
  <img class="abs" src="${MB}" style="left:34px;top:205px;width:690px;filter:brightness(0) drop-shadow(0 0 2px #e6f2ff) drop-shadow(0 0 10px rgba(140,195,255,.95)) drop-shadow(0 0 40px rgba(60,130,255,.6))">
  <div class="abs title" style="left:292px;top:96px;font-family:Cinzel;font-weight:700;font-size:410px">?</div>
  <div class="abs" style="inset:0;background:radial-gradient(ellipse 85% 85% at 45% 50%,rgba(0,0,0,0) 60%,rgba(5,2,6,.7))"></div>
  <div class="abs" style="right:58px;top:150px;text-align:center">
    <div class="title" style="font-size:66px">PoE2.Quest</div>
    <div class="title" style="font-size:200px;margin-top:10px">Delve</div>
    <div class="meta" style="font-size:34px;margin-top:24px;margin-left:.34em;color:#f1d99b;filter:drop-shadow(0 2px 3px #000) drop-shadow(0 0 12px rgba(240,190,110,.35))">Out now</div></div>`;
const b = await launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
await page.screenshot({ path: '../thumb/thumb_i_2x.png' });
await done();
