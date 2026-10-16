import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circlePath, mapPath } from '../src/lib/engraver.ts';

// A ring drawn in two halves keeps true once its ends are rounded: each
// half's radius is written no longer than half the distance between its
// written ends, so the browser grows it to fit and its middle can't swing
// off to one side (which made seals bulge into ovals when a circle's
// drawing gave way to its still copy).
test('a ring moved and rounded stays a ring', () => {
  for (const [r, cx, cy] of [
    [13.955040168181089, 33.149, -45.627],
    [7.2, -61.3333, 12.0049],
    [0.84, 0.005, -0.005],
  ]) {
    const d = mapPath(circlePath(r), (p) => [p[0] + cx, p[1] + cy]);
    const tok = d.match(/[A-Z]|-?\d+\.?\d*/g)!;
    let pen: number[] = [];
    for (let i = 0; i < tok.length; ) {
      const cmd = tok[i++];
      if (cmd === 'M') pen = [Number(tok[i++]), Number(tok[i++])];
      else if (cmd === 'A') {
        const rx = Number(tok[i]);
        const end = [Number(tok[i + 5]), Number(tok[i + 6])];
        i += 7;
        const half = Math.hypot(end[0] - pen[0], end[1] - pen[1]) / 2;
        assert.ok(rx <= half, `radius ${rx} longer than half the chord ${half}`);
        assert.ok(Math.abs(rx - r) < 0.02, `radius ${rx} strays from ${r}`);
        pen = end;
      }
    }
  }
});
