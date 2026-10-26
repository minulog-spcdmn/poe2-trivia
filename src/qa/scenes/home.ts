// The start page: a first visit and a returning player, with any number of
// open rooms and Today's unique anywhere along its streak; joining a room;
// and an invite in every state a room can answer in.

import type { RoomInfo } from '../../lib/roomInfo.ts';
import { DELVE_RULESET } from '../../lib/delve.ts';
import { PROTOCOL_VERSION } from '../../lib/protocol.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import { nameProblem } from '../../lib/names.ts';
import type { Control, Values } from '../bench.ts';
import type { Built, Scene } from '../scene.ts';

const ME = { mode: 'none' as const, me: null };

const HOSTS = ['Doryani', 'Una of the Vaal', 'Rog', 'Alva', 'Dannig', 'Hooded One', 'Zelina', 'Oswin', 'Finn', 'Sekhema Asala', 'Renly'];
const CODES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** A made-up open room on this version (an older host's the list leaves out); `n` makes its code and host differ from the others'. */
function room(n: number, o: Partial<RoomInfo> = {}): RoomInfo {
  const code = Array.from({ length: 6 }, (_, i) => CODES[(n * 7 + i * 11) % CODES.length]).join('');
  return { code, host: HOSTS[n % HOSTS.length], players: 1 + (n % 5), maxPlayers: 12, spectators: n % 3 === 0 ? 1 : 0, maxSpectators: 8, mode: (['turns', 'race', 'delve'] as const)[n % 3], difficulty: 'merciless', target: 10, phase: 'lobby', v: PROTOCOL_VERSION, ...o };
}
/** `n` open rooms: the first three a lobby, a game under way and a Delve run, then all sorts. */
function rooms(n: number): RoomInfo[] {
  const first = [room(1), room(2, { phase: 'question' }), room(3, { mode: 'delve', phase: 'choosing', depth: 31 })];
  return Array.from({ length: n }, (_, i) => first[i] ?? room(i + 1, { players: 1 + (i % 12), phase: i % 4 ? 'lobby' : 'locked' }));
}

/**
 * Today's unique as this device last had it (its days, lib/daily.ts DailyLog): a streak of `days`, today
 * answered right, not yet (after yesterday, or after a forgotten day the grace forgives), or missed (ending the
 * streak). With no streak, a miss.
 */
function today(days: number, how: string): NonNullable<Built['daily']> {
  const run = (n: number, last = '1') => (n > 0 ? '0'.repeat(n - 1) + last : '5');
  if (how === 'missed') return { days: '0'.repeat(days) + '7', daysAgo: 0 };
  if (how === 'waiting') return { days: run(days), daysAgo: 1 };
  if (how === 'forgiven') return { days: run(days), daysAgo: 2 };
  // A day skipped while the grace is still being earned back (a day forgiven before the last three answered): the run is gone, and nothing says so until it starts over.
  if (how === 'lapsed') return { days: '0'.repeat(Math.max(1, days - 3)) + '.000', daysAgo: 2 };
  return { days: run(days, '2'), daysAgo: 0 };
}

/** A returning player's past: items met, Delve runs, open rooms, Today's unique on a streak. */
function returning(v: Values = {}, more: Partial<Built> = {}): Built {
  const runs: DelveRun[] = [12, 19, 27, 23].map((depth, i) => ({ id: 1000 + i, at: 1000 + i, depth, players: 1, ruleset: DELVE_RULESET, mixed: false }));
  return {
    state: null,
    met: ['Headhunter', 'Ingenuity', 'Briarpatch', 'Death Rush', "Kaom's Heart", "Atziri's Disdain", 'Mageblood', 'Chainsting'],
    runs,
    daily: today(Number(v.days ?? 7), String(v.today ?? 'right')),
    rooms: rooms(Number(v.rooms ?? 3)),
    ...more,
  };
}

/** A returning player's start page: its open rooms and its streak. Today's unique's own bench (qa.html?b=streak) plays the streak growing. */
const BACK: Control[] = [
  { kind: 'range', key: 'rooms', label: 'Open rooms', min: 0, max: 60, default: 3 },
  { kind: 'range', key: 'days', label: 'Streak', min: 0, max: 730, default: 7, unit: 'days' },
  {
    kind: 'choice',
    key: 'today',
    label: "Today's unique",
    default: 'right',
    options: [
      { value: 'right', label: 'Answered right' },
      { value: 'waiting', label: 'Not answered yet' },
      { value: 'forgiven', label: 'Not yet, a day skipped' },
      { value: 'lapsed', label: 'Not yet, skipped, no grace' },
      { value: 'missed', label: 'Missed' },
    ],
  },
];

/** What an invite's room answers, and whether it's this device's first visit. */
const INVITE: Control[] = [
  {
    kind: 'choice',
    key: 'room',
    label: 'The room',
    default: 'open',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'full', label: 'Full' },
      { value: 'playing', label: 'Mid-game' },
      { value: 'gone', label: 'Closed' },
      { value: 'silent', label: "Doesn't answer" },
    ],
  },
  { kind: 'toggle', key: 'first', label: 'A first visit', default: false },
];
function invite(v: Values = {}): Built {
  const asked = room(4, { code: 'KXR4QT', players: 3 });
  const answer = v.room === 'full' ? { ...asked, players: 12, maxPlayers: 12 } : v.room === 'playing' ? { ...asked, phase: 'question' as const } : v.room === 'gone' ? ('gone' as const) : v.room === 'silent' ? null : asked;
  const query = v.first ? 'room=KXR4QT&first' : 'room=KXR4QT';
  return v.first ? { state: null, name: '', met: [], query, invite: answer } : returning({}, { query, invite: answer });
}

/**
 * A join the room turns down for its name: the same name as a player's there, or one that only looks like it.
 * A returning joiner comes by an invite with that name saved, their own from before, so the start page goes
 * straight into the join (Home.svelte) and, turned down, leaves the code in Join a room's row with the room's
 * own words for it; the name stays theirs, to change at the greeting's quill. On a first visit the name is
 * typed on the invite and joined with: turned down, it stays in its field to change, and isn't saved
 * (lib/joinName.ts), so the page still says Welcome rather than Welcome back.
 */
const REFUSED: Control[] = [
  {
    kind: 'choice',
    key: 'name',
    label: 'The name',
    default: 'same',
    options: [
      { value: 'same', label: 'The same as a player’s' },
      { value: 'like', label: 'A look-alike' },
    ],
  },
  { kind: 'toggle', key: 'first', label: 'A first visit', default: false },
];
function refused(v: Values = {}): Built {
  // The name turned down, with the room's words for it, as nameProblem gives them to the host.
  const joiner = v.name === 'like' ? 'Pixe1' : 'pixel';
  const why = nameProblem(joiner, ['Doryani', 'Pixel'])!;
  const invite = room(4, { code: 'KXR4QT', players: 3 });
  if (v.first)
    return { state: null, name: '', met: [], query: 'room=KXR4QT', invite, steps: [{ fill: '.field.name', text: joiner }, { click: 'form.slot button[type="submit"]' }, { refused: why }] };
  return returning({}, { name: joiner, query: 'room=KXR4QT', invite, steps: [{ refused: why }] });
}

const home = (key: string, label: string, s: Omit<Scene, 'key' | 'label' | 'screen' | 'group' | 'seats'>, group = 'Start page'): Scene => ({ key: `home/${key}`, screen: 'home', group, label, seats: [ME], ...s });

export function homeScenes(): Scene[] {
  return [
    home('first-visit', 'A first visit: no name yet, nothing played', { build: () => ({ state: null, name: '', met: [], rooms: [] }) }),
    home('returning', 'Back again', {
      controls: BACK,
      states: [
        { label: 'Back again: a codex, runs, a streak, three open rooms', values: {} },
        { label: 'Back again, no rooms open', values: { rooms: 0 } },
        { label: 'The most rooms the list shows (60)', values: { rooms: 60 } },
        { label: "Today's unique, not answered yet, a streak of 7 waiting", values: { today: 'waiting' }, group: "Today's unique" },
        { label: "Today's unique after a forgotten day, a streak of 7 kept by the grace", values: { today: 'forgiven' }, group: "Today's unique" },
        { label: "Today's unique after a forgotten day, the grace not back yet: the streak is gone", values: { today: 'lapsed' }, group: "Today's unique" },
        { label: "Today's unique answered, a streak of a year", values: { days: 365 }, group: "Today's unique" },
        { label: "Today's unique missed, a streak of 30 ended", values: { today: 'missed', days: 30 }, group: "Today's unique" },
      ],
      build: (v) => returning(v),
    }),
    home('connecting', 'Joining a room: connecting', { build: () => returning({}, { status: 'connecting' }) }),
    home(
      'invite',
      'An invite link',
      {
        controls: INVITE,
        states: [
          { label: 'An invite link to an open room', values: {} },
          { label: 'An invite link on a first visit', values: { first: true } },
          { label: 'An invite to a full room', values: { room: 'full' } },
          { label: 'An invite to a room mid-game', values: { room: 'playing' } },
          { label: 'An invite to a room that has closed', values: { room: 'gone' } },
          { label: "An invite to a room that doesn't answer", values: { room: 'silent' } },
        ],
        build: invite,
      },
      'Invites',
    ),
    home(
      'refused',
      'A join turned down for its name',
      {
        controls: REFUSED,
        states: [
          { label: 'Turned down: a player there has the same name', values: {} },
          { label: 'Turned down: the name looks like a player’s there', values: { name: 'like' } },
          { label: 'Turned down on a first visit: the name typed stays in its field, unsaved', values: { first: true } },
        ],
        build: refused,
      },
      'Invites',
    ),
    // The swap between screens (App.svelte), deeper: the Codex opened from the start menu (on a phone, from its pair).
    home('to-codex', 'Into the Codex', { build: () => returning({}, { steps: [{ wait: 1600 }, { click: ':is(.entry:nth-child(3 of .entry) .pick, .pair-pick)' }] }) }, 'Moving between screens'),
  ];
}
