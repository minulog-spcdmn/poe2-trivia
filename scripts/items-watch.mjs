#!/usr/bin/env node
// The new-items watch (.github/workflows/items-watch.yml): reads poe2db's
// two list pages, the uniques and the lineage gems (two requests, read as a
// refresh reads them: poe2db-lists.mjs), and holds them against
// src/data/items.json. It changes nothing; it says what a refresh would
// find:
// - new items with the game's art, which a refresh can take now;
// - items GGG has announced but the game doesn't have yet (poe2db shows
//   the announcement's picture), new ones and ones the game has now (being
//   reworked: a refresh before they're back with the game's art would find
//   them gone);
// - items the game has that poe2db no longer lists at all.
// The workflow opens an issue from the report, and only when what it finds
// differs from the last issue's (its fingerprint, hidden in the issue).
//
// It reads a few item pages too, as the refresh does (fetch-stats.mjs
// pageBoxes), so a change to their layout shows before a patch needs them.
//
// Usage: node scripts/items-watch.mjs <report file>
// Writes the report there when there's anything to say (nothing otherwise),
// and `fingerprint` and `found` (true or false) to GITHUB_OUTPUT when it's
// set. When poe2db's pages can't be read (their layout changed, which breaks
// the refresh too) or the watch itself breaks, `broken=true` and `why`
// instead, and the workflow has Claude mend the reading: no failed run, no
// mail. Exits 0 but on wrong usage; poe2db not answering is a ::warning::,
// a day it couldn't read.

import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry, pageBoxes } from './fetch-stats.mjs';
import { GEM_SOURCE, SOURCE, announcedEntries, gemEntries, uniqueEntries } from './poe2db-lists.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'src', 'data', 'items.json');

/** Fewer than these on a page: its layout changed (as fetch-data's own checks). */
export const LEAST_UNIQUES = 100;
export const LEAST_GEMS = 20;

/** Item pages read to check theirs (each a request): the first ones the list pictures, any one read passing. */
export const ITEM_PAGES = 3;

/** The page's layout changed: the check can't read it, and neither can a refresh. */
export class LayoutChanged extends Error {}

/** Whether an item's own page shows its box, its name and picture there, as the refresh reads it (pageBoxes). */
export const pageReads = (html, name) => pageBoxes(html).some((b) => b.name === name && b.art);

/**
 * What poe2db's lists hold against the game's items (`items`, items.json):
 * `added`, listed with the game's art and not in the game (a refresh takes
 * them); `announcedNew` and `reworked`, announced (ANNOUNCED in
 * poe2db-lists.mjs), new or in the game; `gone`, in the game and listed
 * neither way. Each sorted by name.
 */
export function compare(items, uniques, gems, announced) {
  const ours = new Set(items.map((i) => i.name));
  const listed = new Set([...uniques, ...gems].map((e) => e.name));
  const told = new Set(announced.map((e) => e.name));
  const byName = (a, b) => a.name.localeCompare(b.name, 'en');
  const added = [
    ...uniques.filter((e) => !ours.has(e.name)).map((e) => ({ name: e.name, base: e.base })),
    ...gems.filter((e) => !ours.has(e.name)).map((e) => ({ name: e.name, base: 'Lineage support gem' })),
  ];
  const once = (list) => list.filter((e, i) => list.findIndex((f) => f.name === e.name) === i);
  return {
    added: once(added).sort(byName),
    announcedNew: announced.filter((e) => !ours.has(e.name) && !listed.has(e.name)).sort(byName),
    reworked: announced.filter((e) => ours.has(e.name) && !listed.has(e.name)).sort(byName),
    gone: [...ours].filter((n) => !listed.has(n) && !told.has(n)).sort((a, b) => a.localeCompare(b, 'en')).map((name) => ({ name })),
  };
}

const anything = (c) => c.added.length + c.announcedNew.length + c.reworked.length + c.gone.length > 0;

/** A short hash of what was found, the same for the same lists in any order: an issue's, to tell whether anything changed since. */
export function fingerprintOf(c) {
  const names = (list) => list.map((e) => e.name).sort();
  const key = JSON.stringify([names(c.added), names(c.announcedNew), names(c.reworked), names(c.gone)]);
  return createHash('sha1').update(key).digest('hex').slice(0, 12);
}

/** The issue's text (Markdown) for what was found; empty when there's nothing. */
export function reportOf(c) {
  if (!anything(c)) return '';
  const line = (e) => `- ${e.name}${e.base ? ` (${e.base})` : ''}`;
  const out = ['The new-items watch (scripts/items-watch.mjs) held poe2db against src/data/items.json.', ''];
  if (c.added.length) {
    out.push(`### New, with the game's art (${c.added.length})`, '', 'A refresh can take these now (README, "Refreshing item data"), unless it leaves one out (art shared with another item, or no category).', '', ...c.added.map(line), '');
  }
  if (c.announcedNew.length) {
    out.push(`### Announced, not in the game yet (${c.announcedNew.length})`, '', "poe2db shows them with the announcement's picture: a refresh can't take them until the patch is out.", '', ...c.announcedNew.map(line), '');
  }
  if (c.reworked.length) {
    out.push(
      `### In the game now, listed as announced (${c.reworked.length})`,
      '',
      "Most likely changed for the patch: poe2db lists them only with the announcement's picture. A refresh now would find them gone and stop to ask whether to drop them. Don't: wait until they're back with the game's art.",
      '',
      ...c.reworked.map(line),
      '',
    );
  }
  if (c.gone.length) {
    out.push(`### In the game, no longer on poe2db (${c.gone.length})`, '', 'A refresh stops on these until each is renamed (`--rename`) or dropped (`--drop`).', '', ...c.gone.map(line), '');
  }
  return out.join('\n');
}

/** Reads the pages and compares; the exit code. `deps`: fetch (as fetchRetry's), items, where the report goes and where lines go, for the tests. */
export async function main(argv, env, deps = {}) {
  const log = deps.log ?? ((line) => console.log(line));
  const get = deps.get ?? (async (url) => (await fetchRetry(url)).text());
  const items = deps.items ?? JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const write = deps.write ?? ((file, text) => writeFileSync(file, text));
  const output = deps.output ?? ((line) => env.GITHUB_OUTPUT && appendFileSync(env.GITHUB_OUTPUT, `${line}\n`));
  const reportFile = argv[0];
  if (!reportFile) {
    log('Usage: node scripts/items-watch.mjs <report file>');
    return 2;
  }
  /** A page, or null when poe2db didn't answer (said, as a day it couldn't read). */
  const read = async (url) => {
    try {
      return await get(url);
    } catch (e) {
      log(`::warning::The new-items watch couldn't read poe2db: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };
  const html = await read(SOURCE);
  const gemHtml = html === null ? null : await read(GEM_SOURCE);
  if (html === null || gemHtml === null) {
    output('found=false');
    return 0;
  }
  try {
    const uniques = uniqueEntries(html);
    const gems = gemEntries(gemHtml);
    if (uniques.length < LEAST_UNIQUES) throw new LayoutChanged(`only ${uniques.length} uniques read from ${SOURCE}`);
    if (gems.length < LEAST_GEMS) throw new LayoutChanged(`only ${gems.length} lineage gems read from ${GEM_SOURCE}`);
    const tried = [];
    for (const e of uniques.filter((u) => u.img).slice(0, ITEM_PAGES)) {
      const page = await read(`https://poe2db.tw/us/${e.slug}`);
      if (page === null) {
        output('found=false');
        return 0;
      }
      tried.push(e.name);
      if (pageReads(page, e.name)) break;
      if (tried.length === ITEM_PAGES) throw new LayoutChanged(`no item's own page showed its name and picture (${tried.join(', ')})`);
    }
    const c = compare(items, uniques, gems, announcedEntries(html));
    const report = reportOf(c);
    const fingerprint = fingerprintOf(c);
    log(`poe2db: ${uniques.length} uniques, ${new Set(gems.map((g) => g.name)).size} lineage gems.`);
    log(`New with the game's art: ${c.added.length}; announced, new: ${c.announcedNew.length}; reworked: ${c.reworked.length}; gone: ${c.gone.length} (${fingerprint}).`);
    if (report) write(reportFile, report);
    output(`fingerprint=${fingerprint}`);
    output(`found=${report ? 'true' : 'false'}`);
    return 0;
  } catch (e) {
    // (Not a failed run: the workflow hands it to Claude, who mends the reading.)
    const why = e instanceof LayoutChanged ? `poe2db's layout changed: ${e.message}` : `the watch broke: ${e instanceof Error ? e.stack ?? e.message : String(e)}`;
    log(`::warning::The new-items watch can't read poe2db (${why.split('\n')[0]}); Claude is asked to mend it.`);
    output('broken=true');
    output(`why=${why.replace(/\s+/g, ' ').slice(0, 1000)}`);
    output('found=false');
    return 0;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2), process.env);
