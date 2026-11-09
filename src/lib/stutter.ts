// How smoothly a game's frames came on a player's device, counted once a
// game (count.ts countGameFrames, "frames2/ios/some/reveal"), so a deploy that
// makes the game stutter shows in Analytics within a week or two, on devices
// nobody here has. Measured only while a game is under way (its begin, a
// deal, a question, a reveal; not the menus, the lobby or the results) and
// the page is seen: the gaps between its animation frames. What goes out is
// coarse: the device's class, how much of the game's time went to frames
// over LONG_MS (smooth, some, many), and for a game that stuttered, the
// moment most of it fell in; or, on a computer whose browser draws WebGL
// without the GPU, only that (software). Nothing finer: no timings, no
// device details beyond the class, never the renderer's name. Pure, so the
// tests can feed it; count.ts gives it the browser.

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

/**
 * A game's moments: its first seconds on the page (BEGIN_MS), its screen
 * being built among them; then the categories dealt (its "choosing" phase),
 * a question, its reveal.
 */
export const MOMENTS = ['begin', 'deal', 'question', 'reveal'] as const;
export type Moment = (typeof MOMENTS)[number];
/** The moments a game's state tells (count.ts gameMoment): all but its begin, which GameFrames tells by the time. */
export type StateMoment = Exclude<Moment, 'begin'>;

/** How long a game's begin lasts, from the state change that starts it: its screen built, and its first hand dealt. */
export const BEGIN_MS = 3_000;

/**
 * The paths' generation, bumped whenever a change leaves counts not
 * comparable with those before (LONG_MS, SOME_FROM and MANY_FROM, what a
 * moment covers): the stats page reads only this one's, so old and new
 * never mix. "frames" (Oct 29 to Nov 1 2026) counted frames over 50 ms and
 * had no begin.
 */
export const FRAMES = 'frames2';

/**
 * A frame longer than this is a stutter: two frames missed on a 60 Hz
 * screen (50 ms) and more; on a 240 Hz one, nine. Clear of a page drawn at
 * 30 Hz (an iPhone in Low Power Mode, Chrome's Energy Saver), whose every
 * frame is 33 ms, and of its jitter.
 */
export const LONG_MS = 40;
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
 * Set against the traces of issue #331 (Nov 2026). The owner's PC (Chrome,
 * 4K, 240 Hz) has 1 or 2 frames of 29 to 46 ms at each step of a game, of
 * which those of 42 and 46 ms count here, and at Begin up to four, the
 * worst 62 ms. With a step every 5 to 10 seconds, one counted frame a step
 * comes to 0.4 to 0.9% of the game, smooth, and two to 0.9 to 1.8%, about
 * the line: a hitch players see at every step sits on it, so a fix shows as
 * the share that stuttered falling. The iPhone's Begin (91 to 108 ms) is
 * 0.1% of a game of a few minutes: "some" only with more after it, and
 * named the worst moment only where it outweighs the rest. 5% is three
 * seconds of every minute: the game is choppy throughout, as it is in a
 * browser drawing WebGL in software (6 frames a second), counted apart
 * (SOFTWARE).
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
  readonly long: Record<Moment, number> = { begin: 0, deal: 0, question: 0, reveal: 0 };

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

/**
 * A game in a browser that draws WebGL in software (lib/gpuCheck.ts): about
 * 6 frames a second, so it would always read "many", whatever the game
 * does. Counted apart, by itself, and only on a computer, where hardware
 * acceleration can be switched off (count.ts).
 */
export const SOFTWARE = 'software';

/**
 * The path a game's frames are counted under: "frames2/ios/smooth",
 * "frames2/android/some/reveal", or "frames2/desktop-chrome/software" for
 * one drawn in software, whatever its frames came to.
 */
export const framesEvent = (device: Device, v: Verdict | typeof SOFTWARE) =>
  v === SOFTWARE ? `${FRAMES}/${device}/${SOFTWARE}` : `${FRAMES}/${device}/${v.bucket}${v.worst ? `/${v.worst}` : ''}`;

/** What a path says (framesEvent), or null for one that isn't a game's frames of this generation (FRAMES). */
export function readFramesPath(path: string): { device: Device; bucket: Bucket | typeof SOFTWARE; worst: Moment | null } | null {
  const m = /^([\w-]+)\/([\w-]+)\/(\w+)(?:\/(\w+))?$/.exec(path);
  if (!m || m[1] !== FRAMES || !(DEVICES as readonly string[]).includes(m[2])) return null;
  const device = m[2] as Device;
  if (m[3] === SOFTWARE) return m[4] === undefined ? { device, bucket: SOFTWARE, worst: null } : null;
  if (!(BUCKETS as readonly string[]).includes(m[3])) return null;
  if (m[4] !== undefined && !(MOMENTS as readonly string[]).includes(m[4])) return null;
  return { device, bucket: m[3] as Bucket, worst: (m[4] as Moment | undefined) ?? null };
}

/**
 * A visit's first game, counted once more beside its games
 * ("frames2/android/visit/stuttered", count.ts countGameFrames): the first
 * game a page counts, as smooth or stuttered (some and many together), sent
 * the way a step is (count.ts countReach), which GoatCounter counts once a
 * visitor in eight hours. Nothing tells whose a game is, so five games in a
 * row on one slow phone are five stuttered games; here they are one visit,
 * and a share of visits says how many players' devices stuttered, which is
 * what a deploy moves (the stats' health check weighs these, insights.ts
 * healthOf). A visitor who reloads between games counts once under each of
 * the two paths at most. Counted from November 2026; a game drawn in
 * software (SOFTWARE) is no first game.
 */
export const VISIT = 'visit';

/** The path a visit's first game is counted under: "frames2/ios/visit/smooth", "frames2/android/visit/stuttered". */
export const visitEvent = (device: Device, v: Verdict) => `${FRAMES}/${device}/${VISIT}/${v.bucket === 'smooth' ? 'smooth' : 'stuttered'}`;

/** What a path says (visitEvent), or null for one that isn't a visit's first game of this generation (FRAMES). */
export function readVisitPath(path: string): { device: Device; stuttered: boolean } | null {
  const [frames, device, visit, how, ...more] = path.split('/');
  if (frames !== FRAMES || visit !== VISIT || more.length || !(DEVICES as readonly string[]).includes(device)) return null;
  return how === 'smooth' || how === 'stuttered' ? { device: device as Device, stuttered: how === 'stuttered' } : null;
}

/** The browser's frames as GameFrames needs them (requestAnimationFrame), the time on their clock (performance.now), and whether the page is seen. */
export interface FrameClock {
  frame(cb: (t: number) => void): number;
  cancel(id: number): void;
  now(): number;
  seen(): boolean;
}

/**
 * One page's games' frames: a loop of animation frames runs only while a
 * game is under way and the page is seen, each gap between two frames added
 * to the game's tally. The game's first gap runs from the state change that
 * started it, so building its screen counts too, and its first BEGIN_MS are
 * its begin. A gap across the page being hidden is no frame, so the first
 * after it is left out. Its verdict goes to `done` once a game, as it ends
 * or is left (end), or as the page is hidden or left (leave): a game
 * counted as the page was hidden counts no more, seen again or not.
 */
export class GameFrames {
  private tally: FrameTally | null = null;
  private moment: StateMoment | null = null;
  /** When the game started on this page (clock.now); while `building`, its first frame is still to come. */
  private begun = 0;
  private building = false;
  /** The game under way was counted as the page was hidden (leave): nothing more of it is. */
  private spent = false;
  private id: number | null = null;
  private last: number | null = null;
  private readonly clock: FrameClock;
  private readonly done: (v: Verdict) => void;

  constructor(clock: FrameClock, done: (v: Verdict) => void) {
    this.clock = clock;
    this.done = done;
  }

  /** The game's moment on this page now, or null for none under way (decided, left, never begun). */
  at(moment: StateMoment | null) {
    if (!moment) return this.end();
    if (this.spent) return;
    if (!this.tally) {
      this.tally = new FrameTally();
      this.begun = this.clock.now();
      this.building = true;
    }
    this.moment = moment;
    this.run();
  }

  /** The page shown or hidden. */
  shown() {
    this.stop();
    if (this.tally && this.clock.seen()) this.run();
  }

  /** The game over or left: its verdict given, if it has one, and nothing more measured until the next. */
  end() {
    this.stop();
    const v = this.tally?.verdict();
    this.tally = null;
    this.moment = null;
    this.spent = false;
    if (v) this.done(v);
  }

  /**
   * The page hidden or left (a phone often drops a tab switched away from
   * without a word): the game's verdict so far given, if it has one, and
   * nothing more of that game measured. One with too little seen yet
   * carries on if the page is seen again.
   */
  leave() {
    this.stop();
    const v = this.tally?.verdict();
    if (!v) return;
    this.tally = null;
    this.spent = true;
    this.done(v);
  }

  private run() {
    if (this.id === null && this.clock.seen()) this.id = this.clock.frame(this.tick);
  }

  private stop() {
    if (this.id !== null) this.clock.cancel(this.id);
    this.id = null;
    this.last = null;
    // (A first frame after the page was hidden is no measure of building the screen.)
    this.building = false;
  }

  private tick = (t: number) => {
    this.id = null;
    if (!this.tally || !this.moment || !this.clock.seen()) return void (this.last = null);
    if (this.last !== null) this.tally.add(t - this.last, t - this.begun < BEGIN_MS ? 'begin' : this.moment);
    else if (this.building) {
      // The game's first frame, from the state change by the clock: a frame's own time can be the one it was due at, from before the screen was built.
      const now = this.clock.now();
      this.tally.add(now - this.begun, 'begin');
      t = Math.max(t, now);
    }
    this.building = false;
    this.last = t;
    this.id = this.clock.frame(this.tick);
  };
}
