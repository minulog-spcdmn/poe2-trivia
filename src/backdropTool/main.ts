// The backdrop tool (backdrop.html): Delve's real backdrop, full screen,
// with its embers and the effects layer as the game has them, and a panel
// that tweaks, generates and picks the zones' looks and the endgame's.
// Served by the dev server and built into the beta only (vite.config.ts).

import { mount } from 'svelte';
import '../app.css';
import Background from '../components/Background.svelte';
import FxLayer from '../components/FxLayer.svelte';
import Tool from './Tool.svelte';
import { BETA } from '../lib/channel';
import { BACKDROP_TOOL } from '../lib/storage';
import { boot } from './tool.svelte';

if (!(import.meta.env.DEV || BETA) || !BACKDROP_TOOL) throw new Error('The backdrop tool only runs on the dev server and the beta, from backdrop.html.');

// The draft kept from last time is shown from the first frame.
boot();

const stage = document.getElementById('app')!;
mount(Background, { target: stage });
mount(FxLayer, { target: stage });
mount(Tool, { target: document.getElementById('tool')! });
