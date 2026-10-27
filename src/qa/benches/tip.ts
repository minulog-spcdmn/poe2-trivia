// The tip to play fullscreen (lib/fullscreenTip.ts) as each device gets it:
// a desktop's keys, an Android phone's way to the home screen, an iPhone's
// in Safari, and in the home-screen app once installed the reminder to pair
// it with Safari (it starts fresh). Gone, it comes up again a moment later.

import type { PieceBench } from '../bench.ts';

export const tip: PieceBench = {
  kind: 'piece',
  key: 'tip',
  label: 'Fullscreen tip',
  about: 'The tip to play fullscreen: the keys on a desktop, the way to the home screen on Android and on an iPhone, and in the iPhone’s home-screen app the reminder to pair it with Safari.',
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
        { value: 'app', label: 'iPhone’s home-screen app' },
      ],
      default: 'ios',
    },
  ],
  states: [
    { label: 'iPhone, in Safari', values: { for: 'ios' } },
    { label: 'iPhone’s home-screen app, not paired', values: { for: 'app' } },
    { label: 'Android', values: { for: 'android' } },
    { label: 'Desktop', values: { for: 'desktop' } },
  ],
  view: () => import('./TipView.svelte'),
};
