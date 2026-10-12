// The way out of a vein, Back to the Light (see design.ts): the lamp of the lit path.
// The vein's dig runs on a lamp whose light carries over strikes; leaving
// it is going back to the path's light. Its plate (lanternPlate.ts) hangs a
// miner's lantern in the window, its flame the glory's heart, the dawn and
// the lamp's star in the spandrels; its ink is lamplight, a warmer, brighter
// gold than the plain cards', and the lantern is gilded as an item is.

import type { WayOutDesign } from './design.ts';
import { LANTERN_PLATE } from './lanternPlate.ts';

const words = ['no', 'one', 'two', 'three'];

export const WAY_OUT_CARD: WayOutDesign = {
  title: 'Back to the Light',
  tag: (haul) => (haul ? `Keep ${haul} ${haul === 1 ? 'Ward' : 'Wards'}` : 'Leave'),
  note: (haul, team) =>
    haul
      ? `Carry ${team ? "the team's" : 'your'} ${haul === 1 ? 'ward' : `${words[haul]} wards`} back to the light and bank ${haul === 1 ? 'it' : 'them'}; then go a depth deeper.`
      : 'Climb back to the light and go a depth deeper.',
  ink: {
    '--ink': '#f2c46a',
    '--warm': '#e8901e',
    '--f': '#ffd47e',
    '--f-hi': '#fff2cf',
    '--f-border': '#b4802c',
    '--f-pulse': 'rgba(255, 196, 92, 0.45)',
    '--f-glow': 'rgba(255, 184, 72, 0.3)',
    '--gild-hi': '#fff1c4',
    '--gild-mid': '#f0b24e',
    '--gild-lo': '#7a4310',
  },
  variant: LANTERN_PLATE,
};
