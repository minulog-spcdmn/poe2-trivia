// The Wraeclast run's item screen (wraeclast.html, src/wraeclast): the
// hidden art in its square frame, the clues, the pack, the Inscription's line
// and board with their marks, and the dock, as a real run (rules.ts) lays
// them out at any step of the map, under any zone type, corruption or boss
// modifier; a supply used, misses made (the board marked), the answer half
// built or the item named. Its first states are a board of each section
// (early, mid, late, the boss), decoy names and all, to try one quickly.

import type { PieceBench } from '../bench.ts';

const PLACES = [
  { value: 'early', label: 'Step 2 (early)' },
  { value: 'mid', label: 'Step 5 (mid)' },
  { value: 'late', label: 'Step 8 (late)' },
  { value: 'boss1', label: 'Boss, item 1' },
  { value: 'boss3', label: 'Boss, item 3' },
];
const ZONES = [
  { value: 'plain', label: 'Plain' },
  { value: 'incursion', label: 'Incursion' },
  { value: 'essence', label: 'Essence' },
  { value: 'ritual', label: 'Ritual' },
  { value: 'expedition', label: 'Expedition' },
  { value: 'blight', label: 'Blight' },
];
const HIDDEN = [
  { value: 'none', label: 'None' },
  { value: 'blood', label: 'Blood toll' },
];
const BOSS_MODS = [
  { value: 'none', label: 'None' },
  { value: 'lingering', label: 'Lingering' },
  { value: 'bloodied', label: 'Bloodied' },
  { value: 'murky', label: 'Murky' },
  { value: 'teeming', label: 'Teeming' },
  { value: 'three', label: 'Bloodied, Murky, Teeming' },
];
const USED = [
  { value: 'none', label: 'None' },
  { value: 'flare', label: 'Torch' },
  { value: 'wisdom', label: 'Scroll of Wisdom' },
  { value: 'lore', label: 'Golden Page' },
  { value: 'category', label: 'Ancient Orb' },
  { value: 'base', label: 'Base reveal' },
  { value: 'decoy', label: 'Tangled Fossil' },
  { value: 'lengths', label: 'Word lengths' },
  { value: 'first', label: 'First tile' },
  { value: 'deck', label: 'Stacked Deck' },
];

export const wraeclast: PieceBench = {
  kind: 'piece',
  key: 'wraeclast',
  label: 'Wraeclast item',
  about: "The Wraeclast run's item screen: the square art, the clues, the pack, the Inscription's marks and the dock, at any step, zone type, corruption or boss modifier, up to the 36 tiles a pool can hold. The first states are a board of each section, to try (Item changes the board).",
  files: [
    'src/wraeclast/ItemScreen.svelte',
    'src/wraeclast/Inscription.svelte',
    'src/wraeclast/Veil.svelte',
    'src/wraeclast/Clues.svelte',
    'src/wraeclast/ClueText.svelte',
    'src/wraeclast/ItemPack.svelte',
    'src/wraeclast/Glyph.svelte',
    'src/wraeclast/Hud.svelte',
    'src/wraeclast/markup.ts',
    'src/wraeclast/rules.ts',
    'src/wraeclast/map.ts',
    'src/wraeclast/words.ts',
    'src/wraeclast/screens.css',
  ],
  controls: [
    { kind: 'choice', key: 'place', label: 'Where', options: PLACES, default: 'early' },
    { kind: 'choice', key: 'zone', label: 'Zone type', options: ZONES, default: 'plain' },
    { kind: 'choice', key: 'hidden', label: 'Corruption', options: HIDDEN, default: 'none' },
    { kind: 'choice', key: 'mods', label: 'Boss modifiers', options: BOSS_MODS, default: 'none' },
    { kind: 'range', key: 'item', label: 'Item (a seed)', min: 1, max: 500, default: 1 },
    { kind: 'choice', key: 'used', label: 'Supply used', options: USED, default: 'none' },
    { kind: 'range', key: 'misses', label: 'Misses', min: 0, max: 3, default: 0 },
    { kind: 'toggle', key: 'goldOnly', label: 'Gold marks only', default: false },
    { kind: 'toggle', key: 'built', label: 'Answer half built', default: false },
    { kind: 'toggle', key: 'named', label: 'Named', default: false },
    { kind: 'toggle', key: 'pack', label: 'Pack full', default: true },
  ],
  states: [
    { label: 'Early board: about 14 tiles, 1 or 2 decoy names', values: {} },
    { label: 'Early board, another', values: { item: 21 } },
    { label: 'Mid board: about 20 tiles, 2 or 3 decoy names', values: { place: 'mid', item: 22 } },
    { label: 'Mid board, another', values: { place: 'mid', item: 23 } },
    { label: 'Late board: about 26 tiles, 3 or 4 decoy names', values: { place: 'late', item: 24 } },
    { label: 'Late board, another', values: { place: 'late', item: 25 } },
    { label: 'Boss board: about 32 tiles, 4 or 5 decoy names', values: { place: 'boss1', item: 26 } },
    { label: 'Boss board, another', values: { place: 'boss3', item: 27 } },
    { label: 'Incursion: flavor text free', values: { zone: 'incursion', item: 2 } },
    { label: 'Essence: the base type free', values: { zone: 'essence', item: 3 } },
    { label: 'Ritual: word lengths free, no Scrolls', values: { zone: 'ritual', item: 4 } },
    { label: 'Blight: a patch free, more tiles', values: { zone: 'blight', place: 'mid', item: 5 } },
    { label: 'Two misses: gold, silver and struck', values: { misses: 2, place: 'mid', item: 6 } },
    { label: 'Gold marks only', values: { misses: 2, goldOnly: true, item: 6, place: 'mid' } },
    { label: 'Blood toll: 10 life an item, double loot', values: { hidden: 'blood', item: 7 } },
    { label: '36 tiles (the cap): Blight at step 8', values: { place: 'late', zone: 'blight', item: 10 } },
    { label: 'Boss, item 3: Torches half, three rules added', values: { place: 'boss3', mods: 'three', item: 12 } },
    { label: 'A Torch used', values: { used: 'flare', item: 13 } },
    { label: 'First tile placed', values: { used: 'first', place: 'late', item: 14 } },
    { label: 'Tangled Fossil', values: { used: 'decoy', place: 'late', item: 15 } },
    { label: 'Ancient Orb and the base shown', values: { used: 'category', zone: 'essence', item: 16 } },
    { label: 'Stacked Deck', values: { used: 'deck', place: 'mid', item: 20 } },
    { label: 'Half built', values: { built: true, place: 'mid', item: 17 } },
    { label: 'Named: the art shows', values: { named: true, item: 18 } },
    { label: 'Empty pack', values: { pack: false, item: 19 } },
  ],
  actions: [
    { key: 'miss', label: 'Miss', hint: 'submits a wrong line, marking the board' },
    { key: 'answer', label: 'Fill in the answer', hint: 'its tiles on the line, ready to submit' },
  ],
  cell: 380,
  view: () => import('./WraeclastView.svelte'),
};
