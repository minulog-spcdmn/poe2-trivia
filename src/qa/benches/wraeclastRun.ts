// The Wraeclast run's screens around its items (wraeclast.html,
// src/wraeclast): the camp and the town (the vendor), the deal of the
// category cards (the boss's one too), the screen between items, the end won
// and lost, and the tuning panel, each reached by a real run (rules.ts)
// played to it.

import type { PieceBench } from '../bench.ts';

const SCREENS = [
  { value: 'camp', label: 'Camp' },
  { value: 'deal', label: 'Deal' },
  { value: 'between', label: 'Between items' },
  { value: 'beforeTown', label: 'Before the town' },
  { value: 'town', label: 'Town' },
  { value: 'boss', label: 'The boss picks' },
  { value: 'beforeBoss', label: 'Before the boss' },
  { value: 'won', label: 'End, won' },
  { value: 'lost', label: 'End, lost' },
];

export const wraeclastRun: PieceBench = {
  kind: 'piece',
  key: 'wraeclastRun',
  label: 'Wraeclast screens',
  about: "The Wraeclast run's other screens: the camp and the town, the category deal (the boss's too), between items, the end won and lost, and the tuning panel.",
  files: [
    'src/wraeclast/Vendor.svelte',
    'src/wraeclast/PackList.svelte',
    'src/wraeclast/Deal.svelte',
    'src/wraeclast/CategoryCard.svelte',
    'src/wraeclast/Between.svelte',
    'src/wraeclast/End.svelte',
    'src/wraeclast/TuningPanel.svelte',
    'src/wraeclast/Hud.svelte',
    'src/wraeclast/Numbered.svelte',
    'src/wraeclast/markup.ts',
    'src/wraeclast/tuning.ts',
    'src/wraeclast/runLog.ts',
    'src/wraeclast/play.svelte.ts',
    'src/wraeclast/rules.ts',
    'src/wraeclast/words.ts',
    'src/wraeclast/screens.css',
  ],
  controls: [
    { kind: 'choice', key: 'screen', label: 'Screen', options: SCREENS, default: 'camp' },
    { kind: 'range', key: 'seed', label: 'Run (a seed)', min: 1, max: 500, default: 1 },
    { kind: 'toggle', key: 'stocked', label: 'Supplies bought at the camp', default: true },
    { kind: 'toggle', key: 'misses', label: 'A miss now and then', default: true },
    { kind: 'toggle', key: 'tuning', label: 'Tuning panel open', default: false },
  ],
  states: [
    { label: 'Camp', values: {} },
    { label: 'Camp, nothing bought', values: { stocked: false } },
    { label: 'Deal: one category locked', values: { screen: 'deal' } },
    { label: 'Between: a miss, the flask healing', values: { screen: 'between' } },
    { label: 'Between: on to the town', values: { screen: 'beforeTown' } },
    { label: 'Town: healed on arrival', values: { screen: 'town' } },
    { label: 'The boss picks', values: { screen: 'boss' } },
    { label: 'Between: on to the boss', values: { screen: 'beforeBoss' } },
    { label: 'Won', values: { screen: 'won' } },
    { label: 'Won without a miss', values: { screen: 'won', misses: false } },
    { label: 'Lost', values: { screen: 'lost' } },
    { label: 'Tuning panel open', values: { tuning: true } },
  ],
  cell: 380,
  view: () => import('./WraeclastRunView.svelte'),
};
