// The zone tuning page's panel (zones.html): see Preview.svelte.
import { mount } from 'svelte';
import '../app.css';
import Preview from './Preview.svelte';

mount(Preview, { target: document.getElementById('app')! });
