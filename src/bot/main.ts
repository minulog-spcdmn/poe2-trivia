// The room bot (bot.html): the game's session without its screens, where
// made-up players come on at a seat, open a public room or join someone
// else's, play a while and go (seat.ts). Served by the dev server and built
// only with VITE_BOT=1 (vite.config.ts), which scripts/room-bot.mjs does.

import { BOT } from '../lib/storage';
import { CHANNEL } from '../lib/channel';
import { log } from './util';
import { Seat } from './seat';
import { session } from '../lib/session.svelte';
import { modesFrom, namesFor } from './identities';

if (!(import.meta.env.DEV || import.meta.env.VITE_BOT === '1') || !BOT) throw new Error('The bot only runs from bot.html, on the dev server or a bot build.');

// Several seats at once (scripts/room-bot.mjs --bots): this one is ?slot= of ?of=,
// each with its own share of the cast. ?rooms=: how many rooms the bot keeps
// open at most (--rooms, 0 to only join; no limit without it); ?modes=: the game modes its hosts
// may pick (--mode), all of them by default; ?scout=0: a seat that is handed
// the room list (the runner's first seat checks it for all).
const q = new URLSearchParams(location.search);
const slot = Number(q.get('slot') ?? 1);
const names = namesFor(slot, Number(q.get('of') ?? 1));
const rooms = q.has('rooms') ? Math.max(0, Number(q.get('rooms')) || 0) : Infinity;
const bot = new Seat(names, modesFrom(q.get('modes')), rooms, q.get('scout') !== '0');
// Where it plays (src/lib/channel.ts): on the dev server, its own local rooms, not the live game's.
log(`playing in the ${CHANNEL} rooms`);
bot.start();

// For the runner (and a look in a headed browser); in development, the session too, for scripts that drive it (as src/main.ts gives it).
Object.assign(window, { __bot: bot, ...(import.meta.env.DEV ? { __s: session } : {}) });
const out = document.getElementById('bot')!;
setInterval(() => (out.textContent = JSON.stringify(bot.status(), null, 2)), 1000);
