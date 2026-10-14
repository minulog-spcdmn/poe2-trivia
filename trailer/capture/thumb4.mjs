// The silhouette thumbnail, v2: Mageblood veiled black, backlit by a flare's pink light; the site's own wordmark
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
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#0b0610}
.abs{position:absolute}
/* the start page's title (GameTitle.svelte): its gold and its shadows */
.title{font-family:'Maragsa Title';font-weight:900;letter-spacing:.02em;line-height:1;padding-bottom:.3em;margin-bottom:-.3em;
  background-image:linear-gradient(180deg,#fff1c9 .1em,#d7b068 .5em,#8b6526 .95em);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 4px 18px rgba(0,0,0,.9)) drop-shadow(0 0 34px rgba(224,170,90,.36))}
.meta{font-family:Cinzel;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:#ffd6ea;filter:drop-shadow(0 2px 3px #000) drop-shadow(0 0 12px rgba(255,90,170,.55))}`;
const html = `
  <div class="abs" style="inset:0;background:url(${jpg('thumb/src_magenta.jpg')}) center/cover;filter:blur(26px) brightness(.42) saturate(1.6);transform:scale(1.18)"></div>
  <div class="abs" style="inset:0;background:radial-gradient(circle at 31% 50%,#fff 0,#ffd2ea 2.5%,#ff7cc0 7%,rgba(255,60,160,.75) 16%,rgba(200,30,130,.35) 32%,rgba(120,10,90,0) 55%)"></div>
  <div class="abs" style="left:0;right:45%;top:calc(50% - 1px);height:3px;background:linear-gradient(90deg,rgba(255,150,210,0),rgba(255,210,235,.9) 52%,rgba(255,150,210,0));filter:blur(1.5px)"></div>
  <img class="abs" src="${MB}" style="left:34px;top:205px;width:690px;filter:brightness(0) drop-shadow(0 0 2px #ffe6f3) drop-shadow(0 0 10px rgba(255,140,205,.95)) drop-shadow(0 0 40px rgba(255,60,160,.6))">
  <div class="abs title" style="left:292px;top:96px;font-family:Cinzel;font-weight:700;font-size:410px">?</div>
  <div class="abs" style="inset:0;background:radial-gradient(ellipse 85% 85% at 45% 50%,rgba(0,0,0,0) 60%,rgba(5,2,6,.7))"></div>
  <div class="abs" style="right:58px;top:150px;text-align:center">
    <div class="title" style="font-size:66px">PoE2.Quest</div>
    <div class="title" style="font-size:200px;margin-top:10px">Delve</div>
    <div class="meta" style="font-size:30px;margin-top:26px">Name it or fall</div></div>`;
const b = await launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
await page.screenshot({ path: '../thumb/thumb_g_2x.png' });
await done();
