// The privacy page over the game (components/LegalSheet.svelte), as an
// iPhone's home-screen app opens it from a room (lib/legalSheet.svelte.ts):
// the page in a frame under its bar back to the game. Back to the game sinks
// it away, and it rises again a moment later, to watch both ways.

import type { PieceBench } from '../bench.ts';

export const legal: PieceBench = {
  kind: 'piece',
  key: 'legal',
  label: 'Privacy sheet',
  about: "The privacy page over the game, as an iPhone's home-screen app opens it: rising in, its bar back to the game, sinking away.",
  files: ['src/components/LegalSheet.svelte', 'src/lib/legalSheet.svelte.ts', 'src/lib/dialogIn.ts'],
  cell: 480,
  controls: [{ kind: 'toggle', key: 'open', label: 'Open', default: true }],
  states: [{ label: 'Open', values: { open: true } }],
  view: () => import('./LegalView.svelte'),
};
