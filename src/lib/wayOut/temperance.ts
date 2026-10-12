// The way out, as Temperance (see design.ts): the card of restraint, the
// fourteenth of the Major Arcana. Knowing when to stop is the whole choice
// a dig asks, so the card is called Enough. Engraved, not an emblem: two
// cups held apart, the stream poured from one to the other, the angel's
// wings behind them (lib/wayOut/temperanceEngraving). Its ink is rose gold,
// apart from the vein's azurite, the flare's red, the dynamite's ember and
// the plain cards' gold.

import type { WayOutDesign } from './design.ts';
import { TEMPERANCE } from './temperanceEngraving.ts';

const words = ['no', 'one', 'two', 'three'];

/** What is banked: your ward, the team's two wards. */
const haulWords = (haul: number, team: boolean) => `${team ? "the team's" : 'your'} ${haul === 1 ? 'ward' : `${words[haul] ?? haul} wards`}`;

export const temperance: WayOutDesign = {
  id: 'temperance',
  label: 'Temperance',
  title: 'Enough',
  tag: (haul) => (haul ? `XIV • ${haul} in hand` : 'XIV • Temperance'),
  note: (haul, team) => (haul ? `Stop here; bank ${haulWords(haul, team)} and go a depth deeper.` : 'Stop here and go a depth deeper.'),
  ink: {
    '--ink': '#e6a892',
    '--warm': '#b85a4c',
    '--f': '#f2b4a0',
    '--f-hi': '#ffe4da',
    '--f-border': '#9a5c50',
    '--f-pulse': 'rgba(240, 140, 120, 0.34)',
    '--f-glow': 'rgba(240, 140, 120, 0.22)',
    '--f-glyph': 'linear-gradient(180deg, #fff0ea 0%, #eaa894 45%, #7a3c34 100%)',
  },
  variant: TEMPERANCE,
  emblem: undefined,
};
