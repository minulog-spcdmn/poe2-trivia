import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOCK_PEAK,
  FLARE_RECEDE_MS,
  OVERSHOOT,
  SWALLOW,
  claimPressure,
  endHold,
  flareEase,
  flarePressure,
  pressing,
  pressureLevel,
  pressureOf,
  resolution,
  resolutionMs,
  resolveDark,
  setPressure,
  strength,
  type DarkOutcome,
} from '../src/lib/darkness.ts';
import { darkOutcome } from '../src/lib/delveSession.ts';
import { createGame, type GameState, type Hit, type Reveal } from '../src/lib/game.ts';

test("the dark comes in with a question's clock: faint while there is time, closing in over the last seconds", () => {
  const span = 20000;
  let last = -1;
  for (let left = span; left >= 0; left -= 100) {
    const p = pressureOf(left, span, 5);
    assert.ok(p >= last && p >= 0 && p <= 1, `${p} with ${left} ms left`);
    last = p;
  }
  assert.equal(pressureOf(span, span), 0);
  assert.equal(pressureOf(0, span), 1);
  assert.ok(pressureOf(span / 2, span) < 0.25, 'subtle half way');
  assert.ok(pressureOf(3000, span) > 0.5, 'clearly felt in the last seconds');
  // A flare's extra time takes it back; nonsense gives none.
  assert.equal(pressureOf(span + 5000, span), 0);
  assert.equal(pressureOf(1000, 0), 0);
});

test('it eases in and lifts by itself, and only the latest ring drives it', () => {
  setPressure(0);
  let now = 0;
  const settle = () => {
    for (let i = 0; i < 300; i++) pressureLevel((now += 16));
    return pressureLevel(now);
  };
  settle();
  assert.equal(pressing(), false);
  const a = claimPressure();
  a.set(0.8);
  assert.ok(pressureLevel((now += 16)) < 0.8, 'no jump');
  assert.equal(settle(), strength(0.8));
  // A new question's ring takes over; the old one fading out no longer moves it, nor clears it.
  const b = claimPressure();
  b.set(0.1);
  a.set(1);
  a.release();
  assert.equal(settle(), strength(0.1));
  // The question ends: the dark lifts, over a second or so.
  b.set(1);
  settle();
  b.release();
  const lifting = [500, 1000, 2500].map((ms) => {
    const start = now;
    while (now < start + ms) pressureLevel((now += 16));
    return pressureLevel(now);
  });
  assert.ok(lifting[0] > 0.1 && lifting[0] < 0.7, `half a second on: ${lifting[0]}`);
  assert.equal(lifting[2], 0);
  assert.equal(pressing(), false);
  b.set(0.5);
  assert.equal(pressing(), false, 'a released ring moves nothing');
});

test("a flare's light holds the dark back as it catches, and it seeps back in as the flare burns down", () => {
  let last = -1;
  for (let left = 1; left >= 0; left -= 0.01) {
    const p = flarePressure(left);
    assert.ok(p >= last && p > 0 && p <= 1, `${p} with ${left} left`);
    last = p;
  }
  assert.ok(flarePressure(1) <= 0.15, 'pushed far back as it catches');
  assert.ok(flarePressure(0.5) < 0.4, 'still held back half way');
  assert.equal(flarePressure(0), 1);
  assert.equal(flarePressure(-1), 1);
});

test('as a flare catches the dark holds, then draws back smoothly, never in a jump', () => {
  const held = 1;
  const to = flarePressure(1);
  assert.equal(flareEase(held, to, 0), held, 'held as its light blooms');
  assert.equal(flareEase(held, to, FLARE_RECEDE_MS), to);
  assert.equal(flareEase(held, to, 10 * FLARE_RECEDE_MS), to);
  let last = held;
  for (let ms = 0; ms <= FLARE_RECEDE_MS; ms += 16) {
    const p = flareEase(held, to, ms);
    assert.ok(p <= last && last - p < 0.06, `${p} at ${ms} ms`);
    last = p;
  }
});

test('a loop waking after a long sleep eases from where the dark was', () => {
  const a = claimPressure();
  let now = 100000;
  pressureLevel(now);
  a.set(1);
  // (Nothing drew it for a long while.)
  now += 60000;
  assert.ok(pressureLevel(now) < 0.5, 'no jump');
  a.release();
  for (let i = 0; i < 400; i++) pressureLevel((now += 16));
});

test('the dark runs much deeper over the clock\'s last seconds, and is much as it was while there is time', () => {
  assert.equal(strength(0), 0);
  assert.equal(strength(1), CLOCK_PEAK);
  assert.ok(CLOCK_PEAK >= 1.4 && SWALLOW > CLOCK_PEAK, 'a miss swallows more than the clock does');
  // (The backdrop dims the scene by 0.35 for each 1: past about 2.8 it would go negative.)
  assert.ok(SWALLOW <= 2.2);
  assert.ok(strength(0.25) < 0.27, 'still subtle early on');
  let last = 0;
  for (let v = 0; v <= 1; v += 0.01) {
    const d = strength(v);
    assert.ok(d >= last && d - last < 0.03, `${d} at ${v}`);
    last = d;
  }
  assert.equal(strength(2), CLOCK_PEAK, 'nonsense is held in range');
});

/** The resolution every 16 ms (a frame) from `from` until it has settled, and after. */
function frames(kind: DarkOutcome, from: number, gentle = false, hold?: number): number[] {
  const end = resolutionMs(kind, gentle, hold);
  const out: number[] = [];
  for (let t = 0; t <= end + 64; t += 16) out.push(resolution(kind, from, t, gentle, hold));
  return out;
}
/** The first frame (ms) from which it stays under `v`. */
const under = (vs: number[], v: number) => 16 * (vs.length - [...vs].reverse().findIndex((x) => x >= v));

const KINDS: DarkOutcome[] = ['right', 'miss', 'ward', 'perish'];

test('every outcome starts where the dark was, ends at 0 and never jumps on the way', () => {
  for (const gentle of [false, true]) {
    for (const kind of KINDS) {
      for (const from of [0, 0.3, 1, CLOCK_PEAK]) {
        const vs = frames(kind, from, gentle);
        assert.equal(vs[0], from, `${kind} starts where it was`);
        assert.equal(vs.at(-1), 0, `${kind} settles`);
        for (let i = 1; i < vs.length; i++) {
          // (A surge comes in fast, a frame at a time: a big change, but no jump.)
          assert.ok(Math.abs(vs[i] - vs[i - 1]) < 0.25, `${kind}${gentle ? ' (gentle)' : ''} from ${from}: ${vs[i - 1]} to ${vs[i]} at ${16 * i} ms`);
          assert.ok(vs[i] >= -OVERSHOOT && vs[i] <= SWALLOW, `${kind} in range: ${vs[i]}`);
        }
      }
    }
  }
});

test('a right answer drives the dark back fast, with a moment brighter than before, and no jump', () => {
  const vs = frames('right', CLOCK_PEAK);
  for (let i = 1; i < vs.length; i++) assert.ok(Math.abs(vs[i] - vs[i - 1]) < 0.08, `smooth at ${16 * i} ms: ${vs[i]}`);
  // Down, never back up into the dark.
  for (let i = 1; i < 600 / 16; i++) assert.ok(vs[i] <= vs[i - 1], `receding at ${16 * i} ms`);
  const gone = 16 * vs.findIndex((v) => v <= 0);
  assert.ok(gone >= 450 && gone <= 800, `the dark gone in ${gone} ms`);
  assert.ok(Math.min(...vs) < -0.1, 'the light overshoots, a touch brighter than the scene');
  assert.ok(resolutionMs('right') <= 1100, 'and settles soon');
  // Held still: as quick, but with no overshoot.
  const still = frames('right', CLOCK_PEAK, true);
  assert.ok(Math.min(...still) >= 0, 'no overshoot held still');
  assert.ok(resolutionMs('right', true) < resolutionMs('right'));
});

test('a miss surges in to swallow the scene, holds a beat, and lets go slowly', () => {
  const vs = frames('miss', 0.6);
  const peakAt = 16 * vs.findIndex((v) => v >= SWALLOW - 0.01);
  assert.ok(peakAt > 0 && peakAt <= 320, `swallowed in ${peakAt} ms`);
  const held = 16 * vs.filter((v) => v >= SWALLOW - 0.05).length;
  assert.ok(held >= 400 && held <= 750, `held at its fullest ${held} ms`);
  // Slow and reluctant: still most of the way in well after the peak, gone only after more than a second and a half.
  const lettingGo = 300 + 250;
  assert.ok(resolution('miss', 0.6, lettingGo + 500) > 0.7 * SWALLOW, 'lingers as it starts to let go');
  const gone = under(vs, 0.05);
  assert.ok(gone - lettingGo >= 1500 && gone - lettingGo <= 2100, `receding over ${gone - lettingGo} ms`);
  for (let i = Math.ceil(lettingGo / 16); i < vs.length; i++) assert.ok(vs[i] <= vs[i - 1], 'it only ever lets go');
  // Held still: a shallower surge, sooner gone.
  const still = frames('miss', 0.6, true);
  assert.ok(Math.max(...still) < SWALLOW && Math.max(...still) > CLOCK_PEAK);
  assert.ok(resolutionMs('miss', true) < resolutionMs('miss'));
});

test('a ward takes the loss: the dark surges, then is pushed back much sooner than a miss', () => {
  const ward = frames('ward', 1);
  const miss = frames('miss', 1);
  assert.ok(Math.max(...ward) > CLOCK_PEAK, 'it surges');
  assert.ok(under(ward, 0.05) + 600 < under(miss, 0.05), `rescued at ${under(ward, 0.05)} ms, a miss at ${under(miss, 0.05)}`);
  assert.ok(under(ward, 1) + 400 < under(miss, 1), 'pushed back sooner');
  assert.ok(resolutionMs('ward', true) <= resolutionMs('ward'));
});

test('the last life lost holds the dark until it is let go, then it recedes slowly', () => {
  const at = (t: number, hold?: number) => resolution('perish', 1, t, false, hold);
  assert.equal(resolutionMs('perish', false, Infinity), Infinity);
  assert.equal(at(60_000, Infinity), SWALLOW, 'held while the reveal lasts');
  // Let go 3 s after it surged: from there it recedes, over a couple of seconds.
  const hold = 3000;
  assert.equal(at(300 + hold, hold), SWALLOW);
  assert.ok(at(300 + hold + 600, hold) > 1.5);
  assert.equal(at(resolutionMs('perish', false, hold), hold), 0);
  // Let go at once: it still holds a while longer than a miss.
  assert.ok(resolutionMs('perish', false, 0) > resolutionMs('miss'));
  const vs = frames('perish', 1, false, hold);
  for (let i = 1; i < vs.length; i++) assert.ok(Math.abs(vs[i] - vs[i - 1]) < 0.25);
});

test('the dark as drawn settles as the question went, and the next clock comes in over what is left', () => {
  let now = 1_000_000;
  const settle = (ms: number) => {
    const end = now + ms;
    while (now < end) pressureLevel((now += 16));
    return pressureLevel(now);
  };
  settle(5000);
  const a = claimPressure();
  a.set(1);
  const before = settle(3000);
  assert.ok(Math.abs(before - CLOCK_PEAK) < 0.01);
  // Right: no jump as it starts, gone soon, and nothing left.
  resolveDark('right', false, now);
  a.release();
  assert.ok(Math.abs(pressureLevel((now += 16)) - before) < 0.06, 'no jump');
  assert.ok(settle(700) < 0.05);
  assert.equal(settle(1000), 0);
  assert.equal(pressing(), false);

  // A miss: swallowed, then let go; a new question's clock starting meanwhile comes in on top.
  const b = claimPressure();
  b.set(0.7);
  settle(3000);
  resolveDark('miss', false, now);
  b.release();
  assert.equal(pressing(), true);
  assert.ok(settle(500) > 1.9, 'swallowed');
  const c = claimPressure();
  c.set(0.05);
  const later = settle(1200);
  assert.ok(later > 0.5, `letting go slowly: ${later}`);
  assert.ok(Math.abs(settle(3000) - strength(0.05)) < 0.01, 'the new clock where it is');
  c.release();
  settle(4000);

  // A perish holds until let go.
  const d = claimPressure();
  d.set(1);
  settle(2000);
  resolveDark('perish', false, now);
  d.release();
  assert.ok(settle(10_000) >= SWALLOW - 0.001, 'held');
  endHold(now);
  assert.ok(settle(500) > 1.5, 'reluctant');
  assert.equal(settle(3000), 0);
  assert.equal(pressing(), false);
  endHold(now);
});

// ---- whose outcome ----

function delveRun(ids: string[]): GameState {
  const s = createGame(ids[0]);
  s.players = ids.map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.phase = 'reveal';
  s.round = 4;
  s.delve = { entrants: ids, losses: {}, ruleset: 1, startedAt: 5, excused: [], graceUntil: 0, votes: {}, voteFrom: null, missed: {}, revives: [] };
  return s;
}
const reveal = (over: Partial<Reveal>): Reveal => ({
  correctId: 'x',
  chosenId: null,
  correctIndex: 0,
  chosenIndex: null,
  correct: false,
  timedOut: false,
  winnerId: null,
  ...over,
});
const hit = (playerId: string, lives: number, wards = 0): Hit => ({ playerId, lives, wards, timedOut: false });

test('alone: the answer itself settles the dark; a ward rescues, the last life holds it', () => {
  const s = delveRun(['a']);
  assert.equal(darkOutcome({ ...s, phase: 'question', reveal: null }, 'a'), null);
  assert.equal(darkOutcome({ ...s, reveal: reveal({ correct: true }) }, 'a'), 'right');
  assert.equal(darkOutcome({ ...s, reveal: reveal({ timedOut: true }) }, 'a'), 'miss');
  assert.equal(darkOutcome({ ...s, reveal: reveal({ warded: true }) }, 'a'), 'ward');
  const fell = { ...s, reveal: reveal({}), delve: { ...s.delve!, losses: { a: [1, 2, 4] } } };
  assert.equal(darkOutcome(fell, 'a'), 'perish');
  assert.equal(darkOutcome(fell, null), 'perish', 'a spectator sees the same');
});

test('together: your own outcome, or with no answer of yours the team\'s', () => {
  const s = delveRun(['a', 'b', 'c']);
  const cleared = { ...s, reveal: reveal({ correct: true, winnerId: 'b', hits: [hit('a', 1)] }) };
  assert.equal(darkOutcome(cleared, 'b'), 'right');
  assert.equal(darkOutcome(cleared, 'a'), 'miss', 'your wrong pick, though the team cleared it');
  assert.equal(darkOutcome(cleared, 'c'), 'right', 'no answer of yours: the team cleared it');
  assert.equal(darkOutcome(cleared, 'z'), 'right', 'a spectator follows the team');
  assert.equal(darkOutcome(cleared, null), 'right');
  const timedOut = { ...s, reveal: reveal({ timedOut: true, hits: [hit('a', 0, 1), hit('b', 1)] }) };
  assert.equal(darkOutcome(timedOut, 'a'), 'ward', 'your ward took it');
  assert.equal(darkOutcome(timedOut, 'b'), 'miss');
  assert.equal(darkOutcome(timedOut, 'c'), 'miss', 'perished or watching: the team missed');
  // Your last life: it holds; the whole team fallen holds for those watching too.
  const fell = { ...timedOut, delve: { ...s.delve!, losses: { b: [1, 2, 4] } } };
  assert.equal(darkOutcome(fell, 'b'), 'perish');
  assert.equal(darkOutcome(fell, 'c'), 'miss', 'the run goes on');
  const allFell = { ...fell, delve: { ...s.delve!, losses: { a: [1, 2, 4], b: [1, 2, 4], c: [2, 3, 4] } } };
  assert.equal(darkOutcome(allFell, 'z'), 'perish');
});
