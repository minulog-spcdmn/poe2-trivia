// The codex, opened from the start page (#codex): its collection, empty or
// part filled, and what's done in it (as a table, sorted; an item open; its
// tabs turned; a category picked; an item drawn more ways; erased), and its
// Delve (with runs and without) and Achievements pages; kept with a passkey
// or not.
// And the codex that never came (the Wi-Fi gone as it was fetched).

import type { Answer } from '../../lib/codex.ts';
import { DELVE_RULESET } from '../../lib/delve.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import type { Control, Values } from '../bench.ts';
import { id } from '../build/people.ts';
import type { Built, Scene, Step } from '../scene.ts';

function filled(steps: Step[] = [], depths = [8, 14, 27, 19, 33, 23, 41]): Built {
  const runs: DelveRun[] = depths.map((depth, i) => ({ id: 2000 + i, at: 2000 + i, depth, players: i % 3 ? 1 : 3, ruleset: DELVE_RULESET, mixed: false, ...(i % 3 ? {} : { perished: [depth] }) }));
  return { state: null, hash: '#codex', met: 140, runs, steps };
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
const MET = {
  kind: 'choice',
  key: 'met',
  label: 'Met',
  options: [
    { value: 'part', label: 'Part of it' },
    { value: 'none', label: 'Nothing yet' },
  ],
  default: 'part',
} satisfies Control;
/** Kept with a passkey (lib/backup/), or not. */
const BACKED: Control = {
  kind: 'choice',
  key: 'backed',
  label: 'Backup',
  options: [
    { value: 'off', label: 'Not kept' },
    { value: 'on', label: 'Kept with a passkey' },
  ],
  default: 'off',
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

function pages(v: Values = {}): Built {
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
      controls: [PAGE, RUNS],
      states: [
        { label: 'The Delve page', values: {} },
        { label: 'The Delve page, never delved', values: { runs: 'none' }, key: 'codex/delve-none', listed: false },
        { label: 'The Delve page: every run shown, then the latest again', values: { runs: 'many' }, key: 'codex/runs', listed: false },
        { label: 'The Delve page: finds taken, a vein caved in on strike 1 and one on strike 2', values: { runs: 'finds' }, key: 'codex/delve-finds', listed: false },
        { label: 'The Achievements page', values: { page: 'feats' }, key: 'codex/feats', listed: false },
        { label: 'The Delve page, no run yet', values: { runs: 'new' }, key: 'codex/delve-empty', listed: false },
      ],
      build: pages,
    },
    {
      // Kept with a passkey or not (lib/backup/): an empty codex's way back for a browser that lost its progress, under Begin the hunt;
      // a full one's way to keep it safe beside Erase codex, at its foot, or the words that it is. (The frame keeps nothing: its buttons act it out.)
      ...codex('backup', 'Kept with a passkey, or not', () => ({ state: null, hash: '#codex', met: [], backup: { on: false } })),
      // (Empty first: the way back is what a browser that lost its progress meets.)
      controls: [BACKED, { ...MET, default: 'none' }],
      states: [
        { label: 'Empty: the way back', values: { backed: 'off', met: 'none' } },
        { label: 'Part filled, not kept: the way to keep it', values: { backed: 'off', met: 'part' } },
        { label: 'Part filled, kept', values: { backed: 'on', met: 'part' }, listed: false },
      ],
      build: (v = {}): Built => {
        const backup = { on: v.backed === 'on' };
        // (At its foot, where the way to keep it is.)
        return v.met === 'none' ? { state: null, hash: '#codex', met: [], backup } : { ...filled([{ wait: 1400 }, { scroll: 'footer.end' }]), backup };
      },
    },
    // Its chunk lost: the Reload, as each try shows it while the connection is down (lib/chunkRetry.ts).
    codex('lost', "Didn't come: the connection dropped", () => ({ state: null, hash: '#codex', lost: 'Codex' })),
    // The swap between screens (App.svelte), back out: the Codex closed.
    { ...codex('to-home', 'Closed: back to the start page', () => filled([{ wait: 1600 }, { click: 'button[aria-label="Close the codex"]' }])), group: 'Moving between screens' },
  ];
}
