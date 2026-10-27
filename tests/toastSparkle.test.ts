// A toast's sparkle (restingBox, lib/flyIn.ts) plays where the toast comes to
// rest, not where its fly-in starts, from Svelte's stand-in of an intro on.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// (After asVite, which finds the modules they import by their names alone.)
const { restingBox } = await import('../src/lib/flyIn.ts');

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
