// Delve's rules block (components/DelveRules.svelte: the descent drawn
// beside the finds) in a rules card as the lobby shows it, at a phone's, a
// tablet's and a desktop's card width side by side, for any deepest depth
// and last run, alone or together, and the finds met. Walk down goes a
// depth deeper every 180 ms.

import type { Control, PieceBench, Values } from '../bench.ts';
import { FINDS_IN_ORDER } from '../../lib/delve.ts';
import { FIND_TEXT } from '../../lib/difficultyText.ts';

const FINDS = FINDS_IN_ORDER.map((f) => f.kind);
/** The finds met, each a switch (`met.azurite`). */
const met = (...kinds: string[]): Values => Object.fromEntries(FINDS.map((k) => [`met.${k}`, kinds.includes(k)]));
const ALL = met(...FINDS);

export const descent: PieceBench = {
  kind: 'piece',
  key: 'descent',
  label: 'The descent',
  about: "Delve's rules block in the lobby's rules card, at a phone's, a tablet's and a desktop's width, for any records.",
  files: ['src/components/DelveRules.svelte', 'src/components/DelveLadder.svelte', 'src/lib/ouroborosArt.ts'],
  controls: [
    { kind: 'range', key: 'best', label: 'Deepest (0: no run yet)', min: 0, max: 300, default: 46 },
    { kind: 'range', key: 'last', label: 'Last run (0: none)', min: 0, max: 300, default: 20 },
    { kind: 'toggle', key: 'together', label: 'Runs together (co-op)', default: false },
    ...FINDS.map((k): Control => ({ kind: 'toggle', key: `met.${k}`, label: `Met ${FIND_TEXT[k].name}`, default: true })),
    {
      kind: 'choice',
      key: 'width',
      label: 'Card width',
      default: 'all',
      view: true,
      options: [
        { value: 'all', label: 'All three' },
        { value: 'phone', label: 'Phone (281 px)' },
        { value: 'tablet', label: 'Tablet (383 px)' },
        { value: 'desktop', label: 'Desktop (483 px)' },
      ],
    },
    {
      kind: 'choice',
      key: 'ouro',
      label: 'Ouroboros',
      default: '',
      view: true,
      options: [
        { value: '', label: 'By state' },
        { value: 'filled', label: 'Filled' },
        { value: 'outline', label: 'Outline' },
      ],
    },
  ],
  // Depths as the records keep them (shown one less).
  states: [
    { label: 'No runs', values: { best: 0, last: 0, ...met() } },
    { label: 'A best', values: { best: 38, last: 0, ...met('dynamite') } },
    { label: 'Best and last run', values: { best: 46, last: 21, ...ALL } },
    { label: 'Best and last run, together', values: { best: 46, last: 21, together: true, ...ALL } },
    { label: 'Last run at the best', values: { best: 46, last: 46, ...ALL } },
    { label: 'All ten zones', values: { best: 96, last: 62, ...ALL } },
    { label: 'Past 100', values: { best: 216, last: 0, ...ALL } },
    { label: 'Past 100 and last run', values: { best: 216, last: 31, ...ALL } },
    { label: 'Both past 100', values: { best: 216, last: 150, ...ALL } },
  ],
  actions: [{ key: 'walk', label: 'Walk down', hint: 'a depth deeper every 180 ms; again, or moving Deepest, stops it' }],
  // Side by side, each state's phone card (281 px, and its padding) needs the room.
  cell: 340,
  view: () => import('./DescentView.svelte'),
};
