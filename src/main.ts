import { mount } from 'svelte';
import './app.css';
import Root from './Root.svelte';
import { installUiSounds } from './lib/sound';
import { installSpatial } from './lib/spatial.svelte';
import { installUiFx } from './lib/fx/ui';
import * as fxCore from './lib/fx/core';
import * as fxEffects from './lib/fx/effects';
import * as fxMoments from './lib/fx/moments';
import { session } from './lib/session.svelte';
import { watchFullscreen } from './lib/fullscreen';
import { installCursor } from './lib/ownCursor';
import { installAutoscroll } from './lib/autoscroll';
import { fpsMeterOn, switchedOff } from './lib/switchedOff';
import { installFpsMeter } from './lib/fpsMeter';
import { countVisit, onCountToggle, type Toggled } from './lib/count';
import { toasts } from './lib/toasts.svelte';
import { preloadPeerJs } from './lib/peer';

installUiSounds();
installSpatial();
installUiFx();
watchFullscreen();
if (!switchedOff('cursor')) installCursor();
installAutoscroll();
if (fpsMeterOn()) installFpsMeter();
countVisit();
const TOGGLED: Record<Toggled, string> = {
  skipped: 'Visits from this browser are no longer counted. Open poe2.quest/#toggle-goatcounter again to count them.',
  counted: 'Visits from this browser are counted again.',
  unsaved: "This browser can't change the setting: its site storage is blocked or full.",
};
onCountToggle((t) => toasts.show(TOGGLED[t], t === 'unsaved' ? 'error' : 'info', { title: 'Visit counts' }));
// No browser menu on a right click: it brings the system's cursor, and the
// game has no use for it. Text fields keep theirs, where it's how many paste,
// and links theirs (open in a new tab, copy the address).
addEventListener('contextmenu', (e) => {
  if (!(e.target as Element | null)?.closest('input, textarea, [contenteditable], a[href]')) e.preventDefault();
});
// No image lifts off the page as a ghost when pressed and moved: nothing in
// the game is dropped anywhere. (A dragstart, not draggable="false" on each,
// so an image added later is covered too.)
addEventListener('dragstart', (e) => {
  if (e.target instanceof HTMLImageElement) e.preventDefault();
});

// Development only: handles for scripts that drive the game and step the
// effects frame by frame to photograph them (the same module instances the
// app uses, which a fresh import during hot reloading wouldn't be).
if (import.meta.env.DEV) Object.assign(window, { __fx: fxCore, __e: fxEffects, __m: fxMoments, __s: session });

const app = mount(Root, {
  target: document.getElementById('app')!,
});

// PeerJS isn't part of the startup scripts: it comes in once the page is
// idle, ready before anyone hosts or joins (lib/peer.ts).
preloadPeerJs();

export default app;
