// The Wraeclast run's screens around its items (wraeclast.html,
// src/wraeclast): the camp, the map (at the start and later, the corruption
// crept), a zone's threshold (a corrupted one's flip), a Well, the boss's
// threshold with its modifiers, the loot (collected, a full pack's swap), an
// Expedition's vendor and a town, the end won and lost, and the tuning panel,
// each reached by a real run (rules.ts) played to it.

import type { PieceBench } from '../bench.ts';

const SCREENS = [
  { value: 'camp', label: 'Camp' },
  { value: 'map', label: 'Map, from the camp' },
  { value: 'mapLater', label: 'Map, from step 5' },
  { value: 'zone', label: 'A zone item' },
  { value: 'corrupted', label: 'A corrupted zone item' },
  { value: 'well', label: 'Well' },
  { value: 'loot', label: 'A reveal and its loot' },
  { value: 'last', label: "A zone's last reveal" },
  { value: 'swap', label: 'Loot, pack full' },
  { value: 'expedition', label: 'Expedition vendor' },
  { value: 'town', label: 'Town' },
  { value: 'boss', label: 'Boss threshold' },
  { value: 'won', label: 'End, won' },
  { value: 'lost', label: 'End, lost' },
];
const ROUTES = [
  { value: 'left', label: 'Leftmost path' },
  { value: 'corrupt', label: 'Into corruption' },
  { value: 'clean', label: 'Around corruption' },
];

export const wraeclastRun: PieceBench = {
  kind: 'piece',
  key: 'wraeclastRun',
  label: 'Wraeclast screens',
  about: "The Wraeclast run's other screens: the camp, the map (Where next), a zone's item (corrupted too), a Well, the boss's threshold, a reveal's loot, the vendors, the end won and lost, and the tuning panel.",
  files: [
    'src/wraeclast/Vendor.svelte',
    'src/wraeclast/PackList.svelte',
    'src/wraeclast/DealtCard.svelte',
    'src/wraeclast/Glyph.svelte',
    'src/wraeclast/MapScreen.svelte',
    'src/wraeclast/Threshold.svelte',
    'src/wraeclast/ItemScreen.svelte',
    'src/wraeclast/End.svelte',
    'src/wraeclast/TuningPanel.svelte',
    'src/wraeclast/Hud.svelte',
    'src/wraeclast/Numbered.svelte',
    'src/wraeclast/markup.ts',
    'src/wraeclast/tuning.ts',
    'src/wraeclast/runLog.ts',
    'src/wraeclast/play.svelte.ts',
    'src/wraeclast/rules.ts',
    'src/wraeclast/map.ts',
    'src/wraeclast/words.ts',
    'src/wraeclast/screens.css',
  ],
  controls: [
    { kind: 'choice', key: 'screen', label: 'Screen', options: SCREENS, default: 'camp' },
    { kind: 'range', key: 'seed', label: 'Run (a seed)', min: 1, max: 500, default: 1 },
    { kind: 'choice', key: 'route', label: 'Route', options: ROUTES, default: 'left' },
    { kind: 'toggle', key: 'stocked', label: 'Supplies bought at the camp', default: true },
    { kind: 'toggle', key: 'misses', label: 'A miss now and then', default: true },
    { kind: 'toggle', key: 'tuning', label: 'Tuning panel open', default: false },
  ],
  states: [
    { label: 'Camp', values: {} },
    { label: 'Camp, nothing bought', values: { stocked: false } },
    { label: 'Map from the camp: three corruptions seeded', values: { screen: 'map' } },
    { label: 'Map from step 5: the corruption moved on', values: { screen: 'mapLater', seed: 3 } },
    { label: 'A zone item: it opens at once', values: { screen: 'zone' } },
    { label: 'A corrupted zone item: the Blood toll', values: { screen: 'corrupted', route: 'corrupt' } },
    { label: 'Well: the flask refilled, on the map', values: { screen: 'well', seed: 4 } },
    { label: 'A reveal: the loot taken', values: { screen: 'loot', misses: false } },
    { label: "A zone's last reveal: Where next", values: { screen: 'last' } },
    { label: 'Loot: a full pack swaps', values: { screen: 'swap' } },
    { label: 'Expedition vendor', values: { screen: 'expedition', seed: 5 } },
    { label: 'Town: healed on arrival', values: { screen: 'town' } },
    { label: 'Boss threshold: corruption left', values: { screen: 'boss', route: 'clean' } },
    { label: 'Won', values: { screen: 'won' } },
    { label: 'Won through corruption', values: { screen: 'won', route: 'corrupt', seed: 7 } },
    { label: 'Lost', values: { screen: 'lost' } },
    { label: 'Tuning panel open', values: { tuning: true } },
  ],
  cell: 380,
  view: () => import('./WraeclastRunView.svelte'),
};
