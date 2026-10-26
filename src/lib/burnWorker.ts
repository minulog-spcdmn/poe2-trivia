// Burns veiled patches in (burn.ts) away from the page's main thread, each
// on its own canvas handed over to it (transferControlToOffscreen), all of
// them on the one clock: on an iPhone the burns' arithmetic held the page
// for most of every question of a race (materialize.ts). The page hears only
// where each caught, where its sparks fly and when it's done.
//
// Each canvas is kept here, burnt in or not, until the page lets it go: a
// canvas handed over shows only what its OffscreenCanvas holds while that
// lives. Once it's collected (or this worker is let go), Chromium shows the
// canvas blank as soon as the tab's frames are thrown away (several other
// tabs visited, Chrome on Android sent to the background) and it stays so,
// though drawImage still reads its pixels.

import { Burn, type BurnSetup } from './burn';

export type BurnJob =
  /** A patch to burn in on `canvas` (W × H already), its picture drawn over the whole of it. */
  | { t: 'burn'; id: number; canvas: OffscreenCanvas; picture: ImageBitmap; setup: BurnSetup }
  /** Its canvas is gone: no more of it, and it's let go. */
  | { t: 'stop'; id: number }
  /** Still there? Answered with 'here'. */
  | { t: 'ping' };

export type BurnNews =
  /** Loaded, or still there when asked. */
  | { t: 'here' }
  /** A burn that caught at a point (canvas px), with nothing there yet to spread in from. */
  | { t: 'caught'; id: number; at: [number, number] }
  /** A frame of all the burns: their sparks (BurnFrame's), by burn, and those done. */
  | { t: 'frame'; sparks: [number, number[]][]; done: number[] };

const say = (news: BurnNews) => self.postMessage(news);

type Ctx = OffscreenCanvasRenderingContext2D;
/** The burns going on, by id. */
const burns = new Map<number, { burn: Burn; ctx: Ctx; art: ImageData }>();
/** Every canvas handed over, by id, till the page lets it go ('stop'): those burnt in are still on the page. */
const held = new Map<number, OffscreenCanvas>();

// The display's frames where a worker has them (a canvas handed over is
// shown as each of them ends); a timer at its rate where it hasn't.
const later: (step: (now: number) => void) => void =
  typeof self.requestAnimationFrame === 'function'
    ? (step) => void self.requestAnimationFrame(step)
    : (step) => void setTimeout(() => step(performance.now()), 1000 / 60);
let ticking = false;

const tick = (now: number) => {
  ticking = false;
  const sparks: [number, number[]][] = [];
  const done: number[] = [];
  for (const [id, b] of burns) {
    const f = b.burn.frame(now);
    if (f.box) b.ctx.putImageData(b.art, 0, 0, ...f.box);
    if (f.sparks.length) sparks.push([id, f.sparks]);
    if (f.done) {
      burns.delete(id);
      done.push(id);
    }
  }
  if (sparks.length || done.length) say({ t: 'frame', sparks, done });
  if (burns.size) go();
};
const go = () => {
  if (ticking) return;
  ticking = true;
  later(tick);
};

function begin(id: number, canvas: OffscreenCanvas, picture: ImageBitmap, setup: BurnSetup) {
  held.set(id, canvas);
  const { W, H } = setup;
  // (Read back every frame: in memory, not on the GPU.)
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new Error('no 2d canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(picture, 0, 0, W, H);
  picture.close();
  const art = ctx.getImageData(0, 0, W, H);
  const burn = new Burn(art.data, setup);
  if (burn.empty) return say({ t: 'frame', sparks: [], done: [id] });
  ctx.putImageData(art, 0, 0);
  burns.set(id, { burn, ctx, art });
  if (burn.origin) say({ t: 'caught', id, at: burn.origin });
  go();
}

self.onmessage = ({ data: job }: MessageEvent<BurnJob>) => {
  if (job.t === 'ping') return say({ t: 'here' });
  if (job.t === 'stop') {
    burns.delete(job.id);
    held.delete(job.id);
    return;
  }
  try {
    begin(job.id, job.canvas, job.picture, job.setup);
  } catch {
    // (Its picture is drawn plainly if it got that far, the canvas kept all
    // the same; either way the page counts it done.)
    burns.delete(job.id);
    say({ t: 'frame', sparks: [], done: [job.id] });
  }
};

say({ t: 'here' });
