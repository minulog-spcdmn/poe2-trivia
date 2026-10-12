// The way out, as The Lift (see design.ts): the mine's cage, hoisted out
// of the shaft over the headframe's wheel, engraved into the plate in old
// brass (liftEngraving.ts).

import type { WayOutDesign } from './design.ts';
import { liftVariant } from './liftEngraving.ts';

const words = ['no', 'one', 'two', 'three'];
const wards = (haul: number) => (haul === 1 ? 'ward' : `${words[haul] ?? haul} wards`);

export const lift: WayOutDesign = {
  id: 'lift',
  label: 'The Lift',
  title: 'Ride Back Up',
  tag: (haul) => (haul ? `${haul} in hand` : 'Up the shaft'),
  note: (haul, team) => (haul ? `Ride up and bank ${team ? "the team's" : 'your'} ${wards(haul)}; the run goes a depth deeper.` : 'Ride up empty-handed; the run goes a depth deeper.'),
  ink: {
    '--ink': '#b4a15f',
    '--warm': '#9c7a2c',
    '--f': '#d9c88a',
    '--f-hi': '#f4ecce',
    '--f-border': '#7a6d3c',
    '--f-pulse': 'rgba(206, 184, 104, 0.34)',
    '--f-glow': 'rgba(190, 168, 88, 0.22)',
    '--f-glyph': 'linear-gradient(180deg, #f6f0d6 0%, #c9b67a 45%, #5a4c22 100%)',
  },
  variant: liftVariant,
  emblem: undefined,
};
