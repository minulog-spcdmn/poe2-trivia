import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATES } from '../src/lib/plates/index.ts';
import type { StageLayer } from '../src/lib/engraver.ts';

// Every rune circle's plate builds (as the browser builds it, in a worker:
// lib/plateStore.svelte.ts), each layer with its lines and glow, named
// once, riding and giving way only to layers there are, and the whole small
// enough to keep in the browser's cache; and hollow as whole.
for (const [name, build] of Object.entries(PLATES)) {
  test(`the ${name}'s plate`, async () => {
    const built = (await build()) as StageLayer[] | { layers: StageLayer[] };
    const layers = Array.isArray(built) ? built : built.layers;
    const names = new Set(layers.map((l) => l.name));
    assert.equal(names.size, layers.length, 'every layer named once');
    for (const l of layers) {
      for (const p of [l.lines, l.glow]) {
        assert.ok(p && typeof p.drawing === 'string' && typeof p.still === 'string', `layer "${l.name}" has its plate`);
        assert.ok(Number.isFinite(p.start) && Number.isFinite(p.end), `layer "${l.name}" is timed`);
      }
      if (l.within) assert.ok(names.has(l.within), `layer "${l.name}" rides "${l.within}", a layer there is`);
      if (l.mask) assert.ok(names.has(l.mask.with), `layer "${l.name}" gives way with "${l.mask.with}", a layer there is`);
    }
    assert.ok(JSON.stringify(built).length < 500_000, 'under 500 KB');
  });
  // Hollow (behind the end screen's one avatar), every layer shown rides a
  // layer shown too, and the hollow frame is there: the moth's own heart, or
  // a layer drawn only then.
  test(`the ${name}'s plate, hollow`, async () => {
    const built = (await build()) as StageLayer[] | { layers: StageLayer[] };
    const shown = (Array.isArray(built) ? built : built.layers).filter((l) => !l.inner);
    const names = new Set(shown.map((l) => l.name));
    for (const l of shown) if (l.within) assert.ok(names.has(l.within), `layer "${l.name}" rides "${l.within}", shown hollow too`);
    assert.ok(name === 'moth' || shown.some((l) => l.hollow), 'a hollow frame');
  });
}
