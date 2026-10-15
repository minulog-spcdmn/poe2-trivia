// The end screen's states (endscreen.html): every board of the handoff
// (docs/handoff/end-screen) and the edge cases around them, each a finished
// game as this device would have it at its end: the room's state, who this
// device is, how its run measured up, what it earned, and the codex log and
// Delve records the screen reads.

import { DEFAULT_SETTINGS, createGame, type GameState, type Player, type Recap, type Spectator } from '../lib/game';
import { DELVE_RULESET } from '../lib/delve';
import type { Answer } from '../lib/codex';
import type { DelveRun } from '../lib/delveRecord';
import { CREATOR } from '../lib/site';
import { RUBY } from '../lib/palette';
import { engine } from '../lib/session.svelte';

export type Mode = 'host' | 'client' | 'local';
export interface Viewport {
  key: string;
  label: string;
  w: number;
  h: number;
}
export const VIEWPORTS: Viewport[] = [
  { key: 'desktop', label: '1440 × 900', w: 1440, h: 900 },
  { key: 'air13', label: '1440 × 725', w: 1440, h: 725 },
  { key: 'tablet', label: 'Tablet 900', w: 900, h: 1180 },
  { key: 'phone', label: 'Phone 390', w: 390, h: 844 },
  { key: 'phone375', label: 'Phone 375', w: 375, h: 812 },
];

export interface Scene {
  key: string;
  group: 'Normal games' | 'Delve' | 'Edge cases';
  label: string;
  /** The handoff's board it draws (docs/handoff/end-screen/screens/<board>.webp), and the viewport it was drawn at. */
  board?: string;
  view: Viewport['key'];
  /** Who this device is: the room's role and its player (a spectator's own id; none in hot-seat). */
  mode: Mode;
  me: string | null;
  state: GameState;
  delveResult?: { id: number; depth: number; previousBest: number | null; best: boolean } | null;
  /** Achievements this device earned in the game (ids, lib/achievements.ts). */
  earned?: string[];
  /** This device's codex log (its own answers), and its Delve runs, oldest first. */
  log?: Answer[];
  runs?: DelveRun[];
}

// ---- people and items --------------------------------------------------------

/** Each name's colour seat (lib/palette.ts), as the boards draw them; the creator's is ruby. */
const HUES: Record<string, number> = { Kalguur: 0, Doryani: 1, 'Una of the Vaal': 2, Rog: 3, Alva: 4, Dannig: 5, 'Hooded One': 6, Zelina: 7, Oswin: 8, Finn: 9, 'Sekhema Asala': 10, Renly: 11, [CREATOR]: RUBY };
export const pid = (name: string) => 'id-' + name.toLowerCase().replace(/[^a-z0-9]/g, '');
const player = (name: string, score = 0, connected = true): Player => ({ id: pid(name), name, score, recent: [], connected, hue: HUES[name] ?? (name.length * 7) % RUBY });
const spectator = (name: string, stay = false): Spectator => ({ id: pid(name), name, ...(stay ? { stay: true as const } : {}) });
/** An item's id by its name. */
const id = (name: string) => {
  const it = engine.items.find((i) => i.name === name);
  if (!it) throw new Error(`No item named ${name}`);
  return it.id;
};

const K = pid('Kalguur');
const GAME = 1_700_000_000_000;
const RUN = 1_700_000_100_000;

// ---- normal games --------------------------------------------------------------

function game(scores: [string, number][], o: { race?: boolean; rounds?: number; recap?: Partial<Recap> | null; winners?: string[]; host?: string | null; extra?: Partial<GameState> } = {}): GameState {
  const s = createGame(o.host === undefined ? K : o.host, { ...DEFAULT_SETTINGS, mode: o.race ? 'race' : 'turns', targetScore: 10, timer: 16 });
  s.players = scores.map(([n, sc]) => player(n, sc));
  s.phase = 'over';
  s.round = o.rounds ?? 10;
  const top = Math.max(...scores.map((x) => x[1]));
  s.winners = o.winners ?? [pid(scores.find((x) => x[1] === top)![0])];
  s.startedAt = GAME;
  if (o.recap !== null) s.recap = { answers: {}, misses: [], ...o.recap };
  return Object.assign(s, o.extra ?? {});
}
const turnsRecap = (fastest: string, item: string, more: Partial<Recap> = {}): Partial<Recap> => ({
  fastest: { by: pid(fastest), id: id(item), ms: 1800 },
  cats: { 'Amulets & Belts': [5, 3], 'Body Armours': [8, 6], Rings: [3, 3], Helmets: [4, 3] },
  ...more,
});
const misses = (who: string, names: string[], dm = false) => names.map((n) => ({ by: pid(who), id: id(n), ...(dm ? { dm: true as const } : {}) }));

const FIVE: [string, number][] = [['Kalguur', 10], ['Doryani', 8], ['Una of the Vaal', 7], ['Rog', 5], ['Alva', 3]];
const TWELVE: [string, number][] = [
  ['Rog', 10], ['Kalguur', 9], ['Dannig', 9], ['Doryani', 8], ['Una of the Vaal', 7], ['Hooded One', 6],
  ['Zelina', 4], ['Alva', 3], ['Oswin', 2], ['Renly', 2], ['Finn', 1], ['Sekhema Asala', 0],
];
const RACE8: [string, number][] = [['Una of the Vaal', 10], ['Kalguur', 9], ['Dannig', 9], ['Doryani', 8], ['Hooded One', 6], ['Rog', 5], ['Zelina', 4], ['Alva', 3]];

const won = () => game(FIVE, { recap: turnsRecap('Doryani', "Atziri's Disdain", { answers: { [K]: { n: 10, ok: 10, ms: 2400 } } }) });
const lost = () =>
  game(FIVE, {
    recap: turnsRecap('Doryani', "Atziri's Disdain", {
      answers: { [pid('Una of the Vaal')]: { n: 10, ok: 7, ms: 3100 } },
      misses: misses('Una of the Vaal', ['Headhunter', 'Ingenuity', 'Briarpatch']),
    }),
  });
const race = (extra: Partial<GameState> = {}) =>
  game(RACE8, {
    race: true,
    rounds: 70,
    recap: {
      fastest: { by: pid('Doryani'), id: id('Ingenuity'), ms: 1600 },
      answers: { [K]: { n: 11, ok: 10, ms: 2200 } },
      wrong: { [id("Kaom's Heart")]: 5 },
      firsts: { by: pid('Una of the Vaal'), n: 6 },
      misses: misses('Kalguur', ["Kaom's Heart"]),
    },
    extra: { spectators: [spectator('Finn'), spectator('Renly')], ...extra },
  });
const deathmatch = () =>
  game([['Kalguur', 10], ['Doryani', 10], ['Una of the Vaal', 7], ['Rog', 5], ['Alva', 3]], {
    recap: turnsRecap('Doryani', "Atziri's Disdain", { answers: { [pid('Doryani')]: { n: 10, ok: 10, ms: 1800, dn: 3, dok: 2 }, [K]: { n: 10, ok: 10, ms: 2000, dn: 3, dok: 3 } }, misses: misses('Doryani', ['Death Rush'], true) }),
    extra: { deathmatch: { alive: [K], entrants: [K, pid('Doryani')], round: 3, results: {}, eliminated: [pid('Doryani')], startedAt: 0 } },
  });
function left() {
  const s = game(FIVE, {
    recap: turnsRecap('Doryani', "Atziri's Disdain", { answers: { [K]: { n: 10, ok: 10, ms: 2400 } } }),
    extra: { spectators: [spectator('Finn'), spectator('Renly')] },
  });
  s.players[4].connected = false;
  return s;
}
const twelve = () =>
  game(TWELVE, {
    recap: turnsRecap('Doryani', 'Death Rush', {
      cats: { 'Amulets & Belts': [12, 5], Rings: [18, 14] },
      answers: { [pid('Dannig')]: { n: 10, ok: 9, ms: 2800 }, [pid('Oswin')]: { n: 10, ok: 2, ms: 4100 } },
      misses: [...misses('Dannig', ["Kaom's Heart"]), ...misses('Oswin', ['Headhunter', 'Ingenuity', 'Briarpatch', 'Death Rush'])],
    }),
  });
const hotSeat = () =>
  game([['Doryani', 10], ['Kalguur', 9], ['Una of the Vaal', 7]], {
    host: null,
    recap: turnsRecap('Doryani', "Atziri's Disdain", {
      cats: { 'Amulets & Belts': [4, 2], 'Body Armours': [6, 5] },
      misses: [...misses('Kalguur', ["Kaom's Heart"]), ...misses('Una of the Vaal', ['Headhunter', 'Ingenuity', 'Briarpatch'])],
    }),
  });
/** Someone watching the game: in the room's spectators, not seated. */
const watched = (s: GameState, stay = false) => ({ ...s, spectators: [...(s.spectators ?? []), spectator('Watcher', stay)] });

// ---- Delve ---------------------------------------------------------------------

function delve(names: string[], o: { depth: number; losses: Record<string, number[]>; revives?: NonNullable<GameState['delve']>['revives']; recap?: Partial<Recap>; streak?: number; mixed?: boolean; host?: string | null }): GameState {
  const s = createGame(o.host === undefined ? pid(names[0]) : o.host, { ...DEFAULT_SETTINGS, mode: 'delve' });
  s.players = names.map((n) => player(n));
  s.phase = 'over';
  s.round = o.depth;
  s.startedAt = RUN;
  s.delve = {
    entrants: s.players.map((p) => p.id),
    losses: o.losses,
    ruleset: DELVE_RULESET,
    startedAt: RUN,
    excused: [],
    graceUntil: 0,
    finds: [],
    ...(o.mixed ? { mixed: true } : {}),
    ...(names.length > 1 ? { revives: o.revives ?? [], ...(o.streak ? { bestTeamStreak: o.streak } : {}) } : {}),
  };
  s.recap = { answers: {}, misses: [], ...o.recap };
  return s;
}
/** One of this device's wrong answers in the run, `t` ms in. */
const miss = (t: number, name: string, depth: number, more: Partial<Answer> = {}): Answer => ({ t: RUN + t, id: id(name), mode: 'name', ok: false, difficulty: 'cruel', race: false, depth, run: RUN, ...more });
const team = (who: string) => ({ who: pid(who), team: true as const, lives: 1, wards: 0 });
/** This device's earlier runs of a kind (depths as the game keeps them, one more than shown), then this one. */
function runs(depths: number[], depth: number, together: boolean, who?: string): DelveRun[] {
  const run = (rid: number, at: number, d: number): DelveRun => ({
    id: rid,
    at,
    depth: d,
    players: together ? 3 : 1,
    ruleset: DELVE_RULESET,
    mixed: false,
    ...(together ? { perished: [d] } : {}),
    ...(who ? { who } : {}),
  });
  return [...depths.map((d, i) => run(1000 + i, 1000 + i, d)), run(RUN, 999_999, depth)];
}
const measured = (depth: number, previousBest: number | null, best: boolean) => ({ id: RUN, depth, previousBest, best });

const soloRecap: Partial<Recap> = {
  fastest: { by: K, id: id('Headhunter'), ms: 1900 },
  closest: { by: K, id: id('Ingenuity'), left: 400, depth: 17 },
  items: [{ kind: 'dynamite', at: 15, by: K, used: 18, how: 'blast' }],
};
const solo = (more: Partial<Parameters<typeof delve>[1]> = {}) => delve(['Kalguur'], { depth: 23, losses: { [K]: [19, 21, 23] }, recap: soloRecap, host: null, ...more });
const soloLog = () => [miss(10, "Atziri's Disdain", 19), miss(20, 'Briarpatch', 21), miss(30, 'Death Rush', 23)];
const soloRuns = () => runs([16, 27, 12, 20, 25, 20, 14], 23, false);

const TEAM3 = ['Kalguur', 'Doryani', 'Una of the Vaal'];
const TEAM6 = ['Kalguur', 'Doryani', 'Una of the Vaal', 'Rog', 'Alva', 'Dannig'];
const TEAM12 = ['Kalguur', 'Doryani', 'Una of the Vaal', 'Hooded One', 'Rog', 'Zelina', 'Alva', 'Oswin', 'Dannig', 'Finn', 'Sekhema Asala', 'Renly'];
const DEPTHS: Record<string, number> = { Kalguur: 27, Doryani: 26, 'Una of the Vaal': 26, 'Hooded One': 25, Rog: 24, Zelina: 23, Alva: 22, Oswin: 21, Dannig: 20, Finn: 19, 'Sekhema Asala': 18, Renly: 16 };
function teamRun(names: string[], more: { left?: string; streak?: number } = {}) {
  const losses: Record<string, number[]> = {};
  for (const n of names) losses[pid(n)] = n === 'Kalguur' ? [20, 27] : n === 'Doryani' ? [15, 21, 22, 26] : [DEPTHS[n] - 4, DEPTHS[n] - 2, DEPTHS[n]];
  const s = delve(names, {
    depth: 27,
    losses,
    host: K,
    revives: [{ by: K, to: pid('Doryani'), depth: 22, fell: 22, at: RUN + 25 }],
    recap: {
      fastest: { by: pid('Una of the Vaal'), id: id("Kaom's Heart"), ms: 1400 },
      items: [{ kind: 'dynamite', at: 13, by: pid('Doryani'), used: 19, how: 'blast' }],
    },
    streak: more.streak,
  });
  if (more.left) s.players.find((p) => p.name === more.left)!.connected = false;
  return s;
}
const teamLog = () => [miss(10, 'Ingenuity', 20, team('Kalguur')), miss(40, "Atziri's Disdain", 27, team('Kalguur'))];
const guestLog = () => [
  miss(5, 'Briarpatch', 15, team('Doryani')),
  miss(10, 'Ingenuity', 21, team('Doryani')),
  miss(20, 'Death Rush', 22, team('Doryani')),
  miss(50, 'Headhunter', 26, team('Doryani')),
];
const teamRuns = (who = K) => runs([9, 12, 19], 27, true, who);

// ---- the list --------------------------------------------------------------------

const D = 'desktop';
const A = 'air13';
const P = 'phone';
const LONG = ['Sekhema Asala Kahari', 'Doryani of the Vaal', 'Hooded Wanderer Kai', 'Zelina Whitebranch', 'Rog the Lucky Smith'];

export function scenes(): Scene[] {
  const una = pid('Una of the Vaal');
  const dannig = pid('Dannig');
  const doryani = pid('Doryani');
  return [
    // The handoff's boards.
    { key: 'n-won', group: 'Normal games', label: 'Take turns: you won (host)', board: 'n-won', view: D, mode: 'host', me: K, state: won(), earned: ['first-victory', 'untarnished'] },
    { key: 'n-lost', group: 'Normal games', label: 'Take turns: you came third (guest)', board: 'n-lost', view: D, mode: 'client', me: una, state: lost() },
    { key: 'n-race', group: 'Normal games', label: 'Race: you joint second, two join next', board: 'n-race', view: D, mode: 'host', me: K, state: race() },
    { key: 'n-dm', group: 'Normal games', label: 'Lost a deathmatch', board: 'n-dm', view: D, mode: 'client', me: doryani, state: deathmatch() },
    { key: 'n-left', group: 'Normal games', label: 'Alva went offline; two join next', board: 'n-left', view: D, mode: 'host', me: K, state: left(), earned: ['first-victory', 'untarnished'] },
    { key: 'n-twelve', group: 'Normal games', label: '12 players (you are Dannig)', board: 'n-twelve', view: D, mode: 'client', me: dannig, state: twelve() },
    { key: 'n-hot', group: 'Normal games', label: 'Hot-seat', board: 'n-hot', view: D, mode: 'local', me: null, state: hotSeat() },
    { key: 'n-spec', group: 'Normal games', label: 'A spectator who plays next', board: 'n-spec', view: D, mode: 'client', me: pid('Watcher'), state: watched(won()) },
    { key: 'n-air13', group: 'Normal games', label: '13-inch: you won', board: 'n-air13', view: A, mode: 'host', me: K, state: won(), earned: ['first-victory', 'untarnished'] },
    { key: 'n-air13-lost', group: 'Normal games', label: '13-inch: you came third', board: 'n-air13-lost', view: A, mode: 'client', me: una, state: lost() },
    { key: 'n-air13-twelve', group: 'Normal games', label: '13-inch: 12 players', board: 'n-air13-twelve', view: A, mode: 'client', me: dannig, state: twelve() },
    { key: 'n-phone', group: 'Normal games', label: 'Phone: you won', board: 'n-phone', view: P, mode: 'host', me: K, state: won() },
    { key: 'n-phone-twelve', group: 'Normal games', label: 'Phone: 12 players, your row on the dock', board: 'n-phone-twelve', view: P, mode: 'client', me: pid('Oswin'), state: twelve() },
    { key: 'n-phone-full', group: 'Normal games', label: 'Phone: a guest, the whole page', board: 'n-phone-full', view: P, mode: 'client', me: una, state: lost() },
    { key: 'd-solo', group: 'Delve', label: 'Alone: four short of the best', board: 'd-solo', view: D, mode: 'local', me: null, state: solo(), delveResult: measured(23, 27, false), log: soloLog(), runs: soloRuns() },
    {
      key: 'd-first',
      group: 'Delve',
      label: 'Alone: the very first run',
      board: 'd-first',
      view: D,
      mode: 'local',
      me: null,
      state: solo({ losses: { [K]: [16, 20, 23] }, recap: { fastest: { by: K, id: id('Briarpatch'), ms: 2400 } } }),
      delveResult: measured(23, null, true),
      log: [miss(10, "Kaom's Heart", 16), miss(20, 'Headhunter', 20), miss(30, 'Death Rush', 23)],
      runs: runs([], 23, false),
      earned: ['depth-10'],
    },
    {
      key: 'd-best',
      group: 'Delve',
      label: 'Alone: a new best, the vein caved in',
      board: 'd-best',
      view: D,
      mode: 'local',
      me: null,
      state: solo({
        depth: 45,
        losses: { [K]: [28, 39, 45] },
        recap: { fastest: { by: K, id: id('Ingenuity'), ms: 1600 }, closest: { by: K, id: id("Atziri's Disdain"), left: 300, depth: 34 }, items: [{ kind: 'wards', at: 42, by: K, used: 45, how: 'ward' }] },
      }),
      delveResult: measured(45, 37, true),
      log: [miss(10, 'Headhunter', 28), miss(20, 'Briarpatch', 39), miss(30, "Kaom's Heart", 45, { find: 'azurite', lives: 1, wards: 1 })],
      runs: runs([16, 24, 11, 18, 22, 13, 20, 21, 30], 45, false),
    },
    { key: 'd-team', group: 'Delve', label: 'Together: three delvers (host)', board: 'd-team', view: D, mode: 'host', me: K, state: teamRun(TEAM3), delveResult: measured(27, 19, true), log: teamLog(), runs: teamRuns() },
    { key: 'd-team6', group: 'Delve', label: 'Together: six delvers (host)', board: 'd-team6', view: D, mode: 'host', me: K, state: teamRun(TEAM6), delveResult: measured(27, 19, true), log: teamLog(), runs: teamRuns() },
    { key: 'd-team12', group: 'Delve', label: 'Together: twelve delvers (host)', board: 'd-team12', view: D, mode: 'host', me: K, state: teamRun(TEAM12), delveResult: measured(27, 19, true), log: teamLog(), runs: teamRuns() },
    {
      key: 'd-team6-guest',
      group: 'Delve',
      label: 'Together: a guest brought back once',
      board: 'd-team6-guest',
      view: D,
      mode: 'client',
      me: doryani,
      state: teamRun(TEAM6),
      delveResult: measured(27, 32, false),
      log: guestLog(),
      runs: runs([17, 32, 15], 27, true, doryani),
    },
    { key: 'd-team6-spec', group: 'Delve', label: 'Together: watched by one who joins next', board: 'd-team6-spec', view: D, mode: 'client', me: pid('Watcher'), state: watched(teamRun(TEAM6)) },
    { key: 'd-air13', group: 'Delve', label: '13-inch: alone', board: 'd-air13', view: A, mode: 'local', me: null, state: solo(), delveResult: measured(23, 27, false), log: soloLog(), runs: soloRuns() },
    { key: 'd-team6-air13', group: 'Delve', label: '13-inch: six delvers', board: 'd-team6-air13', view: A, mode: 'host', me: K, state: teamRun(TEAM6), delveResult: measured(27, 19, true), log: teamLog(), runs: teamRuns() },
    { key: 'd-team12-air13', group: 'Delve', label: '13-inch: twelve delvers', board: 'd-team12-air13', view: A, mode: 'host', me: K, state: teamRun(TEAM12), delveResult: measured(27, 19, true), log: teamLog(), runs: teamRuns() },
    { key: 'd-phone', group: 'Delve', label: 'Phone: alone, first screen', board: 'd-phone', view: P, mode: 'local', me: null, state: solo(), delveResult: measured(23, 27, false), log: soloLog(), runs: soloRuns() },
    { key: 'd-phone-full', group: 'Delve', label: 'Phone: alone, the whole page', board: 'd-phone-full', view: P, mode: 'local', me: null, state: solo(), delveResult: measured(23, 27, false), log: soloLog(), runs: soloRuns() },
    { key: 'd-phone-team6', group: 'Delve', label: 'Phone: six delvers, the whole page', board: 'd-phone-team6', view: P, mode: 'host', me: K, state: teamRun(TEAM6), delveResult: measured(27, 19, true), log: teamLog(), runs: teamRuns() },

    // Around the edges.
    {
      key: 'e-long',
      group: 'Edge cases',
      label: 'Very long names, a long winner',
      view: D,
      mode: 'client',
      me: pid(LONG[1]),
      state: game(
        LONG.map((n, i) => [n, 10 - i * 2] as [string, number]),
        { host: pid(LONG[0]), recap: { fastest: { by: pid(LONG[2]), id: id('The Burden of Shadows'), ms: 2100 }, answers: { [pid(LONG[1])]: { n: 10, ok: 8, ms: 3000 } }, misses: misses(LONG[1], ['The Burden of Shadows', 'Guiding Palm of the Heart']) } },
      ),
    },
    {
      key: 'e-creator',
      group: 'Edge cases',
      label: `${CREATOR} wins (the creator's foil)`,
      view: D,
      mode: 'client',
      me: K,
      state: game([[CREATOR, 10], ['Kalguur', 9], ['Doryani', 4]], { recap: turnsRecap(CREATOR, 'Headhunter', { answers: { [K]: { n: 10, ok: 9, ms: 2600 } }, misses: misses('Kalguur', ['Ingenuity']) }) }),
    },
    {
      key: 'e-tie',
      group: 'Edge cases',
      label: 'Race: two tied for first',
      view: D,
      mode: 'host',
      me: K,
      state: game(
        [['Kalguur', 10], ['Doryani', 10], ['Una of the Vaal', 6]],
        { race: true, rounds: 31, winners: [K, pid('Doryani')], recap: { fastest: { by: K, id: id('Ingenuity'), ms: 1500 }, answers: { [K]: { n: 10, ok: 10, ms: 1500 } }, misses: [] } },
      ),
      earned: ['first-victory'],
    },
    { key: 'e-no-recap', group: 'Edge cases', label: 'No highlights (a host from before the recap)', view: D, mode: 'client', me: una, state: game(FIVE, { recap: null }) },
    {
      key: 'e-clean-race',
      group: 'Edge cases',
      label: 'Race: you never guessed wrong',
      view: D,
      mode: 'client',
      me: pid('Doryani'),
      state: game(
        [['Kalguur', 10], ['Doryani', 7], ['Rog', 2]],
        { race: true, rounds: 22, recap: { fastest: { by: pid('Doryani'), id: id('Death Rush'), ms: 1300 }, answers: { [pid('Doryani')]: { n: 7, ok: 7, ms: 1300 } }, misses: [] } },
      ),
    },
    {
      key: 'e-no-answers',
      group: 'Edge cases',
      label: 'A player who never answered',
      view: D,
      mode: 'client',
      me: pid('Alva'),
      state: game([['Kalguur', 10], ['Doryani', 8], ['Alva', 0]], { recap: turnsRecap('Kalguur', 'Headhunter') }),
    },
    {
      key: 'e-team2',
      group: 'Edge cases',
      label: 'Together: a team of two',
      view: D,
      mode: 'client',
      me: pid('Doryani'),
      state: delve(['Kalguur', 'Doryani'], {
        depth: 15,
        losses: { [K]: [9, 12, 15], [pid('Doryani')]: [11, 13, 14] },
        host: K,
        recap: { fastest: { by: pid('Doryani'), id: id('Headhunter'), ms: 2200 } },
      }),
      delveResult: measured(15, null, true),
      log: [miss(10, 'Headhunter', 11, team('Doryani')), miss(20, 'Ingenuity', 13, team('Doryani')), miss(30, 'Briarpatch', 14, team('Doryani'))],
      runs: runs([], 15, true, pid('Doryani')),
    },
    {
      key: 'e-many-lives',
      group: 'Edge cases',
      label: 'Together: four rows of lives, one given and one brought back',
      view: D,
      mode: 'host',
      me: K,
      state: delve(TEAM3, {
        depth: 33,
        host: K,
        losses: { [K]: [14, 25, 33], [pid('Doryani')]: [20, 24, 30, 31], [una]: [22, 28, 32] },
        revives: [
          { by: K, to: pid('Doryani'), depth: 24, fell: 24, at: RUN + 35 },
          { by: una, to: K, depth: 25, fell: 25, at: RUN + 45 },
        ],
        recap: { fastest: { by: una, id: id("Kaom's Heart"), ms: 1700 } },
        streak: 7,
      }),
      delveResult: measured(33, 27, true),
      log: [
        miss(10, 'Ingenuity', 14, team('Kalguur')),
        miss(40, 'Death Rush', 25, team('Kalguur')),
        miss(60, 'Headhunter', 33, team('Kalguur')),
      ],
      runs: runs([12, 27, 18], 33, true, K),
    },
    {
      key: 'e-cave-two',
      group: 'Edge cases',
      label: 'Alone: a cave-in took two lives',
      view: D,
      mode: 'local',
      me: null,
      state: solo({ depth: 48, losses: { [K]: [31, 48, 48] }, recap: { fastest: { by: K, id: id('Ingenuity'), ms: 2000 }, items: [{ kind: 'flares', at: 41, by: K, used: 44, how: 'flare' }] } }),
      delveResult: measured(48, 51, false),
      log: [miss(10, 'Headhunter', 31), miss(30, "Kaom's Heart", 48, { find: 'azurite', lives: 2, wards: 0 })],
      runs: runs([30, 51, 22, 40], 48, false),
    },
    {
      key: 'e-first-finds',
      group: 'Edge cases',
      label: 'Alone: a first run that turned up finds',
      view: D,
      mode: 'local',
      me: null,
      state: solo({
        losses: { [K]: [16, 20, 23] },
        recap: { fastest: { by: K, id: id('Briarpatch'), ms: 2400 }, items: [{ kind: 'dynamite', at: 12, by: K, used: 17, how: 'blast' }, { kind: 'dynamite', at: 14, by: K }] },
      }),
      delveResult: measured(23, null, true),
      log: [miss(10, "Kaom's Heart", 16), miss(20, 'Headhunter', 20), miss(30, 'Death Rush', 23)],
      runs: runs([], 23, false),
      earned: ['depth-10'],
    },
    { key: 'e-mixed', group: 'Edge cases', label: 'Alone: a run finished under newer rules', view: D, mode: 'local', me: null, state: solo({ mixed: true }), delveResult: measured(23, 27, false), log: soloLog(), runs: soloRuns() },
    { key: 'e-watch-solo', group: 'Edge cases', label: 'Watching someone delve alone', view: D, mode: 'client', me: pid('Watcher'), state: watched(solo({ host: K })) },
    {
      key: 'e-team-left',
      group: 'Edge cases',
      label: 'Together: Rog went offline',
      view: D,
      mode: 'host',
      me: K,
      state: teamRun(TEAM6, { left: 'Rog', streak: 5 }),
      delveResult: measured(27, 19, true),
      log: teamLog(),
      runs: teamRuns(),
    },
    { key: 'e-joiners', group: 'Edge cases', label: 'Four spectators join next', view: D, mode: 'host', me: K, state: race({ spectators: ['Finn', 'Renly', 'Oswin', 'Zelina'].map((n) => spectator(n)) }) },
    { key: 'e-just-watching', group: 'Edge cases', label: 'A spectator who just watches', view: D, mode: 'client', me: pid('Watcher'), state: watched(won(), true) },
    { key: 'e-phone-delve-guest', group: 'Edge cases', label: 'Phone: a guest of six, waiting', view: P, mode: 'client', me: doryani, state: teamRun(TEAM6), delveResult: measured(27, 32, false), log: guestLog(), runs: runs([17, 32, 15], 27, true, doryani) },
    { key: 'e-phone-spec', group: 'Edge cases', label: 'Phone: a spectator', view: 'phone375', mode: 'client', me: pid('Watcher'), state: watched(won()) },
  ];
}
