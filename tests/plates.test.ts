import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATES } from '../src/lib/plates/index.ts';
import type { StageLayer } from '../src/lib/engraver.ts';

// Every rune circle's plate builds (as the site's build builds it,
// vite.config.ts), each layer with its lines and glow, named once, riding
// and giving way only to layers there are, and the whole small enough to
// ship in the circle's chunk.
for (const [name, build] of Object.entries(PLATES)) {
  test(`the ${name}'s plate`, () => {
    const built = build() as StageLayer[] | { layers: StageLayer[] };
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
}
