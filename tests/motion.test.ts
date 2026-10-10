import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/botMotion.json' with { type: 'json' };
import { STEP, fitLead, frameOf, leadTrack, pickClick, pickStream, place, reachTrack, streamTrack, trackAt, within, type ClickStretch, type Stretch } from '../src/bot/motion.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const ALL = data.episodes as Stretch[];

test('the library has every kind of stretch, each one whole', () => {
  for (const kind of ['card', 'answer', 'next', 'wait', 'lobby']) assert.ok(ALL.some((e) => e.kind === kind), kind);
  for (const e of ALL) {
    if ('lead' in e) {
      assert.ok(e.lead.length % 2 === 0 && e.reach.length >= 4 && e.aim.length === 2 && e.hold > 0);
      assert.ok(['card', 'answer', 'next'].includes(e.kind));
    } else assert.ok(e.path.length >= 4 && e.path.length % 2 === 0);
  }
});

test('a lead is fitted to the time by its pauses, its moves kept as they were', () => {
  // Still, moving, still, moving: two pauses of 4 and 2 steps, moves of 3 steps.
  const pairs = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 30, 0, 40, 0];
  const moving = 4 * STEP;
  const long = fitLead(pairs, 3000);
  assert.ok(Math.abs(long.at(-1)! - 3000) < 1e-6 && long[0] === 0);
  // Each move takes its step, as recorded.
  for (const i of [5, 6, 7, 10]) assert.ok(Math.abs(long[i] - long[i - 1] - STEP) < 1e-6, `${i}`);
  // Shorter than its moves alone: no pauses, the moves quicker, and past two thirds of their time it begins partway in.
  const short = fitLead(pairs, moving * 0.5);
  assert.ok(Math.abs(short.at(-1)! - moving * 0.5) < 1e-6);
  assert.ok(short[0] < 0);
  // No pauses at all, and time to spare: it waits at the start.
  const going = [0, 0, 10, 0, 20, 0];
  assert.deepEqual(fitLead(going, 1000), [1000 - 2 * STEP, 1000 - STEP, 1000]);
});

test('a reach eases away from where the hand is and lands right on its pick', () => {
  const e = pickClick('answer', 2000, seeded(3))!;
  const from: [number, number] = [-300, 1200];
  const to: [number, number] = [640, 410];
  const r = reachTrack(e, from, to, 1000);
  assert.deepEqual(trackAt(r, 1000).slice(0, 2).map(Number).map(Math.round), from);
  assert.deepEqual(trackAt(r, r.t.at(-1)! + 50).slice(0, 2).map(Number).map(Math.round), to);
  const lead = leadTrack(e, from, 0, 5000);
  assert.deepEqual(trackAt(lead, 0).slice(0, 2).map(Number).map(Math.round), from);
  assert.ok(Math.abs(lead.t.at(-1)! - 5000) < 1e-6);
});

test("a stretch is picked by how long the bot takes, from the nearest few, so it isn't the same every time", () => {
  const rng = seeded(7);
  const lead = (e: ClickStretch) => (e.lead.length / 2 - 1) * STEP;
  const quick = Array.from({ length: 40 }, () => lead(pickClick('answer', 800, rng)!));
  const slow = Array.from({ length: 40 }, () => lead(pickClick('answer', 8000, rng)!));
  assert.ok(Math.max(...quick) < Math.min(...slow), `${Math.max(...quick)} ${Math.min(...slow)}`);
  assert.ok(new Set(quick).size > 2);
  // Not one used lately, while there are others.
  const used = new Set<Stretch>();
  for (let i = 0; i < 20; i++) {
    const e = pickClick('card', 2000, rng, undefined, used)!;
    assert.ok(!used.has(e));
    used.add(e);
  }
  // Pictures or names, as asked.
  for (let i = 0; i < 20; i++) assert.equal(pickClick('answer', 3000, rng, 'art')!.mode, 'art');
  const w = pickStream('wait', rng)!;
  const { track, presses } = streamTrack(w, [500, 500], 100);
  assert.ok(track.t[0] === 100 && presses.every((p) => p >= 100));
});

test('places go to and from a frame of thousandths, any frame', () => {
  const f = frameOf([[100, 200, 300, 400], [250, 380, 500, 600]])!;
  assert.deepEqual(f, [100, 200, 500, 600]);
  const p = place(250, 1100, f);
  assert.deepEqual(p, { x: 200, y: 640 });
  assert.deepEqual(within(p, f).map(Math.round), [250, 1100]);
  assert.equal(frameOf([]), null);
  // Beyond the frame, as far off it as where recorded, at this screen's scale: a frame recorded as wide in pixels as
  // it is here (400 units across, 576 px) lays a place 288 px past its right edge 200 units past it, whatever its own width.
  const g: [number, number, number, number] = [100, 200, 500, 600];
  const size: [number, number] = [576, 360];
  const off = place(1500, 500, g, size);
  assert.ok(Math.abs(off.x - 700) < 1e-6 && Math.abs(off.y - 400) < 1e-6, JSON.stringify(off));
  assert.deepEqual(within(off, g, size).map(Math.round), [1500, 500]);
  assert.deepEqual(within({ x: 50, y: 150 }, g, size).map((v) => Math.round(v)), [-125, -125]);
  assert.deepEqual(place(-125, -125, g, size), { x: 50, y: 150 });
});
