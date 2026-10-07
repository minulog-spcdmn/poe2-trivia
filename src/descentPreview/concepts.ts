// The concepts the example page shows, each a component taking the deepest
// depth (null before a first run) and saying how it sits on the rules card:
// beside the finds (a column), above them (a band), or in place of them
// (a drawing that explains the finds itself).

import type { Component } from 'svelte';
import PlateA from '../components/descent/PlateA.svelte';
import PlateB from '../components/descent/PlateB.svelte';

export type Placement = 'beside' | 'above' | 'whole';
export interface Concept {
  key: string;
  name: string;
  component: Component<{ deepest: number | null }>;
  /**
   * On a wide card (400 px and up): beside the finds in a column `column` rem
   * wide, a band above them, or 'whole': the drawing takes the finds' place
   * too, at every width, and explains them itself.
   */
  placement: Placement;
  column?: number;
}

export const CONCEPTS: Concept[] = [
  { key: 'a', name: 'Plate A', component: PlateA, placement: 'whole' },
  { key: 'b', name: 'Plate B', component: PlateB, placement: 'whole' },
];
