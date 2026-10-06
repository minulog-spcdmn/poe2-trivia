// The preview's stage (zones.html?stage, in the panel's frame): the real
// game screen on a Delve run of the lab's (src/lab), and a zone banner laid
// over the head of the stage on request, timed as the game would time it.
// The panel drives it through `window.__zb`.

import { mount, unmount } from 'svelte';
import '../app.css';
import App from '../App.svelte';
import ZoneBanner from '../components/zonebanner/ZoneBanner.svelte';
import { conceptOf, HOLD, START_DELAY, type ConceptId } from '../components/zonebanner/concepts';
import { installUiFx } from '../lib/fx/ui';
import { session } from '../lib/session.svelte';
import * as L from '../lab/controls.svelte';

installUiFx();
// The run's depth jumps earn the lab's player achievements; their toasts would
// only cover the head here. And no scrollbar taking width, as on a phone.
const quietToasts = document.createElement('style');
quietToasts.textContent = '.toasts { display: none !important; } html { scrollbar-width: none; }';
document.head.append(quietToasts);
session.resume();
L.boot();
mount(App, { target: document.getElementById('app')! });

export type Play = {
  concept: ConceptId;
  title: string;
  sigil: string;
  accent: string;
  /** The depth the run is set to first (quietly: the game's own mark doesn't play). */
  depth: number;
  /** Stay up until told to leave. */
  hold?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let shown: { el: ReturnType<typeof mount>; props: { leaving: boolean }; veiled: HTMLElement[]; id: number } | null = null;
let timers: ReturnType<typeof setTimeout>[] = [];
let serial = 0;

function clear() {
  timers.forEach(clearTimeout);
  timers = [];
  if (!shown) return;
  unmount(shown.el);
  for (const v of shown.veiled) v.style.opacity = '';
  shown = null;
}

/** The head of the stage in play (while turns cross-fade there are two; the last is the new one). */
const headNow = () => [...document.querySelectorAll<HTMLElement>('.game .stage .head')].at(-1) ?? null;

/** Plays the banner's exit; `keep`: leave it in place afterwards (for stepping through the exit frame by frame). */
function leave(keep = false) {
  if (!shown) return;
  const s = shown;
  s.props.leaving = true;
  const { exit } = conceptOf(currentConcept);
  // What gave way comes back once the banner has mostly gone.
  timers.push(
    setTimeout(() => {
      for (const v of s.veiled) {
        v.style.transition = 'opacity 0.6s ease-out';
        v.style.opacity = '';
      }
    }, exit * 0.5),
  );
  if (!keep) timers.push(setTimeout(() => s.id === shown?.id && clear(), exit + 50));
}

let currentConcept: ConceptId = 'chisel';

async function play(o: Play) {
  const id = ++serial;
  clear();
  currentConcept = o.concept;
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
  await sleep(START_DELAY * 1000);
  if (id !== serial) return;
  const veiled = [...head.querySelectorAll<HTMLElement>(conceptOf(o.concept).veilsRules ? '.kicker, .banner .rule' : '.kicker')];
  for (const v of veiled) {
    v.style.transition = 'opacity 0.25s ease-out';
    v.style.opacity = '0';
  }
  const props = $state({ concept: o.concept, title: o.title, sigil: o.sigil, accent: o.accent, leaving: false });
  shown = { el: mount(ZoneBanner, { target: head, props }), props, veiled, id };
  if (!o.hold) timers.push(setTimeout(leave, HOLD));
}

Object.assign(window, { __zb: { play, leave, clear, ready: true }, __s: session, __lab: L });
