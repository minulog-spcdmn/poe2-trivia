import { test } from 'node:test';
import assert from 'node:assert/strict';
import { announcedEntries, gemEntries, GEM_SOURCE, SOURCE, uniqueEntries } from '../scripts/poe2db-lists.mjs';
import { compare, fingerprintOf, ITEM_PAGES, LEAST_GEMS, LEAST_UNIQUES, main, pageReads, reportOf } from '../scripts/items-watch.mjs';

// poe2db's list pages as the refresh (scripts/fetch-data.mjs) and the
// new-items watch (scripts/items-watch.mjs) read them
// (scripts/poe2db-lists.mjs), on snippets of their markup and no network.

const ART = 'https://cdn.poe2db.tw/image/Art/2DItems';

/** A unique's entry as poe2db listed it until late 2026. */
const oldUnique = (name: string, base: string, art = `${ART}/Rings/Uniques/${name.replace(/\W/g, '')}.webp`) =>
  `<div class="flex-shrink-0"><a class="UniqueItems UniqueItem" href="/us/${name.replace(/\W/g, '_')}"><img loading="lazy" src="${art}" alt="x" class="w1" /></a></div>` +
  `<div class="flex-grow-1 ms-2"><div><a class="UniqueItem" data-hover="x" href="/us/${name.replace(/\W/g, '_')}"><span class="uniqueName">${name.replace("'", '&#039;')}</span> <span class="uniqueTypeLine">${base}</span></a></div></div>`;

/** And as it does by Nov 2026: the picture takes `decoding`, its link goes relative. */
const newUnique = (name: string, base: string, art = `${ART}/Rings/Uniques/${name.replace(/\W/g, '')}.webp`) =>
  `<div class="flex-shrink-0"><a class="UniqueItems UniqueItem" data-hover="?s=x" href="${name.replace(/\W/g, '_')}"><img loading="lazy" decoding="async" src="${art}" alt="x" class="w1" /></a></div>` +
  `<div class="flex-grow-1 ms-2"><div><a class="UniqueItem" data-hover="x" href="/us/${name.replace(/\W/g, '_')}"><span class="uniqueName">${name}</span> <span class="uniqueTypeLine">${base}</span></a></div></div>`;

/** One the list leaves the picture out of. */
const bareUnique = (name: string, base: string) =>
  `<div class="flex-shrink-0"></div><div class="flex-grow-1 ms-2"><div><a class="UniqueItem" href="/us/${name.replace(/\W/g, '_')}"><span class="uniqueName">${name}</span> <span class="uniqueTypeLine">${base}</span></a></div></div>`;

/** An announced one: the announcement's picture, a deferred tooltip. */
const announced = (name: string, base: string, art = `https://web.poecdn.com/protected/image/poe2/announcements/conquerors/items/${name.replace(/\W/g, '')}.png?key=k&scale=1`) =>
  `<div class="flex-shrink-0"><img loading="lazy" decoding="async" src="${art}" alt="x" /></div><div class="flex-grow-1 ms-2"><div class="UniqueItem">` +
  `<a class="UniqueItem" href="${name.replace(/\W/g, '_')}" data-hover="?t=deferred&n=${encodeURIComponent(name)}&_=1">${name}</a> <span class="uniqueTypeLine">${base}</span></div></div>`;

const oldGem = (name: string, colour = 'gem_red') =>
  `<a class="${colour}" href="/us/${name.replace(/\W/g, '_')}"><img loading="lazy" src="${ART}/Gems/New/Lineage/${name.replace(/\W/g, '')}.webp" alt="x" class="w1" /></a></div>` +
  `<div class="flex-grow-1 ms-2"><div><a class="${colour}" href="/us/${name.replace(/\W/g, '_')}">${name}</a></div>`;
const newGem = (name: string, colour = 'gem_blue') =>
  `<a class="${colour}" data-hover="x" href="/us/${name.replace(/\W/g, '_')}"><img loading="lazy" decoding="async" src="${ART}/Gems/New/Lineage/${name.replace(/\W/g, '')}.webp" alt="x" class="w1" /></a></div>` +
  `<div class="flex-grow-1 ms-2"><div><a class="${colour}" data-hover="x" href="/us/${name.replace(/\W/g, '_')}">${name}</a></div>`;

test('the uniques are read in either markup, a picture left out as undefined, each once, the cultivated ones left out', () => {
  const html =
    '<div id="WeaponUnique">' +
    oldUnique("Ventor's Gamble", 'Gold Ring') +
    newUnique('Andvarius', 'Gold Ring') +
    bareUnique('Ingenuity', 'Ring') +
    newUnique('Andvarius', 'Gold Ring') +
    announced('Keelhaul', 'Linen Belt') +
    '<div id="CultivatedUniques">' +
    newUnique('Cultivated One', 'Ruby Ring');
  const entries = uniqueEntries(html);
  assert.deepEqual(
    entries.map((e) => [e.name, e.base, e.slug]),
    [
      ["Ventor's Gamble", 'Gold Ring', 'Ventor_s_Gamble'],
      ['Andvarius', 'Gold Ring', 'Andvarius'],
      ['Ingenuity', 'Ring', 'Ingenuity'],
    ],
  );
  assert.equal(entries[1].img, `${ART}/Rings/Uniques/Andvarius.webp`);
  assert.equal(entries[2].img, undefined);
  assert.deepEqual(announcedEntries(html), [{ name: 'Keelhaul', base: 'Linen Belt' }]);
});

test('the lineage gems are read in either markup, with their colour and art', () => {
  const gems = gemEntries(oldGem("Atalui's Bloodletting") + newGem("Dreamer's Knell"));
  assert.deepEqual(
    gems.map((g) => [g.name, g.colour]),
    [
      ["Atalui's Bloodletting", 'gem_red'],
      ["Dreamer's Knell", 'gem_blue'],
    ],
  );
  assert.equal(gems[1].img, `${ART}/Gems/New/Lineage/DreamersKnell.webp`);
});

test('what poe2db lists is held against the game: new, announced new, announced in the game, gone', () => {
  const items = ['Andvarius', 'Keelhaul', 'Old Gone', "Atalui's Bloodletting"].map((name) => ({ name }));
  const c = compare(
    items,
    uniqueEntries(newUnique('Andvarius', 'Gold Ring') + newUnique('Brand New', 'Iron Ring')),
    gemEntries(oldGem("Atalui's Bloodletting") + newGem("Dreamer's Knell") + newGem("Dreamer's Knell")),
    [
      { name: 'Keelhaul', base: 'Linen Belt' },
      { name: 'Siegebreaker', base: 'Ornate Belt' },
    ],
  );
  assert.deepEqual(c, {
    added: [
      { name: 'Brand New', base: 'Iron Ring' },
      { name: "Dreamer's Knell", base: 'Lineage support gem' },
    ],
    announcedNew: [{ name: 'Siegebreaker', base: 'Ornate Belt' }],
    reworked: [{ name: 'Keelhaul', base: 'Linen Belt' }],
    gone: [{ name: 'Old Gone' }],
  });
  const report = reportOf(c);
  assert.match(report, /### New, with the game's art \(2\)\n\nA refresh can take these now[^\n]*\n\n- Brand New \(Iron Ring\)\n- Dreamer's Knell \(Lineage support gem\)/);
  assert.match(report, /### In the game now, listed as announced \(1\)[\s\S]*Don't: wait until they're back with the game's art\.\n\n- Keelhaul \(Linen Belt\)/);
  assert.match(report, /### In the game, no longer on poe2db \(1\)[\s\S]*- Old Gone/);
});

test('nothing to say when the lists and the game agree, and the same finding has the same fingerprint in any order', () => {
  const none = { added: [], announcedNew: [], reworked: [], gone: [] };
  assert.equal(reportOf(none), '');
  const a = { ...none, added: [{ name: 'A' }, { name: 'B' }], gone: [{ name: 'C' }] };
  const b = { ...none, added: [{ name: 'B' }, { name: 'A' }], gone: [{ name: 'C' }] };
  assert.equal(fingerprintOf(a), fingerprintOf(b));
  // The same names in another section is another finding: one now announced is not the same as one gone.
  assert.notEqual(fingerprintOf(a), fingerprintOf({ ...none, added: a.added, reworked: a.gone }));
});

/** An item's own page as poe2db shows it: its box, with its name and picture (fetch-stats.mjs pageBoxes). */
const itemPage = (name: string) =>
  `<div class="newItemPopup UniquePopup"><div class="itemName">\n<span class="lc">${name}</span></div><div class="itemName typeLine">\n<span class="lc">Ring</span></div>` +
  `<div class="itemboximage">\n<img loading="lazy" decoding="async" src="${ART}/Rings/Uniques/x.webp" /></div></div>`;

test("an item's own page reads where it shows the item's box with its name and picture", () => {
  assert.ok(pageReads(itemPage('Andvarius'), 'Andvarius'));
  assert.ok(!pageReads(itemPage('Andvarius'), 'Ingenuity'));
  assert.ok(!pageReads('<div class="itemCard">Andvarius</div>', 'Andvarius'));
});

/** Pages with enough items to pass the layout checks, and `extra` uniques; each unique's own page as `item` draws it. */
const pages = (extra = '', item: (name: string) => string = itemPage) => {
  const site: Record<string, string> = {
    [SOURCE]: Array.from({ length: LEAST_UNIQUES }, (_, i) => newUnique(`Unique ${i}`, 'Ring')).join('') + extra,
    [GEM_SOURCE]: Array.from({ length: LEAST_GEMS }, (_, i) => newGem(`Gem ${i}`)).join(''),
  };
  for (let i = 0; i < LEAST_UNIQUES; i++) site[`https://poe2db.tw/us/Unique_${i}`] = item(`Unique ${i}`);
  return site;
};
const known = [...Array.from({ length: LEAST_UNIQUES }, (_, i) => `Unique ${i}`), ...Array.from({ length: LEAST_GEMS }, (_, i) => `Gem ${i}`)].map((name) => ({ name }));

const run = async (site: Record<string, string> | null, items = known) => {
  const lines: string[] = [];
  const out: string[] = [];
  const asked: string[] = [];
  const written: Record<string, string> = {};
  const code = await main(['report.md'], {}, {
    get: async (url) => {
      asked.push(url);
      if (!site?.[url]) throw new Error('poe2db.tw: 503 Service Unavailable');
      return site[url];
    },
    items,
    write: (file, text) => void (written[file] = text),
    output: (line) => void out.push(line),
    log: (line) => void lines.push(line),
  });
  return { code, lines, out, asked, written };
};

test('a quiet day writes no report and says found=false, with its fingerprint, from the two lists and one item page', async () => {
  const r = await run(pages());
  assert.equal(r.code, 0);
  assert.deepEqual(r.asked, [SOURCE, GEM_SOURCE, 'https://poe2db.tw/us/Unique_0']);
  assert.deepEqual(r.written, {});
  assert.equal(r.out.length, 2);
  assert.match(r.out[0], /^fingerprint=[0-9a-f]{12}$/);
  assert.equal(r.out[1], 'found=false');
});

test('a new item writes the report and says found=true', async () => {
  const r = await run(pages(newUnique('Brand New', 'Iron Ring')));
  assert.equal(r.code, 0);
  assert.equal(r.out[1], 'found=true');
  assert.match(r.written['report.md'], /- Brand New \(Iron Ring\)/);
});

test("poe2db not answering passes with a warning: a day it couldn't read", async () => {
  const r = await run(null);
  assert.equal(r.code, 0);
  assert.deepEqual(r.out, ['found=false']);
  assert.match(r.lines[0], /^::warning::The new-items watch couldn't read poe2db: .*503/);
});

test('lists too thin to read hand the watch to Claude: broken, with why, and no failed run to mail', async () => {
  const r = await run({ [SOURCE]: '<html>nothing</html>', [GEM_SOURCE]: '<html></html>' });
  assert.equal(r.code, 0);
  assert.deepEqual(r.out, ['broken=true', `why=poe2db's layout changed: only 0 uniques read from ${SOURCE}`, 'found=false']);
  assert.match(r.lines.at(-1)!, /^::warning::The new-items watch can't read poe2db .*Claude is asked to mend it\.$/);
});

test('item pages that no longer show the item are a changed layout too, after a few tried', async () => {
  const r = await run(pages('', () => '<div class="itemCard">changed</div>'));
  assert.equal(r.code, 0);
  assert.equal(r.asked.length, 2 + ITEM_PAGES);
  assert.equal(r.out[0], 'broken=true');
  assert.match(r.out[1], /^why=poe2db's layout changed: no item's own page showed its name and picture \(Unique 0, Unique 1, Unique 2\)$/);
});

test('one item page that reads is enough', async () => {
  const site = pages();
  site['https://poe2db.tw/us/Unique_0'] = '<div class="itemCard">odd one</div>';
  const r = await run(site);
  assert.equal(r.asked.length, 4);
  assert.match(r.out[0], /^fingerprint=/);
});

test("an item page poe2db doesn't answer is a day it couldn't read, not a changed layout", async () => {
  const site = pages();
  delete site['https://poe2db.tw/us/Unique_0'];
  const r = await run(site);
  assert.equal(r.code, 0);
  assert.deepEqual(r.out, ['found=false']);
  assert.match(r.lines[0], /^::warning::The new-items watch couldn't read poe2db/);
});
