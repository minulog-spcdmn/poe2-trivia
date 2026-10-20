// The class sigils' picker (components/SigilPicker.svelte), as on the
// Codex's achievements page: with sigils to unlock or none, some unlocked
// and one worn, or every class. Its unlocks are the frame's own (its storage
// starts apart), so trying it out never touches the game's.

import type { PieceBench } from '../bench.ts';
import { ACHIEVEMENTS } from '../../lib/achievements.ts';
import { CLASSES } from '../../lib/classSigils.ts';

export const sigils: PieceBench = {
  kind: 'piece',
  key: 'sigils',
  label: 'Class sigils',
  about: 'The picker on the achievements page: one class sigil to unlock with each achievement, and the one worn.',
  files: ['src/components/SigilPicker.svelte', 'src/lib/sigils.ts', 'src/lib/classSigils.ts', 'src/components/Avatar.svelte'],
  cell: 520,
  controls: [
    { kind: 'range', key: 'achievements', label: 'Achievements earned', min: 0, max: ACHIEVEMENTS.length, default: 3 },
    { kind: 'range', key: 'unlocked', label: 'Sigils unlocked', min: 0, max: CLASSES.length, default: 1 },
    { kind: 'toggle', key: 'worn', label: 'Wearing the last one unlocked', default: true },
  ],
  states: [
    { label: 'No achievements yet', values: { achievements: 0, unlocked: 0, worn: false } },
    { label: 'The first to unlock', values: { achievements: 1, unlocked: 0, worn: false } },
    { label: 'One worn, two to unlock', values: { achievements: 3, unlocked: 1 } },
    { label: 'Nothing to unlock', values: { achievements: 4, unlocked: 4 } },
    { label: 'Unlocked, none worn', values: { achievements: 4, unlocked: 4, worn: false } },
    { label: 'Every class', values: { achievements: ACHIEVEMENTS.length, unlocked: CLASSES.length } },
  ],
  view: () => import('./SigilsView.svelte'),
};
