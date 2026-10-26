// Works out veiled patches' burns (burn.ts) away from the page's main
// thread, all of them on the one clock: on an iPhone the burns' arithmetic
// held the page for most of every question of a race (materialize.ts). The
// page is sent the box of each canvas that changed, its pixels as they now
// are, which it puts on the patch's canvas; and where each caught, where its
// sparks fly and when it's done.
//
// The worker doesn't draw on the patches' canvases itself (one handed over,
// transferControlToOffscreen): on Chrome on Android (an emulator's, Chrome
// 133) a canvas drawn from a worker showed nothing or a white block for as
// long as the patch was there, while the same pixels put on the page showed.
//
// Only one frame is with the page at a time. The burns go on at the
// display's rate whatever the page does, so while the page hasn't put the
// last (it runs slower than the display: a busy reveal, Low Power Mode), the
// worker only gathers what changed, and sends it all as one once the page
// has: the page puts each box once a frame of its own at most, as it did
// when it burnt them itself, never a pile of frames that were never shown.
// Each burn's pixels go back and forth in the one buffer, the size of its
// canvas, of which only the box sent is filled: nothing is made anew for a
// frame.

import { Burn, type BurnSetup } from './burn';

/** RGBA pixels, as ImageData holds them. */
export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export type BurnJob =
  /** A patch to burn in, W × H, its picture drawn over the whole of it. */
  | { t: 'burn'; id: number; picture: ImageBitmap; setup: BurnSetup }
  /** Its canvas is gone: no more of it. */
  | { t: 'stop'; id: number }
  /** The last frame is put: each burn's pixels back, by burn, for the next. */
  | { t: 'put'; back: [number, Pixels][] }
  /** Still there? Answered with 'here'. */
  | { t: 'ping' };

/** A burn's canvas's pixels (W × H), only the box (x, y, w, h) of them filled, by burn. */
export type BurnBox = [id: number, box: [number, number, number, number], px: Pixels];

export type BurnNews =
  /** Loaded, or still there when asked. */
  | { t: 'here' }
  /**
   * What the burns did since the last frame the page put: those begun, the
   * whole of their canvas's pixels (W × H, those still to come in clear),
   * and where each caught if at a point, with nothing there yet to spread in
   * from; the box each of the others changed; their sparks (BurnFrame's), by
   * burn; and those done (one done before it began has nothing to show: its
   * picture goes as it is). The page answers 'put'.
   */
  | { t: 'frame'; begun: [number, Pixels, [number, number] | null][]; boxes: BurnBox[]; sparks: [number, number[]][]; done: number[] };

const say = (news: BurnNews, transfer: Transferable[] = []) => self.postMessage(news, { transfer });

/** A burn going on, and what of it the page hasn't been sent yet. */
interface Going {
  burn: Burn;
  /** Its pixels as they now are (W px wide). */
  art: Pixels;
  W: number;
  /** Its buffer for the page's copy; null while the page has it (or it hasn't begun there). */
  px: Pixels | null;
  /** The page has been sent its start. */
  begun: boolean;
  /** The box it changed since it was last sent (x0, y0, x1, y1, the last ones in it). */
  box: [number, number, number, number] | null;
  sparks: number[];
  done: boolean;
}

/** The burns going on, by id, and those done till the page has been told. */
const burns = new Map<number, Going>();
/** Burns that couldn't begin, the page yet to be told. */
let failed: number[] = [];
/** A frame is with the page, not put yet. */
let out = false;

/** The box `[x0, y0, x1, y1]` of `art` copied into `px` (both `W` px wide), in place. */
function fill(px: Pixels, art: Pixels, W: number, [x0, y0, x1, y1]: [number, number, number, number]) {
  for (let y = y0; y <= y1; y++) px.set(art.subarray((y * W + x0) * 4, (y * W + x1 + 1) * 4), (y * W + x0) * 4);
}

/** Sends the page what it hasn't had, unless the last frame isn't put yet. */
function send() {
  if (out) return;
  const begun: [number, Pixels, [number, number] | null][] = [];
  const boxes: BurnBox[] = [];
  const sparks: [number, number[]][] = [];
  const done = failed;
  failed = [];
  for (const [id, g] of burns) {
    if (!g.begun) {
      const px = g.px ?? new Uint8ClampedArray(g.art.length);
      px.set(g.art);
      begun.push([id, px, g.burn.origin]);
      g.begun = true;
      g.px = null;
      g.box = null;
    } else if (g.box) {
      const px = g.px ?? new Uint8ClampedArray(g.art.length);
      fill(px, g.art, g.W, g.box);
      const [x0, y0, x1, y1] = g.box;
      boxes.push([id, [x0, y0, x1 - x0 + 1, y1 - y0 + 1], px]);
      g.px = null;
      g.box = null;
    }
    if (g.sparks.length) {
      sparks.push([id, g.sparks]);
      g.sparks = [];
    }
    if (g.done) {
      burns.delete(id);
      done.push(id);
    }
  }
  if (!begun.length && !boxes.length && !sparks.length && !done.length) return;
  out = true;
  say({ t: 'frame', begun, boxes, sparks, done }, [...begun.map(([, px]) => px.buffer), ...boxes.map(([, , px]) => px.buffer)]);
}

// The display's frames where a worker has them; a timer at its rate where it hasn't.
const later: (step: (now: number) => void) => void =
  typeof self.requestAnimationFrame === 'function'
    ? (step) => void self.requestAnimationFrame(step)
    : (step) => void setTimeout(() => step(performance.now()), 1000 / 60);
let ticking = false;

const tick = (now: number) => {
  ticking = false;
  let going = false;
  for (const g of burns.values()) {
    if (g.done) continue;
    const f = g.burn.frame(now);
    if (f.box) {
      const [x, y, w, h] = f.box;
      const b = g.box;
      g.box = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x + w - 1), Math.max(b[3], y + h - 1)] : [x, y, x + w - 1, y + h - 1];
    }
    for (const s of f.sparks) g.sparks.push(s);
    g.done = f.done;
    going ||= !f.done;
  }
  send();
  if (going) go();
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
  if (burn.empty) {
    failed.push(id);
    return send();
  }
  burns.set(id, { burn, art, W, px: null, begun: false, box: null, sparks: [], done: false });
  send();
  go();
}

self.onmessage = ({ data: job }: MessageEvent<BurnJob>) => {
  if (job.t === 'ping') return say({ t: 'here' });
  if (job.t === 'stop') return void burns.delete(job.id);
  if (job.t === 'put') {
    out = false;
    for (const [id, px] of job.back) {
      const g = burns.get(id);
      if (g) g.px = px;
    }
    return send();
  }
  try {
    begin(job.id, job.picture, job.setup);
  } catch {
    // (The page draws its picture as it is.)
    burns.delete(job.id);
    failed.push(job.id);
    send();
  }
};

say({ t: 'here' });
