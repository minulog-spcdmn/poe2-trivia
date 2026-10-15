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
  { key: 'narrow', label: '1100 × 900', w: 1100, h: 900 },
  { key: 'big', label: '2560 × 1440', w: 2560, h: 1440 },
  { key: 'landscape', label: 'Phone on its side', w: 844, h: 390 },
];

export interface Scene {
  key: string;
  group: 'Normal games' | 'Delve' | 'Edge cases: normal games' | 'Edge cases: Delve';
  label: string;
  /** The handoff's boards it draws (docs/handoff/end-screen/screens/<board>.webp), by the window each was drawn at. */
  boards?: Partial<Record<string, string>>;
  /** The window it opens at. */
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
    extra: { deathmatch: { alive: [K], entrants: [K, pid('Doryani')], round: 3, results: {}, eliminated: [pid('Doryani')], out: { [pid('Doryani')]: 3 }, startedAt: 0 } },
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

// ---- more cases ------------------------------------------------------------------

const una = () => pid('Una of the Vaal');
/** A game to 1 point: one round, one point. */
const onePoint = () =>
  game([['Kalguur', 1], ['Doryani', 0], ['Rog', 0]], { rounds: 1, recap: { fastest: { by: K, id: id('Headhunter'), ms: 3200 }, answers: { [K]: { n: 1, ok: 1, ms: 3200 } }, cats: { Rings: [1, 1] }, misses: [] } });
/** A race where wrong guesses took scores below nothing. */
const negative = () =>
  game([['Kalguur', 10], ['Doryani', 6], ['Una of the Vaal', 2], ['Rog', 0], ['Alva', -1], ['Zelina', -3]], {
    race: true,
    rounds: 38,
    recap: {
      fastest: { by: K, id: id('Ingenuity'), ms: 1500 },
      answers: { [pid('Alva')]: { n: 5, ok: 2, ms: 2600 } },
      wrong: { [id('Headhunter')]: 4, [id('Ingenuity')]: 2 },
      firsts: { by: K, n: 4 },
      misses: misses('Alva', ['Headhunter', 'Briarpatch', 'Death Rush']),
    },
  });
/** A deathmatch of three, settled in its second round. */
const threeWay = () =>
  game([['Kalguur', 10], ['Doryani', 10], ['Una of the Vaal', 10], ['Rog', 5]], {
    recap: turnsRecap('Una of the Vaal', 'Headhunter', {
      answers: { [K]: { n: 10, ok: 10, ms: 2100, dn: 2, dok: 2 }, [pid('Doryani')]: { n: 10, ok: 10, ms: 2500, dn: 1, dok: 0 }, [una()]: { n: 10, ok: 10, ms: 1900, dn: 2, dok: 1 } },
      misses: [...misses('Doryani', ['Briarpatch'], true), ...misses('Una of the Vaal', ['Death Rush'], true)],
    }),
    extra: { deathmatch: { alive: [K], entrants: [K, pid('Doryani'), una()], round: 2, results: {}, eliminated: [una()], out: { [pid('Doryani')]: 1, [una()]: 2 }, startedAt: 0 } },
  });
/** A ranking of `n` players, scores falling. */
const crowd = (n: number) =>
  game(
    TWELVE.slice(0, n).map(([name], i) => [name, Math.max(0, 10 - i)] as [string, number]),
    { recap: turnsRecap('Doryani', 'Headhunter', { answers: { [pid('Doryani')]: { n: 10, ok: 9, ms: 2300 } }, misses: misses('Doryani', ['Ingenuity']) }) },
  );
const MANY = ['Headhunter', 'Ingenuity', 'Briarpatch', 'Death Rush', "Kaom's Heart", "Atziri's Rule", 'Chainsting', 'The Burden of Shadows', 'Guiding Palm of the Heart', "Atziri's Disdain", 'Mageblood'];
/** Delve together: the first `n` of the twelve, the run as teamRun has it. */
const teamOf = (n: number) => teamRun(TEAM12.slice(0, n));
/** The winner's game with everyone else gone. */
function allGone() {
  const s = won();
  for (const p of s.players.slice(1)) p.connected = false;
  return s;
}

// ---- the list --------------------------------------------------------------------

const D = 'desktop';
const A = 'air13';
const P = 'phone';
const LONG = ['Sekhema Asala Kahari', 'Doryani of the Vaal', 'Hooded Wanderer Kai', 'Zelina Whitebranch', 'Rog the Lucky Smith'];
const NG = 'Edge cases: normal games';
const DG = 'Edge cases: Delve';

export function scenes(): Scene[] {
  const dannig = pid('Dannig');
  const doryani = pid('Doryani');
  const solo23 = () => ({ delveResult: measured(23, 27, false), log: soloLog(), runs: soloRuns() });
  const host6 = () => ({ delveResult: measured(27, 19, true), log: teamLog(), runs: teamRuns() });
  return [
    // The handoff's boards, each state once: its boards at the other sizes come with it.
    { key: 'n-won', group: 'Normal games', label: 'Take turns: you won (host)', boards: { desktop: 'n-won', air13: 'n-air13', phone: 'n-phone' }, view: D, mode: 'host', me: K, state: won(), earned: ['first-victory', 'untarnished'] },
    { key: 'n-lost', group: 'Normal games', label: 'Take turns: you came third (guest)', boards: { desktop: 'n-lost', air13: 'n-air13-lost', phone: 'n-phone-full' }, view: D, mode: 'client', me: una(), state: lost() },
    { key: 'n-race', group: 'Normal games', label: 'Race: you joint second, two join next', boards: { desktop: 'n-race' }, view: D, mode: 'host', me: K, state: race() },
    { key: 'n-dm', group: 'Normal games', label: 'Lost a deathmatch', boards: { desktop: 'n-dm' }, view: D, mode: 'client', me: doryani, state: deathmatch() },
    { key: 'n-left', group: 'Normal games', label: 'Alva went offline; two join next', boards: { desktop: 'n-left' }, view: D, mode: 'host', me: K, state: left(), earned: ['first-victory', 'untarnished'] },
    { key: 'n-twelve', group: 'Normal games', label: '12 players (you are Dannig)', boards: { desktop: 'n-twelve', air13: 'n-air13-twelve' }, view: D, mode: 'client', me: dannig, state: twelve() },
    { key: 'n-phone-twelve', group: 'Normal games', label: '12 on a phone: your row on the dock', boards: { phone: 'n-phone-twelve' }, view: P, mode: 'client', me: pid('Oswin'), state: twelve() },
    { key: 'n-hot', group: 'Normal games', label: 'Hot-seat', boards: { desktop: 'n-hot' }, view: D, mode: 'local', me: null, state: hotSeat() },
    { key: 'n-spec', group: 'Normal games', label: 'A spectator who plays next', boards: { desktop: 'n-spec' }, view: D, mode: 'client', me: pid('Watcher'), state: watched(won()) },
    { key: 'd-solo', group: 'Delve', label: 'Alone: four short of the best', boards: { desktop: 'd-solo', air13: 'd-air13', phone: 'd-phone-full' }, view: D, mode: 'local', me: null, state: solo(), ...solo23() },
    {
      key: 'd-first',
      group: 'Delve',
      label: 'Alone: the very first run',
      boards: { desktop: 'd-first' },
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
      boards: { desktop: 'd-best' },
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
    { key: 'd-team', group: 'Delve', label: 'Together: three delvers (host)', boards: { desktop: 'd-team' }, view: D, mode: 'host', me: K, state: teamRun(TEAM3), ...host6() },
    { key: 'd-team6', group: 'Delve', label: 'Together: six delvers (host)', boards: { desktop: 'd-team6', air13: 'd-team6-air13', phone: 'd-phone-team6' }, view: D, mode: 'host', me: K, state: teamRun(TEAM6), ...host6() },
    { key: 'd-team12', group: 'Delve', label: 'Together: twelve delvers (host)', boards: { desktop: 'd-team12', air13: 'd-team12-air13' }, view: D, mode: 'host', me: K, state: teamRun(TEAM12), ...host6() },
    {
      key: 'd-team6-guest',
      group: 'Delve',
      label: 'Together: a guest brought back once',
      boards: { desktop: 'd-team6-guest' },
      view: D,
      mode: 'client',
      me: doryani,
      state: teamRun(TEAM6),
      delveResult: measured(27, 32, false),
      log: guestLog(),
      runs: runs([17, 32, 15], 27, true, doryani),
    },
    { key: 'd-team6-spec', group: 'Delve', label: 'Together: watched by one who joins next', boards: { desktop: 'd-team6-spec' }, view: D, mode: 'client', me: pid('Watcher'), state: watched(teamRun(TEAM6)) },

    // Normal games, around the edges.
    {
      key: 'e-long',
      group: NG,
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
      group: NG,
      label: `${CREATOR} wins (the creator's foil)`,
      view: D,
      mode: 'client',
      me: K,
      state: game([[CREATOR, 10], ['Kalguur', 9], ['Doryani', 4]], { recap: turnsRecap(CREATOR, 'Headhunter', { answers: { [K]: { n: 10, ok: 9, ms: 2600 } }, misses: misses('Kalguur', ['Ingenuity']) }) }),
    },
    { key: 'e-one-point', group: NG, label: 'A game to 1 point: one round', view: D, mode: 'host', me: K, state: onePoint(), earned: ['first-victory'] },
    { key: 'e-negative', group: NG, label: 'Race: scores below nothing (you on -1)', view: D, mode: 'client', me: pid('Alva'), state: negative() },
    {
      key: 'e-tie',
      group: NG,
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
    { key: 'e-dm-won', group: NG, label: 'You won the deathmatch', view: D, mode: 'host', me: K, state: deathmatch(), earned: ['first-victory', 'deathmatch'] },
    { key: 'e-dm-three', group: NG, label: 'A deathmatch of three: out on its first question', view: D, mode: 'client', me: doryani, state: threeWay() },
    {
      key: 'e-winner-missed',
      group: NG,
      label: 'A winner who missed some, five achievements',
      view: D,
      mode: 'host',
      me: K,
      state: game(FIVE, { recap: turnsRecap('Doryani', "Atziri's Disdain", { answers: { [K]: { n: 13, ok: 10, ms: 2400 } }, misses: misses('Kalguur', ['Headhunter', 'Ingenuity', 'Chainsting']) }) }),
      earned: ['first-victory', 'tide-turner', 'usurper', 'great-work', 'sweet-revenge'],
    },
    {
      key: 'e-many-misses',
      group: NG,
      label: 'Eleven missed, the longest category hardest',
      view: D,
      mode: 'client',
      me: una(),
      state: game(FIVE, {
        recap: turnsRecap('Doryani', 'Guiding Palm of the Heart', {
          cats: { 'Flasks, Charms, Jewels, Relics & Tablets': [6, 1], 'One-Handed Weapons': [7, 5] },
          answers: { [una()]: { n: 18, ok: 7, ms: 3400 } },
          misses: misses('Una of the Vaal', MANY),
        }),
      }),
    },
    { key: 'e-seven', group: NG, label: 'Seven players: two columns, one short', view: D, mode: 'client', me: doryani, state: crowd(7) },
    { key: 'e-eight-short', group: NG, label: 'Eight on a 13-inch window: two columns', view: A, mode: 'client', me: doryani, state: crowd(8) },
    { key: 'e-nine', group: NG, label: 'Nine players: two columns, one short', view: D, mode: 'client', me: doryani, state: crowd(9) },
    { key: 'e-eleven', group: NG, label: 'Eleven players', view: D, mode: 'client', me: doryani, state: crowd(11) },
    { key: 'e-one-left', group: NG, label: 'Only you still here (1 of 5)', view: D, mode: 'host', me: K, state: allGone(), earned: ['first-victory'] },
    {
      key: 'e-alone-online',
      group: NG,
      label: 'A host alone in an online room',
      view: D,
      mode: 'host',
      me: K,
      state: game([['Kalguur', 10]], { rounds: 12, recap: { fastest: { by: K, id: id('Mageblood'), ms: 2900 }, answers: { [K]: { n: 12, ok: 10, ms: 2900 } }, cats: { Rings: [4, 3], Helmets: [3, 3] }, misses: misses('Kalguur', ['Headhunter', 'Death Rush']) } }),
    },
    { key: 'e-hot-clean', group: NG, label: 'Hot-seat, not one missed', view: D, mode: 'local', me: null, state: game([['Doryani', 10], ['Kalguur', 9]], { host: null, recap: turnsRecap('Kalguur', 'Headhunter') }) },
    { key: 'e-no-recap', group: NG, label: 'No highlights (a host from before the recap)', view: D, mode: 'client', me: una(), state: game(FIVE, { recap: null }) },
    {
      key: 'e-clean-race',
      group: NG,
      label: 'Race: you never guessed wrong',
      view: D,
      mode: 'client',
      me: doryani,
      state: game(
        [['Kalguur', 10], ['Doryani', 7], ['Rog', 2]],
        { race: true, rounds: 22, recap: { fastest: { by: doryani, id: id('Death Rush'), ms: 1300 }, answers: { [doryani]: { n: 7, ok: 7, ms: 1300 } }, misses: [] } },
      ),
    },
    { key: 'e-no-answers', group: NG, label: 'A player who never answered', view: D, mode: 'client', me: pid('Alva'), state: game([['Kalguur', 10], ['Doryani', 8], ['Alva', 0]], { recap: turnsRecap('Kalguur', 'Headhunter') }) },
    { key: 'e-joiners', group: NG, label: 'Four spectators join next', view: D, mode: 'host', me: K, state: race({ spectators: ['Finn', 'Renly', 'Oswin', 'Zelina'].map((n) => spectator(n)) }) },
    { key: 'e-just-watching', group: NG, label: 'A spectator who just watches', view: D, mode: 'client', me: pid('Watcher'), state: watched(won(), true) },
    { key: 'e-phone-spec', group: NG, label: 'Phone: a spectator', view: 'phone375', mode: 'client', me: pid('Watcher'), state: watched(won()) },

    // Delve, around the edges.
    { key: 'e-level', group: DG, label: 'Alone: level with your best', view: D, mode: 'local', me: null, state: solo(), delveResult: measured(23, 23, false), log: soloLog(), runs: runs([16, 23, 12, 20], 23, false) },
    {
      key: 'e-deep',
      group: DG,
      label: 'Alone: past the tenth zone (depth 114)',
      view: D,
      mode: 'local',
      me: null,
      state: solo({ depth: 115, losses: { [K]: [96, 108, 115] }, recap: { fastest: { by: K, id: id('Mageblood'), ms: 1100 }, closest: { by: K, id: id('Chainsting'), left: 90, depth: 112 } } }),
      delveResult: measured(115, 101, true),
      log: [miss(10, 'Mageblood', 96), miss(20, 'Ingenuity', 108), miss(30, 'Chainsting', 115)],
      runs: runs([40, 61, 88, 101], 115, false),
    },
    {
      key: 'e-depth0',
      group: DG,
      label: 'Alone: gone at depth 0',
      view: D,
      mode: 'local',
      me: null,
      state: solo({ depth: 1, losses: { [K]: [1, 1, 1] }, recap: {} }),
      delveResult: measured(1, 21, false),
      log: [miss(10, 'Headhunter', 1), miss(20, 'Ingenuity', 1), miss(30, 'Briarpatch', 1)],
      runs: runs([21, 15], 1, false),
    },
    {
      key: 'e-cave-two',
      group: DG,
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
      key: 'e-facts',
      group: DG,
      label: 'Alone: more finds than fit (blown up, a haul, burnt, unlit)',
      view: D,
      mode: 'local',
      me: null,
      state: solo({
        depth: 52,
        losses: { [K]: [44, 49, 52] },
        recap: {
          fastest: { by: K, id: id('Headhunter'), ms: 1800 },
          items: [
            { kind: 'dynamite', at: 14, by: K, used: 30, how: 'blown' },
            { kind: 'wards', at: 33, by: K, used: 40, how: 'ward' },
            { kind: 'wards', at: 33, by: K, used: 42, how: 'ward' },
            { kind: 'wards', at: 33, by: K },
            { kind: 'flares', at: 41, by: K, used: 47, how: 'flare' },
            { kind: 'dynamite', at: 45, by: K },
          ],
        },
      }),
      delveResult: measured(52, 60, false),
      log: [miss(10, 'Headhunter', 40, { warded: true }), miss(15, 'Mageblood', 42, { warded: true }), miss(20, 'Ingenuity', 44), miss(30, 'Briarpatch', 49), miss(40, 'Death Rush', 52)],
      runs: runs([60, 33, 45], 52, false),
    },
    {
      key: 'e-first-finds',
      group: DG,
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
    {
      key: 'e-tall-art',
      group: DG,
      label: 'Alone: a staff and a bow took lives (tall art)',
      view: D,
      mode: 'local',
      me: null,
      state: solo({ recap: { fastest: { by: K, id: id("Atziri's Rule"), ms: 1700 }, closest: { by: K, id: id('Chainsting'), left: 600, depth: 18 } } }),
      delveResult: measured(23, 27, false),
      log: [miss(10, "Atziri's Rule", 19), miss(20, 'Chainsting', 21), miss(30, 'The Burden of Shadows', 23)],
      runs: soloRuns(),
    },
    { key: 'e-chart-two', group: DG, label: 'Alone: the second run (a chart of two)', view: D, mode: 'local', me: null, state: solo(), delveResult: measured(23, 18, true), log: soloLog(), runs: runs([18], 23, false) },
    {
      key: 'e-chart-full',
      group: DG,
      label: 'Alone: fourteen runs before, this one tied with the best',
      view: D,
      mode: 'local',
      me: null,
      state: solo(),
      delveResult: measured(23, 23, false),
      log: soloLog(),
      runs: runs([9, 23, 14, 18, 11, 23, 16, 20, 12, 19, 15, 21, 17, 22], 23, false),
    },
    { key: 'e-no-codex', group: DG, label: "Alone: the lives aren't in this codex (another tab)", view: D, mode: 'local', me: null, state: solo(), delveResult: measured(23, 27, false), log: [], runs: soloRuns() },
    { key: 'e-mixed', group: DG, label: 'Alone: a run finished under newer rules', view: D, mode: 'local', me: null, state: solo({ mixed: true }), ...solo23() },
    { key: 'e-delve-online', group: DG, label: 'Alone in an online room (host)', view: D, mode: 'host', me: K, state: solo({ host: K }), ...solo23() },
    { key: 'e-watch-solo', group: DG, label: 'Watching someone delve alone', view: D, mode: 'client', me: pid('Watcher'), state: watched(solo({ host: K })) },
    {
      key: 'e-team2',
      group: DG,
      label: 'Together: a team of two',
      view: D,
      mode: 'client',
      me: doryani,
      state: delve(['Kalguur', 'Doryani'], {
        depth: 15,
        losses: { [K]: [9, 12, 15], [doryani]: [11, 13, 14] },
        host: K,
        recap: { fastest: { by: doryani, id: id('Headhunter'), ms: 2200 } },
      }),
      delveResult: measured(15, null, true),
      log: [miss(10, 'Headhunter', 11, team('Doryani')), miss(20, 'Ingenuity', 13, team('Doryani')), miss(30, 'Briarpatch', 14, team('Doryani'))],
      runs: runs([], 15, true, doryani),
    },
    { key: 'e-team4', group: DG, label: 'Together: four delvers', view: D, mode: 'host', me: K, state: teamOf(4), ...host6() },
    { key: 'e-team5', group: DG, label: 'Together: five delvers', view: D, mode: 'host', me: K, state: teamOf(5), ...host6() },
    { key: 'e-team7', group: DG, label: 'Together: seven delvers', view: D, mode: 'host', me: K, state: teamOf(7), ...host6() },
    {
      key: 'e-many-lives',
      group: DG,
      label: 'Together: one life given, one brought back',
      view: D,
      mode: 'host',
      me: K,
      state: delve(TEAM3, {
        depth: 33,
        host: K,
        losses: { [K]: [14, 25, 33], [doryani]: [20, 24, 30, 31], [una()]: [22, 28, 32] },
        revives: [
          { by: K, to: doryani, depth: 24, fell: 24, at: RUN + 35 },
          { by: una(), to: K, depth: 25, fell: 25, at: RUN + 45 },
        ],
        recap: { fastest: { by: una(), id: id("Kaom's Heart"), ms: 1700 } },
        streak: 7,
      }),
      delveResult: measured(33, 27, true),
      log: [miss(10, 'Ingenuity', 14, team('Kalguur')), miss(40, 'Death Rush', 25, team('Kalguur')), miss(60, 'Headhunter', 33, team('Kalguur'))],
      runs: runs([12, 27, 18], 33, true, K),
    },
    {
      key: 'e-back-twice',
      group: DG,
      label: 'Together: brought back twice (five rows)',
      view: D,
      mode: 'client',
      me: K,
      state: delve(TEAM3, {
        depth: 23,
        host: doryani,
        losses: { [K]: [5, 8, 10, 15, 22], [doryani]: [12, 18, 21], [una()]: [9, 19, 23] },
        revives: [
          { by: una(), to: K, depth: 10, fell: 10, at: RUN + 35 },
          { by: doryani, to: K, depth: 15, fell: 15, at: RUN + 55 },
        ],
        recap: { fastest: { by: K, id: id('Ingenuity'), ms: 1900 } },
      }),
      delveResult: measured(23, 26, false),
      log: [
        miss(10, 'Headhunter', 5, team('Kalguur')),
        miss(20, 'Ingenuity', 8, team('Kalguur')),
        miss(30, 'Briarpatch', 10, team('Kalguur')),
        miss(50, 'Death Rush', 15, team('Kalguur')),
        miss(70, "Kaom's Heart", 22, team('Kalguur')),
      ],
      runs: runs([26, 14], 23, true, K),
    },
    {
      key: 'e-gave-all',
      group: DG,
      label: 'Together: you gave every life away',
      view: D,
      mode: 'client',
      me: K,
      state: delve(TEAM3, {
        depth: 24,
        host: doryani,
        losses: { [K]: [], [doryani]: [8, 10, 14, 19, 24], [una()]: [11, 15, 18, 22] },
        revives: [
          { by: K, to: doryani, depth: 10, fell: 10, at: RUN + 15 },
          { by: K, to: una(), depth: 15, fell: 15, at: RUN + 25 },
          { by: K, to: doryani, depth: 19, fell: 19, at: RUN + 35 },
        ],
        recap: {},
      }),
      delveResult: measured(24, 30, false),
      log: [],
      runs: runs([30], 24, true, K),
    },
    {
      key: 'e-team-quiet',
      group: DG,
      label: 'Together: no highlights at all',
      view: D,
      mode: 'host',
      me: K,
      state: delve(TEAM3, { depth: 12, host: K, losses: { [K]: [6, 9, 12], [doryani]: [5, 8, 11], [una()]: [7, 10, 12] }, recap: {} }),
      delveResult: measured(12, 19, false),
      log: [miss(10, 'Headhunter', 6, team('Kalguur')), miss(20, 'Ingenuity', 9, team('Kalguur')), miss(30, 'Briarpatch', 12, team('Kalguur'))],
      runs: runs([19, 9], 12, true, K),
    },
    { key: 'e-unmeasured', group: DG, label: 'Together: a run this device never recorded', view: D, mode: 'client', me: doryani, state: teamRun(TEAM6), delveResult: null, log: guestLog() },
    { key: 'e-team-left', group: DG, label: 'Together: Rog went offline', view: D, mode: 'host', me: K, state: teamRun(TEAM6, { left: 'Rog', streak: 5 }), ...host6() },
    { key: 'e-phone-delve-guest', group: DG, label: 'Phone: a guest of six, waiting', view: P, mode: 'client', me: doryani, state: teamRun(TEAM6), delveResult: measured(27, 32, false), log: guestLog(), runs: runs([17, 32, 15], 27, true, doryani) },
    // Further round the edges.
    {
      key: 'e-winner-gone',
      group: NG,
      label: 'The winner went offline',
      view: D,
      mode: 'host',
      me: K,
      state: (() => {
        const s = game([['Rog', 10], ['Kalguur', 8], ['Doryani', 7], ['Alva', 4]], { recap: turnsRecap('Rog', 'Headhunter', { answers: { [K]: { n: 10, ok: 8, ms: 2500 } }, misses: misses('Kalguur', ['Ingenuity', 'Death Rush']) }) });
        s.players[0].connected = false;
        return s;
      })(),
    },
    {
      key: 'e-dm-default',
      group: NG,
      label: 'A deathmatch won by default: the rival left',
      view: D,
      mode: 'host',
      me: K,
      state: game([['Kalguur', 10], ['Una of the Vaal', 7], ['Rog', 5]], {
        recap: turnsRecap('Kalguur', 'Headhunter', { answers: { [K]: { n: 10, ok: 10, ms: 2200, dn: 1, dok: 1 } } }),
        extra: { deathmatch: { alive: [K], entrants: [K, doryani], round: 1, results: {}, eliminated: [], startedAt: 0 } },
      }),
      earned: ['first-victory'],
    },
    {
      key: 'e-gems',
      group: NG,
      label: 'Gems and many-pictured items: the fastest, the misses',
      view: D,
      mode: 'client',
      me: una(),
      state: game(FIVE, {
        recap: turnsRecap('Doryani', "Ahn's Citadel", {
          cats: { 'Lineage Gems': [5, 1], Rings: [4, 3] },
          answers: { [una()]: { n: 10, ok: 7, ms: 2900 } },
          misses: misses('Una of the Vaal', ["Ailith's Chimes", 'Grand Spectrum', "Amanamu's Tithe"]),
        }),
      }),
    },
    {
      key: 'e-scripts',
      group: NG,
      label: 'Names in other scripts and with digits',
      view: D,
      mode: 'client',
      me: pid('Exile42'),
      state: (() => {
        const names = ['桜子', 'Ярослава', 'Exile42', 'Ἀθηνᾶ', 'Zoë'];
        const s = game(
          names.map((n, i) => [n, 10 - i * 2] as [string, number]),
          { host: pid('Exile42'), recap: { fastest: { by: pid('Ярослава'), id: id('Headhunter'), ms: 1900 }, answers: { [pid('Exile42')]: { n: 10, ok: 6, ms: 3300 } }, misses: misses('Exile42', ['Ingenuity']) } },
        );
        // pid keeps Latin letters only: the others get ids of their own.
        s.players.forEach((p, i) => (p.id = p.name === 'Exile42' ? pid('Exile42') : `id-name-${i}`));
        s.winners = [s.players[0].id];
        s.hostId = s.players[0].id;
        s.recap!.fastest = { by: s.players[1].id, id: id('Headhunter'), ms: 1900 };
        return s;
      })(),
    },
    {
      key: 'e-gallery',
      group: NG,
      label: 'Eight watching: five join next, three just watch',
      view: D,
      mode: 'host',
      me: K,
      state: { ...won(), spectators: [...['Finn', 'Renly', 'Oswin', 'Zelina', 'Dannig'].map((n) => spectator(n)), ...['Hooded One', 'Sekhema Asala', 'Watcher'].map((n) => spectator(n, true))] },
    },
    {
      key: 'e-team-dropped',
      group: DG,
      label: 'Together: one of three left the run',
      view: D,
      mode: 'host',
      me: K,
      state: (() => {
        const s = delve(['Kalguur', 'Doryani'], { depth: 26, host: K, losses: { [K]: [20, 24, 26], [doryani]: [18, 22, 25] }, recap: { fastest: { by: doryani, id: id('Ingenuity'), ms: 2000 } } });
        s.delve!.entrants = [K, doryani, una()];
        s.delve!.leftAt = 17;
        return s;
      })(),
      delveResult: measured(26, 30, false),
      log: [miss(10, 'Headhunter', 20, team('Kalguur')), miss(20, 'Ingenuity', 24, team('Kalguur')), miss(30, 'Briarpatch', 26, team('Kalguur'))],
      runs: runs([30, 21], 26, true, K),
    },
    { key: 'e-phone-twelve-delve', group: DG, label: 'Phone: twelve delvers', view: P, mode: 'host', me: K, state: teamRun(TEAM12), ...host6() },
    {
      key: 'e-long-team',
      group: DG,
      label: 'Together: long names, a life given and one brought back',
      view: D,
      mode: 'client',
      me: pid(LONG[1]),
      state: delve(LONG.slice(0, 3), {
        depth: 21,
        host: pid(LONG[0]),
        losses: { [pid(LONG[0])]: [12, 17, 21], [pid(LONG[1])]: [8, 11, 14, 20], [pid(LONG[2])]: [10, 15, 19] },
        revives: [
          { by: pid(LONG[0]), to: pid(LONG[1]), depth: 14, fell: 14, at: RUN + 35 },
          { by: pid(LONG[1]), to: pid(LONG[2]), depth: 19, fell: 19, at: RUN + 55 },
        ],
        recap: { fastest: { by: pid(LONG[2]), id: id('Guiding Palm of the Heart'), ms: 2300 } },
      }),
      delveResult: measured(21, 25, false),
      log: [miss(10, 'Headhunter', 8, team(LONG[1])), miss(20, 'Ingenuity', 11, team(LONG[1])), miss(30, 'Guiding Palm of the Heart', 14, team(LONG[1])), miss(60, 'Briarpatch', 20, team(LONG[1]))],
      runs: runs([25, 16], 21, true, pid(LONG[1])),
    },
    {
      key: 'e-wards-saved',
      group: DG,
      label: 'Alone: wards took a whole cave-in and a last life (no rows for them)',
      view: D,
      mode: 'local',
      me: null,
      state: solo({
        depth: 47,
        losses: { [K]: [36, 41, 47] },
        recap: {
          fastest: { by: K, id: id('Ingenuity'), ms: 1600 },
          items: [
            { kind: 'wards', at: 30, by: K, used: 33, how: 'ward' },
            { kind: 'wards', at: 30, by: K, used: 33, how: 'ward' },
            { kind: 'wards', at: 38, by: K, used: 44, how: 'ward' },
          ],
        },
      }),
      delveResult: measured(47, 50, false),
      log: [
        miss(5, 'Mageblood', 33, { find: 'azurite', lives: 0, wards: 2 }),
        miss(10, 'Headhunter', 36),
        miss(20, 'Ingenuity', 41),
        miss(25, 'Chainsting', 44, { warded: true }),
        miss(30, 'Briarpatch', 47),
      ],
      runs: runs([50, 31], 47, false),
    },
    { key: 'e-chart-flat', group: DG, label: 'Alone: every run ended at the same depth', view: D, mode: 'local', me: null, state: solo({ depth: 16, losses: { [K]: [11, 14, 16] } }), delveResult: measured(16, 16, false), log: [miss(10, 'Headhunter', 11), miss(20, 'Ingenuity', 14), miss(30, 'Briarpatch', 16)], runs: runs([16, 16, 16, 16], 16, false) },
    {
      key: 'e-chart-zero',
      group: DG,
      label: 'Alone: every run gone at depth 0',
      view: D,
      mode: 'local',
      me: null,
      state: solo({ depth: 1, losses: { [K]: [1, 1, 1] }, recap: {} }),
      delveResult: measured(1, 1, false),
      log: [miss(10, 'Headhunter', 1), miss(20, 'Ingenuity', 1), miss(30, 'Briarpatch', 1)],
      runs: runs([1, 1, 1], 1, false),
    },
    {
      key: 'e-zone-edge',
      group: DG,
      label: 'Alone: a first run ending at depth 10 (a zone edge)',
      view: D,
      mode: 'local',
      me: null,
      state: solo({ depth: 11, losses: { [K]: [6, 9, 11] }, recap: { fastest: { by: K, id: id('Headhunter'), ms: 2600 } } }),
      delveResult: measured(11, null, true),
      log: [miss(10, 'Headhunter', 6), miss(20, 'Ingenuity', 9), miss(30, 'Briarpatch', 11)],
      runs: runs([], 11, false),
      earned: ['depth-10'],
    },
    {
      key: 'e-delve-joiners',
      group: DG,
      label: 'Together: three join the next run',
      view: D,
      mode: 'host',
      me: K,
      state: { ...teamRun(TEAM6), spectators: ['Finn', 'Renly', 'Oswin'].map((n) => spectator(n)) },
      ...host6(),
    },
    {
      key: 'e-team-norecap',
      group: DG,
      label: 'Together: no summary from the host (an older host)',
      view: D,
      mode: 'client',
      me: doryani,
      state: (() => {
        const s = teamRun(TEAM6);
        delete s.recap;
        return s;
      })(),
      delveResult: measured(27, 32, false),
      log: guestLog(),
      runs: runs([17, 32, 15], 27, true, doryani),
    },
  ];
}
