// The codex, opened from the start page (#codex): its collection, empty or
// part filled, and what's done in it (as a table, sorted; an item open; its
// tabs turned; a category picked; an item drawn more ways; erased), and its
// Delve (with runs and without) and Achievements pages.
// And the codex that never came (the Wi-Fi gone as it was fetched).

import type { Answer } from '../../lib/codex.ts';
import { DELVE_RULESET } from '../../lib/delve.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import { FOSSILS } from '../../lib/fossils.ts';
import { serializeFossils, type FossilStore } from '../../lib/fossilStore.ts';
import type { Control, Values } from '../bench.ts';
import { id } from '../build/people.ts';
import type { Built, Scene, Step } from '../scene.ts';

function filled(steps: Step[] = [], depths = [8, 14, 27, 19, 33, 23, 41]): Built {
  const runs: DelveRun[] = depths.map((depth, i) => ({ id: 2000 + i, at: 2000 + i, depth, players: i % 3 ? 1 : 3, ruleset: DELVE_RULESET, mixed: false, ...(i % 3 ? {} : { perished: [depth] }) }));
  return { state: null, hash: '#codex', met: 140, runs, steps };
}

/**
 * The first `n` fossils found, a few days apart, the rare ones mixed in from
 * the fourth on (so 17 holds three of them), one of them in a run together;
 * `commons`: the 17 common ones alone, every square of the packing filled.
 */
function fossils(n: number, { commons = false } = {}): Record<string, string> {
  const common = FOSSILS.filter((f) => !f.rare);
  const rares = FOSSILS.filter((f) => f.rare);
  const order = commons ? common : n >= FOSSILS.length ? FOSSILS : [...common.slice(0, 3), ...rares.slice(0, 3), ...common.slice(3), ...rares.slice(3)];
  const found: FossilStore['found'] = {};
  for (const [i, f] of order.slice(0, n).entries()) found[f.id] = { at: Date.UTC(2026, 8, 1) + i * 3 * 86_400_000, depth: f.rare ? 28 + i : 7 + i, ...(i === 1 ? { together: true } : {}) };
  return { fossils: serializeFossils({ found }) };
}

/**
 * Finds taken alone, in one of filled's runs: a vein dug out, one caved in on
 * strike 1 and one on strike 2 (both counted caved in), a Flare Cache won and one missed.
 */
function findsLog(): Answer[] {
  const at = (t: number, name: string, ok: boolean, more: Partial<Answer>): Answer => ({ t, id: id(name), mode: 'name', ok, difficulty: 'cruel', race: false, depth: 20, run: 2001, ...more });
  return [
    at(1, 'Headhunter', true, { find: 'azurite', gained: 'wards' }),
    at(2, 'Mageblood', true, { find: 'azurite', gained: 'wards', strike: 2 }),
    at(3, "Kaom's Heart", false, { find: 'azurite', lives: 2, wards: 0 }),
    at(4, 'Death Rush', true, { find: 'azurite', gained: 'wards' }),
    at(5, 'Briarpatch', false, { find: 'azurite', strike: 2, buried: 1, lives: 2, wards: 0 }),
    at(6, 'Prism Guardian', true, { find: 'flare', gained: 'flares' }),
    at(7, 'Heart of the Well', false, { find: 'flare', lives: 1, wards: 0 }),
  ];
}

/** Uniques whose tooltips have "ffi" in a line. */
const FFI = ['Prism Guardian', 'Heart of the Well', 'The Infinite Pursuit', "Zerphi's Genesis"];
/** The codex with only `name` met, found by its search (a tile far down is drawn in later) and its card open. */
const ffi = (name: string): Built => ({ state: null, hash: '#codex', met: [name], steps: [{ fill: 'input.search', text: name }, { click: `button.tile[aria-label^="${name}"]` }] });

/** What's done in the collection once it shows. */
const SHOW: Control = {
  kind: 'choice',
  key: 'show',
  label: 'Then',
  options: [
    { value: 'as', label: 'Nothing' },
    { value: 'table', label: 'As a table, sorted' },
    { value: 'item', label: 'An item open' },
    { value: 'tabs', label: 'Its tabs turned' },
    { value: 'category', label: 'A category, then another' },
    { value: 'variant', label: 'An item drawn more ways' },
    { value: 'erase', label: 'Erased' },
    { value: 'ffi', label: 'An item with “ffi”' },
  ],
  default: 'as',
};
const MET: Control = {
  kind: 'choice',
  key: 'met',
  label: 'Met',
  options: [
    { value: 'part', label: 'Part of it' },
    { value: 'none', label: 'Nothing yet' },
  ],
  default: 'part',
};
const ITEM: Control = { kind: 'choice', key: 'item', label: 'The “ffi” item', default: 'Prism Guardian', options: FFI.map((n) => ({ value: n, label: n })) };

/** The steps for what's done in the collection. */
const SHOWN: Record<string, Step[]> = {
  as: [],
  // The table, sorted once by its second column a moment in (the rows on screen sliding to their new places); its headings sort it again.
  // (The table sits below the screen, so it's brought into view before the sort: the rows on screen slide.)
  table: [{ wait: 600 }, { click: '.collection .seg button:last-child' }, { wait: 1400 }, { scroll: '.ledger' }, { wait: 600 }, { click: '.ledger th:nth-child(2) button' }],
  item: [{ click: '.tile' }],
  // Its tabs turned a moment apart, the line under the title rising with each page.
  tabs: [{ wait: 1400 }, { click: '#codex-tab-delve' }, { wait: 1800 }, { click: '#codex-tab-feats' }, { wait: 1800 }, { click: '#codex-tab-items' }],
  // A category picked, then another: the gold edge easing from one to the next.
  category: [{ wait: 1400 }, { click: 'button.cat' }, { wait: 1600 }, { click: 'button.cat:not(.on)' }],
  // An item drawn more than one way, its art looked at in turn: the tooltip fading in with each. (Its tile, far down the collection, waited for.)
  variant: [{ wait: 1500 }, { click: 'button.tile[aria-label^="Grand Spectrum"]' }, { wait: 1600 }, { click: '.variants button:not(.on)' }, { wait: 1600 }, { click: '.variants button:not(.on)' }],
  // Asked, then erased: the blank codex's plate rising in as a turned page. (The frame's storage is its own, cleared as it closes.)
  erase: [{ wait: 600 }, { click: 'footer.end .btn.danger' }, { wait: 1600 }, { click: '.confirm .btn.danger' }],
};

function collection(v: Values = {}): Built {
  // Tooltips with "ffi" in a line (Efficiency, suffix, afflicted): Fontin's ffi ligature has no outline, so ItemDetails sets none (#376).
  if (v.show === 'ffi') return ffi(String(v.item ?? 'Prism Guardian'));
  const steps = SHOWN[String(v.show ?? 'as')] ?? [];
  if (v.met === 'none') return { state: null, hash: '#codex', met: [], ...(steps.length ? { steps } : {}) };
  // (More met, so Grand Spectrum's tile is among them.)
  return v.show === 'variant' ? { ...filled(steps), met: 190 } : filled(steps);
}

/** Which page, past the collection. */
const PAGE: Control = {
  kind: 'choice',
  key: 'page',
  label: 'Page',
  options: [
    { value: 'delve', label: 'Delve' },
    { value: 'feats', label: 'Achievements' },
  ],
  default: 'delve',
};
const RUNS: Control = {
  kind: 'choice',
  key: 'runs',
  label: 'Runs',
  options: [
    { value: 'seven', label: 'Seven' },
    { value: 'many', label: 'Sixteen: all shown, then the latest' },
    { value: 'finds', label: 'Seven, finds taken' },
    { value: 'none', label: 'None' },
    { value: 'new', label: 'None, and little met' },
  ],
  default: 'seven',
};
/**
 * Its fossils (components/codex/DelveFossils.svelte), beside the zones
 * reached: the 17 common ones in Bidwell's packing, the 8 rare ones together
 * beside it (under it on a phone upright), one not kept yet only its shape, a
 * kept one's tooltip beside it: none; one; some (a kept rare one's tooltip
 * up); every common one (the packing full, a tilted one's tooltip up); all 25.
 */
const FOSSILS_KEPT: Control = {
  kind: 'choice',
  key: 'fossils',
  label: 'Fossils',
  default: 'none',
  when: { page: ['delve'] },
  options: [
    { value: 'none', label: 'None' },
    { value: 'one', label: 'The first' },
    { value: 'some', label: '17, a rare one’s tooltip up' },
    { value: 'commons', label: 'Every common one, a tooltip up' },
    { value: 'all', label: 'All 25' },
  ],
};
/** How many each holds, and the slot whose tooltip a click brings up. */
const KEPT: Record<string, { stored: Record<string, string>; click?: string }> = {
  one: { stored: fossils(1) },
  some: { stored: fossils(17), click: '.fossils .cell.got.rare' },
  commons: { stored: fossils(17, { commons: true }), click: '.fossils .grid.common li:nth-child(5) .cell' },
  all: { stored: fossils(FOSSILS.length) },
};

function pages(v: Values = {}): Built {
  const built = runsShown(v);
  const kept = v.page === 'feats' ? undefined : KEPT[String(v.fossils ?? 'none')];
  if (!kept) return built;
  return { ...built, stored: { ...built.stored, ...kept.stored }, ...(kept.click ? { steps: [...(built.steps ?? []), { click: kept.click }] } : {}) };
}

/** The page with its runs as set. */
function runsShown(v: Values): Built {
  const tab: Step = { click: v.page === 'feats' ? '#codex-tab-feats' : '#codex-tab-delve' };
  if (v.runs === 'new') return { state: null, hash: '#codex', met: 40, steps: [tab] };
  if (v.runs === 'none') return filled([tab], []);
  // Finds taken alone, the page brought down to them.
  if (v.runs === 'finds') return { ...filled(v.page === 'feats' ? [tab] : [tab, { wait: 1200 }, { scroll: '[aria-labelledby="find-h-Alone"]' }]), log: findsLog() };
  if (v.runs !== 'many') return filled([tab]);
  // More runs than its short list: all of them shown (the new rows fading in), then the short list again from the button, which stays where it was.
  return filled(
    [
      tab,
      { wait: 1200 },
      { scroll: '.delve-page button.more' },
      { wait: 900 },
      { click: '.delve-page button.more' },
      { wait: 1400 },
      { scroll: '.delve-page button.more' },
      { wait: 900 },
      { click: '.delve-page button.more' },
    ],
    [8, 14, 27, 19, 33, 23, 41, 12, 36, 17, 29, 45, 21, 38, 16, 31],
  );
}

const codex = (key: string, label: string, build: () => Built): Scene => ({ key: `codex/${key}`, screen: 'codex', group: 'Codex', label, seats: [{ mode: 'none', me: null }], build });

export function codexScenes(): Scene[] {
  return [
    {
      ...codex('collection', 'The collection', () => collection()),
      controls: [SHOW, MET, ITEM],
      states: [
        { label: 'The collection, part filled', values: {} },
        { label: 'Nothing met yet', values: { met: 'none' }, key: 'codex/empty', listed: false },
        { label: 'The collection as a table: sorted by a heading', values: { show: 'table' }, key: 'codex/table', listed: false },
        { label: 'An item open', values: { show: 'item' }, key: 'codex/item', listed: false },
        { label: 'Its tabs turned, one after another', values: { show: 'tabs' }, key: 'codex/tabs', listed: false },
        { label: 'A category picked, then another', values: { show: 'category' }, key: 'codex/category', listed: false },
        { label: 'An item drawn more than one way: its art in turn', values: { show: 'variant' }, key: 'codex/variant', listed: false },
        { label: 'Erasing it: asked, then erased', values: { show: 'erase' }, key: 'codex/erase', listed: false },
        { label: 'An item open, “ffi” in its tooltip', values: { show: 'ffi' }, key: 'codex/item-ffi', listed: false },
        ...FFI.slice(1).map((n) => ({ label: `“ffi” in its tooltip: ${n}`, values: { show: 'ffi', item: n }, listed: false as const })),
      ],
      build: collection,
    },
    {
      ...codex('delve', 'The Delve and Achievements pages', () => pages()),
      controls: [PAGE, RUNS, FOSSILS_KEPT],
      states: [
        { label: 'The Delve page', values: {} },
        { label: 'The Delve page, never delved', values: { runs: 'none' }, key: 'codex/delve-none', listed: false },
        { label: 'The Delve page: every run shown, then the latest again', values: { runs: 'many' }, key: 'codex/runs', listed: false },
        { label: 'The Delve page: finds taken, a vein caved in on strike 1 and one on strike 2', values: { runs: 'finds' }, key: 'codex/delve-finds', listed: false },
        { label: 'The Achievements page', values: { page: 'feats' }, key: 'codex/feats', listed: false },
        { label: 'The Delve page, no run yet', values: { runs: 'new' }, key: 'codex/delve-empty', listed: false },
        { label: 'The Delve page, the first fossil', values: { fossils: 'one' }, key: 'codex/fossils-1', listed: false },
        { label: 'The Delve page, 17 fossils, one chosen', values: { fossils: 'some' }, key: 'codex/fossils-some', listed: false },
        { label: 'The Delve page, every common fossil', values: { fossils: 'commons' }, key: 'codex/fossils-commons', listed: false },
        { label: 'The Delve page, all 25 fossils', values: { fossils: 'all' }, key: 'codex/fossils-all', listed: false },
      ],
      build: pages,
    },
    // Its chunk lost: the Reload, as each try shows it while the connection is down (lib/chunkRetry.ts).
    codex('lost', "Didn't come: the connection dropped", () => ({ state: null, hash: '#codex', lost: 'Codex' })),
    // The swap between screens (App.svelte), back out: the Codex closed.
    { ...codex('to-home', 'Closed: back to the start page', () => filled([{ wait: 1600 }, { click: 'button[aria-label="Close the codex"]' }])), group: 'Moving between screens' },
  ];
}
