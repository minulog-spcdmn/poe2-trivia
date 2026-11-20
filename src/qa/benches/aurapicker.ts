// The auras' picker (components/AuraPicker.svelte), under the class sigils'
// as on the Codex's achievements page, the aura worn shown on the sigils'
// token: none found, a few with one worn or none, or every one. Its auras
// are the frame's own (its storage starts apart), so trying it out never
// touches the game's.

import type { PieceBench } from '../bench.ts';
import { WORN } from '../../lib/auraKinds.ts';

export const aurapicker: PieceBench = {
  kind: 'piece',
  key: 'aurapicker',
  label: 'Aura picker',
  about: 'The auras beside the class sigils, on the achievements page and in the settings: one found worn with a click, one not found saying how it’s found.',
  files: ['src/components/AuraPicker.svelte', 'src/components/SigilPicker.svelte', 'src/lib/auraKinds.ts', 'src/lib/auraStore.ts', 'src/lib/auraEngraving.ts', 'src/lib/auraInk.ts'],
  cell: 560,
  controls: [
    { kind: 'range', key: 'found', label: 'Auras found', min: 0, max: WORN.length, default: 4 },
    { kind: 'toggle', key: 'worn', label: 'Wearing the last one found', default: true },
    { kind: 'toggle', key: 'strip', label: 'In a row (the settings, wide)', default: false, view: true },
  ],
  states: [
    { label: 'None found', values: { found: 0, worn: false } },
    { label: 'A few found, one worn', values: { found: 4, worn: true } },
    { label: 'A few found, none worn', values: { found: 4, worn: false } },
    { label: 'Every one found', values: { found: WORN.length, worn: true } },
  ],
  view: () => import('./AurapickerView.svelte'),
};
