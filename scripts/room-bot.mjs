// Runs the room bot: builds the game with its bot page (VITE_BOT=1), serves
// the build on this machine and opens bot.html in headless Chromium, where
// made-up players take turns hosting a public room and playing in it
// (src/bot). Keeps it running: a page that crashes or closes is opened
// again, and the browser profile keeps who is on and the room's save, so it
// comes back as the same player in the same room.
//
//   npm run bot -- [--headed] [--no-build]
//
// Chromium: Playwright's own (npx playwright-core install chromium), or any
// Chromium or Chrome named by BOT_CHROMIUM.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
// Kept out of the repo (.gitignore) and of the style checks (tests/style.test.ts).
const outDir = join(root, '.bot', 'dist');
const profile = join(root, '.bot', 'profile');

const { values: opts } = parseArgs({
  options: {
    headed: { type: 'boolean', default: false },
    'no-build': { type: 'boolean', default: false },
  },
});

const STATUS_EVERY_MS = 60000;
const REOPEN_AFTER_MS = 5000;

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const log = (...args) => console.log(stamp(), ...args);

process.env.VITE_BOT = '1';
if (!opts['no-build']) {
  log('building');
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
}
const server = await preview({ root, logLevel: 'warn', build: { outDir }, preview: { host: '127.0.0.1', port: 4174, strictPort: false } });
const base = server.resolvedUrls.local[0];

const url = `${base}bot.html`;

// Behind an outgoing proxy (HTTPS_PROXY), the browser uses it too. Set as a
// flag rather than Playwright's proxy option, which sends even the local build
// through it.
const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : [];
const context = await chromium.launchPersistentContext(profile, {
  headless: !opts.headed,
  executablePath: process.env.BOT_CHROMIUM || undefined,
  // Stopping is ours (stop, below): the room says goodbye before the browser goes.
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false,
  // Nobody listens to the bot.
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', ...proxy],
});

let page = null;
let stopping = false;

async function open() {
  if (stopping) return;
  const p = context.pages()[0] ?? (await context.newPage());
  page = p;
  p.on('console', (m) => {
    const text = m.text();
    if (text.startsWith('[bot]')) log(text.slice(6));
    else if (m.type() === 'error' || m.type() === 'warning') log(`page ${m.type()}:`, text);
  });
  p.on('pageerror', (err) => log('page error:', err.message));
  let gone = false;
  const reopen = (why) => {
    if (gone || stopping) return;
    gone = true;
    page = null;
    log(`${why}, opening it again`);
    setTimeout(() => void open().catch((err) => log('could not open the page:', err.message)), REOPEN_AFTER_MS);
  };
  p.once('crash', () => {
    reopen('the page crashed');
    void p.close().catch(() => {});
  });
  p.once('close', () => reopen('the page closed'));
  log('opening', url);
  await p.goto(url);
}

// The browser itself went: exit with an error, for whatever supervises this (systemd, Docker) to start it again.
context.on('close', () => {
  if (stopping) return;
  log('the browser closed');
  process.exit(1);
});

await open();

const status = setInterval(async () => {
  try {
    const s = await page?.evaluate(() => window.__bot?.status());
    if (s?.host) log(`${s.host} (until ${s.until}), room ${s.code} (${s.status}), ${s.phase}: ${s.players.join(', ')}${s.spectators ? `, ${s.spectators} watching` : ''}`);
    else if (s) log(`nobody on until ${s.backAt}`);
  } catch {
    /* the page is between loads */
  }
}, STATUS_EVERY_MS);

async function stop() {
  if (stopping) return;
  stopping = true;
  log('closing the room');
  clearInterval(status);
  // The room tells everyone it closed, instead of leaving them to reconnect to nothing.
  await page?.evaluate(() => window.__bot?.close()).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  await context.close().catch(() => {});
  await server.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
