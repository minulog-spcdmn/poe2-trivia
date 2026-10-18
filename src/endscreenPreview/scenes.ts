// The end screen page's states and windows. The states live with the QA
// desk's scenes now (src/qa/scenes/over.ts); this page reads them from there
// until the desk takes its place.

import { engine } from '../lib/session.svelte';
import fakeNames from '../data/fakes.json';
import { useItems } from '../qa/build/engine.ts';
import { endScenes, type EndScene, type EndView } from '../qa/scenes/over.ts';

export { pid, type Mode } from '../qa/scenes/over.ts';
export type Scene = EndScene;

export interface Viewport {
  key: EndView;
  label: string;
  w: number;
  h: number;
}
export const VIEWPORTS: Viewport[] = [
  { key: 'desktop', label: '1440 × 900', w: 1440, h: 900 },
  { key: 'air13', label: '1440 × 725', w: 1440, h: 725 },
  { key: 'tablet', label: 'Tablet 900', w: 900, h: 1180 },
  { key: 'phone', label: 'Phone 390', w: 390, h: 844 },
  { key: 'phone375', label: 'Phone 375', w: 375, h: 812 },
  { key: 'narrow', label: '1100 × 900', w: 1100, h: 900 },
  { key: 'big', label: '2560 × 1440', w: 2560, h: 1440 },
  { key: 'landscape', label: 'Phone on its side', w: 844, h: 390 },
];

export function scenes(): Scene[] {
  useItems(engine.items, fakeNames);
  return endScenes();
}
