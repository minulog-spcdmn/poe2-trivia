// The owner's iPhone, driven from this PC through its Web Inspector
// (docs/iphone.md). ios_webkit_debug_proxy, on localhost:9221, lists the
// phones plugged in; each phone's own port lists its tabs, and each tab
// takes the Web Inspector's protocol over a websocket. iOS wraps every
// message to a page in Target.sendMessageToTarget; both ways are handled.
//
// Every script in this folder starts from here: open() sends the phone's tab
// to a build and connects to it, watchFrames() keeps the page's frame times
// and marks phases in them, and phases() and printPhases() say what each
// phase got.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../..', import.meta.url));
/** Where the scripts write their builds and runs: kept out of the repo (.gitignore). */
export const work = join(root, '.phone');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Every tab of every phone the proxy sees. */
export async function tabs() {
  let devices;
  try {
    devices = await (await fetch('http://localhost:9221/json')).json();
  } catch {
    throw new Error('the proxy is not running: start ios_webkit_debug_proxy (docs/iphone.md, "Every time")');
  }
  if (!devices.length) throw new Error('no phone: plug it in, unlock it, and restart the proxy if it was running before (docs/iphone.md)');
  const out = [];
  for (const d of devices) {
    const list = await (await fetch(`http://${d.url}/json`)).json();
    for (const t of list) out.push({ device: d.deviceName, ios: d.deviceOSVersion, ...t });
  }
  return out;
}

/**
 * The tab to drive: the first showing a web page. (Chrome's new-tab page,
 * about://newtab/, is listed and takes commands, but never runs them: a web
 * page has to be open in the tab first.)
 */
export async function webTab() {
  const all = await tabs();
  const t = all.find((x) => x.webSocketDebuggerUrl && /^https?:/.test(x.url ?? ''));
  if (!t) throw new Error(`no web page open on the phone (tabs: ${all.map((x) => x.url).join(', ') || 'none'}): open any site in Chrome there once`);
  return t;
}

/** A connection to one tab: send(method, params), on(event, fn), evaluate(expr), close(). */
export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('websocket failed: ' + wsUrl));
  });
  let id = 0;
  let target = null;
  const pending = new Map();
  const handlers = new Map();
  const emit = (method, params) => (handlers.get(method) ?? []).forEach((h) => h(params));
  const handle = (msg) => {
    if (msg.method === 'Target.targetCreated') {
      if (!target || msg.params.targetInfo.type === 'page') target = msg.params.targetInfo.targetId;
      return;
    }
    // (A navigation to another site swaps the page's process: its new target takes over.)
    if (msg.method === 'Target.didCommitProvisionalTarget') {
      target = msg.params.newTargetId;
      return emit('swapped', msg.params);
    }
    if (msg.method === 'Target.dispatchMessageFromTarget') return handle(JSON.parse(msg.params.message));
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
      return;
    }
    if (msg.method) emit(msg.method, msg.params);
  };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  // (A wrapped target says so at once.)
  await sleep(600);
  // (A locked phone, or Chrome in the background, takes commands and never answers.)
  const send = (method, params = {}, ms = 15000) =>
    new Promise((res, rej) => {
      const inner = { id: ++id, method, params };
      const timer = setTimeout(() => {
        pending.delete(inner.id);
        rej(new Error(`no answer to ${method} in ${ms / 1000} s: is the phone unlocked, with Chrome in front?`));
      }, ms);
      pending.set(inner.id, { res: (v) => (clearTimeout(timer), res(v)), rej: (e) => (clearTimeout(timer), rej(e)) });
      if (target) ws.send(JSON.stringify({ id: ++id, method: 'Target.sendMessageToTarget', params: { targetId: target, message: JSON.stringify(inner) } }));
      else ws.send(JSON.stringify(inner));
    });
  const on = (method, fn) => {
    if (!handlers.has(method)) handlers.set(method, []);
    handlers.get(method).push(fn);
  };
  /**
   * Runs `expr` in the page and gives back its value, a promise awaited
   * (WebKit's evaluate can't wait for one: Runtime.awaitPromise does). As a
   * user's gesture, so what wants one (sound, fullscreen) works.
   */
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => (${expr}))()`, returnByValue: false, emulateUserGesture: true });
    if (r.wasThrown) throw new Error('page threw: ' + JSON.stringify(r.result?.description ?? r.result));
    const a = await send('Runtime.awaitPromise', { promiseObjectId: r.result.objectId, returnByValue: true }, 120000);
    if (a.wasThrown) throw new Error('page threw: ' + JSON.stringify(a.result?.description ?? a.result));
    return a.result?.value;
  };
  return { send, on, evaluate, close: () => ws.close() };
}

/**
 * The phone's tab sent to `url`, and a connection to it once it's there (a
 * new address can swap the page's process, which ends the old connection).
 * With `fresh`, a room the page kept from the last run is let go of (and the
 * page loaded again), so the game opens at home, not on that room's end
 * screen. With the connection: ev (evaluate) and until(expr, what, ms),
 * which waits for `expr` to be truthy.
 */
export async function open(url, { fresh = false } = {}) {
  const want = url.split(/[?#]/)[0];
  const go = async (how) => {
    const before = await connect((await webTab()).webSocketDebuggerUrl);
    await before.evaluate(how).catch(() => {});
    before.close();
    await sleep(4000);
    for (let i = 0; ; i++) {
      const tab = await webTab().catch(() => null);
      if (tab?.url?.startsWith(want)) return Object.assign(await connect(tab.webSocketDebuggerUrl), { tab });
      if (i > 20) throw new Error(`the tab never reached ${url} (is the build served, and the firewall open to it? docs/iphone.md)`);
      await sleep(1000);
    }
  };
  let page = await go(`void (location.href = ${JSON.stringify(url)})`);
  if (fresh) {
    const clear = (area) => `Object.keys(${area}).filter((k) => /\\.session\\./.test(k)).map((k) => ${area}.removeItem(k))`;
    const cleared = await page.evaluate(`[...${clear('localStorage')}, ...${clear('sessionStorage')}].length`).catch(() => 0);
    if (cleared) {
      page.close();
      page = await go('void location.reload()');
    }
  }
  const ev = (expr) => page.evaluate(expr);
  const until = async (expr, what, ms = 30000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await ev(expr).catch(() => null);
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error('timed out: ' + what);
      await sleep(150);
    }
  };
  return Object.assign(page, { ev, until });
}

/** A button by its text (a regex's source), on screen and enabled, as an expression for the page. */
export const button = (re) => `[...document.querySelectorAll('button')].find((b) => ${re}.test(b.textContent.trim()) && !b.disabled && b.offsetParent)`;

/**
 * Starts keeping the page's frames: every animation frame's time, and how
 * late a 5 ms timer ran (the main thread held up, wherever the frames went).
 * mark(name) starts a phase. Each mark also runs 3 ms in a function named
 * MARK_<name>: the sampling profiler's samples carry no times on iOS, so
 * that's how profile.mjs tells the phases apart. And console.timeStamp, for
 * the timeline's records.
 */
export async function watchFrames(page) {
  await page.evaluate(`(() => {
    const raf = (window.__raf = []);
    window.__marks = [];
    const tick = (t) => { raf.push(t); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const late = (window.__late = []);
    let due = performance.now() + 5;
    setInterval(() => { const t = performance.now(); if (t - due > 3) late.push([due, t - due]); due = t + 5; }, 5);
  })()`);
  const mark = (name) => {
    if (!/^\w+$/.test(name)) throw new Error('a mark is a word: ' + name);
    return page.evaluate(`void (window.__marks.push([${JSON.stringify(name)}, performance.now()]), console.timeStamp(${JSON.stringify(name)}), (0, eval)('function MARK_${name}() { const t = performance.now(); while (performance.now() - t < 3); } MARK_${name}()'))`);
  };
  /** What was kept, and whatever the page's SETUP left in window.__ins, __extra and __rafStats. */
  const read = () => page.evaluate(`({ raf: window.__raf, marks: window.__marks, late: window.__late, ins: window.__ins ?? null, extra: window.__extra ?? null, rafStats: window.__rafStats ?? null })`);
  return { mark, read };
}

/** Each phase's frames: how long, fps, frames over 25 and 50 ms apart, the longest, and the ms the main thread was held. */
export function phases({ raf, marks, late }) {
  const rows = {};
  for (let i = 0; i < marks.length - 1; i++) {
    const [name, t0] = marks[i];
    const t1 = marks[i + 1][1];
    const ts = raf.filter((t) => t >= t0 && t <= t1);
    const gaps = ts.slice(1).map((t, j) => t - ts[j]);
    const held = Math.round(late.filter(([t]) => t >= t0 && t <= t1).reduce((x, [, l]) => x + l, 0));
    rows[name] = {
      ms: Math.round(t1 - t0),
      fps: +((ts.length / (t1 - t0)) * 1000).toFixed(1),
      over25: gaps.filter((g) => g > 25).length,
      over50: gaps.filter((g) => g > 50).length,
      max: Math.round(Math.max(0, ...gaps)),
      held,
    };
  }
  return rows;
}

/** What setups/rafTime.js found, if it ran: each phase's animation-frame callbacks and timers, by their source, the costliest first. */
export function printRafStats(stats) {
  if (!stats) return;
  for (const [phase, by] of Object.entries(stats)) {
    console.log('  ' + phase);
    for (const [k, [n, js, dirty]] of Object.entries(by).sort((a, b) => b[1][1] + b[1][2] - a[1][1] - a[1][2]).slice(0, 8))
      console.log(`    js ${js.toFixed(0).padStart(5)} ms  left dirty ${dirty.toFixed(0).padStart(5)} ms  ${String(n).padStart(4)}x  ${k}`);
  }
}

export function printPhases(rows) {
  const pad = (v, n) => String(v).padStart(n);
  for (const [k, v] of Object.entries(rows)) console.log(`  ${k.padEnd(12)} ${pad(v.ms, 6)} ms  ${pad(v.fps, 5)} fps  >25 ${pad(v.over25, 3)}  >50 ${pad(v.over50, 3)}  max ${pad(v.max, 4)}  held ${v.held}`);
}

/** The run's SETUP (env): script to run in the page before it starts, or a file of it (setups/). */
export function setup() {
  const s = process.env.SETUP ?? '';
  if (!s) return '';
  for (const f of [s, join(root, 'scripts/iphone/setups', s), join(root, 'scripts/iphone/setups', s + '.js')]) if (/\.js$/.test(f) && existsSync(f)) return readFileSync(f, 'utf8');
  return s;
}

/** A folder for a run's files, under .phone/runs/ unless one is given. */
export function runDir(dir) {
  const d = dir ?? join(work, 'runs');
  mkdirSync(d, { recursive: true });
  return d;
}
