// A fossil taken (docs/gameplay.md, Delve, "Fossils"): its piece, as its
// card wore it (the fossil's art on its amber glow, ChooseCategory's
// .fossil-mark), comes up out of the right answer and flies to a place of
// its own on the game screen, the codex's tally under the header's right
// end, where it lands on its count ("5 of 25"). As a find's sparks go to its
// slot (Scoreboard.svelte findFlows), on the same beat.
//
// The motion, in order (ms from the start):
//   0 to 380     unearthed: it rises out of the answer, growing from a third
//                of its size, quick and then slowing, as a thing lifted out;
//   380 to 520   it hangs, settling back a hair, its weight felt;
//   300 to 550   the tally comes in over its place, so the slot is there;
//   520 to 1180  it flies to the slot along an arc that rises before it
//                falls, speeding up and then slowing into the slot, shrinking
//                to the slot's size and turning upright;
//   1180         it lands: the slot takes the art with a short swell, the
//                count steps up and brightens;
//   3400         the tally fades out.
// With reduced motion, nothing flies: the tally fades in already counting
// it, and fades out.
//
// The pieces hang on the page's body (fixed, outside the game's
// transformed stage), each built and taken away here.

import { fossilArt, fossilById, type FossilId } from './fossils.ts';

const RISE = 380;
const HANG = 140;
const FLIGHT = 660;
const LANDS = RISE + HANG + FLIGHT;
const TALLY_IN = 300;
const TALLY_FOR = 3400;
/** The piece's size in flight, and the slot's in the tally (px). */
const PIECE = 56;
const SLOT = 30;

let current: { stop: () => void } | null = null;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The tally: the fossil's slot and the count, under the header's right end. */
function tallyOf(id: FossilId, before: number, total: number) {
  const tally = document.createElement('div');
  tally.className = 'fossil-tally';
  tally.setAttribute('aria-hidden', 'true');
  const slot = document.createElement('span');
  slot.className = 'slot';
  const art = document.createElement('img');
  art.src = fossilArt(id, 128);
  art.alt = '';
  art.draggable = false;
  slot.append(art);
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = `${before} of ${total}`;
  tally.append(slot, count);
  // Under the header as it stands now (its height is the page's, not a variable this can read).
  const head = document.querySelector('body > #app header, header')?.getBoundingClientRect();
  if (head && head.height) tally.style.top = `${Math.round(head.bottom + 10)}px`;
  return { tally, slot, art, count };
}

/**
 * Plays it: `from` the right answer (or null, when there is none to rise
 * from), `count` the fossils held now, this one in it, of `total`. `still`:
 * reduced motion. Says what stops it (a new one, or the screen going).
 */
export function flyFossil(from: Element | null, id: FossilId, count: number, total: number, still: boolean, delay = 0): () => void {
  current?.stop();
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (f: () => void, ms: number) => timers.push(setTimeout(f, delay + ms));
  const { tally, slot, art, count: counter } = tallyOf(id, still ? count : Math.max(0, count - 1), total);
  tally.title = fossilById(id).name;
  let piece: HTMLElement | null = null;
  const stop = () => {
    for (const t of timers) clearTimeout(t);
    tally.remove();
    piece?.remove();
    if (current?.stop === stop) current = null;
  };
  current = { stop };

  const box = from?.getBoundingClientRect();
  if (still || !box || !box.width) {
    // Nothing to fly from, or no motion: the tally alone, already counting it.
    counter.textContent = `${count} of ${total}`;
    later(() => {
      document.body.append(tally);
      tally.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'forwards' });
    }, TALLY_IN);
    later(() => tally.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(stop, stop), TALLY_FOR);
    return stop;
  }

  later(() => {
    // The piece, as the card wore it.
    piece = document.createElement('div');
    piece.className = 'fossil-flight';
    piece.setAttribute('aria-hidden', 'true');
    const glow = document.createElement('span');
    glow.className = 'glow';
    const img = document.createElement('img');
    img.src = fossilArt(id, 128);
    img.alt = '';
    img.draggable = false;
    piece.append(glow, img);
    const x0 = box.left + box.width / 2 - PIECE / 2;
    const y0 = box.top + box.height / 2 - PIECE / 2;
    piece.style.left = `${x0}px`;
    piece.style.top = `${y0}px`;
    document.body.append(piece);
    const rise = 34;
    // Unearthed, then the hang: one animation, the rise's ease and the settle's in their offsets.
    const lift = piece.animate(
      [
        { opacity: 0, transform: 'translate(0, 0) scale(0.35)', easing: 'cubic-bezier(0.15, 0.85, 0.35, 1)' },
        { opacity: 1, transform: `translate(0, ${-rise}px) scale(1)`, offset: RISE / (RISE + HANG), easing: 'ease-in-out' },
        { opacity: 1, transform: `translate(0, ${-rise + 4}px) scale(1)` },
      ],
      { duration: RISE + HANG, fill: 'forwards' },
    );
    lift.finished.then(() => {
      if (!piece || !tally.isConnected) return;
      // The flight: an arc from where it hangs to the slot, eased as a whole (each step at its eased place, linear between).
      const s = slot.getBoundingClientRect();
      const start = { x: 0, y: -rise + 4 };
      const end = { x: s.left + s.width / 2 - (x0 + PIECE / 2), y: s.top + s.height / 2 - (y0 + PIECE / 2) };
      const ctrl = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - Math.max(60, Math.abs(end.x - start.x) * 0.25) };
      const k = s.width / PIECE;
      const steps = 24;
      const frames: Keyframe[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = easeInOut(i / steps);
        const u = 1 - t;
        const x = u * u * start.x + 2 * u * t * ctrl.x + t * t * end.x;
        const y = u * u * start.y + 2 * u * t * ctrl.y + t * t * end.y;
        frames.push({ transform: `translate(${x}px, ${y}px) scale(${1 + (k - 1) * t}) rotate(${-8 * Math.sin(Math.PI * t)}deg)` });
      }
      lift.cancel();
      piece.animate(frames, { duration: FLIGHT, easing: 'linear', fill: 'forwards' });
    });
  }, 0);

  // The tally comes in over its place before the piece sets off for it.
  later(() => {
    art.style.opacity = '0';
    document.body.append(tally);
    tally.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 250, easing: 'ease-out', fill: 'forwards' });
  }, TALLY_IN);

  // It lands: the slot takes it with a swell, the count steps up.
  later(() => {
    piece?.remove();
    piece = null;
    art.style.opacity = '1';
    slot.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(0.95)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
    counter.textContent = `${count} of ${total}`;
    counter.animate([{ color: '#fff3d6' }, { color: '' }], { duration: 900, easing: 'ease-out' });
  }, LANDS);

  later(() => tally.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(stop, stop), TALLY_FOR);
  return stop;
}

/** The flight's timing, for the benches and tests (ms). */
export const FOSSIL_FLIGHT = { RISE, HANG, FLIGHT, LANDS, TALLY_IN, TALLY_FOR, PIECE, SLOT } as const;
