// Over the game: being turned out of a room (removed, the room closed, the
// game moved to another tab), the dialog before leaving one (the header's
// leave, or the browser's back, which closes what's open first, the codex's
// item card too), news arriving mid-question (where the stack stands on a
// phone, either way up), and coming back from a crash (Root.svelte: a guest
// leaves the room, a second crash soon after leaves any game, and one with
// no game left stops the page).

import { pid, player } from '../build/people.ts';
import { Table } from '../build/play.ts';
import { endScenes } from './over.ts';
import type { Settings } from '../../lib/game.ts';
import type { Built, Scene, Seat, Step } from '../scene.ts';

const THREE = ['Kalguur', 'Doryani', 'Una of the Vaal'];
const inGame = (steps: Step[], answered = false): Built => {
  const t = new Table(THREE).start().pick();
  if (answered) t.answer(t.turn, true);
  // (Turned out, it lands on the start page: its room list finds nothing.)
  return { state: t.s, act: t.room, at: t.clock.now + 3000, steps, rooms: [] };
};
/** The lobby, its host editing the custom difficulty (the edit button on Custom). */
const CUSTOM: Settings['custom'] = { options: 6, similarNames: 1, fakes: 2, artChance: 0.5, veil: 'slow', grayscale: 'art', mirror: 0.3, lockout: 3 };
const editingCustom = (steps: Step[]): Built => {
  const t = new Table(THREE, { difficulty: 'custom', custom: CUSTOM });
  return { state: t.s, act: t.room, steps: [{ click: 'button.edit' }, { wait: 400 }, ...steps] };
};
/** The codex, an item's card open from its collection (out of a room: the codex's own step, lib/backGuard.ts PageLayers). */
const codexItem = (steps: Step[]): Built => ({ state: null, hash: '#codex', met: 140, steps: [{ click: '.tile' }, { wait: 800 }, ...steps] });
/** The end of a run alone, an item's card open from its missed items (in a room: the guard's layer). */
const endItem = (steps: Step[]): Built => {
  const { state, delveResult, log, runs } = endScenes().find((e) => e.key === 'd-solo')!;
  return { state, delveResult, log, runs, steps: [{ wait: 2500 }, { click: 'button.thumb' }, { wait: 800 }, ...steps] };
};
const overlay = (key: string, label: string, seats: Seat[], build: () => Built): Scene => ({ key: `overlay/${key}`, screen: 'overlay', group: 'Over the game', label, seats, build });
const doryani: Seat = { mode: 'client', me: pid('Doryani') };
const kalguur: Seat = { mode: 'host', me: pid('Kalguur') };
/** The player a notice is about, in their colour in the room. */
const una = { name: 'Una of the Vaal', hue: player('Una of the Vaal').hue };

export function overlayScenes(): Scene[] {
  return [
    overlay('removed', 'Removed from the game by the host', [doryani], () => inGame([{ fail: 'kicked' }])),
    overlay('closed', 'The host closed the room', [doryani], () => inGame([{ fail: 'closed' }])),
    overlay('moved', 'The game moved to another tab', [doryani], () => inGame([{ fail: 'replaced' }])),
    // A burst of news during a question: wide screens (and a phone on its side) stack it bottom right, upright phones at the top, as many as they keep.
    // Last the longest a guest gets mid-question (session.svelte.ts TOO_QUICK), two lines: the one a phone on its side shows.
    overlay('news', 'News during a question: a burst of notices', [doryani], () =>
      inGame([
        { toast: 'Una of the Vaal', kind: 'warn', opts: { title: 'Player disconnected', who: una } },
        { toast: 'Una of the Vaal', kind: 'warn', opts: { title: 'Turn skipped', who: una } },
        { toast: 'Brea', opts: { title: 'Spectator joined', who: { name: 'Brea' } } },
        { toast: 'Too quick to count: the question had only just reached you. Answer again.', kind: 'error' },
      ]),
    ),
    overlay('leave', 'Leaving a game: the dialog', [kalguur, doryani], () => inGame([{ click: 'button[aria-label="Leave game"]' }])),
    // The browser's back (lib/backGuard.ts): with nothing open it asks, as the header's leave does; with the item's window open, it closes that alone.
    overlay('back', 'Back in a game: asked before leaving', [kalguur, doryani], () => inGame([{ back: true }])),
    overlay('back-custom', 'Back in the lobby with the custom difficulty open: it closes, the room stays', [kalguur], () => editingCustom([{ back: true }])),
    overlay('back-item', "Back with an item's window open: it closes, the game stays", [kalguur], () => inGame([{ click: 'button.details' }, { wait: 800 }, { back: true }], true)),
    overlay('back-codex-item', "Back in the codex with an item open: it closes, the codex stays as it was", [{ mode: 'none', me: null }], () => codexItem([{ back: true }])),
    overlay('back-end-item', "Back on the end screen with an item open: it closes, the room stays", [{ mode: 'local', me: null }], () => endItem([{ back: true }])),
    overlay('crash-host', 'The host crashed once: back on its feet', [kalguur], () => inGame([{ crash: 1 }])),
    overlay('crash-guest', 'A guest crashed once: out of the room', [doryani], () => inGame([{ crash: 1 }])),
    overlay('crash-twice', 'The host crashed twice: out of the game', [kalguur], () => inGame([{ crash: 2 }])),
    overlay('crash-stuck', 'Crashed twice out of a game: the page stops', [{ mode: 'none', me: null }], () => ({ state: null, steps: [{ crash: 2 }] })),
  ];
}
