// The codex, opened from the start page (#codex): empty, part filled (as a
// table too, sorted), an item open, erased, and its Delve (with runs and
// without) and Achievements pages.
// And the codex that never came (the Wi-Fi gone as it was fetched).

import { DELVE_RULESET } from '../../lib/delve.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import type { Built, Scene, Step } from '../scene.ts';

function filled(steps: Step[] = [], depths = [8, 14, 27, 19, 33, 23, 41]): Built {
  const runs: DelveRun[] = depths.map((depth, i) => ({ id: 2000 + i, at: 2000 + i, depth, players: i % 3 ? 1 : 3, ruleset: DELVE_RULESET, mixed: false, ...(i % 3 ? {} : { perished: [depth] }) }));
  return { state: null, hash: '#codex', met: 140, runs, steps };
}

const codex = (key: string, label: string, build: () => Built): Scene => ({ key: `codex/${key}`, screen: 'codex', group: 'Codex', label, seats: [{ mode: 'none', me: null }], build });

export function codexScenes(): Scene[] {
  return [
    codex('empty', 'Nothing met yet', () => ({ state: null, hash: '#codex', met: [] })),
    codex('collection', 'The collection, part filled', () => filled()),
    // The table, sorted once by its second column a moment in (the rows on screen sliding to their new places); its headings sort it again.
    codex('table', 'The collection as a table: sorted by a heading', () => filled([{ wait: 600 }, { click: '.collection .seg button:last-child' }, { wait: 1400 }, { click: '.ledger th:nth-child(2) button' }])),
    codex('item', 'An item open', () => filled([{ click: '.tile' }])),
    // Its tabs turned a moment apart, the line under the title rising with each page.
    codex('tabs', 'Its tabs turned, one after another', () =>
      filled([{ wait: 1400 }, { click: '#codex-tab-delve' }, { wait: 1800 }, { click: '#codex-tab-feats' }, { wait: 1800 }, { click: '#codex-tab-items' }]),
    ),
    // A category picked, then another: the gold edge easing from one to the next.
    codex('category', 'A category picked, then another', () => filled([{ wait: 1400 }, { click: 'button.cat' }, { wait: 1600 }, { click: 'button.cat:not(.on)' }])),
    // An item drawn more than one way, its art looked at in turn: the tooltip fading in with each. (Its tile, far down the collection, waited for.)
    codex('variant', 'An item drawn more than one way: its art in turn', () => ({
      ...filled([{ wait: 1500 }, { click: 'button.tile[aria-label^="Grand Spectrum"]' }, { wait: 1600 }, { click: '.variants button:not(.on)' }, { wait: 1600 }, { click: '.variants button:not(.on)' }]),
      met: 190,
    })),
    // Asked, then erased: the blank codex's plate rising in as a turned page. (The frame's storage is its own, cleared as it closes.)
    codex('erase', 'Erasing it: asked, then erased', () => filled([{ wait: 600 }, { click: 'footer.end .btn.danger' }, { wait: 1600 }, { click: '.confirm .btn.danger' }])),
    codex('delve', 'The Delve page', () => filled([{ click: '#codex-tab-delve' }])),
    codex('delve-none', 'The Delve page, never delved', () => filled([{ click: '#codex-tab-delve' }], [])),
    // More runs than its short list: all of them shown (the new rows fading in), then the short list again from the button, which stays where it was.
    codex('runs', 'The Delve page: every run shown, then the latest again', () =>
      filled(
        [
          { click: '#codex-tab-delve' },
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
      ),
    ),
    codex('feats', 'The Achievements page', () => filled([{ click: '#codex-tab-feats' }])),
    codex('delve-empty', 'The Delve page, no run yet', () => ({ state: null, hash: '#codex', met: 40, steps: [{ click: '#codex-tab-delve' }] })),
    // Its chunk lost: the Reload, as each try shows it while the connection is down (lib/chunkRetry.ts).
    codex('lost', "Didn't come: the connection dropped", () => ({ state: null, hash: '#codex', lost: 'Codex' })),
    // The swap between screens (App.svelte), back out: the Codex closed.
    { ...codex('to-home', 'Closed: back to the start page', () => filled([{ wait: 1600 }, { click: 'button[aria-label="Close the codex"]' }])), group: 'Moving between screens' },
  ];
}
