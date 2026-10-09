// The room bot (bot.html): the game's session without its screens, hosting a
// public room and playing in it. Served by the dev server and built only with
// VITE_BOT=1 (vite.config.ts), which scripts/room-bot.mjs does.

import { BOT } from '../lib/storage';
import { Bot, configFrom } from './driver';

if (!(import.meta.env.DEV || import.meta.env.VITE_BOT === '1') || !BOT) throw new Error('The bot only runs from bot.html, on the dev server or a bot build.');

const bot = new Bot(configFrom(location.search));
bot.start();

// For the runner (and a look in a headed browser).
Object.assign(window, { __bot: bot });
const out = document.getElementById('bot')!;
setInterval(() => (out.textContent = JSON.stringify(bot.status(), null, 2)), 1000);
