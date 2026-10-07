// The descent's test page (descent.html): Delve's rules block in a rules
// card at three widths, driven by a deepest depth and the finds met.
// Served by the dev server and built into the beta only (vite.config.ts).

import { mount } from 'svelte';
import '../app.css';
import { BETA } from '../lib/channel';
import Preview from './Preview.svelte';

if (!(import.meta.env.DEV || BETA)) throw new Error('The descent page only runs on the dev server and the beta, from descent.html.');

mount(Preview, { target: document.getElementById('app')! });
