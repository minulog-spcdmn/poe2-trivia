// The lobby: a room of any size, game and settings, from the host's seat, a
// guest's and a spectator's; players at the host's screen, and a room that
// couldn't go online; hot-seat; and the descent a Delve lobby draws from this
// device's records.

import { MAX_PLAYERS, TIMER_STEPS, type Settings } from '../../lib/game.ts';
import { DELVE_RULESET, FINDS_IN_ORDER } from '../../lib/delve.ts';
import type { Answer } from '../../lib/codex.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import type { Control, Values } from '../bench.ts';
import { id, pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene, Seat } from '../scene.ts';

const TWELVE = ['Kalguur', 'Doryani', 'Una of the Vaal', 'Hooded One', 'Rog', 'Zelina', 'Alva', 'Oswin', 'Dannig', 'Finn', 'Sekhema Asala', 'Renly'];
const host = (name: string): Seat => ({ mode: 'host', me: pid(name) });
const guest = (name: string): Seat => ({ mode: 'client', me: pid(name) });
const CUSTOM: Settings['custom'] = { options: 6, similarNames: 1, fakes: 2, artChance: 0.5, veil: 'slow', grayscale: 'art', mirror: 0.3, lockout: 3 };

/** A room's controls: who's in it and how the host has set it. */
const ROOM: Control[] = [
  { kind: 'range', key: 'players', label: 'Players', min: 1, max: MAX_PLAYERS, default: 3 },
  {
    kind: 'choice',
    key: 'mode',
    label: 'Game',
    default: 'turns',
    options: [
      { value: 'turns', label: 'Take turns' },
      { value: 'race', label: 'Race' },
      { value: 'delve', label: 'Delve' },
    ],
  },
  {
    kind: 'choice',
    key: 'difficulty',
    label: 'Difficulty',
    default: 'merciless',
    options: [
      { value: 'cruel', label: 'Cruel' },
      { value: 'merciless', label: 'Merciless' },
      { value: 'eternal', label: 'Eternal' },
      { value: 'custom', label: 'Custom' },
    ],
  },
  { kind: 'range', key: 'target', label: 'Points to win', min: 1, max: 50, default: 10 },
  { kind: 'choice', key: 'timer', label: 'Timer', default: '16', options: TIMER_STEPS.map((t) => ({ value: String(t), label: t ? `${t} s` : 'None' })) },
  { kind: 'toggle', key: 'public', label: 'Public', default: false },
  { kind: 'toggle', key: 'locked', label: 'Locked', default: false },
];

/** Players at the host's screen, and the game the host has picked (Race and Delve set them aside). */
const HERE: Control = { kind: 'range', key: 'here', label: "At the host's screen", min: 0, max: MAX_PLAYERS - 1, default: 2 };
const MODE: Control = ROOM[1];

function atScreen(names: string[], v: Values): Built {
  const t = new Table(names);
  const here = TWELVE.filter((n) => !names.includes(n)).slice(0, Number(v.here ?? 2));
  for (const name of here) t.act({ type: 'join', playerId: pid(name), name, local: true });
  if (v.mode && v.mode !== 'turns') t.act({ type: 'settings', settings: { mode: v.mode as Settings['mode'] } });
  return { state: t.s, act: t.room };
}

function room(v: Values = {}): Built {
  const names = TWELVE.slice(0, Number(v.players ?? 3));
  const settings: Partial<Settings> = {
    mode: (v.mode ?? 'turns') as Settings['mode'],
    difficulty: (v.difficulty ?? 'merciless') as Settings['difficulty'],
    ...(v.difficulty === 'custom' ? { custom: CUSTOM } : {}),
    targetScore: Number(v.target ?? 10),
    timer: Number(v.timer ?? 16),
    public: !!v.public,
    locked: !!v.locked,
  };
  const t = new Table(names, settings);
  return { state: t.s, act: t.room };
}

/**
 * The descent drawn in a Delve lobby's rules (components/DelveRules), from
 * this device's records: none, a best, a best and a last run, past every
 * zone, past 100 (depths as the records keep them, shown one less), and the
 * finds met or not. The descent's own bench (src/qa/benches/descent.ts) walks it down.
 */
const RECORDS: Control = {
  kind: 'choice',
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
const TOGETHER: Control = { kind: 'toggle', key: 'together', label: 'Delving together', default: false };
const FOUND: Control = { kind: 'toggle', key: 'finds', label: 'Every find met', default: true };

function descent(v: Values = {}): Built {
  const together = !!v.together;
  const [best, last] = DEPTHS[String(v.records)] ?? DEPTHS['best-last'];
  const players = together ? 3 : 1;
  const run = (n: number, depth: number): DelveRun => ({ id: 3000 + n, at: 3000 + n, depth, players, ruleset: DELVE_RULESET, mixed: false, ...(together ? { perished: [depth] } : {}) });
  const runs = [best ? run(0, best) : null, last ? run(1, last) : null].filter((r): r is DelveRun => !!r);
  const log: Answer[] = v.finds === false ? [] : FINDS_IN_ORDER.map((f, i) => ({ t: 3000 + i, id: id('Headhunter'), mode: 'name', ok: true, difficulty: 'cruel', race: false, depth: f.from, run: 3000, find: f.kind }));
  const t = new Table(together ? ['Kalguur', 'Doryani', 'Una of the Vaal'] : ['Kalguur'], { mode: 'delve' });
  return { state: t.s, act: t.room, runs, log };
}

export function lobbyScenes(): Scene[] {
  return [
    {
      key: 'lobby/room',
      screen: 'lobby',
      group: 'Lobby',
      label: 'A room',
      // A spectator's seat once someone watches (Finn, the first to come).
      seats: [host('Kalguur'), guest('Doryani'), guest('Finn')],
      controls: ROOM,
      states: [
        { label: 'Three players', values: {} },
        { label: 'The host, waiting alone', values: { players: 1 } },
        { label: 'Three players and someone watching', values: { watching: 1 } },
        { label: 'A full room: twelve', values: { players: 12 } },
        { label: 'Una of the Vaal went offline', values: { offline: 'Una of the Vaal' } },
        { label: 'Long names', values: { players: 5, names: 'long' } },
        { label: 'Race, public', values: { mode: 'race', public: true } },
        { label: 'Locked, public, Eternal, to 20', values: { locked: true, public: true, difficulty: 'eternal', target: 20 } },
        { label: 'Cruel, no timer', values: { difficulty: 'cruel', timer: '0' } },
        { label: 'Custom difficulty', values: { difficulty: 'custom' } },
        { label: 'Delve together', values: { mode: 'delve' }, group: 'Delve' },
        { label: 'Delve together, twelve', values: { mode: 'delve', players: 12 }, group: 'Delve' },
      ],
      build: room,
    },
    {
      key: 'lobby/at-screen',
      screen: 'lobby',
      group: 'Lobby',
      label: "Players at the host's screen",
      seats: [host('Kalguur'), guest('Doryani')],
      controls: [HERE, MODE],
      states: [
        { label: 'Two at the host’s screen, in Turns', values: {} },
        { label: 'Race: they are set aside', values: { mode: 'race' } },
        { label: 'A full room', values: { here: 10 } },
      ],
      build: (v = {}) => atScreen(['Kalguur', 'Doryani'], v),
    },
    {
      key: 'lobby/here-only',
      screen: 'lobby',
      group: 'Lobby',
      label: "A room that couldn't go online: on this device",
      seats: [host('Kalguur')],
      controls: [HERE, MODE],
      states: [
        { label: 'Alone', values: { here: 0 } },
        { label: 'Two at the screen', values: {} },
        { label: 'Delve', values: { mode: 'delve' } },
      ],
      build: (v = {}) => ({ ...atScreen(['Kalguur'], v), hereOnly: true }),
    },
    {
      key: 'lobby/hot-seat',
      screen: 'lobby',
      group: 'Lobby',
      label: 'Hot-seat: three on one device',
      seats: [{ mode: 'local', me: null }],
      build: () => {
        const t = new Table(TWELVE.slice(0, 3), {}, { host: null });
        return { state: t.s, act: t.room };
      },
    },
    { key: 'lobby/delve-descent', screen: 'lobby', group: 'Delve', label: 'Delve: the descent, by your records', seats: [host('Kalguur')], controls: [RECORDS, TOGETHER, FOUND], build: descent },
  ];
}
