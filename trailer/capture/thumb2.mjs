// Three more YouTube thumbnails (1280x720, drawn at 2x), built around the item art PoE players know on sight.
import { launch, done } from './rig.mjs';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'C:/projects/poe2-trivia/.claude/worktrees/poe2-patch-trailer-d80226';
const b64 = (p) => fs.readFileSync(p).toString('base64');
const font = (fam, file, w = 400) => `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${b64(path.join(ROOT, file))}) format('woff2');font-weight:${w};}`;
const jpg = (p) => `data:image/jpeg;base64,${b64(path.resolve('..', p))}`;
const item = (id) => `data:image/avif;base64,${b64(path.join(ROOT, 'public/items', id + '.avif'))}`;
const HH = item('0935a2ea4b46'), MB = item('addddbd50fac');
const CSS = `${font('Maragsa', 'src/assets/fonts/maragsa-display.woff2')}
${font('Cinzel', 'node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff2', 600)}${font('Cinzel', 'node_modules/@fontsource/cinzel/files/cinzel-latin-700-normal.woff2', 700)}
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#07060a}
.abs{position:absolute}.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.gold{background-image:linear-gradient(180deg,#fff6da 8%,#f3d38c 42%,#c08d3c 80%,#8a5f22 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.word{font-family:Maragsa;line-height:.9;filter:drop-shadow(0 0 22px rgba(255,190,100,.5)) drop-shadow(0 5px 6px rgba(0,0,0,.95))}
.num{font-family:Cinzel;font-weight:700;line-height:1}
.tag{font-family:Cinzel;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:#f3dcaa;filter:drop-shadow(0 2px 3px rgba(0,0,0,1))}`;
const PAGES = {
  // C: Headhunter, lit by the azurite blue from behind; DELVE beside it
  thumb_c: `<div class="bg" style="background-image:url(${jpg('thumb/src_blue.jpg')});filter:blur(14px) brightness(.5) saturate(1.3);transform:scale(1.12)"></div>
    <div class="abs" style="inset:0;background:radial-gradient(circle at 34% 50%,rgba(70,140,255,.55),rgba(30,60,140,.15) 38%,rgba(0,0,0,0) 60%)"></div>
    <div class="abs" style="inset:0;background:linear-gradient(90deg,rgba(0,0,0,0) 45%,rgba(6,5,8,.85) 72%)"></div>
    <img class="abs" src="${HH}" style="left:-30px;top:150px;width:780px;transform:rotate(-8deg);filter:drop-shadow(0 0 24px rgba(120,180,255,.9)) drop-shadow(0 0 70px rgba(70,130,255,.7)) drop-shadow(0 20px 18px rgba(0,0,0,.9)) brightness(1.12) saturate(1.1)">
    <div class="abs" style="right:56px;top:180px;text-align:right">
      <div class="tag" style="font-size:28px;margin-bottom:10px">PoE2.Quest</div>
      <div class="word gold" style="font-size:190px">Delve</div>
      <div class="num" style="font-size:44px;color:#cfe3ff;letter-spacing:.12em;margin-top:18px;text-shadow:0 0 18px rgba(110,170,255,.9),0 3px 4px #000">DEPTH 100+</div></div>`,
  // D: name it? Mageblood as the game veils it, a black silhouette rimmed in light, a huge question mark
  thumb_d: `<div class="bg" style="background-image:url(${jpg('thumb/src_magenta.jpg')});filter:blur(22px) brightness(.45) saturate(1.5);transform:scale(1.15)"></div>
    <div class="abs" style="inset:0;background:radial-gradient(ellipse 50% 60% at 36% 52%,rgba(255,80,170,.45),rgba(0,0,0,0) 70%)"></div>
    <img class="abs" src="${MB}" style="left:40px;top:190px;width:700px;filter:brightness(0) drop-shadow(0 0 3px #ffd9f0) drop-shadow(0 0 16px rgba(255,120,200,.95)) drop-shadow(0 0 50px rgba(255,60,160,.7))">
    <div class="abs word gold" style="left:300px;top:90px;font-family:Cinzel;font-weight:700;font-size:420px;filter:drop-shadow(0 0 30px rgba(255,200,120,.6)) drop-shadow(0 8px 10px rgba(0,0,0,.95))">?</div>
    <div class="abs" style="right:60px;top:210px;text-align:right">
      <div class="tag" style="font-size:28px;margin-bottom:10px">PoE2.Quest</div>
      <div class="word gold" style="font-size:180px">Delve</div>
      <div class="tag" style="font-size:34px;margin-top:22px;color:#ffd0ea;letter-spacing:.18em">Name it or fall</div></div>`,
  // E: the number: how deep, burning; the deepest zone's red behind
  thumb_e: `<div class="bg" style="background-image:url(${jpg('thumb/src_red.jpg')});filter:brightness(1.6) saturate(1.4);transform:scale(1.06)"></div>
    <div class="abs" style="inset:0;background:radial-gradient(ellipse 70% 55% at 50% 105%,rgba(255,90,20,.6),rgba(160,30,10,.25) 45%,rgba(0,0,0,0) 75%)"></div>
    <div class="abs" style="inset:0;background:radial-gradient(ellipse 60% 55% at 50% 58%,rgba(0,0,0,0),rgba(5,3,3,.85))"></div>
    <div class="abs" style="left:0;right:0;top:40px;text-align:center"><div class="tag" style="font-size:30px">PoE2.Quest &nbsp;•&nbsp; Delve</div></div>
    <div class="abs" style="left:0;right:0;top:100px;text-align:center">
      <div class="tag" style="font-size:54px;letter-spacing:.5em;margin-left:.5em;color:#ffe2b0">Depth</div>
      <div class="num gold" style="font-size:330px;margin-top:-6px;filter:drop-shadow(0 0 40px rgba(255,120,40,.75)) drop-shadow(0 0 90px rgba(255,80,20,.5)) drop-shadow(0 8px 10px rgba(0,0,0,.95))">103</div></div>
    <div class="abs" style="left:0;right:0;bottom:46px;text-align:center"><div class="word gold" style="font-size:72px">How deep can you go?</div></div>`,
};
const b = await launch();
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
for (const [name, html] of Object.entries(PAGES)) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
  await page.screenshot({ path: `../thumb/${name}_2x.png` });
}
await done();
