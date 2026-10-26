// A toast's edge as the effects layer reads it. Its outer ring (ringOf,
// lib/corner.ts) hides the page's light with its box, so a streak's fire
// under a toast doesn't burn along its edge; on a phone the gaps above the
// toasts hide it too (hideGaps, lib/fx/gaps.ts), so it doesn't burn in a thin
// line between them; and its sparkle (restingBox, lib/flyIn.ts) plays where
// the toast comes to rest, not where its fly-in starts, from Svelte's
// stand-in of an intro on.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HideLight } from '../src/lib/fx/renderer.ts';
import type { Stood } from '../src/lib/fx/gaps.ts';

// (After asVite, which finds the modules they import by their names alone.)
const { ringOf } = await import('../src/lib/corner.ts');
const { restingBox } = await import('../src/lib/flyIn.ts');
const { hideGaps, UNDER_HEADER } = await import('../src/lib/fx/gaps.ts');
const { MAX_HIDES } = await import('../src/lib/fx/renderer.ts');

test('a ring is the widest shadow that is all spread, as Chrome and WebKit write it', () => {
  const toast = 'rgba(0, 0, 0, 0.65) 0px 0px 0px 1px, rgba(255, 220, 150, 0.07) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.55) 0px 10px 26px 0px';
  assert.equal(ringOf(toast), 1);
  assert.equal(ringOf('0px 0px 0px 1px rgba(0, 0, 0, 0.65), 0px 10px 26px 0px rgba(0, 0, 0, 0.55)'), 1, 'its colour last');
  assert.equal(ringOf('rgb(12, 10, 8) 0px 0px 0px 2px, rgb(109, 83, 41) 0px 0px 0px 3px, rgba(201, 164, 92, 0.22) 0px 0px 12px 0px'), 3, 'the widest of two');
});

test('no shadow, or only an offset, blurred or inset one, is no ring', () => {
  assert.equal(ringOf('none'), 0);
  assert.equal(ringOf(''), 0);
  assert.equal(ringOf('rgba(0, 0, 0, 0.55) 0px 10px 26px 0px'), 0);
  assert.equal(ringOf('rgba(0, 0, 0, 0.5) 0px 0px 8px 2px'), 0, 'spread under a blur');
  assert.equal(ringOf('rgba(0, 0, 0, 0.5) 1px 0px 0px 2px'), 0, 'offset');
  assert.equal(ringOf('rgb(0, 0, 0) 0px 0px 0px 3px inset'), 0);
  assert.equal(ringOf('inset 0px 0px 0px 3px rgb(0, 0, 0)'), 0);
});

test('colours in any space are read past, their numbers and commas too', () => {
  assert.equal(ringOf('color(srgb 0 0 0 / 0.65) 0px 0px 0px 2px'), 2);
  assert.equal(ringOf('oklab(0.2 0.01 -0.02 / 0.5) 0px 0px 0px 1.5px, oklch(0.5 0.1 80) 0px 4px 9px 0px'), 1.5);
});

test("the ring holds while the toast's arrival flare (ignite) settles", () => {
  const mid = 'rgba(0, 0, 0, 0.65) 0px 0px 0px 1px, rgba(255, 220, 150, 0.07) 0px 1px 0px 0px inset, rgba(115, 94, 49, 0.4) 0px 5px 25px 0px, rgba(0, 0, 0, 0.275) 0px 5px 13px 0px';
  assert.equal(ringOf(mid), 1);
  assert.equal(ringOf('rgba(0, 0, 0, 0.65) 0px 0px 0px 1px, rgba(0, 0, 0, 0.0001) 0px 1e-05px 2.6e-05px 0px'), 1);
});

const g = globalThis as Record<string, unknown>;
class Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  constructor(x: number, y: number, width: number, height: number) {
    [this.x, this.y, this.width, this.height] = [x, y, width, height];
  }
  get left() {
    return this.x;
  }
  get top() {
    return this.y;
  }
  get right() {
    return this.x + this.width;
  }
  get bottom() {
    return this.y + this.height;
  }
}
g.DOMRect = Rect;
g.DOMMatrix = class {
  e = 0;
  f = 0;
  constructor(t: string) {
    if (t === 'none' || t === '') return;
    const m = /^matrix\(1, 0, 0, 1, (-?[\d.]+), (-?[\d.]+)\)$/.exec(t) ?? /^translate\((-?[\d.]+)px, ?(-?[\d.]+)px\)$/.exec(t);
    if (!m) throw new SyntaxError(`can't read ${t}`);
    [this.e, this.f] = [Number(m[1]), Number(m[2])];
  }
};
let computed = 'none';
g.getComputedStyle = () => ({ transform: computed });

type Anim = { playState: string; frames: string[] };
function toast(at: { x: number; y: number }, now: string, anims: Anim[], zoom = 1) {
  computed = now;
  return {
    currentCSSZoom: zoom,
    getBoundingClientRect: () => new Rect(at.x, at.y, 373, 52),
    getAnimations: () => anims.map((a) => ({ playState: a.playState, effect: { getKeyframes: () => a.frames.map((transform) => ({ transform })) } })),
  } as unknown as Element;
}
const at = (r: DOMRect | Element) => {
  assert.ok(r instanceof Rect, 'a box of its own');
  return { x: r.x, y: r.y };
};

test("on Svelte's stand-in alone (its first pose held, before the fly is made) the toast rests where it stands without it", () => {
  const start = 'translate(0px, -24px)';
  for (const playState of ['finished', 'running', 'idle']) {
    const el = toast({ x: 10, y: 46 }, 'matrix(1, 0, 0, 1, 0, -24)', [{ playState, frames: [start, start] }]);
    assert.deepEqual(at(restingBox(el)), { x: 10, y: 70 }, playState);
  }
  const wide = toast({ x: 1084, y: 900 }, 'matrix(1, 0, 0, 1, 56, 0)', [{ playState: 'finished', frames: ['translate(56px, 0px)', 'translate(56px, 0px)'] }], 1.5);
  assert.deepEqual(at(restingBox(wide)), { x: 1000, y: 900 });
});

test('on its fly, part way in, the toast rests where the fly ends', () => {
  const fly = { playState: 'running', frames: ['translate(0px, -24px)', 'translate(0px, -12px)', 'translate(0px, 0px)'] };
  assert.deepEqual(at(restingBox(toast({ x: 10, y: 58 }, 'matrix(1, 0, 0, 1, 0, -12)', [fly]))), { x: 10, y: 70 });
  const done = toast({ x: 10, y: 70 }, 'none', [{ ...fly, playState: 'finished' }]);
  assert.equal(restingBox(done), done);
});

test('with no transform moving it, or one it cannot read, its box is as it is', () => {
  const still = toast({ x: 10, y: 70 }, 'none', []);
  assert.equal(restingBox(still), still);
  const fading = toast({ x: 10, y: 70 }, 'none', [{ playState: 'running', frames: [] }]);
  assert.equal(restingBox(fading), fading);
  const odd = toast({ x: 10, y: 46 }, 'translate(0px, -50%)', [{ playState: 'running', frames: ['translate(0px, -50%)', 'none'] }]);
  assert.equal(restingBox(odd), odd);
});

// A phone's stack (Toasts.svelte's narrow one) as dialogNow measures it: the
// header's bottom at 56, the toasts 6px under it and 0.4rem (6.4px) apart,
// each 355 by 52 with its 1px ring round it, so 357 by 54, 5px under the
// header and 4.4px apart, its 4px corners 5 round the ring.
const HEADER = 56;
const stack = {};
function front(top: number, { x = 9, w = 357, round = 5, amount = 1, parent = stack } = {}): Stood {
  return { el: { parentElement: parent } as unknown as Element, box: new Rect(x, top, w, 54) as unknown as DOMRect, round, amount };
}

/** The gaps hideGaps adds for `fronts` (each one's edges, to a thousandth of a px), and how often it asked for the header. */
function gaps(fronts: Stood[], header: number | null = HEADER, hides: HideLight[] = []) {
  const had = hides.length;
  let asked = 0;
  hideGaps(fronts, hides, () => (asked++, header));
  const px = (n: number) => Math.round(n * 1000) / 1000;
  const boxes = hides.slice(had).map(({ box: b, radius, amount }) => ({ left: px(b.left), top: px(b.top), right: px(b.right), bottom: px(b.bottom), radius, amount }));
  return { boxes, asked };
}

test('the gap over the first toast hides from the header down, past its corners, as wide as it', () => {
  assert.deepEqual(gaps([front(61, { amount: 0.6 })]), { boxes: [{ left: 9, top: 56, right: 366, bottom: 66, radius: 0, amount: 0.6 }], asked: 1 });
  // As far under it as a toast may rest, and no further.
  assert.equal(gaps([front(HEADER + UNDER_HEADER)]).boxes.length, 1);
  assert.deepEqual(gaps([front(HEADER + UNDER_HEADER + 0.5)]).boxes, []);
  // With no header showing there is nothing to meet.
  assert.deepEqual(gaps([front(61)], null).boxes, []);
});

test('a toast still flying in, over the header or against it, leaves no gap', () => {
  assert.deepEqual(gaps([front(40)]).boxes, []);
  assert.deepEqual(gaps([front(HEADER)]).boxes, []);
});

test("the gap between two toasts runs from past the upper one's corners to past the lower one's, across both", () => {
  const upper = front(61);
  // (The lower one fading in, its corners rounder, and set off to one side: the gap is only as wide as both share, and hides as little as the fainter.)
  const lower = front(119.4, { x: 12, round: 7, amount: 0.4 });
  assert.deepEqual(gaps([upper, lower], null).boxes, [{ left: 12, top: 110, right: 366, bottom: 126.4, radius: 0, amount: 0.4 }]);
  const { boxes } = gaps([front(61, { x: 12, amount: 0.3 }), front(119.4)], null);
  assert.deepEqual([boxes[0].left, boxes[0].right, boxes[0].amount], [12, 366, 0.3], 'the upper one set off, and the fainter');
  // With the header, the first toast's gap too.
  assert.deepEqual(
    gaps([lower, upper]).boxes.map((b) => [b.top, b.bottom]),
    [
      [110, 126.4],
      [56, 66],
    ],
  );
});

test('a toast pairs with the nearest above it, never one further up or beside it', () => {
  const top = front(61);
  const middle = front(119.4);
  const bottom = front(177.8);
  // (In any order, as the fronts come: the nearest one above listed before the other, or after it.)
  for (const order of [
    [bottom, top, middle],
    [bottom, middle, top],
    [middle, top, bottom],
  ]) {
    const { boxes, asked } = gaps(order);
    assert.deepEqual(
      boxes.map((b) => [b.top, b.bottom]).sort((a, b) => a[0] - b[0]),
      [
        [56, 66],
        [110, 124.4],
        [168.4, 182.8],
      ],
    );
    assert.equal(asked, 1, 'the header asked once, for the first toast alone');
  }
  // One that shares no width with it isn't above it: alone under the header, the lower has no gap.
  const beside = front(119.4, { x: 400 });
  assert.deepEqual(gaps([top, beside], null).boxes, []);
});

test('two toasts further apart, or one flying in over the other, leave no gap between them', () => {
  const upper = front(61);
  assert.deepEqual(gaps([upper, front(115 + UNDER_HEADER + 0.5)], null).boxes, []);
  assert.equal(gaps([upper, front(115 + UNDER_HEADER)], null).boxes.length, 1);
  // Overlapping the one above it, so not under it, and far under the header: the upper one's gap alone.
  assert.deepEqual(
    gaps([upper, front(100)]).boxes.map((b) => [b.top, b.bottom]),
    [[56, 66]],
  );
});

test('fronts in different parents never pair', () => {
  const dock = front(61, { parent: {} });
  const toast = front(119.4);
  assert.deepEqual(gaps([dock, toast], null).boxes, []);
  // Each goes to the header instead, which is read once for both.
  assert.deepEqual(
    gaps([dock, toast]).boxes.map((b) => [b.top, b.bottom]),
    [[56, 66]],
  );
  assert.equal(gaps([dock, toast]).asked, 1);
  // A front of another parent above the first toast leaves it under the header.
  const bar = front(-50, { parent: {} });
  assert.deepEqual(
    gaps([bar, front(61)]).boxes.map((b) => [b.top, b.bottom]),
    [[56, 66]],
  );
});

test('it adds no more than the renderer draws', () => {
  const three = () => [front(61), front(119.4), front(177.8)];
  const room = (n: number): HideLight[] => Array.from({ length: n }, () => ({ box: new Rect(0, 0, 1, 1) as unknown as DOMRect, radius: 0, amount: 1 }));
  const hides = room(MAX_HIDES - 1);
  assert.equal(gaps(three(), HEADER, hides).boxes.length, 1);
  assert.equal(hides.length, MAX_HIDES);
  const full = gaps(three(), HEADER, room(MAX_HIDES));
  assert.deepEqual(full, { boxes: [], asked: 0 });
  assert.deepEqual(gaps([]), { boxes: [], asked: 0 });
});
