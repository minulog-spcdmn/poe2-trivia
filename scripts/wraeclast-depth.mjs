#!/usr/bin/env node
// The Wraeclast run's depth measure. Reads poe.ninja's PoE2 economy JSON for
// the current league (every unique page), matches each listing to an id in
// src/data/items.json by name and counts its trade listings. Within each of
// the 10 categories in items.json, the most listed 30% are known, the next
// 40% obscure and the rest forgotten; an item poe.ninja doesn't list is
// forgotten. Writes src/data/wraeclastDepth.json (generated, never
// hand-edited).
//
// Lineage gems trade on the Currency Exchange, so poe.ninja shows no
// listings for them; within that category they rank by units traded there
// (poe.ninja's volume over its price), from the same poe.ninja JSON.
//
// If poe.ninja can't be reached or read, it writes nothing and says so; it
// never falls back to another source.
//
// Usage: npm run wraeclast-depth [-- --split 30/40/30] [--league "Name"]
// Behind a proxy on Node 22+: NODE_USE_ENV_PROXY=1 npm run wraeclast-depth

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITEMS_FILE = path.join(ROOT, 'src', 'data', 'items.json');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'wraeclastDepth.json');
const API = 'https://poe.ninja/poe2/api';

/** poe.ninja's unique pages, listed from trade stashes. */
const STASH_TYPES = [
  'UniqueWeapons',
  'UniqueArmours',
  'UniqueAccessories',
  'UniqueFlasks',
  'UniqueCharms',
  'UniqueJewels',
  'UniqueSanctumRelics',
  'UniqueTablets',
];
/** Its lineage gem page, from the Currency Exchange. */
const EXCHANGE_TYPES = ['LineageSupportGems'];

function args() {
  const a = process.argv.slice(2);
  const out = { split: [30, 40, 30], league: null };
  for (let i = 0; i < a.length; i++) {
    const [k, inline] = a[i].split('=');
    const v = inline ?? a[++i];
    if (k === '--split') {
      const parts = String(v).split(/[/,]/).map(Number);
      if (parts.length !== 3 || parts.some((n) => !(n >= 0)) || parts.reduce((s, n) => s + n, 0) !== 100)
        throw new Error(`--split needs three percentages adding to 100, like 30/40/30 (got ${v})`);
      out.split = parts;
    } else if (k === '--league') out.league = v;
    else throw new Error(`Unknown argument ${a[i]}`);
  }
  return out;
}

/** A name as both sides spell it: straight apostrophes, no case. */
const norm = (s) => s.replace(/[‘’]/g, "'").trim().toLowerCase();

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: { 'user-agent': 'poe2.quest wraeclast-depth' } });
  } catch (e) {
    throw new Error(`couldn't reach ${url} (${e.cause?.code ?? e.message})`);
  }
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url} didn't answer with JSON`);
  }
}

async function main() {
  const { split, league: wanted } = args();
  const items = JSON.parse(await readFile(ITEMS_FILE, 'utf8'));

  const state = await getJson(`${API}/data/index-state`);
  const leagues = state.economyLeagues ?? [];
  const league = wanted
    ? leagues.find((l) => l.name === wanted || l.url === wanted)
    : leagues.find((l) => !l.hardcore && l.name !== 'Standard');
  if (!league) throw new Error(`no ${wanted ? `league "${wanted}"` : 'current league'} in poe.ninja's index`);
  const version = state.snapshotVersions?.find((s) => s.url === league.url)?.version ?? 'current';
  const q = (type) => `?league=${encodeURIComponent(league.name)}&type=${type}`;

  /** Listings (or, for lineage gems, units traded) by normalised name. */
  const counts = new Map();
  const add = (name, n) => counts.set(norm(name), (counts.get(norm(name)) ?? 0) + n);
  let lines = 0;
  for (const type of STASH_TYPES) {
    const page = await getJson(`${API}/economy/stash/${version}/item/overview${q(type)}`);
    if (!Array.isArray(page.lines)) throw new Error(`poe.ninja's ${type} page has no lines`);
    for (const l of page.lines) add(l.name, l.listingCount ?? 0);
    lines += page.lines.length;
  }
  for (const type of EXCHANGE_TYPES) {
    const page = await getJson(`${API}/economy/exchange/${version}/overview${q(type)}`);
    if (!Array.isArray(page.lines) || !Array.isArray(page.items))
      throw new Error(`poe.ninja's ${type} page has no lines`);
    const names = new Map(page.items.map((it) => [it.id, it.name]));
    for (const l of page.lines) {
      const name = names.get(l.id);
      if (name && l.primaryValue > 0) add(name, (l.volumePrimaryValue ?? 0) / l.primaryValue);
    }
    lines += page.lines.length;
  }
  if (lines === 0) throw new Error(`poe.ninja lists nothing for ${league.name}`);

  const byCat = new Map();
  for (const it of items) {
    if (!byCat.has(it.category)) byCat.set(it.category, []);
    byCat.get(it.category).push(it);
  }

  const depth = {};
  const rows = [];
  let unlisted = 0;
  for (const [cat, list] of [...byCat].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ranked = list
      .map((it) => ({ it, n: counts.get(norm(it.name)) ?? 0 }))
      .sort((a, b) => b.n - a.n || a.it.name.localeCompare(b.it.name));
    const known = Math.round((list.length * split[0]) / 100);
    const obscure = Math.round((list.length * (split[0] + split[1])) / 100);
    const tally = { known: 0, obscure: 0, forgotten: 0 };
    let none = 0;
    ranked.forEach(({ it, n }, i) => {
      const d = n <= 0 ? 'forgotten' : i < known ? 'known' : i < obscure ? 'obscure' : 'forgotten';
      if (n <= 0) none++;
      depth[it.id] = d;
      tally[d]++;
    });
    unlisted += none;
    rows.push({ cat, total: list.length, ...tally, none });
  }

  const sorted = Object.fromEntries(Object.keys(depth).sort().map((k) => [k, depth[k]]));
  const out = {
    note:
      'Generated by scripts/wraeclast-depth.mjs (npm run wraeclast-depth) from poe.ninja; never hand-edited. ' +
      `Within each category the most listed ${split[0]}% are known, the next ${split[1]}% obscure, the rest forgotten; ` +
      'an item poe.ninja does not list is forgotten. Lineage gems rank by units traded on the Currency Exchange.',
    league: league.name,
    fetched: new Date().toISOString(),
    depth: sorted,
  };
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2) + '\n');

  const pad = (s, n) => String(s).padEnd(n);
  const pct = (a, b) => `${a} (${Math.round((100 * a) / b)}%)`;
  console.log(`poe.ninja, ${league.name} (${version}), split ${split.join('/')}`);
  console.log(`${pad('Category', 42)}${pad('items', 7)}${pad('known', 11)}${pad('obscure', 11)}${pad('forgotten', 11)}unlisted`);
  for (const r of rows)
    console.log(
      `${pad(r.cat, 42)}${pad(r.total, 7)}${pad(pct(r.known, r.total), 11)}${pad(pct(r.obscure, r.total), 11)}${pad(pct(r.forgotten, r.total), 11)}${r.none}`,
    );
  console.log(`${items.length} items, ${unlisted} unlisted on poe.ninja (forgotten). Wrote ${path.relative(ROOT, OUT_FILE)}.`);
}

main().catch((e) => {
  console.error(`wraeclast-depth: ${e.message}. Wrote nothing; poe.ninja is the only source.`);
  process.exit(1);
});
