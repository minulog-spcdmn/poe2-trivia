import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DELVE_MIN_TIMER,
  FINDS_FROM,
  delveTimer,
  shownDepth,
} from "../src/lib/delve.ts";
import {
  depthLabel,
  LAST,
  NUM_RISE,
  OUT,
  reachedOf,
  serpentLight,
  shaftLayout,
  STAR_R,
  starAt,
  textWidth,
  zoneLabels,
  ZONES,
} from "../src/lib/descentShaft.ts";

/** The first depth on the shortest clock (internal), as the component finds it. */
const FAST_FROM = Array.from({ length: 200 }, (_, i) => i + 1).find(
  (d) => delveTimer(d) <= DELVE_MIN_TIMER,
)!;
const layouts = [184, 281, 329].map((w) =>
  shaftLayout(
    w,
    w < 250 ? 218 : 216,
    "three",
    FINDS_FROM,
    FAST_FROM,
    delveTimer(1),
    DELVE_MIN_TIMER,
  ),
);
/** A note's words as one string, its lines joined by a space. */
const say = (L: (typeof layouts)[number], id: string) =>
  L.notes
    .find((n) => n.id === id)!
    .lines.map((line) => line.map((r) => r.text).join(""))
    .join(" ");

describe("the descent shaft", () => {
  for (const L of layouts) {
    const y = (d: number | null) => starAt(L, d);
    /** The band of rock a point lies in (0-9), or -1 above the zones, 10 below them. */
    const band = (py: number) =>
      py < L.S ? -1 : Math.min(10, Math.floor((py - L.S) / L.band));

    it(`rests at the mouth before a first run (${L.w} px)`, () => {
      assert.equal(y(null).at, "rest");
      assert.equal(y(0).at, "rest");
      assert.ok(y(null).p[1] < L.S + 1);
    });

    it(`keeps the star inside its zone's band, clear of the seams (${L.w} px)`, () => {
      for (let d = 1; d <= LAST; d++) {
        const { p, zone } = y(d);
        assert.equal(zone, Math.floor((d - 1) / 10));
        assert.equal(band(p[1] - STAR_R), zone);
        assert.equal(band(p[1] + STAR_R), zone);
      }
      // A zone's last depth and the next one's first sit in different bands.
      assert.equal(band(y(10).p[1]), 0);
      assert.equal(band(y(11).p[1]), 1);
      assert.equal(band(y(100).p[1]), 9);
    });

    it(`goes deeper with every depth to 100, and past the zones beyond it (${L.w} px)`, () => {
      for (let d = 2; d <= LAST; d++) assert.ok(y(d).p[1] > y(d - 1).p[1]);
      for (const d of [101, 134, 999]) {
        assert.equal(y(d).at, "past");
        assert.ok(y(d).p[1] - STAR_R > L.foot);
      }
    });

    it(`sets a depth past 100 under the shaft, in the chamber, not beside the last zone (${L.w} px)`, () => {
      const top = y(101).p[1] - NUM_RISE - 8;
      assert.ok(top > L.foot + 2, `number top ${top} vs foot ${L.foot}`);
      // The chamber walls run down from the foot at the rock's outer edge, wider than "9999" set at 10 px.
      assert.ok(2 * OUT - 2 > 25);
    });

    it(`keeps the notes inside the box, the lives on the surface left of the mouth (${L.w} px)`, () => {
      for (const n of L.notes) {
        const wide = Math.max(...n.lines.map(textWidth));
        if (n.anchor === "end") {
          assert.equal(n.id, "lives");
          assert.ok(n.x - wide >= 0 && n.x < L.X - OUT && n.y < L.S);
        } else {
          // The width is estimated per character and runs a few px wide on narrow letters (measured: "first finds at 5" is 64 px, estimated 73).
          assert.ok(
            n.x + wide <= L.w + 6,
            `${n.id} ends at ${n.x + wide} in ${L.w}`,
          );
        }
      }
    });

    it(`says its depths as a player reads them (${L.w} px)`, () => {
      assert.ok(
        say(L, "finds").endsWith(` ${shownDepth(FINDS_FROM)}`),
        say(L, "finds"),
      );
      assert.equal(shownDepth(FINDS_FROM), 4);
      assert.ok(
        say(L, "clock").includes(` ${shownDepth(FAST_FROM)};`),
        say(L, "clock"),
      );
      assert.equal(shownDepth(FAST_FROM), 95);
      assert.ok(say(L, "zones").includes("every 10"), say(L, "zones"));
      assert.equal(say(L, "endless"), `endless from ${shownDepth(LAST + 1)}`);
      assert.equal(shownDepth(LAST + 1), 100);
      // The finds note still stands at the depth it speaks of (internal 5, in the first zone's band).
      const finds = L.notes.find((n) => n.id === "finds")!;
      assert.ok(Math.abs(finds.y - starAt(L, FINDS_FROM).p[1]) < 5);
    });

    it(`stops the surface short of the lives rather than underlining them (${L.w} px)`, () => {
      const lives = L.notes.find((n) => n.id === "lives")!;
      const [x0, x1] = [
        lives.x - Math.max(...lives.lines.map(textWidth)),
        lives.x,
      ];
      // On the line's level, not above it with the line running under: no piece of the surface spans the words.
      assert.ok(Math.abs(lives.y - L.S) < 4);
      for (const p of L.surface) {
        const xs = [...p.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) =>
          Number(m[1]),
        );
        const [a, b] = [Math.min(...xs), Math.max(...xs)];
        assert.ok(
          b <= x0 + 0.01 || a >= x1 + 2,
          `surface ${a}-${b} under the lives ${x0}-${x1}`,
        );
      }
      // The ground still runs from the words to the mouth.
      const starts = L.surface.map((p) => Number(/^M(-?[\d.]+)/.exec(p.d)![1]));
      assert.ok(starts.some((x) => x > x1 && x < L.X));
    });
  }

  it("sets the star's depth as a player reads it: one less than the internal depth", () => {
    assert.equal(depthLabel(null), null);
    assert.equal(depthLabel(0), null);
    // A run that ended at the first depth reads 0, its star in the first zone.
    assert.equal(depthLabel(1), "0");
    // Internal 10 and 11 read 9 and 10: the first zone's last depth, the second zone's first.
    const L = layouts[1];
    assert.equal(depthLabel(10), "9");
    assert.equal(starAt(L, 10).zone, 0);
    assert.equal(depthLabel(11), "10");
    assert.equal(starAt(L, 11).zone, 1);
    assert.equal(depthLabel(100), "99");
    assert.equal(starAt(L, 100).zone, 9);
    // Internal 101 reads 100, past the zones.
    assert.equal(depthLabel(101), "100");
    assert.equal(starAt(L, 101).at, "past");
    assert.equal(depthLabel(999), "998");
  });

  it("lights the ouroboros only past 100, more the deeper", () => {
    assert.equal(serpentLight(null), 0);
    assert.equal(serpentLight(100), 0);
    assert.ok(serpentLight(101) > 0);
    assert.ok(serpentLight(999) > serpentLight(134) + 0.3);
    assert.ok(serpentLight(5000) <= 1);
  });

  it("names only the zones reached (no spoilers)", () => {
    assert.equal(
      zoneLabels(null).every((z) => z === null),
      true,
    );
    assert.equal(reachedOf(10), 1);
    assert.equal(reachedOf(11), 2);
    const at11 = zoneLabels(11);
    assert.deepEqual(
      at11.slice(0, 2).map((z) => z?.name),
      [ZONES[0].name, ZONES[1].name],
    );
    assert.equal(
      at11.slice(2).every((z) => z === null),
      true,
    );
    assert.equal(
      zoneLabels(100).every((z) => z !== null),
      true,
    );
    assert.equal(
      zoneLabels(999).every((z) => z !== null),
      true,
    );
  });
});
