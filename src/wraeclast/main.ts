// The Wraeclast run (wraeclast.html): a solo run of the new mode's first
// prototype, with its tuning panel and run log (docs/handoff/wraeclast).
// Served by the dev server and built into the beta only (vite.config.ts).

import { mount } from 'svelte';
import '../app.css';
import './screens.css';
import { BETA } from '../lib/channel';
import { WRAECLAST } from '../lib/storage';
import { installUiSounds } from '../lib/sound';
import { installSpatial } from '../lib/spatial.svelte';
import { installCursor } from '../lib/ownCursor';
import { installAutoscroll } from '../lib/autoscroll';
import { switchedOff } from '../lib/switchedOff';
import Page from './Page.svelte';
import { play } from './play.svelte';

if (!(import.meta.env.DEV || BETA) || !WRAECLAST) throw new Error('The Wraeclast run only runs on the dev server and the beta, from wraeclast.html.');

installUiSounds();
installSpatial();
if (!switchedOff('cursor')) installCursor();
installAutoscroll();

mount(Page, { target: document.getElementById('root')! });

// On the dev server, the run for headless checks to read (the answer among it): never on the beta.
if (import.meta.env.DEV) Object.assign(window, { wraeclast: play });
