// QA scenes at rest in Chrome on this PC's screen, traced (chrome.mjs), for
// what a game only reaches now and then (a vein's find cards, a duel's
// card), where game.mjs plays one from the start. Each scene opens as the QA
// desk's frame shows it (qa.html?frame, fitted to the window), the pointer
// out of the way, and lies still: one trace a scene, in
// .pc/runs/<label>.<scene>.json (its / as ~), marked `rest` once it has
// settled and `end` two seconds later, so read.py's at-rest column is its
// last second at rest. REST=<ms> lies longer, for what comes round now and
// then (a whole lap of it, read from the phase's raster as a whole).
//   node scripts/pc/scenes.mjs <dev server url> <label> <scene key> [...]
//   python scripts/pc/read.py .pc/runs/<label>.<scene>.json
// A scene key is the desk's (game/delve-finds), with its seat or controls
// after it as the address has them (game/deathmatch&seat=1). qa.html is a
// beta page: a dev server or the beta serves it, the live build doesn't.

import { mark, open, sleep, trace } from './chrome.mjs';

const [url, label, ...keys] = process.argv.slice(2);
if (!url || !label || !keys.length) {
  console.error('usage: node scripts/pc/scenes.mjs <dev server url> <label> <scene key> [...]');
  process.exit(2);
}

const { ctx, page } = await open();
for (const key of keys) {
  await page.goto('about:blank');
  const end = await trace(ctx, page, `${label}.${key.replace(/[/&=?]/g, '~')}`);
  await page.goto(`${url.replace(/\/$/, '')}/qa.html?frame&s=${key}&size=fit`, { waitUntil: 'load' });
  await page.mouse.move(2, 2);
  // Its deal, its art and its circles all in, and the shader cache warm.
  await sleep(7000);
  await mark(page, 'rest');
  await sleep(Number(process.env.REST ?? 2000));
  await mark(page, 'end');
  await end();
}
await ctx.close();
