// The way out of an Azurite Vein (delve.ts WAY_OUT): the card dealt beside
// the vein after a right strike. What it is made of; lantern.ts fills it in.

import type { Variant } from '../cardEngraving.ts';

export interface WayOutDesign {
  /** The card's name, on its nameplate. */
  title: string;
  /** The small plaque over the keystone, with `haul` wards in hand (0 to 3): what taking it keeps. */
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
   * --f-pulse and --f-glow (its halo), and --gild-hi, --gild-mid and --gild-lo
   * (its gilded motif's gold, top to foot, as an item's emblem's).
   */
  ink: Record<'--ink' | '--warm' | '--f' | '--f-hi' | '--f-border' | '--f-pulse' | '--f-glow' | '--gild-hi' | '--gild-mid' | '--gild-lo', string>;
  /**
   * The plate engraved for it (lib/cardEngraving's Variant, as the finds'
   * are in lib/findEngraving): its figure in the window, gilded (Plate.gilt),
   * the spandrels, the glory, the back.
   */
  variant: Variant;
}
