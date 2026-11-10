// The zone tuning page's panel (zones.html): see Preview.svelte.
import { mount } from 'svelte';
import '../app.css';
// (The still mode's mark, which app.css's rules for it read: lib/still.ts. Nothing else in the panel loads it.)
import '../lib/still';
import '../lab/framePanel.css';
import Preview from './Preview.svelte';

mount(Preview, { target: document.getElementById('app')! });
