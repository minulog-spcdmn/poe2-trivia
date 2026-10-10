// The effects layer's covers (light from behind the UI hides behind the UI's
// boxes: lib/fx/core.ts cover, FxRenderer.setCover), run against a stand-in
// WebGL2 context that records what is uploaded. A cover must not outlive a
// lost context, the mask is drawn again only when the boxes move a step of
// its own grid, a shaking view moves the mask rather than measuring the UI
// every frame, and without the canvas's blur filter (older Safari) text's
// soft covers are built of faint layers, never a solid plate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The app's own imports leave out the extension (Vite finds the file).
registerHooks({
  resolve(spec, context, next) {
    if (/^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec) && context.parentURL?.includes('/src/')) {
      try {
        return next(spec + '.ts', context);
      } catch {
        /* not a .ts module: resolved as written below */
      }
    }
    return next(spec, context);
  },
});

type Call = { name: string; args: unknown[] };

/** A 2D context that records what's drawn, with or without `filter`. */
function fake2d(filter: boolean) {
  const calls: Call[] = [];
  const ctx: Record<string, unknown> = { fillStyle: '', globalAlpha: 1, calls };
  if (filter) ctx.filter = 'none';
  for (const name of ['clearRect', 'fillRect', 'beginPath', 'roundRect', 'fill', 'save', 'restore']) {
    ctx[name] = (...args: unknown[]) => calls.push({ name, args: [...args, ctx.fillStyle, ctx.globalAlpha] });
  }
  return ctx;
}

let filterSupported = true;
const canvases: { ctx: ReturnType<typeof fake2d> }[] = [];
function fakeCanvas2d() {
  const c = { width: 0, height: 0, ctx: fake2d(filterSupported), getContext: () => c.ctx };
  canvases.push(c);
  return c;
}

/** A WebGL2 context that accepts everything; counts texture uploads from a canvas (the cover's mask). */
function fakeGl() {
  const state = { lost: false, maskUploads: 0 };
  const gl: object = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'isContextLost') return () => state.lost;
        if (prop === 'canvas') return {};
        if (prop === 'getExtension') return () => ({ loseContext() {} });
        if (prop === 'texImage2D')
          return (...args: unknown[]) => {
            if (args.length === 6) state.maskUploads++;
          };
        if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return 1;
        return () => ({});
      },
    },
  );
  return { gl, state };
}

const g = globalThis as Record<string, unknown>;
g.document = {
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
  documentElement: { hasAttribute: () => false },
  body: {},
  createElement: () => fakeCanvas2d(),
};
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.Element = class {};
g.WebGL2RenderingContext = class {};
g.devicePixelRatio = 1;
g.requestAnimationFrame = () => 1;
g.cancelAnimationFrame = () => {};
g.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

const fx = await import('../src/lib/fx/core.ts');
const { ShapeType, FxRenderer, coverKey } = await import('../src/lib/fx/renderer.ts');

/** The overlay's canvas, its WebGL context lost and restored on demand. */
function overlay() {
  let ctx = fakeGl();
  const on: Record<string, (e: unknown) => void> = {};
  const canvas = {
    clientWidth: 800,
    clientHeight: 600,
    style: {},
    getContext: () => ctx.gl,
    addEventListener: (type: string, f: (e: unknown) => void) => (on[type] = f),
    removeEventListener() {},
  };
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    get gl() {
      return ctx.state;
    },
    lose() {
      ctx.state.lost = true;
      on.webglcontextlost({ preventDefault() {} });
    },
    restore() {
      ctx = fakeGl();
      on.webglcontextrestored({});
    },
  };
}

/** Something drawn, so frames render (and ask the covers). */
const glow = () =>
  fx.shape({
    type: ShapeType.Flash,
    at: { x: 100, y: 100 },
    life: Infinity,
    color: [1, 1, 1],
    update(f) {
      f.hw = f.hh = 20;
      f.q[0] = 8;
      f.k = 1;
    },
  });

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height }) as DOMRect;

const o = overlay();
const stopFx = fx.startFx(o.canvas);

test('a cover is gone after the context is lost, and its handle still stops safely', () => {
  let asked = 0;
  const handle = fx.cover(() => {
    asked++;
    return [{ box: rect(50, 50, 200, 100) }];
  });
  const s = glow();
  fx.fxStep(1 / 60);
  assert.ok(asked > 0, 'asked while it is up');
  assert.equal(o.gl.maskUploads, 1);

  o.lose();
  o.restore();
  asked = 0;
  const s2 = glow();
  fx.fxStep(1 / 60);
  fx.fxStep(1 / 60);
  assert.equal(asked, 0, 'not asked once the context was lost');
  assert.equal(o.gl.maskUploads, 0, 'no mask on the new context');
  handle.stop();
  s.stop(0);
  s2.stop(0);
  fx.fxStep(0.1);
});

test('the mask is drawn again only when a box moves a step of its grid', () => {
  let x = 100;
  const handle = fx.cover(() => [{ box: rect(x, 80, 120, 60), radii: [12, 12, 12, 12] }]);
  const s = glow();
  const before = o.gl.maskUploads;
  for (let i = 0; i < 8; i++) {
    fx.fxStep(1 / 60);
    x += 1;
  }
  const n = o.gl.maskUploads - before;
  assert.ok(n >= 2 && n <= 3, `8 frames moving 1px each: ${n} uploads`);
  handle.stop();
  s.stop(0);
  fx.fxStep(0.1);
});

test('while the view shakes, the mask moves with it rather than being measured', () => {
  let asked = 0;
  const handle = fx.cover(() => {
    asked++;
    return [{ box: rect(300, 200, 100, 40) }];
  });
  const s = glow();
  fx.fxStep(1 / 60);
  assert.equal(asked, 1);
  fx.shakeView(0.5, 6);
  for (let i = 0; i < 10; i++) fx.fxStep(1 / 60);
  assert.equal(asked, 1, 'not asked while shaking');
  // Trauma falls 1.6 a second: the shake is over well within a second.
  fx.fxStep(1);
  assert.ok(!fx.shaking());
  fx.fxStep(1 / 60);
  assert.ok(asked > 1, 'asked again once it is still');
  handle.stop();
  s.stop(0);
  fx.fxStep(0.1);
});

test('turning the effects off drops every cover', () => {
  let asked = 0;
  fx.cover(() => {
    asked++;
    return [{ box: rect(0, 0, 10, 10) }];
  });
  fx.setFxOn(false);
  fx.setFxOn(true);
  const s = glow();
  fx.fxStep(1 / 60);
  assert.equal(asked, 0);
  s.stop(0);
  fx.fxStep(0.1);
});

test.after(() => stopFx());

test('the key rounds positions, sizes and corners to the mask grid, never the soft flag', () => {
  const box = (x: number, soft: number, r = 0) => [x, 10, 100, 40, soft, r, r, r, r];
  const view: [number, number] = [800, 600];
  assert.equal(coverKey(box(100, 0), view), coverKey(box(101, 0), view));
  assert.notEqual(coverKey(box(100, 0), view), coverKey(box(104, 0), view));
  assert.notEqual(coverKey(box(100, 0), view), coverKey(box(100, 1), view), 'soft or not is kept');
  assert.equal(coverKey(box(100, 0, 12), view), coverKey(box(100, 0, 13), view));
  assert.notEqual(coverKey(box(100, 0), view), coverKey(box(100, 0), [801, 600]), 'the view exactly');
});

/** The fills drawn for one soft box: each one's alpha and left edge (mask px), and the filter left set. */
function softFills(filter: boolean) {
  filterSupported = filter;
  const { gl } = fakeGl();
  const r = FxRenderer.create({ getContext: () => gl } as unknown as HTMLCanvasElement, { maxParticles: 10, maxShapes: 10 })!;
  r.setCover([40, 40, 200, 24, 1, 0, 0, 0, 0], [800, 600]);
  const ctx = canvases.at(-1)!.ctx;
  // (Each call's arguments end with the fill style and global alpha it was drawn with.)
  return (ctx.calls as Call[])
    .filter((c) => c.name === 'fillRect' || c.name === 'roundRect')
    .map((c) => {
      const style = String(c.args.at(-2));
      const alpha = Number(/([\d.]+)\)$/.exec(style)?.[1] ?? 1) * Number(c.args.at(-1));
      return { alpha, x: c.args[0] as number, filter: ctx.filter };
    });
}

test('soft covers are blurred where the canvas can, and built of faint layers where it cannot', () => {
  const blurred = softFills(true);
  assert.equal(blurred.length, 1);
  assert.match(String(blurred[0].filter), /blur/);
  const layered = softFills(false);
  assert.ok(layered.length > 1, 'several layers');
  assert.ok(layered.every((f) => f.alpha < 0.5), 'each one faint');
  // Together about as strong in the middle as the blurred one.
  const middle = 1 - layered.reduce((k, f) => k * (1 - f.alpha), 1);
  assert.ok(middle > 0.55 && middle < 0.8, `middle ${middle.toFixed(2)}`);
  // Narrower than the blurred one's padding at the outside.
  assert.ok(Math.min(...layered.map((f) => f.x)) >= blurred[0].x);
});
