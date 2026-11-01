// The codex, opened from the start page (#codex): empty, part filled, an
// item open, and its Delve (with runs and without) and Achievements pages.
// And the codex that never came (the Wi-Fi gone as it was fetched).

import { DELVE_RULESET } from '../../lib/delve.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import type { Built, Scene, Step } from '../scene.ts';

function filled(steps: Step[] = [], depths = [8, 14, 27, 19, 33, 23, 41]): Built {
  const runs: DelveRun[] = depths.map((depth, i) => ({ id: 2000 + i, at: 2000 + i, depth, players: i % 3 ? 1 : 3, ruleset: DELVE_RULESET, mixed: false, ...(i % 3 ? {} : { perished: [depth] }) }));
  return { state: null, hash: '#codex', met: 140, runs, steps };
}

/** Uniques whose tooltips have "ffi" in a line. */
const FFI = ['Prism Guardian', 'Heart of the Well', 'The Infinite Pursuit', "Zerphi's Genesis"];
/** The codex with only `name` met, found by its search (a tile far down is drawn in later) and its card open. */
const ffi = (name: string): Built => ({ state: null, hash: '#codex', met: [name], steps: [{ fill: 'input.search', text: name }, { click: `button.tile[aria-label^="${name}"]` }] });

const codex = (key: string, label: string, build: () => Built): Scene => ({ key: `codex/${key}`, screen: 'codex', group: 'Codex', label, seats: [{ mode: 'none', me: null }], build });

export function codexScenes(): Scene[] {
  return [
    codex('empty', 'Nothing met yet', () => ({ state: null, hash: '#codex', met: [] })),
    codex('collection', 'The collection, part filled', () => filled()),
    codex('item', 'An item open', () => filled([{ click: '.tile' }])),
    // Tooltips with "ffi" in a line (Efficiency, suffix, afflicted): Fontin's ffi ligature has no outline, so ItemDetails sets none (#376).
    {
      ...codex('item-ffi', 'An item open, “ffi” in its tooltip', () => ffi('Prism Guardian')),
      controls: [{ kind: 'choice', key: 'item', label: 'Item', default: 'Prism Guardian', options: FFI.map((n) => ({ value: n, label: n })) }],
      states: FFI.map((n) => ({ label: n, values: { item: n } })),
      build: (v) => ffi(String(v?.item ?? 'Prism Guardian')),
    },
    codex('delve', 'The Delve page', () => filled([{ click: '#codex-tab-delve' }])),
    codex('delve-none', 'The Delve page, never delved', () => filled([{ click: '#codex-tab-delve' }], [])),
    codex('feats', 'The Achievements page', () => filled([{ click: '#codex-tab-feats' }])),
    codex('delve-empty', 'The Delve page, no run yet', () => ({ state: null, hash: '#codex', met: 40, steps: [{ click: '#codex-tab-delve' }] })),
    // Its chunk lost: the Reload, as each try shows it while the connection is down (lib/chunkRetry.ts).
    codex('lost', "Didn't come: the connection dropped", () => ({ state: null, hash: '#codex', lost: 'Codex' })),
    // The swap between screens (App.svelte), back out: the Codex closed.
    { ...codex('to-home', 'Closed: back to the start page', () => filled([{ wait: 1600 }, { click: 'button[aria-label="Close the codex"]' }])), group: 'Moving between screens' },
  ];
}
