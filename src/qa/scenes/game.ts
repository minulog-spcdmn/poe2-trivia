// In a game: each kind's moments (a category to pick, a question with its
// clock running, the answer shown, right and wrong), played through the
// engine to there, from the seat whose turn it is and from one watching it.
// Delve alone and together, deeper down too, with finds among the cards and a
// vein's dig, the vote's clock running out and a teammate to bring back, and a
// run's end, the end screen coming in; the host's kick, and a duelist sent to
// the bench.

import { MAX_PLAYERS, PRESETS, TALL_ART_GROUPS, type GameState, type Knobs, type Settings } from '../../lib/game.ts';
import { DELVE_IDLE_ROUNDS, WAY_OUT, livesOf, voteClosesAt } from '../../lib/delve.ts';
import { ACHIEVEMENTS } from '../../lib/achievements.ts';
import { DELVE_FLAMES } from '../../lib/fx/streaks.ts';
// (A namespace: the code before this change has no ACHIEVEMENT_SOUNDS, and a name it lacks fails the whole screen there.)
import * as soundDesign from '../../lib/soundDesign.ts';
import type { Answer } from '../../lib/codex.ts';
import type { Control, Values } from '../bench.ts';
import { longestNamed, longestWord, sceneEngine } from '../build/engine.ts';
import { pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene, Seat, Step } from '../scene.ts';
import { FOSSILS, fossilMask, type FossilId, type FossilTier } from '../../lib/fossils.ts';
import { serializeFossils, type FossilStore } from '../../lib/fossilStore.ts';
import backdrops from '../../data/backdrops.json' with { type: 'json' };

/** Who sits down, in order: any game's players are the first so many. */
const SEATED = ['Kalguur', 'Doryani', 'Una of the Vaal', 'Rog', 'Alva', 'Dannig', 'Hooded One', 'Zelina', 'Oswin', 'Finn', 'Sekhema Asala', 'Renly'];
const THREE = SEATED.slice(0, 3);
const host = (name: string): Seat => ({ mode: 'host', me: pid(name) });
const guest = (name: string): Seat => ({ mode: 'client', me: pid(name) });
const ALONE: Seat = { mode: 'local', me: null };
/** A seat watching the game, once someone does (Finn, the first to come: tweaks.ts). */
const WATCHER = guest('Finn');

/** How many play: from `min` (those the scene's moves name are among them) to a full room. */
const players = (min: number, by: number): Control => ({ kind: 'range', key: 'players', label: 'Players', min, max: MAX_PLAYERS, default: by });
const seated = (v: Values, by: number) => SEATED.slice(0, Number(v.players ?? by));

/**
 * A question's answers: how many (the game's default, six, as dealt), and
 * whether they are names or pictures, or the longest names there are (the
 * most a row has to fit), as names or under pictures (the most a caption
 * has to fit at the reveal). Set either and the game plays its default
 * difficulty as custom, with that many and asked that way.
 */
const ANSWERS: Control[] = [
  {
    kind: 'choice',
    key: 'answers',
    label: 'Answers',
    default: '6',
    options: ['4', '6', '8', '10'].map((n) => ({ value: n, label: n })),
  },
  {
    kind: 'choice',
    key: 'asked',
    label: 'Asked as',
    default: 'as',
    options: [
      { value: 'as', label: 'As dealt' },
      { value: 'names', label: 'Names' },
      { value: 'art', label: 'Pictures' },
      { value: 'longest', label: 'Longest names' },
      { value: 'art-longest', label: 'Pictures, longest names' },
    ],
  },
];
/** A difficulty's knobs with the answers' controls set on them (as dealt, its own share of pictures). */
const askedAs = (v: Values, base: Knobs): Knobs => {
  const as = v.asked ?? 'as';
  return { ...base, options: Number(v.answers ?? 6), artChance: as === 'names' || as === 'longest' ? 0 : as === 'art' || as === 'art-longest' ? 1 : base.artChance };
};
const asked = (v: Values): Partial<Settings> => {
  if (Number(v.answers ?? 6) === 6 && (v.asked ?? 'as') === 'as') return {};
  return { difficulty: 'custom', custom: askedAs(v, PRESETS.merciless) };
};

/** How far into a question its scene stands (ms). */
const INTO = 3000;
/**
 * The fossils this device holds before a fossil is kept in a scene: the
 * first `n` (commons and rares mixed in as the codex's scenes have them),
 * always leaving one of `tier` to find (at 24, the last of the set).
 */
function heldBefore(n: number, tier: FossilTier): FossilId[] {
  const commons = FOSSILS.filter((f) => !f.rare);
  const rares = FOSSILS.filter((f) => f.rare);
  const order = [...commons.slice(0, 3), ...rares.slice(0, 3), ...commons.slice(3), ...rares.slice(3)];
  const held = order.slice(0, n);
  const ofTier = held.filter((f) => f.rare === (tier === 'rare'));
  if (ofTier.length === (tier === 'rare' ? rares : commons).length) held.splice(held.indexOf(ofTier.at(-1)!), 1);
  return held.map((f) => f.id);
}
/** Those fossils as this device's store keeps them (lib/fossilStore.ts), found a few days apart. */
const storedFossils = (ids: FossilId[]): Record<string, string> => {
  const found: FossilStore['found'] = {};
  ids.forEach((id, i) => (found[id] = { at: Date.UTC(2026, 8, 1) + i * 3 * 86_400_000, depth: 7 + i }));
  return { fossils: serializeFossils({ found }) };
};
/** A fossil's tier, on its card and as it's kept (lib/fossilFlight.ts). */
const FOSSIL_TIER: Control = {
  kind: 'choice',
  key: 'tier',
  label: 'Its tier',
  default: 'common',
  options: [
    { value: 'common', label: 'Common' },
    { value: 'rare', label: 'Rare' },
  ],
};
/** The category a fossil's card is in (any can carry one: its emblem caught in the amber), or as dealt. */
const FOSSIL_CAT: Control = {
  kind: 'choice',
  key: 'cat',
  label: 'Its category',
  default: 'dealt',
  options: [
    { value: 'dealt', label: 'As dealt' },
    ...[
      'One-Handed Weapons',
      'Two-Handed Weapons',
      'Off-Hands',
      'Body Armours',
      'Helmets',
      'Gloves & Boots',
      'Rings',
      'Amulets & Belts',
      'Flasks, Charms, Jewels, Relics & Tablets',
      'Lineage Gems',
    ].map((c) => ({ value: c, label: c })),
  ],
};
/**
 * A fossil's question, from a table at its cards: the fossil's card is the
 * first, in `cat` if a category is chosen (swapped with the card that held
 * it), and picked. Asked by picture: until a pick comes as pictures, that
 * depth is played on without the fossil (answered right) and the next one's
 * cards tried (a depth's draw is the same every time it's dealt).
 */
function fossilPicked(t: Table, v: Values, tier: FossilTier) {
  const cat = String(v.cat ?? 'dealt');
  const art = v.asked === 'art';
  for (let i = 0; i < 60; i++) {
    const at = t.s;
    if (cat !== 'dealt') t.s.offered = t.s.offered.map((c, k) => (k === 0 ? cat : c === cat ? at.offered[0] : c));
    t.s.delve!.fossil = { category: t.s.offered[0], tier };
    // (No find on its card: a find's question would be asked in its place.)
    t.s.delve!.finds = (t.s.delve!.finds ?? []).filter((f) => f.category !== t.s.offered[0]);
    t.pick();
    if ((t.q.mode === 'art') === art) break;
    t.s = at;
    delete t.s.delve!.fossil;
    t.pick().answer(null, true).wait(1000).next();
  }
  return t;
}
/** Delve Deeper, pressed as the fossil flies to the line (lib/fossilFlight.ts, FOSSIL_REVEAL: 3.15 to 3.81 s, a rare's 0.26 s later). */
const pressedEarly = (v: Values): Step[] => (v.early ? [{ wait: v.tier === 'rare' ? 3700 : 3450 }, { click: '[data-cursor="next"]' }] : []);
/** How long a scene played on from a question shows it before it moves on (ms). */
const BLOW_AFTER = 1200;
/** How long a scene played on through an answer shows it before Next (ms). */
const REVEAL_FOR = 2400;
const BLOWS: Control = {
  kind: 'choice',
  key: 'blow',
  label: 'What happens',
  default: 'blast',
  options: [
    { value: 'blast', label: 'Dynamite goes off' },
    { value: 'blast-last', label: 'The last dynamite goes off, a flare beside it' },
    { value: 'flare', label: 'A flare burns, one left' },
    { value: 'flare-last', label: 'The last flare burns, dynamite beside it' },
    { value: 'miss', label: 'A miss' },
    { value: 'ward', label: 'A ward takes a miss' },
  ],
};
/** What Kalguur holds for each blow: what it takes, and what stays beside it. */
const HELD: Record<string, { wards: number; flares: number; dynamite: number }> = {
  blast: { wards: 0, flares: 0, dynamite: 1 },
  'blast-last': { wards: 0, flares: 1, dynamite: 1 },
  flare: { wards: 0, flares: 2, dynamite: 0 },
  'flare-last': { wards: 0, flares: 1, dynamite: 1 },
  miss: { wards: 0, flares: 0, dynamite: 0 },
  ward: { wards: 1, flares: 0, dynamite: 0 },
};

/** A scene's moments, a choice: the first is where it comes in. */
const moment = (options: [string, string][]): Control => ({ kind: 'choice', key: 'at', label: 'Moment', default: options[0][0], options: options.map(([value, label]) => ({ value, label })) });

function scene(key: string, group: string, label: string, seats: Seat[], play: (v: Values) => Table, more: Partial<Scene> = {}): Scene {
  return {
    key: `game/${key}`,
    screen: 'game',
    group,
    label,
    seats,
    build: (v = {}) => shown(play(v), v),
    ...more,
  };
}

/** The game `t` has played to as a scene shows it, the answers' controls as `v` sets them, its clocks standing still a moment into a question. */
function shown(t: Table, v: Values): Built {
  const q = t.s.question;
  if (q && q.mode === (v.asked === 'longest' ? 'name' : v.asked === 'art-longest' ? 'art' : null)) {
    // The answer stays where it was dealt (the first, if none was), the
    // longest name of all; what the plate says of the options and the
    // pictures are the new ones' (each item's own art, mirrored as
    // dealt), and an answer already given is kept to its place.
    const at = Math.max(0, q.options.indexOf(q.itemId));
    const longest = longestNamed(q.options.length);
    [longest[0], longest[at]] = [longest[at], longest[0]];
    const r = t.s.reveal;
    // Under pictures, a named wrong pick's name (the turn's, a race's misses, a team's strikes) one with the longest word, which can't wrap.
    if (q.mode === 'art' && r) {
      const wrong = new Set([r.chosenIndex, ...q.misses.map((m) => m.index), ...(q.struck ?? []).map((x) => x.index)]);
      for (const i of wrong) if (i !== null && i !== at) longest[i] = longestWord(longest);
    }
    q.options = longest.map((it) => it.id);
    if (q.mode === 'name') q.labels = longest.map((it) => it.name);
    else q.prompt = longest[at].name;
    q.itemId = q.options[at];
    q.category = longest[at].category;
    q.groups = [...new Set(longest.map((it) => it.group))].sort();
    delete q.variant;
    if (q.mode === 'art' && longest.every((it) => TALL_ART_GROUPS.has(it.group))) q.tall = true;
    else delete q.tall;
    if (r) {
      r.correctId = q.itemId;
      if (r.chosenIndex !== null) r.chosenId = q.options[r.chosenIndex];
    }
  }
  const at = t.s.phase === 'question' ? t.clock.now + INTO : t.clock.now;
  return { state: t.s, act: t.room, at } satisfies Built;
}
const table = (names: string[], settings: Partial<Settings> = {}, o: { host?: null; seed?: number } = {}) => new Table(names, settings, o);

/** How long a scene that plays a moment by itself shows as it is first (ms). */
const LOOK_FIRST = 1200;
/**
 * The cards dealt and turned before a click picks one (the last of three
 * faces up 1.32 s after the deal starts: ChooseCategory's flipAt and FLIP).
 */
const CARDS_UP = 1600;

/**
 * A question as asked, before its clock: nobody sees its words yet (the
 * scenes' engine starts every clock as its question is asked); and the same
 * with its clock started `after` ms later, as a host's would once its
 * pictures were in.
 */
function clockedLater(s: GameState, after: number): { asked: GameState; running: GameState; start: number } {
  const q = s.question!;
  const unclocked = { ...q };
  delete unclocked.clockAt;
  const start = q.askedAt + after;
  return {
    asked: { ...s, question: { ...unclocked, deadline: null } },
    running: { ...s, question: { ...q, clockAt: start, deadline: q.deadline === null ? null : q.deadline + after } },
    start,
  };
}

/**
 * A vote with its clock running out (Delve together's `closing` control):
 * from three seconds before it closes, a second at a time, then the room's
 * draw. Before anyone votes there's no clock: null, the scene as it is.
 */
function closingOut(t: Table): Built | null {
  const end = voteClosesAt(t.s);
  if (end === null) return null;
  const before = t.s;
  t.wait(Math.max(0, end - t.clock.now)).act({ type: 'expire' }, null);
  const ticks: Step[] = [2000, 1000, 0].flatMap((left) => [{ wait: 1000 }, { clock: end - left }]);
  return { state: before, act: t.room, at: end - 3000, steps: [...ticks, { wait: 500 }, { then: t.s, at: t.clock.now }] } satisfies Built;
}

/** Take turns' settings: as they come, no timer, or a custom game whose pictures are mirrored. */
const RULES: Control = {
  kind: 'choice',
  key: 'rules',
  label: 'Settings',
  default: 'as',
  options: [
    { value: 'as', label: 'As they come' },
    { value: 'untimed', label: 'No timer' },
    { value: 'mirror', label: 'Pictures mirrored' },
  ],
};
/** The mirrored game's knobs: pictures as answers, ten of them, put the Mirrored line in the narrowest captions. */
const MIRRORED: Knobs = { options: 6, similarNames: 1, fakes: 2, artChance: 0.5, veil: 'slow', grayscale: 'art', mirror: 1, lockout: 3 };
const rules = (v: Values): Partial<Settings> =>
  v.rules === 'untimed' ? { ...asked(v), timer: 0 } : v.rules === 'mirror' ? { difficulty: 'custom', custom: askedAs(v, MIRRORED) } : asked(v);

export function gameScenes(): Scene[] {
  // Take turns: Doryani's turn first (the seed's, with three), Kalguur hosting.
  const turns = (v: Values) => table(seated(v, 3), rules(v)).start();
  const race = (v: Values) => table(seated(v, 5), { mode: 'race', ...asked(v) }).start();
  // (Its own dice by a `seed`.)
  const delveSeeded = (seed?: number) => table(['Kalguur'], { mode: 'delve' }, { host: null, seed }).start();
  const delveAlone = () => delveSeeded();
  const delveTogether = (v: Values) => table(seated(v, 3), { mode: 'delve' }).start();
  /** A vein struck once on the first card: dig deeper, or the way out. */
  const digging = (t: Table) => {
    const vein = t.s.offered[0];
    t.s.offered = [vein, WAY_OUT];
    t.s.delve!.finds = [{ category: vein, kind: 'azurite' }];
    t.s.delve!.dig = { strikes: 1, haul: [t.s.players[0].id], light: 6, struck: [] };
    return t;
  };
  // The team's cards: finds among them as set (or a vein's dig), and Doryani's vote.
  const togetherCards = (v: Values) => {
    const t = delveTogether(v);
    const [vein, , flare] = t.s.offered;
    const on = v.finds ?? 'none';
    if (on === 'dig') digging(t);
    else
      t.s.delve!.finds = [
        ...(on === 'both' || on === 'vein' ? [{ category: vein, kind: 'azurite' as const }] : []),
        ...(on === 'both' || on === 'flare' ? [{ category: flare, kind: 'flare' as const }] : []),
      ];
    if (v.held) t.s.delve!.inventory = { [pid('Doryani')]: { wards: 0, flares: 0, dynamite: 1 } };
    if (v.idle) t.s.delve!.missed = { [pid('Una of the Vaal')]: DELVE_IDLE_ROUNDS };
    return v.voted === false ? t : t.act({ type: 'vote', category: on === 'dig' ? vein : t.s.offered[1] }, 'Doryani');
  };
  /** Every vote of the team's on the first card, and the room's draw if any are still out. */
  const voted = (t: Table) => {
    for (const p of t.s.players) t.act({ type: 'vote', category: t.s.offered[0] }, p.name);
    return t.s.phase === 'choosing' ? t.act({ type: 'expire' }, null) : t;
  };
  const turnsSeats = [guest('Doryani'), host('Kalguur'), WATCHER];
  const roomSeats = [host('Kalguur'), guest('Doryani'), WATCHER];
  return [
    // A moment of a game of Take turns. Una of the Vaal is in every one's
    // moves, so three play at least.
    scene('turns', 'Take turns', 'Take turns', turnsSeats, turns, {
      controls: [
        moment([
          ['choosing', 'Picking a category'],
          ['question', 'A question'],
          ['right', 'Answered right'],
          ['wrong', 'Answered wrong'],
          ['timeout', 'Out of time'],
          ['late', 'Late in the game'],
          ['kick', 'The host removes a player'],
        ]),
        players(3, 3),
        ...ANSWERS,
        RULES,
      ],
      states: [
        { label: 'Picking a category', values: {}, key: 'game/turns-choosing' },
        // Names of 19 to 20 characters, near MAX_NAME: Doryani's (19) turn on the banner, seen from Kalguur's seat, shrunk to fit an upright phone.
        { label: 'Picking a category, long names', values: { names: 'long' }, listed: false },
        { label: 'A question, its clock running', values: { at: 'question' }, key: 'game/turns-question', listed: false },
        // The longest names too, the most three rows of them have to fit (a phone's browser on its side, its bars up), so the sweep sees them.
        { label: 'A question, six of the longest names', values: { at: 'question', asked: 'longest' }, listed: false },
        { label: 'A question with no timer', values: { at: 'question', rules: 'untimed' }, key: 'game/turns-untimed', listed: false },
        { label: 'Answered right', values: { at: 'right' }, key: 'game/turns-right', listed: false },
        { label: 'Answered right, six of the longest names', values: { at: 'right', asked: 'longest' }, listed: false },
        { label: 'Answered right, eight of the longest names', values: { at: 'right', answers: '8', asked: 'longest' }, listed: false },
        { label: 'Ten of the longest names, answered right', values: { at: 'right', answers: '10', asked: 'longest' } },
        { label: 'Answered right: the picture was mirrored', values: { at: 'right', rules: 'mirror' }, key: 'game/turns-mirrored', listed: false },
        { label: 'Answered wrong', values: { at: 'wrong' }, key: 'game/turns-wrong', listed: false },
        { label: 'Out of time', values: { at: 'timeout' }, key: 'game/turns-timeout', listed: false },
        { label: 'Late in a game: scores near the target', values: { at: 'late' }, key: 'game/turns-late', listed: false },
        { label: 'Una of the Vaal went offline', values: { offline: 'Una of the Vaal' }, key: 'game/turns-offline', listed: false },
        { label: 'The host removing a player: asked, then gone', values: { at: 'kick' }, key: 'game/turns-kick', listed: false },
      ],
      build: (v = {}) => {
        const t = turns(v);
        if (v.at === 'kick') {
          // The host's kick on the scoreboard, from the host's seat: the first click arms it (the entry asks, in the wrong
          // answer's colours, for KICK_ARMED_MS), the second removes them, their entry fading as the others close up. Here
          // the room takes the second.
          const before = t.s;
          t.act({ type: 'remove', playerId: pid('Doryani') });
          return { state: before, act: t.room, at: t.clock.now, seat: host('Kalguur'), steps: [{ wait: 700 }, { click: '.kick-at .kick' }, { wait: 1600 }, { then: t.s, at: t.clock.now }] } satisfies Built;
        }
        if (v.at === 'late') return shown(t.playTo((s) => s.round >= 7 && s.phase === 'choosing', (name, round) => name !== 'Una of the Vaal' || round % 2 === 0), v);
        if (v.at === 'choosing' || v.at === undefined) return shown(t, v);
        t.pick();
        if (v.at === 'right' || v.at === 'wrong') t.answer(t.turn, v.at === 'right');
        else if (v.at === 'timeout') {
          // Nobody answered: the clock runs to its end and the host's timer sends the empty answer, from the room itself.
          t.wait(Math.max(0, (t.q.deadline ?? t.clock.now) - t.clock.now));
          t.act({ type: 'answer', index: null }, null);
        }
        return shown(t, v);
      },
    }),
    // Take turns on one device: a question; a picture question answered by a
    // click (this screen's turn: the host's word comes back a moment later and
    // the verdict's tints fade in with the borders, the answer's and, a wrong
    // click, the one picked); and the page reloaded mid-game, the game this tab
    // saved picked up as the page loads (Replay reloads it again), seen from
    // the page out of a game.
    scene('hot-seat', 'Take turns', 'Hot-seat', [ALONE], () => table(THREE, {}, { host: null }).start(), {
      controls: [
        moment([
          ['question', 'A question'],
          ['click', 'A wrong picture clicked'],
          ['click-right', 'The right picture clicked'],
          ['reload', 'The page reloaded'],
        ]),
      ],
      states: [
        { label: 'Hot-seat: a question', values: {} },
        { label: 'A wrong picture clicked', values: { at: 'click' }, key: 'game/art-clicked', listed: false },
        { label: 'The right picture clicked', values: { at: 'click-right' }, listed: false },
        { label: 'Hot-seat: the page reloaded in a game', values: { at: 'reload' }, key: 'game/hot-seat-reload', listed: false },
      ],
      build: (v = {}) => {
        if (v.at === 'reload') return { state: null, seat: { mode: 'none', me: null }, saved: { mode: 'local', state: table(THREE, {}, { host: null }).start().pick().s } } satisfies Built;
        if (v.at !== 'click' && v.at !== 'click-right') return shown(table(THREE, {}, { host: null }).start().pick(), v);
        const t = table(THREE, asked({ asked: 'art' }), { host: null }).start().pick();
        const before = t.s;
        const at = t.clock.now + 1000;
        const i = v.at === 'click-right' ? t.right() : t.wrong();
        t.answer(null, i, 1000 + LOOK_FIRST + 250);
        return { state: before, act: t.room, at, steps: [{ wait: LOOK_FIRST }, { click: `.tile[data-cursor="opt:${i}"]` }, { wait: 250 }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    }),
    // Rog plays at Kalguur's screen: on his turn the host's screen answers,
    // under his name. (A scene of its own: seen from the host's seat first,
    // the screen it's about, where Take turns starts at Doryani's, whose turn
    // it is.)
    scene('at-screen', 'Take turns', 'A turn at the host’s screen', [host('Kalguur'), guest('Doryani')], () =>
      table(['Kalguur', 'Doryani'])
        .act({ type: 'join', playerId: pid('Rog'), name: 'Rog', local: true })
        .start()
        .playTo((s) => s.phase === 'choosing' && s.players[s.turn].id === pid('Rog'))
        .pick(),
    ),
    // A race's moments. A miss as it happens is seen from Kalguur's seat: his
    // own (the line under the answers saying it fades in), or a sixth on one
    // answer while he still answers (past five, its faces give way to four and
    // a count, "+2", which scales in).
    scene('race', 'Race', 'Race', roomSeats, race, {
      controls: [
        moment([
          ['question', 'A question'],
          ['answered', 'Answered, waiting'],
          ['reveal', 'The answer shown'],
          ['miss', 'Kalguur misses'],
          ['sixth', 'A sixth miss: +2'],
        ]),
        players(3, 5),
        ...ANSWERS,
      ],
      states: [
        { label: 'A question, everyone answering', values: {}, key: 'game/race-question' },
        { label: 'Answered, waiting on the others', values: { at: 'answered' }, key: 'game/race-answered', listed: false },
        { label: 'The answer shown', values: { at: 'reveal' }, key: 'game/race-reveal', listed: false },
        { label: 'Kalguur answers wrong: his line fades in', values: { at: 'miss' }, key: 'game/race-miss', listed: false },
        { label: 'A sixth miss on one answer: +2 scales in', values: { at: 'sixth' }, listed: false },
      ],
      build: (v = {}) => {
        if (v.at === 'answered') return shown(race(v).answer('Doryani', false, 1800), v);
        if (v.at === 'reveal') return shown(race(v).answer('Una of the Vaal', true, 1500), v);
        if (v.at !== 'miss' && v.at !== 'sixth') return shown(race(v), v);
        const sixth = v.at === 'sixth';
        // (Eight for a sixth miss: five already on the answer, Kalguur still answering.)
        const t = table(SEATED.slice(0, Math.max(sixth ? 8 : 0, Number(v.players ?? 5))), { mode: 'race', ...asked(v) }).start();
        const w = t.wrong();
        // Five of the others on one wrong answer already, the sixth to come.
        if (sixth) for (const name of SEATED.slice(1, 6)) t.answer(name, w, 400);
        const before = t.s;
        const at = t.clock.now + (sixth ? 0 : 1000);
        t.answer(sixth ? SEATED[6] : 'Kalguur', w, LOOK_FIRST + (sixth ? 0 : 1000));
        return { state: before, act: t.room, at, seat: host('Kalguur'), steps: [{ wait: LOOK_FIRST }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    }),
    // A tie at the target: the duel. The first duelist missing is face down on
    // the scoreboard till the round ends. Three tied, Una of the Vaal missing
    // while the others scored: the next round says so, or (as it happens) the
    // round's last answer shown, then the next round, her entry set back on
    // the bench as it starts.
    scene(
      'deathmatch',
      'Deathmatch',
      'Deathmatch',
      roomSeats,
      () =>
        table(['Kalguur', 'Doryani'], { targetScore: 1 })
          .start()
          .playTo((s) => !!s.deathmatch),
      {
        controls: [
          moment([
            ['tie', 'A tie at the target'],
            ['miss', 'A duelist missed'],
            ['out', 'One of three out'],
            ['bench', 'Knocked out as it happens'],
          ]),
        ],
        states: [
          { label: 'A tie at the target: the deathmatch', values: {} },
          // Long names too: the intro's duelists as wide as the longest name between them, each name whole.
          { label: 'Long names', values: { names: 'long' }, listed: false },
          { label: 'A duelist missed, the next to answer', values: { at: 'miss' }, key: 'game/deathmatch-miss', listed: false },
          { label: 'Three in, one knocked out', values: { at: 'out' }, key: 'game/deathmatch-out', listed: false },
          // Long names: on an upright phone the three share the intro's row, each name cut short only there.
          { label: 'Three in, one knocked out, long names', values: { at: 'out', names: 'long' }, listed: false },
          { label: 'Knocked out as it happens: the bench', values: { at: 'bench' }, listed: false },
        ],
        build: (v = {}) => {
          const duel = (names: string[]) =>
            table(names, { targetScore: 1 })
              .start()
              .playTo((s) => !!s.deathmatch);
          if (v.at === 'miss') {
            const t = duel(['Kalguur', 'Doryani']).pick();
            return shown(t.answer(t.turn, false).wait(1000).next(), v);
          }
          if (v.at !== 'out' && v.at !== 'bench') return shown(duel(['Kalguur', 'Doryani']), v);
          const t = duel(['Kalguur', 'Doryani', 'Una of the Vaal']);
          const una = pid('Una of the Vaal');
          let last = { state: t.s, at: t.clock.now };
          t.playTo(
            (s) => {
              if (s.deathmatch?.alive.includes(una)) last = { state: s, at: t.clock.now };
              return !!s.deathmatch?.eliminated.length && s.phase === 'choosing';
            },
            (name) => name !== 'Una of the Vaal',
          );
          if (v.at === 'out') return { state: t.s, act: t.room, at: t.clock.now } satisfies Built;
          return { state: last.state, act: t.room, at: last.at, steps: [{ wait: 1500 }, { then: t.s, at: t.clock.now }] } satisfies Built;
        },
      },
    ),
    delveAloneScene(),
    delveFossilScene(),
    // Delve together's moments, a run of three by default. Finds among the
    // team's cards too, as Delve alone deals them (its notes beside the cards
    // with the vote's line, on a phone's browser on its side), and dynamite in
    // Doryani's pack, for the line on what stays unused on them. And the vote
    // before anyone has voted (its rule's sentence in the clock's place) or
    // with Una idle (a line of its own under the wait): the most that line has
    // to fit beside the cards.
    scene('delve-together', 'Delve together', 'Delve together', roomSeats, togetherCards, {
      controls: [
        moment([
          ['cards', 'The cards, the vote'],
          ['question', 'A question'],
          ['cleared', 'Cleared'],
          ['miss', 'Kalguur misses'],
          ['fallen', 'Una perishes'],
          ['perish', 'Una perishes, from her seat'],
          ['votes', 'The votes coming in'],
        ]),
        players(2, 3),
        {
          kind: 'choice',
          key: 'finds',
          label: 'Finds',
          default: 'none',
          when: { at: ['cards'] },
          options: [
            { value: 'none', label: 'None' },
            { value: 'both', label: 'A vein and a flare' },
            { value: 'vein', label: 'A vein, first card' },
            { value: 'flare', label: 'A flare, last card' },
            { value: 'dig', label: 'A vein struck once' },
          ],
        },
        { kind: 'toggle', key: 'held', label: 'Dynamite in a pack', default: false, when: { at: ['cards'] } },
        { kind: 'toggle', key: 'voted', label: 'Doryani has voted', default: true, when: { at: ['cards'] } },
        { kind: 'toggle', key: 'idle', label: 'Una idle', default: false, when: { at: ['cards'] } },
        { kind: 'toggle', key: 'closing', label: 'The vote’s clock running out', default: false, when: { at: ['cards'] } },
        { kind: 'toggle', key: 'gives', label: 'Kalguur brings her back', default: false, when: { at: ['fallen', 'perish'] } },
      ],
      states: [
        { label: 'The cards dealt, Doryani has voted', values: {}, key: 'game/delve-together-cards' },
        { label: 'An Azurite Vein and a Flare Cache', values: { finds: 'both' }, listed: false },
        { label: 'Both, with dynamite in a pack', values: { finds: 'both', held: true }, listed: false },
        { label: 'Before anyone votes, two finds held', values: { finds: 'both', held: true, voted: false } },
        { label: 'Una idle, two finds held', values: { finds: 'both', held: true, idle: true } },
        { label: 'An Azurite Vein alone, on the first card', values: { finds: 'vein' }, listed: false },
        { label: 'A Flare Cache alone, on the last card', values: { finds: 'flare' }, listed: false },
        // Its last three seconds ticking down, then the draw.
        { label: 'The vote’s last 3 seconds, then the draw', values: { closing: true }, listed: false },
        { label: 'A vein struck once, the team voting: dig deeper, or the way out', values: { finds: 'dig' }, key: 'game/delve-together-dig', listed: false },
        { label: 'A question, after the vote', values: { at: 'question' }, key: 'game/delve-together-question', listed: false },
        { label: 'Cleared: Doryani named it first', values: { at: 'cleared' }, key: 'game/delve-together-cleared', listed: false },
        { label: 'Kalguur misses, from his seat: his line fades in', values: { at: 'miss' }, key: 'game/delve-together-miss', listed: false },
        { label: 'Una perishes: the revive heart', values: { at: 'fallen' }, key: 'game/delve-together-fallen', listed: false },
        { label: 'Kalguur brings her back with his second life', values: { at: 'fallen', gives: true }, listed: false },
        { label: 'Una perishes, from her seat: her line slides in', values: { at: 'perish' }, key: 'game/delve-together-perish', listed: false },
        { label: 'Kalguur brings her back: the line slides out', values: { at: 'perish', gives: true }, listed: false },
        { label: 'The votes coming in one at a time', values: { at: 'votes' }, key: 'game/delve-together-votes', listed: false },
      ],
      build: (v = {}) => {
        const when = v.at ?? 'cards';
        if (when === 'cards') {
          const t = togetherCards(v);
          return (v.closing && closingOut(t)) || shown(t, v);
        }
        if (when === 'question') return shown(voted(delveTogether(v)), v);
        if (when === 'cleared') return shown(voted(delveTogether(v)).answer('Doryani', true), v);
        if (when === 'miss') {
          // Kalguur's own miss on the team's question, from his seat: the line on what it cost him fades in.
          const t = voted(delveTogether(v));
          const before = t.s;
          const at = t.clock.now + 1000;
          t.answer('Kalguur', false, 1000 + LOOK_FIRST);
          return { state: before, act: t.room, at, seat: host('Kalguur'), steps: [{ wait: LOOK_FIRST }, { then: t.s, at: t.clock.now }] } satisfies Built;
        }
        if (when === 'votes') {
          // The vote, its votes coming in one at a time from Kalguur's seat, all on
          // one card: the first starts the clock (Closes in fades in, the rule gives
          // way to who it waits for); each seal comes in at its seat's place, those
          // after it sliding aside; Kalguur's own turns the prompt's line; past five,
          // four faces and a count, which scales in, and again as it grows.
          // Eight, so the vote stays open with one still to vote.
          const t = table(SEATED.slice(0, 8), { mode: 'delve' }).start();
          const before = t.s;
          const at = t.clock.now;
          const card = t.s.offered[1];
          const steps: Step[] = [];
          ['Rog', 'Una of the Vaal', 'Doryani', 'Alva', 'Dannig', 'Kalguur', 'Hooded One'].forEach((name, n) => {
            const wait = n === 0 ? CARDS_UP : 800;
            t.wait(wait).act({ type: 'vote', category: card }, name);
            steps.push({ wait }, { then: t.s, at: t.clock.now });
          });
          return { state: before, act: t.room, at, seat: host('Kalguur'), steps } satisfies Built;
        }
        // Una perishes on a question the team then clears. Seen from the room
        // (fallen): at its answer the revive heart grows in on her entry for
        // those with lives to spare; Kalguur, on two after a miss, can bring
        // her back: his second life pours out (the last one's deeper red coming
        // in after it), hers fills, and the heart shrinks away. From her own
        // seat (perish), a moment before her last life goes: she misses, and
        // "You perished and are now watching" opens its room as it fades in;
        // Doryani clears the depth, and (Kalguur bringing her back) the line
        // closes up again as it fades out.
        // (Una plays in it: three at least.)
        const t = delveTogether({ ...v, players: Math.max(3, Number(v.players ?? 3)) });
        const una = 'Una of the Vaal';
        const perish = when === 'perish';
        for (let depth = 1; depth <= 3; depth++) {
          for (const p of t.s.players) if (livesOf(t.s, p.id) > 0) t.act({ type: 'vote', category: t.s.offered[0] }, p.name);
          if (t.s.phase === 'choosing') t.act({ type: 'expire' }, null);
          if (perish && depth === 3) break;
          t.answer(una, false);
          // (Another wrong pick than hers: a pick struck out can't be made again.)
          const struck = new Set((t.q.struck ?? []).map((x) => x.index));
          if (depth === 1) t.answer('Kalguur', t.q.options.findIndex((o, i) => o !== t.q.itemId && !struck.has(i)));
          if (depth < 3) t.answer('Doryani', true).wait(1000).next();
        }
        if (!perish) {
          // Her last life gone on the question, which Doryani then clears.
          const fallen = t.s;
          const at = t.clock.now;
          t.answer('Doryani', true, 1200);
          const steps: Step[] = [{ wait: 1200 }, { then: t.s, at: t.clock.now }];
          if (v.gives) {
            t.wait(2600).act({ type: 'revive', target: pid(una) }, 'Kalguur');
            steps.push({ wait: 2600 }, { then: t.s, at: t.clock.now });
          }
          return { state: fallen, act: t.room, at, steps } satisfies Built;
        }
        // Her last life, on the third depth's question.
        const before = t.s;
        const at = t.clock.now + 1000;
        t.answer(una, false, 1000 + LOOK_FIRST);
        const steps: Step[] = [{ wait: LOOK_FIRST }, { then: t.s, at: t.clock.now }];
        t.answer('Doryani', true, 1500);
        steps.push({ wait: 1500 }, { then: t.s, at: t.clock.now });
        if (v.gives) {
          t.wait(2000).act({ type: 'revive', target: pid(una) }, 'Kalguur');
          steps.push({ wait: 2000 }, { then: t.s, at: t.clock.now });
        }
        return { state: before, act: t.room, at, seat: guest(una), steps } satisfies Built;
      },
    }),
    togetherFossilScene(),
    // A game starting, from the lobby or Play again on an end screen: the
    // header's line changes with the screen it is for, the old one fading as
    // the new one comes ("Round 1 • First to 10"; Delve alone, on this device,
    // "Delve • Depth 1"). Take turns from Kalguur's room, Delve alone.
    {
      ...scene('starts', 'A game starting', 'The header’s line as a game starts', [host('Kalguur')], () => table(THREE)),
      controls: [
        {
          kind: 'choice',
          key: 'from',
          label: 'From',
          default: 'lobby',
          options: [
            { value: 'lobby', label: 'The lobby' },
            { value: 'over', label: 'An end screen: Play again' },
          ],
        },
        {
          kind: 'choice',
          key: 'mode',
          label: 'Mode',
          default: 'turns',
          options: [
            { value: 'turns', label: 'Take turns' },
            { value: 'delve', label: 'Delve alone' },
          ],
        },
      ],
      states: [
        { label: 'Take turns, from the lobby', values: {} },
        { label: 'Delve alone, from the lobby', values: { mode: 'delve' }, listed: false },
        { label: 'Take turns, Play again', values: { from: 'over' }, listed: false },
        { label: 'Delve alone, Play again', values: { from: 'over', mode: 'delve' }, listed: false },
      ],
      build: (v = {}) => {
        const delve = v.mode === 'delve';
        const t = delve ? table(['Kalguur'], { mode: 'delve' }, { host: null }) : table(THREE);
        // To the end: Kalguur alone right on his turns, or a run's three misses.
        if (v.from === 'over') t.start().playTo((s) => s.phase === 'over', (name) => !delve && name === 'Kalguur');
        const before = t.s;
        const at = t.clock.now;
        t.wait(LOOK_FIRST);
        if (v.from === 'over') t.act({ type: 'restart', play: true });
        else t.start();
        return {
          state: before,
          act: t.room,
          at,
          // (Alone, on this device: no room code on the line.)
          ...(delve ? { seat: ALONE, hereOnly: true } : {}),
          steps: [{ wait: LOOK_FIRST }, { then: t.s, at: t.clock.now }],
        } satisfies Built;
      },
    },
  ];

  /**
   * A run of Delve alone at a moment: Depth and Lives set where it stands
   * (the cards at Depth 29 are deep down; Lives 2, a life lost on the first
   * depth, before the rest), every moment but the run's end played on from
   * there.
   */
  function delveAloneScene(): Scene {
    // (Where the run stands: every moment but the run's end, which plays a run of its own.)
    const played = { at: ['cards', 'pick', 'question', 'wrong', 'right', 'blow', 'notice', 'zone'] };
    return scene('delve', 'Delve alone', 'Delve alone', [ALONE], delveAlone, {
      controls: [
        moment([
          ['cards', 'The cards'],
          ['pick', 'A card picked'],
          ['question', 'A question'],
          ['wrong', 'Answered wrong'],
          ['right', 'Answered right, then on'],
          ['blow', 'A blow, as it happens'],
          ['notice', 'A notice on a streak'],
          ['zone', 'Into a new zone'],
          ['end', 'The run’s end'],
        ]),
        { kind: 'range', key: 'depth', label: 'Depth', min: 0, max: 120, default: 0, when: played },
        // (Two lives: a life lost on the first depth, so a blow's miss leaves the last, its deeper red coming in after the drain.)
        { kind: 'range', key: 'lives', label: 'Lives', min: 2, max: 3, default: 3, when: played },
        {
          kind: 'choice',
          key: 'finds',
          label: 'Finds',
          default: 'as',
          when: { at: ['cards'] },
          options: [
            { value: 'as', label: 'As dealt' },
            { value: 'both', label: 'A vein and a flare' },
            { value: 'vein', label: 'A vein, first card' },
            { value: 'flare', label: 'A flare, last card' },
            { value: 'all', label: 'All three: a vein, dynamite and a flare' },
            { value: 'dig', label: 'A vein struck once' },
          ],
        },
        { kind: 'toggle', key: 'held', label: 'Dynamite in the pack', default: false, when: { at: ['cards'] } },
        { ...BLOWS, when: { at: ['blow'] } },
        { kind: 'range', key: 'streak', label: 'In a row', min: 3, max: 120, default: 80, when: { at: ['notice'] } },
        { kind: 'range', key: 'notices', label: 'Achievements', min: 1, max: 2, default: 1, when: { at: ['notice'] } },
        { kind: 'choice', key: 'zone', label: 'Zone', default: '31', options: [11, 21, 31, 41, 51, 61, 71].map((d) => ({ value: String(d), label: `Depth ${d}` })), when: { at: ['zone'] } },
        {
          kind: 'choice',
          key: 'dice',
          label: 'Dice',
          default: 'as',
          options: [
            { value: 'as', label: 'As they fall' },
            { value: '81', label: 'Seed 81: a long base type at Depth 15' },
          ],
          when: played,
        },
      ],
      states: [
        { label: 'The cards dealt', values: {}, key: 'game/delve-cards' },
        // A long name (20 characters, MAX_NAME): alone, it has the scoreboard's whole row, whole on a phone upright or on its side.
        { label: 'The cards dealt, a long name', values: { names: 'long' }, listed: false },
        { label: 'An Azurite Vein and a Flare Cache', values: { finds: 'both' }, key: 'game/delve-finds', listed: false },
        { label: 'Both, with dynamite in the pack', values: { finds: 'both', held: true }, listed: false },
        { label: 'All three finds: a vein, a Dynamite Cache and a flare', values: { finds: 'all' }, listed: false },
        { label: 'An Azurite Vein alone, on the first card', values: { finds: 'vein' }, listed: false },
        { label: 'A Flare Cache alone, on the last card', values: { finds: 'flare' }, listed: false },
        { label: 'A vein struck once: dig deeper, or the way out', values: { finds: 'dig' }, key: 'game/delve-dig', listed: false },
        { label: 'Deep down', values: { depth: 29 }, key: 'game/delve-deep', listed: false },
        { label: 'A card picked by a click, then its question’s words as the clock starts', values: { at: 'pick' }, key: 'game/delve-pick', listed: false },
        { label: 'A question', values: { at: 'question' }, key: 'game/delve-question', listed: false },
        { label: 'Answered wrong: a life lost', values: { at: 'wrong' }, key: 'game/delve-wrong', listed: false },
        // Depth 15, the seed's: Ratha's Assault, its picture mirrored, six names
        // beside it. A phone on its side under 336 tall gives the names more of the
        // width, and an iPhone's notch takes more of it again, so there the plate's
        // base type wraps (centred) between the name and the Mirrored line.
        // (tests/qaScenes.test.ts says so if new items or a new curve change it.)
        { label: 'Answered wrong deeper down: a long base type and the Mirrored line on the plate', values: { at: 'wrong', depth: 15, dice: '81' }, key: 'game/delve-long-base' },
        { label: 'Answered right as it happens, then on to the next depth', values: { at: 'right' }, key: 'game/delve-answer', listed: false },
        { label: '1 to 2: the same width', values: { at: 'right', depth: 1 }, key: 'game/delve-depth', listed: false },
        { label: '9 to 10 with no zone card: a figure more, eased', values: { at: 'right', depth: 9 }, listed: false },
        { label: 'Dynamite goes off', values: { at: 'blow' }, key: 'game/delve-blow', listed: false },
        { label: 'The last dynamite goes off: the flare beside it closes up', values: { at: 'blow', blow: 'blast-last' }, listed: false },
        { label: 'A flare burns: its count fades back in', values: { at: 'blow', blow: 'flare' }, listed: false },
        { label: 'The last flare burns: the dynamite beside it closes up', values: { at: 'blow', blow: 'flare-last' }, listed: false },
        { label: 'A miss costs a life', values: { at: 'blow', blow: 'miss' }, listed: false },
        { label: 'A miss on two lives: the last one’s deeper red', values: { at: 'blow', blow: 'miss', lives: 2 }, listed: false },
        { label: 'A ward takes the miss', values: { at: 'blow', blow: 'ward' }, listed: false },
        ...DELVE_FLAMES.map((f, n) => ({
          label: `${f.name[0].toUpperCase()}${f.name.slice(1)} fire (${f.from} in a row)`,
          values: { at: 'notice', streak: f.from },
          ...(n === 0 ? { key: 'game/delve-notice' } : {}),
          listed: false as const,
        })),
        { label: 'Two achievements at once, on the hottest fire', values: { at: 'notice', streak: DELVE_FLAMES.at(-1)!.from, notices: 2 } },
        { label: 'Into a new zone: its title card over the game', values: { at: 'zone' }, key: 'game/delve-zone', listed: false },
        { label: 'A run’s last answer, then the end screen coming in', values: { at: 'end' }, key: 'game/delve-ends', listed: false },
      ],
      build: (v = {}) => {
        const when = v.at ?? 'cards';
        if (when === 'end') return runEnds();
        const t = delveSeeded(v.dice === '81' ? 81 : undefined);
        if (Number(v.lives ?? 3) < 3) t.pick().answer(null, false).wait(1000).next();
        // (The round is a depth on: the line shows round 2 as Depth 1, shownDepth.)
        t.playTo((s) => s.round >= Number(v.depth ?? 0) + 1 && s.phase === 'choosing');
        if (when === 'question') return shown(t.pick(), v);
        if (when === 'wrong') return shown(t.pick().answer(null, false), v);
        if (when === 'right') {
          // The taps of a run as they play out, each moment from the one before:
          // the answer shown (the circle taking its colour ring by ring, the line
          // over the art giving way to what happened without anything under it
          // moving) and Next, the question's stage fading out under the next
          // depth's cards. Its header's depth rolls over as it does: at Depth 1
          // (or 9), its number rising out as the next one rises in once its cards
          // are dealt. 1 to 2 keeps the line's width; 9 to 10, a figure more,
          // eases it wider, as it does where the zone's card doesn't play (a
          // screen that saw the run move on too late for one): this comes in at
          // the deal, with no card. With its card (game/delve-zone, Depth 11) the
          // line changes at once under the card's closed bars. (At depth 0 the
          // line names no depth: the banner under it has the run's start line,
          // Game.svelte.)
          t.pick();
          const before = t.s;
          const at = t.clock.now + INTO;
          const answered = t.answer(null, true, INTO + BLOW_AFTER).s;
          const answeredAt = t.clock.now;
          t.wait(REVEAL_FOR).next();
          return {
            state: before,
            act: t.room,
            at,
            steps: [{ wait: BLOW_AFTER }, { then: answered, at: answeredAt }, { wait: REVEAL_FOR }, { then: t.s, at: t.clock.now }],
          } satisfies Built;
        }
        if (when === 'pick') {
          // A pick as it happens: a moment after the cards are up this device picks the
          // first by a click (the frame says what it would send), the room's question
          // comes back at once and the cards hold it a moment, the card lifting
          // (PICK_HOLD_MS); then the question, its words veiled until its clock starts
          // a moment later, as a host's would once the pictures were in, and fading in.
          const before = t.s;
          const at = t.clock.now;
          t.wait(CARDS_UP + 50).pick();
          const { asked, running, start } = clockedLater(t.s, 900);
          return {
            state: before,
            act: t.room,
            at,
            steps: [{ wait: CARDS_UP }, { click: '.cards .card' }, { wait: 50 }, { then: asked, at: asked.question!.askedAt }, { wait: 900 }, { then: running, at: start }],
          } satisfies Built;
        }
        if (when === 'blow') {
          // Played on from a question: dynamite going off, a flare burning, a miss, or a ward taking it.
          // Kalguur holds what the blow takes (dynamite, a flare, a ward), and what stays beside it.
          const blow = String(v.blow ?? 'blast');
          const me = pid('Kalguur');
          t.s = { ...t.s, delve: { ...t.s.delve!, inventory: { [me]: { ...(HELD[blow] ?? HELD.blast) } } } };
          t.pick();
          const before = t.s;
          const at = t.clock.now + INTO;
          if (blow === 'blast' || blow === 'blast-last') t.wait(INTO + BLOW_AFTER).act({ type: 'blast', askedAt: t.q.askedAt }, null);
          // The clock hits 0 with a flare in hand: it burns, and the clock runs on.
          else if (blow === 'flare' || blow === 'flare-last') t.wait(t.q.deadline! - t.clock.now).act({ type: 'flare', askedAt: t.q.askedAt }, null);
          else t.answer(null, false, INTO + BLOW_AFTER);
          return { state: before, act: t.room, at, steps: [{ wait: BLOW_AFTER }, { then: t.s, at: t.clock.now }] } satisfies Built;
        }
        if (when === 'notice') {
          // An achievement's notice over a streak's fire. On a phone the notices
          // stand across the top, on the player's entry, and the fire passes behind
          // them as behind anything solid: their boxes alone hide it, and it burns
          // on round their edges and in the gaps above and between them (two
          // achievements at once come one by one, lib/achievementToasts.ts).
          t.playTo((s) => (s.players[0].streak ?? 0) >= Number(v.streak ?? 80) && s.phase === 'choosing');
          const earned = ['saving-grace', 'streak-100'].slice(0, Number(v.notices ?? 1)).map((id) => ACHIEVEMENTS.find((a) => a.id === id)!);
          const toasts = earned.map((a) => ({ toast: a.title, opts: { title: 'Achievement earned', seal: { sign: a.sign, tier: a.tier } } }));
          // One sound for them all, the hardest one's metal (lib/achievementToasts.ts).
          const sound = { sound: soundDesign.ACHIEVEMENT_SOUNDS?.[Math.max(...earned.map((a) => a.tier))], from: '.toasts' };
          return { state: t.s, act: t.room, at: t.clock.now, steps: [{ wait: 800 }, ...toasts, sound] } satisfies Built;
        }
        if (when === 'zone') {
          // The game's own arrival: the run moves on into the zone while the screen
          // watches, so the card plays over the header and the scoreboard, its bars
          // over them (the zone card bench plays it alone).
          const zone = Number(v.zone ?? 31);
          t.playTo((s) => s.round >= zone - 1 && s.phase === 'choosing');
          const before = t.s;
          const at = t.clock.now;
          t.playTo((s) => s.round >= zone && s.phase === 'choosing');
          return { state: before, act: t.room, at, steps: [{ wait: 1200 }, { then: t.s, at: t.clock.now }] } satisfies Built;
        }
        // The cards: finds among them as set, a vein on the first and a flare on
        // the last, or one of them alone, its note on its card's side (where a
        // phone's browser on its side gives the lock rule the other); all three,
        // a Dynamite Cache in the middle, to set a new card beside; or a vein
        // struck once, dig deeper or the way out; and dynamite in the pack, for
        // the line on what stays unused on them.
        const [vein, middle, flare] = t.s.offered;
        const on = v.finds ?? 'as';
        if (on === 'dig') digging(t);
        else if (on !== 'as')
          t.s.delve!.finds = [
            ...(on === 'flare' ? [] : [{ category: vein, kind: 'azurite' as const }]),
            ...(on === 'all' ? [{ category: middle, kind: 'dynamite' as const }] : []),
            ...(on === 'vein' ? [] : [{ category: flare, kind: 'flare' as const }]),
          ];
        if (v.held) t.s.delve!.inventory = { [pid('Kalguur')]: { wards: 0, flares: 0, dynamite: 1 } };
        return shown(t, v);
      },
    });
  }

  /**
   * A fossil in Delve alone (lib/fossils.ts). On the cards: the one card lit
   * from behind, amber (CardEngraving `lit`), saying only its tier ("Fossil",
   * "Rare Fossil", a rare's deeper and flecked with gold), never which. Alone,
   * or beside one or two finds (its note shortened to a line then, which with
   * the finds' notes and an unused stick's must fit a small phone's browser,
   * 375 x 635, and a phone on its side, 844 x 340); the first one, the hook,
   * on the first offer at depth 5. Its card shows its category's emblem
   * caught in the amber, so any category can carry it: the gems' cut brooch,
   * or an item with others of its kinds behind it.
   * Its question: the fossil card's seals in its name plate on panes of amber
   * lit from behind (NamePlate.svelte's `fossil`), answered as it happens
   * (lib/fossilFlight.ts): right, the seals flare and the fossil the card
   * never named comes out of the left one into the circle's heart, named,
   * then flown to the line; wrong, the seals go out and the fossil is lost;
   * dynamite blasts the question away with it (rule 7), its amber shattering,
   * and the question that comes in from the next card is plain. Still up, the
   * question as it's asked.
   */
  function delveFossilScene(): Scene {
    const atQuestion = { at: ['question'] };
    return scene('delve-fossil', 'Delve alone', 'A fossil', [ALONE], delveAlone, {
      controls: [
        moment([
          ['cards', 'Among the cards'],
          ['question', 'Its question'],
        ]),
        FOSSIL_TIER,
        FOSSIL_CAT,
        {
          kind: 'choice',
          key: 'beside',
          label: 'Finds beside it',
          default: 'none',
          when: { at: ['cards'] },
          options: [
            { value: 'none', label: 'None' },
            { value: 'one', label: 'A vein' },
            { value: 'two', label: 'A vein and a flare' },
          ],
        },
        { kind: 'toggle', key: 'held', label: 'Dynamite in the pack', default: false, when: { at: ['cards'] } },
        { kind: 'toggle', key: 'hook', label: 'The first one, at depth 5', default: false, when: { at: ['cards'] } },
        // A fossil's question asked by name, or by picture (deeper down, where pictures come).
        {
          kind: 'choice',
          key: 'asked',
          label: 'Asked as',
          default: 'name',
          when: atQuestion,
          options: [
            { value: 'name', label: 'Names' },
            { value: 'art', label: 'Pictures' },
          ],
        },
        // The zone it's asked in (each its own backdrop, the hall's amber light swelling through it): a few depths into it.
        { kind: 'choice', key: 'zone', label: 'Its zone', default: '0', when: atQuestion, options: backdrops.zones.map((z, k) => ({ value: String(k), label: z.name })) },
        { kind: 'range', key: 'before', label: 'Fossils held before', min: 0, max: 24, step: 1, default: 6, when: atQuestion },
        // The question held up, its fossil waiting in it, never answered.
        { kind: 'toggle', key: 'up', label: 'Still up', default: false, when: atQuestion },
        { kind: 'toggle', key: 'right', label: 'Answered right', default: true, when: atQuestion },
        { kind: 'toggle', key: 'early', label: 'Delve Deeper mid-flight', default: false, when: atQuestion },
        { kind: 'toggle', key: 'blast', label: 'Dynamite instead', default: false, when: atQuestion },
      ],
      states: [
        { label: 'A fossil alone', values: {} },
        { label: 'A rare fossil alone', values: { tier: 'rare' }, listed: false },
        { label: 'A fossil beside an Azurite Vein', values: { beside: 'one' }, listed: false },
        { label: 'A rare one beside an Azurite Vein', values: { beside: 'one', tier: 'rare' } },
        { label: 'Beside a vein and a Flare Cache, dynamite in the pack', values: { beside: 'two', held: true } },
        { label: 'The first fossil, at depth 5', values: { hook: true }, listed: false },
        { label: 'A fossil’s question answered right: kept, which one shown, flown to the line', values: { at: 'question' }, key: 'game/delve-fossil-found', listed: false },
        { label: 'A rare kept', values: { at: 'question', tier: 'rare' } },
        { label: 'Still up: a common’s question', values: { at: 'question', up: true } },
        { label: 'Still up: a rare’s, asked by pictures', values: { at: 'question', up: true, tier: 'rare', asked: 'art' } },
        { label: 'Asked by pictures, kept', values: { at: 'question', asked: 'art' } },
        { label: 'The first fossil kept', values: { at: 'question', before: 0 } },
        { label: 'The 25th: the set complete', values: { at: 'question', before: 24, tier: 'rare' } },
        { label: 'Answered wrong: the fossil lost', values: { at: 'question', right: false } },
        { label: 'Delve Deeper mid-flight', values: { at: 'question', early: true } },
        { label: 'A fossil’s question blasted away with dynamite: the fossil goes with it', values: { at: 'question', blast: true }, key: 'game/delve-fossil-blast' },
      ],
      build: (v = {}) => {
        const tier = v.tier === 'rare' ? 'rare' : 'common';
        if ((v.at ?? 'cards') === 'cards') {
          const beside = String(v.beside ?? 'none');
          const cat = String(v.cat ?? 'dealt');
          const t = v.hook ? delveAlone().playTo((s) => s.round >= 6 && s.phase === 'choosing') : delveAlone();
          // The chosen category on the middle card, swapped with the card that held it if it was dealt.
          if (cat !== 'dealt') t.s.offered = t.s.offered.map((c, i) => (i === 1 ? cat : c === cat ? t.s.offered[1] : c));
          const [first, middle, last] = t.s.offered;
          t.s.delve!.finds = [
            ...(beside === 'none' ? [] : [{ category: first, kind: 'azurite' as const }]),
            ...(beside === 'two' ? [{ category: last, kind: 'flare' as const }] : []),
          ];
          t.s.delve!.fossil = { category: middle, tier };
          if (v.held) t.s.delve!.inventory = { [pid('Kalguur')]: { wards: 0, flares: 0, dynamite: 1 } };
          return shown(t, v);
        }
        const held = heldBefore(Number(v.before ?? 6), tier);
        const zone = Number(v.zone ?? 0);
        const t = zone ? delveAlone().playTo((s) => s.round >= 10 * zone + 3 && s.phase === 'choosing') : delveAlone();
        // (None found on the way down: a run gives each player one.)
        if (zone) t.s = { ...t.s, delve: { ...t.s.delve!, fossils: [], fossilsMissed: [] } };
        t.engine.setFossilsHeld((ids) => ids.map(() => fossilMask(held)));
        if (v.blast) t.s = { ...t.s, delve: { ...t.s.delve!, inventory: { [pid('Kalguur')]: { wards: 0, flares: 0, dynamite: 1 } } } };
        fossilPicked(t, v, tier);
        const before = t.s;
        const at = t.clock.now + INTO;
        if (v.up) return { state: before, act: t.room, at, stored: storedFossils(held) } satisfies Built;
        const answered = v.blast ? t.wait(INTO + BLOW_AFTER).act({ type: 'blast', askedAt: t.q.askedAt }, null).s : t.answer(null, v.right !== false, INTO + BLOW_AFTER).s;
        return {
          state: before,
          act: t.room,
          at,
          stored: storedFossils(held),
          steps: [{ wait: BLOW_AFTER }, { then: answered, at: t.clock.now }, ...pressedEarly(v)],
        } satisfies Built;
      },
    });
  }

  /**
   * A fossil on the team's cards, with Doryani's one for the run already
   * found (the card is for the others, its note says so); and its question
   * cleared, played as it happens: everyone standing who can take one keeps
   * one of their own (Doryani none, if he has had this run's), each piece
   * flying on its keeper's screen.
   */
  function togetherFossilScene(): Scene {
    const answered = { at: ['answered'] };
    return scene('delve-together-fossil', 'Delve together', 'A fossil, together', roomSeats, delveTogether, {
      controls: [
        moment([
          ['cards', 'Among the cards, Doryani’s found this run'],
          ['answered', 'Its question answered'],
        ]),
        players(2, 3),
        FOSSIL_TIER,
        { kind: 'toggle', key: 'right', label: 'Answered right', default: true, when: answered },
        { kind: 'toggle', key: 'taken', label: 'Doryani’s found one this run', default: false, when: answered },
      ],
      states: [
        { label: 'A fossil among the cards, Doryani’s found this run', values: {} },
        { label: 'A fossil’s question answered right: everyone standing keeps one of their own, each seeing theirs', values: { at: 'answered' }, key: 'game/delve-together-fossil-found', listed: false },
        { label: 'A rare, each their own', values: { at: 'answered', tier: 'rare' } },
        { label: 'Doryani’s found one this run', values: { at: 'answered', taken: true } },
        { label: 'Answered wrong: the fossil lost', values: { at: 'answered', right: false } },
      ],
      build: (v = {}) => {
        const tier = v.tier === 'rare' ? 'rare' : 'common';
        const t = delveTogether(v);
        const doryani = pid('Doryani');
        if ((v.at ?? 'cards') === 'cards') {
          // Down to depth 7, Doryani naming each one.
          while (t.s.round < 8) {
            for (const p of t.s.players) t.act({ type: 'vote', category: t.s.offered[0] }, p.name);
            if (t.s.phase === 'choosing') t.act({ type: 'expire' }, null);
            t.answer('Doryani', true).wait(1000).next();
          }
          t.s.delve!.fossils = [{ id: 'scorched', depth: 6, at: t.clock.now - 90_000, to: [doryani] }];
          t.s.delve!.fossil = { category: t.s.offered[1], tier };
          return shown(t, v);
        }
        const held = heldBefore(6, tier);
        t.engine.setFossilsHeld((ids) => ids.map(() => fossilMask(held)));
        if (v.taken) t.s.delve!.fossils = [{ id: 'scorched', depth: 2, at: t.clock.now - 90_000, to: [doryani] }];
        t.s.delve!.fossil = { category: t.s.offered[0], tier };
        voted(t);
        const before = t.s;
        const at = t.clock.now + INTO;
        const after = t.answer('Doryani', v.right !== false, INTO + BLOW_AFTER).s;
        return { state: before, act: t.room, at, stored: storedFossils(held), steps: [{ wait: BLOW_AFTER }, { then: after, at: t.clock.now }] } satisfies Built;
      },
    });
  }

  /**
   * A run's end: its last answer shown, then the end screen coming in as the screens swap, from just under its
   * size (App.svelte's screenIn). It fits the window as it will stand once in (GameOver.svelte's straighten), so
   * the page doesn't scroll once it's there. A long first run, its panel full: what it earned, its uniques new
   * to the codex.
   */
  function runEnds(): Built {
    const t = table(['Kalguur'], { mode: 'delve' }, { host: null }).start();
    let last = { state: t.s, at: t.clock.now };
    t.playTo(
      (s) => {
        if (s.phase !== 'over') last = { state: s, at: t.clock.now };
        return s.phase === 'over';
      },
      (_, round) => round < 25,
    );
    const run = t.s.delve!.startedAt;
    const log = sceneEngine()
      .items.slice(0, 26)
      .map((it, i): Answer => ({ t: run + 1 + i, id: it.id, mode: 'name', ok: true, difficulty: 'cruel', race: false, depth: Math.min(t.s.round, 1 + i), run }));
    return {
      state: last.state,
      act: t.room,
      at: last.at,
      hereOnly: true,
      delveResult: { id: run, depth: t.s.round, previousBest: null, best: true },
      earned: ['depth-10', 'prima-materia', 'streak-25'],
      log,
      steps: [{ wait: LOOK_FIRST }, { then: t.s, at: t.clock.now }],
    } satisfies Built;
  }
}
