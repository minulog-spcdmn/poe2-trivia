// The hover tuning page (hover.html): controls shaped as the game's to
// sweep the mouse across, their hovers played as the game plays them, with
// the settings for how a hover quietens over a sweep.
// Served by the dev server and built into the beta only (vite.config.ts).

import { mount } from 'svelte';
import '../app.css';
import { BETA } from '../lib/channel';
import { LAB } from '../lib/storage';
import { installUiSounds } from '../lib/sound';
import { installSpatial } from '../lib/spatial.svelte';
import Page from './Page.svelte';

if (!(import.meta.env.DEV || BETA) || !LAB) throw new Error('The hover tuning page only runs on the dev server and the beta, from hover.html.');

installUiSounds();
installSpatial();

mount(Page, { target: document.getElementById('root')! });
