// A solo Take-turns game in Chrome on this PC's screen, traced (chrome.mjs):
// the start page, New game, Take turns, Begin, then each turn's category,
// answer and next, the pointer travelling to each button as a player's
// would. Each step is a mark, so read.py gives each its frames and the GPU's
// raster time.
//   node scripts/pc/game.mjs <url> <label> [turns]
//   python scripts/pc/read.py .pc/runs/<label>.json

import { mark, open, sleep, trace } from './chrome.mjs';

const [url, label, turnsArg] = process.argv.slice(2);
if (!url || !label) {
  console.error('usage: node scripts/pc/game.mjs <url> <label> [turns]');
  process.exit(2);
}
const turns = Number(turnsArg ?? 4);

const { ctx, page } = await open();
await page.goto('about:blank');
const end = await trace(ctx, page, label);
await page.goto(url, { waitUntil: 'load' });
await sleep(4000);

/** The pointer travels to the first visible, enabled button whose name matches, then clicks it. */
async function press(re, name) {
  const box = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('button, [role=button], [role=radio]')].find((b) => re.test((b.getAttribute('aria-label') || b.textContent || '').trim()) && b.getBoundingClientRect().width > 0 && !b.disabled);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, re.source);
  if (!box) {
    console.log(`!! no button for ${name}`);
    return false;
  }
  await page.mouse.move(box.x, box.y, { steps: 25 });
  await sleep(250);
  await mark(page, name);
  await page.mouse.click(box.x, box.y);
  return true;
}

const CATEGORY = /^(One-Handed|Two-Handed|Gloves|Off-Hands|Body Armours|Helmets|Boots|Rings|Amulets|Belts|Jewels|Flasks|Quivers|Shields|Charms|Foci|Relics|Talismans|Tablets|Waystones|Sceptres|Wands|Staves|Bows|Crossbows|Spears|Maces|Quarterstaves)/;

await press(/^New game$/, 'new game');
await sleep(2500);
await press(/^Take turns$/, 'take turns');
await sleep(1500);
await press(/^Begin the hunt$/, 'begin');
await sleep(3000);
for (let i = 0; i < turns; i++) {
  if (!(await press(CATEGORY, `category ${i}`))) break;
  await sleep(3000);
  if (!(await press(/^[1-6]( |$)/, `answer ${i}`))) break;
  await sleep(4000);
  if (!(await press(/^(Next turn|Next|Continue)/, `next ${i}`))) break;
  await sleep(3000);
}
await mark(page, 'end');
const kept = await end();
await press(/^Leave game$/, 'leave');
await sleep(1000);
await ctx.close();

const ft = kept.frames.map((f) => f[1]).slice(5);
const sorted = [...ft].sort((a, b) => a - b);
console.log(`${kept.vw}x${kept.vh} at ${kept.dpr}x: ${ft.length} frames, median ${sorted[sorted.length >> 1]} ms, worst ${sorted.at(-1)} ms, over 25 ms ${ft.filter((x) => x > 25).length}, over 50 ms ${ft.filter((x) => x > 50).length}`);
