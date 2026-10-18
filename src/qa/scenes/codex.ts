// The codex, opened from the start page (#codex): empty, part filled, an
// item open, and its Delve and Achievements pages.

import { DELVE_RULESET } from '../../lib/delve.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import type { Built, Scene, Step } from '../scene.ts';

function filled(steps: Step[] = []): Built {
  const runs: DelveRun[] = [8, 14, 27, 19, 33, 23, 41].map((depth, i) => ({ id: 2000 + i, at: 2000 + i, depth, players: i % 3 ? 1 : 3, ruleset: DELVE_RULESET, mixed: false, ...(i % 3 ? {} : { perished: [depth] }) }));
  return { state: null, hash: '#codex', met: 140, runs, steps };
}

const codex = (key: string, label: string, build: () => Built): Scene => ({ key: `codex/${key}`, screen: 'codex', group: 'Codex', label, seats: [{ mode: 'none', me: null }], build });

export function codexScenes(): Scene[] {
  return [
    codex('empty', 'Nothing met yet', () => ({ state: null, hash: '#codex', met: [] })),
    codex('collection', 'The collection, part filled', () => filled()),
    codex('item', 'An item open', () => filled([{ click: '.tile' }])),
    codex('delve', 'The Delve page', () => filled([{ click: '#codex-tab-delve' }])),
    codex('feats', 'The Achievements page', () => filled([{ click: '#codex-tab-feats' }])),
  ];
}
