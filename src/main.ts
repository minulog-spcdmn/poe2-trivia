// First: the game's script errors are counted from here on (lib/countErrors.ts).
// The modules imported below run before this file's own code all the same
// (the startup script's shared chunks): theirs are kept until then by the
// inline script at the top of the page (lib/errorsFirst.ts), the one that
// fills in the built-ins an older browser lacks (vite.config.ts polyfillsFirst).
import './lib/countErrors';
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
import { holdViewport } from './lib/viewport';
import { installCursor } from './lib/ownCursor';
import { installAutoscroll } from './lib/autoscroll';
import { fpsMeterOn, switchedOff } from './lib/switchedOff';
import { installFpsMeter } from './lib/fpsMeter';
import { countPage, countSaved, countTime, countVisit, onCountToggle, takeCampaign, type Toggled } from './lib/count';
import { onSaved } from './lib/codex';
import { whenIdle } from './lib/idle';
import { lastPlayed } from './lib/lastPlayed';
import { toasts } from './lib/toasts.svelte';
import { bootSync } from './lib/sync/boot.svelte';

// First: a pairing link's code leaves the address before anything reads it (lib/sync/boot.svelte.ts).
bootSync();
installUiSounds();
installSpatial();
installUiFx();
watchFullscreen();
holdViewport();
if (!switchedOff('cursor')) installCursor();
installAutoscroll();
if (fpsMeterOn()) installFpsMeter();
countVisit(lastPlayed, takeCampaign(), (f) => whenIdle(f, { timeout: 3_000 }));
countPage();
countTime();
onSaved(countSaved);
const TOGGLED: Record<Toggled, string> = {
  skipped: 'Visits from this browser are no longer counted. Open poe2.quest/#toggle-goatcounter again to count them.',
  counted: 'Visits from this browser are counted again.',
  unsaved: "This browser can’t change the setting: its site storage is blocked or full.",
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

// PeerJS and Ed25519 aren't part of the startup scripts: App fetches them
// ahead once the page has settled, in turn with the rest it fetches ahead
// (App.svelte, lib/settled.ts).
const app = mount(Root, {
  target: document.getElementById('app')!,
});

export default app;
