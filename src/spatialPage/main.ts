// The spatial sound page (spatial.html): the real game screen, full window,
// on a Delve run of the lab's (src/lab), its sounds placed by the game's
// spatial sound (lib/spatial.svelte.ts) as the lab tunes it, with a menu over it that plays
// any sound from where the screen has it. Served by the dev server and built
// into the beta only (vite.config.ts).

// First, before any module of the game reads the reduced-motion setting.
import '../lab/motion';
import { mount } from 'svelte';
import '../app.css';
import App from '../App.svelte';
import { BETA } from '../lib/channel';
import { LAB, SPATIAL_PAGE } from '../lib/storage';
import { installUiSounds } from '../lib/sound';
import { installUiFx } from '../lib/fx/ui';
import { session } from '../lib/session.svelte';
import { wantDelveBackdrop } from '../lib/backdrop';
import * as L from '../lab/controls.svelte';
import { installSpatial } from '../lib/spatial.svelte';
import { tuneSpatial } from '../lab/spatial.svelte';
import Menu from './Menu.svelte';

if (!(import.meta.env.DEV || BETA) || !LAB || !SPATIAL_PAGE) throw new Error('The spatial sound page only runs on the dev server and the beta, from spatial.html.');

installUiSounds();
installSpatial();
tuneSpatial();
installUiFx();
// The run is in place before the app mounts, so it never shows the start page.
session.resume();
L.boot();
wantDelveBackdrop();

mount(App, { target: document.getElementById('app')! });
mount(Menu, { target: document.getElementById('menu')! });
