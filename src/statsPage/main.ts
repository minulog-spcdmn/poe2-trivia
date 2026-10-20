// Analytics (stats.html): PoE2.Quest's counts, read from GoatCounter with
// the owner's key (src/statsPage/api.ts). Built into every build, linked
// from nowhere, and kept out of search results; without the key it shows
// nothing but the door.

import { mount } from 'svelte';
import '@fontsource-variable/inter';
import '../app.css';
import './analytics.css';
import { installCursor } from '../lib/ownCursor';
import { installDitheredGlows } from '../lib/ditheredGlow';
import Analytics from './Analytics.svelte';

installCursor();
installDitheredGlows();
mount(Analytics, { target: document.getElementById('app')! });
