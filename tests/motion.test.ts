import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/botMotion.json' with { type: 'json' };
import { STEP, fitLead, frameOf, leadTrack, pickClick, pickStream, place, reachTrack, steer, streamTrack, trackAt, waver, within, type ClickStretch, type Stretch } from '../src/bot/motion.ts';

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
    const e = pickClick('card', 2000, rng, { used })!;
    assert.ok(!used.has(e));
    used.add(e);
  }
  // Pictures or names, as asked.
  for (let i = 0; i < 20; i++) assert.equal(pickClick('answer', 3000, rng, { mode: 'art' })!.mode, 'art');
  // As many answers as asked, by preference.
  const six = Array.from({ length: 40 }, () => pickClick('answer', 3000, rng, { mode: 'name', n: 6 })!.n);
  assert.ok(six.filter((n) => n === 6).length > 30, JSON.stringify(six));
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
  // Beside the frame, the same share of the way to the screen's edge as on the screen recorded: a frame 1000 to 1500
  // across a 2500 wide room there, 400 to 600 across the bot's 1000 here; 2000 there (halfway to the edge) is 800 here.
  const src = [1000, 400, 1500, 900, 2500, 1300];
  const g2: [number, number, number, number] = [400, 300, 600, 700];
  const right = place(2000, 500, g2, src);
  assert.ok(Math.abs(right.x - 800) < 1e-6 && Math.abs(right.y - 500) < 1e-6, JSON.stringify(right));
  // Halfway from the frame's left edge to the screen's: 500 there, 200 here.
  assert.ok(Math.abs(place(-1000, 500, g2, src).x - 200) < 1e-6);
  // And back, any of them.
  for (const [u, v] of [[2000, 500], [-1000, -300], [300, 1700]]) assert.deepEqual(within(place(u, v, g2, src), g2, src).map(Math.round), [u, v]);
  // Nothing that stayed on the screen recorded leaves this one.
  for (let x = 0; x <= 2500; x += 100) {
    const p = place(((x - 1000) / 500) * 1000, 500, g2, src);
    assert.ok(p.x >= 0 && p.x <= 1000, `${x}: ${p.x}`);
  }
});

test("the recorded rests land on the bot's own: its lean where the player rested on their pick, the others on what it's torn between", () => {
  const e = (ALL as ClickStretch[]).find((x) => x.kind === 'answer' && x.dwells.some((_, k) => k % 5 === 2 && x.dwells[k] === x.pick) && x.dwells.some((_, k) => k % 5 === 2 && x.dwells[k] >= 0 && x.dwells[k] !== x.pick))!;
  assert.ok(e, 'a stretch resting on its pick and on another');
  // The bot's answers as squares, each its own; where its rests go: onto the bot's index (as the hand maps them).
  const box = (i: number): [number, number] => [100 + i * 150, 300];
  const mapped = new Map<number, number>();
  const onto = (index: number): [number, number] => {
    if (!mapped.has(index)) mapped.set(index, index === e.pick ? 7 : 3);
    return box(mapped.get(index)!);
  };
  const off = steer(e, onto);
  for (let k = 0; k + 4 < e.dwells.length; k += 5) {
    const [a, b, index] = e.dwells.slice(k, k + 3);
    for (let i = a; i <= b; i++) {
      const at = [e.lead[2 * i] + off[i][0], e.lead[2 * i + 1] + off[i][1]];
      if (index >= 0) assert.deepEqual(at.map(Math.round), box(index === e.pick ? 7 : 3));
      // A rest on nothing in particular stays where it was.
      else assert.deepEqual(off[i], [0, 0]);
    }
  }
});

test('no replay is the very same: a slight bend where it moves, none while it rests or as it lands, a tempo and pace of its own', () => {
  const rng = seeded(21);
  const e = pickClick('answer', 4000, rng)!;
  const a = leadTrack(e, [500, 500], 0, 4000, 1, { w: waver(seeded(1)) });
  const b = leadTrack(e, [500, 500], 0, 4000, 1, { w: waver(seeded(2)) });
  const plain = leadTrack(e, [500, 500], 0, 4000, 1);
  const apart = (x: typeof a, y: typeof a, t: number) => Math.hypot(trackAt(x, t)[0] - trackAt(y, t)[0], trackAt(x, t)[1] - trackAt(y, t)[1]);
  const ts = Array.from({ length: 39 }, (_, i) => 100 + i * 100);
  // Different, a little: its path never far from the recording's (its tempo may put it elsewhere along it at a time).
  assert.ok(ts.some((t) => apart(a, b, t) > 3));
  const nearest = (u: number, v: number) => Math.min(...plain.u.map((pu, i) => Math.hypot(pu - u, plain.v[i] - v)));
  const far = Math.max(...a.u.map((u, i) => nearest(u, a.v[i])));
  assert.ok(far < 40, `${far}`);
  // Both end their lead on time; their reaches land on the same spot.
  assert.ok(Math.abs(a.t.at(-1)! - 4000) < 1e-6);
  const to: [number, number] = [620, 380];
  const ra = reachTrack(e, [500, 500], to, 0, 1, waver(seeded(3)));
  assert.deepEqual(trackAt(ra, ra.t.at(-1)!).slice(0, 2).map(Number).map(Math.round), to);
  const w = waver(seeded(4));
  assert.ok(w.pace >= 0.92 && w.pace <= 1.08);
  assert.ok([0, 5, 10, 20].every((i) => w.tempo(i) > 0.84 && w.tempo(i) < 1.16));
});

test('a stretch of waiting now and then begins partway in, at a rest', () => {
  const rng = seeded(5);
  const e = (ALL as Stretch[]).find((x) => x.kind === 'wait' && (x as { path: number[] }).path.length > 120)!;
  const starts = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const { track } = streamTrack(e as never, [500, 500], 0, 1, waver(rng), rng);
    starts.add(String(track.t.length));
    assert.equal(track.t[0] >= 0, true);
  }
  assert.ok(starts.size > 1);
});
