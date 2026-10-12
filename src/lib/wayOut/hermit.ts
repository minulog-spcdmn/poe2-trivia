// The way out, as The Hermit (see design.ts). A first stand-in: the arched
// doorway in the path's warm light, to be drawn as its own design.

import type { WayOutDesign } from './design.ts';
import { DOORWAY } from './doorway.ts';

const words = ['no', 'one', 'two', 'three'];

export const hermit: WayOutDesign = {
  id: 'hermit',
  label: 'The Hermit',
  title: 'The Wise Choice',
  tag: (haul) => (haul ? `${haul} in hand` : 'Back to the path'),
  note: (haul, team) => (haul ? `Take ${team ? "the team's" : 'your'} ${haul === 1 ? 'ward' : `${words[haul]} wards`} out and go a depth deeper.` : 'Climb out and go a depth deeper.'),
  ink: {
    '--ink': '#d2a868',
    '--warm': '#c8782a',
    '--f': '#ffd18a',
    '--f-hi': '#fff0d0',
    '--f-border': '#9a6a2a',
    '--f-pulse': 'rgba(255, 170, 80, 0.36)',
    '--f-glow': 'rgba(255, 170, 80, 0.24)',
    '--f-glyph': 'linear-gradient(180deg, #fff6dc 0%, #f4c873 45%, #9a5a1c 100%)',
  },
  emblem: DOORWAY,
};
