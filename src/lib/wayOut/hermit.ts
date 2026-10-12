// The way out, as The Hermit (see design.ts): the ninth trump, the old
// sage who leaves the crowd with his lantern held up, engraved into the
// plate in moonlit silver (hermitEngraving.ts). Wisdom here is knowing
// when to stop: he takes what was dug up the path and a depth deeper.

import type { WayOutDesign } from './design.ts';
import { hermitVariant } from './hermitEngraving.ts';

const words = ['no', 'one', 'two', 'three'];

export const hermit: WayOutDesign = {
  id: 'hermit',
  label: 'The Hermit',
  title: 'The Wise Choice',
  tag: (haul) => (haul ? `IX • ${haul} in hand` : 'IX • The Hermit'),
  note: (haul, team) => {
    const whose = team ? "the team's" : 'your';
    const what = haul === 1 ? 'ward' : `${words[haul] ?? haul} wards`;
    return haul ? `Carry ${whose} ${what} out by lantern light; the path leads a depth deeper.` : 'Climb out by lantern light; the path leads a depth deeper.';
  },
  ink: {
    '--ink': '#b9c3cf',
    '--warm': '#8c7a5c',
    '--f': '#d5dde6',
    '--f-hi': '#f1f4f8',
    '--f-border': '#66717e',
    '--f-pulse': 'rgba(196, 210, 228, 0.3)',
    '--f-glow': 'rgba(196, 210, 228, 0.18)',
    '--f-glyph': 'linear-gradient(180deg, #f6f8fb 0%, #b9c3cf 45%, #46505c 100%)',
  },
  variant: hermitVariant,
  emblem: undefined,
};
