// The rune circles: one craft in several plates (docs/arcane-style.md), so
// the same circle isn't behind everything. All take the same props. Where
// each stands is lib/circlePlaces.ts; here, the circles themselves.
import type { Component } from 'svelte';
import { PLACES, circleAtPlace, type PlaceName } from '../lib/circlePlaces';
import { warmPlate } from '../lib/plateStore.svelte';
import type { PlateName } from '../lib/plates/index.ts';
import { turnOf } from '../lib/turns';
import ArcaneCircle from './ArcaneCircle.svelte';
import BlackSunCircle from './BlackSunCircle.svelte';
import ForbiddenCircle from './ForbiddenCircle.svelte';
import MonadCircle from './MonadCircle.svelte';
import RoseCircle from './RoseCircle.svelte';

export type Circle = Component<{ state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number; hollow?: boolean }>;

/** Each circle, by its plate. */
const CIRCLE_OF: Record<PlateName, Circle> = { eye: ArcaneCircle, monad: MonadCircle, rose: RoseCircle, blackSun: BlackSunCircle, moth: ForbiddenCircle };
/** The circle whose plate is `name`. */
export const circleNamed = (name: PlateName): Circle => CIRCLE_OF[name];
/** The circles at `place`, in its order. */
export const circlesAt = (place: PlaceName): Circle[] => PLACES[place].circles.map((name) => CIRCLE_OF[name as PlateName]);
/** The one circle at `place`. */
export const circleOf = (place: PlaceName): Circle => CIRCLE_OF[circleAtPlace(place)];

/** The `n`th circle (a day, a question's turn) of `from` in a run seeded `seed`, never the same twice running (lib/turns). */
export const circleAt = (n: number, from: Circle[], seed = 0) => turnOf(n, from, seed);

/** Has `circle`'s plate built ahead of its showing (lib/plateStore.svelte.ts), away from the page while there's time. */
export function warmCircle(circle: Circle) {
  const name = (Object.keys(CIRCLE_OF) as PlateName[]).find((n) => CIRCLE_OF[n] === circle);
  if (name) warmPlate(name);
}
