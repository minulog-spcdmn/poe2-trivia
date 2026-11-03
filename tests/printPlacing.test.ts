// Where a plate's print draws its svg onto its pixels (lib/printPlacing.ts,
// docs/category-cards.md, “The plates' prints”): it fills the pixels the
// browser counted for its box, whatever density the page reads, and isn't
// drawn from an svg laid out at another size than the one it's kept for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pixelsOf, placedBy, placing, scaleOf, type At } from '../src/lib/printPlacing.ts';

/** A sharp face at 4K 150%, as Chrome reported it: its own 218.18 x 298.18 CSS px, zoomed 3.72 and drawn at 1.5. */
const FACE: At = { w: 218, h: 298, cw: 218.18, ch: 298.18, z: 3.7247 * 1.5, W: 1219, H: 1666 };
const near = (a: number[] | null, b: number[], eps = 1e-6) => {
  assert.ok(a, 'placed');
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]!) < eps, `${a} vs ${b}`));
};

test('where the density agrees with the counted pixels, the print is drawn into them, placed by it', () => {
  assert.deepEqual(pixelsOf(FACE), [FACE.W, FACE.H]);
  assert.deepEqual(scaleOf(FACE), [FACE.z, FACE.z]);
});

/** The print as drawn at `at`: its size, and where its viewBox's far corner lands on it. */
const drawn = (at: At) => {
  const [pw, ph] = pixelsOf(at);
  const [sx, sy, tx, ty] = placing(at);
  return { pw, ph, end: [tx + at.w * sx, ty + at.h * sy] };
};

test('where the page reads another density than the pixels were counted at, the print fills its pixels, at the larger', () => {
  // A QA desk frame posing as a 1x screen on a 1.5x one: the browser's count.
  const lower = { ...FACE, z: 3.7247 };
  const a = drawn(lower);
  assert.deepEqual([a.pw, a.ph], [FACE.W, FACE.H]);
  assert.ok(Math.abs(a.end[0]! - a.pw) < 1 && Math.abs(a.end[1]! - a.ph) < 1, `posing as 1x: the viewBox ends at ${a.end} on ${a.pw} x ${a.ph}`);
  // Posing as a 2x or 3x screen, or Chrome emulating one (a headless 2x shot, whose count leaves its density
  // out): as many pixels as the density the page reads, so the print isn't drawn up.
  for (const dpr of [2, 3]) {
    const at = { ...FACE, z: 3.7247 * dpr };
    const b = drawn(at);
    assert.ok(Math.abs(b.pw - at.cw * at.z) <= 0.5 && Math.abs(b.ph - at.ch * at.z) <= 0.5, `posing as ${dpr}x: ${b.pw} x ${b.ph} pixels`);
    assert.ok(Math.abs(b.end[0]! - b.pw) < 1 && Math.abs(b.end[1]! - b.ph) < 1, `posing as ${dpr}x: the viewBox ends at ${b.end} on ${b.pw} x ${b.ph}`);
  }
  const emulated = { ...FACE, z: 3.7247 * 2, W: 813, H: 1111 };
  assert.deepEqual(pixelsOf(emulated), [Math.round(emulated.cw * emulated.z), Math.round(emulated.ch * emulated.z)]);
});

test("the svg's own placing, scaled to the print's pixels", () => {
  const fit = Math.min(FACE.cw / FACE.w, FACE.ch / FACE.h);
  const m = { a: fit, d: fit, e: 0, f: 0.09 };
  near(placedBy(m, FACE), [fit * FACE.z, fit * FACE.z, 0, 0.09 * FACE.z]);
  near(placedBy(null, FACE), placing(FACE));
});

test('an svg laid out at another size since its print was asked for is not printed', () => {
  // The window turned to a phone on its side's cards (143 wide) before the print was pulled.
  const m = { a: 143 / FACE.w, d: 143 / FACE.w, e: 0, f: 0 };
  assert.equal(placedBy(m, FACE), null);
});
