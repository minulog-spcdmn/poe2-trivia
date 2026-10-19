// The Wraeclast run's item screen (wraeclast.html, src/wraeclast): the
// veiled art, the clues, the pack and the Inscription's board, as a real run
// (rules.ts) lays them out for any place in the run, zone type and board
// size; a supply used, names struck, misses made, the item corrupted, the
// answer half built or the item named.

import type { PieceBench } from '../bench.ts';

const PLACES = [
  { value: 'early', label: 'Zone 1' },
  { value: 'late', label: 'Zone 3' },
  { value: 'boss1', label: 'Boss, item 1' },
  { value: 'boss2', label: 'Boss, item 2' },
  { value: 'boss3', label: 'Boss, item 3' },
];
const ZONES = [
  { value: 'plain', label: 'Plain' },
  { value: 'incursion', label: 'Incursion' },
  { value: 'ritual', label: 'Ritual' },
  { value: 'blight', label: 'Blight' },
];
const NAMES = [{ value: 'auto', label: "The handoff's" }, ...['4', '6', '8', '10'].map((n) => ({ value: n, label: n }))];
const USED = [
  { value: 'none', label: 'None' },
  { value: 'flare', label: 'Flare' },
  { value: 'wisdom', label: 'Scroll of Wisdom' },
  { value: 'lengths', label: 'Word lengths' },
  { value: 'first', label: 'First syllable' },
  { value: 'decoy', label: 'Decoy sweep' },
];
const CORRUPTION = [
  { value: 'none', label: 'None' },
  { value: 'gilded', label: 'Gilded' },
  { value: 'unveiled', label: 'Unveiled' },
  { value: 'twisted', label: 'Twisted' },
  { value: 'bricked', label: 'Bricked' },
];

export const wraeclast: PieceBench = {
  kind: 'piece',
  key: 'wraeclast',
  label: 'Wraeclast item',
  about: "The Wraeclast run's item screen: the veil, the clues, the pack and the Inscription's board, from 4 names to 10, a supply used, the item corrupted or named.",
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
    'src/wraeclast/words.ts',
    'src/wraeclast/screens.css',
  ],
  controls: [
    { kind: 'choice', key: 'place', label: 'Where', options: PLACES, default: 'early' },
    { kind: 'choice', key: 'zone', label: 'Zone type', options: ZONES, default: 'plain' },
    { kind: 'choice', key: 'names', label: 'Names on the board', options: NAMES, default: 'auto' },
    { kind: 'range', key: 'item', label: 'Item (a seed)', min: 1, max: 500, default: 1 },
    { kind: 'choice', key: 'used', label: 'Supply used', options: USED, default: 'none' },
    { kind: 'range', key: 'struck', label: 'Name strikes used', min: 0, max: 7, default: 0 },
    { kind: 'range', key: 'misses', label: 'Misses', min: 0, max: 3, default: 0 },
    { kind: 'choice', key: 'corrupt', label: 'Vaal Orb', options: CORRUPTION, default: 'none' },
    { kind: 'toggle', key: 'built', label: 'Answer half built', default: false },
    { kind: 'toggle', key: 'named', label: 'Named', default: false },
    { kind: 'toggle', key: 'pack', label: 'Pack full', default: true },
    { kind: 'toggle', key: 'spacing', label: 'Auto spacing', default: true },
  ],
  states: [
    { label: 'Zone 1, Plain: a common line free', values: {} },
    { label: 'Zone 1, Incursion: flavour text free', values: { zone: 'incursion' } },
    { label: 'Zone 1, Ritual: word lengths free', values: { zone: 'ritual' } },
    { label: 'Zone 3, Blight: 8 names, 2 patches burned', values: { place: 'late', zone: 'blight' } },
    { label: 'Boss, item 1: 10 names, 4 patches free', values: { place: 'boss1' } },
    { label: 'Boss, item 3: Flares burn half', values: { place: 'boss3', item: 7, used: 'flare' } },
    { label: 'A Flare used', values: { used: 'flare', item: 4 } },
    { label: 'First syllable locked', values: { used: 'first', place: 'late' } },
    { label: 'Decoy sweep', values: { used: 'decoy', place: 'late' } },
    { label: '10 names, 3 struck', values: { place: 'boss2', struck: 3 } },
    { label: 'A miss, the name struck', values: { misses: 1 } },
    { label: 'Corrupted: Unveiled', values: { corrupt: 'unveiled', item: 5 } },
    { label: 'Corrupted: Twisted', values: { corrupt: 'twisted', place: 'late' } },
    { label: 'Half built, no auto spacing', values: { place: 'late', built: true, spacing: false } },
    { label: 'Named: the Veil lifts', values: { named: true, item: 9 } },
    { label: 'Empty pack', values: { pack: false, item: 3 } },
  ],
  actions: [
    { key: 'miss', label: 'Miss', hint: 'submits a wrong name on the board' },
    { key: 'answer', label: 'Fill in the answer', hint: 'its syllables on the line, ready to submit' },
  ],
  cell: 380,
  view: () => import('./WraeclastView.svelte'),
};
