// How the backdrop (lib/backdrop.ts) builds its lean programs as it starts:
// the main pass, the soft light and the UI pass (the UI's box shadows and
// fills, the slowest to build, drawn over the main pass) all started at
// once, so the driver builds them side by side, then read for the first
// frame; nothing more is built after. Where the backdrop draws none of the
// UI's parts (a touch screen), there's no UI pass, and its main pass has
// none of them.
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

const g = globalThis as Record<string, unknown>;
const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
g.localStorage = storage;
g.sessionStorage = storage;
const stub = (): object => ({ style: {}, offsetHeight: 600, setAttribute() {}, remove() {}, getContext: () => null });
g.document = {
  hidden: false,
  documentElement: { hasAttribute: () => false },
  body: { append() {} },
  createElement: stub,
  addEventListener() {},
  removeEventListener() {},
};
/** Whether the screen is a touch one (pointer: coarse). */
let coarse = false;
g.matchMedia = (q: string) => ({ matches: q.includes('coarse') && coarse, addEventListener() {}, removeEventListener() {} });
g.devicePixelRatio = 1;
g.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
let queued: ((now: number) => void)[] = [];
let ids = 0;
g.requestAnimationFrame = (f: (now: number) => void) => (queued.push(f), ++ids);
g.cancelAnimationFrame = () => {};
let clock = 0;
/** Runs one animation frame (and what an idle moment would). */
function frame() {
  clock += 16;
  const now = queued;
  queued = [];
  for (const f of now) f(clock);
}

const { startBackdrop } = await import('../src/lib/backdrop.ts');
const { backdropShadow } = await import('../src/lib/backdropShadow.ts');

/** Which pass a fragment shader is: the UI pass; the main one with all the UI's parts (no float target), only its drop shadows (the UI pass after it), or none; or the soft light. */
const kindOf = (fs: string) =>
  fs.includes('uBackdrop') ? 'ui' : fs.includes('uElX') ? 'full' : fs.includes('uMkA') ? 'main' : fs.includes('uniform sampler2D uSmooth') ? 'bare' : 'smooth';

/** A WebGL2 context that logs what's linked and read, by pass. */
function fakeGl(parallel = true, floats = true) {
  const log: string[] = [];
  const state = { done: false, fails: new Set<string>() };
  const consts = new Map<string, number>();
  const K = (name: string) => {
    if (!consts.has(name)) consts.set(name, consts.size + 1);
    return consts.get(name)!;
  };
  type Prog = { kind?: string };
  const methods: Record<string, unknown> = {
    isContextLost: () => false,
    getShaderPrecisionFormat: () => ({ precision: 23 }),
    getSupportedExtensions: () => (floats ? ['EXT_color_buffer_float'] : []),
    getExtension: (name: string) =>
      name === 'KHR_parallel_shader_compile' ? (parallel ? { COMPLETION_STATUS_KHR: K('COMPLETION_STATUS_KHR') } : null) : name === 'WEBGL_lose_context' ? { loseContext() {} } : {},
    getParameter: (p: number) => (p === K('MAX_FRAGMENT_UNIFORM_VECTORS') ? 1024 : 'fake'),
    checkFramebufferStatus: () => K('FRAMEBUFFER_COMPLETE'),
    getSyncParameter: () => K('SIGNALED'),
    createProgram: () => ({}),
    createShader: () => ({}),
    shaderSource: (s: { src?: string }, src: string) => (s.src = src),
    attachShader: (p: Prog, s: { src: string }) => {
      if (s.src.includes('out vec4 fragColor')) p.kind = kindOf(s.src);
    },
    linkProgram: (p: Prog) => log.push(`link ${p.kind}`),
    getProgramParameter: (p: Prog, what: number) => {
      if (what === K('LINK_STATUS')) {
        log.push(`read ${p.kind}`);
        return !state.fails.has(p.kind!);
      }
      return state.done;
    },
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
  };
  const gl = new Proxy(
    {},
    {
      get(_, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop in methods) return methods[prop];
        if (/^[A-Z0-9_]+$/.test(prop)) return K(prop);
        return () => ({});
      },
    },
  );
  return { gl, log, state };
}

function fakeCanvas(gl: object) {
  const attrs = new Set<string>();
  return {
    attrs,
    clientWidth: 800,
    clientHeight: 600,
    width: 0,
    height: 0,
    getContext: () => gl,
    toggleAttribute: (name: string, on: boolean) => void (on ? attrs.add(name) : attrs.delete(name)),
    removeAttribute: (name: string) => void attrs.delete(name),
    addEventListener() {},
    removeEventListener() {},
  };
}

/** Starts the backdrop on a fresh fake context: its log, and how to step and stop it. */
function start(parallel = true, fails: string[] = [], floats = true) {
  const { gl, log, state } = fakeGl(parallel, floats);
  for (const f of fails) state.fails.add(f);
  const canvas = fakeCanvas(gl);
  let lost = false;
  const stop = startBackdrop(canvas as unknown as HTMLCanvasElement, () => (lost = true));
  return { log, state, canvas, stop, lost: () => lost };
}
/** A few frames, done or not. */
const frames = () => {
  for (let i = 0; i < 6; i++) frame();
};

test('the main pass, the soft light and the UI pass all start at once, and are read for the first frame; nothing more is built', () => {
  const b = start();
  assert.ok(b.stop, 'started');
  assert.deepEqual(b.log, ['link main', 'link smooth', 'link ui', 'read main', 'read smooth', 'read ui']);
  b.state.done = true;
  frames();
  assert.equal(b.log.length, 6);
  b.stop!();
});

test('on a touch screen the main pass has none of the UI parts, and there is no UI pass', () => {
  coarse = true;
  try {
    const b = start();
    assert.deepEqual(b.log, ['link bare', 'link smooth', 'read bare', 'read smooth']);
    b.state.done = true;
    frames();
    assert.equal(b.log.length, 4);
    b.stop!();
  } finally {
    coarse = false;
  }
});

test('without a float target to draw into, it is all one main pass, the soft light worked out in it', () => {
  const b = start(true, [], false);
  assert.deepEqual(b.log, ['link full', 'read full']);
  b.stop!();
});

test('without KHR_parallel_shader_compile they are read at once all the same', () => {
  const b = start(false);
  assert.deepEqual(b.log, ['link main', 'link smooth', 'link ui', 'read main', 'read smooth', 'read ui']);
  b.stop!();
});

test('one failing to build leaves the page to the CSS backdrop', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const b = start(true, ['ui']);
    assert.equal(b.stop, null);
  } finally {
    console.warn = warn;
  }
});
