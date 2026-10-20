// The player's avatar (components/Avatar.svelte): its colours, its sizes
// across the game, the creator's ring, offline, and the turn face down when
// a player answers wrong; and a class's sigil worn behind the letter.

import type { PieceBench } from '../bench.ts';
import { PALETTE, RUBY } from '../../lib/palette.ts';
import { CLASSES, className } from '../../lib/classSigils.ts';

export const avatar: PieceBench = {
  kind: 'piece',
  key: 'avatar',
  label: 'Player avatar',
  about: "A player's token: their colour, a class's sigil, the creator's ring, offline and face down.",
  files: ['src/components/Avatar.svelte', 'src/lib/classSigils.ts', 'src/components/VerdictSign.svelte', 'src/lib/fx/aura.ts'],
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
    {
      kind: 'choice',
      key: 'sigil',
      label: 'Class sigil',
      default: '',
      options: [{ value: '', label: 'None' }, ...CLASSES.map((c) => ({ value: c, label: className(c) }))],
    },
    { kind: 'range', key: 'hue', label: 'Colour', min: 0, max: PALETTE.length - 1, default: 0 },
    { kind: 'range', key: 'size', label: 'Size', min: 16, max: 96, default: 36, unit: 'px' },
    { kind: 'toggle', key: 'every', label: 'Every class at once', default: false },
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
    { label: 'Every class (56)', values: { every: true, size: 56, hue: 3 } },
    { label: 'Every class in the lobby (32)', values: { every: true, size: 32, hue: 3 } },
    { label: 'Every class beside an answer (22)', values: { every: true, size: 22, hue: 3 } },
    { label: 'A sigil, offline', values: { sigil: 'witch', dim: true } },
    { label: 'A sigil, answered wrong', values: { sigil: 'witch', wrong: true } },
    { label: 'A sigil on the creator', values: { sigil: 'sorceress', name: 'zoe_arcana', hue: RUBY } },
  ],
  actions: [{ key: 'turn', label: 'Turn over', hint: 'face down, or back up' }],
  view: () => import('./AvatarView.svelte'),
};
