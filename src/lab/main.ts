// The effects lab (lab.html): the real app, driven by a panel of controls.
// Served by the dev server and built into the beta only (vite.config.ts).

// First, before any module of the game reads the reduced-motion setting.
import './motion';
import { mount } from 'svelte';
import '../app.css';
import App from '../App.svelte';
import Lab from './Lab.svelte';
import { installUiSounds } from '../lib/sound';
import { installUiFx } from '../lib/fx/ui';
import * as fxCore from '../lib/fx/core';
import * as fxEffects from '../lib/fx/effects';
import * as fxMoments from '../lib/fx/moments';
import { session } from '../lib/session.svelte';
import { BETA } from '../lib/channel';
import { LAB } from '../lib/storage';
import * as lab from './controls.svelte';

if (!(import.meta.env.DEV || BETA) || !LAB) throw new Error('The lab only runs on the dev server and the beta, from lab.html.');

installUiSounds();
installUiFx();

// Handles for scripts (and the console), as src/main.ts gives them in dev.
Object.assign(window, { __fx: fxCore, __e: fxEffects, __m: fxMoments, __s: session, __lab: lab });

// The run is in place before the app mounts, so it never shows the start
// page (whose open-room scan would reach for the matchmaking server).
session.resume();
lab.boot();

mount(App, { target: document.getElementById('app')! });
mount(Lab, { target: document.getElementById('lab')! });
