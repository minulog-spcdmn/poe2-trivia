import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retime } from '../src/qa/live/room.ts';

// Play from here picks a scene's room up now: its moments move on, nothing else does.
test("a room's moments move on by the scene's age, and nothing else", () => {
  const T = 1_760_000_000_000;
  const s = {
    startedAt: T,
    question: { askedAt: T + 1000, clockAt: T + 1500, itemId: 'x' },
    delve: { graceUntil: T + 9000, revives: [{ at: T + 2000, depth: 22 }], voteFrom: T + 3000 },
    recap: { items: [{ kind: 'dynamite', at: 15 }], answers: { p: { ms: 2400 } } },
    reveal: { at: T + 4000 },
    seed: 3_000_000_000_000,
  };
  const r = retime(s, 60_000);
  assert.equal(r.startedAt, T + 60_000);
  assert.equal(r.question.askedAt, T + 61_000);
  assert.equal(r.question.clockAt, T + 61_500);
  assert.equal(r.delve.graceUntil, T + 69_000);
  assert.equal(r.delve.revives[0].at, T + 62_000);
  assert.equal(r.delve.voteFrom, T + 63_000);
  assert.equal(r.reveal.at, T + 64_000);
  // A depth named `at`, a duration, a large number that isn't a moment by name: left alone.
  assert.equal(r.recap.items[0].at, 15);
  assert.equal(r.recap.answers.p.ms, 2400);
  assert.equal(r.seed, 3_000_000_000_000);
});
