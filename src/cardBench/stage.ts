// The card bench's stage (cards.html?stage, in the panel's frame): the real
// game screen on a Delve run of the lab's (src/lab), the cards on it dealt as
// the panel pins them, with the game's own deal, hover and moments. A card
// clicked turns over (rather than being picked), as the deal turns it. The
// panel drives it through `window.__cb`.

import { mount } from 'svelte';
import '../app.css';
import App from '../App.svelte';
import { installUiFx } from '../lib/fx/ui';
import { installUiSounds } from '../lib/sound';
import { engine, session } from '../lib/session.svelte';
import { wantDelveBackdrop } from '../lib/backdrop';
import { WAY_OUT, type FindKind } from '../lib/delve';
import { FIND_TEXT } from '../lib/difficultyText';
import { WAY_OUT_CARD } from '../lib/wayOut/lantern';
import * as L from '../lab/controls.svelte';
import { TURN } from '../components/ChooseCategory.svelte';
import { cubicInOut } from 'svelte/easing';
import { printing } from '../lib/platePrint.svelte';

installUiSounds();
installUiFx();
// No achievement toasts over the head, and no scrollbar taking width, as on a phone.
const quiet = document.createElement('style');
quiet.textContent = '.toasts { display: none !important; } html { scrollbar-width: none; }';
document.head.append(quiet);
session.resume();
wantDelveBackdrop();
L.boot();
mount(App, { target: document.getElementById('app')! });

export type BenchCard = { category: string; kind: FindKind | null };

/** Deals these cards (up to three), replaying the deal. */
function deal(cards: BenchCard[]) {
  L.dealThese(cards);
}

// ---- turning a card over ----------------------------------------------------
// As the deal turns it (ChooseCategory's TURN, its easing sampled): lifted off
// the table while it turns, across when the cards stand as wide rows (narrow
// screens), else sideways, face down from halfway (the card's .down shows its
// back). Not while it is turning already, the deal's turn or one of these: it
// would jump, and the deal's own .down would cross this one's.

const BENCH_TURN = 'bench-turn';
const cards = () => [...document.querySelectorAll<HTMLElement>('.choose .cards > .card')];
const isDown = (card: HTMLElement) => card.classList.contains('down');

function turnOver(card: HTMLElement) {
  const turn = card.querySelector<HTMLElement>('.turn');
  if (!turn || turn.getAnimations().some((a) => a.playState === 'running')) return;
  const axis = matchMedia(TURN.across).matches ? 'X' : 'Y';
  const from = Number(card.dataset.benchTurn ?? 0);
  card.dataset.benchTurn = String(from + 180);
  const frames = Array.from({ length: 25 }, (_, i) => {
    const f = cubicInOut(i / 24);
    const lift = Math.sin(Math.PI * f);
    return { offset: i / 24, transform: `perspective(${TURN.perspective}px) translateY(${(-lift * TURN.lift).toFixed(2)}px) rotate${axis}(${(from + 180 * f).toFixed(2)}deg) scale(${(1 + TURN.swell * lift).toFixed(4)})` };
  });
  // Only the bench's own turns: the deal's is Svelte's to keep.
  for (const a of turn.getAnimations()) if (a.id === BENCH_TURN) a.cancel();
  turn.animate(frames, { id: BENCH_TURN, duration: TURN.seconds * 1000, fill: 'forwards' });
  setTimeout(() => card.classList.toggle('down', ((from + 180) / 180) % 2 === 1), (TURN.seconds * 1000) / 2);
}

/** Turns card `i` over, or every card, left to right. */
function flip(i?: number) {
  const all = cards();
  if (i !== undefined) return all[i] && turnOver(all[i]);
  all.forEach((card, j) => setTimeout(() => turnOver(card), j * 120));
}

// A click turns the card over instead of picking it; a card lying face down
// is left alone by the pointer (no tilt, no fire), as one being dealt is.
const onCard = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>('.choose .cards > .card') : null);
addEventListener(
  'click',
  (e) => {
    const card = onCard(e);
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
    turnOver(card);
  },
  true,
);
for (const type of ['pointerenter', 'pointermove'])
  addEventListener(
    type,
    (e) => {
      const card = onCard(e);
      if (card && isDown(card)) e.stopPropagation();
    },
    true,
  );

/** What a card can be: any category's, or the dig's way out (which carries no find). */
const items = [...engine.categories].sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c }));
items.push({ value: WAY_OUT, label: `${WAY_OUT_CARD.title} (a dig's)` });
const finds = (Object.keys(FIND_TEXT) as FindKind[]).map((kind) => ({ kind, name: FIND_TEXT[kind].name }));

/** The plates drawn as live strokes (true), as they were before their prints (lib/platePrint), or as prints: to compare the two. */
function live(on: boolean) {
  printing.on = !on;
}

Object.assign(window, { __cb: { deal, flip, live, items, finds, ready: true }, __s: session, __lab: L });
