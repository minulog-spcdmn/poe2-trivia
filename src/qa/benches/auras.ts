// A try-out of auras players could earn (lib/fx/playerAura.ts, each from
// its own files in lib/fx/auras/): one up close, at 32 px and at the size
// set, or every one side by side. Where the game draws them (the lobby, the
// votes, the pills, the end screen), any scene's Auras puts them on its
// players. Not in the game yet: here to be judged by eye, with the effects on.

import type { PieceBench } from '../bench.ts';
import { RUBY } from '../../lib/palette.ts';
import { CLASSES, className } from '../../lib/classSigils.ts';
import { AURAS, AURA_NAMES, BENCHED } from '../../lib/auraKinds.ts';

export const auras: PieceBench = {
  kind: 'piece',
  key: 'auras',
  label: 'Player auras (try-out)',
  about: 'Auras players could earn, up close at 32 px and larger. In the game’s screens: any scene’s Auras.',
  // (Every aura's own two files with them, and the shade's: This change finds a bench by the files it names.)
  files: [
    'src/lib/fx/playerAura.ts',
    'src/lib/auraKinds.ts',
    'src/lib/auraTrial.svelte.ts',
    'src/lib/fx/shade.ts',
    ...['common', 'index', 'shaders'].map((f) => `src/lib/fx/auras/${f}.ts`),
    ...AURAS.flatMap((a) => [`src/lib/fx/auras/${a}.ts`, `src/lib/fx/auras/${a}.glsl.ts`]),
  ],
  cell: 460,
  moves: true,
  controls: [
    {
      kind: 'choice',
      key: 'show',
      label: 'Show',
      default: 'one',
      options: [
        { value: 'one', label: 'One, as set below' },
        { value: 'every', label: 'Every aura' },
      ],
    },
    { kind: 'choice', key: 'aura', label: 'Aura', default: 'breach', options: AURAS.map((a) => ({ value: a, label: AURA_NAMES[a].name + (BENCHED.includes(a) ? ' (set aside)' : '') })) },
    { kind: 'range', key: 'size', label: 'Size', min: 22, max: 160, default: 96, unit: 'px' },
    {
      kind: 'choice',
      key: 'sigil',
      label: 'Class sigil',
      default: '',
      options: [{ value: '', label: 'None' }, ...CLASSES.map((c) => ({ value: c, label: className(c) }))],
    },
    { kind: 'range', key: 'hue', label: 'Colour', min: 0, max: RUBY - 1, default: 1 },
  ],
  // What the player does, as lib/fx/moments.ts tells the aura in a game.
  actions: [
    { key: 'score', label: 'Scores', hint: 'each press one more in the streak' },
    { key: 'miss', label: 'Loses a point', hint: 'the streak ends' },
    { key: 'hurt', label: 'Loses a life', hint: '2 left, then 1, then none' },
    { key: 'vote', label: 'Votes' },
    { key: 'arrive', label: 'Comes into the lobby' },
    { key: 'win', label: 'Wins' },
    { key: 'touch', label: 'Is tapped' },
  ],
  states: [
    ...AURAS.map((a) => ({ label: AURA_NAMES[a].name + (BENCHED.includes(a) ? ' (set aside)' : ''), values: { show: 'one', aura: a } })),
    { label: 'Every aura', values: { show: 'every', size: 64 } },
  ],
  view: () => import('./AurasView.svelte'),
};
