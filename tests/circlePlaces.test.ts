import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../src/lib/circlePlaces.ts';
import { PLATES } from '../src/lib/plates/index.ts';

// Where each rune circle stands (lib/circlePlaces.ts, read by the game, the
// codex and the circles' test page): only circles there are, each place with
// at least one, and every circle somewhere.
test('every place has its circles, and every circle a place', () => {
  const plates = Object.keys(PLATES);
  for (const [place, { circles }] of Object.entries(PLACES)) {
    assert.ok(circles.length > 0, `${place} has a circle`);
    for (const c of circles) assert.ok(plates.includes(c), `${place}: "${c}" is a circle`);
    assert.equal(new Set(circles).size, circles.length, `${place}: each circle once`);
  }
  for (const name of plates) assert.ok(Object.values(PLACES).some((p) => (p.circles as string[]).includes(name)), `the ${name} stands somewhere`);
});
