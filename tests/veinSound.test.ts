import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findFor } from '../src/lib/delve.ts';
import { ARCHETYPE_AMBIENCE, MOMENTS, VEIN_AFTER, VEIN_AMBIENCE, VEIN_DUCK, ZONE_AMBIENCE, type EqBand } from '../src/lib/soundDesign.ts';
import { ROOMS } from '../src/lib/acoustics.ts';

(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem() {} };
const { VEIN_NEAR, veinDuckAt, veinMuffleAt } = await import('../src/lib/sound.ts');

type Picked = { file: string; gain: number; rate: number; delay: number; hp: number; lp: number; send: number; start: number; len: number; cents?: number; eq?: EqBand[] };
/** The picks as the vein sound board saved them (its `state`; the cave-in was left as the game has it). */
const PICKS = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'vein-picks.json'), 'utf8')) as {
  vein: { duck: number; even: boolean; muffles: number[]; fadeIn: number; fadeOut: number; space: string; spaceLen: number; layers: Picked[] };
  moments: Record<'veinStrike' | 'veinMined' | 'veinStrain1' | 'veinStrain2', { soften: number; varyPitch: number; varyGain: number; after?: number; layers: Picked[] }>;
};

/** The board's candidates, by the names they have in public/sfx (each the board's file as it is). */
const FILES: Record<string, string> = {
  'strike-760566': 'vein-pick',
  'strike-431019': 'vein-stone-hit',
  'mined-542560': 'vein-crystal-1',
  'mined-542565': 'vein-crystal-2',
  'mined-524312': 'vein-rock-break',
  'strain-262118': 'vein-crumble-1',
  'strain-348947': 'vein-crumble-2',
  'strain-521956': 'vein-crumble-3',
  'strain-222521': 'vein-crack',
  'ice-842575': 'amb-vein-ice',
  'ice-847807': 'amb-vein-rumble',
  'tunnel-625296': 'amb-vein-shaft',
};
/** dB each was moved by after the board: none, the moments leveled and the tunnel picked on it as they play in the game. */
const LEVEL = { veinStrike: 0, veinMined: 0, veinStrain1: 0, veinStrain2: 0, tunnel: 0 };

test("a vein's moments are as picked on its sound board, leveled", () => {
  for (const [id, m] of Object.entries(PICKS.moments)) {
    const game = MOMENTS[id as keyof typeof PICKS.moments];
    assert.deepEqual({ soften: game.soften, varyPitch: game.varyPitch, varyGain: game.varyGain }, { soften: m.soften, varyPitch: m.varyPitch, varyGain: m.varyGain }, id);
    assert.deepEqual(
      game.layers,
      m.layers.map(({ file, gain, rate, delay, hp, lp, send, len }) => ({ file: FILES[file] ?? file, gain: gain + LEVEL[id as keyof typeof LEVEL], rate, delay, hp, lp, send, ...(len > 0 ? { len } : {}) })),
      id,
    );
    if (m.after !== undefined) assert.equal(VEIN_AFTER[id as keyof typeof VEIN_AFTER], m.after, id);
  }
});

test("a vein's tunnel is as picked, and its loops play whole", () => {
  const { layers, duck, muffles, fadeIn, fadeOut } = VEIN_AMBIENCE;
  const { layers: picked, ...v } = PICKS.vein;
  // The duck is the board's even one (for an average zone), the echo the vein's room at the board's length.
  assert.ok(v.even);
  assert.deepEqual({ duck, muffles, fadeIn, fadeOut }, { duck: v.duck, muffles: v.muffles, fadeIn: v.fadeIn, fadeOut: v.fadeOut });
  assert.equal(v.space, 'tunnel');
  assert.equal(ROOMS.vein.rt, v.spaceLen);
  // Each loop as picked: its high-pass where it has one, and only the EQ bands that do something.
  assert.deepEqual(
    layers,
    picked.map(({ file, gain, lp, rate, send, hp, eq = [] }) => {
      const bands = eq.filter((b) => b.g !== 0).map(({ type, f, g, q }) => ({ type, f, g, q }));
      return { file: FILES[file], gain: gain + LEVEL.tunnel, lp, rate, send, ...(hp > 20 ? { hp } : {}), ...(bands.length ? { eq: bands } : {}) };
    }),
  );
  assert.ok(picked.every((l) => !l.cents));
  // Every picked layer starts at its file's start (the game has no start offset), and a loop is never cut.
  const all = [...picked, ...Object.values(PICKS.moments).flatMap((m) => m.layers)];
  assert.ok(all.every((l) => l.start === 0));
  assert.ok(picked.every((l) => l.len === 0));
});

test("the tunnel's loops are fetched before the first vein can turn up", () => {
  assert.ok(VEIN_NEAR < findFor('azurite').from, `${VEIN_NEAR} vs ${findFor('azurite').from}`);
});

test('the zone ducks behind a vein evenly, by place, and muffles further each strike', () => {
  // A correction for every place, so none falls back to the average.
  assert.equal(VEIN_DUCK.zones.length, ZONE_AMBIENCE.length);
  assert.equal(VEIN_DUCK.archetypes.length, ARCHETYPE_AMBIENCE.length);
  // Fungal Caverns settled (where the tunnel was picked): the duck plus its own correction.
  assert.equal(veinDuckAt(35), VEIN_AMBIENCE.duck + VEIN_DUCK.zones[3]);
  // The Mines, the quietest zone, never lifted above its own level.
  assert.equal(veinDuckAt(5), 0);
  for (let d = 1; d <= 400; d++) {
    const k = veinDuckAt(d);
    assert.ok(Number.isFinite(k) && k <= 0, `depth ${d}: ${k}`);
  }
  // Between two zones, between their ducks.
  const [a, b] = [VEIN_AMBIENCE.duck + VEIN_DUCK.zones[3], VEIN_AMBIENCE.duck + VEIN_DUCK.zones[4]];
  const mid = veinDuckAt(40);
  assert.ok(mid >= Math.min(a, b) - 1e-9 && mid <= Math.max(a, b) + 1e-9, `${mid} between ${a} and ${b}`);
  assert.deepEqual([1, 2, 3, 4].map(veinMuffleAt), [1200, 850, 600, 600]);
});
