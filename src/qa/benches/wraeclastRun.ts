// The Wraeclast run's screens around its items (wraeclast.html,
// src/wraeclast): the camp and the town (the vendor's dealt wares), a zone's
// threshold and the boss's, the loot deal (its unidentified card turned up,
// a full pack's swap), the end won and lost, and the tuning panel, each
// reached by a real run (rules.ts) played to it.

import type { PieceBench } from '../bench.ts';

const SCREENS = [
  { value: 'camp', label: 'Camp' },
  { value: 'travel', label: 'Zone 1 threshold' },
  { value: 'loot', label: 'Loot' },
  { value: 'unid', label: 'Loot, unidentified taken' },
  { value: 'swap', label: 'Loot, pack full' },
  { value: 'beforeTown', label: 'Loot before the town' },
  { value: 'town', label: 'Town' },
  { value: 'boss', label: 'Boss threshold' },
  { value: 'won', label: 'End, won' },
  { value: 'lost', label: 'End, lost' },
];

export const wraeclastRun: PieceBench = {
  kind: 'piece',
  key: 'wraeclastRun',
  label: 'Wraeclast screens',
  about: "The Wraeclast run's other screens: the camp and the town, a zone's threshold and the boss's, the loot deal, the end won and lost, and the tuning panel.",
  files: [
    'src/wraeclast/Vendor.svelte',
    'src/wraeclast/PackList.svelte',
    'src/wraeclast/DealtCard.svelte',
    'src/wraeclast/Glyph.svelte',
    'src/wraeclast/Travel.svelte',
    'src/wraeclast/Loot.svelte',
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
    { kind: 'toggle', key: 'vaal', label: 'Vaal Orbs used', default: true },
    { kind: 'toggle', key: 'tuning', label: 'Tuning panel open', default: false },
  ],
  states: [
    { label: 'Camp', values: {} },
    { label: 'Camp, nothing bought', values: { stocked: false } },
    { label: 'Zone 1 threshold', values: { screen: 'travel' } },
    { label: 'Loot: three cards, one face down', values: { screen: 'loot', misses: false } },
    { label: 'Loot: the unidentified card taken', values: { screen: 'unid' } },
    { label: 'Loot: a full pack swaps', values: { screen: 'swap' } },
    { label: 'Loot: on to the town', values: { screen: 'beforeTown' } },
    { label: 'Town: healed on arrival', values: { screen: 'town' } },
    { label: 'Boss threshold', values: { screen: 'boss' } },
    { label: 'Won, items corrupted', values: { screen: 'won' } },
    { label: 'Won without a miss', values: { screen: 'won', misses: false, vaal: false } },
    { label: 'Lost', values: { screen: 'lost' } },
    { label: 'Tuning panel open', values: { tuning: true } },
  ],
  cell: 380,
  view: () => import('./WraeclastRunView.svelte'),
};
