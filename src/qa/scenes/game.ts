// In a game: each kind's moments (a category to pick, a question with its
// clock running, the answer shown, right and wrong), played through the
// engine to there, from the seat whose turn it is and from one watching it.
// Delve alone and together, deeper down too, with finds among the cards and a
// vein's dig, the vote's clock running out and a teammate to bring back; the
// host's kick, and a duelist sent to the bench.

import { MAX_PLAYERS, PRESETS, TALL_ART_GROUPS, type GameState, type Knobs, type Settings } from '../../lib/game.ts';
import { DELVE_IDLE_ROUNDS, WAY_OUT, livesOf, voteClosesAt } from '../../lib/delve.ts';
import { ACHIEVEMENTS } from '../../lib/achievements.ts';
import { DELVE_FLAMES } from '../../lib/fx/streaks.ts';
// (A namespace: the code before this change has no ACHIEVEMENT_SOUNDS, and a name it lacks fails the whole screen there.)
import * as soundDesign from '../../lib/soundDesign.ts';
import type { Control, Values } from '../bench.ts';
import { longestNamed, longestWord } from '../build/engine.ts';
import { pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene, Seat, Step } from '../scene.ts';

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

function scene(key: string, group: string, label: string, seats: Seat[], play: (v: Values) => Table, more: Partial<Scene> = {}): Scene {
  return {
    key: `game/${key}`,
    screen: 'game',
    group,
    label,
    seats,
    build: (v = {}) => {
      const t = play(v);
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
    },
    ...more,
  };
}
const table = (names: string[], settings: Partial<Settings> = {}, o: { host?: null; seed?: number } = {}) => new Table(names, settings, o);

/**
 * A vote's scene with its clock running out (its `closing` control): from
 * three seconds before it closes, a second at a time, then the room's draw.
 * Before anyone votes there's no clock: the scene as it is.
 */
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

function withClosing(base: Scene, play: (v: Values) => Table): Scene {
  return {
    ...base,
    build: (v = {}) => {
      const built = base.build(v);
      if (!v.closing) return built;
      const t = play(v);
      const end = voteClosesAt(t.s);
      if (end === null) return built;
      const shown = t.s;
      t.wait(Math.max(0, end - t.clock.now)).act({ type: 'expire' }, null);
      const ticks: Step[] = [2000, 1000, 0].flatMap((left) => [{ wait: 1000 }, { clock: end - left }]);
      return { state: shown, act: t.room, at: end - 3000, steps: [...ticks, { wait: 500 }, { then: t.s, at: t.clock.now }] } satisfies Built;
    },
  };
}

export function gameScenes(): Scene[] {
  // Take turns: Doryani's turn first (the seed's, with three), Kalguur hosting.
  const turns = (v: Values) => table(seated(v, 3), asked(v)).start();
  const race = (v: Values) => table(seated(v, 5), { mode: 'race', ...asked(v) }).start();
  // (Its own dice by a `seed`; delveAlone is handed straight to scenes, which give it their controls' values.)
  const delveSeeded = (seed?: number) => table(['Kalguur'], { mode: 'delve' }, { host: null, seed }).start();
  const delveAlone = () => delveSeeded();
  const delveTogether = (v: Values) => table(seated(v, 3), { mode: 'delve' }).start();
  // The team's cards: finds among them as set, and Doryani's vote.
  const togetherCards = (v: Values) => {
    const t = delveTogether(v);
    const [vein, , flare] = t.s.offered;
    const on = v.finds ?? 'none';
    t.s.delve!.finds = [
      ...(on === 'both' || on === 'vein' ? [{ category: vein, kind: 'azurite' as const }] : []),
      ...(on === 'both' || on === 'flare' ? [{ category: flare, kind: 'flare' as const }] : []),
    ];
    if (v.held) t.s.delve!.inventory = { [pid('Doryani')]: { wards: 0, flares: 0, dynamite: 1 } };
    if (v.idle) t.s.delve!.missed = { [pid('Una of the Vaal')]: DELVE_IDLE_ROUNDS };
    return v.voted === false ? t : t.act({ type: 'vote', category: t.s.offered[1] }, 'Doryani');
  };
  const turnsSeats = [guest('Doryani'), host('Kalguur'), WATCHER];
  // Una of the Vaal is in every take-turns scene's moves; the race's answer Doryani's and hers.
  const many = { controls: [players(3, 3)] };
  // A question's scenes: its answers too.
  const manyAsked = { controls: [players(3, 3), ...ANSWERS] };
  const crowdAsked = { controls: [players(3, 5), ...ANSWERS] };
  return [
    scene('turns-choosing', 'Take turns', 'Picking a category', turnsSeats, turns, {
      ...many,
      states: [
        { label: 'Picking a category', values: {} },
        // Names of 19 to 20 characters, near MAX_NAME: Doryani's (19) turn on the banner, seen from Kalguur's seat, shrunk to fit an upright phone.
        { label: 'Long names', values: { names: 'long' } },
      ],
    }),
    // The longest names too, the most three rows of them have to fit (a phone's browser on its side, its bars up), so the sweep sees them.
    scene('turns-question', 'Take turns', 'A question, its clock running', turnsSeats, (v) => turns(v).pick(), {
      ...manyAsked,
      states: [
        { label: 'A question, its clock running', values: {} },
        { label: 'Six of the longest names', values: { asked: 'longest' } },
      ],
    }),
    scene(
      'turns-right',
      'Take turns',
      'Answered right',
      turnsSeats,
      (v) => {
        const t = turns(v).pick();
        return t.answer(t.turn, true);
      },
      {
        ...manyAsked,
        states: [
          { label: 'Answered right', values: {} },
          { label: 'Six of the longest names', values: { asked: 'longest' } },
          { label: 'Eight of the longest names', values: { answers: '8', asked: 'longest' } },
          { label: 'Ten of the longest names', values: { answers: '10', asked: 'longest' } },
        ],
      },
    ),
    scene(
      'turns-wrong',
      'Take turns',
      'Answered wrong',
      turnsSeats,
      (v) => {
        const t = turns(v).pick();
        return t.answer(t.turn, false);
      },
      manyAsked,
    ),
    scene(
      'turns-timeout',
      'Take turns',
      'Out of time',
      turnsSeats,
      (v) => {
        // Nobody answered: the clock runs to its end and the host's timer sends the empty answer, from the room itself.
        const t = turns(v).pick();
        t.wait(Math.max(0, (t.q.deadline ?? t.clock.now) - t.clock.now));
        return t.act({ type: 'answer', index: null }, null);
      },
      manyAsked,
    ),
    scene('turns-late', 'Take turns', 'Late in a game: scores near the target', turnsSeats, (v) => turns(v).playTo((s) => s.round >= 7 && s.phase === 'choosing', (name, round) => name !== 'Una of the Vaal' || round % 2 === 0), many),
    scene('turns-offline', 'Take turns', 'Una of the Vaal went offline', turnsSeats, (v) => turns(v).act({ type: 'connection', playerId: pid('Una of the Vaal'), connected: false }, null), many),
    // The host's kick on the scoreboard: the first click arms it (the entry asks, in the wrong answer's colours, for
    // KICK_ARMED_MS), the second removes them, their entry fading as the others close up. Here the room takes the second.
    {
      ...scene('turns-kick', 'Take turns', 'The host removing a player: asked, then gone', [host('Kalguur')], turns, many),
      build: (v = {}) => {
        const t = turns(v);
        const shown = t.s;
        t.act({ type: 'remove', playerId: pid('Doryani') });
        return { state: shown, act: t.room, at: t.clock.now, steps: [{ wait: 700 }, { click: '.kick-at .kick' }, { wait: 1600 }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    },
    scene(
      'turns-mirrored',
      'Take turns',
      'Answered right: the picture was mirrored',
      turnsSeats,
      (v) => {
        // Pictures as answers, ten of them, put the Mirrored line in the narrowest captions.
        const t = table(THREE, { difficulty: 'custom', custom: askedAs(v, { options: 6, similarNames: 1, fakes: 2, artChance: 0.5, veil: 'slow', grayscale: 'art', mirror: 1, lockout: 3 }) })
          .start()
          .pick();
        return t.answer(t.turn, true);
      },
      { controls: ANSWERS },
    ),
    scene('turns-untimed', 'Take turns', 'A question with no timer', turnsSeats, () => table(THREE, { timer: 0 }).start().pick()),
    scene('hot-seat', 'Take turns', 'Hot-seat: a question', [ALONE], () => table(THREE, {}, { host: null }).start().pick()),
    // The page reloaded mid-game: the game this tab saved, picked up as the page loads (Replay reloads it again).
    {
      ...scene('hot-seat-reload', 'Take turns', 'Hot-seat: the page reloaded in a game', [{ mode: 'none', me: null }], () => table(THREE, {}, { host: null })),
      build: () => ({ state: null, saved: { mode: 'local', state: table(THREE, {}, { host: null }).start().pick().s } }) satisfies Built,
    },
    // A picture question answered by a click (hot-seat, so this screen's turn): the
    // host's word comes back a moment later and the verdict's tints fade in with
    // the borders, the answer's and (a wrong click) the one picked.
    {
      ...scene('art-clicked', 'Take turns', 'A picture question answered by a click: its tints fade in', [ALONE], () => table(THREE, asked({ asked: 'art' }), { host: null }).start().pick()),
      controls: [{ kind: 'toggle', key: 'right', label: 'Clicks the right one', default: false }],
      states: [
        { label: 'A wrong picture clicked', values: {} },
        { label: 'The right picture clicked', values: { right: true } },
      ],
      build: (v = {}) => {
        const t = table(THREE, asked({ asked: 'art' }), { host: null }).start().pick();
        const shown = t.s;
        const at = t.clock.now + 1000;
        const i = v.right ? t.right() : t.wrong();
        t.answer(null, i, 1000 + LOOK_FIRST + 250);
        return { state: shown, act: t.room, at, steps: [{ wait: LOOK_FIRST }, { click: `.tile[data-cursor="opt:${i}"]` }, { wait: 250 }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    },
    // Rog plays at Kalguur's screen: on his turn the host's screen answers, under his name.
    scene('at-screen', 'Take turns', "A turn at the host's screen", [host('Kalguur'), guest('Doryani')], () =>
      table(['Kalguur', 'Doryani'])
        .act({ type: 'join', playerId: pid('Rog'), name: 'Rog', local: true })
        .start()
        .playTo((s) => s.phase === 'choosing' && s.players[s.turn].id === pid('Rog'))
        .pick(),
    ),
    scene('race-question', 'Race', 'A question, everyone answering', [host('Kalguur'), guest('Doryani'), WATCHER], race, crowdAsked),
    scene('race-answered', 'Race', 'Answered, waiting on the others', [host('Kalguur'), guest('Doryani'), WATCHER], (v) => race(v).answer('Doryani', false, 1800), crowdAsked),
    scene('race-reveal', 'Race', 'The answer shown', [host('Kalguur'), guest('Doryani'), WATCHER], (v) => race(v).answer('Una of the Vaal', true, 1500), crowdAsked),
    // A miss as it happens, from Kalguur's seat: his own (the line under the
    // answers saying it fades in), or a sixth on one answer while he still
    // answers (past five, its faces give way to four and a count, "+2", which
    // scales in).
    {
      ...scene('race-miss', 'Race', 'Answered wrong as it happens: the line, or a sixth miss’s +2', [host('Kalguur')], race),
      controls: [
        {
          kind: 'choice',
          key: 'miss',
          label: 'Who misses',
          default: 'mine',
          options: [
            { value: 'mine', label: 'Kalguur, this seat' },
            { value: 'sixth', label: 'A sixth on one answer: +2' },
          ],
        },
      ],
      states: [
        { label: 'Kalguur answers wrong: his line fades in', values: {} },
        { label: 'A sixth miss on one answer: +2 scales in', values: { miss: 'sixth' } },
      ],
      build: (v = {}) => {
        const sixth = v.miss === 'sixth';
        const t = table(SEATED.slice(0, sixth ? 8 : 5), { mode: 'race' }).start();
        const w = t.wrong();
        // Five of the others on one wrong answer already, the sixth to come.
        if (sixth) for (const name of SEATED.slice(1, 6)) t.answer(name, w, 400);
        const shown = t.s;
        const at = t.clock.now + (sixth ? 0 : 1000);
        t.answer(sixth ? SEATED[6] : 'Kalguur', w, LOOK_FIRST + (sixth ? 0 : 1000));
        return { state: shown, act: t.room, at, steps: [{ wait: LOOK_FIRST }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    },
    // Long names too: the intro's duelists as wide as the longest name between them, each name whole.
    scene(
      'deathmatch',
      'Deathmatch',
      'A tie at the target: the deathmatch',
      [host('Kalguur'), guest('Doryani'), WATCHER],
      () =>
        table(['Kalguur', 'Doryani'], { targetScore: 1 })
          .start()
          .playTo((s) => !!s.deathmatch),
      {
        states: [
          { label: 'A tie at the target: the deathmatch', values: {} },
          { label: 'Long names', values: { names: 'long' } },
        ],
      },
    ),
    // The first duelist missed: face down on the scoreboard till the round ends.
    scene('deathmatch-miss', 'Deathmatch', 'A duelist missed, the next to answer', [host('Kalguur'), guest('Doryani'), WATCHER], () => {
      const t = table(['Kalguur', 'Doryani'], { targetScore: 1 })
        .start()
        .playTo((s) => !!s.deathmatch)
        .pick();
      return t.answer(t.turn, false).wait(1000).next();
    }),
    // Three tied; Una of the Vaal missed while the others scored, and the next round says so.
    // Long names: on an upright phone the three share the intro's row, each name cut short only there.
    {
      ...scene('deathmatch-out', 'Deathmatch', 'Three in, one knocked out', [host('Kalguur'), guest('Doryani'), WATCHER], () => table(['Kalguur'])),
      controls: [{ kind: 'toggle', key: 'live', label: 'Knocked out as it happens', default: false }],
      states: [
        { label: 'Three in, one knocked out', values: {} },
        { label: 'Long names', values: { names: 'long' } },
        // The round's last answer shown, then the next round: Una's entry set back on the bench as it starts.
        { label: 'Knocked out as it happens: the bench', values: { live: true } },
      ],
      build: (v = {}) => {
        const t = table(['Kalguur', 'Doryani', 'Una of the Vaal'], { targetScore: 1 })
          .start()
          .playTo((s) => !!s.deathmatch);
        const una = pid('Una of the Vaal');
        let last = { state: t.s, at: t.clock.now };
        t.playTo(
          (s) => {
            if (s.deathmatch?.alive.includes(una)) last = { state: s, at: t.clock.now };
            return !!s.deathmatch?.eliminated.length && s.phase === 'choosing';
          },
          (name) => name !== 'Una of the Vaal',
        );
        if (!v.live) return { state: t.s, act: t.room, at: t.clock.now } satisfies Built;
        return { state: last.state, act: t.room, at: last.at, steps: [{ wait: 1500 }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    },
    // A long name (20 characters, MAX_NAME): alone, it has the scoreboard's whole row, whole on a phone upright or on its side.
    scene('delve-cards', 'Delve alone', 'The cards dealt', [ALONE], delveAlone, {
      states: [
        { label: 'The cards dealt', values: {} },
        { label: 'A long name', values: { names: 'long' } },
      ],
    }),
    // Which cards hold a find: a vein on the first and a flare on the last,
    // or one of them alone, its note on its card's side (where a phone's
    // browser on its side gives the lock rule the other); and dynamite in
    // the pack, for the line on what stays unused on them.
    scene(
      'delve-finds',
      'Delve alone',
      'The cards dealt, finds among them',
      [ALONE],
      (v) => {
        const t = delveAlone();
        const [vein, , flare] = t.s.offered;
        const on = v.finds ?? 'both';
        t.s.delve!.finds = [
          ...(on === 'flare' ? [] : [{ category: vein, kind: 'azurite' as const }]),
          ...(on === 'vein' ? [] : [{ category: flare, kind: 'flare' as const }]),
        ];
        if (v.held) t.s.delve!.inventory = { [pid('Kalguur')]: { wards: 0, flares: 0, dynamite: 1 } };
        return t;
      },
      {
        controls: [
          {
            kind: 'choice',
            key: 'finds',
            label: 'Finds',
            default: 'both',
            options: [
              { value: 'both', label: 'A vein and a flare' },
              { value: 'vein', label: 'A vein, first card' },
              { value: 'flare', label: 'A flare, last card' },
            ],
          },
          { kind: 'toggle', key: 'held', label: 'Dynamite in the pack', default: false },
        ],
        states: [
          { label: 'An Azurite Vein and a Flare Cache', values: {} },
          { label: 'Both, with dynamite in the pack', values: { held: true } },
          { label: 'An Azurite Vein alone, on the first card', values: { finds: 'vein' } },
          { label: 'A Flare Cache alone, on the last card', values: { finds: 'flare' } },
        ],
      },
    ),
    scene('delve-dig', 'Delve alone', 'A vein struck once: dig deeper, or the way out', [ALONE], () => {
      const t = delveAlone();
      const vein = t.s.offered[0];
      t.s.offered = [vein, WAY_OUT];
      t.s.delve!.finds = [{ category: vein, kind: 'azurite' }];
      t.s.delve!.dig = { strikes: 1, haul: [t.s.players[0].id], light: 6, struck: [] };
      return t;
    }),
    scene('delve-question', 'Delve alone', 'A question', [ALONE], () => delveAlone().pick()),
    scene('delve-wrong', 'Delve alone', 'Answered wrong: a life lost', [ALONE], () => {
      const t = delveAlone().pick();
      return t.answer(null, false);
    }),
    // Depth 15, the seed's: Ratha's Assault, its picture mirrored, six names
    // beside it. A phone on its side under 336 tall gives the names more of the
    // width, and an iPhone's notch takes more of it again, so there the plate's
    // base type wraps (centred) between the name and the Mirrored line.
    // (tests/qaScenes.test.ts says so if new items or a new curve change it.)
    scene('delve-long-base', 'Delve alone', 'Answered wrong deeper down: a long base type and the Mirrored line on the plate', [ALONE], () => {
      const t = delveSeeded(79);
      t.playTo((s) => s.round >= 16 && s.phase === 'choosing').pick();
      return t.answer(null, false);
    }),
    // The taps of a run as they play out, each moment from the one before:
    // the answer shown (the circle taking its colour ring by ring, the line
    // over the art giving way to what happened without anything under it
    // moving) and Next, the question's stage fading out under the next
    // depth's cards.
    {
      ...scene('delve-answer', 'Delve alone', 'Answered right as it happens, then on to the next depth', [ALONE], delveAlone),
      build: () => {
        const t = delveAlone().pick();
        const shown = t.s;
        const at = t.clock.now + INTO;
        const answered = t.answer(null, true, INTO + BLOW_AFTER).s;
        const answeredAt = t.clock.now;
        t.wait(REVEAL_FOR).next();
        return {
          state: shown,
          act: t.room,
          at,
          steps: [{ wait: BLOW_AFTER }, { then: answered, at: answeredAt }, { wait: REVEAL_FOR }, { then: t.s, at: t.clock.now }],
        } satisfies Built;
      },
    },
    // The header's depth rolling over: a run at Depth 1 (or 9), answered
    // right, then on to the next, its number rising out as the next one
    // rises in once its cards are dealt. 1 to 2 keeps the line's width; 9 to
    // 10, a figure more, eases it wider, as it does where the zone's card
    // doesn't play (a screen that saw the run move on too late for one): this
    // scene comes in at the deal, with no card. With its card (game/delve-zone,
    // Depth 11) the line changes at once under the card's closed bars.
    // (At depth 0 the line names no depth: the banner under it has the run's
    // start line, Game.svelte.)
    {
      ...scene('delve-depth', 'Delve alone', 'A depth answered, then on: the header’s depth rolling over', [ALONE], delveAlone),
      controls: [
        {
          kind: 'choice',
          key: 'from',
          label: 'Depth',
          default: '1',
          options: [
            { value: '1', label: '1 to 2' },
            { value: '9', label: '9 to 10, no zone card' },
          ],
        },
      ],
      states: [
        { label: '1 to 2: the same width', values: {} },
        { label: '9 to 10 with no zone card: a figure more, eased', values: { from: '9' } },
      ],
      build: (v = {}) => {
        // (The round is a depth on: the line shows round 2 as Depth 1, shownDepth.)
        const round = (v.from === '9' ? 9 : 1) + 1;
        const t = delveAlone()
          .playTo((s) => s.round >= round && s.phase === 'choosing')
          .pick();
        const shown = t.s;
        const at = t.clock.now + INTO;
        const answered = t.answer(null, true, INTO + BLOW_AFTER).s;
        const answeredAt = t.clock.now;
        t.wait(REVEAL_FOR).next();
        return {
          state: shown,
          act: t.room,
          at,
          steps: [{ wait: BLOW_AFTER }, { then: answered, at: answeredAt }, { wait: REVEAL_FOR }, { then: t.s, at: t.clock.now }],
        } satisfies Built;
      },
    },
    // A pick as it happens: a moment after the cards are up this device picks the
    // first by a click (the frame says what it would send), the room's question
    // comes back at once and the cards hold it a moment, the card lifting
    // (PICK_HOLD_MS); then the question, its words veiled until its clock starts
    // a moment later, as a host's would once the pictures were in, and fading in.
    {
      ...scene('delve-pick', 'Delve alone', 'A card picked by a click, then its question’s words as the clock starts', [ALONE], delveAlone),
      build: () => {
        const t = delveAlone();
        const shown = t.s;
        const at = t.clock.now;
        t.wait(CARDS_UP + 50).pick();
        const { asked, running, start } = clockedLater(t.s, 900);
        return {
          state: shown,
          act: t.room,
          at,
          steps: [{ wait: CARDS_UP }, { click: '.cards .card' }, { wait: 50 }, { then: asked, at: asked.question!.askedAt }, { wait: 900 }, { then: running, at: start }],
        } satisfies Built;
      },
    },
    {
      ...scene('delve-blow', 'Delve alone', 'Played on from a question: dynamite going off, a flare burning, a miss, or a ward taking it', [ALONE], delveAlone),
      // (Two lives: a life lost on the first depth, so a miss leaves the last, its deeper red coming in after the drain.)
      controls: [BLOWS, { kind: 'range', key: 'lives', label: 'Lives', min: 2, max: 3, default: 3 }],
      states: [
        { label: 'Dynamite goes off', values: {} },
        { label: 'The last dynamite goes off: the flare beside it closes up', values: { blow: 'blast-last' } },
        { label: 'A flare burns: its count fades back in', values: { blow: 'flare' } },
        { label: 'The last flare burns: the dynamite beside it closes up', values: { blow: 'flare-last' } },
        { label: 'A miss costs a life', values: { blow: 'miss' } },
        { label: 'A miss on two lives: the last one’s deeper red', values: { blow: 'miss', lives: 2 } },
        { label: 'A ward takes the miss', values: { blow: 'ward' } },
      ],
      build: (v = {}) => {
        // Kalguur holds what the blow takes (dynamite, a flare, a ward), and what stays beside it.
        const blow = String(v.blow ?? 'blast');
        const t = delveAlone();
        if (Number(v.lives ?? 3) < 3) t.pick().answer(null, false).wait(1000).next();
        const me = pid('Kalguur');
        t.s = { ...t.s, delve: { ...t.s.delve!, inventory: { [me]: { ...(HELD[blow] ?? HELD.blast) } } } };
        t.pick();
        const shown = t.s;
        const at = t.clock.now + INTO;
        if (blow === 'blast' || blow === 'blast-last') t.wait(INTO + BLOW_AFTER).act({ type: 'blast', askedAt: t.q.askedAt }, null);
        // The clock hits 0 with a flare in hand: it burns, and the clock runs on.
        else if (blow === 'flare' || blow === 'flare-last') t.wait(t.q.deadline! - t.clock.now).act({ type: 'flare', askedAt: t.q.askedAt }, null);
        else t.answer(null, false, INTO + BLOW_AFTER);
        return { state: shown, act: t.room, at, steps: [{ wait: BLOW_AFTER }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    },
    scene('delve-deep', 'Delve alone', 'Deep down', [ALONE], (v) => delveAlone().playTo((s) => s.round >= Number(v.depth ?? 30) && s.phase === 'choosing'), {
      controls: [{ kind: 'range', key: 'depth', label: 'Depth', min: 2, max: 120, default: 30 }],
    }),
    // An achievement's notice over a streak's fire. On a phone the notices
    // stand across the top, on the player's entry, and the fire passes behind
    // them as behind anything solid: their boxes alone hide it, and it burns
    // on round their edges and in the gaps above and between them (two
    // achievements at once come one by one, lib/achievementToasts.ts).
    {
      ...scene('delve-notice', 'Delve alone', 'On a streak, an achievement’s notice over the fire', [ALONE], delveAlone),
      controls: [
        { kind: 'range', key: 'streak', label: 'In a row', min: 3, max: 120, default: 80 },
        { kind: 'range', key: 'notices', label: 'Achievements', min: 1, max: 2, default: 1 },
      ],
      states: [
        ...DELVE_FLAMES.map((f) => ({ label: `${f.name[0].toUpperCase()}${f.name.slice(1)} fire (${f.from} in a row)`, values: { streak: f.from } })),
        { label: 'Two achievements at once, on the hottest fire', values: { streak: DELVE_FLAMES.at(-1)!.from, notices: 2 } },
      ],
      build: (v = {}) => {
        const t = delveAlone().playTo((s) => (s.players[0].streak ?? 0) >= Number(v.streak ?? 80) && s.phase === 'choosing');
        const earned = ['saving-grace', 'streak-100'].slice(0, Number(v.notices ?? 1)).map((id) => ACHIEVEMENTS.find((a) => a.id === id)!);
        const toasts = earned.map((a) => ({ toast: a.title, opts: { title: 'Achievement earned', seal: { sign: a.sign, tier: a.tier } } }));
        // One sound for them all, the hardest one's metal (lib/achievementToasts.ts).
        const sound = { sound: soundDesign.ACHIEVEMENT_SOUNDS?.[Math.max(...earned.map((a) => a.tier))], from: '.toasts' };
        return { state: t.s, act: t.room, at: t.clock.now, steps: [{ wait: 800 }, ...toasts, sound] } satisfies Built;
      },
    },
    // The game's own arrival: the run moves on into the zone while the screen
    // watches, so the card plays over the header and the scoreboard, its bars
    // over them (the zone card bench plays it alone).
    {
      ...scene('delve-zone', 'Delve alone', 'Into a new zone: its title card over the game', [ALONE], delveAlone),
      controls: [{ kind: 'choice', key: 'zone', label: 'Zone', default: '31', options: [11, 21, 31, 41, 51, 61, 71].map((d) => ({ value: String(d), label: `Depth ${d}` })) }],
      build: (v = {}) => {
        const zone = Number(v.zone ?? 31);
        const t = delveAlone().playTo((s) => s.round >= zone - 1 && s.phase === 'choosing');
        const shown = t.s;
        const at = t.clock.now;
        t.playTo((s) => s.round >= zone && s.phase === 'choosing');
        return { state: shown, act: t.room, at, steps: [{ wait: 1200 }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    },
    // Finds among the team's cards too, as Delve alone deals them (its notes
    // beside the cards with the vote's line, on a phone's browser on its
    // side), and dynamite in Doryani's pack, for the line on what stays
    // unused on them. And the vote before anyone has voted (its rule's
    // sentence in the clock's place) or with Una idle (a line of its own
    // under the wait): the most that line has to fit beside the cards.
    withClosing(
      scene(
        'delve-together-cards',
        'Delve together',
        'The cards dealt, Doryani has voted',
        [host('Kalguur'), guest('Doryani'), WATCHER],
        togetherCards,
        {
          controls: [
            players(2, 3),
            {
              kind: 'choice',
              key: 'finds',
              label: 'Finds',
              default: 'none',
              options: [
                { value: 'none', label: 'None' },
                { value: 'both', label: 'A vein and a flare' },
                { value: 'vein', label: 'A vein, first card' },
                { value: 'flare', label: 'A flare, last card' },
              ],
            },
            { kind: 'toggle', key: 'held', label: 'Dynamite in a pack', default: false },
            { kind: 'toggle', key: 'voted', label: 'Doryani has voted', default: true },
            { kind: 'toggle', key: 'idle', label: 'Una idle', default: false },
            { kind: 'toggle', key: 'closing', label: 'The vote’s clock running out', default: false },
          ],
          states: [
            { label: 'The cards dealt, Doryani has voted', values: {} },
            { label: 'An Azurite Vein and a Flare Cache', values: { finds: 'both' } },
            { label: 'Both, with dynamite in a pack', values: { finds: 'both', held: true } },
            { label: 'Before anyone votes, two finds held', values: { finds: 'both', held: true, voted: false } },
            { label: 'Una idle, two finds held', values: { finds: 'both', held: true, idle: true } },
            { label: 'An Azurite Vein alone, on the first card', values: { finds: 'vein' } },
            { label: 'A Flare Cache alone, on the last card', values: { finds: 'flare' } },
            // Its last three seconds ticking down, then the draw.
            { label: 'The vote’s last 3 seconds, then the draw', values: { closing: true } },
          ],
        },
      ),
      togetherCards,
    ),
    scene(
      'delve-together-dig',
      'Delve together',
      'A vein struck once, the team voting: dig deeper, or the way out',
      [host('Kalguur'), guest('Doryani'), WATCHER],
      (v) => {
        const t = delveTogether(v);
        const vein = t.s.offered[0];
        t.s.offered = [vein, WAY_OUT];
        t.s.delve!.finds = [{ category: vein, kind: 'azurite' }];
        t.s.delve!.dig = { strikes: 1, haul: [t.s.players[0].id], light: 6, struck: [] };
        return t.act({ type: 'vote', category: vein }, 'Doryani');
      },
      { controls: [players(2, 3)] },
    ),
    scene(
      'delve-together-question',
      'Delve together',
      'A question, after the vote',
      [host('Kalguur'), guest('Doryani'), WATCHER],
      (v) => {
        const t = delveTogether(v);
        for (const p of t.s.players) t.act({ type: 'vote', category: t.s.offered[0] }, p.name);
        // Every vote in: the room's own timer draws the card.
        return t.s.phase === 'choosing' ? t.act({ type: 'expire' }, null) : t;
      },
      { controls: [players(2, 3)] },
    ),
    // Una perishes on a question the team then clears: at its answer the revive heart grows in on her entry for
    // those with lives to spare. Kalguur, on two after a miss, can bring her back: his second life pours out
    // (the last one's deeper red coming in after it), hers fills, and the heart shrinks away.
    {
      ...scene('delve-together-fallen', 'Delve together', 'Una perishes: the revive heart', [host('Kalguur'), guest('Doryani'), WATCHER], delveTogether),
      controls: [players(3, 3), { kind: 'toggle', key: 'gives', label: 'Kalguur brings her back', default: false }],
      states: [
        { label: 'Una perishes: the revive heart', values: {} },
        { label: 'Kalguur brings her back with his second life', values: { gives: true } },
      ],
      build: (v = {}) => {
        const t = delveTogether(v);
        const una = 'Una of the Vaal';
        for (let depth = 1; depth <= 3; depth++) {
          for (const p of t.s.players) if (livesOf(t.s, p.id) > 0) t.act({ type: 'vote', category: t.s.offered[0] }, p.name);
          if (t.s.phase === 'choosing') t.act({ type: 'expire' }, null);
          t.answer(una, false);
          // (Another wrong pick than hers: a pick struck out can't be made again.)
          const struck = new Set((t.q.struck ?? []).map((x) => x.index));
          if (depth === 1) t.answer('Kalguur', t.q.options.findIndex((o, i) => o !== t.q.itemId && !struck.has(i)));
          if (depth < 3) t.answer('Doryani', true).wait(1000).next();
        }
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
      },
    },
    // The same run from Una's own seat, a moment before her last life goes:
    // she misses, and "You perished and are now watching" opens its room as it
    // fades in; Doryani clears the depth, and (Kalguur bringing her back) the
    // line closes up again as it fades out.
    {
      ...scene('delve-together-perish', 'Delve together', 'Una perishes, from her seat: her line slides in', [guest('Una of the Vaal')], delveTogether),
      controls: [players(3, 3), { kind: 'toggle', key: 'gives', label: 'Kalguur brings her back', default: false }],
      states: [
        { label: 'Una perishes, from her seat: her line slides in', values: {} },
        { label: 'Kalguur brings her back: the line slides out', values: { gives: true } },
      ],
      build: (v = {}) => {
        const t = delveTogether(v);
        const una = 'Una of the Vaal';
        for (let depth = 1; depth <= 3; depth++) {
          for (const p of t.s.players) if (livesOf(t.s, p.id) > 0) t.act({ type: 'vote', category: t.s.offered[0] }, p.name);
          if (t.s.phase === 'choosing') t.act({ type: 'expire' }, null);
          if (depth === 3) break;
          t.answer(una, false);
          const struck = new Set((t.q.struck ?? []).map((x) => x.index));
          if (depth === 1) t.answer('Kalguur', t.q.options.findIndex((o, i) => o !== t.q.itemId && !struck.has(i)));
          t.answer('Doryani', true).wait(1000).next();
        }
        // Her last life, on the third depth's question.
        const shown = t.s;
        const at = t.clock.now + 1000;
        t.answer(una, false, 1000 + LOOK_FIRST);
        const steps: Step[] = [{ wait: LOOK_FIRST }, { then: t.s, at: t.clock.now }];
        t.answer('Doryani', true, 1500);
        steps.push({ wait: 1500 }, { then: t.s, at: t.clock.now });
        if (v.gives) {
          t.wait(2000).act({ type: 'revive', target: pid(una) }, 'Kalguur');
          steps.push({ wait: 2000 }, { then: t.s, at: t.clock.now });
        }
        return { state: shown, act: t.room, at, steps } satisfies Built;
      },
    },
    // Kalguur's own miss on the team's question: the line on what it cost him fades in.
    {
      ...scene('delve-together-miss', 'Delve together', 'Kalguur misses, from his seat: his line fades in', [host('Kalguur')], delveTogether),
      controls: [players(2, 3)],
      build: (v = {}) => {
        const t = delveTogether(v);
        for (const p of t.s.players) t.act({ type: 'vote', category: t.s.offered[0] }, p.name);
        if (t.s.phase === 'choosing') t.act({ type: 'expire' }, null);
        const shown = t.s;
        const at = t.clock.now + 1000;
        t.answer('Kalguur', false, 1000 + LOOK_FIRST);
        return { state: shown, act: t.room, at, steps: [{ wait: LOOK_FIRST }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    },
    // The vote, its votes coming in one at a time from Kalguur's seat, all on
    // one card: the first starts the clock (Closes in fades in, the rule gives
    // way to who it waits for); each seal comes in at its seat's place, those
    // after it sliding aside; Kalguur's own turns the prompt's line; past five,
    // four faces and a count, which scales in, and again as it grows.
    {
      ...scene('delve-together-votes', 'Delve together', 'The votes coming in one at a time', [host('Kalguur')], delveTogether),
      build: () => {
        // Eight, so the vote stays open with one still to vote.
        const t = table(SEATED.slice(0, 8), { mode: 'delve' }).start();
        const shown = t.s;
        const at = t.clock.now;
        const card = t.s.offered[1];
        const steps: Step[] = [];
        ['Rog', 'Una of the Vaal', 'Doryani', 'Alva', 'Dannig', 'Kalguur', 'Hooded One'].forEach((name, n) => {
          const wait = n === 0 ? CARDS_UP : 800;
          t.wait(wait).act({ type: 'vote', category: card }, name);
          steps.push({ wait }, { then: t.s, at: t.clock.now });
        });
        return { state: shown, act: t.room, at, steps } satisfies Built;
      },
    },
    scene(
      'delve-together-cleared',
      'Delve together',
      'Cleared: Doryani named it first',
      [host('Kalguur'), guest('Doryani'), WATCHER],
      (v) => {
        const t = delveTogether(v);
        for (const p of t.s.players) t.act({ type: 'vote', category: t.s.offered[0] }, p.name);
        if (t.s.phase === 'choosing') t.act({ type: 'expire' }, null);
        return t.answer('Doryani', true);
      },
      { controls: [players(2, 3)] },
    ),
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
        { label: 'Delve alone, from the lobby', values: { mode: 'delve' } },
        { label: 'Take turns, Play again', values: { from: 'over' } },
        { label: 'Delve alone, Play again', values: { from: 'over', mode: 'delve' } },
      ],
      build: (v = {}) => {
        const delve = v.mode === 'delve';
        const t = delve ? table(['Kalguur'], { mode: 'delve' }, { host: null }) : table(THREE);
        // To the end: Kalguur alone right on his turns, or a run's three misses.
        if (v.from === 'over') t.start().playTo((s) => s.phase === 'over', (name) => !delve && name === 'Kalguur');
        const shown = t.s;
        const at = t.clock.now;
        t.wait(LOOK_FIRST);
        if (v.from === 'over') t.act({ type: 'restart', play: true });
        else t.start();
        return {
          state: shown,
          act: t.room,
          at,
          // (Alone, on this device: no room code on the line.)
          ...(delve ? { seat: ALONE, hereOnly: true } : {}),
          steps: [{ wait: LOOK_FIRST }, { then: t.s, at: t.clock.now }],
        } satisfies Built;
      },
    },
  ];
}
