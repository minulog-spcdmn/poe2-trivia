// The game's buttons (.btn in app.css): plain, gold, crimson and ghost, at
// each size, and disabled. Their gradients are dithered (--dither-step), so a
// wide one, the start page's New game, shows no bands.

import type { PieceBench } from '../bench.ts';

export const buttons: PieceBench = {
  kind: 'piece',
  key: 'buttons',
  label: 'Buttons',
  about: 'The game’s buttons: plain, gold, crimson and ghost, at each size, wide as New game or as wide as their words, and disabled. Hover and press them.',
  files: ['src/app.css', 'src/assets/dither-step.png'],
  cell: 320,
  // (The gold button's embers smoulder on their own.)
  moves: true,
  controls: [
    {
      kind: 'choice',
      key: 'look',
      label: 'Kind',
      options: [
        { value: 'primary', label: 'Gold' },
        { value: 'plain', label: 'Plain' },
        { value: 'danger', label: 'Crimson' },
        { value: 'ghost', label: 'Ghost' },
      ],
      default: 'primary',
    },
    {
      kind: 'choice',
      key: 'size',
      label: 'Size',
      options: [
        { value: 'small', label: 'Small' },
        { value: 'normal', label: 'Normal' },
        { value: 'big', label: 'Big' },
      ],
      default: 'big',
    },
    { kind: 'toggle', key: 'wide', label: 'Full width (New game’s)', default: true },
    { kind: 'toggle', key: 'disabled', label: 'Disabled', default: false },
  ],
  states: [
    { label: 'New game', values: {} },
    { label: 'Plain', values: { look: 'plain', size: 'normal', wide: false } },
    { label: 'Plain, wide', values: { look: 'plain' } },
    { label: 'Crimson', values: { look: 'danger', size: 'normal', wide: false } },
    { label: 'Crimson, wide', values: { look: 'danger' } },
    { label: 'Ghost', values: { look: 'ghost', size: 'small', wide: false } },
    { label: 'Gold, disabled', values: { size: 'normal', wide: false, disabled: true } },
  ],
  view: () => import('./ButtonsView.svelte'),
};
