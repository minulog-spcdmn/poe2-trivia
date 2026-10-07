import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHETYPES } from '../src/lib/archetypes.ts';
import { archetypeAt } from '../src/lib/backdrops.ts';
import { settledAt, STRATA } from '../src/lib/descent.ts';
import { AMBIENCE, ARCHETYPE_AMBIENCE, FIRE, RUMBLE, ZONE_AMBIENCE, type Bed } from '../src/lib/soundDesign.ts';

(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem() {} };
const { bedOf, bedsAt, placeAt } = await import('../src/lib/sound.ts');

type Picked = { fire: number; layers: { file: string; gain: number; lp: number; rate: number; send: number }[] };
/** The picks as the ambience mix board saved them (its `state`). */
const PICKS = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'ambience-picks.json'), 'utf8')) as {
  game: { file: string; gain: number; lp: number };
  fire: { file: string; gain: number; lp: number };
  rumble: { gain: number; abyss: number };
  places: Record<string, Picked>;
};
/** The board's own line: a fire at -40 dB or lower is none. */
const OFF = -40;
const SFX = join(import.meta.dirname, '..', 'public', 'sfx');
const db = (d: number) => Math.pow(10, d / 20);
const allBeds: Bed[] = [...ZONE_AMBIENCE, ...ARCHETYPE_AMBIENCE];
const loops = () => [AMBIENCE.file, FIRE.file, ...allBeds.flatMap((b) => b.layers.map((l) => l.file))];

test('the ambience is as picked on the mix board', () => {
  assert.deepEqual({ ...AMBIENCE }, PICKS.game);
  assert.deepEqual({ ...FIRE }, PICKS.fire);
  assert.deepEqual({ gain: RUMBLE.gain, abyss: RUMBLE.abyss }, PICKS.rumble);
  const asPicked = (p: Picked): Bed => ({ fire: p.fire > OFF ? p.fire : null, layers: p.layers });
  assert.deepEqual(ZONE_AMBIENCE, ZONE_AMBIENCE.map((_, i) => asPicked(PICKS.places[`z${i}`])));
  assert.deepEqual(ARCHETYPE_AMBIENCE, ARCHETYPE_AMBIENCE.map((_, i) => asPicked(PICKS.places[`a${i}`])));
  assert.equal(Object.keys(PICKS.places).length, ZONE_AMBIENCE.length + ARCHETYPE_AMBIENCE.length);
});

test('every zone and every archetype has a bed of one or two layers', () => {
  assert.equal(ZONE_AMBIENCE.length, STRATA.length);
  assert.equal(ARCHETYPE_AMBIENCE.length, ARCHETYPES.length);
  for (const bed of allBeds) {
    assert.ok(bed.fire === null || (bed.fire > OFF && bed.fire <= 6), `fire ${bed.fire}`);
    assert.ok(bed.layers.length >= 1 && bed.layers.length <= 2);
    for (const l of bed.layers) {
      assert.match(l.file, /^amb-[a-z]+-\d$/);
      assert.ok(l.gain < -20 && l.gain >= -70, `${l.file} gain ${l.gain}`);
      assert.ok(l.lp >= 20 && l.lp <= 20000, `${l.file} lp ${l.lp}`);
      assert.ok(l.rate >= 0.5 && l.rate <= 1.5, `${l.file} rate ${l.rate}`);
      assert.ok(l.send >= 0 && l.send <= 1, `${l.file} send ${l.send}`);
    }
  }
  // Each stratum is a place with a bed: the zones in order, then the archetypes as they are dealt.
  STRATA.forEach((_, k) => assert.equal(placeAt(k), `z${k}`));
  const dealt = new Set<string>();
  for (let k = STRATA.length; k < STRATA.length + 4 * ARCHETYPES.length; k++) {
    assert.equal(placeAt(k), `a${archetypeAt(k)}`);
    assert.ok(bedOf(placeAt(k)), `stratum ${k}`);
    dealt.add(placeAt(k));
  }
  assert.equal(dealt.size, ARCHETYPES.length);
});

test('every ambience loop is in public/sfx with a credit, and none is left over', () => {
  const credits = readFileSync(join(SFX, 'CREDITS.txt'), 'utf8');
  for (const file of new Set(loops())) {
    assert.ok(existsSync(join(SFX, `${file}.mp3`)), `${file}.mp3 missing`);
    assert.match(credits, new RegExp(`^  ${file}\\.mp3 +\\S`, 'm'), `${file}.mp3 has no credit`);
  }
  const used = new Set(loops().map((f) => `${f}.mp3`));
  assert.deepEqual(
    readdirSync(SFX).filter((f) => f.startsWith('amb-') && !used.has(f)),
    [],
  );
});

test('outside Delve no beds play and the ambience is lit in full', () => {
  assert.deepEqual(bedsAt(0), { beds: [], fire: 1 });
});

test('a settled depth is one place alone; a turn cross-fades two at equal power', () => {
  // Through the Mines' first depths, the Mines alone.
  for (const d of [1, 2, 3, 4, 5]) assert.deepEqual(bedsAt(d).beds.map((b) => [b.place, b.weight]), [['z0', 1]]);
  for (let k = 0; k < 40; k++) {
    const { beds } = bedsAt(settledAt(k));
    assert.equal(beds.length, 1, `stratum ${k}`);
    assert.equal(beds[0].place, placeAt(k));
    assert.ok(Math.abs(beds[0].weight - 1) < 1e-9);
    // Its turn into the next: both places, the next rising as the old one falls.
    // (The Mines' turn begins at depth 4, the others' where they settle.)
    let before = 0;
    for (let d = Math.max(4, settledAt(k)) + 2; d < settledAt(k + 1); d++) {
      const turning = bedsAt(d).beds;
      assert.deepEqual(turning.map((b) => b.place), [placeAt(k), placeAt(k + 1)], `depth ${d}`);
      assert.ok(Math.abs(turning[0].weight ** 2 + turning[1].weight ** 2 - 1) < 1e-9, `depth ${d}`);
      assert.ok(turning[1].weight > before, `depth ${d}`);
      before = turning[1].weight;
    }
  }
  // Half way through the hall's turn (the Mines' turn is 0.55 of the way at depth 9.5), each at 1/√2.
  const half = bedsAt(9.5).beds;
  assert.deepEqual(half.map((b) => b.place), ['z0', 'z1']);
  for (const b of half) assert.ok(Math.abs(b.weight - Math.SQRT1_2) < 1e-9);
  // As the next is announced (depth 11) the Magma Fissure is about three quarters of the hall.
  const [mines, magma] = bedsAt(11).beds;
  assert.ok(magma.weight > mines.weight && magma.weight ** 2 > 0.8 && magma.weight ** 2 < 0.9, `${magma.weight}`);
});

test("the ambience is each place's fire, by its share", () => {
  // The Mines keep nearly all of it; Frozen Hollow puts it out.
  assert.ok(Math.abs(bedsAt(1).fire - db(ZONE_AMBIENCE[0].fire!)) < 1e-12);
  assert.equal(ZONE_AMBIENCE[2].fire, null);
  assert.equal(bedsAt(settledAt(2)).fire, 0);
  // From the Magma Fissure into Frozen Hollow (none).
  const { beds, fire } = bedsAt(settledAt(1) + 6);
  assert.deepEqual(beds.map((b) => b.place), ['z1', 'z2']);
  assert.ok(Math.abs(fire - beds[0].weight * db(ZONE_AMBIENCE[1].fire!)) < 1e-12);
  // And everywhere, the places' shares added up.
  for (let d = 1; d <= 300; d++) {
    const at = bedsAt(d);
    const sum = at.beds.reduce((s, b) => s + (b.bed.fire === null ? 0 : b.weight * db(b.bed.fire)), 0);
    assert.ok(Math.abs(at.fire - sum) < 1e-12, `depth ${d}`);
    for (const b of at.beds) assert.equal(b.bed, bedOf(b.place));
  }
});
