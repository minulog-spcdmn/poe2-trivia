import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, DUEL } from '../src/lib/plates/duel.ts';

// The deathmatch's plate (lib/plates/duel.ts), painted to a texture for the
// intro's sigil (lib/fx/duelPaint.ts): its three parts each drawn, in the
// stage's weights only, every number in its paths a real one and all of it
// inside the 200 units the texture holds, and the same plate every time (its
// wear is seeded), so every device draws one sigil.
const CLASSES = new Set(['', 'thin', 'hair', 'sign', 'hatch']);

/** The points a path's commands go to (an arc's end, not its radii and turn). */
function points(d: string): number[] {
  const out: number[] = [];
  for (const [, cmd, args] of d.matchAll(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi)) {
    const n = (args.match(/-?\d*\.?\d+(e-?\d+)?/gi) ?? []).map(Number);
    if (cmd.toUpperCase() === 'A') for (let i = 0; i + 6 < n.length; i += 7) out.push(n[i + 5], n[i + 6]);
    else out.push(...n);
  }
  return out;
}

test("the deathmatch's plate", () => {
  const plate = build();
  for (const [part, inked] of Object.entries(plate)) {
    const paths = Object.entries(inked);
    assert.ok(paths.length, `${part} is drawn`);
    for (const [cls, d] of paths) {
      assert.ok(CLASSES.has(cls), `${part}: "${cls}" is one of the stage's weights`);
      assert.match(d, /^M/, `${part} (${cls || 'main'}) is a path`);
      assert.doesNotMatch(d, /NaN|undefined|Infinity/, `${part} (${cls || 'main'}) has only real numbers`);
      const out = points(d).find((n) => Math.abs(n) > 100);
      assert.equal(out, undefined, `${part} (${cls || 'main'}) stays within the texture`);
    }
  }
  assert.deepEqual(build(), plate, 'the same plate every time');
  assert.ok(DUEL.tip > 0 && DUEL.pommel < 0 && DUEL.reach <= 100, 'the sword runs point down, within the rim');
});
