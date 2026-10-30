// The category cards dealt again and again in Chrome on this PC's screen,
// traced (chrome.mjs): the card bench's stage (cards.html?stage, the real
// game screen) deals a hand, waits 3 s, and deals it again. Each deal is a
// mark, so read.py gives each its frames and the GPU's raster time, and its
// last second shows what the hand costs at rest. Two deals first, untraced,
// warm it up.
//   node scripts/pc/cards.mjs <dev server url> <label> [deals] [hand]
//   python scripts/pc/read.py .pc/runs/<label>.json
// hand: finds (a vein, a flare, dynamite: the emblems kindle), way-out (the
// way out among two plain cards: its lamp breathes), plain, or a JSON list
// of { category, kind }. cards.html is a beta page: a dev server or the beta
// serves it, the live build doesn't.

import { mark, open, sleep, trace } from './chrome.mjs';

const HANDS = {
  finds: [
    { category: 'Rings', kind: 'azurite' },
    { category: 'Helmets', kind: 'flare' },
    { category: 'Off-Hands', kind: 'dynamite' },
  ],
  'way-out': [
    { category: 'Two-Handed Weapons', kind: null },
    { category: '~way-out', kind: null },
    { category: 'Amulets & Belts', kind: null },
  ],
  plain: [
    { category: 'Rings', kind: null },
    { category: 'Helmets', kind: null },
    { category: 'Off-Hands', kind: null },
  ],
};

const [url, label, dealsArg, handArg = 'finds'] = process.argv.slice(2);
if (!url || !label) {
  console.error('usage: node scripts/pc/cards.mjs <url> <label> [deals] [finds|way-out|plain|<json>]');
  process.exit(2);
}
const deals = Number(dealsArg ?? 4);
const hand = HANDS[handArg] ?? JSON.parse(handArg);

const { ctx, page } = await open();
await page.goto(new URL('cards.html?stage', url).href, { waitUntil: 'load' });
await page.waitForFunction(() => window.__cb?.ready, null, { timeout: 120000 });
// (The pointer off the cards: a hover tilts one.)
await page.mouse.move(20, 600);
const deal = () => page.evaluate((h) => window.__cb.deal(h), hand);
for (let k = 0; k < 2; k++) {
  await deal();
  await sleep(3000);
}
const end = await trace(ctx, page, label);
await sleep(1000);
for (let k = 0; k < deals; k++) {
  await mark(page, `deal ${k}`);
  await deal();
  await sleep(3000);
}
await mark(page, 'end');
await end();
await ctx.close();
