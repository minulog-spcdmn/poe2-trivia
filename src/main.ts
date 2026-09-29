import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { installUiSounds } from './lib/sound';

installUiSounds();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
