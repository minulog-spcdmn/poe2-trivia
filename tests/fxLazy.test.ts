// The effects layer's renderer isn't made as the page loads (lib/fx/core.ts):
// its context and shaders would hold up the first paint. It comes once two
// frames have gone by and the page is idle, or at once when an effect is
// asked for first; effects asked for meanwhile wait for it and play. And
// shaders are built without the page waiting on them (buildPrograms in
// lib/fx/gl.ts, which the backdrop's Delve programs use too): how a compile
// went is never asked right after it starts.
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

// Frames and idle moments run only when a test says so.
let frames: (() => void)[] = [];
let idles: (() => void)[] = [];
let ids = 0;
const queued = new Map<number, () => void>();
const g = globalThis as Record<string, unknown>;
g.requestAnimationFrame = (f: () => void) => {
  const id = ++ids;
  const run = () => queued.delete(id) && f();
  queued.set(id, run);
  frames.push(run);
  return id;
};
g.cancelAnimationFrame = (id: number) => queued.delete(id);
g.requestIdleCallback = (f: () => void) => {
  const id = ++ids;
  const run = () => queued.delete(id) && f();
  queued.set(id, run);
  idles.push(run);
  return id;
};
g.cancelIdleCallback = (id: number) => queued.delete(id);
const frame = () => {
  const now = frames;
  frames = [];
  for (const f of now) f();
};
const idle = () => {
  const now = idles;
  idles = [];
  for (const f of now) f();
};

const LINK_STATUS = 0x8b82;
const COMPLETION = 0x91b1;

/** A WebGL2 context that accepts everything and logs the calls that matter here; `parallel` offers KHR_parallel_shader_compile. */
function fakeGl(parallel: boolean) {
  const log: string[] = [];
  const state = { done: false };
  let n = 0;
  const gl: object = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'LINK_STATUS') return LINK_STATUS;
        if (prop === 'isContextLost') return () => false;
        if (prop === 'canvas') return { width: 0, height: 0 };
        if (prop === 'getExtension')
          return (name: string) => (name === 'KHR_parallel_shader_compile' ? (parallel ? { COMPLETION_STATUS_KHR: COMPLETION } : null) : { loseContext() {} });
        if (prop === 'createProgram') return () => ({ id: ++n });
        if (prop === 'linkProgram') return (p: { id: number }) => log.push(`link ${p.id}`);
        if (prop === 'getProgramParameter')
          return (p: { id: number }, what: number) => {
            log.push(`${what === LINK_STATUS ? 'status' : 'done?'} ${p.id}`);
            return what === LINK_STATUS ? true : state.done;
          };
        if (prop === 'drawArraysInstanced' || prop === 'drawArrays') return () => log.push('draw');
        if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return 1;
        return () => ({});
      },
    },
  );
  return { gl: gl as WebGL2RenderingContext, log, state };
}

g.document = {
  documentElement: { hasAttribute: () => false },
  body: {},
  createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({}) }) }),
};
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.Element = class {};
g.devicePixelRatio = 1;
g.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

const fx = await import('../src/lib/fx/core.ts');
const { ShapeType } = await import('../src/lib/fx/renderer.ts');
const { buildPrograms, setGpuCatchUp } = await import('../src/lib/fx/gl.ts');

/** The overlay's canvas; counts the contexts asked of it. */
function overlay(parallel = true) {
  const ctx = fakeGl(parallel);
  const c = {
    asked: 0,
    clientWidth: 800,
    clientHeight: 600,
    style: {} as Record<string, string>,
    getContext() {
      c.asked++;
      return ctx.gl;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return { canvas: c as unknown as HTMLCanvasElement, c, ctx };
}

const glow = () =>
  fx.shape({
    type: ShapeType.Flash,
    at: { x: 100, y: 100 },
    life: Infinity,
    color: [1, 1, 1],
    update(f) {
      f.hw = f.hh = 20;
      f.k = 1;
    },
  });

test('the renderer is made once two frames have gone by and the page is idle, not as the overlay mounts', () => {
  const o = overlay();
  const stop = fx.startFx(o.canvas);
  assert.equal(o.c.asked, 0, 'no context as it mounts');
  assert.ok(fx.fxActive(), 'effects count as on meanwhile');
  frame();
  assert.equal(o.c.asked, 0, 'nor in the first frame');
  frame();
  assert.equal(o.c.asked, 0, 'nor the second: it waits for an idle moment');
  idle();
  assert.equal(o.c.asked, 1, 'made when idle');
  // Its shaders start in the next frame, and are read once done.
  assert.ok(!o.ctx.log.some((l) => l.startsWith('link')));
  frame();
  assert.equal(o.ctx.log.filter((l) => l.startsWith('link')).length, 6);
  frame();
  frame();
  assert.ok(!o.ctx.log.some((l) => l.startsWith('status')), 'not asked how a link went while compiling');
  o.ctx.state.done = true;
  frame();
  assert.equal(o.ctx.log.filter((l) => l.startsWith('status')).length, 6);
  assert.ok(fx.fxAvailable());
  stop();
});

test('an effect asked for before then starts the renderer at once, waits for it, and plays', () => {
  const o = overlay();
  const stop = fx.startFx(o.canvas);
  const s = glow();
  assert.ok(fx.isLive(s), 'kept, not dropped');
  assert.equal(o.c.asked, 1, 'the renderer started at once');
  assert.equal(fx.fxStats().shapes, 1);
  assert.ok(!fx.fxStats().running, 'nothing drawn before the renderer is ready');
  frame();
  o.ctx.state.done = true;
  frame();
  assert.ok(fx.fxStats().running, 'playing once it is');
  frame();
  assert.ok(o.ctx.log.includes('draw'), 'and drawn');
  assert.equal(fx.fxStats().shapes, 1);
  s.stop(0);
  stop();
});

test('with the backdrop running, the context is asked for only once the GPU has caught up with it', () => {
  // (The backdrop holds its frames until a fence passes: whenGpuCaughtUp.)
  const held: (() => void)[] = [];
  setGpuCatchUp((f) => {
    held.push(f);
    return () => held.splice(held.indexOf(f), 1);
  });
  const o = overlay();
  const stop = fx.startFx(o.canvas);
  const s = glow();
  assert.equal(o.c.asked, 0, 'not while the GPU is busy');
  assert.equal(held.length, 1);
  assert.ok(fx.fxActive());
  held.shift()!();
  assert.equal(o.c.asked, 1, 'once it has caught up');
  // Its shaders are read only after the GPU has caught up again.
  frame();
  o.ctx.state.done = true;
  frame();
  assert.ok(!o.ctx.log.some((l) => l.startsWith('status')));
  assert.equal(held.length, 1);
  held.shift()!();
  assert.equal(o.ctx.log.filter((l) => l.startsWith('status')).length, 6);
  assert.ok(fx.fxStats().running, 'and the effect plays');
  setGpuCatchUp(null);
  s.stop(0);
  stop();
});

test('without the effects layer mounted, nothing is made and effects are off', () => {
  // (After the cleanup above, as on a page without the overlay.)
  assert.ok(!fx.fxActive());
  assert.ok(!fx.isLive(glow()));
});

/** Runs a build to its end, a frame and an idle moment at a time; the log marks each step. */
function steps(parallel: boolean, n: number, oneAtATime = false) {
  const { gl, log, state } = fakeGl(parallel);
  let got: WebGLProgram[] | null | undefined;
  buildPrograms(
    gl,
    Array.from({ length: n }, (_, i) => ({ vs: 'v', fs: 'f', label: `p${i}` })),
    (p) => (got = p),
    oneAtATime,
  );
  for (let i = 0; i < 20 && got === undefined; i++) {
    log.push('|');
    if (i === 4) state.done = true;
    frame();
    idle();
  }
  return { log: log.join(' ').split('|').map((s) => s.trim()), got };
}

test('with KHR_parallel_shader_compile every program starts at once, and is read only once the driver says all are done', () => {
  const { log, got } = steps(true, 3);
  assert.equal(got?.length, 3);
  assert.equal(log[0], '', 'nothing before the first frame');
  assert.equal(log[1], 'link 1 link 2 link 3');
  // Polled once a frame (never waiting) until done; read then.
  for (const s of log.slice(2, -1)) assert.match(s, /^(done\? \d ?)+$/);
  assert.match(log.at(-1)!, /status 1 status 2 status 3$/);
});

test('without it, they start in an idle moment and are read a step later', () => {
  const { log, got } = steps(false, 3);
  assert.equal(got?.length, 3);
  assert.deepEqual(
    log.filter((s) => s),
    ['link 1 link 2 link 3', 'status 1 status 2 status 3'],
  );
});

test("one at a time (the backdrop's large Delve programs), one starts in each idle moment, and none is read in the step that started one", () => {
  const { log, got } = steps(false, 3, true);
  assert.equal(got?.length, 3);
  const linked = log.filter((s) => s.includes('link'));
  assert.deepEqual(linked, ['link 1', 'link 2', 'link 3'], 'one a step');
  for (const s of log) assert.ok(!(s.includes('link') && s.includes('status')), `read right after a link: ${s}`);
  assert.equal(log.at(-1), 'status 1 status 2 status 3');
});
