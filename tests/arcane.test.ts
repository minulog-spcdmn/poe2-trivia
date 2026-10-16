import { test } from 'node:test';
import assert from 'node:assert/strict';
import { at, clearFrom, wovenPolygons, type Pt } from '../src/lib/arcane.ts';

const O: Pt = [0, 0];
const triangle = (turn: number): Pt[] => [0, 120, 240].map((a) => at(O, a + turn, 50));

test('the Seal of Solomon is woven: each strand goes over and under in turn, all the way round both triangles', () => {
  const { straps, below } = wovenPolygons([triangle(0), triangle(180)], 0.8, 0.7);
  // Every crossing settled one way: one strap over, the other under.
  for (const [key, under] of below) {
    const [i, j] = key.split(':');
    assert.equal(below.get(`${j}:${i}`), !under, `straps ${i} and ${j}`);
  }
  assert.equal(below.size, 12, 'six crossings, each seen from both straps');
  // Walking each triangle, its crossings alternate, from one side on into the next.
  for (const poly of [0, 1]) {
    const walk = straps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.poly === poly)
      .flatMap(({ s, i }) => {
        const along = (j: number) => {
          const o = straps[j];
          const [dx, dy] = [s.q[0] - s.p[0], s.q[1] - s.p[1]];
          const [ex, ey] = [o.q[0] - o.p[0], o.q[1] - o.p[1]];
          return ((o.p[0] - s.p[0]) * ey - (o.p[1] - s.p[1]) * ex) / (dx * ey - dy * ex);
        };
        return straps
          .map((_, j) => j)
          .filter((j) => below.has(`${i}:${j}`))
          .sort((a, b) => along(a) - along(b))
          .map((j) => below.get(`${i}:${j}`));
      });
    assert.equal(walk.length, 6);
    walk.forEach((under, n) => assert.notEqual(under, walk[(n + 1) % walk.length], `triangle ${poly}, crossing ${n}`));
  }
});

test('a pentagram walked in one stroke is woven over and under in turn', () => {
  const tips = [0, 2, 4, 1, 3].map((k) => at(O, k * 72, 50));
  const { straps, below } = wovenPolygons([tips], 0.8, 0.7);
  assert.equal(below.size, 10, 'five crossings, each seen from both straps');
  for (const [key, under] of below) {
    const [i, j] = key.split(':');
    assert.equal(below.get(`${j}:${i}`), !under);
  }
  // Each side crosses two others: once over, once under.
  for (let i = 0; i < straps.length; i++) {
    const mine = [...below].filter(([key]) => key.startsWith(`${i}:`)).map(([, u]) => u);
    assert.deepEqual(mine.sort(), [false, true], `side ${i}`);
  }
});

test('a glory ray starts just clear of the figure at its heart', () => {
  const pts: Pt[] = Array.from({ length: 200 }, (_, k) => [6 * Math.sin(k * 1.7) * Math.cos(k * 0.3), 4 * Math.cos(k * 1.1)]);
  for (let k = 0; k < 64; k++) {
    const u = at(O, (k / 64) * 360, 1);
    const from = clearFrom(u, pts, 1.3, 20);
    // Stepping out from the centre, the last point still too near lies just short of where the ray starts.
    let last = 0;
    for (let t = 0; t < 20; t += 0.01) if (pts.some(([x, y]) => Math.hypot(x - u[0] * t, y - u[1] * t) < 1.3)) last = t;
    assert.ok(Math.abs(from - last) < 0.02, `ray ${k}: starts at ${from}, the figure ends at ${last}`);
  }
});
