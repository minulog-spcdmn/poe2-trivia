// Over the game: being turned out of a room (removed, the room closed, the
// game moved to another tab), the dialog before leaving one, and coming
// back from a crash (Root.svelte: a guest leaves the room, a second crash
// soon after leaves any game, and one with no game left stops the page).

import { pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene, Seat, Step } from '../scene.ts';

const THREE = ['Kalguur', 'Doryani', 'Una of the Vaal'];
const inGame = (steps: Step[]): Built => {
  const t = new Table(THREE).start().pick();
  // (Turned out, it lands on the start page: its room list finds nothing.)
  return { state: t.s, act: t.room, at: t.clock.now + 3000, steps, rooms: [] };
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
    overlay('crash-host', 'The host crashed once: back on its feet', [kalguur], () => inGame([{ crash: 1 }])),
    overlay('crash-guest', 'A guest crashed once: out of the room', [doryani], () => inGame([{ crash: 1 }])),
    overlay('crash-twice', 'The host crashed twice: out of the game', [kalguur], () => inGame([{ crash: 2 }])),
    overlay('crash-stuck', 'Crashed twice out of a game: the page stops', [{ mode: 'none', me: null }], () => ({ state: null, steps: [{ crash: 2 }] })),
  ];
}
