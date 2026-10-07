// What the co-op screens say: a reveal's result for the team (you first, the
// rest by name, a loss read by what it did), your own wrong answer, a find's
// note for the team, and the end screen's lines.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coopMissText, coopRevealText, delverText, lossDepths, namesOf, teamFindNote, wardText } from '../src/lib/difficultyText.ts';

const NAMES: Record<string, string> = { a: 'Ash', b: 'Brea', c: 'Cara', me: 'Me' };
const nameOf = (id: string) => NAMES[id];
const hit = (playerId: string, lives = 1, wards = 0, timedOut = false) => ({ playerId, lives, wards, timedOut });

// `left`: lives now by player, 2 when not given, null for one who has left the room.
function says(o: Partial<Parameters<typeof coopRevealText>[0]> & { left?: Record<string, number | null> }) {
  const left = o.left ?? {};
  return coopRevealText({ depth: 12, winner: null, timedOut: false, caveIn: false, hits: [], nameOf, me: 'me', ...o, left: (id) => (id in left ? left[id] : 2) }).join(' ');
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
    "Time's up; nobody found it. Ash picked wrong. The darkness took you for good.",
  );
});

test('a ward taking a loss reads as protection, alone as together', () => {
  assert.equal(wardText('your'), 'Your ward took the hit.');
  assert.equal(wardText("Ash's"), "Ash's ward took the hit.");
  assert.equal(wardText('your', 2), 'Your two wards took both hits.');
});

test('wards, cave-ins and the perished read plainly, and briefly', () => {
  assert.equal(says({ hits: [hit('a', 0, 1)] }), "Every answer was wrong. Ash's ward took the hit.");
  assert.equal(says({ hits: [hit('a', 0, 1), hit('me', 0, 1)] }), 'Every answer was wrong. Wards took the hits for you and Ash.');
  assert.equal(
    says({ caveIn: true, hits: [hit('a', 2), hit('b', 1, 1)], left: { a: 1, b: 2 } }),
    "Every answer was wrong. The vein caved in on Ash and Brea. Brea's ward broke, and a life with it. Ash loses two lives.",
  );
  assert.equal(says({ caveIn: true, winner: 'b', hits: [hit('me', 0, 2)] }), 'Brea cleared it. The vein caved in on you. Your two wards took both hits.');
  assert.equal(says({ hits: [hit('a'), hit('b')], left: { a: 0, b: 0 } }), 'Every answer was wrong. Ash and Brea perish.');
  assert.equal(says({ hits: [hit('me')], left: { me: 0 } }), 'Every answer was wrong. You perish.');
  // Never what the screen already shows: lives left, the depth.
  for (const t of [says({ winner: 'a', hits: [hit('me')], left: { me: 1 } }), says({ caveIn: true, hits: [hit('a', 2)], left: { a: 1 } })])
    assert.doesNotMatch(t, /left|depth|\d/, t);
});

test('a perishing is said with what caused it, once', () => {
  assert.equal(says({ winner: 'b', hits: [hit('a')], left: { a: 0 } }), 'Brea cleared it. Ash picked wrong and perishes.');
  assert.equal(says({ winner: 'b', hits: [hit('me'), hit('a')], left: { me: 0, a: 0 } }), 'Brea cleared it. You and Ash picked wrong and perish.');
  // Only some of those who picked wrong perished: said apart.
  assert.equal(says({ winner: 'b', hits: [hit('me'), hit('a')], left: { me: 2, a: 0 } }), 'Brea cleared it. You and Ash picked wrong. Ash perishes.');
  assert.equal(says({ timedOut: true, hits: [hit('a', 1, 0, true)], left: { a: 0 } }), "Time's up; nobody found it. The darkness took Ash for good.");
});

test('one who picked wrong and then left the room is neither named nor said to perish', () => {
  // Their seat is gone, so their lives read 0 and their name '?': nothing is said of them.
  assert.equal(says({ winner: 'b', hits: [hit('x')], left: { x: null } }), 'Brea cleared it.');
  assert.equal(says({ winner: 'b', hits: [hit('a'), hit('x')], left: { a: 0, x: null } }), 'Brea cleared it. Ash picked wrong and perishes.');
  assert.equal(says({ timedOut: true, hits: [hit('x'), hit('me', 1, 0, true)], left: { x: null, me: 1 } }), "Time's up; nobody found it. The darkness took you.");
  assert.equal(says({ caveIn: true, hits: [hit('x', 2), hit('a', 2)], left: { x: null, a: 1 } }), 'Every answer was wrong. The vein caved in on Ash. Ash loses two lives.');
  assert.equal(says({ hits: [{ ...hit('x'), blown: 'flares' }], left: { x: null } }), 'Every answer was wrong.');
});

test("a find's gain is said with who cleared it, or who it went to", () => {
  assert.equal(says({ winner: 'a', gain: { kind: 'flares', by: 'a' } }), 'Ash cleared it and found a flare.');
  assert.equal(says({ winner: 'me', gain: { kind: 'wards', by: 'me' } }), 'You cleared it and mined an Azurite Ward.');
  assert.equal(says({ winner: 'a', gain: { kind: 'shards', by: 'a', slow: true } }), 'Ash cleared it and mined a shard, too slow for a ward.');
  assert.equal(says({ winner: 'b', gain: { kind: 'flares', by: 'a' } }), 'Brea cleared it; the flare went to Ash.');
  assert.equal(says({ winner: 'b', gain: { kind: 'dynamite', by: 'me' } }), 'Brea cleared it; the dynamite went to you.');
  assert.equal(says({ winner: 'b', gain: { kind: 'wards', by: 'a', forged: true } }), "Brea cleared it; Ash's two shards forged an Azurite Ward.");
});

test("a Dynamite Cache's blast says what it destroyed of each pack, after the losses", () => {
  const blown = (playerId: string, item: 'wards' | 'shards' | 'flares' | 'dynamite', timedOut = false) => ({ ...hit(playerId, 1, 0, timedOut), blown: item });
  assert.equal(says({ winner: 'b', hits: [blown('me', 'flares')], left: { me: 2 } }), 'Brea cleared it. You picked wrong. The blast destroyed your flare.');
  assert.equal(
    says({ timedOut: true, hits: [blown('a', 'shards'), blown('c', 'wards', true)] }),
    "Time's up; nobody found it. Ash picked wrong. The darkness took Cara. The blast destroyed Ash's shard and Cara's ward.",
  );
  // Nothing for one who perished: their pack went with them.
  assert.equal(says({ hits: [blown('a', 'dynamite')], left: { a: 0 } }), 'Every answer was wrong. Ash perishes.');
});

test('your own wrong answer, while the team answers on', () => {
  assert.equal(coopMissText({ lives: 1, wards: 0 }, 2, false), 'Wrong.');
  assert.equal(coopMissText({ lives: 1, wards: 0, blown: 'flares' }, 2, false), 'Wrong. The blast destroyed your flare.');
  assert.equal(coopMissText({ lives: 0, wards: 1, blown: 'dynamite' }, 3, false), 'Wrong; your ward took the hit. The blast destroyed your dynamite.');
  assert.equal(coopMissText({ lives: 0, wards: 1 }, 3, false), 'Wrong; your ward took the hit.');
  assert.equal(coopMissText({ lives: 2, wards: 0 }, 1, true), 'Wrong; the vein caved in.');
  assert.equal(coopMissText({ lives: 1, wards: 0 }, 0, false), 'You perished; your team can still clear it.');
});

test("a find's note for the team says what it does for all, and what stays unused", () => {
  assert.equal(teamFindNote('flare', false), 'It adds five seconds for everyone when time runs out. You get less time to answer.');
  assert.match(teamFindNote('azurite', true), /\. A miss costs two lives\. Flares and dynamite can't be used on it\.$/);
});

test('the end screen: lives lost at a cave-in counted once, and what each delver gave', () => {
  assert.equal(lossDepths([3, 3, 4]), 'depths 3 (two lives) and 4');
  assert.equal(lossDepths([2, 7, 9]), 'depths 2, 7 and 9');
  assert.equal(lossDepths([5, 5]), 'depth 5 (two lives)');
  assert.equal(delverText({ losses: [1, 4, 4, 9], given: 1, revived: 2 }), 'Lost 4 lives, gave 1 life, brought back twice');
  assert.equal(delverText({ losses: [], given: 2, revived: 0 }), 'No life lost, gave 2 lives');
});
