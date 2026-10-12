import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { delveRules, findRules, opensZone } from '../src/lib/delve.ts';
import { Engine, PRESETS, TWINS, allArt, createGame, isFake, type Difficulty, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { readLooks } from '../src/lib/looks.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));
const looks = readLooks(JSON.parse(readFileSync(new URL('../src/data/looks.json', import.meta.url), 'utf8')));
const byName = new Map(items.map((it) => [it.name, it]));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** The real items behind a question's options (a made-up name counts as none). */
const real = (q: Question) => q.options.filter((id) => !isFake(id));

/** The twin sets with more than one of their members on screen. */
const met = (q: Question) => TWINS.filter((t) => t.names.filter((n) => real(q).includes(byName.get(n)!.id)).length > 1);

/** The categories twins are in. */
const CATEGORIES = [...new Set(TWINS.map((t) => byName.get(t.names[0])!.category))];

/** Questions in each twin category played one after another, each answer used up, as in a game. */
function twinQuestions(settings: Partial<Settings>, seed: number, n = 1500): Question[] {
  const engine = new Engine(items, { rng: seeded(seed), fakes });
  return CATEGORIES.flatMap((category) => {
    const s = createGame(null, { targetScore: 5, timer: 0, mode: 'turns', public: false, locked: false, ...settings });
    return Array.from({ length: n }, () => {
      const q = engine.makeQuestion(s, category);
      s.used.push(q.itemId);
      return q;
    });
  });
}

test('twins come in with a zone, whose card says so', () => {
  for (const { names, depth } of TWINS) assert.ok(opensZone(depth), `${names} at ${depth}`);
});

/**
 * Pairs that could be twins and were looked at: their art is told apart at a
 * glance, so they are not. Each pair by name, in alphabetical order.
 */
const CHECKED: [string, string][] = [
  // Looked alike to the look-alike table (scripts/looks.mjs).
  ['Cloak of Defiance', 'Gloomform'],
  ["Cospri's Will", 'Perfidy'],
  ['Dionadair', 'Wulfsbane'],
  ['Icetomb', 'The Mutable Star'],
  ['Irongrasp', 'Kingsguard'],
  ["Kaom's Madness", "Uhtred's Augury"],
  ["Kaom's Madness", "Uhtred's Omen"],
  ['Kingsguard', "Voll's Protector"],
  ['Pragmatism', 'Reverie'],
  ['Silks of Veneration', 'Tabula Rasa'],
  // Named alike.
  ["Atziri's Allure", "Atziri's Communion"],
  ["Berek's Grip", 'Grip of Kulemak'],
  ['Black Sun Crest', 'The Black Insignia'],
  ['Cloak of Defiance', 'Cloak of Flame'],
  ['Crown of Eyes', 'Crown of the Pale King'],
  ['Crown of Eyes', 'Crown of the Victor'],
  ['Crown of Eyes', 'Crown of Thorns'],
  ['Crown of the Pale King', 'Crown of the Victor'],
  ['Crown of Thorns', 'Crown of the Pale King'],
  ['Crown of Thorns', 'Crown of the Victor'],
  ["Greed's Embrace", "Pariah's Embrace"],
  ['Guiding Palm of the Eye', 'Palm of the Dreamer'],
  ['Guiding Palm of the Heart', 'Palm of the Dreamer'],
  ['Guiding Palm of the Mind', 'Palm of the Dreamer'],
  ['Mask of the Sanguimancer', 'Mask of the Stitched Demon'],
  ['Mask of the Sanguimancer', 'The Hollow Mask'],
  ['Mask of the Stitched Demon', 'The Hollow Mask'],
  ['Sandstorm Visage', 'Visage of Ayah'],
  ['The Smiling Knight', 'The Vile Knight'],
];

/** How alike two items' art has to look to the table for a pair to be looked at. */
const ALIKE = 0.86;

test('every item that could have a twin was looked at: new items, new art', () => {
  // The table is what finds look-alikes, so every picture needs to be in it (each of an item's variants too).
  const missing = items.flatMap(allArt).filter((a) => !looks.looksLike(a.art).length).map((a) => `${a.name} (${a.base})`);
  assert.deepEqual(missing, [], 'rebuild the look-alike table (README, "npm run looks")');
  /** A name's longer words, "'s" taken off. */
  const words = (n: string) => new Set(n.toLowerCase().replace(/'s\b/g, '').replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 3));
  const twins = (a: string, b: string) => TWINS.some((t) => t.names.includes(a) && t.names.includes(b));
  const checked = new Set(CHECKED.map((pair) => pair.join('|')));
  const unchecked: string[] = [];
  for (const a of items) {
    for (const b of items) {
      // Tablets all look alike, but only ever meet each other (game.ts RARE_GROUPS).
      if (a.name >= b.name || a.group !== b.group || a.group === 'Tablets' || twins(a.name, b.name)) continue;
      // Any of one's pictures against any of the other's: a question may show any of them.
      const pictures = allArt(a).some((x) => allArt(b).some((y) => looks.lookScore(x.art, y.art) >= ALIKE));
      const alike = pictures || [...words(a.name)].some((w) => words(b.name).has(w));
      if (alike && !checked.has(`${a.name}|${b.name}`)) unchecked.push(`${a.name} / ${b.name}`);
    }
  }
  // Look at their art: only a detail tells them apart → a set in game.ts TWINS; else → CHECKED.
  assert.deepEqual(unchecked, [], 'look-alikes nobody has looked at yet');
  for (const pair of CHECKED) for (const name of pair) assert.ok(byName.has(name), `${name} (CHECKED) is an item`);
});

test('every twin is a real item, each set from one group', () => {
  for (const { names } of TWINS) {
    const set = names.map((n) => byName.get(n));
    assert.ok(set.every(Boolean), `${names} are items`);
    assert.equal(new Set(set.map((it) => it!.group)).size, 1, `${names} share a group`);
  }
});

for (const difficulty of ['cruel', 'merciless'] as Difficulty[]) {
  test(`on ${difficulty}, twins never meet, yet each comes up as the answer and as a wrong option`, () => {
    const qs = twinQuestions({ difficulty }, 3);
    for (const q of qs) assert.deepEqual(met(q), [], `${met(q).map((t) => t.names)} met`);
    for (const { names } of TWINS) {
      for (const name of names) {
        const id = byName.get(name)!.id;
        assert.ok(qs.some((q) => q.itemId === id), `${name} is asked`);
        // Shown beside someone else's answer, so seeing one says nothing.
        assert.ok(qs.some((q) => q.itemId !== id && real(q).includes(id)), `${name} is a wrong option`);
      }
    }
  });
}

test('custom keeps twins apart until every wrong answer is a look-alike', () => {
  const half = twinQuestions({ difficulty: 'custom', custom: { ...PRESETS.eternal, similarNames: 0.5 } }, 4);
  assert.ok(half.every((q) => !met(q).length), 'half look-alikes: apart');
  const all = twinQuestions({ difficulty: 'custom', custom: { ...PRESETS.merciless, similarNames: 1 } }, 4);
  assert.ok(all.some((q) => met(q).length), 'all look-alikes: they meet');
});

test('on Eternal, every set of twins meets, but those told apart by colour alone never in grayscale', () => {
  const qs = twinQuestions({ difficulty: 'eternal' }, 5);
  for (const { names } of TWINS) {
    assert.ok(qs.some((q) => met(q).some((t) => t.names === names)), `${names} meet`);
  }
  // Eternal shows "find the art" pictures in grayscale, so those meet in name questions only.
  for (const q of qs) if (q.mode === 'art') assert.ok(!met(q).some((t) => t.colour), `${met(q).map((t) => t.names)} met in grayscale`);
  const gray = twinQuestions({ difficulty: 'custom', custom: { ...PRESETS.eternal, grayscale: 'all' } }, 5);
  assert.ok(gray.every((q) => !met(q).some((t) => t.colour)), 'never with all art in grayscale');
  assert.ok(gray.some((q) => met(q).some((t) => !t.colour)), 'the others still meet');
});

test('with twins sitting out, a question that mixes groups still shows each as often as the others', () => {
  // Eternal turns a name question with no room for its made-up names into a
  // picture one, whose art is in grayscale: it is counted with the Guiding
  // Palms apart, as it is dealt.
  for (const settings of [{ difficulty: 'eternal' }, { difficulty: 'merciless' }] as Partial<Settings>[]) {
    for (const q of twinQuestions(settings, 8)) {
      const counts = new Map<string, number>();
      for (const id of q.options) {
        const group = items.find((it) => it.id === (isFake(id) ? id.split(':')[1] : id))!.group;
        counts.set(group, (counts.get(group) ?? 0) + 1);
      }
      assert.equal(new Set(counts.values()).size, 1, `${q.category}: ${[...counts]}`);
    }
  }
});

test('in Delve, twins meet from their depth on (a find from its deeper one)', () => {
  const engine = new Engine(items, { rng: seeded(6), fakes, looks });
  let base = createGame(null, { targetScore: 10, timer: 0, difficulty: 'eternal', mode: 'delve', public: false, locked: false });
  base = engine.apply(base, { type: 'join', playerId: 'p0', name: 'Ash' }, null);
  base = engine.apply(base, { type: 'start' }, null);
  /** Which sets met at `depth`, over a fresh pool each question. */
  const meetsAt = (depth: number) => {
    const seen = new Set<string>();
    for (const category of CATEGORIES) {
      for (let i = 0; i < 600; i++) {
        const s: GameState = structuredClone(base);
        s.round = depth;
        const q = engine.makeQuestion(s, category);
        if (q.gray) assert.ok(!met(q).some((t) => t.colour), `${met(q).map((t) => t.names)} met in grayscale at ${depth}`);
        for (const t of met(q)) seen.add(t.names[0]);
      }
    }
    return seen;
  };
  for (const { names, depth } of TWINS) {
    assert.ok(!meetsAt(depth - 1).has(names[0]), `${names} apart above ${depth}`);
    assert.ok(meetsAt(depth).has(names[0]), `${names} meet at ${depth}`);
  }
  assert.equal(delveRules(30).twins, 30);
  assert.ok(findRules('flare', 30).twins! > 30, 'a find plays a deeper depth');
});
