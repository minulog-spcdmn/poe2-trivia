import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thresholdArt, type ThresholdArt } from '../src/components/zonebanner/thresholdArt.ts';
import type { Head } from '../src/components/zonebanner/head.ts';
import { sigilOf, SIGIL_NAMES, zoneAt } from '../src/lib/zoneSigils.ts';
import { STRATA, stratumName } from '../src/lib/descent.ts';
import { ARCHETYPES, composedNames, NAME_MOST } from '../src/lib/archetypes.ts';
import { emblemOf } from '../src/lib/backdrops.ts';

// The head of the stage as measured in the app (Game.svelte's .head, a Delve
// run choosing at depth 141): a 375 px phone and a 1280 px desktop, and the
// zone name's font size (px) on each.
const PHONE: Head = { w: 343, h: 74.3, ky: 30.7, hx0: 129, hx1: 214, hy0: 32.7, hy1: 66.3, capTop: 41.2, base: 57.4, size: 23.2, by: 49.5, rl0: 0, rr1: 343, narrow: true };
const DESK: Head = { w: 1248, h: 122.5, ky: 30.7, hx0: 545.6, hx1: 702.4, hy0: 42.3, hy1: 104.9, capTop: 58, base: 88.3, size: 43.2, by: 73.6, rl0: 386.4, rr1: 861.6, narrow: false };
const EM = { phone: 16, desk: 21.12 };
// A name is as wide as its letters, about: measured on "Crypts of the Pale Choir" (24 characters).
const PER_CHAR = { phone: 165.2 / 24, desk: 219.4 / 24 };
const CASES = [
  { head: PHONE, em: EM.phone, per: PER_CHAR.phone },
  { head: DESK, em: EM.desk, per: PER_CHAR.desk },
];
const NAMES = ['The Mines', 'Deeper than ever', 'Crypts of the Pale Choir'];

/** Every point a path's data names (of an arc, its end). */
const points = (d: string) =>
  [...d.matchAll(/([MLA])([^MLAZ]*)/g)].flatMap(([, cmd, args]) => {
    const n = args.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const step = cmd === 'A' ? 7 : 2;
    return Array.from({ length: n.length / step }, (_, i) => [n[i * step + step - 2], n[i * step + step - 1]] as [number, number]);
  });
const strokes = (a: ThresholdArt) => [a.pillars, a.lintel, a.keystone, a.sill].flatMap((p) => p.strokes);
const all = (a: ThresholdArt) => strokes(a).flatMap((s) => points(s.d));

test('every biome has a sigil of its own, within its seal', () => {
  for (const s of STRATA) assert.ok(SIGIL_NAMES.includes(s.name), s.name);
  // Past depth 100 each stratum has a name of its own, and bears its archetype's zone's emblem.
  for (let k = 10; k < 30; k++) assert.ok(SIGIL_NAMES.includes(emblemOf(stratumName(k))!), stratumName(k));
  for (const a of ARCHETYPES) assert.ok(SIGIL_NAMES.includes(a.emblem), a.kind);
  for (let k = 10; k < 30; k++) assert.deepEqual(sigilOf(stratumName(k)), sigilOf(emblemOf(stratumName(k))!));
  for (const name of SIGIL_NAMES) {
    const { lines, fine } = sigilOf(name);
    assert.ok(lines.length > 20, name);
    for (const [x, y] of points(lines + fine)) assert.ok(Math.hypot(x, y) <= 10.6, `${name} reaches ${Math.hypot(x, y).toFixed(1)}`);
  }
});

test('the zone a depth is in', () => {
  assert.equal(zoneAt(1), 'The Mines');
  assert.equal(zoneAt(10), 'The Mines');
  assert.equal(zoneAt(11), 'Magma Fissure');
  assert.equal(zoneAt(21), 'Frozen Hollow');
  assert.equal(zoneAt(100), 'Primeval Ruins');
  for (let d = 1; d <= 100; d++) assert.ok(SIGIL_NAMES.includes(zoneAt(d)), `depth ${d}`);
  // Past 100 the stratum's own name, which bears its archetype's zone's emblem.
  for (let d = 101; d < 400; d++) assert.ok(SIGIL_NAMES.includes(emblemOf(zoneAt(d))!), `depth ${d}: ${zoneAt(d)}`);
});

test('the gate keeps to the head: in the column, clear of the player strip above and the cards below', () => {
  for (const { head, em, per } of CASES)
    for (const name of NAMES) {
      const a = thresholdArt(head, per * name.length, em);
      // The head keeps room above the banner, so the keystone stays within it (the player strip is above the head).
      assert.ok(a.top >= -2, `${name}: the keystone reaches ${a.top.toFixed(1)}`);
      for (const [x, y] of all(a)) {
        assert.ok(x >= -0.5 && x <= head.w + 0.5, `${name}: x ${x} outside the column`);
        assert.ok(y >= a.top - 0.5 && y <= head.h, `${name}: y ${y} outside the head`);
      }
    }
});

test("the gate stands round the heading, never over its letters", () => {
  for (const { head, em, per } of CASES)
    for (const name of NAMES) {
      const a = thresholdArt(head, per * name.length, em);
      // The lintel clears the capitals, the sill the descenders.
      assert.ok(a.yb <= head.capTop - 3, `${name}: the lintel comes down to ${a.yb}`);
      for (const [x, y] of all(a)) {
        const over = x > head.hx0 - 1 && x < head.hx1 + 1 && y > head.capTop - 1 && y < head.base + head.size * 0.2;
        assert.ok(!over, `${name}: (${x}, ${y}) over the heading`);
      }
    }
});

test('the name has room on the lintel: no line touches it, and air above, below and to either side', () => {
  for (const { head, em, per } of CASES)
    for (const name of NAMES) {
      const w = per * name.length;
      const a = thresholdArt(head, w, em);
      const [x0, x1] = [a.name[0] - w / 2, a.name[0] + w / 2];
      // About a fifth of the letters' size clear above and below them, between the lintel's inner lines.
      const face = a.yb - a.yt;
      assert.ok(face >= em * 1.2, `${name}: the lintel is ${face.toFixed(1)} tall for ${em} px letters`);
      assert.ok(a.x0 <= x0 - 18 && a.x1 >= x1 + 18, `${name}: the lintel's ends crowd the name`);
      for (const [x, y] of all(a)) {
        const on = x > x0 - 2 && x < x1 + 2 && y > a.name[1] - em * 0.45 && y < a.name[1] + em * 0.45;
        assert.ok(!on, `${name}: a line at (${x}, ${y}) runs into the name`);
      }
    }
});

test('the keystone holds the sigil, set in the crown', () => {
  for (const { head, em, per } of CASES) {
    const a = thresholdArt(head, per * 16, em);
    assert.ok(a.sign.s >= 10, `the sigil is ${a.sign.s.toFixed(1)} px`);
    assert.ok(Math.abs(a.sign.c[0] - a.cx) < 0.01);
    // Within the keystone, from its top down to the lintel's cornice.
    assert.ok(a.sign.c[1] - a.sign.s / 2 >= a.top - 0.5 && a.sign.c[1] + a.sign.s / 2 <= a.yt + 4, 'the sigil spills out of its keystone');
  }
});

test('the lintel is drawn out from the middle, and the gate is built in about a second', () => {
  const a = thresholdArt(DESK, PER_CHAR.desk * 13, EM.desk);
  const main = a.lintel.strokes.filter((s) => s.kind === 'main');
  const from = (s: (typeof main)[number]) => Math.abs(points(s.d)[0][0] - a.cx);
  const sorted = [...main].sort((p, q) => p.delay - q.delay);
  assert.ok(from(sorted[0]) < from(sorted.at(-1)!));
  // The keystone is set at 0.72 s (Threshold.svelte); everything else is drawn by then or soon after.
  assert.ok(Math.max(...strokes(a).map((s) => s.delay + s.t)) <= 1);
});

test("the endgame's names fit the gate on a 375 px phone, as the zones' do", () => {
  const names = ARCHETYPES.flatMap((a) => [...a.names, ...composedNames(a)]);
  const longest = Math.max(...names.map((n) => n.length));
  assert.ok(longest <= NAME_MOST, `${longest} characters`);
  // And the gate is made for 24 (a little past the longest), with room to spare.
  for (const chars of [longest, 24]) {
    const a = thresholdArt(PHONE, PER_CHAR.phone * chars, EM.phone);
    assert.ok(a.x0 >= 0 && a.x1 <= PHONE.w, `${chars} characters: the lintel runs from ${a.x0} to ${a.x1}`);
  }
});
