import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { installUiSounds } from './lib/sound';
import { installUiFx } from './lib/fx/ui';
import * as fxCore from './lib/fx/core';
import * as fxEffects from './lib/fx/effects';
import * as fxMoments from './lib/fx/moments';
import { session } from './lib/session.svelte';

installUiSounds();
installUiFx();

// Development only: handles for scripts that drive the game and step the
// effects frame by frame to photograph them (the same module instances the
// app uses, which a fresh import during hot reloading wouldn't be).
if (import.meta.env.DEV) Object.assign(window, { __fx: fxCore, __e: fxEffects, __m: fxMoments, __s: session });

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
