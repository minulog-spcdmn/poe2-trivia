import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Tooltip, collectStats, EMPTY_HOVER, hashId, listLinks, ownBox, statsFile, tooltipOf } from '../scripts/fetch-stats.mjs';

// Where a tooltip comes from (scripts/fetch-stats.mjs), on made-up pages and
// no network: its hover, then its box on its own page, then the committed one.

const CDN = 'https://cdn.poe2db.tw/cache2/us/Poe_Data_UniqueItems_hover';
const ART = 'https://cdn.poe2db.tw/image/Art/2DItems/';
const UNIQUES = 'https://poe2db.tw/us/Unique_item';

const link = (name: string, hover: string, slug = name.replace(/ /g, '_')) =>
  `<a class="UniqueItem" data-hover="${CDN}/${hover}" href="/us/${slug}"><span class="uniqueName">${name}</span>`;
const content = (...lines: string[]) => `<div class="content">${lines.join('<div class="separator"></div>')}</div>`;
const mod = (text: string) => `<div class="explicitMod">${text}</div>`;
const box = (name: string, art: string, ...lines: string[]) =>
  `<div class="newItemPopup UniquePopup"><div class="itemName"><span class="lc">${name}</span></div>` +
  `<div class="itemName typeLine"><span class="lc">Ruby</span></div>${content(...lines)}` +
  `<div class="itemboximage"><img src="${ART}${art}"></div></div>`;
const unique = (id: string, name: string, variants?: { id: string; base: string }[]) => ({ id, name, kind: 'unique', ...(variants ? { variants } : {}) });

/** A pretend poe2db: each URL's body, '' (as an empty hover is) for any other. */
const site = (pages: Record<string, string>) => {
  const asked: string[] = [];
  return { asked, fetchText: async (url: string) => (asked.push(url), pages[url] ?? '') };
};
const quiet = () => {};

test('the empty hover, the hash of the empty string, is skipped; a later real link to the name wins', () => {
  const html = link('Against the Darkness', EMPTY_HOVER) + link('Against the Darkness', 'real') + link('Andvarius', 'b');
  const { hovers, pages } = listLinks(html);
  assert.equal(hovers.get('Against the Darkness'), `${CDN}/real`);
  assert.equal(hovers.get('Andvarius'), `${CDN}/b`);
  assert.equal(pages.get('Against the Darkness'), 'https://poe2db.tw/us/Against_the_Darkness');
  // Only an empty link: no hover, but its page is known.
  const only = listLinks(link('Atziri&#039;s Rule', EMPTY_HOVER, 'Atziris_Rule'));
  assert.equal(only.hovers.has("Atziri's Rule"), false);
  assert.equal(only.pages.get("Atziri's Rule"), 'https://poe2db.tw/us/Atziris_Rule');
  // The cultivated section repeats items with mutated mods: never read.
  assert.equal(listLinks(`<div id="Main"></div><div id="CultivatedUniques">${link('Andvarius', 'b')}`).hovers.size, 0);
});

test('a tooltip with no content, or content that comes to no line, is none', () => {
  const it = unique('a', 'Andvarius');
  assert.equal(tooltipOf('', it), null);
  assert.equal(tooltipOf(undefined, it), null);
  assert.equal(tooltipOf(content(), it), null);
  assert.equal(tooltipOf(content('<div class="explicitMod"> </div>'), it), null);
  assert.deepEqual(tooltipOf(content(mod('+10 to Life')), it), [[['e', '+10 to Life']]]);
});

test("a unique's own box is the one with its art, else the first", () => {
  const boxes = [
    { name: 'A', base: 'Ruby', art: 'Jewels/Red.webp', html: 'red' },
    { name: 'A', base: 'Emerald', art: 'Jewels/Green.webp', html: 'green' },
  ];
  assert.equal(ownBox(boxes, 'Jewels/Green.webp')?.html, 'green');
  assert.equal(ownBox(boxes, 'Jewels/Blue.webp')?.html, 'red');
});

test('an empty hover falls back to the box on the item page; a failed page to the committed tooltip', async () => {
  const items = [unique('a', 'Against the Darkness'), unique('b', 'Andvarius'), unique('c', 'Blackheart'), unique('d', 'Death Rush')];
  const { asked, fetchText } = site({
    [UNIQUES]:
      link('Against the Darkness', EMPTY_HOVER) + link('Andvarius', 'b') + link('Blackheart', EMPTY_HOVER) + link('Death Rush', 'd'),
    [`${CDN}/b`]: content(mod('Andvarius, from its hover')),
    // Its hover answers with no line at all: that fails too.
    [`${CDN}/d`]: content(),
    'https://poe2db.tw/us/Against_the_Darkness': box('Against the Darkness', 'Rings/A.webp', mod('From the page')),
    'https://poe2db.tw/us/Death_Rush': box('Death Rush', 'Rings/D.webp', mod('Death Rush, from the page')),
  });
  const committed: Record<string, Tooltip> = { a: [[['e', 'Committed, not the same']]], c: [[['e', 'Blackheart, committed']]] };
  const found = await collectStats(items, { committed, fetchText, log: quiet });
  assert.deepEqual(found.stats, {
    a: [[['e', 'From the page']]],
    b: [[['e', 'Andvarius, from its hover']]],
    c: [[['e', 'Blackheart, committed']]],
    d: [[['e', 'Death Rush, from the page']]],
  });
  assert.deepEqual(found.fromPage.sort(), ['Against the Darkness', 'Death Rush']);
  assert.deepEqual(found.differ, ['Against the Darkness']);
  assert.deepEqual(found.kept, ['Blackheart']);
  assert.deepEqual(found.missing, []);
  // The empty hovers are never fetched.
  assert.equal(asked.filter((u) => u.endsWith(EMPTY_HOVER)).length, 0);
});

test('with no source at all an item is missing; fetch-data hands over the boxes it has read', async () => {
  const items = [unique('a', 'Against the Darkness', [{ id: 'v1', base: 'Emerald' }]), unique('n', 'New One')];
  const { asked, fetchText } = site({ [UNIQUES]: link('Against the Darkness', EMPTY_HOVER) + link('New One', EMPTY_HOVER) });
  const found = await collectStats(items, {
    ownBoxes: new Map([['a', box('Against the Darkness', 'Rings/A.webp', mod('Own box'))]]),
    variantBoxes: new Map([['v1', box('Against the Darkness', 'Rings/B.webp', mod('Variant box'))]]),
    fetchText,
    log: quiet,
  });
  assert.deepEqual(found.stats, { a: [[['e', 'Own box']]], v1: [[['e', 'Variant box']]] });
  assert.deepEqual(found.missing, ['n']);
  // Handed over, so no item page was fetched.
  assert.deepEqual(asked.filter((u) => u.includes('/us/') && u !== UNIQUES && !u.endsWith('Lineage_Supports')), []);
});

test("without fetch-data's boxes, a variant's comes from the item page by its art's id", async () => {
  const items = [unique('a', 'Grand Spectrum', [{ id: hashId('Jewels/Green.webp'), base: 'Emerald' }])];
  const { fetchText } = site({
    [UNIQUES]: link('Grand Spectrum', 'a'),
    [`${CDN}/a`]: content(mod('Ruby, from its hover')),
    'https://poe2db.tw/us/Grand_Spectrum': box('Grand Spectrum', 'Jewels/Red.webp', mod('Ruby')) + box('Grand Spectrum', 'Jewels/Green.webp', mod('Emerald')),
  });
  const found = await collectStats(items, { fetchText, log: quiet });
  assert.deepEqual(found.stats[hashId('Jewels/Green.webp')], [[['e', 'Emerald']]]);
  assert.deepEqual(found.stats.a, [[['e', 'Ruby, from its hover']]]);
});

test('itemStats.json holds only the listed items and variants, in their order', () => {
  const items = [unique('b', 'B', [{ id: 'v', base: 'x' }]), unique('a', 'A')];
  assert.equal(statsFile(items, { a: [[['e', 'A']]], v: [[['e', 'V']]], gone: [[['e', 'G']]] }), '{"v":[[["e","V"]]],"a":[[["e","A"]]]}\n');
});
