// Works out veiled patches' burns (burn.ts) away from the page's main
// thread, all of them on the one clock: on an iPhone the burns' arithmetic
// held the page for most of every question of a race (materialize.ts). Each
// frame the page is sent the box of each canvas that changed, its pixels as
// they now are, which it puts on the patch's canvas as they come; and where
// each caught, where its sparks fly and when it's done.
//
// The worker doesn't draw on the patches' canvases itself (one handed over,
// transferControlToOffscreen): on Chrome on Android (an emulator's, Chrome
// 133) a canvas drawn from a worker showed nothing or a white block for as
// long as the patch was there, while the same pixels put on the page showed.
// Putting a box is a copy, a little of what the page did before; working it
// out was the rest.

import { Burn, type BurnSetup } from './burn';

export type BurnJob =
  /** A patch to burn in, W × H, its picture drawn over the whole of it. */
  | { t: 'burn'; id: number; picture: ImageBitmap; setup: BurnSetup }
  /** Its canvas is gone: no more of it. */
  | { t: 'stop'; id: number }
  /** Still there? Answered with 'here'. */
  | { t: 'ping' };

/** RGBA pixels, as ImageData holds them. */
export type Pixels = Uint8ClampedArray<ArrayBuffer>;

/** A box of a burn's canvas (x, y, w, h) and its pixels (w × h), by burn. */
export type BurnBox = [id: number, box: [number, number, number, number], px: Pixels];

export type BurnNews =
  /** Loaded, or still there when asked. */
  | { t: 'here' }
  /** A burn begun: the whole of its canvas's pixels (W × H, those still to come in clear), and where it caught if at a point, with nothing there yet to spread in from. */
  | { t: 'begun'; id: number; px: Pixels; at: [number, number] | null }
  /** A frame of all the burns: the box each changed, their sparks (BurnFrame's), by burn, and those done (one done before it began has nothing to show: its picture goes as it is). */
  | { t: 'frame'; boxes: BurnBox[]; sparks: [number, number[]][]; done: number[] };

const say = (news: BurnNews, transfer: Transferable[] = []) => self.postMessage(news, { transfer });

/** The burns going on, by id: each one's pixels, as its canvas on the page has them. */
const burns = new Map<number, { burn: Burn; art: Pixels; W: number }>();

/** The box `[x, y, w, h]` of `art` (`W` px wide), copied out. */
function boxOf(art: Pixels, W: number, [x, y, w, h]: [number, number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) px.set(art.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4), r * w * 4);
  return px;
}

// The display's frames where a worker has them; a timer at its rate where it hasn't.
const later: (step: (now: number) => void) => void =
  typeof self.requestAnimationFrame === 'function'
    ? (step) => void self.requestAnimationFrame(step)
    : (step) => void setTimeout(() => step(performance.now()), 1000 / 60);
let ticking = false;

const tick = (now: number) => {
  ticking = false;
  const boxes: BurnBox[] = [];
  const sparks: [number, number[]][] = [];
  const done: number[] = [];
  for (const [id, b] of burns) {
    const f = b.burn.frame(now);
    if (f.box) boxes.push([id, f.box, boxOf(b.art, b.W, f.box)]);
    if (f.sparks.length) sparks.push([id, f.sparks]);
    if (f.done) {
      burns.delete(id);
      done.push(id);
    }
  }
  if (boxes.length || sparks.length || done.length)
    say(
      { t: 'frame', boxes, sparks, done },
      boxes.map(([, , px]) => px.buffer),
    );
  if (burns.size) go();
};
const go = () => {
  if (ticking) return;
  ticking = true;
  later(tick);
};

function begin(id: number, picture: ImageBitmap, setup: BurnSetup) {
  const { W, H } = setup;
  // (Read back once: in memory, not on the GPU.)
  const ctx = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(picture, 0, 0, W, H);
  picture.close();
  const art = ctx.getImageData(0, 0, W, H).data;
  const burn = new Burn(art, setup);
  if (burn.empty) return say({ t: 'frame', boxes: [], sparks: [], done: [id] });
  const px = art.slice();
  say({ t: 'begun', id, px, at: burn.origin }, [px.buffer]);
  burns.set(id, { burn, art, W });
  go();
}

self.onmessage = ({ data: job }: MessageEvent<BurnJob>) => {
  if (job.t === 'ping') return say({ t: 'here' });
  if (job.t === 'stop') return void burns.delete(job.id);
  try {
    begin(job.id, job.picture, job.setup);
  } catch {
    // (The page draws its picture as it is.)
    burns.delete(job.id);
    say({ t: 'frame', boxes: [], sparks: [], done: [job.id] });
  }
};

say({ t: 'here' });
