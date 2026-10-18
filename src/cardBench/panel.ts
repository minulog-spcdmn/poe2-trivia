// The card bench's panel (cards.html): see Bench.svelte.
import { mount } from 'svelte';
import '../app.css';
import Bench from './Bench.svelte';

mount(Bench, { target: document.getElementById('app')! });
