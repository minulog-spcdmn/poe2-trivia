// In a game: each kind's moments (a category to pick, a question with its
// clock running, the answer shown, right and wrong), played through the
// engine to there, from the seat whose turn it is and from one watching it.
// Delve alone and together, deeper down too, with finds among the cards and a
// vein's dig.

import { MAX_PLAYERS, PRESETS, TALL_ART_GROUPS, type Knobs, type Settings } from '../../lib/game.ts';
import { WAY_OUT } from '../../lib/delve.ts';
import type { Control, Values } from '../bench.ts';
import { longestNamed, longestWord } from '../build/engine.ts';
import { pid } from '../build/people.ts';
import { Table } from '../build/play.ts';
import type { Built, Scene, Seat } from '../scene.ts';

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
const BLOWS: Control = {
  kind: 'choice',
  key: 'blow',
  label: 'What happens',
  default: 'blast',
  options: [
    { value: 'blast', label: 'Dynamite goes off' },
    { value: 'miss', label: 'A miss' },
    { value: 'ward', label: 'A ward takes a miss' },
  ],
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

export function gameScenes(): Scene[] {
  // Take turns: Doryani's turn first (the seed's, with three), Kalguur hosting.
  const turns = (v: Values) => table(seated(v, 3), asked(v)).start();
  const race = (v: Values) => table(seated(v, 5), { mode: 'race', ...asked(v) }).start();
  const delveAlone = () => table(['Kalguur'], { mode: 'delve' }, { host: null }).start();
  const delveTogether = (v: Values) => table(seated(v, 3), { mode: 'delve' }).start();
  const turnsSeats = [guest('Doryani'), host('Kalguur'), WATCHER];
  // Una of the Vaal is in every take-turns scene's moves; the race's answer Doryani's and hers.
  const many = { controls: [players(3, 3)] };
  // A question's scenes: its answers too.
  const manyAsked = { controls: [players(3, 3), ...ANSWERS] };
  const crowdAsked = { controls: [players(3, 5), ...ANSWERS] };
  return [
    scene('turns-choosing', 'Take turns', 'Picking a category', turnsSeats, turns, many),
    scene('turns-question', 'Take turns', 'A question, its clock running', turnsSeats, (v) => turns(v).pick(), manyAsked),
    scene(
      'turns-right',
      'Take turns',
      'Answered right',
      turnsSeats,
      (v) => {
        const t = turns(v).pick();
        return t.answer(t.turn, true);
      },
      manyAsked,
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
    scene('turns-late', 'Take turns', 'Late in a game: scores near the target', turnsSeats, (v) => turns(v).playTo((s) => s.round >= 7 && s.phase === 'choosing', (name, round) => name !== 'Una of the Vaal' || round % 2 === 0), many),
    scene('turns-offline', 'Take turns', 'Una of the Vaal went offline', turnsSeats, (v) => turns(v).act({ type: 'connection', playerId: pid('Una of the Vaal'), connected: false }, null), many),
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
    scene('deathmatch', 'Deathmatch', 'A tie at the target: the deathmatch', [host('Kalguur'), guest('Doryani'), WATCHER], () =>
      table(['Kalguur', 'Doryani'], { targetScore: 1 })
        .start()
        .playTo((s) => !!s.deathmatch),
    ),
    scene('delve-cards', 'Delve alone', 'The cards dealt', [ALONE], delveAlone),
    scene('delve-finds', 'Delve alone', 'The cards dealt: an Azurite Vein and a Flare Cache among them', [ALONE], () => {
      const t = delveAlone();
      const [vein, , flare] = t.s.offered;
      t.s.delve!.finds = [
        { category: vein, kind: 'azurite' },
        { category: flare, kind: 'flare' },
      ];
      return t;
    }),
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
    {
      ...scene('delve-blow', 'Delve alone', 'Played on from a question: dynamite going off, a miss, or a ward taking it', [ALONE], delveAlone),
      controls: [BLOWS],
      states: [
        { label: 'Dynamite goes off', values: {} },
        { label: 'A miss costs a life', values: { blow: 'miss' } },
        { label: 'A ward takes the miss', values: { blow: 'ward' } },
      ],
      build: (v = {}) => {
        // Kalguur holds what the blow takes: a stick of dynamite, or a ward.
        const blow = String(v.blow ?? 'blast');
        const t = delveAlone();
        const me = pid('Kalguur');
        t.s = { ...t.s, delve: { ...t.s.delve!, inventory: { [me]: { wards: blow === 'ward' ? 1 : 0, flares: 0, dynamite: blow === 'blast' ? 1 : 0 } } } };
        t.pick();
        const shown = t.s;
        const at = t.clock.now + INTO;
        if (blow === 'blast') t.wait(INTO + BLOW_AFTER).act({ type: 'blast', askedAt: t.q.askedAt }, null);
        else t.answer(null, false, INTO + BLOW_AFTER);
        return { state: shown, act: t.room, at, steps: [{ wait: BLOW_AFTER }, { then: t.s, at: t.clock.now }] } satisfies Built;
      },
    },
    scene('delve-deep', 'Delve alone', 'Deep down', [ALONE], (v) => delveAlone().playTo((s) => s.round >= Number(v.depth ?? 30) && s.phase === 'choosing'), {
      controls: [{ kind: 'range', key: 'depth', label: 'Depth', min: 2, max: 120, default: 30 }],
    }),
    scene(
      'delve-together-cards',
      'Delve together',
      'The cards dealt, Doryani has voted',
      [host('Kalguur'), guest('Doryani'), WATCHER],
      (v) => {
        const t = delveTogether(v);
        return t.act({ type: 'vote', category: t.s.offered[1] }, 'Doryani');
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
  ];
}
