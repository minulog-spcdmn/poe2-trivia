// The card bench's panel (cards.html): see Bench.svelte.
import { mount } from 'svelte';
import '../app.css';
// (The still mode's mark, which app.css's rules for it read: lib/still.ts. Nothing else in the panel loads it.)
import '../lib/still';
import '../lab/framePanel.css';
import Bench from './Bench.svelte';

mount(Bench, { target: document.getElementById('app')! });
