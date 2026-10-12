// Which way-out design the game shows (see design.ts): the lab picks it
// (kept in its own storage), the beta's game shows the one it was last
// left on, the lantern until then.

import { readKey, writeKey } from '../storage.ts';
import type { WayOutDesign, WayOutId } from './design.ts';
import { hermit } from './hermit.ts';
import { lantern } from './lantern.ts';
import { lift } from './lift.ts';
import { temperance } from './temperance.ts';

export const WAY_OUT_DESIGNS: WayOutDesign[] = [hermit, temperance, lantern, lift];

const KEY = 'wayOutDesign';
const saved = readKey(KEY);

const state = $state({ id: (WAY_OUT_DESIGNS.find((d) => d.id === saved)?.id ?? 'lantern') as WayOutId });

/** The way-out design shown. */
export const wayOutDesign = (): WayOutDesign => WAY_OUT_DESIGNS.find((d) => d.id === state.id) ?? lantern;

/** Shows design `id` from now on (the lab's picker). */
export function pickWayOut(id: WayOutId) {
  state.id = id;
  writeKey(KEY, id);
}
