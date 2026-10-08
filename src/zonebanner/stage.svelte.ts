// The tuning page's stage (zones.html?stage, in the panel's frame): the real
// game screen on a Delve run of the lab's (src/lab), and Delve's zone gate
// (components/zonebanner/Threshold) built over the head of the stage on
// request, timed as Game.svelte times it, for any name. The panel drives it
// through `window.__zb`.

import { mount, unmount } from 'svelte';
import '../app.css';
import App from '../App.svelte';
import Threshold from '../components/zonebanner/Threshold.svelte';
import { quiet } from '../components/zonebanner/head';
import { DELAY, EXIT, HOLD, STILL_FADE } from '../components/zonebanner/thresholdArt';
import { installUiFx } from '../lib/fx/ui';
import { session } from '../lib/session.svelte';
import { wantDelveBackdrop } from '../lib/backdrop';
import * as L from '../lab/controls.svelte';

installUiFx();
// The run's depth jumps earn the lab's player achievements; their toasts would
// only cover the head here. And no scrollbar taking width, as on a phone.
const quietToasts = document.createElement('style');
quietToasts.textContent = '.toasts { display: none !important; } html { scrollbar-width: none; }';
document.head.append(quietToasts);
session.resume();
// Delve's zone gate, over Delve's backdrop: its programs built from the start (in the background).
wantDelveBackdrop();
L.boot();
mount(App, { target: document.getElementById('app')! });

export type Play = {
  title: string;
  sigil: string;
  accent: string;
  /** The depth the run is set to first (quietly: the game's own gate doesn't play). */
  depth: number;
  /** Stay up until told to leave. */
  hold?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Shown = { el: ReturnType<typeof mount>; props: { leaving: boolean }; rules: HTMLElement[]; id: number; still: boolean };
let shown: Shown | null = null;
let timers: ReturnType<typeof setTimeout>[] = [];
let serial = 0;

function clear() {
  timers.forEach(clearTimeout);
  timers = [];
  if (!shown) return;
  unmount(shown.el);
  for (const r of shown.rules) r.style.opacity = '';
  shown = null;
}

/** The head of the stage in play (while turns cross-fade there are two; the last is the new one). */
const headNow = () => [...document.querySelectorAll<HTMLElement>('.game .stage .head')].at(-1) ?? null;

/** Tells the gate to leave; `keep`: leave it in place afterwards (for stepping through the exit frame by frame). */
function leave(keep = false) {
  if (!shown) return;
  const s = shown;
  s.props.leaving = true;
  // The rules come back as the gate goes (as Game.svelte's do).
  for (const r of s.rules) {
    r.style.transition = 'opacity 0.6s 0.75s ease-out';
    r.style.opacity = '';
  }
  if (!keep) timers.push(setTimeout(() => s.id === shown?.id && clear(), (s.still ? STILL_FADE : EXIT) * 1000 + 50));
}

async function play(o: Play) {
  const id = ++serial;
  clear();
  if (L.depthOf() !== o.depth) {
    L.setDepth(o.depth);
    // The header and the scene take the new depth first.
    await sleep(700);
  }
  let head = headNow();
  for (let i = 0; !head && i < 50; i++) {
    await sleep(100);
    head = headNow();
  }
  if (!head || id !== serial) return;
  const rules = [...head.querySelectorAll<HTMLElement>('.banner .rule')];
  for (const r of rules) {
    r.style.transition = 'opacity 0.25s ease-out';
    r.style.opacity = '0';
  }
  const still = quiet();
  const props = $state({ title: o.title, sigil: o.sigil, accent: o.accent, leaving: false, still, delay: still ? 0 : DELAY });
  shown = { el: mount(Threshold, { target: head, props }), props, rules, id, still };
  if (!o.hold) timers.push(setTimeout(() => id === shown?.id && leave(), HOLD * 1000));
}

Object.assign(window, { __zb: { play, leave, clear, ready: true }, __s: session, __lab: L });
