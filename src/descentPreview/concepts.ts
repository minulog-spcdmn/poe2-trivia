// The concepts the example page shows, each a component taking the deepest
// depth (null before a first run) and saying where it sits: beside the finds
// (a column) or above them (a band across the card).

import type { Component } from 'svelte';
import Shaft from '../components/descent/Shaft.svelte';
import Spiral from '../components/descent/Spiral.svelte';

export type Placement = 'beside' | 'above';
export interface Concept {
  key: string;
  name: string;
  component: Component<{ deepest: number | null }>;
  /** On a wide card (400 px and up): beside the finds in a column this wide (rem), or a band above them. */
  placement: Placement;
  column?: number;
}

export const CONCEPTS: Concept[] = [
  { key: 'shaft', name: 'Shaft', component: Shaft, placement: 'beside', column: 11.5 },
  { key: 'spiral', name: 'Spiral', component: Spiral, placement: 'above' },
];
