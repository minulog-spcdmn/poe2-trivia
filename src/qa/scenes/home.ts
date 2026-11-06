// The start page: a first visit (under a name made for it, or none) and a returning player, with any number of
// open rooms, Today's unique anywhere along its streak and a release's new items; joining a room, each way it
// goes; and an invite in every state a room can answer in, and turned down for its name.

import type { RoomInfo } from '../../lib/roomInfo.ts';
import { DELVE_RULESET } from '../../lib/delve.ts';
import { PROTOCOL_VERSION } from '../../lib/protocol.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import { nameProblem } from '../../lib/names.ts';
import { dailyQuestion, utcDay } from '../../lib/daily.ts';
import type { Control, Values } from '../bench.ts';
import type { Built, Scene, Step } from '../scene.ts';

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
    ...(v.then ? { steps: THEN[String(v.then)] ?? [] } : {}),
    ...more,
  };
}

/** Today's unique's right answer, as the frame's today asks it: its place among the options (1 on). */
function rightOption(): number {
  const q = dailyQuestion(utcDay(Date.now()));
  return q.options.indexOf(q.itemId) + 1;
}
/** An option of Today's unique (or practice's), by its place (1 on). */
const option = (n: number) => `.daily .options .option:nth-child(${n})`;

/** What happens on a returning player's start page a moment after it shows, played as a player would. */
const THEN: Record<string, Step[]> = {
  // Rooms open and close: the open rooms' tag (a phone's Join a room) fades in, its count steps up and down, it fades out.
  get rooms() {
    return [{ wait: 1000 }, { rooms: rooms(1) }, { wait: 1900 }, { rooms: rooms(3) }, { wait: 1900 }, { rooms: rooms(2) }, { wait: 1900 }, { rooms: [] }];
  },
  // The quill pressed, then Cancel: the rename form swaps in for the greeting and out again, the menu gliding with its height.
  rename: [{ wait: 1000 }, { click: '.hello .quill' }, { wait: 1800 }, { click: '.greeting form button.link' }],
  // Today's unique answered right: the badge reads yesterday's run until its fire lands, then steps up.
  get answer() {
    return [{ wait: 1200 }, { click: option(rightOption()) }];
  },
  // Practice more pressed, then a practice question answered (a returning player's: a newcomer has Identify more in its place).
  practise: [{ wait: 1000 }, { click: '.daily .after .btn.small' }, { wait: 1600 }, { click: option(2) }],
  // The swap between screens (App.svelte), deeper: the Codex opened from the start menu (on a phone, from its pair).
  codex: [{ wait: 1600 }, { click: ':is(.entry:nth-child(3 of .entry) .pick, .pair-pick)' }],
};

/** A returning player's start page: its open rooms and its streak. Today's unique's own bench (qa.html?b=streak) plays the streak growing. */
const BACK: Control[] = [
  {
    kind: 'choice',
    key: 'then',
    label: 'Then',
    default: '',
    options: [
      { value: '', label: 'Nothing' },
      { value: 'rooms', label: 'Rooms open and close (a phone’s tag)' },
      { value: 'rename', label: 'The quill pressed, then Cancel' },
      { value: 'answer', label: 'Today’s unique answered right' },
      { value: 'practise', label: 'Practice more pressed, then answered' },
      { value: 'codex', label: 'Into the Codex' },
    ],
  },
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

/**
 * After a refresh brings a release's new items (lib/releases.ts): the Codex line says how many came with it
 * while any is still to meet. How many came, how many are met, and whether a Delve run shares the line.
 */
const RELEASED: Control[] = [
  { kind: 'toggle', key: 'release', label: 'After a release', default: false },
  { kind: 'range', key: 'count', label: 'New with the release', min: 0, max: 120, default: 39, unit: 'items', when: { release: [true] } },
  { kind: 'range', key: 'met', label: 'Of them met', min: 0, max: 120, default: 3, unit: 'items', when: { release: [true] } },
  { kind: 'toggle', key: 'delved', label: 'A Delve run played', default: true },
];

/** A returning player's start page, and a release's new items if one came. */
function back(v: Values = {}): Built {
  const count = Number(v.count ?? 39);
  return returning(v, { ...(v.release ? { released: { count, met: Math.min(count, Number(v.met ?? 3)) } } : {}), ...(v.delved === false ? { runs: [] } : {}) });
}

/** A guest joining room KXR4QT. */
const GUEST = { mode: 'client' as const, me: null };
/** A join as far as it gets: a code turned down, a host opening its room, a guest on the way, and each way a join gives up (session.svelte.ts' JOIN_FAILED), its sticky notice on the start page. */
const JOIN: Control[] = [
  {
    kind: 'choice',
    key: 'how',
    label: 'The join',
    default: 'travelling',
    options: [
      { value: 'short', label: 'A code too short' },
      { value: 'opening', label: 'Opening a room (a host)' },
      { value: 'travelling', label: 'On the way (a guest)' },
      { value: 'missing', label: 'Never let in: room may be missing' },
      { value: 'blocked', label: 'Never let in: found, no way through' },
      { value: 'server', label: 'Never let in: no server' },
    ],
  },
];
function joining(v: Values = {}): Built {
  const how = String(v.how ?? 'travelling');
  // Join refused for a short code: the notice stays up, so on a phone a tap in a field brings the keyboard up under it (it keeps to the top of what shows).
  if (how === 'short') return returning({}, { steps: [{ toast: 'Room codes have 6 letters and digits.', kind: 'error', opts: { title: 'Code too short' } }] });
  // A host opening its room: after 6 s it says it's still opening the portal.
  if (how === 'opening') return returning({}, { status: 'connecting' });
  // A guest on its way: after 6 s it says it's still going, and why it may take a while.
  if (how === 'travelling') return returning({}, { status: 'connecting', seat: GUEST });
  // A code typed into Join a room and joined, as a player would (the wide layout opens the entry first; on a
  // phone the field is out already): the start page takes the code back into its field, and marks it only
  // when the code is what's in doubt (session.codeDoubted).
  return returning({}, {
    steps: [
      { click: ':is(.entry:nth-child(2 of .entry) .pick, form.join .field.code)' },
      { fill: '.field.code', text: 'KXR4QT' },
      { click: 'form:has(> .field.code) button[type="submit"]' },
      { joinFail: how as 'missing' | 'blocked' | 'server' },
    ],
  });
}

/**
 * What an invite's room answers, and the name this device has: its own goes straight into the join; a made one
 * (a first visit's, lib/madeName.ts) shows the invite with it in the field, selected; none (one let go; ?first
 * on the beta) shows it with the field empty. And whether the room turns the join down for its name (refused).
 */
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
  {
    kind: 'choice',
    key: 'name',
    label: 'The name',
    default: 'own',
    options: [
      { value: 'own', label: 'Their own' },
      { value: 'made', label: 'Made for them' },
      { value: 'none', label: 'None saved' },
    ],
  },
  {
    kind: 'choice',
    key: 'refused',
    label: 'Turned down for its name',
    default: '',
    options: [
      { value: '', label: 'No' },
      { value: 'same', label: 'The same as a player’s' },
      { value: 'like', label: 'A look-alike' },
    ],
  },
  {
    kind: 'choice',
    key: 'then',
    label: 'Then',
    default: 'stay',
    options: [
      { value: 'stay', label: 'Nothing' },
      { value: 'leave', label: '“Something else” is tapped' },
    ],
  },
];
function invite(v: Values = {}): Built {
  const built = v.refused ? refused(v) : inviteFor(v);
  // Something else tapped a moment in: Today's unique comes in after the menu.
  return v.then === 'leave' ? { ...built, steps: [...(built.steps ?? []), { wait: 1200 }, { click: ':is(.pair-pick, .entry:nth-child(2 of .entry) .pick)' }] } : built;
}
/** What the invite's room answers, as `v` has it. */
function answerOf(v: Values): Built['invite'] {
  const asked = room(4, { code: 'KXR4QT', players: 3 });
  return v.room === 'full' ? { ...asked, players: 12, maxPlayers: 12 } : v.room === 'playing' ? { ...asked, phase: 'question' as const } : v.room === 'gone' ? ('gone' as const) : v.room === 'silent' ? null : asked;
}
function inviteFor(v: Values): Built {
  const answer = answerOf(v);
  if (v.name === 'made') return { ...firstVisit(), query: 'room=KXR4QT', invite: answer };
  if (v.name === 'none') return { state: null, name: '', met: [], query: 'room=KXR4QT&first', invite: answer };
  return returning({}, { query: 'room=KXR4QT', invite: answer });
}

/**
 * A join the room turns down for its name: the same name as a player's there, or one that only looks like it.
 * A returning joiner comes by an invite with that name saved, their own from before, so the start page goes
 * straight into the join (Home.svelte) and, turned down, leaves the code in Join a room's row with the room's
 * own words for it, the code not marked (the room answered, so it was right); the name stays theirs, to change
 * at the greeting's quill. With no name saved the name is typed on the invite and joined with: turned down, it
 * stays in its field to change, with the focus, and isn't saved (lib/joinName.ts), so the page still says
 * Welcome rather than Welcome back. (A made name is typed over in its field the same way.)
 */
function refused(v: Values): Built {
  // The name turned down, with the room's words for it, as nameProblem gives them to the host.
  const joiner = v.refused === 'like' ? 'Pixe1' : 'pixel';
  const why = nameProblem(joiner, ['Doryani', 'Pixel'])!;
  const invite = answerOf(v);
  const typed: Step[] = [{ fill: '.field.name', text: joiner }, { click: 'form.slot button[type="submit"]' }, { refused: why }];
  if (v.name === 'none') return { state: null, name: '', met: [], query: 'room=KXR4QT', invite, steps: typed };
  if (v.name === 'made') return { ...firstVisit(), query: 'room=KXR4QT', invite, steps: typed };
  return returning({}, { name: joiner, query: 'room=KXR4QT', invite, steps: [{ refused: why }] });
}

/** A name made for a first visit (lib/madeName.ts), as a newcomer's browser has from its first load. */
const MADE = 'Ashen Wanderer';
/** A first visit: a name made for it, nothing played, no rooms open. */
const firstVisit = (): Built => ({ state: null, name: MADE, stored: { 'name.made': MADE }, met: [], rooms: [] });

/**
 * A first visit: the name made for it, or none (one let go, one this device can't play under, or never made:
 * New game and Join a room ask for one). A made name before the first game says a name of one's own can be
 * chosen (beside it; on touch the name and the quill on the line after the comma); after it, the greeting is
 * anyone's.
 *
 * After Today's unique, a newcomer (no game started here, lib/started.ts) is offered Identify more, a run alone,
 * in Practice more's place; a returning player keeps Practice more (Back again's Then). Identify more is gold, on
 * a phone too (New game's gold is a scroll away up the page), until a row opens (Start or Join takes it) or a
 * join is on its way (none then).
 */
const FIRST: Control[] = [
  {
    kind: 'choice',
    key: 'name',
    label: 'The name',
    default: 'made',
    options: [
      { value: 'made', label: 'Made for them' },
      { value: 'none', label: 'None saved' },
    ],
  },
  { kind: 'toggle', key: 'played', label: 'A game played since', default: false },
  {
    kind: 'choice',
    key: 'today',
    label: 'Today’s unique',
    default: '',
    options: [
      { value: '', label: 'Never played' },
      { value: 'right', label: 'Answered right' },
      { value: 'waiting', label: 'Not yet, missed yesterday' },
    ],
  },
  {
    kind: 'choice',
    key: 'row',
    label: 'The menu',
    default: 'none',
    options: [
      { value: 'none', label: 'Nothing open' },
      { value: 'create', label: 'New game’s row open (no name saved)' },
      { value: 'join', label: 'Join a room’s row open' },
      { value: 'connecting', label: 'Joining, on its way' },
    ],
  },
];
function first(v: Values = {}): Built {
  const base: Built = v.name === 'none' ? { state: null, name: '', met: [], rooms: [] } : v.played ? { ...firstVisit(), stored: { 'name.made': MADE, started: '1' } } : firstVisit();
  const daily = v.today === 'right' ? today(1, 'right') : v.today === 'waiting' ? today(0, 'waiting') : undefined;
  const built: Built = daily ? { ...base, daily } : base;
  if (v.row === 'connecting') return { ...built, status: 'connecting' };
  // (New game's row opens only without a name, one let go: with one, a made one too, New game hosts straight away.)
  if (v.row === 'create') return { ...built, name: '', stored: {}, steps: [{ click: ':is(.entry:nth-child(1 of .entry) .pick, .act .btn.big)' }] };
  if (v.row === 'join') return { ...built, steps: [{ click: ':is(.entry:nth-child(2 of .entry) .pick, form.join .field.code)' }] };
  return built;
}

const home = (key: string, label: string, s: Omit<Scene, 'key' | 'label' | 'screen' | 'group' | 'seats'>, group = 'Start page'): Scene => ({ key: `home/${key}`, screen: 'home', group, label, seats: [ME], ...s });

export function homeScenes(): Scene[] {
  return [
    home('first-visit', 'A first visit', {
      controls: FIRST,
      states: [
        { label: 'A first visit: a name made for it', values: {} },
        { label: 'The made name kept after a first game: greeted as anyone, Welcome back', values: { played: true }, listed: false },
        { key: 'home/no-name', label: 'No name saved: New game and Join a room ask for one', values: { name: 'none' }, listed: false },
        { key: 'home/after-daily', label: 'Today’s unique answered: Identify more in Practice more’s place, gold', values: { today: 'right' }, listed: false },
        { label: 'Today’s unique not answered yet', values: { today: 'waiting' }, listed: false },
        { label: 'Today’s unique answered, no name saved, New game’s row open: Start holds the gold', values: { today: 'right', row: 'create' }, listed: false },
        { label: 'Today’s unique answered, Join a room’s row open: Join holds the gold', values: { today: 'right', row: 'join' }, listed: false },
        { label: 'Today’s unique answered, joining a room: no gold, Identify more waits', values: { today: 'right', row: 'connecting' }, listed: false },
      ],
      build: first,
    }),
    home('returning', 'Back again', {
      controls: [...BACK, ...RELEASED],
      states: [
        { label: 'Back again: a codex, runs, a streak, open rooms', values: {} },
        { label: 'Back again, no rooms open', values: { rooms: 0 }, listed: false },
        { label: 'The most rooms the list shows (60)', values: { rooms: 60 }, listed: false },
        { label: 'Rooms opening and closing: the tag fades in, its count steps, it fades out (a phone)', values: { rooms: 0, then: 'rooms' } },
        { label: 'The quill pressed, then Cancel: the rename form swaps in and out', values: { then: 'rename' }, listed: false },
        { label: "Today's unique, not answered yet, a streak of 7 waiting", values: { today: 'waiting' }, listed: false },
        { label: "Today's unique answered right: the badge steps up from 7 once its fire lands", values: { today: 'waiting', then: 'answer' } },
        { label: "Today's unique after a forgotten day, a streak of 7 kept by the grace", values: { today: 'forgiven' }, listed: false },
        { label: "Today's unique after a forgotten day, the grace not back yet: the streak is gone", values: { today: 'lapsed' }, listed: false },
        { label: "Today's unique answered, a streak of a year", values: { days: 365 }, listed: false },
        { label: "Today's unique missed, a streak of 30 ended", values: { today: 'missed', days: 30 }, listed: false },
        { label: "Today's unique missed, a streak of a year ended: on a phone, Practice more beside it still", values: { today: 'missed', days: 365 }, listed: false },
        { label: 'Practice more pressed, then a practice question answered', values: { then: 'practise' }, listed: false },
        { key: 'home/to-codex', label: 'Into the Codex', values: { then: 'codex' }, listed: false },
        { key: 'home/new-release', label: 'After a release, 39 items new with 1.0, 3 of them met: the Codex line counts them', values: { release: true }, listed: false },
        { label: 'After a release, no Delve run yet: the count without the deepest', values: { release: true, delved: false }, listed: false },
        { label: 'After a release, all 39 met: the line as before', values: { release: true, met: 39 }, listed: false },
        { label: 'After a release, none new (as today, before the refresh): the line as before', values: { release: true, count: 0, met: 0 }, listed: false },
      ],
      build: back,
    }),
    home('joining', 'Joining a room', {
      controls: JOIN,
      states: [
        { label: 'Joining a room: travelling, then still on the way', values: {} },
        { key: 'home/code-short', label: 'Joining with a code too short: the notice', values: { how: 'short' }, listed: false },
        { key: 'home/connecting', label: 'Opening a room: the portal, then still opening it', values: { how: 'opening' }, listed: false },
        { key: 'home/join-failed', label: 'The server said the room may be missing: No answer, the code marked', values: { how: 'missing' }, listed: false },
        { label: 'The room was found, the connection never came up: Couldn’t connect, the code left as typed', values: { how: 'blocked' }, listed: false },
        { label: 'The matchmaking server never answered: No connection, the code left as typed', values: { how: 'server' }, listed: false },
      ],
      build: joining,
    }),
    home(
      'invite',
      'An invite link',
      {
        controls: INVITE,
        states: [
          { label: 'An invite link to an open room', values: {} },
          { label: 'An invite link under a made name: the field holds it, selected', values: { name: 'made' }, listed: false },
          { label: 'An invite link with no name saved', values: { name: 'none' }, listed: false },
          { label: 'An invite link under a made name, then Something else', values: { name: 'made', then: 'leave' } },
          { label: 'An invite to a full room', values: { room: 'full' }, listed: false },
          { label: 'An invite to a room mid-game', values: { room: 'playing' }, listed: false },
          { label: 'An invite to a room that has closed', values: { room: 'gone' }, listed: false },
          { label: "An invite to a room that doesn't answer", values: { room: 'silent' }, listed: false },
          { key: 'home/refused', label: 'Turned down: a player there has the same name', values: { refused: 'same' }, listed: false },
          { label: 'Turned down: the name looks like a player’s there', values: { refused: 'like' }, listed: false },
          { label: 'Turned down with no name saved: the name typed stays in its field, unsaved', values: { refused: 'same', name: 'none' }, listed: false },
        ],
        build: invite,
      },
      'Invites',
    ),
  ];
}
