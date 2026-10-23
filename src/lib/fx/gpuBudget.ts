// How many pixels the backdrop and the effects overlay draw, and how often
// their slow motion is drawn: as many as the screen has, every frame, on a
// GPU that keeps up; less often, then fewer pixels, on one that doesn't.
//
// The pixels are the level (core.ts, sizeAt; backdrop.ts, scale): 0 every
// pixel (up to 1.5 per CSS px for the effects), 1 and 2 fewer (and fewer
// particles). On some screens two levels draw as many pixels (a 1x screen up
// to 1440p: 0 and 1); a drop skips the one that draws no fewer, a climb
// takes it free.
//
// The pace is how often slow motion is drawn: the backdrop's own (embers
// drifting, a slow 9s breath) and the effects while they're calm (a streak's
// fire). It's drawn every frame where the GPU keeps up with that at the
// display's refresh, and less often, down to 30fps (PACES_MS), where it
// doesn't: at 30fps embers step, plain to see on a fast display, so it's
// drawn so seldom only where it must be. There are two paces, one while
// effects play and one while none do: a reveal's effects may leave no room
// for the backdrop every frame at 240Hz, the backdrop alone plenty. A pace
// comes down before a level does: drawing slow motion a little less often
// costs the eye far less than fewer pixels, which blur it all. Touch screens
// draw it at 30fps always (their GPUs draw in tiles, and can't be timed).
//
// Two things are watched: frames (frame(): how long since the last; for the
// level, those drawn while effects play) and, where the GPU can be timed
// (gpuTimer.ts: desktop Chrome and Edge), what each layer's draws cost it, in
// ms per million pixels (gpu()), from which any level's and pace's cost is
// predicted: a high percentile (PEAK) of their draws since the level
// changed. A level's is a frame's at the layers' busiest, against BUDGET_MS;
// a pace's is a frame's on average (the backdrop in only some of them),
// against SHARE of the display's frame. Neither frames nor timings alone are
// enough. Frames can be slow for reasons fewer pixels do nothing for (the
// page's scripts, a slow CPU, a display or power mode capped below 60fps),
// and dropping then only blurs the light. A GPU's timings run long when it's
// lightly loaded, its clocks down, though it would keep up with far more.
// So, for a level and a pace alike (Ladder, each judged against its own
// frame: 60fps's, or the display's refresh where that's slower, for a level;
// the display's refresh for a pace):
//
// - A drop: frames slow for a while (an average well past the frame aimed
//   at, SLOW_MS for 60fps, for SLOW_FOR; one hitch alone never makes it)
//   and, where the GPU is timed, the layers' work predicted over budget (and
//   then frames count as slow as soon as they're LATE). They're timed for a
//   second more, then it drops: where timed, straight to the first step
//   predicted to fit with room to spare (DROP_TO); else one step. Then frames
//   are timed again (frames that count, against frames that count), and a
//   drop that didn't make them clearly quicker is undone, and isn't tried
//   again from that step unless frames get far slower than they were.
// - A climb: frames easy (within EASY of the frame aimed at), after a hold
//   (HOLD_S, longer untimed), and, where timed, the step above predicted to
//   fit, on ten seconds' draws of each layer at this level, so the busiest
//   moments have been seen. A lightly loaded GPU's long timings can make a
//   step that would fit look too dear; one predicted within PROBE_UNDER
//   budgets is still tried now and then (PROBE_S, doubled each time it fails,
//   up to PROBE_MAX_S). A climb that a drop undoes before it has held for
//   STUCK_S doubles the wait before the next, up to BACKOFF_MAX_S. So a GPU
//   busy with something else for a while (a game beside the browser) is
//   dropped for, and climbed back from.
// - One thing at a time: a level doesn't drop while a pace that could still
//   help is coming down (or being timed after it did), and nothing climbs
//   while anything else is being timed or moved. A pace that leaves frames
//   no longer slow enough to bring the level down stays, though not
//   clearly quicker: it spares the pixels, as the backdrop always at 30fps
//   did before there was a pace.
// - Where the GPU can't be timed (Safari, Firefox: timable(false)), a big
//   screen starts a level down, as it always did before the GPU was
//   measured, and climbs only by trying, as above.
// - The level, the paces, and the level's waits are kept for the next visit
//   on a screen about as big (saved()), so a weak GPU never stutters through
//   its first reveal of every visit; it's climbed from, in the same way, if
//   it can be.
//
// Kept apart from core.ts so it can be tested without a GPU.

export type Layer = 'fx' | 'backdrop';
const LAYERS: Layer[] = ['fx', 'backdrop'];

/** Whether effects play (busy) or none do (idle): each has a pace of its own. */
type Mode = 'busy' | 'idle';
const MODES: Mode[] = ['busy', 'idle'];

/** The lowest level. */
export const MAX_LEVEL = 2;

/**
 * The paces slow motion may be drawn at: the least time (ms) between its
 * draws, every frame first, 30fps last. On a display too slow for one (120fps
 * on a 60Hz screen) it draws as often as the one above, and is skipped as a
 * level that draws no fewer pixels is.
 */
export const PACES_MS = [0, 1000 / 120, 1000 / 60, 1000 / 30];
const SLOWEST = PACES_MS.length - 1;

/**
 * The GPU time (ms) the two layers may take in their busiest frames: 60fps's
 * 16.7 less the browser's compositing and the page's own painting.
 */
export const BUDGET_MS = 10;
/** The frame (ms) of the rate a level aims at: 60fps. */
const FRAME_MS = 1000 / 60;
/** The share of a display's frame the layers may take, on average, at a pace: as much as BUDGET_MS is of 60fps's. */
const SHARE = BUDGET_MS / FRAME_MS;
/** A timed drop goes to a step predicted under this share of the budget. */
const DROP_TO = 0.8;
/** The percentile of a layer's draws taken for its cost at its busiest. */
const PEAK = 0.9;
/** It's worked out again once draws this much later (ms) have come in. */
const RESAMPLE_MS = 500;
/** How long (s) a layer must have been drawn (since the level changed) to blame it, and to climb: a second's, ten seconds'. */
const FRESH_DROP_S = 1;
const FRESH_CLIMB_S = 10;
/** Draws a second those must hold at least: a layer drawn now and then hasn't been seen at its busiest. */
const FRESH_RATE = 30;
/** The share of those seconds the draws must span (the first and the last draw of a second are a little under a second apart). */
const SPAN = 0.9;
/** How long (s) of each layer's draws are kept: its latest. */
const KEPT_S = 20;
/** Frames slower than this (ms, on average) count as slow: well past a 60Hz refresh (and as far past a display's, for a pace). */
const SLOW_MS = 22;
/** Where the layers are timed over budget, frames this much longer than the frame aimed at count as slow already. */
const LATE = 1.15;
/** Frames within this much of the frame aimed at, on average, are easy: a climb may be tried. */
const EASY = 1.1;
/** How long frames must keep slow before a drop is weighed (s). */
const SLOW_FOR = 0.6;
/** How long frames are timed before a drop, and after it (s). */
const BEFORE = 1;
const AFTER = 1.5;
/** The longest a frame counts as (ms): one stall alone never makes frames slow, or a drop look as if it helped. */
const STALL_MS = 100;
/** A drop must make frames at least this much quicker to stay. */
const HELPS = 0.85;
/** After a drop that didn't help, how much slower than then frames must get to try again. */
const RETRY = 1.5;
/** The least time (s) at a step before a climb, timed and untimed (with no cost to predict it by, a climb that fails stutters). */
const HOLD_S = 20;
const UNTIMED_HOLD_S = 60;
/** The longest wait (s) before a climb, after climbs that failed. */
const BACKOFF_MAX_S = 900;
/** Timed: a step predicted under this many budgets may still be tried, after PROBE_S, doubled for each that fails, up to PROBE_MAX_S. */
const PROBE_UNDER = 3;
const PROBE_S = 300;
const PROBE_MAX_S = 4 * 3600;
/** A climb that holds this long (s) has worked: the wait goes back to its least. A drop before then means it failed. */
const STUCK_S = 600;
/** How long (s) a saved level is good for, and how near the screen's size must be (a share of its pixels) for it to be used. */
const SAVED_FOR_S = 30 * 24 * 3600;
const SAME_SCREEN = 0.15;
/** How often (ms) a climb is weighed. */
const EVERY_MS = 250;

/** What's kept between visits (see saved()). */
export type Saved = {
  /** When (ms since 1970). */
  at: number;
  /** The level, on a screen how big (the backdrop's pixels at its best). */
  level: number;
  px: number;
  /** The waits (s) before a climb, and before a level predicted too dear is tried. */
  backoff: number;
  probe?: number;
  /** The paces (steps of PACES_MS) while effects play and while none do. */
  pace?: [number, number];
};

/** The device pixels `layer` draws at `level` (0 where it isn't drawn). */
export type Pixels = (level: number, layer: Layer) => number;

type Phase = { kind: 'before' | 'after'; time: number; sum: number; frames: number; before: number; from: number };
type Climb = 'climb' | 'probe';
/** One timed draw: its cost (ms per million pixels), and when it came in (ms). */
type Draw = { cost: number; at: number };

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const step = (x: unknown, bottom: number): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= bottom;

function percentile(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

/** What a ladder (the level, or a pace) is told by the budget it's part of. */
type Rungs = {
  /** The lowest step. */
  bottom: number;
  /** How much a step draws, less at each step down (pixels, or a share of frames); two steps may draw as much. */
  work(at: number): number;
  /** A frame's GPU time (ms) at a step, by the layers' costs on `need` seconds of draws; null where none is known. */
  predict(at: number, need: number): number | null;
  /** The most predict() may come to. */
  budget(): number;
  /** The frame (ms) aimed at. */
  frameMs(): number;
  /** Frames slower than this (ms, on average) count as slow, where the layers' timings don't already say. */
  slowMs(): number;
  /** Whether the layers drawn at a step have `need` seconds of draws: any of them, or `all`. */
  seen(at: number, need: number, all: boolean): boolean;
  /** Whether any draw has been timed: then what the layers cost weighs in too. */
  timed(): boolean;
  /** Before anything is measured: the step to start at. */
  first(): number;
  /** Whether a drop that made frames `before` ms on average `after` stays, though not HELPS quicker. */
  keeps(before: number, after: number): boolean;
};

/**
 * Steps from the best (0) down to `bottom`, judged on the frames it's given:
 * dropped from when they're slow, climbed back up when they're easy (see the
 * top of this file).
 */
class Ladder {
  /** The step drawn at now (see applied()), and the one wanted. */
  at: number;
  want: number;
  /** The best step allowed. */
  readonly top: number;
  /** Whether a step has been moved to, or frames have begun to tell: until then a saved one may set it. */
  started = false;
  /** The waits (s) before a climb, and before a step predicted too dear is tried. */
  backoff = HOLD_S;
  probe = PROBE_S;
  private r: Rungs;
  private changedAt = 0;
  /** A climb wanted (see next()), and the last made while it hasn't yet held for STUCK_S. */
  private climbing: Climb | null = null;
  private climbed: { at: number; kind: Climb } | null = null;
  private weighedAt = -Infinity;
  private frameAvg = FRAME_MS;
  private slowFor = 0;
  private phase: Phase | null = null;
  /** By step: how slow frames were (ms) when a drop from it was tried and didn't help. */
  private failed = new Map<number, number>();

  constructor(r: Rungs, top: number) {
    this.r = r;
    this.top = top;
    this.at = top;
    this.want = top;
  }

  /** Nothing being timed, nothing to move to. */
  settled() {
    return !this.phase && this.want === this.at;
  }

  /** Whether it's coming down, or would if let (frames slow, and the layers to blame): what's below waits for it. */
  acting() {
    return !!this.phase || (this.slow() && this.toBlame(this.at));
  }

  /** Whether frames `before` ms on average would bring it down, and frames `after` wouldn't. */
  spared(before: number, after: number) {
    const slow = this.slowMs();
    return before > slow && after <= slow && this.toBlame(this.at);
  }

  /** Whether the layers' own work is what makes frames slow at `at`: where timed, predicted over budget; untimed, as far as can be told. */
  private toBlame(at: number) {
    if (!this.r.timed()) return true;
    const p = this.r.predict(at, FRESH_DROP_S);
    return p !== null && p > this.r.budget() && this.r.seen(at, FRESH_DROP_S, false);
  }

  /** How long frames take (ms, on average) to count as slow: past slowMs, or where the layers are timed over budget, LATE. */
  private slowMs() {
    return this.r.timed() && this.toBlame(this.at) ? Math.min(this.r.slowMs(), this.r.frameMs() * LATE) : this.r.slowMs();
  }

  /** Frames slow here, with a step to drop to that hasn't already failed to help. */
  private slow() {
    const failedAt = this.failed.get(this.at);
    return this.frameAvg > this.slowMs() && (failedAt === undefined || this.frameAvg > failedAt * RETRY) && this.dropTo(this.at) !== null;
  }

  /** The step to drop to from `at`, or null: where timed, the first predicted to fit with room to spare; else the next that draws less. */
  private dropTo(at: number): number | null {
    const r = this.r;
    let to: number | null = null;
    for (let s = at + 1; s <= r.bottom; s++) {
      if (r.work(s) >= r.work(to ?? at)) continue;
      to = s;
      if (!r.timed()) break;
      const p = r.predict(s, FRESH_DROP_S);
      if (p !== null && p <= DROP_TO * r.budget()) break;
    }
    return to;
  }

  /**
   * The step to climb to from `at`, or null. A step that draws no more is
   * taken free. Where timed, the best predicted within `limit` (ms; one step
   * only for a `probe`); else the next that draws more.
   */
  private climbTo(at: number, limit: number, probe = false): number | null {
    const r = this.r;
    let to: number | null = null;
    for (let s = at - 1; s >= this.top; s--) {
      const here = r.work(to ?? at);
      if (r.work(s) <= here) {
        if (r.work(s) === here) to = s;
        continue;
      }
      if (r.timed()) {
        const p = r.predict(s, FRESH_CLIMB_S);
        if (p === null || p > limit) break;
      }
      to = s;
      if (!r.timed() || probe) break;
    }
    return to;
  }

  /**
   * One frame that counts, `m` ms long (stalls cut to STALL_MS), `dt` s. A
   * drop may begin only if `mayDrop`; one begun goes on. The step wanted
   * comes of it (want).
   */
  frame(m: number, dt: number, mayDrop: boolean) {
    if (this.want !== this.at) return;
    this.started = true;
    this.frameAvg += (m - this.frameAvg) * 0.12;
    const p = this.phase;
    if (p) {
      p.time += dt;
      p.sum += m;
      p.frames++;
      if (p.time < (p.kind === 'before' ? BEFORE : AFTER)) return;
      const avg = p.sum / p.frames;
      this.phase = null;
      this.slowFor = 0;
      this.frameAvg = avg;
      if (p.kind === 'before') {
        const to = this.dropTo(this.at);
        if (avg <= this.slowMs() || to === null || !this.toBlame(this.at)) return;
        this.phase = { kind: 'after', time: 0, sum: 0, frames: 0, before: avg, from: this.at };
        this.want = to;
        return;
      }
      if (avg <= p.before * HELPS || this.r.keeps(p.before, avg)) return;
      this.failed.set(p.from, p.before);
      this.want = p.from;
      return;
    }
    // (Frames slow while it may not drop still add up: once it may, it's weighed at once.)
    if (this.slow()) {
      this.slowFor += dt;
      if (mayDrop && this.slowFor > SLOW_FOR && this.toBlame(this.at)) this.phase = { kind: 'before', time: 0, sum: 0, frames: 0, before: 0, from: this.at };
    } else this.slowFor = Math.max(0, this.slowFor - dt * 0.5);
  }

  /**
   * The step to draw at (`nowMs`: the same clock as frame()'s), climbing only
   * if `mayClimb`. It's moved to with applied().
   */
  next(nowMs: number, mayClimb: boolean): number {
    if (this.want !== this.at || nowMs - this.weighedAt < EVERY_MS) return this.want;
    this.weighedAt = nowMs;
    const c = this.climbed;
    if (c && nowMs - c.at > STUCK_S * 1000) {
      if (c.kind === 'probe') this.probe = PROBE_S;
      else this.backoff = HOLD_S;
      this.climbed = null;
    }
    if (!this.started) return (this.want = Math.max(this.top, this.r.first()));
    // A climb: frames easy, the hold over, and where timed the step above
    // predicted to fit, on each layer's draws at this level alone.
    const since = (nowMs - this.changedAt) / 1000;
    if (!mayClimb || this.at === this.top || this.phase || this.slowFor > 0 || this.frameAvg >= this.r.frameMs() * EASY) return this.want;
    let to: number | null = null;
    let kind: Climb = 'climb';
    if (this.r.timed()) {
      if (!this.r.seen(this.at, FRESH_CLIMB_S, true)) return this.want;
      if (since >= this.backoff) to = this.climbTo(this.at, this.r.budget());
      if (to === null && since >= Math.max(this.backoff, this.probe)) {
        to = this.climbTo(this.at, PROBE_UNDER * this.r.budget(), true);
        kind = 'probe';
      }
    } else if (since >= Math.max(UNTIMED_HOLD_S, this.backoff)) to = this.climbTo(this.at, Infinity);
    if (to === null) return this.want;
    for (let s = to; s < this.at; s++) this.failed.delete(s);
    this.climbing = kind;
    return (this.want = to);
  }

  /** It's now drawn at `at` (`nowMs`: the same clock as next()'s). */
  applied(at: number, nowMs: number) {
    const was = this.at;
    if (at === was) return;
    // A drop before the last climb held: it failed, and the next waits twice as long.
    if (at > was && this.climbed) {
      if (this.climbed.kind === 'probe') this.probe = Math.min(PROBE_MAX_S, this.probe * 2);
      else this.backoff = Math.min(BACKOFF_MAX_S, this.backoff * 2);
    }
    if (at > was) this.climbed = null;
    if (this.climbing) this.climbed = { at: nowMs, kind: this.climbing };
    this.climbing = null;
    this.at = at;
    this.want = at;
    this.started = true;
    this.changedAt = nowMs;
    this.weighedAt = -Infinity;
    this.slowFor = 0;
    // (Frames at the new step are timed afresh: a drop's 'after', or a climb's first.)
    if (this.phase?.kind === 'before') this.phase = null;
  }
}

export class GpuBudget {
  /** The best level allowed (touch screens start, and stay, a level down, their slow motion at 30fps). */
  readonly top: number;
  private px: Pixels;
  /** Whether any draw has been timed: then what the layers cost weighs in too. */
  private timed = false;
  /** Whether the GPU can be timed here, once told (timable()). */
  private canTime: boolean | null = null;
  /** Each layer's draws since the level changed (its latest KEPT_S), its PEAK and when it was worked out, and the cost at its busiest before the level changed. */
  private draws: Record<Layer, Draw[]> = { fx: [], backdrop: [] };
  private peaks: Partial<Record<Layer, { at: number; cost: number }>> = {};
  private known: Partial<Record<Layer, number>> = {};
  /** The display's refresh (ms), as the frames show it: the quickest they keep coming at. */
  private refresh = FRAME_MS;
  /** Whether effects were off, as of the last frame. */
  private off = false;
  private kept: Saved | null = null;
  private levels: Ladder;
  private paces: Record<Mode, Ladder>;

  constructor(px: Pixels, top = 0, saved: Saved | null = null, nowMs = Date.now()) {
    this.px = px;
    this.top = top;
    const s = saved;
    if (
      s &&
      [s.at, s.level, s.px, s.backoff].every(finite) &&
      step(s.level, MAX_LEVEL) &&
      s.at <= nowMs &&
      nowMs - s.at < SAVED_FOR_S * 1000
    ) {
      // (Paces that aren't steps are let go; the rest is kept.)
      if (s.pace !== undefined && !(Array.isArray(s.pace) && s.pace.length === 2 && s.pace.every((p) => step(p, SLOWEST)))) {
        const { pace: _, ...rest } = s;
        this.kept = rest;
      } else this.kept = s;
    }
    this.levels = new Ladder(
      {
        bottom: MAX_LEVEL,
        work: (l) => this.pixels(l),
        predict: (l, need) => this.predict(l, need),
        budget: () => BUDGET_MS,
        frameMs: () => Math.max(FRAME_MS, this.refresh),
        slowMs: () => SLOW_MS,
        seen: (l, need, all) => this.seen(LAYERS, l, need, all),
        timed: () => this.timed,
        first: () => this.firstLevel(),
        keeps: () => false,
      },
      top,
    );
    const k = this.kept;
    if (k) {
      this.levels.backoff = Math.min(BACKOFF_MAX_S, Math.max(HOLD_S, k.backoff));
      if (finite(k.probe)) this.levels.probe = Math.min(PROBE_MAX_S, Math.max(PROBE_S, k.probe));
    }
    const pace = (mode: Mode) =>
      new Ladder(
        {
          bottom: SLOWEST,
          work: (p) => 1 / this.every(p),
          predict: (p, need) => this.predictPace(mode, p, need),
          budget: () => SHARE * this.refresh,
          frameMs: () => this.refresh,
          slowMs: () => this.refresh * (SLOW_MS / FRAME_MS),
          seen: (p, need, all) => this.seen(mode === 'busy' ? LAYERS : ['backdrop'], this.level, need, all),
          timed: () => this.timed,
          first: () => this.firstPace(mode),
          // (A pace that leaves frames no longer slow enough to bring the level down stays: the pixels are spared.)
          keeps: (before, after) => this.weighsLevel(mode) && this.levels.spared(before, after),
        },
        top > 0 ? SLOWEST : 0,
      );
    this.paces = { busy: pace('busy'), idle: pace('idle') };
  }

  /** The level drawn at now (see applied()). */
  get level() {
    return this.levels.at;
  }

  /** The pace slow motion is drawn at while effects play (`busy`) or none do: the least time (ms) between its draws (PACES_MS). */
  pace(busy: boolean) {
    return PACES_MS[this.paces[busy ? 'busy' : 'idle'].at];
  }

  /**
   * How long (ms) since slow motion was last drawn before it's drawn again,
   * while effects play (`busy`) or none do: as the pace has it, or at the
   * `slowest` (a touch screen's). Half a frame short, so a frame that comes a
   * little early isn't skipped too; at its best, every frame.
   */
  gap(busy: boolean, slowest = false) {
    return PACES_MS[slowest ? SLOWEST : this.paces[busy ? 'busy' : 'idle'].at] - this.refresh / 2;
  }

  /** Whether the GPU can be timed here (core.ts says, as the backdrop starts). */
  timable(can: boolean) {
    this.canTime = can;
  }

  /** How many frames slow motion is drawn once in, at pace `p` (see gap()). */
  private every(p: number) {
    return Math.max(1, Math.ceil((PACES_MS[p] - this.refresh / 2) / this.refresh - 1e-9));
  }

  /** Whether `d` holds `need` seconds of draws. */
  private enough(d: Draw[], need: number) {
    return d.length >= need * FRESH_RATE && d[d.length - 1].at - d[0].at >= need * 1000 * SPAN;
  }

  /**
   * A layer's cost at its busiest (ms per million pixels), if known: on
   * `need` seconds of draws at this level, else from before, else on what
   * draws there are (a layer drawn is never left out of a prediction).
   */
  private cost(l: Layer, need: number): number | undefined {
    const d = this.draws[l];
    if (!this.enough(d, need) && (this.known[l] !== undefined || !d.length)) return this.known[l];
    const latest = d[d.length - 1].at;
    const p = this.peaks[l];
    if (p && latest - p.at < RESAMPLE_MS) return p.cost;
    const cost = percentile(
      d.map((x) => x.cost),
      PEAK,
    );
    this.peaks[l] = { at: latest, cost };
    return cost;
  }

  /** What one draw of `l` takes (ms) at its busiest at `level`, if known and drawn there. */
  private layerMs(l: Layer, level: number, need: number): number | undefined {
    const px = this.px(level, l);
    const c = this.cost(l, need);
    return px && c !== undefined ? (c * px) / 1e6 : undefined;
  }

  /** The GPU time (ms) of the busiest frames at `level`, by the layers' costs; null where neither is known. */
  predict(level: number, need = FRESH_DROP_S): number | null {
    let ms = 0;
    let any = false;
    for (const l of LAYERS) {
      const t = this.layerMs(l, level, need);
      if (t === undefined) continue;
      ms += t;
      any = true;
    }
    return any ? ms : null;
  }

  /** A frame's GPU time (ms) on average at pace `p`, at this level: the effects every frame while they play, the backdrop in one frame of every(p). */
  private predictPace(mode: Mode, p: number, need: number): number | null {
    const fx = mode === 'busy' ? this.layerMs('fx', this.level, need) : undefined;
    const backdrop = this.layerMs('backdrop', this.level, need);
    if (fx === undefined && backdrop === undefined) return null;
    return (fx ?? 0) + (backdrop ?? 0) / this.every(p);
  }

  /** Whether `layers` drawn at `level` have `need` seconds of draws: any of them, or `all` (and some are drawn). */
  private seen(layers: Layer[], level: number, need: number, all: boolean) {
    const drawn = layers.filter((l) => this.px(level, l) > 0);
    const ok = (l: Layer) => this.enough(this.draws[l], need);
    return all ? drawn.length > 0 && drawn.every(ok) : drawn.some(ok);
  }

  /** One timed draw of `layer`: `ms` of GPU time over `px` device pixels, come in at `nowMs`. */
  gpu(layer: Layer, ms: number, px: number, nowMs: number) {
    if (!(px > 0) || !(ms >= 0) || !Number.isFinite(ms)) return;
    this.timed = true;
    const d = this.draws[layer];
    d.push({ cost: (ms * 1e6) / px, at: nowMs });
    // (Let go of those past KEPT_S once a second's worth more have aged out, not at every draw.)
    const from = nowMs - KEPT_S * 1000;
    if (d[0].at < from - 1000) d.splice(0, d.findIndex((x) => x.at >= from));
  }

  /** How big the screen is, as the backdrop draws it at its best: what a saved level is kept for. */
  private screen() {
    return this.px(this.top, 'backdrop');
  }

  private pixels(level: number) {
    return this.px(level, 'fx') + this.px(level, 'backdrop');
  }

  /** What a past visit kept, if on a screen about as big. */
  private sameScreen(): Saved | null {
    const s = this.kept;
    const screen = this.screen();
    return s && screen > 0 && Math.abs(s.px - screen) <= SAME_SCREEN * screen ? s : null;
  }

  /**
   * Before anything is measured: the level a past visit held, on a screen
   * about as big; else, where the GPU can't be timed, a big screen at 1
   * (where that draws fewer pixels than 0: the cap it always had before).
   */
  private firstLevel(): number {
    const s = this.sameScreen();
    if (s) return s.level;
    return this.canTime === false && this.top === 0 && this.pixels(1) < this.pixels(0) ? 1 : this.levels.at;
  }

  /** Before anything is measured: the pace a past visit held, on a screen about as big. */
  private firstPace(mode: Mode): number {
    return this.sameScreen()?.pace?.[MODES.indexOf(mode)] ?? this.paces[mode].at;
  }

  /** Whether the level is weighed on the frames of `mode`'s pace (see frame()). */
  private weighsLevel(mode: Mode) {
    return mode === 'busy' || (this.off && this.timed);
  }

  /** A pace moves at once (nothing is made anew for it). */
  private settle(l: Ladder, nowMs: number) {
    if (l.want !== l.at) l.applied(l.want, nowMs);
  }

  /**
   * One frame, `ms` since the one before (`nowMs`: a clock in ms), drawn
   * while effects play (`busy`) or not, with effects switched `off` or not.
   * Each tells the pace of its kind. For the level, those that count are
   * weighed: while effects play, and while they're off where the GPU is
   * timed (untimed, slow frames with nothing but the page to draw are the
   * page's own). Returns the level wanted, as next() does.
   */
  frame(ms: number, nowMs: number, busy = true, off = false): number {
    // (Down at once to a quicker frame, up only slowly: the frames' quickest, a display's refresh.
    // Up only on frames with no effect playing: the effects' own slow frames
    // would teach it the display was as slow, until they no longer counted as slow.)
    if (ms > 2 && ms < STALL_MS && (ms < this.refresh || !busy)) this.refresh += (ms - this.refresh) * (ms < this.refresh ? 0.3 : 0.002);
    const m = Math.min(ms, STALL_MS);
    const dt = ms / 1000;
    const mode: Mode = busy ? 'busy' : 'idle';
    this.off = off;
    const pace = this.paces[mode];
    pace.frame(m, dt, this.levels.settled());
    this.settle(pace, nowMs);
    // (The level waits for the pace to come down first, and to be timed after.)
    if (this.weighsLevel(mode)) this.levels.frame(m, dt, pace.settled() && !pace.acting());
    return this.levels.want;
  }

  /**
   * The level to draw at (`nowMs`: the same clock as frame()'s). It's moved
   * to with applied() once the layers can be resized. (The paces move here
   * too, at once.)
   */
  next(nowMs: number): number {
    for (const mode of MODES) {
      const p = this.paces[mode];
      p.next(nowMs, this.levels.settled());
      this.settle(p, nowMs);
    }
    return this.levels.next(nowMs, this.paces.busy.settled() && this.paces.idle.settled());
  }

  /** The layers are now drawn at `level` (`nowMs`: the same clock as next()'s). */
  applied(level: number, nowMs: number) {
    if (level === this.levels.at) return;
    // Each layer's cost at its busiest is carried over: per pixel, it holds at any level.
    for (const l of LAYERS) {
      const c = this.cost(l, FRESH_DROP_S);
      if (c !== undefined) this.known[l] = c;
      this.draws[l] = [];
    }
    this.peaks = {};
    this.levels.applied(level, nowMs);
  }

  /**
   * What to keep for the next visit: the level and the paces now, on this
   * screen, and the level's waits. (Until anything is measured, or while
   * there's no backdrop to say how big the screen is, what was kept, if
   * anything.)
   */
  saved(nowMs = Date.now()): Saved | null {
    if (!this.levels.started || !this.screen()) return this.kept;
    return {
      at: nowMs,
      level: this.level,
      px: this.screen(),
      backoff: this.levels.backoff,
      probe: this.levels.probe,
      pace: [this.paces.busy.at, this.paces.idle.at],
    };
  }
}
