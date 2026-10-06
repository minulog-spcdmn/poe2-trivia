// What the co-op screens say: a reveal's result for the team (you first, the
// rest by name, a loss read by what it did), your own wrong answer, a find's
// note for the team, and the end screen's lines.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coopMissText, coopRevealText, delverText, lossDepths, namesOf, teamFindNote } from '../src/lib/difficultyText.ts';

const NAMES: Record<string, string> = { a: 'Ash', b: 'Brea', c: 'Cara', me: 'Me' };
const nameOf = (id: string) => NAMES[id];
const hit = (playerId: string, lives = 1, wards = 0, timedOut = false) => ({ playerId, lives, wards, timedOut });

function says(o: Partial<Parameters<typeof coopRevealText>[0]> & { left?: Record<string, number> }) {
  const left = o.left ?? {};
  return coopRevealText({ depth: 12, winner: null, timedOut: false, caveIn: false, hits: [], nameOf, me: 'me', ...o, left: (id) => left[id] ?? 2 }).join(' ');
}

test('names read you first, then the team as given', () => {
  assert.equal(namesOf(['a'], nameOf, 'me'), 'Ash');
  assert.equal(namesOf(['a', 'me'], nameOf, 'me'), 'you and Ash');
  assert.equal(namesOf(['a', 'b', 'c'], nameOf, null), 'Ash, Brea and Cara');
});

test('a cleared depth names who cleared it, and who picked wrong (a single life lost the phial shows)', () => {
  assert.equal(says({ winner: 'me' }), 'You cleared it.');
  assert.equal(says({ winner: 'a', hits: [hit('me')], left: { me: 2 } }), 'Ash cleared it. You picked wrong.');
  assert.equal(says({ winner: 'a', hits: [hit('b'), hit('c')] }), 'Ash cleared it. Brea and Cara picked wrong.');
});

test('the time-out: the darkness takes those who never answered', () => {
  assert.equal(says({ timedOut: true, hits: [hit('a', 1, 0, true), hit('b', 1, 0, true)] }), "Time's up; nobody found it. The darkness took Ash and Brea.");
  assert.equal(
    says({ timedOut: true, hits: [hit('a'), hit('me', 1, 0, true)], left: { a: 2, me: 0 } }),
    "Time's up; nobody found it. Ash picked wrong. The darkness took you. You perish.",
  );
});

test('wards, cave-ins and the perished read plainly, and briefly', () => {
  assert.equal(says({ hits: [hit('a', 0, 1)] }), "Every answer was wrong. Ash's ward shattered.");
  assert.equal(says({ hits: [hit('a', 0, 1), hit('me', 0, 1)] }), 'Every answer was wrong. Wards shattered for you and Ash.');
  assert.equal(
    says({ caveIn: true, hits: [hit('a', 2), hit('b', 1, 1)], left: { a: 1, b: 2 } }),
    "Every answer was wrong. The vein caved in on Ash and Brea. Brea's ward broke, and a life with it. Ash loses two lives.",
  );
  assert.equal(says({ caveIn: true, winner: 'b', hits: [hit('me', 0, 2)] }), 'Brea cleared it. The vein caved in on you. Your two wards broke.');
  assert.equal(says({ hits: [hit('a'), hit('b')], left: { a: 0, b: 0 } }), 'Every answer was wrong. Ash and Brea perish.');
  assert.equal(says({ hits: [hit('me')], left: { me: 0 } }), 'Every answer was wrong. You perish.');
  // Never what the screen already shows: lives left, the depth.
  for (const t of [says({ winner: 'a', hits: [hit('me')], left: { me: 1 } }), says({ caveIn: true, hits: [hit('a', 2)], left: { a: 1 } })])
    assert.doesNotMatch(t, /left|depth|\d/, t);
});

test('your own wrong answer, while the team answers on', () => {
  assert.equal(coopMissText({ lives: 1, wards: 0 }, 2, false), 'Wrong.');
  assert.equal(coopMissText({ lives: 0, wards: 1 }, 3, false), 'Wrong; your ward took it.');
  assert.equal(coopMissText({ lives: 2, wards: 0 }, 1, true), 'Wrong; the vein caved in.');
  assert.equal(coopMissText({ lives: 1, wards: 0 }, 0, false), 'You perished; your team can still clear it.');
});

test("a find's note for the team says who takes it, and what stays unused", () => {
  assert.equal(teamFindNote('flare', false), 'The first right answer takes it: five more seconds for everyone when the time runs out.');
  assert.match(teamFindNote('azurite', true), /A miss costs two lives\. Flares and dynamite stay unused on it\.$/);
});

test('the end screen: lives lost at a cave-in counted once, and what each delver gave', () => {
  assert.equal(lossDepths([3, 3, 4]), 'depths 3 (two lives) and 4');
  assert.equal(lossDepths([2, 7, 9]), 'depths 2, 7 and 9');
  assert.equal(lossDepths([5, 5]), 'depth 5 (two lives)');
  assert.equal(delverText({ losses: [1, 4, 4, 9], given: 1, revived: 2 }), 'Lost 4 lives, gave one life, brought back twice');
  assert.equal(delverText({ losses: [], given: 2, revived: 0 }), 'No life lost, gave two lives');
});
