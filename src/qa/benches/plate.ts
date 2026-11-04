// The plate behind a unique's name (components/NamePlate.svelte), as a
// question, the codex and the item window show it: dark until the item is
// known, then its seals lit, their bloom breathing for as long as it shows
// (a right answer's glint flares it and runs a spark along the rules; a
// wrong answer lights it quietly); a seal left empty where a button sits in it (the
// codex's close, the item window's fold and close); its ends drawn to a
// taller plate's height, as a name that wraps makes it in a question. A
// fossil's question (Delve): the fossil card's own seals at its ends, each on
// a pane of its amber lit from behind (a rare's sun breaking out over the
// tracery), its lamp low until the item is known and up once it is,
// flaring as the fossil is taken (it comes out of the left one) or gone
// out with it lost.

import type { PieceBench } from '../bench.ts';

export const plate: PieceBench = {
  kind: 'piece',
  key: 'plate',
  label: 'Name plate',
  about:
    "The plate behind a unique's name: dark, or lit with its seals' bloom breathing, flared by a right answer's glint; seals left empty for a button; ends sized to a taller plate; a fossil's question, the fossil card's seals on amber lit low till the item is known, then up, taken or lost.",
  files: ['src/components/NamePlate.svelte', 'src/lib/drawIn.ts', 'src/lib/weave.ts', 'weaveTile.ts', 'src/lib/alchemy.ts', 'src/lib/fossilSeals.ts', 'src/lib/fossilReveal.ts'],
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
    {
      kind: 'choice',
      key: 'fossil',
      label: 'A fossil’s question',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'common', label: 'A fossil' },
        { value: 'rare', label: 'A rare fossil' },
      ],
    },
    {
      kind: 'choice',
      key: 'light',
      label: 'Its seals’ light',
      default: 'up',
      options: [
        { value: 'up', label: 'Up (the question)' },
        { value: 'taken', label: 'Taken (right)' },
        { value: 'out', label: 'Out (wrong)' },
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
    { label: 'A fossil’s question', values: { lit: false, fossil: 'common' } },
    { label: 'A rare fossil’s question', values: { lit: false, fossil: 'rare' } },
    { label: 'A rare fossil’s, a name that wraps', values: { lit: false, fossil: 'rare', height: 92 } },
    { label: 'A fossil lost (a wrong answer)', values: { fossil: 'common', light: 'out', glint: false } },
  ],
  actions: [
    { key: 'right', label: 'Right', hint: 'dark, then lit by a right answer: the seals flare, a glint runs along the rules (a fossil’s: taken)' },
    { key: 'wrong', label: 'Wrong', hint: 'dark, then lit by a wrong answer: quietly (a fossil’s: its light goes out)' },
  ],
  cell: 320,
  // The bloom breathes for as long as the seals are lit.
  moves: true,
  view: () => import('./PlateView.svelte'),
};
