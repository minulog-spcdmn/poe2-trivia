// The way out of an Azurite Vein (delve.ts WAY_OUT): the card dealt beside
// the vein after a right strike. Its design is one of a few being tried on
// the beta (lab.html picks which, see choice.svelte.ts); each lives in a
// module of its own in this folder and fills in a WayOutDesign.

import type { Variant } from '../cardEngraving.ts';

export type WayOutId = 'hermit' | 'temperance' | 'lantern' | 'lift';

export interface WayOutDesign {
  id: WayOutId;
  /** What the lab's picker calls it. */
  label: string;
  /** The card's name, on its nameplate. */
  title: string;
  /** The small plaque over the keystone, with `haul` wards in hand (0 to 3). */
  tag(haul: number): string;
  /**
   * The note under the card (EB Garamond: no bullets, a semicolon at most),
   * with `haul` wards in hand; `team`, the team's haul in a run together.
   */
  note(haul: number, team: boolean): string;
  /**
   * The card's colours, as the find cards set theirs (ChooseCategory.svelte,
   * `.card[data-find]`): --ink (the engraving's lines), --warm (the glow in
   * the window), --f (its frame lit), --f-hi (its name and plaque), --f-border,
   * --f-pulse and --f-glow (its halo), --f-glyph (the emblem's gradient).
   */
  ink: Record<'--ink' | '--warm' | '--f' | '--f-hi' | '--f-border' | '--f-pulse' | '--f-glow' | '--f-glyph', string>;
  /**
   * The plate engraved for it (lib/cardEngraving's Variant, as the finds'
   * are in lib/findEngraving): its figure in the window, the spandrels, the
   * glory, the back. What its hooks add is the motif: the plate's own lines
   * stop short of it (Plate.knockout).
   */
  variant?: Variant;
  /** An image (absolute URL or data URL) standing in the window as a category's item does, its shape filled with --f-glyph; none where the engraving is the figure. */
  emblem?: string;
}
