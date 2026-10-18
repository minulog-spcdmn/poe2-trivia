// In a game: each kind's moments (a category to pick, a question with its
// clock running, the answer shown, right and wrong), played through the
// engine to there, from the seat whose turn it is and from one watching it.
// Delve alone and together, deeper down too.

import type { Settings } from '../../lib/game.ts';
import { pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene, Seat } from '../scene.ts';

const THREE = ['Kalguur', 'Doryani', 'Una of the Vaal'];
const FIVE = [...THREE, 'Rog', 'Alva'];
const host = (name: string): Seat => ({ mode: 'host', me: pid(name) });
const guest = (name: string): Seat => ({ mode: 'client', me: pid(name) });
const ALONE: Seat = { mode: 'local', me: null };

/** How far into a question its scene stands (ms). */
const INTO = 3000;

function scene(key: string, group: string, label: string, seats: Seat[], play: () => Table, more: (t: Table) => Partial<Built> = () => ({})): Scene {
  return {
    key: `game/${key}`,
    screen: 'game',
    group,
    label,
    seats,
    build: () => {
      const t = play();
      const at = t.s.phase === 'question' ? t.clock.now + INTO : t.clock.now;
      return { state: t.s, at, ...more(t) };
    },
  };
}
const table = (names: string[], settings: Partial<Settings> = {}, o: { host?: null; seed?: number } = {}) => new Table(names, settings, o);

export function gameScenes(): Scene[] {
  // Take turns: Doryani's turn first (the seed's), Kalguur hosting.
  const turns = () => table(THREE).start();
  const race = () => table(FIVE, { mode: 'race' }).start();
  const delveAlone = () => table(['Kalguur'], { mode: 'delve' }, { host: null }).start();
  const delveTogether = () => table(THREE, { mode: 'delve' }).start();
  const turnsSeats = [guest('Doryani'), host('Kalguur')];
  return [
    scene('turns-choosing', 'Take turns', 'Picking a category', turnsSeats, turns),
    scene('turns-question', 'Take turns', 'A question, its clock running', turnsSeats, () => turns().pick()),
    scene('turns-right', 'Take turns', 'Answered right', turnsSeats, () => {
      const t = turns().pick();
      return t.answer(t.turn, true);
    }),
    scene('turns-wrong', 'Take turns', 'Answered wrong', turnsSeats, () => {
      const t = turns().pick();
      return t.answer(t.turn, false);
    }),
    scene('turns-late', 'Take turns', 'Late in a game: scores near the target', turnsSeats, () => turns().playTo((s) => s.round >= 7 && s.phase === 'choosing', (name, round) => name !== 'Una of the Vaal' || round % 2 === 0)),
    scene('turns-untimed', 'Take turns', 'A question with no timer', turnsSeats, () => table(THREE, { timer: 0 }).start().pick()),
    scene('hot-seat', 'Take turns', 'Hot-seat: a question', [ALONE], () => table(THREE, {}, { host: null }).start().pick()),
    scene('race-question', 'Race', 'A question, everyone answering', [host('Kalguur'), guest('Doryani')], race),
    scene('race-answered', 'Race', 'Answered, waiting on the others', [host('Kalguur'), guest('Doryani')], () => race().answer('Doryani', false, 1800)),
    scene('race-reveal', 'Race', 'The answer shown', [host('Kalguur'), guest('Doryani')], () => race().answer('Una of the Vaal', true, 1500)),
    scene('deathmatch', 'Deathmatch', 'A tie at the target: the deathmatch', [host('Kalguur'), guest('Doryani')], () =>
      table(['Kalguur', 'Doryani'], { targetScore: 1 })
        .start()
        .playTo((s) => !!s.deathmatch),
    ),
    scene('delve-cards', 'Delve alone', 'The cards dealt', [ALONE], delveAlone),
    scene('delve-question', 'Delve alone', 'A question', [ALONE], () => delveAlone().pick()),
    scene('delve-wrong', 'Delve alone', 'Answered wrong: a life lost', [ALONE], () => {
      const t = delveAlone().pick();
      return t.answer(null, false);
    }),
    scene('delve-deep', 'Delve alone', 'Thirty deep', [ALONE], () => delveAlone().playTo((s) => s.round >= 30 && s.phase === 'choosing')),
    scene('delve-together-cards', 'Delve together', 'The cards dealt, Doryani has voted', [host('Kalguur'), guest('Doryani')], () => {
      const t = delveTogether();
      return t.act({ type: 'vote', category: t.s.offered[1] }, 'Doryani');
    }),
    scene('delve-together-question', 'Delve together', 'A question, after the vote', [host('Kalguur'), guest('Doryani')], () => {
      const t = delveTogether();
      for (const name of THREE) t.act({ type: 'vote', category: t.s.offered[0] }, name);
      // Every vote in: the room's own timer draws the card.
      return t.s.phase === 'choosing' ? t.act({ type: 'expire' }, null) : t;
    }),
  ];
}
