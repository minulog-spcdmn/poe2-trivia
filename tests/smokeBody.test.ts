// The effects' smoke reads its puffs' body from a lookup (lib/fx/noiseTile.ts,
// smokeBody) rather than working it out per pixel: it must be gone by the
// lookup's far edge (the shader holds that edge out to the quad's corners),
// and thicker where the noise is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './asVite.ts';

const { SMOKE_BODY, smokeBody } = await import('../src/lib/fx/noiseTile.ts');

test("a puff's body is gone by the lookup's edge and thickens with the noise", () => {
  const b = smokeBody();
  assert.equal(b.length, SMOKE_BODY * SMOKE_BODY);
  for (let j = 0; j < SMOKE_BODY; j++) assert.equal(b[j * SMOKE_BODY + SMOKE_BODY - 1], 0);
  for (let j = 1; j < SMOKE_BODY; j++) assert.ok(b[j * SMOKE_BODY] >= b[(j - 1) * SMOKE_BODY]);
  assert.ok(b[(SMOKE_BODY - 1) * SMOKE_BODY] > 0.5);
});
