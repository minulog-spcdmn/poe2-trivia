// The zone gate's tuning page (zones.html): the panel, and in its frame
// (zones.html?stage) the real game screen the gate is built over.
// Served by the dev server and built into the beta only (vite.config.ts).

// First, before any module of the game reads the reduced-motion setting.
import '../lab/motion';
import { BETA } from '../lib/channel';
import { LAB, ZONES_PREVIEW } from '../lib/storage';

if (!(import.meta.env.DEV || BETA) || !LAB || !ZONES_PREVIEW) throw new Error('The zone gate tuning page only runs on the dev server and the beta, from zones.html.');

if (new URLSearchParams(location.search).has('stage')) import('./stage.svelte');
else import('./panel');
