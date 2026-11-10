// The installed Firefox on this PC's own screen, headed, to see a page as a
// Firefox player does (docs/development.md, "Looking in Firefox"): what it
// reads differently from Chrome (a style it drops, as the ouroboros' lines
// were) and what it draws differently (a tilted card's edges).
//   node scripts/pc/firefox.mjs <url> <shot.png> [options]
//   --reduced        the system asking for reduced motion, which the game doesn't follow: a player's
//                    page should look no different with it (not on the live game: see below)
//   --scale 1        device pixels to a CSS px (this PC's own without it; 1 is a 1080p screen at 100%)
//   --wait 6000      ms to let the page come to rest before anything else
//   --hover 450,360  the pointer moved there (CSS px in the page), then 1.5 s to settle
//   --eval "<js>"    an expression's value, printed (a string: JSON.stringify(...) for more)
//   --css "<rules>"  a style sheet added once the page is up, to try a fix
//   --page           Firefox's own shot of the page instead of the window's pixels
// The shot is the window's own pixels as Windows composites them (window.py),
// wherever the window lies and whatever covers it. Firefox's own shot (--page)
// draws the page again for the shot, and smooths edges the screen shows in
// steps: it can't answer how an edge looks.
// A QA frame on its own is qa.html?frame=0&s=<scene key>&size=fit, a piece
// qa.html?frame=0&b=<piece>&k.<control>=<value>&size=fit.
// It drives Firefox over WebDriver BiDi, which the installed one speaks
// (Playwright's Firefox is a build of its own, not what players run), with a
// profile made for the run and thrown away after. The page isn't told a
// script drives it (navigator.webdriver stays off), so it is a player's
// page, never in the checks' still mode (src/lib/still.ts). Only the live
// game's own page is told: there a player's page is a counted visit
// (src/lib/count.ts), and a script's isn't. So --reduced is refused there: a
// scripted browser asking for reduced motion is the still mode, not what a
// player sees; try it on the beta or the dev server. FIREFOX=<path> for one
// installed elsewhere. One run at a time, as the Chrome ones: it slows every
// other session on this machine. Whatever goes wrong, and on Ctrl+C, its
// Firefox is closed and its profile removed.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = 'node scripts/pc/firefox.mjs <url> <shot.png> [--reduced] [--scale 1] [--wait ms] [--hover x,y] [--eval "<js>"] [--css "<rules>"] [--page]';
const refuse = (why) => {
  console.error(why);
  process.exit(1);
};

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    reduced: { type: 'boolean', default: false },
    scale: { type: 'string' },
    wait: { type: 'string', default: '6000' },
    hover: { type: 'string' },
    eval: { type: 'string' },
    css: { type: 'string' },
    page: { type: 'boolean', default: false },
  },
});
const [url, shot] = positionals;
if (!url || !shot) refuse(USAGE);
const at = URL.canParse(url) ? new URL(url) : refuse(`Not an address: ${url}\n${USAGE}`);
const hover = opt.hover?.split(',').map(Number);
if (hover && (hover.length !== 2 || !hover.every(Number.isFinite))) refuse(`--hover takes x,y (CSS px in the page), not "${opt.hover}"`);
// (A wait that is no number would be no wait at all, a scale that is none Firefox would pass over: the shot would be of something else, unsaid.)
const wait = Number(opt.wait);
if (opt.wait.trim() === '' || !Number.isFinite(wait) || wait < 0) refuse(`--wait takes ms (6000), not "${opt.wait}"`);
if (opt.scale !== undefined && !(Number(opt.scale) > 0)) refuse(`--scale takes device pixels to a CSS px (1, 1.5), not "${opt.scale}"`);

const FIREFOX = process.env.FIREFOX ?? 'C:/Program Files/Mozilla Firefox/firefox.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Whether an address is one of the live game's own pages (not the beta's, under /beta), as the browser reads it: with or
 * without a path, a port, `www.` or a dot after the name. (count.ts counts the host poe2.quest; wider here costs nothing.)
 * Asked here of the address given, and in the page of the one it came to (a redirect ends elsewhere), so it stands alone:
 * its text is sent to the page.
 */
const isLive = (hostname, pathname) =>
  hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '') === 'poe2.quest' && !/^\/beta(\/|$)/.test(pathname);
const LIVE = isLive(at.hostname, at.pathname);
const STILL_THERE = '--reduced on the live game would show the checks’ still mode, not a player’s page: there the page is told a script drives it, so the visit isn’t counted. Try it on the beta or the dev server.';
if (LIVE && opt.reduced) refuse(STILL_THERE);
if (LIVE) console.error('The live game: opened as a scripted browser, so the visit is not counted.');

// A profile of its own: nothing of the owner's Firefox is read or touched,
// and no first-run pages come up in the window.
const profile = mkdtempSync(join(tmpdir(), 'poe2-firefox-'));
const prefs = {
  'ui.prefersReducedMotion': opt.reduced ? 1 : 0,
  'browser.shell.checkDefaultBrowser': false,
  'browser.aboutwelcome.enabled': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'startup.homepage_welcome_url': '',
  'startup.homepage_welcome_url.additional': '',
  'datareporting.policy.dataSubmissionEnabled': false,
  'datareporting.healthreport.uploadEnabled': false,
  'toolkit.telemetry.reportingpolicy.firstRun': false,
  'app.update.auto': false,
  'browser.sessionstore.resume_from_crash': false,
  'browser.tabs.warnOnClose': false,
  // (BiDi only.)
  'remote.active-protocols': 1,
  ...(opt.scale ? { 'layout.css.devPixelsPerPx': opt.scale } : {}),
};
writeFileSync(
  join(profile, 'user.js'),
  Object.entries(prefs)
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n'),
);

const port = 9400 + Math.floor(Math.random() * 400);
// (--wait-for-browser: the process started stays for as long as its browser runs, where Windows' launcher would hand over and go.)
const firefox = spawn(FIREFOX, ['--profile', profile, '--no-remote', '--wait-for-browser', '--remote-debugging-port', String(port), '--width', '1936', '--height', '1180', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let said = '';
/** Why Firefox isn't running, once it isn't: it never started, or it went. */
let gone = null;
firefox.stderr.on('data', (d) => (said += d));
firefox.on('error', (e) => (gone = `couldn't start ${FIREFOX}: ${e.message}`));
firefox.on('exit', (code) => (gone ??= `Firefox went (exit ${code}): ${said.slice(-400)}`));

/** How long one command to Firefox may take: a page that never finishes loading, or an --eval that never settles, ends the run. */
const COMMAND_MS = 60_000;
let ws;
let id = 0;
const waiting = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const mine = ++id;
    const late = setTimeout(() => waiting.delete(mine) && rej(new Error(`${method} took over ${COMMAND_MS / 1000} s`)), COMMAND_MS);
    waiting.set(mine, { res, rej, late });
    ws.send(JSON.stringify({ id: mine, method, params }));
  });
/** Everything still waiting on Firefox is told it won't answer. */
const giveUp = (why) => {
  for (const w of waiting.values()) {
    clearTimeout(w.late);
    w.rej(new Error(why));
  }
  waiting.clear();
};

let cleaning = null;
/**
 * Firefox closed, whatever of it is still up ended, and the profile removed: once, however the run ends. Whoever asks
 * while it's under way waits for the same one (Ctrl+C mid-run: the run fails as its Firefox goes, and comes here too).
 */
const cleanUp = () => (cleaning ??= clean());
async function clean() {
  if (ws?.readyState === WebSocket.OPEN) await Promise.race([send('browser.close'), sleep(3000)]).catch(() => {});
  ws?.close();
  await sleep(500);
  firefox.kill();
  // What's left of this run's Firefox, by its profile: only this run's processes name it, never the owner's own Firefox.
  if (process.platform === 'win32')
    spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" | Where-Object { $_.CommandLine -like '*${basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], {
      stdio: 'ignore',
    });
  // (Its files are let go a moment after it.)
  for (let i = 0; i < 10 && existsSync(profile); i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      await sleep(500);
    }
  }
  if (existsSync(profile)) console.error(`Couldn't remove the run's profile: ${profile}`);
}
/** Stopped from outside (Ctrl+C, the terminal closed, a kill that asks first): cleaned up all the same. */
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'])
  process.on(signal, () => {
    stopped = true;
    void cleanUp().then(() => process.exit(130));
  });

let failed = false;
try {
  for (const end = Date.now() + 30000; !/WebDriver BiDi listening/.test(said); await sleep(150)) {
    if (gone) throw new Error(gone);
    if (Date.now() > end) throw new Error(`Firefox didn't start: ${said.slice(-400)}`);
  }
  ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("couldn't reach Firefox"));
  });
  ws.onclose = () => giveUp(gone ?? 'Firefox closed its end');
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    clearTimeout(w.late);
    if (msg.type === 'error') w.rej(new Error(`${msg.error}: ${msg.message}`));
    else w.res(msg.result);
  };
  const evaluate = async (expression) => {
    const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true, resultOwnership: 'none' });
    if (r.type !== 'success') throw new Error(`the page threw: ${r.exceptionDetails?.text}`);
    return r.result?.value;
  };

  await send('session.new', { capabilities: {} });
  // A player's page: navigator.webdriver off, from before the page's own scripts (no pref of Firefox's hides it
  // while a script drives it). But never a counted visit to the live game: each page asks where it is as it loads,
  // so one that came to the live game by a redirect is told too.
  await send('script.addPreloadScript', {
    functionDeclaration: `() => { if (!(${isLive})(location.hostname, location.pathname)) Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); }`,
  });
  const context = (await send('browsingContext.getTree')).contexts[0].context;
  await send('browsingContext.navigate', { context, url, wait: 'complete' });
  if (!LIVE && isLive(...JSON.parse(await evaluate('JSON.stringify([location.hostname, location.pathname])')))) {
    if (opt.reduced) throw new Error(`${url} came to the live game. ${STILL_THERE}`);
    console.error(`${url} came to the live game: opened as a scripted browser, so the visit is not counted.`);
  }
  await sleep(wait);
  if (opt.css) await evaluate(`document.head.append(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(opt.css)} })), ''`);
  if (hover) {
    const [x, y] = hover;
    const [w, h] = JSON.parse(await evaluate('JSON.stringify([innerWidth, innerHeight])'));
    if (x < 0 || y < 0 || x >= w || y >= h) throw new Error(`--hover ${opt.hover} is off the page (${w} x ${h})`);
    // (From off it and across it, as a hand comes, kept on the page: a jump straight there gives the page no move to follow.)
    const path = [
      [x + 400, y - 200],
      [x + 20, y + 20],
      [x, y],
    ].map(([px, py]) => [Math.max(0, Math.min(w - 1, Math.round(px))), Math.max(0, Math.min(h - 1, Math.round(py)))]);
    await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: path.map(([px, py]) => ({ type: 'pointerMove', x: px, y: py, duration: 120 })) }] });
    await sleep(1500);
  }
  if (opt.eval) console.log(await evaluate(opt.eval));
  const out = resolve(shot);
  mkdirSync(dirname(out), { recursive: true });
  if (opt.page) writeFileSync(out, Buffer.from((await send('browsingContext.captureScreenshot', { context, origin: 'viewport' })).data, 'base64'));
  else {
    // The page's place on the screen in device pixels, and a title of its own to find the window by.
    const mark = `poe2-firefox-${port}`;
    const rect = JSON.parse(await evaluate(`(document.title = ${JSON.stringify(mark)}, JSON.stringify([mozInnerScreenX, mozInnerScreenY, innerWidth, innerHeight].map((v) => Math.round(v * devicePixelRatio))))`));
    await sleep(300);
    const grabbed = spawnSync('python', [join(import.meta.dirname, 'window.py'), mark, out, ...rect.map(String)], { stdio: 'inherit' });
    if (grabbed.status !== 0) throw new Error("the window's pixels couldn't be read (window.py)");
  }
  console.log(out);
} catch (e) {
  failed = true;
  console.error(String(e));
} finally {
  await cleanUp();
}
process.exit(stopped ? 130 : failed ? 1 : 0);
