// The Wraeclast run's item screen (wraeclast.html, src/wraeclast): the
// veiled art in its square frame, the clues, the pack, the Inscription's line
// and board with their marks, and the dock, as a real run (rules.ts) lays
// them out at any step of the map, under any zone type, corruption or boss
// modifier; a supply used, misses made (the board marked), the answer half
// built or the item named.

import type { PieceBench } from '../bench.ts';

const PLACES = [
  { value: 'early', label: 'Step 2' },
  { value: 'mid', label: 'Step 9' },
  { value: 'late', label: 'Step 14' },
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
  { value: 'sealed', label: 'Sealed' },
  { value: 'swarming', label: 'Swarming' },
  { value: 'dark', label: 'Dark' },
  { value: 'bounty', label: 'Bounty' },
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
  { value: 'flare', label: 'Flare' },
  { value: 'wisdom', label: 'Scroll of Wisdom' },
  { value: 'lore', label: 'Golden Page' },
  { value: 'category', label: 'Category reveal' },
  { value: 'base', label: 'Base reveal' },
  { value: 'decoy', label: 'Decoy sweep' },
  { value: 'lengths', label: 'Word lengths' },
  { value: 'first', label: 'First syllable' },
];

export const wraeclast: PieceBench = {
  kind: 'piece',
  key: 'wraeclast',
  label: 'Wraeclast item',
  about: "The Wraeclast run's item screen: the square Veil, the clues, the pack, the Inscription's marks and the dock, at any step, zone type, corruption or boss modifier, up to the 36 tiles a pool can hold.",
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
    { label: 'Step 2, Plain: a common mod line free', values: {} },
    { label: 'Incursion: flavour text free', values: { zone: 'incursion', item: 2 } },
    { label: 'Essence: the base type free', values: { zone: 'essence', item: 3 } },
    { label: 'Ritual: word lengths free, no Scrolls', values: { zone: 'ritual', item: 4 } },
    { label: 'Blight: a burn-in free, more decoys', values: { zone: 'blight', place: 'mid', item: 5 } },
    { label: 'Two misses: gold, silver and struck', values: { misses: 2, place: 'mid', item: 6 } },
    { label: 'Gold marks only', values: { misses: 2, goldOnly: true, item: 6, place: 'mid' } },
    { label: 'Corrupted: Blood toll', values: { hidden: 'blood', item: 7 } },
    { label: 'Corrupted: Sealed', values: { hidden: 'sealed', item: 8 } },
    { label: 'Corrupted: Dark', values: { hidden: 'dark', item: 9 } },
    { label: '36 tiles (the cap): Blight and Swarming at step 14', values: { place: 'late', zone: 'blight', hidden: 'swarming', item: 10 } },
    { label: 'Boss, item 1: about 32 tiles, Silent, a free burn-in', values: { place: 'boss1', item: 11 } },
    { label: 'Boss, item 3: Flares half, three modifiers', values: { place: 'boss3', mods: 'three', item: 12 } },
    { label: 'A Flare used', values: { used: 'flare', item: 13 } },
    { label: 'First syllable locked', values: { used: 'first', place: 'late', item: 14 } },
    { label: 'Decoy sweep', values: { used: 'decoy', place: 'late', item: 15 } },
    { label: 'Category and base shown', values: { used: 'category', zone: 'essence', item: 16 } },
    { label: 'Half built', values: { built: true, place: 'mid', item: 17 } },
    { label: 'Named: the Veil lifts', values: { named: true, item: 18 } },
    { label: 'Empty pack', values: { pack: false, item: 19 } },
  ],
  actions: [
    { key: 'miss', label: 'Miss', hint: 'submits a wrong line, marking the board' },
    { key: 'answer', label: 'Fill in the answer', hint: 'its tiles on the line, ready to submit' },
  ],
  cell: 380,
  view: () => import('./WraeclastView.svelte'),
};
