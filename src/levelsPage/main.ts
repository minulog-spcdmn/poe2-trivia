// The sound levels page (levels.html): every sound, played as the game
// plays it, with the whole mix's lift switched between before and after.
// Served by the dev server and built into the beta only (vite.config.ts).

import { mount } from 'svelte';
import '../app.css';
import { BETA } from '../lib/channel';
import { LAB } from '../lib/storage';
import { installUiSounds } from '../lib/sound';
import { installSpatial } from '../lib/spatial.svelte';
import Page from './Page.svelte';

if (!(import.meta.env.DEV || BETA) || !LAB) throw new Error('The sound levels page only runs on the dev server and the beta, from levels.html.');

installUiSounds();
installSpatial();

mount(Page, { target: document.getElementById('root')! });
