// Runs the room bot: builds the game with its bot page (VITE_BOT=1), serves
// the build on this machine and opens bot.html in headless Chromium, where
// made-up players take turns hosting a public room and playing in it
// (src/bot). Keeps it running: a page that crashes or closes is opened
// again, and the browser profile keeps who is on and the room's save, so it
// comes back as the same player in the same room.
//
//   npm run bot -- [--rooms 2] [--headed] [--no-build]
//   (or node scripts/room-bot.mjs --rooms 2; npm run bot 2 works too)
//
// A room opens only when the open-room list has no room at all; with
// --rooms 2, a second one also opens while every room listed is mid-game
// (src/bot/wanted.ts). Each has its own players.
//
// Chromium: Playwright's own (npx playwright-core install chromium), or any
// Chromium or Chrome named by BOT_CHROMIUM.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

const MAX_ROOMS = 2;
const STATUS_EVERY_MS = 60000;
const REOPEN_AFTER_MS = 5000;

const root = fileURLToPath(new URL('..', import.meta.url));
// Kept out of the repo (.gitignore) and of the style checks (tests/style.test.ts).
const outDir = join(root, '.bot', 'dist');

const { values: args, positionals } = parseArgs({
  options: {
    rooms: { type: 'string' },
    headed: { type: 'boolean' },
    'no-build': { type: 'boolean' },
  },
  allowPositionals: true,
});
// PowerShell drops the `--` in `npm run bot -- --rooms 2`, and npm then takes
// the flags as its own settings (npm_config_*) and hands on only the `2`: so
// those count too, and a bare number is the number of rooms.
const env = process.env;
const opts = {
  rooms: args.rooms ?? positionals.find((p) => /^\d+$/.test(p)) ?? '1',
  headed: args.headed ?? env.npm_config_headed === 'true',
  'no-build': args['no-build'] ?? (env.npm_config_build === 'false' || env.npm_config_no_build === 'true'),
};
const rooms = Number(opts.rooms);
if (!Number.isInteger(rooms) || rooms < 1 || rooms > MAX_ROOMS) {
  console.error(`--rooms takes 1 to ${MAX_ROOMS}.`);
  process.exit(2);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const log = (...args) => console.log(stamp(), ...args);

process.env.VITE_BOT = '1';
if (!opts['no-build']) {
  log('building');
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
}
const server = await preview({ root, logLevel: 'warn', build: { outDir }, preview: { host: '127.0.0.1', port: 4174, strictPort: false } });
const base = server.resolvedUrls.local[0];

// Behind an outgoing proxy (HTTPS_PROXY), the browser uses it too. Set as a
// flag rather than Playwright's proxy option, which sends even the local build
// through it.
const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : [];

let stopping = false;

/**
 * One room: its own browser and profile (so its own storage: who is on, the
 * room's save), and its own share of the names (bot.html ?slot=&of=), so
 * no one ever hosts two rooms at once.
 */
async function runRoom(slot) {
  const say = rooms > 1 ? (...args) => log(`[${slot}]`, ...args) : log;
  const url = `${base}bot.html?slot=${slot}&of=${rooms}`;
  const context = await chromium.launchPersistentContext(join(root, '.bot', `profile-${slot}`), {
    headless: !opts.headed,
    executablePath: process.env.BOT_CHROMIUM || undefined,
    // Stopping is ours (stop, below): the room says goodbye before the browser goes.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    // Nobody listens to the bot, and nothing is drawn: the page has no screens.
    args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu', ...proxy],
  });
  const room = { page: null, context, say };

  async function open() {
    if (stopping) return;
    const p = context.pages()[0] ?? (await context.newPage());
    room.page = p;
    p.on('console', (m) => {
      const text = m.text();
      if (text.startsWith('[bot]')) say(text.slice(6));
      else if (m.type() === 'error' || m.type() === 'warning') say(`page ${m.type()}:`, text);
    });
    p.on('pageerror', (err) => say('page error:', err.message));
    let gone = false;
    const reopen = (why) => {
      if (gone || stopping) return;
      gone = true;
      room.page = null;
      say(`${why}, opening it again`);
      setTimeout(() => void open().catch((err) => say('could not open the page:', err.message)), REOPEN_AFTER_MS);
    };
    p.once('crash', () => {
      reopen('the page crashed');
      void p.close().catch(() => {});
    });
    p.once('close', () => reopen('the page closed'));
    say('opening', url);
    await p.goto(url);
  }

  // A browser itself went: exit with an error, for whatever supervises this (systemd, Docker) to start it again.
  context.on('close', () => {
    if (stopping) return;
    say('the browser closed');
    process.exit(1);
  });

  await open();
  return room;
}

const all = [];
for (let slot = 1; slot <= rooms; slot++) all.push(await runRoom(slot));

// Each room learns the other's code, so the first never makes way for the second (src/bot/wanted.ts).
const SIBLINGS_EVERY_MS = 5000;
const siblings = rooms > 1
  ? setInterval(async () => {
      const codes = await Promise.all(all.map(({ page }) => page?.evaluate(() => { const s = window.__bot?.status(); return s?.host ? s.code : ''; }).catch(() => '') ?? ''));
      await Promise.all(all.map(({ page }, i) => page?.evaluate((code) => window.__bot?.setSibling(code), codes[1 - i]).catch(() => {})));
    }, SIBLINGS_EVERY_MS)
  : null;

const status = setInterval(async () => {
  for (const { page, say } of all) {
    try {
      const s = await page?.evaluate(() => window.__bot?.status());
      if (s?.host) say(`${s.host} (until ${s.until}), room ${s.code} (${s.status}), ${s.phase}: ${s.players.join(', ')}${s.spectators ? `, ${s.spectators} watching` : ''}`);
      else if (s) say(`no room open; ${s.listed}`);
    } catch {
      /* the page is between loads */
    }
  }
}, STATUS_EVERY_MS);

async function stop() {
  if (stopping) return;
  stopping = true;
  log(rooms > 1 ? 'closing the rooms' : 'closing the room');
  clearInterval(status);
  if (siblings) clearInterval(siblings);
  // Each room tells everyone it closed, instead of leaving them to reconnect to nothing.
  await Promise.all(all.map(({ page }) => page?.evaluate(() => window.__bot?.close()).catch(() => {})));
  await new Promise((r) => setTimeout(r, 800));
  await Promise.all(all.map(({ context }) => context.close().catch(() => {})));
  await server.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
