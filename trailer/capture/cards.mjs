// Title cards as transparent 1920x1080 PNGs, in the app's own fonts.
import { launch, done } from './rig.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/projects/poe2-trivia/.claude/worktrees/poe2-patch-trailer-d80226';
const OUT = path.resolve('../cards');
fs.mkdirSync(OUT, { recursive: true });
const b64 = (p) => fs.readFileSync(path.join(ROOT, p)).toString('base64');
const font = (fam, file, weight = 400, style = 'normal') => `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${b64(file)}) format('woff2');font-weight:${weight};font-style:${style};}`;
const FONTS = [
  font('Maragsa', 'src/assets/fonts/maragsa-display.woff2'),
  font('Cinzel', 'node_modules/@fontsource/cinzel/files/cinzel-latin-400-normal.woff2', 400),
  font('Cinzel', 'node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff2', 600),
  font('Cinzel', 'node_modules/@fontsource/cinzel/files/cinzel-latin-700-normal.woff2', 700),
  font('Garamond', 'node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2', 400),
  font('Garamond', 'node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff2', 400, 'italic'),
].join('\n');

const CSS = `${FONTS}
html,body{margin:0;background:transparent;width:1920px;height:1080px;overflow:hidden}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.gold{background-image:linear-gradient(180deg,#fff1c9 0.1em,#d7b068 0.5em,#8b6526 0.95em);-webkit-background-clip:text;background-clip:text;color:transparent;padding:0.1em 0.2em 0.25em}
.title{font-family:Maragsa;font-size:190px;line-height:1;letter-spacing:0.01em}
.big{font-family:Maragsa;font-size:120px;line-height:1.05}
.meta{font-family:Cinzel;font-weight:600;font-size:30px;letter-spacing:0.42em;color:#d9a45a;text-transform:uppercase;display:flex;align-items:center;gap:28px;margin-left:0.42em}
.meta i{display:block;width:150px;height:1.5px;background:linear-gradient(90deg,transparent,#c9a45c)}
.meta i.r{background:linear-gradient(270deg,transparent,#c9a45c)}
.meta b{font-weight:600;color:#f1d99b}
.sub{font-family:Garamond;font-style:italic;font-size:44px;color:#e9dcc0;margin-top:22px;letter-spacing:0.01em}
.label{font-family:Cinzel;font-weight:700;font-size:64px;letter-spacing:0.16em;color:#f1d99b;text-transform:uppercase;margin-left:0.16em}
.diamond{width:12px;height:12px;background:#d9a45a;transform:rotate(45deg);display:inline-block}
/* lower-third callouts */
.lt{position:absolute;left:120px;bottom:120px;text-align:left}
.lt .k{font-family:Cinzel;font-weight:600;font-size:24px;letter-spacing:0.5em;color:#d9a45a;display:flex;align-items:center;gap:18px}
.lt .k i{display:block;width:70px;height:1.5px;background:linear-gradient(90deg,#c9a45c,transparent)}
.lt .t{font-family:Maragsa;font-size:96px;line-height:1.05;margin:6px 0 0 -6px}
.lt .s{font-family:Garamond;font-style:italic;font-size:38px;color:#e9dcc0;margin-top:4px}
.glow{filter:drop-shadow(0 0 24px rgba(240,190,110,0.35)) drop-shadow(0 2px 3px rgba(0,0,0,0.8))}
/* feature tags: lower left, small and quiet */
.tag{position:absolute;left:96px;bottom:100px;display:flex;align-items:center;gap:20px;padding:16px 40px 16px 24px;background:linear-gradient(90deg,rgba(9,7,5,0.82),rgba(9,7,5,0.66) 70%,rgba(9,7,5,0));filter:drop-shadow(0 0 14px rgba(0,0,0,0.9)) drop-shadow(0 0 3px rgba(0,0,0,0.9))}
.tag .dm{width:9px;height:9px;background:#e8bf73;transform:rotate(45deg);box-shadow:0 0 10px rgba(240,190,110,0.8)}
.tag .tt{font-family:Cinzel;font-weight:600;font-size:31px;letter-spacing:0.42em;color:#f3dfae;text-transform:uppercase}
.tag i{display:block;width:160px;height:1.5px;background:linear-gradient(90deg,#c9a45c,transparent)}
.endl{font-family:Cinzel;font-weight:600;font-size:40px;letter-spacing:0.5em;color:#f1d99b;text-transform:uppercase;display:flex;align-items:center;gap:0.6em;margin-top:330px;margin-left:0.5em;filter:drop-shadow(0 0 12px rgba(240,190,110,0.35))}
.endl .dot{width:9px;height:9px;background:#d9a45a;transform:rotate(45deg);display:inline-block}
.url2{font-family:Cinzel;font-weight:600;font-size:30px;letter-spacing:0.55em;color:#cdb98e;margin-top:470px;margin-left:0.55em}
.credit{font-family:Garamond;font-style:italic;font-size:34px;color:#cdb98e;margin-top:470px;letter-spacing:0.02em}
.credit b{font-weight:400;color:#f1d99b}
.url{font-family:Cinzel;font-weight:600;font-size:46px;letter-spacing:0.3em;color:#f1d99b;margin-left:0.3em}
/* feature titles, v4: large, centred, read over the shot defocused behind them */
.ft{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ft .n{font-family:Maragsa;font-size:124px;line-height:1.05;filter:drop-shadow(0 0 18px rgba(240,190,110,0.28)) drop-shadow(0 3px 4px rgba(0,0,0,0.85))}
.ft .n .d{font-family:Cinzel;font-weight:600;font-size:0.82em}
.ft .o{display:flex;align-items:center;gap:22px;margin-top:6px}
.ft .o i{display:block;width:220px;height:1.5px;background:linear-gradient(90deg,transparent,#c9a45c)}
.ft .o i.r{background:linear-gradient(270deg,transparent,#c9a45c)}
.ft.low{justify-content:flex-end;padding-bottom:110px;box-sizing:border-box}
.ft.low .n{font-size:96px}
`;

const lt = (k, t, s) => `<div class="lt glow"><div class="k"><span class="diamond"></span>${k}<i></i></div><div class="t gold">${t}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const tag = (t) => `<div class="tag"><span class="dm"></span><span class="tt">${t}</span><i></i></div>`;
const ft = (t, low) => `<div class="ft${low ? ' low' : ''}"><div class="n gold">${t}</div><div class="o"><i></i><span class="diamond"></span><i class="r"></i></div></div>`;
const CARDS = {
  tag4_twelve: ft('Up to twelve players'),
  tag4_codex: ft('The Codex'),
  tag4_zones: ft('Ten zones', true),
  tag4_endless: ft('Endless past depth <span class="d">100</span>', true),
  tag4_vein: ft('Azurite veins'),
  tag4_revive: ft('Revive a teammate'),
  tag4_streaks: ft('Streak fire', true),
  tag4_finds: ft('Flares &bull; Dynamite'),
  tag4_ach: ft('Achievements'),
  tag3_daily: tag('Today&rsquo;s unique'),
  tag3_twelve: tag('Up to twelve players'),
  tag3_together: tag('Delve together'),
  tag3_tooltips: tag('Item tooltips'),
  tag3_zones: tag('Ten zones'),
  tag3_endless: tag('Endless past depth 100'),
  tag3_vein: tag('Azurite vein'),
  tag3_wards: tag('Wards'),
  tag3_revive: tag('Revive a teammate'),
  tag3_streaks: tag('Streak fire'),
  tag3_finds: tag('Flares &bull; Dynamite'),
  tag3_ach: tag('Achievements'),
  tag3_codex: tag('The codex'),
  tag3_race: tag('Race mode'),
  tag_daily: tag('Today&rsquo;s unique'),
  tag_lobby: tag('The new lobby'),
  tag_pointers: tag('Live pointers'),
  tag_tooltips: tag('Item tooltips'),
  tag_vein: tag('Azurite vein'),
  tag_streaks: tag('Team streaks'),
  tag_finds: tag('Flares &bull; Dynamite'),
  tag_zones: tag('Fifteen zones'),
  logo2: `<div class="c glow"><div class="title gold" style="font-size:230px">PoE2.Quest</div></div>`,
  end_out: `<div class="c"><div class="endl">Delve<span class="dot"></span>Out now</div></div>`,
  end_credit: `<div class="c"><div class="credit">made by <b>zoe_arcana</b></div></div>`,
  end_url: `<div class="c"><div class="url2">poe2.quest</div></div>`,
  lt_start: lt('New', 'A new start page', 'Today’s unique, in the rune circle'),
  lt_daily: lt('Every day', 'Today’s unique', 'One item for every exile; keep the streak burning'),
  lt_lobby: lt('New', 'A new lobby', 'Pick Delve and set out together'),
  lt_tooltip: lt('New', 'Item tooltips', 'Every unique, in the game’s own font'),
  lt_pointers: lt('Together', 'Live pointers', 'See where your party is reaching'),
  lt_zones: lt('Delve', 'Fifteen zones', 'Each one named in its own title card'),
  lt_vein: lt('New find', 'The Azurite Vein', 'Dig deeper, or take the haul back to the light'),
  lt_streak: lt('Delve', 'Streaks that burn', 'Clear depth after depth and the verdict catches fire'),
  lt_finds: lt('Finds', 'Flares and dynamite', 'More time, or blast the question away'),
  w_lives: `<div class="c glow"><div class="big gold">Three lives.</div></div>`,
  w_light: `<div class="c glow"><div class="big gold">One borrowed light.</div></div>`,
  w_delve: `<div class="c glow"><div class="meta"><i></i>PoE2.Quest presents<i class="r"></i></div><div class="title gold" style="font-size:260px;margin-top:10px">Delve</div></div>`,
  w_deep: `<div class="c glow"><div class="big gold">How deep will you go?</div></div>`,
  logo: `<div class="c glow"><div class="title gold" style="font-size:230px">PoE2.Quest</div><div class="meta" style="margin-top:6px"><i></i>Unique item trivia<i class="r"></i></div></div>`,
  logo_sub: `<div class="c glow" style="justify-content:flex-end;padding-bottom:150px;box-sizing:border-box"><div class="label" style="font-size:44px">Delve is live</div><div class="sub" style="margin-top:14px">Free in your browser; alone or with up to eleven friends</div><div class="url" style="margin-top:34px">poe2.quest</div></div>`,
};

const b = await launch();
// drawn at twice the size (3840 x 2160), so the titles stay sharp in the 4K render (and are scaled down for 1080p)
const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
for (const [name, html] of Object.entries(CARDS)) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, name + '.png'), omitBackground: true });
}
console.log('cards:', Object.keys(CARDS).join(' '));
await done();
