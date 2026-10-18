// The lobby, from the host's seat, a guest's and a spectator's: alone, a
// few, a full room, long names, each game and difficulty, locked, hot-seat.

import type { Settings } from '../../lib/game.ts';
import { pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene, Seat } from '../scene.ts';

const TWELVE = ['Kalguur', 'Doryani', 'Una of the Vaal', 'Hooded One', 'Rog', 'Zelina', 'Alva', 'Oswin', 'Dannig', 'Finn', 'Sekhema Asala', 'Renly'];
const LONG = ['Sekhema Asala Kahari', 'Doryani of the Vaal', 'Hooded Wanderer Kai', 'Zelina Whitebranch', 'Rog the Lucky Smith'];
const host = (name: string): Seat => ({ mode: 'host', me: pid(name) });
const guest = (name: string): Seat => ({ mode: 'client', me: pid(name) });

function lobby(key: string, label: string, seats: Seat[], names: string[], settings: Partial<Settings> = {}, o: { watching?: string[]; local?: boolean; group?: string } = {}): Scene {
  const build = (): Built => ({ state: new Table(names, settings, { watching: o.watching, ...(o.local ? { host: null } : {}) }).s });
  return { key: `lobby/${key}`, screen: 'lobby', group: o.group ?? 'Lobby', label, seats, build };
}

export function lobbyScenes(): Scene[] {
  const three = ['Kalguur', 'Doryani', 'Una of the Vaal'];
  return [
    lobby('alone', 'The host, waiting alone', [host('Kalguur')], ['Kalguur']),
    lobby('three', 'Three players and someone watching', [host('Kalguur'), guest('Doryani'), guest('Finn')], three, {}, { watching: ['Finn'] }),
    lobby('twelve', 'A full room: twelve', [host('Kalguur'), guest('Renly')], TWELVE),
    lobby('long-names', 'Long names', [host(LONG[0]), guest(LONG[3])], LONG),
    lobby('race', 'Race, public', [host('Kalguur'), guest('Doryani')], three, { mode: 'race', public: true }),
    lobby('locked', 'Locked, public, Eternal, to 20', [host('Kalguur'), guest('Doryani')], three, { locked: true, public: true, difficulty: 'eternal', targetScore: 20 }),
    lobby('cruel-untimed', 'Cruel, no timer', [host('Kalguur'), guest('Doryani')], three, { difficulty: 'cruel', timer: 0 }),
    lobby('custom', 'Custom difficulty', [host('Kalguur'), guest('Doryani')], three, { difficulty: 'custom', custom: { options: 6, similarNames: 1, fakes: 2, artChance: 0.5, veil: 'slow', grayscale: 'art', mirror: 0.3, lockout: 3 } }),
    lobby('delve', 'Delve together', [host('Kalguur'), guest('Doryani')], three, { mode: 'delve' }, { group: 'Delve' }),
    lobby('delve-twelve', 'Delve together, twelve', [host('Kalguur'), guest('Renly')], TWELVE, { mode: 'delve' }, { group: 'Delve' }),
    lobby('hot-seat', 'Hot-seat: three on one device', [{ mode: 'local', me: null }], three, {}, { local: true }),
  ];
}
