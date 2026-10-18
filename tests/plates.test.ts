import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATES } from '../src/lib/plates/index.ts';
import { HOLLOW_RING, HOLLOW_RING_IN, type StageLayer } from '../src/lib/engraver.ts';

const layersOf = (built: unknown) => (Array.isArray(built) ? built : (built as { layers: StageLayer[] }).layers) as StageLayer[];
/** Whether a layer's still copy has a ring of radius `r` about the centre (arcs as the engraver writes them). */
const ringAt = (l: StageLayer, r: number) => l.lines.still.includes(`A${r.toFixed(2)} ${r.toFixed(2)} `);

// Every rune circle's plate builds, whole and hollow (as the browser builds
// it, in a worker: lib/plateStore.svelte.ts), each layer with its lines and
// glow, named once, riding and giving way only to layers there are, and the
// whole small enough to keep in the browser's cache.
for (const [name, build] of Object.entries(PLATES)) {
  for (const hollow of [false, true]) {
    test(`the ${name}'s plate${hollow ? ', hollow' : ''}`, async () => {
      const built = await build(hollow);
      const layers = layersOf(built);
      const names = new Set(layers.map((l) => l.name));
      assert.equal(names.size, layers.length, 'every layer named once');
      for (const l of layers) {
        for (const p of [l.lines, l.glow]) {
          assert.ok(p && typeof p.drawing === 'string' && typeof p.still === 'string', `layer "${l.name}" has its plate`);
          assert.ok(Number.isFinite(p.start) && Number.isFinite(p.end), `layer "${l.name}" is timed`);
        }
        if (l.within) assert.ok(names.has(l.within), `layer "${l.name}" rides "${l.within}", a layer there is`);
        if (l.mask) assert.ok(names.has(l.mask.with), `layer "${l.name}" gives way with "${l.mask.with}", a layer there is`);
        assert.ok(!('inner' in l), `layer "${l.name}": what to leave out is settled as the plate is built`);
        if (!hollow) assert.ok(!l.cut, `layer "${l.name}": nothing is cut whole`);
      }
      assert.ok(JSON.stringify(built).length < 500_000, 'under 500 KB');
    });
  }
  // Hollow (behind the end screen's one avatar), every circle frames the
  // avatar alike: the same double ring, hugging it (HOLLOW_RING); whole,
  // only the moth, whose heart's ring it is, draws it (the others build none
  // of what's hollow).
  test(`the ${name}'s hollow frame`, async () => {
    const framed = (built: unknown) => layersOf(built).some((l) => ringAt(l, HOLLOW_RING) && ringAt(l, HOLLOW_RING_IN));
    assert.ok(framed(await build(true)), `hollow, a ring at ${HOLLOW_RING} and ${HOLLOW_RING_IN}`);
    assert.equal(framed(await build(false)), name === 'moth', 'whole, only the moth');
  });
}
