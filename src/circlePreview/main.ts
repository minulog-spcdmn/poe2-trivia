// The rune circles' test page (circle.html): each circle at full size, whole
// beside hollow (as behind the end screen's avatars, `hollow`), with an avatar
// to set over its heart; drawn in again at will, idle, right or wrong. Served
// by the dev server and built into the beta only (vite.config.ts).
import { mount } from 'svelte';
import '../app.css';
import Preview from './Preview.svelte';

mount(Preview, { target: document.getElementById('app')! });
