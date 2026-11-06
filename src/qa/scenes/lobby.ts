// The lobby: a room of any size, game and settings, from the host's seat, a
// guest's and a spectator's, as it is or as it changes (settings, a player
// arriving, the gallery, the host's own clicks); players at the host's
// screen, a room that couldn't go online, and hot-seat; and the descent a
// Delve lobby draws from this device's records.

import { MAX_PLAYERS, TIMER_STEPS, type Settings } from '../../lib/game.ts';
import { DELVE_RULESET, FINDS_IN_ORDER } from '../../lib/delve.ts';
import type { Answer } from '../../lib/codex.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import type { Control, Values } from '../bench.ts';
import { id, pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import { nameProblem } from '../../lib/names.ts';
import type { Built, Scene, Seat, Step } from '../scene.ts';

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
/** Where the room is: online, one that couldn't go online (on this device only), or none at all, hot-seat. */
const WHERE: Control = {
  kind: 'choice',
  key: 'where',
  label: 'The room',
  default: 'online',
  options: [
    { value: 'online', label: 'Online' },
    { value: 'here', label: 'Couldn’t go online: this device only' },
    { value: 'hot-seat', label: 'None: hot-seat' },
  ],
};
/** A name turned down at the host's screen, its notice up. */
const NAME_REFUSED: Control = { kind: 'toggle', key: 'refused', label: 'A name turned down', default: false };

function atScreen(names: string[], v: Values): Built {
  const t = new Table(names);
  const here = TWELVE.filter((n) => !names.includes(n)).slice(0, Number(v.here ?? 2));
  for (const name of here) t.act({ type: 'join', playerId: pid(name), name, local: true });
  if (v.mode && v.mode !== 'turns') t.act({ type: 'settings', settings: { mode: v.mode as Settings['mode'] } });
  return { state: t.s, act: t.room };
}

/** Players at one screen: the host's in an online room, in one that couldn't go online, or hot-seat's, everyone on one device (as many as the host and those at its screen). */
function oneScreen(v: Values = {}): Built {
  const where = String(v.where ?? 'online');
  let built: Built;
  if (where === 'hot-seat') {
    const t = new Table(TWELVE.slice(0, 1 + Number(v.here ?? 2)), v.mode && v.mode !== 'turns' ? { mode: v.mode as Settings['mode'] } : {}, { host: null });
    built = { state: t.s, act: t.room, seat: { mode: 'local', me: null } };
  } else if (where === 'here') {
    // (A room that never went online has no guest: the host's seat alone.)
    built = { ...atScreen(['Kalguur'], v), hereOnly: true, seat: host('Kalguur') };
  } else built = atScreen(['Kalguur', 'Doryani'], v);
  if (!v.refused) return built;
  // A name turned down at the host's screen: the notice stays up, so on a phone a tap in the name field brings the keyboard up under it (it keeps under what shows of the header, or to the top of what shows).
  // The host's seat alone: only the host's screen has the field, so a guest never sees the refusal.
  // (One already playing here: a name too short can't be added at all, its Add greyed out.)
  return { ...built, ...(built.seat ? {} : { seat: host('Kalguur') }), steps: [{ toast: nameProblem('Doryani', ['Kalguur', 'Doryani'])!, kind: 'error' }] };
}

/** The room as the host has set it, played through the engine. */
function table(v: Values): Table {
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
  return new Table(names, settings);
}

/** A room, as it is or as something happens in it (HAPPENS). */
function room(v: Values = {}): Built {
  const happens = String(v.happens ?? '');
  if (happens in CLICKS) return moves(v, happens);
  if (happens) return live(v, happens);
  const t = table(v);
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
/** A second player joining as it shows: the records turn from the runs alone to those together (runs of both kept). */
const JOINS: Control = { kind: 'toggle', key: 'joins', label: 'Doryani joins, live', default: false };
/** The runs together kept beside those alone, for the join: best 31, last 18. */
const TOGETHER_RUNS: DelveRun[] = [31, 18].map((depth, n) => ({ id: 3100 + n, at: 3100 + n, depth, players: 2, ruleset: DELVE_RULESET, mixed: false, perished: [depth] }));

function descent(v: Values = {}): Built {
  const joins = !!v.joins;
  const together = !!v.together && !joins;
  const [best, last] = DEPTHS[String(v.records)] ?? DEPTHS['best-last'];
  const players = together ? 3 : 1;
  const run = (n: number, depth: number): DelveRun => ({ id: 3000 + n, at: 3000 + n, depth, players, ruleset: DELVE_RULESET, mixed: false, ...(together ? { perished: [depth] } : {}) });
  const runs = [best ? run(0, best) : null, last ? run(1, last) : null].filter((r): r is DelveRun => !!r);
  const log: Answer[] = v.finds === false ? [] : FINDS_IN_ORDER.map((f, i) => ({ t: 3000 + i, id: id('Headhunter'), mode: 'name', ok: true, difficulty: 'cruel', race: false, depth: f.from, run: 3000, find: f.kind }));
  const t = new Table(together ? ['Kalguur', 'Doryani', 'Una of the Vaal'] : ['Kalguur'], { mode: 'delve' });
  if (!joins) return { state: t.s, act: t.room, runs, log };
  const shown = t.s;
  t.act({ type: 'join', playerId: pid('Doryani'), name: 'Doryani' }, 'Doryani');
  return { state: shown, act: t.room, runs: [...runs, ...TOGETHER_RUNS], log, steps: [{ wait: 3200 }, { then: t.s }] };
}

/** What happens in a room as it shows: the room's own moves, as the host's word of each reaches the seat, or this device's host's own clicks. */
const HAPPENS: Control = {
  kind: 'choice',
  key: 'happens',
  label: 'What happens',
  default: '',
  options: [
    { value: '', label: 'Nothing' },
    { value: 'settings', label: 'The host sets the game: points, difficulty, timer, lock' },
    { value: 'arrives', label: 'A player arrives' },
    { value: 'gallery', label: 'A player goes to watch, and comes back' },
    { value: 'offline', label: 'A player goes offline, and comes back' },
    { value: 'host-leaves', label: 'The host leaves: the next one hosts' },
    { value: 'onlookers', label: 'Two arrive to watch' },
    { value: 'sigils', label: 'Sigils put on, changed and taken off' },
    { value: 'mode', label: 'The host clicks Delve, then Take turns' },
    { value: 'lock', label: 'The host locks it, then unlocks it' },
    { value: 'invite', label: 'The host copies the invite link' },
    { value: 'hide', label: 'The host hides the code, then shows it' },
    { value: 'custom', label: 'The host steps through Custom’s editor' },
  ],
};
/** Who comes to watch, in order: those of them already playing are passed over. */
const ONLOOKERS = ['Finn', 'Renly', 'Tujen', 'Gwennen'];

/**
 * A room as it changes, a move at a time, as the host's word of each would
 * reach the seat: the guest reading the host's settings as they change (each
 * value dropping in), a host joined by another player (alone: the waiting
 * line going, a seat lit), a player stepping over to the gallery and back.
 * The one who moves is the last to sit down (Una of the Vaal, of three).
 */
function live(v: Values, happens: string): Built {
  const t = table(v);
  const names = t.s.players.map((p) => p.name);
  const last = names.length > 1 ? names.at(-1)! : null;
  const shown = t.s;
  const steps: Step[] = [];
  const then = (wait: number, by: () => void) => {
    by();
    steps.push({ wait }, { then: t.s });
  };
  if (happens === 'settings') {
    then(1400, () => t.act({ type: 'settings', settings: { targetScore: 15 } }));
    then(1200, () => t.act({ type: 'settings', settings: { difficulty: 'eternal' } }));
    then(1200, () => t.act({ type: 'settings', settings: { timer: 32 } }));
    then(1200, () => t.act({ type: 'settings', settings: { locked: true } }));
  } else if (happens === 'arrives') {
    const next = TWELVE[names.length];
    if (next) then(1600, () => t.act({ type: 'join', playerId: pid(next), name: next }, next));
  } else if (happens === 'offline') {
    if (last) {
      then(1400, () => t.act({ type: 'connection', playerId: pid(last), connected: false }, null));
      then(2200, () => t.act({ type: 'connection', playerId: pid(last), connected: true }, null));
    }
  } else if (happens === 'host-leaves') {
    // (No move of the game's hands a room over: the room as a new host would carry it on, set by hand.)
    if (last) then(1600, () => (t.s = { ...t.s, hostId: pid(names[1]), players: t.s.players.filter((p) => p.name !== 'Kalguur') }));
  } else if (happens === 'onlookers') {
    for (const [i, name] of ONLOOKERS.filter((n) => !names.includes(n)).slice(0, 2).entries()) then(i ? 1200 : 1400, () => t.act({ type: 'join', playerId: pid(name), name, watch: true }, name));
  } else if (happens === 'sigils') {
    const [, second, third] = names;
    if (second) then(1400, () => t.act({ type: 'sigil', sigil: 'witch' }, second));
    if (third) then(1200, () => t.act({ type: 'sigil', sigil: 'ranger' }, third));
    if (second) then(1400, () => t.act({ type: 'sigil', sigil: 'monk' }, second));
    if (third) then(1400, () => t.act({ type: 'sigil' }, third));
  } else if (last) {
    then(1600, () => t.act({ type: 'watch', watch: true }, last));
    then(2200, () => t.act({ type: 'watch', watch: false }, last));
  }
  // The host's seat, and (but for the arrival, where there's none to see it from before) a guest's.
  // The host's leaving from a third seat, whose host it was and who sees the banner come to Doryani.
  const seat =
    happens === 'settings' ? (names[1] ? guest(names[1]) : undefined) : happens === 'arrives' ? host('Kalguur') : happens === 'host-leaves' && names.length > 2 ? guest(names.at(-1)!) : undefined;
  return { state: shown, act: t.room, steps, ...(seat ? { seat } : {}) };
}

/** The steps for each of the host's own clicks (HAPPENS): a wait, then a click, a moment in, and where it's a toggle, back. */
const CLICKS: Record<string, [number, string][]> = {
  mode: [
    [1200, '.modes button[data-mode="delve"]'],
    [1600, '.modes button[data-mode="turns"]'],
  ],
  lock: [
    [1200, 'button.lock'],
    [1800, 'button.lock'],
  ],
  invite: [[1200, 'button.invite']],
  hide: [
    [1200, 'button.room-tool[data-cursor="hide"]'],
    [1800, 'button.room-tool[data-cursor="hide"]'],
  ],
  // Custom (picked) opens its editor; then Options, its first row, from 6 to 8, 10, 4 and back.
  custom: [
    [1000, '.seg button.edit'],
    [1000, '.editor .track button:nth-of-type(3)'],
    [900, '.editor .track button:nth-of-type(4)'],
    [900, '.editor .track button:nth-of-type(1)'],
    [900, '.editor .track button:nth-of-type(2)'],
  ],
};

/** The room as its host's own clicks change it: what each click does on this device, from the host's seat. */
function moves(v: Values, does: string): Built {
  // (Custom's editor needs Custom picked.)
  const t = table(does === 'custom' ? { ...v, difficulty: 'custom' } : v);
  const clicks = CLICKS[does].flatMap(([wait, click]): Step[] => [{ wait }, { click }]);
  // (Copied whether or not the frame may write to the clipboard.)
  // The host's clicks change the room, as they would (Built.own), rather than only saying what they'd send.
  return { state: t.s, act: t.room, own: true, seat: host('Kalguur'), steps: does === 'invite' ? [{ clipboard: true }, ...clicks] : clicks };
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
      controls: [...ROOM, HAPPENS],
      states: [
        { label: 'Three players', values: {} },
        { label: 'The host, waiting alone', values: { players: 1 }, listed: false },
        { label: 'Three players and someone watching', values: { watching: 1 }, listed: false },
        { label: 'A full room: twelve', values: { players: 12 }, listed: false },
        { label: 'Una of the Vaal went offline', values: { offline: 'Una of the Vaal' }, listed: false },
        { label: 'Long names', values: { players: 5, names: 'long' }, listed: false },
        { label: 'Race, public', values: { mode: 'race', public: true }, listed: false },
        { label: 'Locked, public, Eternal, to 20', values: { locked: true, public: true, difficulty: 'eternal', target: 20 } },
        { label: 'Cruel, no timer', values: { difficulty: 'cruel', timer: '0' }, listed: false },
        { label: 'Custom difficulty', values: { difficulty: 'custom' }, listed: false },
        { label: 'Delve together', values: { mode: 'delve' }, listed: false },
        { label: 'Delve together, twelve', values: { mode: 'delve', players: 12 }, group: 'Delve' },
        { label: 'The host, alone, joined by a second player', values: { happens: 'arrives', players: 1 } },
        { key: 'lobby/live', label: 'A guest reads the host’s settings as they change', values: { happens: 'settings' }, listed: false },
        { label: 'A player goes to the gallery, and comes back', values: { happens: 'gallery' }, listed: false },
        { label: 'A player goes offline, and comes back', values: { happens: 'offline' }, listed: false },
        { label: 'The host leaves: the banner comes to Doryani', values: { happens: 'host-leaves' }, listed: false },
        { label: 'Two arrive to watch', values: { happens: 'onlookers' }, listed: false },
        { label: 'Sigils put on, changed and taken off', values: { happens: 'sigils' }, listed: false },
        { key: 'lobby/moves', label: 'Delve picked, then Take turns: Begin glides both ways', values: { happens: 'mode' }, listed: false },
        { label: 'Locked, then unlocked', values: { happens: 'lock' }, listed: false },
        { label: 'The invite link copied', values: { happens: 'invite' }, listed: false },
        { label: 'The code hidden, then shown', values: { happens: 'hide' }, listed: false },
        { label: 'Custom’s editor, stepped through', values: { happens: 'custom', difficulty: 'custom' }, listed: false },
      ],
      build: room,
    },
    {
      key: 'lobby/at-screen',
      screen: 'lobby',
      group: 'Lobby',
      label: "Players at the host's screen",
      // (A room that couldn't go online, hot-seat and a name turned down pick their own, Built.seat.)
      seats: [host('Kalguur'), guest('Doryani')],
      controls: [WHERE, HERE, MODE, NAME_REFUSED],
      states: [
        { label: 'Two at the host’s screen, in Turns', values: {} },
        { label: 'Race: they are set aside', values: { mode: 'race' }, listed: false },
        { label: 'A full room', values: { here: 10 }, listed: false },
        { key: 'lobby/name-refused', label: 'A name turned down at the host’s screen: the notice', values: { refused: true }, listed: false },
        { key: 'lobby/here-only', label: 'A room that couldn’t go online: on this device, alone', values: { where: 'here', here: 0 } },
        { label: 'A room that couldn’t go online: two at the screen', values: { where: 'here' }, listed: false },
        { label: 'A room that couldn’t go online: Delve', values: { where: 'here', mode: 'delve' }, listed: false },
        { key: 'lobby/hot-seat', label: 'Hot-seat: three on one device', values: { where: 'hot-seat' }, listed: false },
      ],
      build: oneScreen,
    },
    {
      key: 'lobby/delve-descent',
      screen: 'lobby',
      group: 'Delve',
      label: 'Delve: the descent, by your records',
      seats: [host('Kalguur')],
      controls: [RECORDS, TOGETHER, FOUND, JOINS],
      states: [
        { label: 'Delve: the descent, by your records', values: {} },
        { label: 'A second player joins: the records turn to the co-op ones', values: { joins: true }, listed: false },
      ],
      build: descent,
    },
  ];
}
