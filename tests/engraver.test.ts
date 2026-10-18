import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circlePath, mapPath } from '../src/lib/engraver.ts';

type Arc = { from: number[]; to: number[]; r: number; large: boolean; sweep: boolean };
/** The arcs of a circle path (M, A and Z only), as the browser reads them. */
const arcs = (d: string) => {
  const tok = d.match(/[A-Z]|-?\d+\.?\d*/g)!;
  const out: Arc[] = [];
  let pen: number[] = [];
  for (let i = 0; i < tok.length; ) {
    const cmd = tok[i++];
    if (cmd === 'M') pen = [Number(tok[i++]), Number(tok[i++])];
    else if (cmd === 'A') {
      const to = [Number(tok[i + 5]), Number(tok[i + 6])];
      out.push({ from: pen, to, r: Number(tok[i]), large: tok[i + 3] === '1', sweep: tok[i + 4] === '1' });
      i += 7;
      pen = to;
    }
  }
  return out;
};
/** Where the browser puts an arc's centre (its radius grown to fit, if short). */
const centre = ({ from, to, r, large, sweep }: Arc) => {
  const [mx, my] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const [dx, dy] = [(to[0] - from[0]) / 2, (to[1] - from[1]) / 2];
  const half = Math.hypot(dx, dy);
  const h = Math.sqrt(Math.max(0, r * r - half * half));
  const s = large === sweep ? -1 : 1;
  return [mx - (s * h * dy) / half, my + (s * h * dx) / half];
};

// A ring keeps true once it is moved and its ends rounded: every arc of it
// turns about the ring's own centre (a ring once drawn in two halves
// bulged into an oval when a circle's drawing gave way to its still copy).
test('a ring moved and rounded stays a ring', () => {
  for (const [r, cx, cy] of [
    [13.955040168181089, 33.149, -45.627],
    [7.2, -61.3333, 12.0049],
    [0.84, 0.005, -0.005],
  ]) {
    for (const a of arcs(mapPath(circlePath(r), (p) => [p[0] + cx, p[1] + cy]))) {
      const [x, y] = centre(a);
      assert.ok(Math.hypot(x - cx, y - cy) < 0.02, `an arc of the ring of ${r} turns about ${x}, ${y}, not ${cx}, ${cy}`);
    }
  }
});

test('an exact half arc, moved and rounded, keeps its middle', () => {
  const r = 4.9;
  const [a] = arcs(mapPath(`M0 ${-r}A${r} ${r} 0 0 1 0 ${r}`, (p) => [p[0] + 33.149, p[1] - 45.627]));
  const [x, y] = centre(a);
  assert.ok(Math.hypot(x - 33.149, y + 45.627) < 0.01, `the half turns about ${x}, ${y}`);
});

test('an arc short of a half is written as it is', () => {
  // 170 degrees of a circle of 73, as a ring cut by one seal comes in pieces.
  const r = 73;
  const end = [r * Math.sin((170 * Math.PI) / 180), -r * Math.cos((170 * Math.PI) / 180)];
  const [a] = arcs(mapPath(`M0 ${-r}A${r} ${r} 0 0 1 ${end[0]} ${end[1]}`, (p) => [p[0] + 0.004, p[1] - 0.003]));
  assert.equal(a.r, r);
});
