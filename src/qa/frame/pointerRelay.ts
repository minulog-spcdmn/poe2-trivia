// A seat of a scene in the pointers bench (benches/pointers.ts,
// qa.html?frame=...&pointers=send|take): its pointer, sent as the game sends
// it, handed to the bench instead of a room, or another player's handed in.
//
// - send: the moving player's screen. What the game would send the room
//   (session.pointAt, PeerCursors.svelte's own) goes to the bench, with its
//   stamp. The mouse really over it is told to the bench too, so the other
//   side of before and after moves the same; the hand it's told back, or its
//   own tour of the screen (hand=tour), moves it as a mouse would.
// - take: the watching player's screen. The pointer the bench hands in is
//   drawn as the room's would be (peerCursors).

import { isRelayMessage, type RelayMessage } from '../messages.ts';
import { POINTER, PAD_X, PAD_Y, SIZE, WEIGHT } from '../../lib/pointerArt.ts';
import type { CursorAt } from '../../lib/cursors.ts';
import { GONE } from '../../lib/leaving.ts';

/** The mouse over the screen (or the other side's, before and after) takes the hand from its tour for this long after it last moved (ms). */
const YOURS_MS = 1500;
/** On the tour, how long it rests on each thing it goes to (ms), and how many it goes to at most. */
const DWELL_MS = 600;
const STOPS = 24;
/** How often it looks again whether what's on the screen changed (ms). */
const RELOOK_MS = 1000;
/** A stop this far from where it was measured (px) has moved: the screen changed, not a hover or a pulse. */
const MOVED_PX = 6;

interface Relayed {
  session: { pointAt: (at: CursorAt | null, ms?: number) => void };
}

export async function relayPointers(asked: URLSearchParams, { session }: Relayed) {
  const role = asked.get('pointers');
  const tell = (m: RelayMessage) => parent.postMessage(m, location.origin);
  const heard = (fn: (m: RelayMessage) => void) =>
    addEventListener('message', (e) => {
      if (e.source === parent && e.origin === location.origin && isRelayMessage(e.data)) fn(e.data);
    });

  if (role === 'take') {
    const { peerCursors } = await import('../../lib/peerCursors.svelte.ts');
    heard((m) => {
      if (m.qa === 'pointer-in') (peerCursors.set as (key: string, at: CursorAt | null, ms?: number) => void)(m.key, m.at, m.ms);
    });
    return;
  }
  if (role !== 'send') return;

  // What the game sends the room goes to the bench, stamped as the game stamps it (cursors.ts stampOf, written out
  // here: before and after (B) runs this file on the code before, which may not have it).
  session.pointAt = (at, ms = performance.now()) => tell({ qa: 'pointer', at, ms: Math.floor(ms) % 65536 });

  // Its hand, where it's moved for it (by the other side's mouse, or its tour): the dart's outline, plain.
  const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mark.setAttribute('viewBox', `${-PAD_X} ${-PAD_Y} ${SIZE[0]} ${SIZE[1]}`);
  mark.setAttribute('width', String(SIZE[0]));
  mark.setAttribute('height', String(SIZE[1]));
  mark.innerHTML = `<path d="${POINTER.outline}" stroke-width="${WEIGHT.outline * 1.4}" />`;
  mark.style.cssText = 'position: fixed; left: 0; top: 0; z-index: 1000; pointer-events: none; overflow: visible; fill: rgba(10, 9, 8, 0.6); stroke: #fff4e0; display: none;';
  document.body.append(mark);
  const moveTo = (x: number, y: number) => {
    mark.style.display = '';
    mark.style.transform = `translate(${x - PAD_X}px, ${y - PAD_Y}px)`;
    dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true }));
  };
  const goAway = () => {
    mark.style.display = 'none';
    document.dispatchEvent(new PointerEvent('pointerout', { pointerType: 'mouse', relatedTarget: null, bubbles: true }));
  };

  // The mouse really over it: told to the bench, and its tour waits.
  let mine = -Infinity;
  addEventListener(
    'pointermove',
    (e) => {
      if (!e.isTrusted || e.pointerType !== 'mouse') return;
      mine = performance.now();
      mark.style.display = 'none';
      tell({ qa: 'mouse', x: e.clientX, y: e.clientY });
    },
    { passive: true },
  );
  document.addEventListener('pointerout', (e) => {
    if (e.isTrusted && e.pointerType === 'mouse' && !e.relatedTarget) tell({ qa: 'mouse', gone: true });
  });
  // The other side's mouse: it moves this hand, and the tour waits the same.
  heard((m) => {
    if (m.qa !== 'hand') return;
    mine = performance.now();
    if ('gone' in m) goAway();
    else moveTo(m.x, m.y);
  });

  if (asked.get('hand') !== 'tour') return;
  const speed = Math.max(0.1, Number(asked.get('speed') ?? 1));
  // What it tours, measured once (and again only when what's on the screen changes: RELOOK_MS, MOVED_PX).
  let tour = touring(stops(), speed);
  setInterval(() => {
    const now = stops();
    const moved = now.length !== tour.stops.length || now.some(([x, y], i) => Math.hypot(x - tour.stops[i][0], y - tour.stops[i][1]) > MOVED_PX);
    if (moved) tour = touring(now, speed);
  }, RELOOK_MS);
  requestAnimationFrame(function frame() {
    requestAnimationFrame(frame);
    if (performance.now() - mine < YOURS_MS) return;
    const p = toured(tour, Date.now());
    if (p) moveTo(p[0], p[1]);
  });
}

/** What the tour goes to: what pointers are placed on (data-cursor) and hold nothing more particular, in reading order, to the pixel (the same on both sides of before and after). */
function stops(): [number, number][] {
  const out: { x: number; y: number }[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-cursor]')) {
    if (el.querySelector('[data-cursor]') || el.closest(GONE)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    out.push({ x: Math.min(innerWidth - 4, r.left + Math.min(r.width * 0.4, 160)), y: Math.min(innerHeight - 4, r.top + r.height * 0.55) });
  }
  out.sort((a, b) => Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x);
  return out.slice(0, STOPS).map((p) => [Math.round(p.x), Math.round(p.y)]);
}

const ease = (k: number) => k * k * k * (k * (6 * k - 15) + 10);

interface Tour {
  stops: [number, number][];
  legs: { p: [number, number]; q: [number, number]; d: number; ms: number }[];
  /** How long once round (ms). */
  round: number;
}

/**
 * The tour of `at`: from one thing to the next as a hand reaches, longer
 * the further (whole ms, the same on both sides of before and after),
 * resting on each. Measured once: the hand's place is the time into the
 * round, and a round a hair longer (a stop measured a fraction of a pixel
 * off, under a hover or a pulse) put it somewhere else on it at once.
 */
function touring(at: [number, number][], speed: number): Tour {
  const legs = at.map((p, i) => {
    const q = at[(i + 1) % at.length];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return { p, q, d, ms: Math.round((220 + 120 * Math.log2(1 + d / 40)) / speed) };
  });
  return { stops: at, legs, round: legs.reduce((n, l) => n + l.ms + DWELL_MS, 0) };
}

/** Where the tour has the hand at time `t` (Date.now: the same on both sides of before and after), bowing a little as it goes. */
function toured({ stops: at, legs, round }: Tour, t: number): [number, number] | null {
  if (at.length < 2) return at[0] ?? null;
  let left = t % round;
  for (const { p, q, d, ms } of legs) {
    if (left < DWELL_MS) return p;
    left -= DWELL_MS;
    if (left < ms) {
      const u = left / ms;
      const k = ease(u);
      const bow = Math.sin(Math.PI * u) * Math.min(40, d * 0.08);
      const [nx, ny] = d ? [-(q[1] - p[1]) / d, (q[0] - p[0]) / d] : [0, 0];
      return [p[0] + (q[0] - p[0]) * k + nx * bow, p[1] + (q[1] - p[1]) * k + ny * bow];
    }
    left -= ms;
  }
  return at[0];
}
