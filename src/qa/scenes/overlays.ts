// Over the game: being turned out of a room (removed, the room closed, the
// game moved to another tab), and the dialog before leaving one.

import { pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene, Seat, Step } from '../scene.ts';

const THREE = ['Kalguur', 'Doryani', 'Una of the Vaal'];
const inGame = (steps: Step[]): Built => {
  const t = new Table(THREE).start().pick();
  return { state: t.s, at: t.clock.now + 3000, steps };
};
const overlay = (key: string, label: string, seats: Seat[], build: () => Built): Scene => ({ key: `overlay/${key}`, screen: 'overlay', group: 'Over the game', label, seats, build });
const doryani: Seat = { mode: 'client', me: pid('Doryani') };
const kalguur: Seat = { mode: 'host', me: pid('Kalguur') };

export function overlayScenes(): Scene[] {
  return [
    overlay('removed', 'Removed from the game by the host', [doryani], () => inGame([{ fail: 'kicked' }])),
    overlay('closed', 'The host closed the room', [doryani], () => inGame([{ fail: 'closed' }])),
    overlay('moved', 'The game moved to another tab', [doryani], () => inGame([{ fail: 'replaced' }])),
    overlay('leave', 'Leaving a game: the dialog', [kalguur, doryani], () => inGame([{ click: 'button[aria-label="Leave game"]' }])),
  ];
}
