// Another player's pointer (components/PeerCursors.svelte), on the game's
// real screens seen by two players, where each has something else on it (a
// host's controls, the winner's end screen and a loser's) or another size: the
// moving player's screen and the watching player's, each the real game in a
// frame of its own (frame/pointerRelay.ts). The moving player's hand tours
// their screen by the clock (or it's yours: move the mouse over it), its
// pointer is sent as the game sends it, passed on as the room passes it on
// (the host's batches, a link's delay) and drawn on the watching player's
// screen. Before and after (B) move the same hand on both sides, the mouse's
// too.

import type { PieceBench } from '../bench.ts';

/** The screens it shows, each a scene seen by its host (Kalguur) and a guest (Doryani), with its controls. */
export const POINTER_SCREENS: Record<string, { scene: string; k?: Record<string, string> }> = {
  lobby: { scene: 'lobby/room' },
  'lobby-full': { scene: 'lobby/room', k: { players: '12' } },
  cards: { scene: 'game/turns-choosing' },
  question: { scene: 'game/turns-question' },
  end: { scene: 'over/game' },
  'end-full': { scene: 'over/game', k: { players: '12', place: 'second' } },
};

const SIZE_CHOICES = [
  { value: 'desktop', label: 'Desktop, 1440 × 900' },
  { value: 'laptop', label: '13-inch laptop, 1440 × 725' },
  { value: 'narrow', label: 'Narrow window, 1100 × 900' },
  { value: 'fhd', label: '1080p, in a window' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'landscape', label: 'Phone on its side' },
  { value: 'phone390', label: 'Phone' },
];

export const pointers: PieceBench = {
  kind: 'piece',
  key: 'pointers',
  label: 'Pointers',
  about: 'Another player’s pointer on the real screens, seen by two players with something else on them or at another size: the moving player’s hand (or yours, over it) and where the other sees it.',
  files: ['src/components/PeerCursors.svelte', 'src/lib/cursors.ts', 'src/lib/pointerAnchor.ts', 'src/lib/peerCursors.svelte.ts', 'src/qa/frame/pointerRelay.ts'],
  cell: 900,
  moves: true,
  controls: [
    {
      kind: 'choice',
      key: 'screen',
      label: 'Screen',
      options: [
        { value: 'lobby', label: 'The lobby' },
        { value: 'lobby-full', label: 'The lobby, twelve players' },
        { value: 'cards', label: 'Picking a category' },
        { value: 'question', label: 'A question' },
        { value: 'end', label: 'The end screen (the host won)' },
        { value: 'end-full', label: 'The end screen, twelve players' },
      ],
      default: 'lobby',
    },
    {
      kind: 'choice',
      key: 'moving',
      label: 'Moving',
      options: [
        { value: 'host', label: 'The host (Kalguur)' },
        { value: 'guest', label: 'A guest (Doryani)' },
      ],
      default: 'host',
    },
    { kind: 'choice', key: 'theirs', label: 'Their screen', options: SIZE_CHOICES, default: 'desktop' },
    { kind: 'choice', key: 'yours', label: 'The other’s screen', options: SIZE_CHOICES, default: 'laptop' },
    {
      kind: 'choice',
      key: 'hand',
      label: 'Their hand',
      options: [
        { value: 'tour', label: 'Goes round the screen' },
        { value: 'mouse', label: 'Yours: move the mouse over it' },
      ],
      default: 'tour',
    },
    { kind: 'range', key: 'speed', label: 'Hand speed', min: 0.25, max: 3, step: 0.25, default: 1, unit: '×' },
  ],
  states: [
    { label: 'Lobby: the host’s hand on a guest’s laptop', values: {} },
    { label: 'Lobby: a guest’s hand on the host’s laptop', values: { moving: 'guest' } },
    { label: 'Lobby: the host’s hand on a phone', values: { yours: 'phone390' } },
    { label: 'Lobby, twelve players, a narrow window', values: { screen: 'lobby-full', yours: 'narrow' } },
    { label: 'End screen: the winner’s hand on a loser’s', values: { screen: 'end' } },
    { label: 'End screen: a loser’s hand on the winner’s', values: { screen: 'end', moving: 'guest' } },
    { label: 'End screen, twelve players, on a phone on its side', values: { screen: 'end-full', yours: 'landscape' } },
    { label: 'Picking a category', values: { screen: 'cards' } },
    { label: 'A question', values: { screen: 'question' } },
    { label: 'Lobby, both on a desktop', values: { yours: 'desktop' } },
  ],
  view: () => import('./PointersView.svelte'),
};
