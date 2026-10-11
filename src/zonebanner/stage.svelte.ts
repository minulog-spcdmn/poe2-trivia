// The tuning page's stage (zones.html?stage, in the panel's frame): the real
// game screen on a Delve run of the lab's (src/lab). A new zone's title card
// (components/zonecard) plays as in a game, the run stepping down into the
// zone the engine's way (its cards dealt as the plunge lands), with any name
// or family of motion, and can be stopped at any moment. The panel drives it
// through `window.__zb`.

import { mount } from 'svelte';
import '../app.css';
import App from '../App.svelte';
import { installUiFx } from '../lib/fx/ui';
import { session } from '../lib/session.svelte';
import { wantDelveBackdrop } from '../lib/backdrop';
import * as L from '../lab/controls.svelte';
import { endArrival, previewNext } from '../lib/zoneArrival.svelte';
import { seekCard } from '../components/zonecard/ZoneCard.svelte';
import type { Family } from '../lib/zoneTitle';

installUiFx();
// The run's depth jumps earn the lab's player achievements; their toasts would
// only cover the head here. And no scrollbar taking width, as on a phone.
const quietToasts = document.createElement('style');
quietToasts.textContent = '.toasts { display: none !important; } html { scrollbar-width: none; }';
document.head.append(quietToasts);
session.resume();
// Delve's zone card, over Delve's backdrop: its programs built from the start (in the background).
wantDelveBackdrop();
L.boot();
mount(App, { target: document.getElementById('app')! });

export type CardPlay = {
  /** The zone's first depth. */
  depth: number;
  /** Shown instead of the zone's own name. */
  name?: string;
  /** Moved as this family moves instead of its own. */
  family?: Family;
  /** Alone, past your best (its meta line says so). */
  best?: boolean;
  /** Kept up (its cards never dealt), to be stopped at any moment (seek). */
  hold?: boolean;
};

/** Into the zone at `o.depth` the game's way: a step down from the depth before, with its plunge, sound and card. */
async function card(o: CardPlay) {
  endArrival();
  seekCard(null);
  previewNext({ name: o.name, family: o.family, hold: o.hold });
  await L.zoneEnter(o.depth, () => (session.bestAtStart = o.best ? o.depth - 1 : null));
  if (o.hold && session.state?.delve) {
    // Its cards kept on their way, so the card stays.
    const s = structuredClone(session.state);
    s.delve!.dealAt = session.hostNow() + 3_600_000;
    s.version++;
    session.labSetState(s);
  }
}

Object.assign(window, { __zb: { card, seek: seekCard, ready: true }, __s: session, __lab: L });
