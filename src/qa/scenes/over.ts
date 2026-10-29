// The end screen's states: every board of the handoff
// (docs/handoff/end-screen) and the edge cases around them, each a finished
// game as this device would have it at its end: the room's state, who this
// device is, how its run measured up, what it earned, and the codex log and
// Delve records the screen reads. The QA desk walks them (scenes/index.ts).

import { DEFAULT_SETTINGS, createGame, type GameState, type Recap } from '../../lib/game.ts';
import { DELVE_RULESET } from '../../lib/delve.ts';
import type { Answer } from '../../lib/codex.ts';
import type { DelveRun } from '../../lib/delveRecord.ts';
import { id, pid, player, spectator } from '../build/people.ts';
import { sceneEngine } from '../build/engine.ts';
import { valuesOf, type Control, type State, type Values } from '../bench.ts';
import type { Scene, Seat } from '../scene.ts';
import type { PlateName } from '../../lib/plates/index.ts';
import type { SizeKey } from '../sizes.ts';

export { pid };
export type Mode = 'host' | 'client' | 'local';
/** The windows the end screen's page knew, by its own names for them. */
export type EndView = 'desktop' | 'air13' | 'tablet' | 'phone' | 'phone375' | 'narrow' | 'big' | 'landscape';

export interface EndScene {
  key: string;
  group: 'Normal games' | 'Delve';
  label: string;
  /** The handoff's boards it draws (docs/handoff/end-screen/screens/<board>.webp), by the window each was drawn at. */
  boards?: Partial<Record<EndView, string>>;
  /** The window it opens at. */
  view: EndView;
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
  /** Items this device met before, besides its log (../scene.ts' met). */
  met?: string[] | number;
  /** What can be set in it (../bench.ts' Control), its named states, and the game as they set it. */
  controls?: Control[];
  states?: State[];
  vary?: (v: Values) => AsSet;
}

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
/** One of this device's right answers in the run, `t` ms in. */
const hit = (t: number, name: string, depth: number): Answer => ({ ...miss(t, name, depth), ok: true });
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

const soloRecap = (): Partial<Recap> => ({
  fastest: { by: K, id: id('Headhunter'), ms: 1900 },
  closest: { by: K, id: id('Ingenuity'), left: 400, depth: 17 },
  items: [{ kind: 'dynamite', at: 15, by: K, used: 18, how: 'blast' }],
});
const solo = (more: Partial<Parameters<typeof delve>[1]> = {}) => delve(['Kalguur'], { depth: 23, losses: { [K]: [19, 21, 23] }, recap: soloRecap(), host: null, ...more });
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

// ---- any game, as set ------------------------------------------------------------
// Everything else the end screen meets is one of three games set by their controls: how many, how it went, how much
// each list holds. Their named states are the most each kind of game puts on the screen at once.

const una = () => pid('Una of the Vaal');
/** Everyone a game can have besides you, in the order they come. */
const OTHERS = ['Doryani', 'Una of the Vaal', 'Rog', 'Alva', 'Dannig', 'Hooded One', 'Zelina', 'Oswin', 'Renly', 'Finn', 'Sekhema Asala'];
/** The first `n` uniques the game has, leaving out `but` (by name). */
const uniques = (n: number, but: string[] = []) =>
  sceneEngine()
    .items.filter((it) => !but.includes(it.name))
    .slice(0, n)
    .map((it) => it.name);
/** What lives are lost on, in turn. */
const LOST = ['Headhunter', 'Ingenuity', 'Briarpatch', 'Death Rush', "Kaom's Heart", "Atziri's Disdain"];
const range = (key: string, label: string, min: number, max: number, dflt: number): Control => ({ kind: 'range', key, label, min, max, default: dflt });
const choice = (key: string, label: string, options: [string, string][]): Control => ({ kind: 'choice', key, label, default: options[0][0], options: options.map(([value, label]) => ({ value, label })) });

/** What a game as set builds: its state, who this device is, and what it keeps. */
type AsSet = Pick<EndScene, 'state' | 'delveResult' | 'earned' | 'log' | 'runs' | 'met'> & { seat: Seat };

const GAME_CONTROLS: Control[] = [
  choice('kind', 'Game', [['turns', 'Take turns'], ['race', 'Race'], ['dm', 'Deathmatch'], ['hot', 'Hot-seat']]),
  range('players', 'Players', 1, 12, 5),
  choice('place', 'You', [['won', 'Won'], ['second', 'Came second'], ['last', 'Came last'], ['tie', 'Tied for first'], ['joins', 'Watched, play next'], ['watches', 'Watched, staying so']]),
  { kind: 'toggle', key: 'guest', label: "In someone else's room", default: false },
  range('missed', 'Missed', 0, 30, 0),
  range('earned', 'Achievements earned', 0, 8, 0),
  choice('twist', 'Besides', [['', 'Nothing'], ['one-point', 'A game to 1 point'], ['negative', 'Scores below nothing'], ['idle', 'You never answered'], ['gems', 'Gems and many-pictured items'], ['default', 'A deathmatch won by default'], ['no-recap', 'No highlights (an older host)']]),
];
const GAME_EARNED = ['first-victory', 'tide-turner', 'great-work', 'sweet-revenge', 'fooled-twice', 'prima-materia', 'mercurial', 'twofold'];
const GEMS = ["Ailith's Chimes", 'Grand Spectrum', "Amanamu's Tithe"];

/** A normal game as its controls set it, seen by Kalguur (or by nobody in particular, in hot-seat). */
function anyGame(v: Values): AsSet {
  const twist = String(v.twist);
  const kind = twist === 'default' ? 'dm' : String(v.kind);
  const hot = kind === 'hot';
  const watching = !hot && (v.place === 'joins' || v.place === 'watches');
  const place = watching || hot ? 'won' : twist === 'idle' ? 'last' : String(v.place);
  const n = Math.max(watching ? 1 : 0, Number(v.players));
  // The others, then you where you placed (none when you watch).
  const names = OTHERS.slice(0, watching ? n : n - 1);
  const at = watching ? -1 : place === 'won' || place === 'tie' ? 0 : place === 'second' ? Math.min(1, n - 1) : n - 1;
  if (at >= 0) names.splice(at, 0, 'Kalguur');
  const onePoint = twist === 'one-point';
  const tied = place === 'tie' || kind === 'dm';
  const ladder = (i: number) => (onePoint ? (i === 0 ? 1 : 0) : twist === 'negative' ? [10, 6, 2, 0, -1, -3, -4, -6, -7, -9, -10, -12][i] : i === 0 ? 10 : Math.max(0, 9 - i));
  // (Tied: the second as many as the first.)
  const score = (i: number) => ladder(tied && i === 1 ? 0 : i);
  const scores = names.map((name, i) => [name, name === 'Kalguur' && twist === 'idle' ? Math.min(0, score(i)) : score(i)] as [string, number]);
  // (A game of one round, or one you never answered in, has nothing missed.)
  const missed = twist === 'gems' ? [...GEMS, ...uniques(Math.max(0, Number(v.missed) - 3), GEMS)].slice(0, Math.max(3, Number(v.missed))) : uniques(twist === 'idle' || onePoint ? 0 : Number(v.missed));
  const others = names.filter((name) => name !== 'Kalguur');
  // (Someone else's room is someone else's: with no one else in it, it's yours.)
  const guest = watching || (!!v.guest && others.length > 0);
  const rival = names[at === 0 ? 1 : 0] ?? names[0];
  const rounds = onePoint ? 1 : 10 + missed.length;
  const recap: Partial<Recap> = {
    ...turnsRecap(rival, twist === 'gems' ? "Ahn's Citadel" : "Atziri's Disdain"),
    ...(missed.length > 5 ? { cats: { 'Flasks, Charms, Jewels, Relics & Tablets': [6, 1], 'One-Handed Weapons': [12, 9], Rings: [9, 8] } } : {}),
    ...(twist === 'gems' ? { cats: { 'Lineage Gems': [5, 1], Rings: [4, 3] } } : {}),
    ...(onePoint ? { cats: { Rings: [1, 1] } } : {}),
    ...(kind === 'race' ? { wrong: { [id("Kaom's Heart")]: 5 }, firsts: { by: pid(rival), n: 6 } } : {}),
    answers: at >= 0 && twist !== 'idle' ? { [K]: { n: rounds, ok: Math.max(0, scores[at][1]), ms: 2400 } } : {},
    // In hot-seat everyone's misses show: shared out among the players.
    misses: hot ? missed.map((name, i) => ({ by: pid(names[i % names.length]), id: id(name) })) : misses('Kalguur', missed),
  };
  const s = game(scores, {
    race: kind === 'race',
    rounds,
    recap: twist === 'no-recap' ? null : recap,
    winners: tied && kind !== 'dm' && n > 1 ? [pid(names[0]), pid(names[1])] : undefined,
    host: hot ? null : guest ? pid(others[0]) : K,
  });
  if (onePoint) s.settings.targetScore = 1;
  if (kind === 'dm' && n > 1) {
    const [a, b] = [pid(names[0]), pid(names[1])];
    s.deathmatch =
      twist === 'default'
        ? { alive: [a], entrants: [a, pid('Tujen')], round: 1, results: {}, eliminated: [], startedAt: 0 }
        : { alive: [a], entrants: [a, b], round: 3, results: {}, eliminated: [b], out: { [b]: 3 }, startedAt: 0 };
    s.winners = [a];
  }
  if (watching) s.spectators = [spectator('Kalguur', v.place === 'watches')];
  return {
    state: s,
    seat: hot ? { mode: 'local', me: null } : { mode: guest ? 'client' : 'host', me: K },
    earned: watching ? [] : GAME_EARNED.slice(0, Number(v.earned)),
  };
}

const ALONE_CONTROLS: Control[] = [
  choice('you', 'Seen', [['local', 'On this device'], ['host', 'Hosting an online room'], ['watching', 'Watching someone']]),
  range('depth', 'Depth', 0, 119, 22),
  range('before', 'Runs before', 0, 14, 7),
  choice('best', 'Against the best', [['short', 'Short of it'], ['level', 'Level with it'], ['best', 'A new best']]),
  range('finds', 'Finds', 0, 6, 1),
  range('fresh', 'Uniques new to the codex', 0, 40, 0),
  range('earned', 'Achievements earned', 0, 5, 0),
  choice('twist', 'Besides', [['', 'Nothing'], ['cave', 'A cave-in took two lives'], ['wards', 'Wards took a cave-in and a life'], ['tall', 'Lives lost on tall art'], ['flat', 'Every run as deep'], ['no-codex', "Its lives in another tab's codex"], ['mixed', 'Finished under newer rules'], ['quiet', 'No highlights']]),
];
/** The depths earlier runs ended at, the deepest first scaled to it. */
const EARLIER = [27, 16, 12, 20, 25, 20, 14, 9, 23, 18, 11, 19, 15, 21];
const FINDS: NonNullable<Recap['items']>[number][] = [
  { kind: 'dynamite', at: 14, by: K, used: 30, how: 'blown' },
  { kind: 'wards', at: 33, by: K, used: 40, how: 'ward' },
  { kind: 'flares', at: 41, by: K, used: 47, how: 'flare' },
  { kind: 'wards', at: 33, by: K, used: 42, how: 'ward' },
  { kind: 'wards', at: 33, by: K },
  { kind: 'dynamite', at: 45, by: K },
];

/** A run alone as its controls set it. Depths as the game keeps them, one more than shown. */
function anyAlone(v: Values): AsSet {
  const twist = String(v.twist);
  const d = Number(v.depth) + 1;
  const deep = (x: number) => Math.max(1, Math.min(d, Math.round((x * d) / 52)));
  const lost = twist === 'tall' ? ["Atziri's Rule", 'Chainsting', 'The Burden of Shadows'] : ['Headhunter', 'Briarpatch', 'Death Rush'];
  const losses = twist === 'cave' ? [Math.max(1, d - 17), d, d] : [Math.max(1, d - 4), Math.max(1, d - 2), d];
  const items = FINDS.slice(0, Number(v.finds)).map((it) => ({ ...it, at: deep(it.at), ...(it.used ? { used: deep(it.used) } : {}) }));
  if (twist === 'cave') items.push({ kind: 'flares', at: deep(41), by: K, used: deep(44), how: 'flare' });
  if (twist === 'wards') items.push({ kind: 'wards', at: deep(30), by: K, used: deep(33), how: 'ward' }, { kind: 'wards', at: deep(30), by: K, used: deep(33), how: 'ward' });
  const quiet = twist === 'quiet' || d <= 1;
  const s = solo({
    depth: d,
    losses: { [K]: losses },
    host: v.you === 'local' ? null : K,
    mixed: twist === 'mixed',
    recap: quiet ? { items } : { fastest: { by: K, id: id(twist === 'tall' ? lost[0] : 'Ingenuity'), ms: 1700 }, closest: { by: K, id: id(twist === 'tall' ? lost[1] : 'Mageblood'), left: 400, depth: deep(40) }, items },
  });
  if (v.you === 'watching') return { state: watched(s), seat: { mode: 'client', me: pid('Watcher') } };
  const before = Number(v.before);
  const best = twist === 'flat' ? d : v.best === 'short' ? d + 4 : v.best === 'level' ? d : Math.max(1, d - 6);
  const earlier = twist === 'flat' ? Array(before).fill(d) : EARLIER.slice(0, before).map((x) => Math.max(1, Math.round((x * best) / 27)));
  const log = [
    ...uniques(Number(v.fresh), lost).map((name, i) => hit(1 + i, name, Math.min(d, 1 + i))),
    ...(twist === 'wards' ? [miss(999, 'Mageblood', deep(33), { find: 'azurite', lives: 0, wards: 2 })] : []),
    // (The cave-in's two lives one wrong answer: its find took the second.)
    ...losses.slice(0, twist === 'cave' ? 2 : 3).map((at, i) => miss(1000 + i, lost[i], at, twist === 'cave' && i === 1 ? { find: 'azurite', lives: 2, wards: 0 } : {})),
    ...(twist === 'wards' ? [miss(1005, 'Chainsting', Math.max(1, d - 3), { warded: true })] : []),
  ];
  return {
    state: s,
    seat: v.you === 'host' ? { mode: 'host', me: K } : { mode: 'local', me: null },
    delveResult: before ? measured(d, Math.max(...earlier), d > Math.max(...earlier)) : measured(d, null, true),
    log: twist === 'no-codex' ? [] : log,
    runs: runs(earlier, d, false),
    ...(before ? {} : { met: [] }),
    earned: [d > 50 ? 'depth-50' : 'depth-10', 'saving-grace', 'chain-reaction', 'fully-laden', 'streak-25'].slice(0, Number(v.earned)),
  };
}

const TOGETHER_CONTROLS: Control[] = [
  choice('you', 'You', [['host', 'Hosted'], ['guest', 'Joined'], ['watching', 'Watched, play next']]),
  range('delvers', 'Delvers', 2, 12, 3),
  range('back', 'Times you were brought back', 0, 3, 0),
  range('gave', 'Lives you gave', 0, 3, 0),
  range('streak', 'Best streak together', 0, 12, 0),
  choice('best', 'Against the best', [['best', 'A new best'], ['short', 'Short of it'], ['first', 'The first run'], ['unrecorded', 'Not recorded here']]),
  range('earned', 'Achievements earned', 0, 4, 0),
  choice('twist', 'Besides', [['', 'Nothing'], ['left', 'One of them left'], ['quiet', 'No highlights'], ['no-recap', 'No summary (an older host)']]),
];

/** A run together as its controls set it: Kalguur's lives, the others' as teamRun has them. */
function anyTogether(v: Values): AsSet {
  const twist = String(v.twist);
  const [back, gave] = [Number(v.back), Number(v.gave)];
  const names = TEAM12.slice(0, Number(v.delvers));
  const others = names.filter((n) => n !== 'Kalguur').map(pid);
  const s = teamRun(names, { streak: Number(v.streak) || undefined });
  s.hostId = v.you === 'host' ? K : pid('Doryani');
  // Three lives, one more each time you were brought back, one fewer each you gave: what's left lost on the way down.
  const mine = [5, 8, 10, 15, 22, 26].slice(6 - (3 + back - gave));
  s.delve!.losses[K] = mine;
  s.delve!.revives = [
    ...[10, 15, 22].slice(0, back).map((at, i) => ({ by: others[i % others.length], to: K, depth: at, fell: at, at: RUN + 30 + at })),
    ...[12, 19, 24].slice(0, gave).map((at, i) => ({ by: K, to: others[i % others.length], depth: at, fell: at, at: RUN + 30 + at })),
  ].sort((a, b) => a.depth - b.depth);
  if (twist === 'left') {
    s.delve!.entrants = [...s.delve!.entrants, pid('Tujen')];
    s.delve!.leftAt = 17;
  }
  if (twist === 'quiet') s.recap = { answers: {}, misses: [] };
  if (twist === 'no-recap') delete s.recap;
  if (v.you === 'watching') return { state: watched(s), seat: { mode: 'client', me: pid('Watcher') } };
  const result = String(v.best);
  return {
    state: s,
    seat: { mode: v.you === 'host' ? 'host' : 'client', me: K },
    delveResult: result === 'unrecorded' ? null : measured(27, result === 'first' ? null : result === 'short' ? 32 : 19, result !== 'short'),
    log: mine.map((at, i) => miss(10 + 10 * i, LOST[i], at, team('Kalguur'))),
    ...(result === 'unrecorded' ? {} : { runs: runs(result === 'first' ? [] : result === 'short' ? [17, 32, 15] : [9, 12, 19], 27, true, K) }),
    earned: ['roped-together', 'selfless', 'deep-company', 'unbroken-circle'].slice(0, Number(v.earned)),
  };
}

/** A game set by `controls`: as they start, and as `make` builds it with them set. */
function asSet(key: string, group: EndScene['group'], label: string, controls: Control[], states: State[], make: (v: Values) => AsSet): EndScene {
  const { seat, ...rest } = make(valuesOf(controls));
  return { key, group, label, view: 'desktop', mode: seat.mode as Mode, me: seat.me, ...rest, controls, states, vary: make };
}

// ---- the list --------------------------------------------------------------------

const D = 'desktop';
const P = 'phone';

export function endScenes(): EndScene[] {
  const dannig = pid('Dannig');
  const doryani = pid('Doryani');
  const solo23 = () => ({ delveResult: measured(23, 27, false), log: soloLog(), runs: soloRuns() });
  const host6 = () => ({ delveResult: measured(27, 19, true), log: teamLog(), runs: teamRuns() });
  return [
    // The handoff's boards, each state once: its boards at the other sizes come with it.
    {
      key: 'n-won',
      group: 'Normal games',
      label: 'Take turns: you won (host)',
      boards: { desktop: 'n-won', air13: 'n-air13', phone: 'n-phone' },
      view: D,
      mode: 'host',
      me: K,
      state: won(),
      earned: ['first-victory', 'untarnished'],
    },
    {
      key: 'n-lost',
      group: 'Normal games',
      label: 'Take turns: you came third (guest)',
      boards: { desktop: 'n-lost', air13: 'n-air13-lost', phone: 'n-phone-full' },
      view: D,
      mode: 'client',
      me: una(),
      state: lost(),
    },
    {
      key: 'n-race',
      group: 'Normal games',
      label: 'Race: you joint second, two join next',
      boards: { desktop: 'n-race' },
      view: D,
      mode: 'host',
      me: K,
      state: race(),
    },
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
    // The run's fossil (lib/fossils.ts, one a run and a day), named among its
    // facts with another to come tomorrow, and a run that lifts the chart's
    // usual depth (its line, one only).
    {
      key: 'd-fossils',
      group: 'Delve',
      label: 'Alone: a fossil found, the usual lifted',
      view: D,
      mode: 'local',
      me: null,
      state: (() => {
        const s = solo();
        s.delve!.fossils = [{ id: 'bloodstained', depth: 22, at: RUN + 22, to: [K] }];
        return s;
      })(),
      delveResult: measured(23, 27, false),
      log: soloLog(),
      runs: runs([9, 12, 27, 11, 14, 16], 23, false),
    },
    { key: 'd-team', group: 'Delve', label: 'Together: three delvers (host)', boards: { desktop: 'd-team' }, view: D, mode: 'host', me: K, state: teamRun(TEAM3), ...host6() },
    {
      key: 'd-team6',
      group: 'Delve',
      label: 'Together: six delvers (host)',
      boards: { desktop: 'd-team6', air13: 'd-team6-air13', phone: 'd-phone-team6' },
      view: D,
      mode: 'host',
      me: K,
      state: teamRun(TEAM6),
      ...host6(),
    },
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

    // Any other game, as set.
    asSet('game', 'Normal games', 'Any game, as set', GAME_CONTROLS, [
      { label: 'Any game, as set', values: {} },
      { label: 'The fullest game: twelve players, 24 missed, eight earned', values: { players: 12, place: 'second', missed: 24, earned: 8, joining: 3 } },
      { label: 'The fullest hot-seat: six players, 30 missed', values: { kind: 'hot', players: 6, missed: 30 } },
    ], anyGame),
    asSet('alone', 'Delve', 'Any run alone, as set', ALONE_CONTROLS, [
      { label: 'Any run alone, as set', values: {} },
      { label: 'The fullest run alone: a new best, four finds, 20 new uniques, five earned', values: { depth: 51, before: 14, best: 'best', finds: 4, fresh: 20, earned: 5 } },
      { label: 'A first run to depth 40, every unique new', values: { depth: 40, before: 0, fresh: 40, earned: 3 } },
    ], anyAlone),
    asSet('together', 'Delve', 'Any run together, as set', TOGETHER_CONTROLS, [
      { label: 'Any run together, as set', values: {} },
      { label: 'The fullest run together: twelve delvers, brought back three times, gave two', values: { delvers: 12, back: 3, gave: 2, streak: 9, earned: 4, joining: 3 } },
    ], anyTogether),
  ];
}

/** The end screen page's windows, as the desk's sizes. */
const END_SIZE: Record<EndView, SizeKey> = {
  desktop: 'desktop',
  air13: 'laptop',
  tablet: 'tablet',
  phone: 'phone390',
  phone375: 'phone',
  narrow: 'narrow',
  big: 'uhd150',
  landscape: 'landscape',
};

/** The circle behind the end screen: the one the game falls to, or any of the five. */
const CIRCLE: Control = {
  kind: 'choice',
  key: 'circle',
  label: 'Circle',
  default: 'auto',
  options: [
    { value: 'auto', label: 'As the game picks' },
    { value: 'eye', label: 'Eye' },
    { value: 'moth', label: 'Moth' },
    { value: 'monad', label: 'Monad' },
    { value: 'rose', label: 'Rose' },
    { value: 'blackSun', label: 'Black sun' },
  ],
};

/** The end screen's scenes, as the desk has every screen's. */
export function overScenes(): Scene[] {
  return endScenes().map((e) => {
    const { key, group, label, boards, view, mode, me, controls, states, vary, ...built } = e;
    return {
      key: `over/${key}`,
      screen: 'over',
      group,
      label,
      seats: [{ mode, me }],
      sizes: [END_SIZE[view]],
      boards: boards && Object.fromEntries(Object.entries(boards).map(([v, board]) => [END_SIZE[v as EndView], board])),
      controls: [...(controls ?? []), CIRCLE],
      states,
      // (A game set by controls is all its make says: nothing of the defaults' records left over where it says none.)
      build: (v = {}) => ({ ...(vary ? vary(v) : built), circle: v.circle && v.circle !== 'auto' ? (v.circle as PlateName) : null }),
    };
  });
}
