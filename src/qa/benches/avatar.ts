// The player's avatar (components/Avatar.svelte): its colours, its sizes
// across the game, the creator's ring, offline, and the turn face down when
// a player answers wrong.

import type { PieceBench } from '../bench.ts';
import { PALETTE, RUBY } from '../../lib/palette.ts';

export const avatar: PieceBench = {
  kind: 'piece',
  key: 'avatar',
  label: 'Player avatar',
  about: "A player's token: their colour, the creator's ring, offline and face down.",
  files: ['src/components/Avatar.svelte', 'src/components/VerdictSign.svelte', 'src/lib/fx/aura.ts'],
  controls: [
    {
      kind: 'choice',
      key: 'name',
      label: 'Name',
      default: 'Kalguur',
      options: [
        { value: 'Kalguur', label: 'Kalguur' },
        { value: 'Una of the Vaal', label: 'Una of the Vaal' },
        { value: 'Ángel', label: 'Ángel (an accent)' },
        { value: 'zoe_arcana', label: 'zoe_arcana (the creator)' },
        { value: '', label: 'No name yet' },
      ],
    },
    { kind: 'range', key: 'hue', label: 'Colour', min: 0, max: PALETTE.length - 1, default: 0 },
    { kind: 'range', key: 'size', label: 'Size', min: 16, max: 96, default: 36, unit: 'px' },
    { kind: 'toggle', key: 'named', label: 'Its name beside it', default: true, view: true },
    { kind: 'toggle', key: 'dim', label: 'Offline', default: false },
    { kind: 'toggle', key: 'wrong', label: 'Face down (answered wrong)', default: false },
  ],
  states: [
    { label: 'A player', values: {} },
    { label: 'Offline', values: { dim: true } },
    { label: 'Answered wrong', values: { wrong: true } },
    { label: 'The creator', values: { name: 'zoe_arcana', hue: RUBY } },
    { label: 'The creator, answered wrong', values: { name: 'zoe_arcana', hue: RUBY, wrong: true } },
    { label: 'Beside an answer (22)', values: { size: 22 } },
    { label: 'In the lobby (32)', values: { size: 32, name: 'Una of the Vaal', hue: 1 } },
    { label: 'Taking a turn (56)', values: { size: 56, hue: 2 } },
  ],
  actions: [{ key: 'turn', label: 'Turn over', hint: 'face down, or back up' }],
  view: () => import('./AvatarView.svelte'),
};
