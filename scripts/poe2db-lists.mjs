// poe2db's two list pages, the uniques and the lineage support gems, read
// the one way: by the refresh (scripts/fetch-data.mjs) and by the new-items
// watch (scripts/items-watch.mjs), so the watch sees what a refresh would.
//
// poe2db changes its markup now and then (by Nov 2026 its pictures took a
// `decoding` attribute and the picture's link went relative), so the
// patterns take any attributes around the ones they read.

import { decode as decodeText } from './fetch-stats.mjs';

export const SOURCE = 'https://poe2db.tw/us/Unique_item';
export const GEM_SOURCE = 'https://poe2db.tw/us/Lineage_Supports';

/** A picture under Art/2DItems/ in an <img> with any other attributes; its URL the group. */
const img = (under) => `<img[^>]*?\\ssrc="(https://cdn\\.poe2db\\.tw/image/Art/2DItems/${under}[^"]+)"[^>]*>`;

// The list leaves some items' pictures out, or shows one that isn't the
// game's art: those come from the item's own page (`img` undefined).
const ENTRY = new RegExp(
  `<div class="flex-shrink-0">(?:<a[^>]*>(?:${img('')}|<img[^>]*>)</a>)?</div>` +
    '<div class="flex-grow-1 ms-2"><div><a class="UniqueItem"[^>]*href="(?:/us/)?([^"]+)">' +
    '<span class="uniqueName">([^<]+)</span>\\s*<span class="uniqueTypeLine">([^<]*)</span>',
  'g',
);

const GEM_ENTRY = new RegExp(
  `<a class="(gem_\\w+)"[^>]*>${img('Gems/')}</a></div>` + '<div class="flex-grow-1 ms-2"><div><a class="gem_\\w+"[^>]*>([^<]+)</a>',
  'g',
);

// As fetch-stats decodes the item pages' names (pageBoxes), so the two match.
export const decode = (s) => decodeText(s).trim();

/**
 * The uniques on the list page, each once by name, in its order: `img` is
 * undefined where the list leaves the picture out. Only the regular
 * sections: "Cultivated Uniques" repeats items with mutated mods.
 */
export function uniqueEntries(html) {
  const cut = html.indexOf('<div id="CultivatedUniques"');
  const body = cut > 0 ? html.slice(0, cut) : html;
  const entries = [];
  const seen = new Set();
  for (const [, img, slug, rawName, rawBase] of body.matchAll(ENTRY)) {
    const name = decode(rawName);
    if (seen.has(name)) continue;
    seen.add(name);
    entries.push({ name, base: decode(rawBase), slug, img });
  }
  return entries;
}

/** The lineage support gems on their list page, each once by name (the page lists each twice), in its order: `colour` its class (gem_red, gem_green, gem_blue). */
export function gemEntries(html) {
  const seen = new Set();
  const out = [];
  for (const [, colour, img, rawName] of html.matchAll(GEM_ENTRY)) {
    const name = decode(rawName);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, colour, img });
  }
  return out;
}

// An item GGG has announced but the game files don't have yet (1.0's, in
// Nov 2026): poe2db lists it with the announcement's picture
// (web.poecdn.com, not the game's art) and a deferred tooltip, and no item
// page. Read apart from the uniques, which a refresh can take: these it
// can't until the patch is out.
const ANNOUNCED = new RegExp(
  '<div class="UniqueItem"><a class="UniqueItem"[^>]*data-hover="\\?t=deferred[^"]*"[^>]*>([^<]+)</a>\\s*<span class="uniqueTypeLine">([^<]*)</span>',
  'g',
);

/** The announced uniques on the list page (ANNOUNCED), each once by name, in its order, from the regular sections as uniqueEntries. */
export function announcedEntries(html) {
  const cut = html.indexOf('<div id="CultivatedUniques"');
  const body = cut > 0 ? html.slice(0, cut) : html;
  const seen = new Set();
  const out = [];
  for (const [, rawName, rawBase] of body.matchAll(ANNOUNCED)) {
    const name = decode(rawName);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, base: decode(rawBase) });
  }
  return out;
}
