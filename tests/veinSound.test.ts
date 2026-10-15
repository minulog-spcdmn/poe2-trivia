import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findFor } from '../src/lib/delve.ts';
import { MOMENTS, VEIN_AFTER, VEIN_AMBIENCE } from '../src/lib/soundDesign.ts';

(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem() {} };
const { VEIN_NEAR } = await import('../src/lib/sound.ts');

type Picked = { file: string; gain: number; rate: number; delay: number; hp: number; lp: number; send: number; start: number; len: number };
/** The picks as the vein sound board saved them (its `state`; the cave-in was left as the game has it). */
const PICKS = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'vein-picks.json'), 'utf8')) as {
  vein: { duck: number; muffle: number; fadeIn: number; fadeOut: number; layers: Picked[] };
  moments: Record<'veinStrike' | 'veinMined' | 'veinStrain1' | 'veinStrain2', { soften: number; varyPitch: number; varyGain: number; after?: number; layers: Picked[] }>;
};

/** The board's candidates, by the names they have in public/sfx (the crack cut to the 3.5 s picked). */
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
  'tunnel-871712': 'amb-vein-1',
  'tunnel-735353': 'amb-vein-2',
  'tunnel-636124': 'amb-vein-3',
};
/**
 * dB each was moved by to sit in line with the game (K-weighted loudness
 * through its mix): the strike up to the card pick it replaces, the first
 * crack up to 4 LU under the second (as picked it was quieter than any other
 * sound in the game), and the tunnel down so that the vein's whole mix sits
 * at the zones' average.
 */
const LEVEL = { veinStrike: 1, veinMined: 0, veinStrain1: 8, veinStrain2: 0, tunnel: -3 };

test("a vein's moments are as picked on its sound board, leveled", () => {
  for (const [id, m] of Object.entries(PICKS.moments)) {
    const game = MOMENTS[id as keyof typeof PICKS.moments];
    assert.deepEqual({ soften: game.soften, varyPitch: game.varyPitch, varyGain: game.varyGain }, { soften: m.soften, varyPitch: m.varyPitch, varyGain: m.varyGain }, id);
    assert.deepEqual(
      game.layers,
      m.layers.map(({ file, gain, rate, delay, hp, lp, send }) => ({ file: FILES[file] ?? file, gain: gain + LEVEL[id as keyof typeof LEVEL], rate, delay, hp, lp, send })),
      id,
    );
    if (m.after !== undefined) assert.equal(VEIN_AFTER[id as keyof typeof VEIN_AFTER], m.after, id);
  }
});

test("a vein's tunnel is as picked, leveled, and only a cut that was picked is baked into a file", () => {
  const { layers, ...rest } = VEIN_AMBIENCE;
  const { layers: picked, ...pickedRest } = PICKS.vein;
  assert.deepEqual(rest, pickedRest);
  assert.deepEqual(layers, picked.map(({ file, gain, lp, rate, send }) => ({ file: FILES[file], gain: gain + LEVEL.tunnel, lp, rate, send })));
  // Every picked layer starts at its file's start; the one cut short is the crack, whose file is that cut.
  const all = [...picked, ...Object.values(PICKS.moments).flatMap((m) => m.layers)];
  assert.ok(all.every((l) => l.start === 0));
  assert.deepEqual(all.filter((l) => l.len > 0).map((l) => FILES[l.file]), ['vein-crack']);
});

test("the tunnel's loops are fetched before the first vein can turn up", () => {
  assert.ok(VEIN_NEAR < findFor('azurite').from, `${VEIN_NEAR} vs ${findFor('azurite').from}`);
});
