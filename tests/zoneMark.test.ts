import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, type Head, type Variant } from '../src/lib/zoneMark.ts';
import { sigilOf, SIGIL_NAMES, zoneAt } from '../src/lib/zoneSigils.ts';
import { ornamentOf, ORNAMENT_NAMES } from '../src/lib/zoneOrnaments.ts';
import { STRATA, stratumName } from '../src/lib/descent.ts';

// The head of the stage as measured in the app: a 375 px phone and a 1280 px desktop.
const PHONE: Head = { w: 343, h: 58, ky: 14.5, capTop: 26.1, by: 34, hx0: 134, hx1: 209, rl0: 1, rr1: 342, nameW: 113, nameH: 18.4 };
const DESK: Head = { w: 1233, h: 107, ky: 14.5, capTop: 42.8, by: 57.5, hx0: 547, hx1: 686, rl0: 388, rr1: 845, nameW: 140, nameH: 22 };
// A group run: a long heading ("Bartholomew's turn") leaves short rules.
const LONG: Head = { ...PHONE, hx0: 61, hx1: 282, rl0: 1, rr1: 342 };
const VARIANTS: Variant[] = ['banner', 'ribbon', 'seal', 'nameplate', 'cartouche', 'medallion'];

/** Every point a path's data names (of an arc, its end). */
const points = (d: string) =>
  [...d.matchAll(/([MLA])([^MLAZ]*)/g)].flatMap(([, cmd, args]) => {
    const n = args.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const step = cmd === 'A' ? 7 : 2;
    return Array.from({ length: n.length / step }, (_, i) => [n[i * step + step - 2], n[i * step + step - 1]] as [number, number]);
  });

test('every biome has a sigil of its own, within its seal', () => {
  for (const s of STRATA) assert.ok(SIGIL_NAMES.includes(s.name), s.name);
  // Past depth 100 the strata are named after a biome too.
  for (let k = 10; k < 30; k++) assert.ok(SIGIL_NAMES.includes(stratumName(k)));
  for (const name of SIGIL_NAMES) {
    const { lines, fine } = sigilOf(name);
    assert.ok(lines.length > 20, name);
    for (const [x, y] of points(lines + fine)) assert.ok(Math.hypot(x, y) <= 10.6, `${name} reaches ${Math.hypot(x, y).toFixed(1)}`);
  }
});

test('the mark keeps to the head, clear of the heading and of what lies below', () => {
  for (const head of [PHONE, DESK, LONG])
    for (const v of VARIANTS) {
      const m = layout(v, head);
      const all = [...m.strokes.flatMap((s) => points(s.d)), ...(m.plate ?? []), ...m.seals.flatMap((s) => [[s.c[0] - s.r, s.c[1] + s.r] as [number, number], [s.c[0] + s.r, s.c[1] - s.r] as [number, number]])];
      for (const [x, y] of all) {
        assert.ok(x >= -0.5 && x <= head.w + 0.5, `${v}: x ${x} outside the column`);
        // Never below the head (the cards and the question), and only a little above it.
        assert.ok(y <= head.h && y >= -12, `${v}: y ${y} outside the head`);
        // Never over the heading's letters.
        const overHeading = x > head.hx0 - 1 && x < head.hx1 + 1 && y > head.capTop - 1 && y < head.by + (head.by - head.capTop);
        assert.ok(!overHeading, `${v}: (${x}, ${y}) over the heading`);
      }
    }
});

test('the ribbon is small: about the name, and no taller than the kicker and a little', () => {
  for (const head of [PHONE, DESK]) {
    for (const v of ['ribbon', 'nameplate', 'cartouche', 'medallion'] as const) {
      const { body, box, seals } = layout(v, head);
      const [w, h] = [body!.x1 - body!.x0, body!.y1 - body!.y0];
      assert.ok(h <= head.nameH * 1.4, `${v}: ${h} tall`);
      assert.ok(w <= head.nameW + 6 * h, `${v}: ${w} wide`);
      // Clear of the heading below, seals and all.
      assert.ok(Math.max(body!.y1, ...seals.map((s) => s.c[1] + s.r)) <= head.capTop - 2, v);
      // Its light comes off its upper edge, not across the name.
      assert.ok(box.y + box.h <= body!.y0 + 1, v);
    }
  }
});

test('lines stop short of the seals', () => {
  for (const head of [PHONE, DESK])
    for (const v of ['ribbon', 'seal', 'nameplate', 'cartouche', 'medallion'] as const) {
      const m = layout(v, head);
      assert.equal(m.seals.length, 2, v);
      for (const s of m.strokes)
        for (const [x, y] of points(s.d))
          for (const seal of m.seals) assert.ok(Math.hypot(x - seal.c[0], y - seal.c[1]) >= seal.r + 0.9, `${v}: a line runs into a seal`);
    }
});

test('the pen sweeps out from the middle', () => {
  const m = layout('ribbon', DESK);
  const mid = DESK.w / 2;
  const main = m.strokes.filter((s) => s.kind === 'main');
  const first = (s: (typeof main)[number]) => Math.abs(points(s.d)[0][0] - mid);
  const sorted = [...main].sort((a, b) => a.delay - b.delay);
  assert.ok(first(sorted[0]) < first(sorted.at(-1)!));
  // Drawn in about 0.6 s.
  assert.ok(Math.max(...main.map((s) => s.delay + s.t)) <= 0.7);
});

test('a seal too big for short rules is left out rather than crowding the heading', () => {
  const m = layout('seal', { ...LONG, hx0: 20, hx1: 323 });
  assert.equal(m.seals.length, 0);
  assert.equal(m.rules, false);
});

test('the zone a depth is in', () => {
  assert.equal(zoneAt(1), 'The Mines');
  assert.equal(zoneAt(10), 'The Mines');
  assert.equal(zoneAt(11), 'Magma Fissure');
  assert.equal(zoneAt(21), 'Frozen Hollow');
  assert.equal(zoneAt(100), 'Primeval Ruins');
  for (let d = 1; d < 400; d++) assert.ok(SIGIL_NAMES.includes(zoneAt(d)) && ORNAMENT_NAMES.includes(zoneAt(d)), `depth ${d}`);
});

test("each zone's ornament runs out from the point within the ribbon's height, and the whole stays in the column", () => {
  for (const head of [PHONE, DESK]) {
    const m = layout('ribbon', head);
    assert.equal(m.ends.length, 2);
    assert.ok(m.L >= 16);
    for (const e of m.ends) {
      const outer = e.at[0] + e.dir * m.L;
      assert.ok(outer >= 0 && outer <= head.w, `ornament reaches ${outer}`);
    }
    for (const name of ORNAMENT_NAMES) {
      const o = ornamentOf(name, m.L, m.s);
      assert.ok(o.strokes.length >= 3, name);
      for (const [x, y] of [...o.strokes.flatMap((st) => points(st.d)), ...o.lights.map((l) => l.c)]) {
        assert.ok(x <= 0.5 && x >= -m.L - 1, `${name}: x ${x.toFixed(1)} beyond its length`);
        assert.ok(Math.abs(y) <= m.s * 1.25, `${name}: y ${y.toFixed(1)} beyond the ribbon`);
      }
    }
  }
});
