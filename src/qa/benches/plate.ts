// The plate behind a unique's name (components/NamePlate.svelte), as a
// question, the codex and the item window show it: dark until the item is
// known, then its seals lit, their bloom flaring and then breathing for as
// long as it shows; a seal left empty where a button sits in it (the
// codex's close, the item window's fold and close); its ends drawn to a
// taller plate's height, as a name that wraps makes it in a question.

import type { PieceBench } from '../bench.ts';

export const plate: PieceBench = {
  kind: 'piece',
  key: 'plate',
  label: 'Name plate',
  about: "The plate behind a unique's name: dark, or lit with its seals' bloom breathing; seals left empty for a button; ends sized to a taller plate.",
  files: ['src/components/NamePlate.svelte', 'src/lib/drawIn.ts', 'src/lib/weave.ts', 'weaveTile.ts', 'src/lib/alchemy.ts'],
  controls: [
    { kind: 'toggle', key: 'lit', label: 'Lit', default: true },
    {
      kind: 'choice',
      key: 'seals',
      label: 'Seals',
      default: 'both',
      options: [
        { value: 'both', label: 'Sol and Luna (a question)' },
        { value: 'sol', label: 'Sol only (the codex)' },
        { value: 'none', label: 'Both empty (the item window)' },
      ],
    },
    { kind: 'range', key: 'height', label: 'Height', min: 56, max: 120, default: 64, unit: 'px' },
    { kind: 'range', key: 'width', label: 'Width', min: 280, max: 760, default: 420, unit: 'px', view: true },
  ],
  states: [
    { label: 'Dark, before the reveal', values: { lit: false } },
    { label: 'Lit', values: {} },
    { label: 'The codex', values: { seals: 'sol' } },
    { label: 'The item window', values: { seals: 'none' } },
    { label: 'A name that wraps', values: { height: 92 } },
  ],
  actions: [{ key: 'reveal', label: 'Reveal', hint: 'dark, then lit: the seals flare' }],
  cell: 320,
  // The bloom breathes for as long as the seals are lit.
  moves: true,
  view: () => import('./PlateView.svelte'),
};
