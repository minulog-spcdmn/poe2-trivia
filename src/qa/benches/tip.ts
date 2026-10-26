// The tip to play fullscreen (lib/fullscreenTip.ts) as each device gets it:
// a desktop's keys, an Android phone's way to the home screen, and an
// iPhone's, both as a first visit reads it and as a player with a name or a
// codex does (the home-screen app starts fresh, so it points to Settings'
// pairing). Gone, it comes up again a moment later.

import type { PieceBench } from '../bench.ts';

export const tip: PieceBench = {
  kind: 'piece',
  key: 'tip',
  label: 'Fullscreen tip',
  about: 'The tip to play fullscreen: the keys on a desktop, the way to the home screen on Android and on an iPhone, and the iPhone’s for a player with progress to bring over.',
  files: ['src/lib/fullscreenTip.ts', 'src/components/Toasts.svelte'],
  cell: 420,
  controls: [
    {
      kind: 'choice',
      key: 'for',
      label: 'Device',
      options: [
        { value: 'desktop', label: 'Desktop' },
        { value: 'android', label: 'Android' },
        { value: 'ios', label: 'iPhone or iPad' },
      ],
      default: 'ios',
    },
    { kind: 'toggle', key: 'progress', label: 'Has progress', default: false },
  ],
  states: [
    { label: 'iPhone, a first visit', values: { for: 'ios', progress: false } },
    { label: 'iPhone, with progress', values: { for: 'ios', progress: true } },
    { label: 'Android', values: { for: 'android', progress: false } },
    { label: 'Desktop', values: { for: 'desktop', progress: false } },
  ],
  view: () => import('./TipView.svelte'),
};
