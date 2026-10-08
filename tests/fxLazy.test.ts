// The effects layer's renderer isn't made as the page loads (lib/fx/core.ts):
// its context and shaders would hold up the first paint. It comes once two
// frames have gone by and the page is idle, or at once when an effect is
// asked for first; effects asked for meanwhile wait for it and play. And
// shaders are built without the page waiting on them (buildPrograms in
// lib/fx/gl.ts, which the backdrop's Delve programs use too): how a compile
// went is never asked right after it starts, and the programs are read one
// at a time, each in a step of its own.
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

/**
 * A WebGL2 context that accepts everything and logs the calls that matter
 * here; `parallel` offers KHR_parallel_shader_compile. Once `lost`, it makes
 * no shaders (and, as a browser does, throws on the null in their place).
 */
function fakeGl(parallel: boolean) {
  const log: string[] = [];
  const state = { done: false, lost: false, deleted: { programs: 0, shaders: 0 }, fails: new Set<number>() };
  let n = 0;
  const gl: object = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'LINK_STATUS') return LINK_STATUS;
        if (prop === 'isContextLost') return () => state.lost;
        if (prop === 'createShader') return () => (state.lost ? null : {});
        if (prop === 'shaderSource')
          return (s: object | null) => {
            if (!s) throw new TypeError('not a WebGLShader');
          };
        if (prop === 'canvas') return { width: 0, height: 0 };
        if (prop === 'getExtension')
          return (name: string) => {
            if (name.startsWith('EXT_')) log.push(`ext ${name}`);
            return name === 'KHR_parallel_shader_compile' ? (parallel ? { COMPLETION_STATUS_KHR: COMPLETION } : null) : { loseContext() {} };
          };
        if (prop === 'createProgram') return () => ({ id: ++n });
        if (prop === 'linkProgram') return (p: { id: number }) => log.push(`link ${p.id}`);
        if (prop === 'deleteProgram') return () => state.deleted.programs++;
        if (prop === 'deleteShader') return () => state.deleted.shaders++;
        if (prop === 'getProgramParameter')
          return (p: { id: number }, what: number) => {
            log.push(`${what === LINK_STATUS ? 'status' : 'done?'} ${p.id}`);
            return what === LINK_STATUS ? !state.fails.has(p.id) : state.done;
          };
        if (prop === 'getShaderParameter') return () => log.push('compiled?');
        if (prop === 'getShaderInfoLog' || prop === 'getProgramInfoLog') return () => (log.push('log'), 'why');
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
g.WebGL2RenderingContext = class {};
g.devicePixelRatio = 1;
g.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

const fx = await import('../src/lib/fx/core.ts');
const { ShapeType } = await import('../src/lib/fx/renderer.ts');
const { buildPrograms, buildProgramsNow, setGpuCatchUp } = await import('../src/lib/fx/gl.ts');

/** The effects' six programs read, a frame apart (without the backdrop: see buildPrograms). */
const readSix = () => {
  for (let i = 0; i < 6; i++) frame();
};
/** The frame after the context, in which whether it can draw to floats is asked: the shaders start in the next. */
const askFloat = () => frame();

/** The overlay's canvas; counts the contexts asked of it (and, with `refuse`, gives none). */
function overlay(parallel = true, refuse = false) {
  const ctx = fakeGl(parallel);
  const c = {
    asked: 0,
    clientWidth: 800,
    clientHeight: 600,
    style: {} as Record<string, string>,
    getContext() {
      c.asked++;
      return refuse ? null : ctx.gl;
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
  // Whether it can draw to floats is asked in the next frame, in a step of
  // its own; its shaders start in the one after, and are read once done.
  assert.ok(!o.ctx.log.some((l) => l.startsWith('ext')), 'not with the context');
  frame();
  assert.ok(o.ctx.log.includes('ext EXT_color_buffer_float'));
  assert.ok(!o.ctx.log.some((l) => l.startsWith('link')));
  frame();
  assert.equal(o.ctx.log.filter((l) => l.startsWith('link')).length, 6);
  frame();
  frame();
  assert.ok(!o.ctx.log.some((l) => l.startsWith('status')), 'not asked how a link went while compiling');
  o.ctx.state.done = true;
  frame();
  const read = () => o.ctx.log.filter((l) => l.startsWith('status')).length;
  assert.equal(read(), 1, 'read one at a time');
  for (let i = 2; i <= 6; i++) {
    frame();
    assert.equal(read(), i, 'a frame apart');
  }
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
  askFloat();
  frame();
  o.ctx.state.done = true;
  readSix();
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
    return () => {
      const i = held.indexOf(f);
      if (i >= 0) held.splice(i, 1);
    };
  });
  const o = overlay();
  const stop = fx.startFx(o.canvas);
  const s = glow();
  assert.equal(o.c.asked, 0, 'not while the GPU is busy');
  assert.equal(held.length, 1);
  assert.ok(fx.fxActive());
  held.shift()!();
  assert.equal(o.c.asked, 1, 'once it has caught up');
  // So is whether it can draw to floats, a frame later.
  frame();
  assert.equal(held.length, 1);
  assert.ok(!o.ctx.log.some((l) => l.startsWith('ext')));
  held.shift()!();
  assert.ok(o.ctx.log.includes('ext EXT_color_buffer_float'));
  // Its shaders are read only after the GPU has caught up again, one at a
  // time, each once it has caught up again (the backdrop holding on).
  frame();
  o.ctx.state.done = true;
  frame();
  assert.ok(!o.ctx.log.some((l) => l.startsWith('status')));
  for (let i = 1; i <= 6; i++) {
    assert.equal(held.length, 1);
    held.shift()!();
    assert.equal(o.ctx.log.filter((l) => l.startsWith('status')).length, i);
  }
  assert.equal(held.length, 0);
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

test('what was asked for meanwhile goes on from where it would be by now; what ran its course, was stopped or lost its element is dropped', () => {
  const real = performance.now;
  let t = real.call(performance);
  performance.now = () => t;
  try {
    const o = overlay();
    const stop = fx.startFx(o.canvas);
    const kept = glow();
    glow().stop();
    const el = Object.assign(new (g.Element as new () => object)(), { isConnected: true, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) });
    fx.shape({ type: ShapeType.Flash, at: el as Element, life: Infinity, color: [1, 1, 1], update() {} });
    fx.shape({ type: ShapeType.Flash, at: { x: 0, y: 0 }, life: 1, color: [1, 1, 1], update() {} });
    fx.particle({ x: 0, y: 0, life: 1, size: 2, color: [1, 1, 1] });
    fx.particle({ x: 0, y: 0, life: 5, size: 2, color: [1, 1, 1] });
    fx.shakeView(1);
    assert.equal(fx.fxStats().shapes, 4);
    assert.equal(fx.fxStats().particles, 2);
    el.isConnected = false;
    // A cold cache: its shaders take seconds.
    t += 2000;
    askFloat();
    frame();
    o.ctx.state.done = true;
    readSix();
    assert.equal(fx.fxStats().shapes, 1, 'only the endless one still in use');
    assert.equal(fx.fxStats().particles, 1, 'only the one still alive by now');
    assert.ok(!fx.shaking(), 'a shake asked for 2 s ago is over');
    kept.stop(0);
    stop();
  } finally {
    performance.now = real;
  }
});

test('a context lost before its shaders are built turns effects off, and says so', () => {
  const o = overlay(false);
  const stop = fx.startFx(o.canvas);
  const heard: boolean[] = [];
  const off = fx.onFxChange(() => heard.push(fx.fxActive()));
  glow();
  assert.equal(o.c.asked, 1);
  o.ctx.state.lost = true;
  askFloat();
  frame();
  idle();
  assert.ok(!fx.fxActive() && !fx.fxAvailable());
  assert.deepEqual(heard, [false]);
  assert.equal(fx.fxStats().shapes, 0);
  off();
  stop();
});

test('refused a context, effects turn off, and say so', () => {
  const o = overlay(true, true);
  const stop = fx.startFx(o.canvas);
  const heard: boolean[] = [];
  const off = fx.onFxChange(() => heard.push(fx.fxActive()));
  glow();
  assert.equal(o.c.asked, 1);
  assert.ok(!fx.fxActive() && !fx.fxAvailable());
  assert.deepEqual(heard, [false]);
  off();
  stop();
});

test('without WebGL2 nothing is on its way: effects are off from the start', () => {
  const had = g.WebGL2RenderingContext;
  delete g.WebGL2RenderingContext;
  try {
    const o = overlay();
    const stop = fx.startFx(o.canvas);
    assert.ok(!fx.fxActive() && !fx.fxAvailable());
    stop();
  } finally {
    g.WebGL2RenderingContext = had;
  }
});

test('with effects switched off, the renderer waits until they are on (and the switch stays there)', () => {
  fx.setFxOn(false);
  const o = overlay();
  const stop = fx.startFx(o.canvas);
  frame();
  frame();
  idle();
  assert.equal(o.c.asked, 0, 'not made while off');
  assert.ok(fx.fxAvailable());
  fx.setFxOn(true);
  assert.equal(o.c.asked, 1, 'made once on');
  stop();
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

test('a build finished on a lost context gives null, and starts nothing more on it', () => {
  const { gl, log, state } = fakeGl(false);
  let got: WebGLProgram[] | null | undefined;
  const b = buildPrograms(gl, ['a', 'b', 'c'].map((label) => ({ vs: 'v', fs: 'f', label })), (p) => (got = p), true);
  frame();
  idle();
  assert.equal(log.filter((l) => l.startsWith('link')).length, 1);
  state.lost = true;
  b.now();
  assert.equal(got, null);
  assert.equal(log.filter((l) => l.startsWith('link')).length, 1);
});

test('a build cancelled deletes its programs and their shaders', () => {
  const { gl, state } = fakeGl(false);
  const b = buildPrograms(gl, ['a', 'b'].map((label) => ({ vs: 'v', fs: 'f', label })), () => assert.fail('never done'), true);
  frame();
  idle();
  b.cancel();
  assert.deepEqual(state.deleted, { programs: 1, shaders: 2 });
});

test('with KHR_parallel_shader_compile every program starts at once, and is read only once the driver says all are done, one a step', () => {
  const { log, got } = steps(true, 3);
  assert.equal(got?.length, 3);
  assert.equal(log[0], '', 'nothing before the first frame');
  assert.equal(log[1], 'link 1 link 2 link 3');
  // Polled once a frame (never waiting) until done; read then.
  for (const s of log.slice(2, -3)) assert.match(s, /^(done\? \d ?)+$/);
  assert.match(log.at(-3)!, /^(done\? \d )+status 1$/);
  assert.deepEqual(log.slice(-2), ['status 2', 'status 3']);
});

test('without it, they start in an idle moment and are read a step later, one a step', () => {
  const { log, got } = steps(false, 3);
  assert.equal(got?.length, 3);
  assert.deepEqual(
    log.filter((s) => s),
    ['link 1 link 2 link 3', 'status 1', 'status 2', 'status 3'],
  );
});

test('a program that failed to link ends the build: the rest are not read, all are deleted, and a warning says why', () => {
  const { gl, log, state } = fakeGl(false);
  state.fails.add(2);
  const warn = console.warn;
  const warned: unknown[][] = [];
  console.warn = (...a: unknown[]) => warned.push(a);
  try {
    let got: WebGLProgram[] | null | undefined;
    buildPrograms(gl, ['a', 'b', 'c'].map((label) => ({ vs: 'v', fs: 'f', label })), (p) => (got = p));
    for (let i = 0; i < 6 && got === undefined; i++) {
      frame();
      idle();
    }
    assert.equal(got, null);
    assert.deepEqual(log.filter((l) => l.startsWith('status')), ['status 1', 'status 2']);
    // (Each with its shaders: those of the one read already were let go then, and are again.)
    assert.equal(state.deleted.programs, 3);
    assert.ok(state.deleted.shaders >= 6);
    assert.equal(warned.length, 1);
    assert.match(String(warned[0][0]), /^b failed/);
  } finally {
    console.warn = warn;
  }
});

test("built at once (the backdrop's first programs), every program starts before any is read, and only whether each linked is asked", () => {
  const { gl, log } = fakeGl(true);
  const got = buildProgramsNow(gl, ['a', 'b'].map((label) => ({ vs: 'v', fs: 'f', label })));
  assert.equal(got?.length, 2);
  assert.deepEqual(log, ['link 1', 'link 2', 'status 1', 'status 2']);
});

test('built at once, a failure gives null, with its logs, and deletes them all', () => {
  const { gl, log, state } = fakeGl(true);
  state.fails.add(1);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(buildProgramsNow(gl, ['a', 'b'].map((label) => ({ vs: 'v', fs: 'f', label }))), null);
  } finally {
    console.warn = warn;
  }
  assert.ok(log.includes('log'), 'why, read only now');
  assert.deepEqual(state.deleted, { programs: 2, shaders: 4 });
});

test("one at a time (the backdrop's large Delve programs), one starts in each idle moment, and none is read in the step that started one", () => {
  const { log, got } = steps(false, 3, true);
  assert.equal(got?.length, 3);
  const linked = log.filter((s) => s.includes('link'));
  assert.deepEqual(linked, ['link 1', 'link 2', 'link 3'], 'one a step');
  for (const s of log) assert.ok(!(s.includes('link') && s.includes('status')), `read right after a link: ${s}`);
  assert.deepEqual(log.slice(-3), ['status 1', 'status 2', 'status 3']);
});
