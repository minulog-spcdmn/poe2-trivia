// The lobby, from the host's seat, a guest's and a spectator's: alone, a
// few, a full room, long names, each game and difficulty, locked, hot-seat.

import type { Settings } from '../../lib/game.ts';
import { DELVE_RULESET, FINDS_IN_ORDER } from '../../lib/delve.ts';
import type { Answer } from '../../lib/codex.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import { id, pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import type { Built, Knob, Scene, Seat } from '../scene.ts';

const TWELVE = ['Kalguur', 'Doryani', 'Una of the Vaal', 'Hooded One', 'Rog', 'Zelina', 'Alva', 'Oswin', 'Dannig', 'Finn', 'Sekhema Asala', 'Renly'];
const LONG = ['Sekhema Asala Kahari', 'Doryani of the Vaal', 'Hooded Wanderer Kai', 'Zelina Whitebranch', 'Rog the Lucky Smith'];
const host = (name: string): Seat => ({ mode: 'host', me: pid(name) });
const guest = (name: string): Seat => ({ mode: 'client', me: pid(name) });

function lobby(key: string, label: string, seats: Seat[], names: string[], settings: Partial<Settings> = {}, o: { watching?: string[]; local?: boolean; group?: string } = {}): Scene {
  const build = (): Built => ({ state: new Table(names, settings, { watching: o.watching, ...(o.local ? { host: null } : {}) }).s });
  return { key: `lobby/${key}`, screen: 'lobby', group: o.group ?? 'Lobby', label, seats, build };
}

/**
 * The descent drawn in a Delve lobby's rules (components/DelveRules), from
 * this device's records: none, a best, a best and a last run, past every
 * zone, past 100 (depths as the records keep them, shown one less), and the
 * finds met or not. The descent's own bench (src/qa/benches/descent.ts) walks it down.
 */
const RECORDS: Knob = {
  key: 'records',
  label: 'Records',
  default: 'best-last',
  options: [
    { value: 'none', label: 'No runs' },
    { value: 'best', label: 'A best (38)' },
    { value: 'best-last', label: 'Best 46, last run 21' },
    { value: 'last-at-best', label: 'Last run at the best (46)' },
    { value: 'all-zones', label: 'Every zone (96, last 62)' },
    { value: 'past-100', label: 'Past 100 (216)' },
    { value: 'both-past-100', label: 'Both past 100 (216, last 150)' },
  ],
};
const DEPTHS: Record<string, [number, number]> = { none: [0, 0], best: [38, 0], 'best-last': [46, 21], 'last-at-best': [46, 46], 'all-zones': [96, 62], 'past-100': [216, 0], 'both-past-100': [216, 150] };
const COMPANY: Knob = { key: 'company', label: 'Delving', default: 'alone', options: [{ value: 'alone', label: 'Alone' }, { value: 'together', label: 'Together' }] };
const FOUND: Knob = { key: 'finds', label: 'Finds', default: 'all', options: [{ value: 'all', label: 'All met' }, { value: 'none', label: 'None met' }] };

function descent(k: Record<string, string> = {}): Built {
  const together = k.company === 'together';
  const [best, last] = DEPTHS[k.records] ?? DEPTHS['best-last'];
  const players = together ? 3 : 1;
  const run = (n: number, depth: number): DelveRun => ({ id: 3000 + n, at: 3000 + n, depth, players, ruleset: DELVE_RULESET, mixed: false, ...(together ? { perished: [depth] } : {}) });
  const runs = [best ? run(0, best) : null, last ? run(1, last) : null].filter((r): r is DelveRun => !!r);
  const log: Answer[] = k.finds === 'none' ? [] : FINDS_IN_ORDER.map((f, i) => ({ t: 3000 + i, id: id('Headhunter'), mode: 'name', ok: true, difficulty: 'cruel', race: false, depth: f.from, run: 3000, find: f.kind }));
  const t = new Table(together ? ['Kalguur', 'Doryani', 'Una of the Vaal'] : ['Kalguur'], { mode: 'delve' });
  return { state: t.s, runs, log };
}

export function lobbyScenes(): Scene[] {
  const three = ['Kalguur', 'Doryani', 'Una of the Vaal'];
  return [
    lobby('alone', 'The host, waiting alone', [host('Kalguur')], ['Kalguur']),
    lobby('three', 'Three players and someone watching', [host('Kalguur'), guest('Doryani'), guest('Finn')], three, {}, { watching: ['Finn'] }),
    lobby('twelve', 'A full room: twelve', [host('Kalguur'), guest('Renly')], TWELVE),
    {
      key: 'lobby/offline',
      screen: 'lobby',
      group: 'Lobby',
      label: 'Una of the Vaal went offline',
      seats: [host('Kalguur'), guest('Doryani')],
      build: () => ({ state: new Table(three, {}).act({ type: 'connection', playerId: pid('Una of the Vaal'), connected: false }, null).s }),
    },
    lobby('long-names', 'Long names', [host(LONG[0]), guest(LONG[3])], LONG),
    lobby('race', 'Race, public', [host('Kalguur'), guest('Doryani')], three, { mode: 'race', public: true }),
    lobby('locked', 'Locked, public, Eternal, to 20', [host('Kalguur'), guest('Doryani')], three, { locked: true, public: true, difficulty: 'eternal', targetScore: 20 }),
    lobby('cruel-untimed', 'Cruel, no timer', [host('Kalguur'), guest('Doryani')], three, { difficulty: 'cruel', timer: 0 }),
    lobby('custom', 'Custom difficulty', [host('Kalguur'), guest('Doryani')], three, { difficulty: 'custom', custom: { options: 6, similarNames: 1, fakes: 2, artChance: 0.5, veil: 'slow', grayscale: 'art', mirror: 0.3, lockout: 3 } }),
    lobby('delve', 'Delve together', [host('Kalguur'), guest('Doryani')], three, { mode: 'delve' }, { group: 'Delve' }),
    lobby('delve-twelve', 'Delve together, twelve', [host('Kalguur'), guest('Renly')], TWELVE, { mode: 'delve' }, { group: 'Delve' }),
    lobby('hot-seat', 'Hot-seat: three on one device', [{ mode: 'local', me: null }], three, {}, { local: true }),
    { key: 'lobby/delve-descent', screen: 'lobby', group: 'Delve', label: 'Delve: the descent, by your records', seats: [host('Kalguur')], knobs: [RECORDS, COMPANY, FOUND], build: descent },
  ];
}
