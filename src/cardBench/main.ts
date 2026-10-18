// The card bench (cards.html): the panel, and in its frame (cards.html?stage)
// the real game screen the cards are dealt on.
// Served by the dev server and built into the beta only (vite.config.ts).

// First, before any module of the game reads the reduced-motion setting.
import '../lab/motion';
import { BETA } from '../lib/channel';
import { CARD_BENCH, LAB } from '../lib/storage';

if (!(import.meta.env.DEV || BETA) || !LAB || !CARD_BENCH) throw new Error('The card bench only runs on the dev server and the beta, from cards.html.');

if (new URLSearchParams(location.search).has('stage')) import('./stage');
else import('./panel');
