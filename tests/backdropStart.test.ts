// How the backdrop (lib/backdrop.ts) builds its lean programs as it starts:
// the main pass, the soft light and the UI pass (the UI's box shadows and
// fills, the slowest to build, drawn over the main pass) all started at
// once, so the driver builds them side by side, then read for the first
// frame; nothing more is built until the page is idle. Then one main pass
// with all the UI's parts is built in the background, drawn once off the
// frame in an idle moment (so the driver finishes it there, not in a frame
// that shows), and takes over from the two, the UI pass and its layer let
// go. Delve's programs go the same way: built to leave the boxes to the UI
// pass while it's there, warmed off the frame (in the frame, a step at a
// time, while a Delve scene shows without them), then replaced by ones
// that draw the boxes too. Where the backdrop draws none of the UI's parts
// (a touch screen), there's no UI pass, and its main pass has none of
// them; should the pointer change, one with them is built and takes over.
// And the canvas has an alpha channel only where an opaque one stalls the
// page (opaqueCanvasStalls).
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
g.matchMedia = (q: string) => ({
  get matches() {
    return q.includes('coarse') && coarse;
  },
  addEventListener() {},
  removeEventListener() {},
});
g.devicePixelRatio = 1;
g.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
let queued = new Map<number, (now: number) => void>();
let ids = 0;
g.requestAnimationFrame = (f: (now: number) => void) => (queued.set(++ids, f), ids);
g.cancelAnimationFrame = (id: number) => void queued.delete(id);
let idleQueued = new Map<number, () => void>();
g.requestIdleCallback = (f: () => void) => (idleQueued.set(++ids, f), ids);
g.cancelIdleCallback = (id: number) => void idleQueued.delete(id);
/** Whether an idle moment is running (else a frame, or the start). */
let inIdle = false;
let clock = 0;
/** Runs one animation frame. */
function frame() {
  clock += 16;
  const now = [...queued.values()];
  queued = new Map();
  for (const f of now) f(clock);
}
/** Runs one idle moment: whatever waited for one. */
function idle() {
  const now = [...idleQueued.values()];
  idleQueued = new Map();
  inIdle = true;
  try {
    for (const f of now) f();
  } finally {
    inIdle = false;
  }
}

const { startBackdrop, opaqueCanvasStalls, wantDelveBackdrop, delveBackdropReady } = await import('../src/lib/backdrop.ts');
const { backdropShadow } = await import('../src/lib/backdropShadow.ts');
const { setDescent, snapDescent } = await import('../src/lib/descent.ts');

/** Which pass a fragment shader is: the UI pass; the main one with all the UI's parts, only its drop shadows (the UI pass after it), or none; or the soft light. Delve's say so. */
const kindOf = (fs: string) =>
  (fs.includes('uniform vec4 uCityA') || fs.includes('uniform vec4 uFxK') ? 'delve ' : '') +
  (fs.includes('fragColor = ui;') ? 'ui' : fs.includes('uElX') ? 'full' : fs.includes('uMkA') ? 'main' : fs.includes('uniform sampler2D uSmooth') ? 'bare' : 'smooth');

/** The backdrop's targets, by the texture unit their texture is on (or a renderbuffer's: the texel a main pass is warmed into). */
const TARGETS: Record<number, string> = { 3: 'soft light', 4: 'UI layer' };

/** A WebGL2 context that logs what's linked and read, by pass; what's drawn, where and when; and what's let go. */
function fakeGl(parallel = true, floats = true) {
  const log: string[] = [];
  /** Each draw: the program's kind, where it drew (the canvas, or a target by what it holds, see TARGETS), whether it was a texel's worth (a warming) and when (a frame, or an idle moment). */
  const draws: { kind: string; into: string; texel: boolean; idle: boolean }[] = [];
  /** What was let go: programs by kind, targets by name. */
  const deleted: string[] = [];
  const state = { done: false, fails: new Set<string>() };
  const consts = new Map<string, number>();
  const K = (name: string) => {
    if (!consts.has(name)) consts.set(name, consts.size + 1);
    return consts.get(name)!;
  };
  type Prog = { kind?: string };
  let current: Prog | null = null;
  type Target = { name: string };
  let bound: Target | null = null;
  let unit = 0;
  let texel = false;
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
    useProgram: (p: Prog) => (current = p),
    createFramebuffer: (): Target => ({ name: '?' }),
    bindFramebuffer: (_: number, fb: Target | null) => (bound = fb),
    deleteFramebuffer: (fb: Target | null) => fb && deleted.push(fb.name),
    activeTexture: (u: number) => (unit = u - K('TEXTURE0')),
    createTexture: () => ({ unit: -1 }),
    bindTexture: (_: number, t: { unit: number } | null) => t && (t.unit = unit),
    framebufferTexture2D: (_a: number, _b: number, _c: number, t: { unit: number }) => (bound!.name = TARGETS[t.unit] ?? `unit ${t.unit}`),
    framebufferRenderbuffer: () => (bound!.name = 'texel'),
    deleteProgram: (p: Prog) => deleted.push(p.kind ?? '?'),
    viewport: (_x: number, _y: number, w: number, h: number) => (texel = w === 1 && h === 1),
    drawArrays: () => draws.push({ kind: current?.kind ?? '?', into: bound?.name ?? 'canvas', texel, idle: inIdle }),
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
  return { gl, log, state, draws, deleted };
}

function fakeCanvas(gl: object) {
  const attrs = new Set<string>();
  /** What the context was asked for with. */
  const asked: { options?: WebGLContextAttributes } = {};
  return {
    attrs,
    asked,
    clientWidth: 800,
    clientHeight: 600,
    width: 0,
    height: 0,
    getContext: (_: string, options: WebGLContextAttributes) => ((asked.options = options), gl),
    toggleAttribute: (name: string, on: boolean) => void (on ? attrs.add(name) : attrs.delete(name)),
    removeAttribute: (name: string) => void attrs.delete(name),
    addEventListener() {},
    removeEventListener() {},
  };
}

/** Starts the backdrop on a fresh fake context: its logs, and how to step and stop it. */
function start(parallel = true, fails: string[] = [], floats = true) {
  const { gl, log, state, draws, deleted } = fakeGl(parallel, floats);
  for (const f of fails) state.fails.add(f);
  const canvas = fakeCanvas(gl);
  let lost = false;
  queued = new Map();
  idleQueued = new Map();
  const stop = startBackdrop(canvas as unknown as HTMLCanvasElement, () => (lost = true));
  return { log, state, canvas, stop, draws, deleted, lost: () => lost };
}
/** A few frames, done or not. */
const frames = () => {
  for (let i = 0; i < 6; i++) frame();
};
/** Frames and idle moments in turn, enough for anything waiting on either. */
const settle = () => {
  for (let i = 0; i < 12; i++) {
    frame();
    idle();
  }
};

test('the main pass, the soft light and the UI pass all start at once, and are read for the first frame; nothing more is built until the page is idle', () => {
  const b = start();
  assert.ok(b.stop, 'started');
  assert.deepEqual(b.log, ['link main', 'link smooth', 'link ui', 'read main', 'read smooth', 'read ui']);
  b.state.done = true;
  frames();
  assert.equal(b.log.length, 6);
  b.stop!();
});

test('once the page is idle, one main pass with all the UI parts is built, warmed off the frame, and takes over from the two', () => {
  const b = start();
  b.state.done = true;
  frames();
  settle();
  assert.deepEqual(b.log.slice(6), ['link full', 'read full']);
  const shown = b.draws.findIndex((d) => d.kind === 'full' && d.into === 'canvas');
  assert.ok(shown > 0, 'the merged pass draws the frame in the end');
  // Its first draw: in an idle moment, into a texel of its own.
  assert.deepEqual(
    b.draws.filter((d, i) => i < shown && d.kind === 'full'),
    [{ kind: 'full', into: 'texel', texel: true, idle: true }],
  );
  // Then the two passes are let go (the first main pass, the UI pass and its layer) and not drawn again.
  for (const k of ['main', 'ui', 'UI layer']) assert.ok(b.deleted.includes(k), `${k} let go: ${b.deleted.join()}`);
  assert.ok(
    b.draws.slice(shown).every((d) => d.kind === 'full' || d.kind === 'smooth'),
    'only the merged pass and the soft light after',
  );
  const count = b.log.length;
  settle();
  assert.equal(b.log.length, count, 'nothing more is built');
  b.stop!();
});

test('stopped while the merged pass is warmed, it is let go and never shows', () => {
  const b = start();
  b.state.done = true;
  for (let i = 0; i < 12 && !b.draws.some((d) => d.kind === 'full'); i++) {
    frame();
    idle();
  }
  assert.ok(
    b.draws.some((d) => d.kind === 'full' && d.idle),
    'warming',
  );
  b.stop!();
  assert.ok(b.deleted.includes('full'), b.deleted.join());
  const count = b.draws.length;
  settle();
  assert.equal(b.draws.length, count, 'nothing drawn after');
  assert.ok(!b.draws.some((d) => d.kind === 'full' && d.into === 'canvas'), 'never shown');
});

test('on a touch screen the main pass has none of the UI parts, and there is no UI pass', () => {
  coarse = true;
  try {
    const b = start();
    assert.deepEqual(b.log, ['link bare', 'link smooth', 'read bare', 'read smooth']);
    b.state.done = true;
    frames();
    settle();
    assert.equal(b.log.length, 4, 'nothing to merge: nothing more is built');
    b.stop!();
  } finally {
    coarse = false;
  }
});

test('without a float target to draw into, it is all one main pass, the soft light worked out in it', () => {
  const b = start(true, [], false);
  assert.deepEqual(b.log, ['link full', 'read full']);
  b.state.done = true;
  settle();
  assert.equal(b.log.length, 2, 'nothing to merge');
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

test('the merged pass failing to build keeps the two passes', () => {
  const b = start();
  b.state.done = true;
  frames();
  b.state.fails.add('full');
  settle();
  assert.ok(b.log.includes('read full'), b.log.join());
  assert.ok(!b.deleted.includes('ui'), 'the UI pass kept');
  frame();
  assert.equal(b.draws.at(-1)?.kind, 'main', 'the first main pass still draws the frame');
  assert.ok(!b.draws.some((d) => d.kind === 'full' && d.into === 'canvas'));
  b.stop!();
});

test('the pointer turned to touch before the page was idle: the two passes give way to one with none of the UI parts', () => {
  const b = start();
  b.state.done = true;
  frames();
  coarse = true;
  try {
    settle();
  } finally {
    coarse = false;
  }
  assert.deepEqual(b.log.slice(6), ['link bare', 'read bare']);
  for (const k of ['main', 'ui', 'UI layer']) assert.ok(b.deleted.includes(k), `${k} let go: ${b.deleted.join()}`);
  assert.equal(b.draws.filter((d) => d.into === 'canvas').at(-1)?.kind, 'bare');
  b.stop!();
});

test('the canvas has an alpha channel only where an opaque one stalls the page: Chrome and its kin on Windows', () => {
  const chrome = (os: string) => `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36`;
  assert.equal(opaqueCanvasStalls(chrome('Windows NT 10.0; Win64; x64')), true);
  assert.equal(opaqueCanvasStalls(chrome('Windows NT 10.0; Win64; x64') + ' Edg/141.0.0.0'), true);
  assert.equal(opaqueCanvasStalls('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0'), false);
  assert.equal(opaqueCanvasStalls(chrome('Macintosh; Intel Mac OS X 10_15_7')), false);
  assert.equal(opaqueCanvasStalls(chrome('X11; Linux x86_64')), false);
  assert.equal(opaqueCanvasStalls(chrome('Linux; Android 10; K') + ' Mobile'), false);
  assert.equal(
    opaqueCanvasStalls('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'),
    false,
  );
  const b = start();
  assert.equal(b.canvas.asked.options?.alpha, opaqueCanvasStalls(globalThis.navigator?.userAgent ?? ''));
  b.stop!();
});

test('the pointer turned from touch: a main pass with all the UI parts is built, warmed off the frame, and takes over', () => {
  coarse = true;
  const b = start();
  b.state.done = true;
  frames();
  coarse = false;
  settle();
  assert.deepEqual(b.log.slice(4), ['link full', 'read full']);
  const shown = b.draws.findIndex((d) => d.kind === 'full' && d.into === 'canvas');
  assert.ok(shown > 0, 'it draws the frame in the end');
  assert.deepEqual(
    b.draws.filter((d, i) => i < shown && d.kind === 'full'),
    [{ kind: 'full', into: 'texel', texel: true, idle: true }],
  );
  assert.ok(b.deleted.includes('bare'), b.deleted.join());
  const count = b.log.length;
  settle();
  assert.equal(b.log.length, count, 'nothing more is built');
  b.stop!();
});

test('the pointer turned from touch and the main pass with the UI parts failing to build: they are left to CSS, and it is not tried again', () => {
  const warn = console.warn;
  const warned: string[] = [];
  console.warn = (m: string) => void warned.push(m);
  coarse = true;
  try {
    const b = start();
    b.state.done = true;
    b.state.fails.add('full');
    frames();
    coarse = false;
    settle();
    settle();
    assert.deepEqual(b.log.slice(4), ['link full', 'read full'], 'tried once');
    assert.equal(warned.filter((m) => /left|leaves/.test(String(m))).length, 1, warned.join(' | '));
    assert.equal(b.draws.filter((d) => d.into === 'canvas').at(-1)?.kind, 'bare', 'the bare pass still draws');
    b.stop!();
  } finally {
    coarse = false;
    console.warn = warn;
  }
});

// (Last: once Delve is on its way it stays so, and every backdrop after builds Delve's programs as it starts.)
test("Delve wanted as the page starts: its programs leave the boxes to the UI pass at first, warmed off the frame, then give way to ones with them, the UI pass kept until then", () => {
  const b = start();
  b.state.done = true;
  wantDelveBackdrop();
  assert.equal(delveBackdropReady(), false);
  let readyAt = -1;
  for (let i = 0; i < 40; i++) {
    frame();
    idle();
    if (readyAt < 0 && delveBackdropReady()) readyAt = b.draws.length;
    // (The UI pass let go only once neither the lean main pass nor Delve's leaves the boxes to it.)
    if (b.deleted.includes('ui')) assert.ok(b.deleted.includes('main') && b.deleted.includes('delve main'), b.deleted.join());
  }
  assert.ok(readyAt > 0, 'ready');
  const built = b.log.filter((l) => l.startsWith('link delve'));
  assert.deepEqual(built, ['link delve smooth', 'link delve main', 'link delve full']);
  // Each first drawn in an idle moment, into the target it draws to (or a texel of the same kind).
  const firsts = ['delve smooth', 'delve main', 'delve full'].map((k) => b.draws.find((d) => d.kind === k));
  assert.deepEqual(firsts, [
    { kind: 'delve smooth', into: 'soft light', texel: true, idle: true },
    { kind: 'delve main', into: 'texel', texel: true, idle: true },
    { kind: 'delve full', into: 'texel', texel: true, idle: true },
  ]);
  // Delve's own soft light kept through the merge; its first main pass, the lean main pass and the UI pass let go.
  for (const k of ['delve main', 'main', 'ui', 'UI layer']) assert.ok(b.deleted.includes(k), `${k} let go: ${b.deleted.join()}`);
  assert.ok(!b.deleted.includes('delve smooth'), 'the soft light kept');
  b.stop!();
});

test("a Delve scene showing before Delve's programs are warmed: they're warmed in the frames, a step a frame, without waiting for an idle moment", () => {
  setDescent(40);
  snapDescent();
  try {
    const b = start();
    b.state.done = true;
    // (No idle moment comes.)
    for (let i = 0; i < 30 && !delveBackdropReady(); i++) frame();
    assert.ok(delveBackdropReady(), 'ready without an idle moment');
    const warmed = b.draws.filter((d) => d.kind.startsWith('delve') && d.texel);
    assert.deepEqual(warmed, [
      { kind: 'delve smooth', into: 'soft light', texel: true, idle: false },
      { kind: 'delve main', into: 'texel', texel: true, idle: false },
    ]);
    frame();
    frame();
    assert.equal(b.draws.filter((d) => d.into === 'canvas').at(-1)?.kind, 'delve main', "Delve's programs draw the scene");
    b.stop!();
  } finally {
    setDescent(0);
    snapDescent();
  }
});
