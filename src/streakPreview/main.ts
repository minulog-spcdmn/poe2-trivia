// The streak's test page (streak.html): the daily's streak badge for any
// run of days, the answer that grows it and the miss that ends it.
// Served by the dev server and built into the beta only (vite.config.ts).

import { mount } from 'svelte';
import '../app.css';
import { BETA } from '../lib/channel';
import Preview from './Preview.svelte';

if (!(import.meta.env.DEV || BETA)) throw new Error('The streak page only runs on the dev server and the beta, from streak.html.');

mount(Preview, { target: document.getElementById('app')! });
