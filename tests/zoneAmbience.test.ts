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
      assert.match(l.file, /^amb-[a-z]+-[a-z\d]+$/);
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
  for (const d of [1, 2, 3, 4, 5, 6, 7]) assert.deepEqual(bedsAt(d).beds.map((b) => [b.place, b.weight]), [['z0', 1]]);
  for (let k = 0; k < 40; k++) {
    const { beds } = bedsAt(settledAt(k));
    assert.equal(beds.length, 1, `stratum ${k}`);
    assert.equal(beds[0].place, placeAt(k));
    assert.ok(Math.abs(beds[0].weight - 1) < 1e-9);
    // Alone until its hall begins to turn, at its 7th depth (its turn begins at its 6th, with the embers).
    for (let d = settledAt(k); d <= 10 * k + 7; d++) assert.deepEqual(bedsAt(d).beds.map((b) => b.place), [placeAt(k)], `depth ${d}`);
    // Its turn into the next: both places from its 8th depth, the next rising as the old one falls.
    let before = 0;
    for (let d = 10 * k + 8; d < settledAt(k + 1); d++) {
      const turning = bedsAt(d).beds;
      assert.deepEqual(turning.map((b) => b.place), [placeAt(k), placeAt(k + 1)], `depth ${d}`);
      assert.ok(Math.abs(turning[0].weight ** 2 + turning[1].weight ** 2 - 1) < 1e-9, `depth ${d}`);
      assert.ok(turning[1].weight > before, `depth ${d}`);
      before = turning[1].weight;
    }
  }
  // Half way through the hall's turn (the Mines' turn is 3/5 of the way at depth 9), each at 1/√2.
  const half = bedsAt(9).beds;
  assert.deepEqual(half.map((b) => b.place), ['z0', 'z1']);
  for (const b of half) assert.ok(Math.abs(b.weight - Math.SQRT1_2) < 1e-9);
  // The depth before the next is announced (depth 10) the Magma Fissure is most of it, five sixths of the hall;
  // as it is announced (depth 11), all of it.
  const [mines, magma] = bedsAt(10).beds;
  assert.ok(magma.weight > mines.weight && magma.weight ** 2 > 0.93 && magma.weight ** 2 < 0.95, `${magma.weight}`);
  assert.deepEqual(bedsAt(11).beds.map((b) => [b.place, b.weight]), [['z1', 1]]);
});

test("the ambience is each place's fire, by its share", () => {
  // The Mines keep all of it; Frozen Hollow puts it out.
  assert.ok(Math.abs(bedsAt(1).fire - db(ZONE_AMBIENCE[0].fire!)) < 1e-12);
  assert.equal(ZONE_AMBIENCE[2].fire, null);
  assert.equal(bedsAt(settledAt(2)).fire, 0);
  // From the Magma Fissure into Frozen Hollow (none).
  const { beds, fire } = bedsAt(settledAt(1) + 7);
  assert.deepEqual(beds.map((b) => b.place), ['z1', 'z2']);
  assert.ok(Math.abs(fire - beds[0].weight * db(ZONE_AMBIENCE[1].fire!)) < 1e-12);
  // And everywhere, the places' shares added up in power, as the beds are; settled, exactly the place's fire.
  for (let d = 1; d <= 300; d++) {
    const at = bedsAt(d);
    const fires = at.beds.map((b) => (b.bed.fire === null ? 0 : db(b.bed.fire)));
    const power = at.beds.reduce((s, b, i) => s + (b.weight * fires[i]) ** 2, 0);
    assert.ok(Math.abs(at.fire - Math.sqrt(power)) < 1e-12, `depth ${d}`);
    if (at.beds.length === 1) assert.equal(at.fire, fires[0], `depth ${d}`);
    // Never louder than the louder of the two, nor quieter than the quieter.
    assert.ok(at.fire <= Math.max(...fires) + 1e-12 && at.fire >= Math.min(...fires) - 1e-12, `depth ${d}`);
    for (const b of at.beds) assert.equal(b.bed, bedOf(b.place));
  }
});

test('turning between two places with the same fire, the ambience stays level', () => {
  // The fire is one sound: its two shares, added up as they are, would swell it by 3 dB half way.
  let turns = 0;
  for (let d = 1; d <= 3000; d++) {
    const { beds, fire } = bedsAt(d);
    if (beds.length !== 2 || beds[0].bed.fire === null || beds[0].bed.fire !== beds[1].bed.fire) continue;
    assert.ok(Math.abs(fire - db(beds[0].bed.fire)) < 1e-12, `depth ${d}: ${fire} for ${db(beds[0].bed.fire)}`);
    turns++;
  }
  // Some do: the archetypes' turns at depth 139 among them, half way from a9 into a10 (both -13.5 dB).
  assert.deepEqual(bedsAt(139).beds.map((b) => [b.place, b.bed.fire]), [['a9', -13.5], ['a10', -13.5]]);
  assert.ok(turns > 0);
});
