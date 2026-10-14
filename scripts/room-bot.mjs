// Runs the room bot: builds the game with its bot page (VITE_BOT=1), serves
// the build on this machine and opens bot.html in headless Chromium, once
// for each seat, where made-up players come on, open a public room or join
// someone else's, play a while and go (src/bot). Keeps it running: a page
// that crashes or closes is opened again, and the browser profile keeps who
// is hosting and the room's save, so it comes back as the same player in
// the same room.
//
//   npm run bot -- [--bots 4] [--rooms N | --watch] [--mode turns,race,delve] [--per-room N] [--beta | --localhost] [--wind-down 10] [--headed] [--no-build]
//   (or node scripts/room-bot.mjs --bots 4; from PowerShell npm run bot bots=4 rooms=2 delve beta (or localhost),
//   or npm run bot 2, work too)
//
// --bots: how many seats, so how many players on at once (1 by default).
// Each one who comes on decides for themselves whether to host or to join,
// and which room, as people do (src/bot/seat.ts, src/bot/choice.ts).
// A room opens when the open-room list has no room at all, and another one
// whenever every room listed is mid-game, as many as it takes
// (src/bot/wanted.ts). --rooms N: at most N of them open at once (no limit
// by default; 0 to only join people).
// --mode: the game modes the hosts may pick, each by their own taste (all
// three by default); --mode delve makes every room a Delve room.
// --per-room N: at most N of them in one room (any number by default);
// they arrive in a room 5 to 20 s apart.
// --joiners N (or --join, for 1): N seats more (--bots 1+N, or --rooms+N).
// --watch (or the bare word `watch`): they only watch: no rooms of their own,
// and they come into others' rooms as spectators (in the lobby or mid-game,
// while a spectator's seat is free), never answering. With --per-room.
// --beta: to the beta (poe2.quest/beta/) instead of the live game: its rooms
// and open-room list are the beta's own (src/lib/peer.ts), so the bot is
// built as the beta is (VITE_CHANNEL=beta), with a build and browser
// profiles of its own, and can run beside a live one. Its rooms show only
// to a beta on the same protocol version as this checkout.
// --localhost: to your own dev server (npm run dev) instead, whose rooms
// are this machine's own (src/lib/channel.ts): open localhost:5173 and the
// bots' rooms are listed there, and not on the live game, the beta or anyone
// else's dev server. (Not --local: from PowerShell, npm takes that one for
// itself and the bots would quietly play live; the bare word `local` works.)
//
// Ctrl+C: nobody new comes on, and everyone on goes within --wind-down N
// minutes (10 by default, 0 for all at once), each at a time of their own;
// a game under way with real people in it is played to its end first.
// Ctrl+C again quits straight away.
//
// Chromium: Playwright's own (npx playwright-core install chromium), or any
// Chromium or Chrome named by BOT_CHROMIUM.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

const STATUS_EVERY_MS = 60000;
const REOPEN_AFTER_MS = 5000;
/** A page that fails to open this many times in a row ends the process (for its supervisor to restart). */
const MAX_OPEN_FAILURES = 6;

const root = fileURLToPath(new URL('..', import.meta.url));

const { values: args, positionals } = parseArgs({
  options: {
    bots: { type: 'string' },
    rooms: { type: 'string' },
    mode: { type: 'string' },
    join: { type: 'boolean' },
    joiners: { type: 'string' },
    'per-room': { type: 'string' },
    watch: { type: 'boolean' },
    beta: { type: 'boolean' },
    localhost: { type: 'boolean' },
    headed: { type: 'boolean' },
    'no-build': { type: 'boolean' },
    'wind-down': { type: 'string' },
  },
  allowPositionals: true,
});
// PowerShell drops the `--` in `npm run bot -- --rooms 2`, and npm then takes
// the flags as its own settings (npm_config_*) and hands on only the `2`: so
// those count too, a bare number is the number of rooms, bare mode names
// are the modes, and a bare `join`, `beta` or `localhost` (or `local`) is that flag.
const MODES = ['turns', 'race', 'delve'];
// `--rooms=2 --joiners=3` (with =) reach us from PowerShell as npm settings
// with their values, and `rooms=2 joiners=3` as words.
const env = process.env;
const words = positionals.flatMap((p) => p.toLowerCase().split(','));
const numberOf = (name) =>
  args[name] ?? (/^\d+$/.test(env[`npm_config_${name.replace(/-/g, '_')}`] ?? '') ? env[`npm_config_${name.replace(/-/g, '_')}`] : undefined) ?? words.find((w) => w.startsWith(`${name}=`))?.slice(name.length + 1);
const opts = {
  bots: numberOf('bots'),
  rooms: numberOf('rooms') ?? positionals.find((p) => /^\d+$/.test(p)),
  mode: args.mode ?? (words.filter((w) => MODES.includes(w)).join(',') || 'turns,race,delve'),
  join: args.join ?? (words.includes('join') || env.npm_config_join === 'true'),
  joiners: numberOf('joiners'),
  perRoom: numberOf('per-room'),
  watch: args.watch ?? (words.includes('watch') || env.npm_config_watch === 'true'),
  beta: args.beta ?? (words.includes('beta') || env.npm_config_beta === 'true'),
  localhost: args.localhost ?? (words.includes('localhost') || words.includes('local') || env.npm_config_localhost === 'true'),
  headed: args.headed ?? env.npm_config_headed === 'true',
  'no-build': args['no-build'] ?? (env.npm_config_build === 'false' || env.npm_config_no_build === 'true'),
  windDown: numberOf('wind-down'),
};
/** Ctrl+C: everyone on goes within this many minutes, each at a time of their own (--wind-down; 0: all at once). */
const windDownMin = opts.windDown === undefined ? 10 : Number(opts.windDown);
if (!Number.isFinite(windDownMin) || windDownMin < 0) {
  console.error('--wind-down takes a number of minutes (0 or more).');
  process.exit(2);
}
const joiners = Number(opts.joiners ?? (opts.join ? 1 : 0));
if (!Number.isInteger(joiners) || joiners < 0) {
  console.error('--joiners takes a number of seats.');
  process.exit(2);
}
const perRoom = opts.perRoom === undefined ? Infinity : Number(opts.perRoom);
if (perRoom !== Infinity && (!Number.isInteger(perRoom) || perRoom < 1)) {
  console.error('--per-room takes a number of players (1 or more).');
  process.exit(2);
}
/** The most rooms open at once (Infinity: as many as are wanted). Watching, none: they only come into others' rooms. */
if (opts.watch && opts.rooms !== undefined && Number(opts.rooms) > 0) {
  console.error('--watch bots only watch other rooms: leave out --rooms.');
  process.exit(2);
}
const rooms = opts.watch ? 0 : opts.rooms === undefined ? Infinity : Number(opts.rooms);
if (rooms !== Infinity && (!Number.isInteger(rooms) || rooms < 0)) {
  console.error('--rooms takes a number of rooms (0 or more).');
  process.exit(2);
}
/** Seats in all: --bots, or one a room and the --joiners. */
const bots = Number(opts.bots ?? Math.max(1, (rooms === Infinity ? 1 : rooms) + joiners));
if (!Number.isInteger(bots) || bots < 1) {
  console.error('--bots takes a number of seats (1 or more).');
  process.exit(2);
}
const modes = opts.mode.toLowerCase().split(/[\s,]+/).filter(Boolean);
if (!modes.length || modes.some((m) => !MODES.includes(m))) {
  console.error(`--mode takes ${MODES.join(', ')}, or several of them (turns,delve).`);
  process.exit(2);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const log = (...args) => console.log(stamp(), ...args);

process.env.VITE_BOT = '1';
if (opts.beta && opts.localhost) {
  console.error('--beta and --localhost each send the bots somewhere else: pick one.');
  process.exit(2);
}
/** Where the bots play: the live game, the beta, or your dev server (src/lib/channel.ts, src/lib/peer.ts). */
const channel = opts.beta ? 'beta' : opts.localhost ? 'local' : 'live';
/** How the log says where they play. */
const where = { live: '', beta: 'beta: ', local: 'localhost: ' }[channel];
process.env.VITE_CHANNEL = channel;
// Kept out of the repo (.gitignore) and of the style checks (tests/style.test.ts); each channel's apart, so one runs without rebuilding another.
const outDir = join(root, '.bot', channel === 'live' ? 'dist' : `dist-${channel}`);
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
 * Rooms our guests are in, by code: which guests (their slots), and when the
 * last one came in. A room takes any number (or --per-room), and they come in
 * spaced out, as people do.
 */
const claims = new Map();
const ARRIVALS_APART_MS = [5000, 20000];
/** Our rooms, by number (src/bot/wanted.ts): which seat hosts each, so no two open the same one. */
const roles = new Map();

/**
 * One seat: its own browser and profile (so its own storage: who is
 * hosting, the room's save), and its own share of the names (bot.html
 * ?slot=&of=), so no one is ever in two places at once. The first seat
 * checks the room list for all (passed on below); the others are handed it.
 */
async function runSeat(slot) {
  const say = bots > 1 ? (...args) => log(`[${slot}]`, ...args) : log;
  const url = `${base}bot.html?slot=${slot}&of=${bots}${rooms === Infinity ? '' : `&rooms=${rooms}`}&modes=${modes.join(',')}${slot > 1 ? '&scout=0' : ''}${opts.watch ? '&watch=1' : ''}`;
  const context = await chromium.launchPersistentContext(join(root, '.bot', `profile-${channel === 'live' ? '' : `${channel}-`}${slot}`), {
    headless: !opts.headed,
    executablePath: process.env.BOT_CHROMIUM || undefined,
    // Stopping is ours (stop, below): the room says goodbye before the browser goes.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    // Nobody listens to the bot, and nothing is drawn: the page has no screens.
    // Its timers at full pace even with its window covered (--headed): the hand moves twenty times a second (src/bot/hand.ts).
    args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...proxy],
  });
  const seat = { page: null, context, say };

  let failures = 0;

  /**
   * Opens the bot's page, always in a fresh tab (a crashed one can't take its
   * functions again), and lets go of any other. A page that won't open is
   * tried again, a little later each time; one that keeps failing ends the
   * process, for whatever supervises it to start it again.
   */
  async function open() {
    if (stopping) return;
    let p;
    try {
      p = await context.newPage();
      for (const old of context.pages()) if (old !== p) await old.close().catch(() => {});
      seat.page = p;
      p.on('console', (m) => {
        const text = m.text();
        if (text.startsWith('[bot]')) say(text.slice(6));
        else if (m.type() === 'error' || m.type() === 'warning') say(`page ${m.type()}:`, text);
      });
      p.on('pageerror', (err) => say('page error:', err.message));
      await p.exposeFunction('__claimRoom', (code) => {
        const now = Date.now();
        const c = claims.get(code) ?? { slots: new Set(), next: 0 };
        if (!c.slots.has(slot) && (c.slots.size >= perRoom || now < c.next)) return false;
        for (const [other, o] of claims) {
          o.slots.delete(slot);
          if (!o.slots.size && now >= o.next) claims.delete(other);
        }
        c.slots.add(slot);
        c.next = now + ARRIVALS_APART_MS[0] + Math.random() * (ARRIVALS_APART_MS[1] - ARRIVALS_APART_MS[0]);
        claims.set(code, c);
        return true;
      });
      await p.exposeFunction('__releaseRoom', (code) => {
        const c = claims.get(code);
        c?.slots.delete(slot);
        if (c && !c.slots.size && Date.now() >= c.next) claims.delete(code);
      });
      await p.exposeFunction('__claimRole', (role) => {
        if (!Number.isInteger(role) || role < 1 || role > rooms) return false;
        const holder = roles.get(role);
        if (holder !== undefined && holder !== slot) return false;
        for (const [r, s] of roles) if (s === slot) roles.delete(r);
        roles.set(role, slot);
        return true;
      });
      await p.exposeFunction('__releaseRole', (role) => {
        if (roles.get(role) === slot) roles.delete(role);
      });
      await p.exposeFunction('__releaseOthers', (role) => {
        for (const [r, s] of roles) if (s === slot && r !== role) roles.delete(r);
      });
      const reopen = (why) => {
        // Only for the page in use (not one let go of above), and once.
        if (seat.page !== p || stopping) return;
        seat.page = null;
        say(`${why}, opening it again`);
        setTimeout(() => void open(), REOPEN_AFTER_MS);
      };
      p.once('crash', () => {
        reopen('the page crashed');
        void p.close().catch(() => {});
      });
      p.once('close', () => reopen('the page closed'));
      say('opening', url);
      await p.goto(url);
      failures = 0;
    } catch (err) {
      failures++;
      say('could not open the page:', err.message);
      if (seat.page === p) seat.page = null;
      if (failures >= MAX_OPEN_FAILURES) {
        say(`gave up after ${failures} tries`);
        process.exit(1);
      }
      setTimeout(() => void open(), REOPEN_AFTER_MS * failures);
    }
  }

  // A browser itself went: exit with an error, for whatever supervises this (systemd, Docker) to start it again.
  context.on('close', () => {
    if (stopping) return;
    say('the browser closed');
    process.exit(1);
  });

  await open();
  return seat;
}

log(`${where}${bots === 1 ? '1 seat' : `${bots} seats`}, ${opts.watch ? 'watching only (as spectators)' : rooms === Infinity ? `as many rooms as wanted, hosting ${modes.join(', ')}` : rooms ? `up to ${rooms === 1 ? '1 room' : `${rooms} rooms`} at once, hosting ${modes.join(', ')}` : 'joining only'}${perRoom < bots ? `, up to ${perRoom} in a room` : ''}`);
const all = [];
for (let slot = 1; slot <= bots; slot++) all.push(await runSeat(slot));

// Each seat learns the others' rooms: so it opens no room another one holds,
// the first room never makes way for the second (src/bot/wanted.ts), and our
// own rooms are joined only while no one else's lobby is open. And the room
// list the first seat checked is handed on to the others.
const TEAM_EVERY_MS = 5000;
const team = bots > 1
  ? setInterval(async () => {
      const seats = await Promise.all(all.map(({ page }) => page?.evaluate(() => { const s = window.__bot?.status(); return { code: s?.as === 'host' ? (s.code ?? '') : '', id: s?.id ?? null, name: s?.name ?? null }; }).catch(() => null) ?? null));
      const held = [...roles].map(([role, slot]) => ({ role, slot, code: seats[slot - 1]?.code ?? '' }));
      // And who the others are on as: so a seat tells them from people by more than a name of the cast (src/bot/crew.ts).
      const mates = (i) => seats.filter((s, j) => j !== i && s).map(({ id, name }) => ({ id, name }));
      await Promise.all(all.map(({ page }, i) => page?.evaluate(([t, m]) => window.__bot?.setTeam(t, m), [held.filter((h) => h.slot !== i + 1).map(({ role, code }) => ({ role, code })), mates(i)]).catch(() => {})));
      const list = await all[0].page?.evaluate(() => window.__bot?.rooms()).catch(() => null);
      if (list?.at) await Promise.all(all.slice(1).map(({ page }) => page?.evaluate(({ rooms, at }) => window.__bot?.takeRooms(rooms, at), list).catch(() => {})));
    }, TEAM_EVERY_MS)
  : null;

const status = setInterval(async () => {
  for (const { page, say } of all) {
    try {
      const s = await page?.evaluate(() => window.__bot?.status());
      if (s?.as === 'host') say(`${s.name} hosts (until ${s.until}), room ${s.code} (${s.status}), ${s.phase}: ${s.players.join(', ')}${s.spectators ? `, ${s.spectators} watching` : ''}`);
      else if (s?.as === 'guest') say(s.room ? `${s.name} in ${s.room}, ${s.phase}: ${s.players.join(', ')}` : `${s.name} looking for a room; ${s.listed}`);
      else if (s) say(`nobody on (someone joins from ${s.back}); ${s.listed}`);
    } catch {
      /* the page is between loads */
    }
  }
}, STATUS_EVERY_MS);

/**
 * Ctrl+C: nobody new comes on, and everyone on goes within --wind-down
 * minutes (10 by default), each at a time of their own, as people drift off
 * rather than all leave at once; till then they play on as usual. When
 * their time comes, a game under way with real people in it (in one of our
 * rooms, or one our guest is in) is played to its end first, the scores
 * left up a moment. A second Ctrl+C (or SIGTERM, from a supervisor) quits
 * at once.
 */
let winding = false;
async function stop() {
  if (winding) return quit('quitting now');
  winding = true;
  // No page reopens from here on (open, reopen): a fresh one would bring someone new on.
  stopping = true;
  // (The room list goes round still: those on play on as usual till their time.)
  const spread = windDownMin * 60000;
  const says = (await Promise.all(all.map(({ page }) => page?.evaluate((ms) => window.__bot?.windDown(ms) ?? null, spread).catch(() => null)))).filter(Boolean);
  if (!says.length) return quit();
  for (const s of says) log(s);
  log(spread ? `winding down: everyone goes within ${windDownMin} minutes, each in their own time (a game with people in it plays to its end); Ctrl+C again to quit now` : `finishing ${says.length === 1 ? 'a game' : `${says.length} games`} with players in ${says.length === 1 ? 'it' : 'them'} first; Ctrl+C again to quit now`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    if (quitting) return;
    const settled = await Promise.all(all.map(({ page }) => page?.evaluate(() => window.__bot?.settled() ?? true).catch(() => true) ?? true));
    if (settled.every(Boolean)) break;
  }
  await quit();
}

let quitting = false;
async function quit(why = 'leaving') {
  if (quitting) return;
  quitting = stopping = true;
  log(why);
  clearInterval(status);
  if (team) clearInterval(team);
  // Each room tells everyone it closed, instead of leaving them to reconnect to nothing.
  await Promise.all(all.map(({ page }) => page?.evaluate(() => window.__bot?.close()).catch(() => {})));
  await new Promise((r) => setTimeout(r, 800));
  await Promise.all(all.map(({ context }) => context.close().catch(() => {})));
  await server.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', () => quit());
