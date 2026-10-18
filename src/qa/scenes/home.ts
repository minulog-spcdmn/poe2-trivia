// The start page: a first visit and a returning player, the open rooms
// (none, a few, the most the list shows), an invite in every state a room
// can answer in, joining, and Today's unique along its streak.

import type { RoomInfo } from '../../lib/roomInfo.ts';
import { DELVE_RULESET } from '../../lib/delve.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import type { Built, Knob, Scene } from '../scene.ts';

const ME = { mode: 'none' as const, me: null };

const HOSTS = ['Doryani', 'Una of the Vaal', 'Rog', 'Alva', 'Dannig', 'Hooded One', 'Zelina', 'Oswin', 'Finn', 'Sekhema Asala', 'Renly'];
const CODES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** A made-up open room; `n` makes its code and host differ from the others'. */
function room(n: number, o: Partial<RoomInfo> = {}): RoomInfo {
  const code = Array.from({ length: 6 }, (_, i) => CODES[(n * 7 + i * 11) % CODES.length]).join('');
  return { code, host: HOSTS[n % HOSTS.length], players: 1 + (n % 5), maxPlayers: 12, spectators: n % 3 === 0 ? 1 : 0, maxSpectators: 8, mode: (['turns', 'race', 'delve'] as const)[n % 3], difficulty: 'merciless', target: 10, phase: 'lobby', ...o };
}

/** A returning player's past: items met, Delve runs, today answered on a streak. */
function returning(more: Partial<Built> = {}): Built {
  const runs: DelveRun[] = [12, 19, 27, 23].map((depth, i) => ({ id: 1000 + i, at: 1000 + i, depth, players: 1, ruleset: DELVE_RULESET, mixed: false }));
  return {
    state: null,
    met: ['Headhunter', 'Ingenuity', 'Briarpatch', 'Death Rush', "Kaom's Heart", "Atziri's Disdain", 'Mageblood', 'Chainsting'],
    runs,
    daily: { daysAgo: 0, picked: 2, ok: true, streak: 7, ended: 0 },
    rooms: [room(1), room(2, { phase: 'question' }), room(3, { mode: 'delve', phase: 'choosing', depth: 31 })],
    ...more,
  };
}

const home = (key: string, label: string, build: () => Built, group = 'Start page'): Scene => ({ key: `home/${key}`, screen: 'home', group, label, seats: [ME], build });

/** Today's unique along its streak's ladder (lib/fx/streaks): the badge for any run, today answered or not. The streak's bench (qa.html?b=streak) plays it growing. */
const DAYS: Knob = { key: 'days', label: 'Streak', default: '7', options: ['0', '1', '2', '3', '5', '7', '14', '30', '60', '100', '200', '365', '730'].map((d) => ({ value: d, label: d === '1' ? '1 day' : `${d} days` })) };
const TODAY: Knob = {
  key: 'today',
  label: 'Today',
  default: 'right',
  options: [
    { value: 'right', label: 'Answered right' },
    { value: 'waiting', label: 'Not answered yet' },
    { value: 'missed', label: 'Missed' },
  ],
};

export function homeScenes(): Scene[] {
  return [
    home('first-visit', 'A first visit: no name yet, nothing played', () => ({ state: null, name: '', met: [], rooms: [] })),
    home('returning', 'Back again: a name, a codex, runs and a streak; three open rooms', () => returning()),
    home('no-rooms', 'Back again, no rooms open', () => returning({ rooms: [] })),
    home('sixty-rooms', 'The most rooms the list shows (60)', () => returning({ rooms: Array.from({ length: 60 }, (_, i) => room(i + 1, { players: 1 + (i % 12), phase: i % 4 ? 'lobby' : 'locked' })) })),
    home('connecting', 'Joining a room: connecting', () => returning({ status: 'connecting' })),
    home('invite', 'An invite link to an open room', () => returning({ query: 'room=KXR4QT', invite: room(4, { code: 'KXR4QT', players: 3 }) }), 'Invites'),
    home('invite-first', 'An invite link on a first visit', () => ({ state: null, name: '', met: [], query: 'room=KXR4QT&first', invite: room(4, { code: 'KXR4QT', players: 3 }) }), 'Invites'),
    home('invite-full', 'An invite to a full room', () => returning({ query: 'room=KXR4QT', invite: room(4, { code: 'KXR4QT', players: 12, maxPlayers: 12 }) }), 'Invites'),
    home('invite-playing', 'An invite to a room mid-game', () => returning({ query: 'room=KXR4QT', invite: room(4, { code: 'KXR4QT', phase: 'question' }) }), 'Invites'),
    home('invite-gone', 'An invite to a room that has closed', () => returning({ query: 'room=KXR4QT', invite: 'gone' }), 'Invites'),
    home('invite-silent', "An invite to a room that doesn't answer", () => returning({ query: 'room=KXR4QT', invite: null }), 'Invites'),
    home('daily-new', "Today's unique, not answered yet, a streak of 7 waiting", () => returning({ daily: { daysAgo: 1, picked: 1, ok: true, streak: 7, ended: 0 } }), "Today's unique"),
    home('daily-year', "Today's unique answered, a streak of a year", () => returning({ daily: { daysAgo: 0, picked: 0, ok: true, streak: 365, ended: 0 } }), "Today's unique"),
    {
      key: 'home/daily-streak',
      screen: 'home',
      group: "Today's unique",
      label: "Today's unique: any streak",
      seats: [ME],
      knobs: [DAYS, TODAY],
      build: (k = {}) => {
        const days = Number(k.days ?? 7);
        const daily = k.today === 'missed' ? { daysAgo: 0, picked: 3, ok: false, streak: 0, ended: days } : k.today === 'waiting' ? { daysAgo: 1, picked: 1, ok: days > 0, streak: days, ended: 0 } : { daysAgo: 0, picked: 2, ok: days > 0, streak: days, ended: 0 };
        return returning({ daily });
      },
    },
    home('daily-missed', "Today's unique missed, a streak of 30 ended", () => returning({ daily: { daysAgo: 0, picked: 3, ok: false, streak: 0, ended: 30 } }), "Today's unique"),
  ];
}
