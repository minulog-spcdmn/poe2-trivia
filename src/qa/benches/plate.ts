// The plate behind a unique's name (components/NamePlate.svelte), as a
// question, the codex and the item window show it: dark until the item is
// known, then its seals lit, their bloom breathing for as long as it shows
// (a right answer's glint flares it and runs a spark along the rules; a
// wrong answer lights it quietly); a seal left empty where a button sits in it (the
// codex's close, the item window's fold and close); its ends drawn to a
// taller plate's height, as a name that wraps makes it in a question.

import type { PieceBench } from '../bench.ts';

export const plate: PieceBench = {
  kind: 'piece',
  key: 'plate',
  label: 'Name plate',
  about: "The plate behind a unique's name: dark, or lit with its seals' bloom breathing, flared by a right answer's glint; seals left empty for a button; ends sized to a taller plate.",
  files: ['src/components/NamePlate.svelte', 'src/lib/drawIn.ts', 'src/lib/weave.ts', 'weaveTile.ts', 'src/lib/alchemy.ts'],
  controls: [
    { kind: 'toggle', key: 'lit', label: 'Lit', default: true },
    { kind: 'toggle', key: 'glint', label: 'Glint (a right answer)', default: true },
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
    { label: 'Lit quietly (a wrong answer)', values: { glint: false } },
    { label: 'The codex', values: { seals: 'sol' } },
    { label: 'The item window', values: { seals: 'none' } },
    { label: 'A name that wraps', values: { height: 92 } },
  ],
  actions: [
    { key: 'right', label: 'Right', hint: 'dark, then lit by a right answer: the seals flare, a glint runs along the rules' },
    { key: 'wrong', label: 'Wrong', hint: 'dark, then lit by a wrong answer: quietly' },
  ],
  cell: 320,
  // The bloom breathes for as long as the seals are lit.
  moves: true,
  view: () => import('./PlateView.svelte'),
};
