// The codex, opened from the start page (#codex): empty, part filled, an
// item open, and its Delve (with runs and without) and Achievements pages.
// And the codex that never came (the Wi-Fi gone as it was fetched).

import { DELVE_RULESET } from '../../lib/delve.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import { FOSSILS } from '../../lib/fossils.ts';
import { serializeFossils, type FossilStore } from '../../lib/fossilStore.ts';
import type { Built, Scene, Step } from '../scene.ts';

function filled(steps: Step[] = [], depths = [8, 14, 27, 19, 33, 23, 41]): Built {
  const runs: DelveRun[] = depths.map((depth, i) => ({ id: 2000 + i, at: 2000 + i, depth, players: i % 3 ? 1 : 3, ruleset: DELVE_RULESET, mixed: false, ...(i % 3 ? {} : { perished: [depth] }) }));
  return { state: null, hash: '#codex', met: 140, runs, steps };
}

/**
 * The first `n` fossils found, a few days apart, the rare ones mixed in from
 * the fourth on (so 17 holds three of them), one of them in a run together.
 */
function fossils(n: number): Record<string, string> {
  const commons = FOSSILS.filter((f) => !f.rare);
  const rares = FOSSILS.filter((f) => f.rare);
  const order = n >= FOSSILS.length ? FOSSILS : [...commons.slice(0, 3), ...rares.slice(0, 3), ...commons.slice(3), ...rares.slice(3)];
  const found: FossilStore['found'] = {};
  for (const [i, f] of order.slice(0, n).entries()) found[f.id] = { at: Date.UTC(2026, 8, 1) + i * 3 * 86_400_000, depth: f.rare ? 28 + i : 7 + i, ...(i === 1 ? { together: true } : {}) };
  return { fossils: serializeFossils({ found }) };
}

const codex = (key: string, label: string, build: () => Built): Scene => ({ key: `codex/${key}`, screen: 'codex', group: 'Codex', label, seats: [{ mode: 'none', me: null }], build });

export function codexScenes(): Scene[] {
  return [
    codex('empty', 'Nothing met yet', () => ({ state: null, hash: '#codex', met: [] })),
    codex('collection', 'The collection, part filled', () => filled()),
    codex('item', 'An item open', () => filled([{ click: '.tile' }])),
    codex('delve', 'The Delve page', () => filled([{ click: '#codex-tab-delve' }])),
    codex('delve-none', 'The Delve page, never delved', () => filled([{ click: '#codex-tab-delve' }], [])),
    // Its fossils (components/codex/DelveFossils.svelte): one, some (a found one chosen, its tooltip up), all 25.
    codex('fossils-1', 'The Delve page, the first fossil', () => ({ ...filled([{ click: '#codex-tab-delve' }]), stored: fossils(1) })),
    codex('fossils-some', 'The Delve page, 17 fossils, one chosen', () => ({ ...filled([{ click: '#codex-tab-delve' }, { click: '.fossils .cell.got.rare' }]), stored: fossils(17) })),
    codex('fossils-all', 'The Delve page, all 25 fossils', () => ({ ...filled([{ click: '#codex-tab-delve' }]), stored: fossils(25) })),
    codex('feats', 'The Achievements page', () => filled([{ click: '#codex-tab-feats' }])),
    codex('delve-empty', 'The Delve page, no run yet', () => ({ state: null, hash: '#codex', met: 40, steps: [{ click: '#codex-tab-delve' }] })),
    // Its chunk lost: the Reload, as each try shows it while the connection is down (lib/chunkRetry.ts).
    codex('lost', "Didn't come: the connection dropped", () => ({ state: null, hash: '#codex', lost: 'Codex' })),
    // The swap between screens (App.svelte), back out: the Codex closed.
    { ...codex('to-home', 'Closed: back to the start page', () => filled([{ wait: 1600 }, { click: 'button[aria-label="Close the codex"]' }])), group: 'Moving between screens' },
  ];
}
