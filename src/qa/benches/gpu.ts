// The notice that the browser draws the game without the graphics card
// (components/GpuDialog.svelte), with the steps as each browser gets them:
// Chrome's, Edge's, Opera's and Firefox's settings address to copy, and the
// general steps where a browser has none. Answered, it comes up again. (The
// settings' line that opens it is the settings page's scene, Graphics
// acceleration off.)

import type { PieceBench } from '../bench.ts';

export const gpu: PieceBench = {
  kind: 'piece',
  key: 'gpu',
  label: 'Graphics notice',
  about: 'The dialog a player gets when the browser draws the game without the graphics card: what it does to the game, and the steps to switch acceleration on in their browser.',
  files: ['src/components/GpuDialog.svelte', 'src/lib/gpuNotice.svelte.ts', 'src/lib/gpuCheck.ts'],
  cell: 520,
  controls: [
    {
      kind: 'choice',
      key: 'browser',
      label: 'Browser',
      options: [
        { value: 'chrome', label: 'Chrome' },
        { value: 'edge', label: 'Edge' },
        { value: 'opera', label: 'Opera' },
        { value: 'firefox', label: 'Firefox' },
        { value: 'other', label: 'Another (no address to copy)' },
      ],
      default: 'chrome',
    },
  ],
  states: [
    { label: 'Chrome', values: { browser: 'chrome' } },
    { label: 'Edge', values: { browser: 'edge' } },
    { label: 'Opera', values: { browser: 'opera' } },
    { label: 'Firefox', values: { browser: 'firefox' } },
    { label: 'Another browser', values: { browser: 'other' } },
  ],
  view: () => import('./GpuView.svelte'),
};
