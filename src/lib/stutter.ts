// How smoothly a game's frames came on a player's device, counted once a
// game (count.ts countGameFrames, "frames/ios/some/reveal"), so a deploy that
// makes the game stutter shows in Analytics within a day or two, on devices
// nobody here has. Measured only while a game is under way (a deal, a
// question, a reveal; not the menus, the lobby or the results) and the page
// is seen: the gaps between its animation frames. What goes out is coarse:
// the device's class, how much of the game's time went to frames over
// LONG_MS (smooth, some, many), and for a game that stuttered, the moment
// most of it fell in. Nothing finer: no timings, no device details beyond
// the class. Pure, so the tests can feed it; count.ts gives it the browser.

/**
 * What a device is counted as: a computer's Chrome or another Chromium
 * browser (Edge, Opera, Brave: one engine), a computer's other browser
 * (Firefox, Safari), an iPhone or iPad (every browser there is Safari's
 * engine), an Android phone or tablet.
 */
export const DEVICES = ['desktop-chrome', 'desktop-other', 'ios', 'android'] as const;
export type Device = (typeof DEVICES)[number];

/** What the browser says of itself, as deviceOf reads it (navigator, its userAgentData where it has one). */
export interface BrowserSays {
  userAgent: string;
  maxTouchPoints?: number;
  userAgentData?: { brands?: { brand: string }[]; platform?: string };
}

export function deviceOf(b: BrowserSays): Device {
  // (Android's Chrome asked for the desktop site says Linux, but still Android to userAgentData.)
  if (/Android/i.test(b.userAgent) || b.userAgentData?.platform === 'Android') return 'android';
  // An iPad says it's a Mac, one that can be touched.
  if (/iPhone|iPad|iPod/.test(b.userAgent) || (/Macintosh/.test(b.userAgent) && (b.maxTouchPoints ?? 0) > 1)) return 'ios';
  const brands = b.userAgentData?.brands;
  const chromium = brands ? brands.some((x) => x.brand === 'Chromium') : /Chrom(e|ium)\//.test(b.userAgent);
  return chromium ? 'desktop-chrome' : 'desktop-other';
}

/** A game's moments: the categories dealt (its "choosing" phase), a question, its reveal. */
export const MOMENTS = ['deal', 'question', 'reveal'] as const;
export type Moment = (typeof MOMENTS)[number];

/** A frame longer than this is a stutter: two frames missed on a 60 Hz screen, and more. */
export const LONG_MS = 50;
/**
 * A gap between frames counts up to this long: a longer one is mostly the
 * page held still while seen (a phone's control centre pulled down, a
 * window dragged), so a freeze counts as a second of stutter at most.
 */
export const GAP_CAP_MS = 1_000;
/** Less than this seen of a game, and one hitch decides it: not counted. */
export const MIN_MS = 20_000;

/**
 * The share of a game's time spent in frames over LONG_MS from which it
 * isn't smooth (SOME_FROM) and stutters a lot (MANY_FROM). Time, not the
 * share of frames: screens refresh 60 to 240 times a second, and the same
 * hitches are a quarter the share of a 240 Hz screen's frames.
 *
 * Set against real games (Oct 29 2026, Chrome at 4K and 240 Hz on the
 * owner's PC, solo Take turns): 90 s with no frame over 50 ms, and 34 s
 * whose five, four of them in the game's first second, made 1.3%; over a
 * game of a few minutes, 0.2%. A long frame at every screen change on a
 * slower device (one every five seconds or so, 70 ms each) makes about 1.4%:
 * a hitch players see each time, so "some". 5% is three seconds of every
 * minute: the game is choppy throughout.
 */
export const SOME_FROM = 0.01;
export const MANY_FROM = 0.05;

export const BUCKETS = ['smooth', 'some', 'many'] as const;
export type Bucket = (typeof BUCKETS)[number];

/** A game's bucket, from the time it was seen and the part of it in long frames. */
export const bucketOf = (longMs: number, ms: number): Bucket => {
  const share = ms > 0 ? longMs / ms : 0;
  return share >= MANY_FROM ? 'many' : share >= SOME_FROM ? 'some' : 'smooth';
};

/** What a game's frames came to: its bucket, and for one that stuttered, the moment most of it fell in. */
export interface Verdict {
  bucket: Bucket;
  worst: Moment | null;
}

/** One game's frames, as they come: the time seen, and the part of it in long frames by moment. */
export class FrameTally {
  ms = 0;
  readonly long: Record<Moment, number> = { deal: 0, question: 0, reveal: 0 };

  /** A gap between two frames, ending in `moment`: the moment the frame drew, so a reveal's slow first frame is the reveal's. */
  add(gap: number, moment: Moment) {
    const ms = Math.min(gap, GAP_CAP_MS);
    if (!(ms > 0)) return;
    this.ms += ms;
    if (ms > LONG_MS) this.long[moment] += ms;
  }

  /** What it counts as; null for too little seen (MIN_MS). */
  verdict(): Verdict | null {
    if (this.ms < MIN_MS) return null;
    const bucket = bucketOf(MOMENTS.reduce((n, m) => n + this.long[m], 0), this.ms);
    if (bucket === 'smooth') return { bucket, worst: null };
    return { bucket, worst: MOMENTS.reduce((a, b) => (this.long[b] > this.long[a] ? b : a)) };
  }
}

/** The path a game's frames are counted under: "frames/ios/smooth", "frames/android/some/reveal". */
export const framesEvent = (device: Device, v: Verdict) => `frames/${device}/${v.bucket}${v.worst ? `/${v.worst}` : ''}`;

/** What a path says (framesEvent), or null for one that isn't a game's frames. */
export function readFramesPath(path: string): { device: Device; bucket: Bucket; worst: Moment | null } | null {
  const m = /^frames\/([\w-]+)\/(\w+)(?:\/(\w+))?$/.exec(path);
  if (!m || !(DEVICES as readonly string[]).includes(m[1]) || !(BUCKETS as readonly string[]).includes(m[2])) return null;
  if (m[3] !== undefined && !(MOMENTS as readonly string[]).includes(m[3])) return null;
  return { device: m[1] as Device, bucket: m[2] as Bucket, worst: (m[3] as Moment | undefined) ?? null };
}

/** The browser's frames as GameFrames needs them (requestAnimationFrame), and whether the page is seen. */
export interface FrameClock {
  frame(cb: (t: number) => void): number;
  cancel(id: number): void;
  seen(): boolean;
}

/**
 * One page's games' frames: a loop of animation frames runs only while a
 * game is under way and the page is seen, each gap between two frames added
 * to the game's tally. A gap across the page being hidden is no frame, so
 * the first after it is left out. Its verdict goes to `done` once a game,
 * as it ends, is left, or the page is (end).
 */
export class GameFrames {
  private tally: FrameTally | null = null;
  private moment: Moment | null = null;
  private id: number | null = null;
  private last: number | null = null;
  private readonly clock: FrameClock;
  private readonly done: (v: Verdict) => void;

  constructor(clock: FrameClock, done: (v: Verdict) => void) {
    this.clock = clock;
    this.done = done;
  }

  /** The game's moment on this page now, or null for none under way (decided, left, never begun). */
  at(moment: Moment | null) {
    if (!moment) return this.end();
    this.tally ??= new FrameTally();
    this.moment = moment;
    this.run();
  }

  /** The page shown or hidden. */
  shown() {
    this.stop();
    if (this.tally && this.clock.seen()) this.run();
  }

  /** The game over, left, or the page left: its verdict given, if it has one, and nothing more measured until the next. */
  end() {
    this.stop();
    const v = this.tally?.verdict();
    this.tally = null;
    this.moment = null;
    if (v) this.done(v);
  }

  private run() {
    if (this.id === null && this.clock.seen()) this.id = this.clock.frame(this.tick);
  }

  private stop() {
    if (this.id !== null) this.clock.cancel(this.id);
    this.id = null;
    this.last = null;
  }

  private tick = (t: number) => {
    this.id = null;
    if (!this.tally || !this.moment || !this.clock.seen()) return void (this.last = null);
    if (this.last !== null) this.tally.add(t - this.last, this.moment);
    this.last = t;
    this.id = this.clock.frame(this.tick);
  };
}
