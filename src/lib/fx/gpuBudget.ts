// How many pixels the backdrop and the effects overlay draw: as many as the
// screen has, on a GPU that keeps up; fewer, level by level, on one that
// doesn't (core.ts, sizeAt; backdrop.ts, scale). Levels: 0 every pixel (up
// to 1.5 per CSS px for the effects), 1 and 2 fewer (and fewer particles).
// On some screens two levels draw as many pixels (a 1x screen up to 1440p:
// 0 and 1); a drop skips the one that draws no fewer, a climb takes it free.
//
// Two things are watched: frames (frame(): how long since the last, those
// that count being the ones drawn while effects play) and, where the GPU can
// be timed (gpuTimer.ts: desktop Chrome and Edge), what each layer's draws
// cost it, in ms per million pixels (gpu()), from which any level's cost at
// the layers' busiest is predicted: a high percentile (PEAK) of their draws
// since the level changed, against BUDGET_MS. Neither alone is enough. Frames
// can be slow for reasons fewer pixels do nothing for (the page's scripts, a
// slow CPU, a display or power mode capped below 60fps), and dropping then
// only blurs the light. A GPU's timings run long when it's lightly loaded,
// its clocks down, though it would keep up with far more. So:
//
// - A drop: frames slow for a while (an average well past a 60Hz frame,
//   SLOW_MS, for SLOW_FOR; one hitch alone never makes it) and, where the
//   GPU is timed, the layers' work predicted over budget (and then frames
//   count as slow as soon as they miss 60fps, or the display's refresh where
//   that's slower: LATE). They're timed for a second more, then the level
//   drops: where timed, straight to the first level predicted to fit with
//   room to spare (DROP_TO); else one step. Then frames are timed again
//   (frames that count, against frames that count), and a drop that didn't
//   make them clearly quicker is undone, and isn't tried again from that
//   level unless frames get far slower than they were.
// - A climb: frames easy (within EASY of 60fps, or of the display's refresh
//   where that's slower: 50Hz, a 30fps power mode), after a hold (HOLD_S,
//   longer untimed), and, where timed, the level above predicted to fit, on
//   ten seconds' draws of each layer at this level, so the busiest moments
//   have been seen. A lightly loaded GPU's long timings can make a level
//   that would fit look too dear; one predicted within PROBE_UNDER budgets is
//   still tried now and then (PROBE_S, doubled each time it fails, up to
//   PROBE_MAX_S). A climb that a drop undoes before it has held for STUCK_S
//   doubles the wait before the next, up to BACKOFF_MAX_S. So a GPU busy
//   with something else for a while (a game beside the browser) is dropped
//   for, and climbed back from.
// - Where the GPU can't be timed (Safari, Firefox: timable(false)), a big
//   screen starts a level down, as it always did before the GPU was
//   measured, and climbs only by trying, as above.
// - The level, and the waits, are kept for the next visit on a screen about
//   as big (saved()), so a weak GPU never stutters through its first reveal
//   of every visit; it's climbed from, in the same way, if it can be.
//
// Kept apart from core.ts so it can be tested without a GPU.

export type Layer = 'fx' | 'backdrop';
const LAYERS: Layer[] = ['fx', 'backdrop'];

/** The lowest level. */
export const MAX_LEVEL = 2;

/**
 * The GPU time (ms) the two layers may take in their busiest frames: 60fps's
 * 16.7 less the browser's compositing and the page's own painting.
 */
export const BUDGET_MS = 10;
/** A timed drop goes to a level predicted under this share of the budget. */
const DROP_TO = 0.8;
/** The percentile of a layer's draws taken for its cost at its busiest. */
const PEAK = 0.9;
/** It's worked out again after this many more draws. */
const RESAMPLE = 30;
/** Draws (since the level changed) needed to blame a layer, and to climb (a second's, ten seconds'). */
const FRESH_DROP: Record<Layer, number> = { fx: 60, backdrop: 30 };
const FRESH_CLIMB: Record<Layer, number> = { fx: 600, backdrop: 300 };
/** Draws kept of each layer: its latest. */
const KEPT: Record<Layer, number> = { fx: 1200, backdrop: 600 };
/** The frame (ms) of the rate aimed at: 60fps. */
const FRAME_MS = 1000 / 60;
/** Frames slower than this (ms, on average) count as slow: well past a 60Hz refresh. */
const SLOW_MS = 22;
/** Where the layers are timed over budget, frames this much longer than FRAME_MS (or a slower display's refresh) count as slow already. */
const LATE = 1.15;
/** Frames within this much of FRAME_MS (or a slower display's refresh), on average, are easy: a climb may be tried. */
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
/** The least time (s) at a level before a climb, timed and untimed (with no cost to predict it by, a climb that fails stutters). */
const HOLD_S = 20;
const UNTIMED_HOLD_S = 60;
/** The longest wait (s) before a climb, after climbs that failed. */
const BACKOFF_MAX_S = 900;
/** Timed: a level predicted under this many budgets may still be tried, after PROBE_S, doubled for each that fails, up to PROBE_MAX_S. */
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
};

/** The device pixels `layer` draws at `level` (0 where it isn't drawn). */
export type Pixels = (level: number, layer: Layer) => number;

type Phase = { kind: 'before' | 'after'; time: number; sum: number; frames: number; before: number; from: number };
type Climb = 'climb' | 'probe';

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function percentile(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export class GpuBudget {
  /** The level drawn at now (see applied()). */
  level: number;
  /** The best level allowed (touch screens start, and stay, a level down). */
  readonly top: number;
  private px: Pixels;
  /** Whether any draw has been timed: then what the layers cost weighs in too. */
  private timed = false;
  /** Whether the GPU can be timed here, once told (timable()). */
  private canTime: boolean | null = null;
  /** Each layer's costs (ms per million pixels) since the level changed, how many came in all, its PEAK and at how many, and the cost at its busiest before the level changed. */
  private fresh: Record<Layer, number[]> = { fx: [], backdrop: [] };
  private pushed: Record<Layer, number> = { fx: 0, backdrop: 0 };
  private peaks: Partial<Record<Layer, { at: number; cost: number }>> = {};
  private known: Partial<Record<Layer, number>> = {};
  private want: number;
  /** Whether a level has been moved to, or frames have begun to tell: until then a saved level may set it. */
  private started = false;
  private changedAt = 0;
  /** A climb wanted (see next()), and the last made while it hasn't yet held for STUCK_S. */
  private climbing: Climb | null = null;
  private climbed: { at: number; kind: Climb } | null = null;
  private backoff = HOLD_S;
  private probe = PROBE_S;
  private weighedAt = -Infinity;
  private frameAvg = FRAME_MS;
  /** The display's refresh (ms), as the frames show it: the quickest they keep coming at. */
  private refresh = FRAME_MS;
  private slowFor = 0;
  private phase: Phase | null = null;
  /** By level: how slow frames were (ms) when a drop from it was tried and didn't help. */
  private failed = new Map<number, number>();
  private kept: Saved | null = null;

  constructor(px: Pixels, top = 0, saved: Saved | null = null, nowMs = Date.now()) {
    this.px = px;
    this.top = top;
    this.level = top;
    this.want = top;
    const s = saved;
    if (
      s &&
      [s.at, s.level, s.px, s.backoff].every(finite) &&
      Number.isInteger(s.level) &&
      s.level >= 0 &&
      s.level <= MAX_LEVEL &&
      s.at <= nowMs &&
      nowMs - s.at < SAVED_FOR_S * 1000
    ) {
      this.kept = s;
      this.backoff = Math.min(BACKOFF_MAX_S, Math.max(HOLD_S, s.backoff));
      if (finite(s.probe)) this.probe = Math.min(PROBE_MAX_S, Math.max(PROBE_S, s.probe));
    }
  }

  /** Whether the GPU can be timed here (core.ts says, as the backdrop starts). */
  timable(can: boolean) {
    this.canTime = can;
  }

  /**
   * A layer's cost at its busiest (ms per million pixels), if known: on
   * `need` draws at this level, else from before, else on what draws there
   * are (a layer drawn is never left out of a prediction).
   */
  private cost(l: Layer, need: number): number | undefined {
    const f = this.fresh[l];
    if (f.length < need && (this.known[l] !== undefined || !f.length)) return this.known[l];
    const p = this.peaks[l];
    if (p && this.pushed[l] - p.at < RESAMPLE) return p.cost;
    const cost = percentile(f, PEAK);
    this.peaks[l] = { at: this.pushed[l], cost };
    return cost;
  }

  /** The GPU time (ms) of the busiest frames at `level`, by the layers' costs; null where neither is known. */
  predict(level: number, need: Record<Layer, number> = FRESH_DROP): number | null {
    let ms = 0;
    let any = false;
    for (const l of LAYERS) {
      const px = this.px(level, l);
      const c = this.cost(l, need[l]);
      if (!px || c === undefined) continue;
      ms += (c * px) / 1e6;
      any = true;
    }
    return any ? ms : null;
  }

  /** One timed draw of `layer`: `ms` of GPU time over `px` device pixels. */
  gpu(layer: Layer, ms: number, px: number) {
    if (!(px > 0) || !(ms >= 0) || !Number.isFinite(ms)) return;
    this.timed = true;
    const f = this.fresh[layer];
    f.push((ms * 1e6) / px);
    this.pushed[layer]++;
    if (f.length > KEPT[layer]) f.splice(0, f.length - KEPT[layer]);
  }

  /** How big the screen is, as the backdrop draws it at its best: what a saved level is kept for. */
  private screen() {
    return this.px(this.top, 'backdrop');
  }

  private pixels(level: number) {
    return this.px(level, 'fx') + this.px(level, 'backdrop');
  }

  /** The frame (ms) aimed at: 60fps's, or a slower display's refresh. */
  private frameMs() {
    return Math.max(FRAME_MS, this.refresh);
  }

  /** Whether the layers' own work is what makes frames slow at `level`: where timed, predicted over budget; untimed, as far as can be told. */
  private toBlame(level: number) {
    if (!this.timed) return true;
    const p = this.predict(level);
    return p !== null && p > BUDGET_MS && LAYERS.some((l) => this.px(level, l) > 0 && this.fresh[l].length >= FRESH_DROP[l]);
  }

  /** How long frames take (ms, on average) to count as slow: past SLOW_MS, or where the layers are timed over budget, past LATE frames. */
  private slow() {
    return this.timed && this.toBlame(this.level) ? Math.min(SLOW_MS, this.frameMs() * LATE) : SLOW_MS;
  }

  /** The level to drop to from `level`, or null: where timed, the first predicted to fit with room to spare; else the next that draws fewer pixels. */
  private dropTo(level: number): number | null {
    let to: number | null = null;
    for (let l = level + 1; l <= MAX_LEVEL; l++) {
      if (this.pixels(l) >= this.pixels(to ?? level)) continue;
      to = l;
      if (!this.timed) break;
      const p = this.predict(l);
      if (p !== null && p <= DROP_TO * BUDGET_MS) break;
    }
    return to;
  }

  /**
   * The level to climb to from `level`, or null. A level that draws no more
   * pixels is taken free. Where timed, the best predicted within `limit`
   * (ms; one step only for a `probe`); else the next that draws more.
   */
  private climbTo(level: number, limit: number, probe = false): number | null {
    let to: number | null = null;
    for (let l = level - 1; l >= this.top; l--) {
      const here = this.pixels(to ?? level);
      if (this.pixels(l) <= here) {
        if (this.pixels(l) === here) to = l;
        continue;
      }
      if (this.timed) {
        const p = this.predict(l, FRESH_CLIMB);
        if (p === null || p > limit) break;
      }
      to = l;
      if (!this.timed || probe) break;
    }
    return to;
  }

  /**
   * One frame, `ms` since the one before (`nowMs`: a clock in ms), drawn
   * while effects play (`busy`) or not, with effects switched `off` or not.
   * Those that count are weighed: while effects play, and while they're off
   * where the GPU is timed (untimed, slow frames with nothing but the page to
   * draw are the page's own). Returns the level wanted, as next() does.
   */
  frame(ms: number, nowMs: number, busy = true, off = false): number {
    // (Down at once to a quicker frame, up only slowly: the frames' quickest, a display's refresh.
    // Up only on frames with no effect playing: the effects' own slow frames
    // would teach it the display was as slow, until they no longer counted as slow.)
    if (ms > 2 && ms < STALL_MS && (ms < this.refresh || !busy)) this.refresh += (ms - this.refresh) * (ms < this.refresh ? 0.3 : 0.002);
    if (!(busy || (off && this.timed)) || this.want !== this.level) return this.want;
    this.started = true;
    const m = Math.min(ms, STALL_MS);
    this.frameAvg += (m - this.frameAvg) * 0.12;
    const dt = ms / 1000;
    const p = this.phase;
    if (p) {
      p.time += dt;
      p.sum += m;
      p.frames++;
      if (p.time < (p.kind === 'before' ? BEFORE : AFTER)) return this.want;
      const avg = p.sum / p.frames;
      this.phase = null;
      this.slowFor = 0;
      this.frameAvg = avg;
      if (p.kind === 'before') {
        const to = this.dropTo(this.level);
        if (avg <= this.slow() || to === null || !this.toBlame(this.level)) return this.want;
        this.phase = { kind: 'after', time: 0, sum: 0, frames: 0, before: avg, from: this.level };
        return (this.want = to);
      }
      if (avg <= p.before * HELPS) return this.want;
      this.failed.set(p.from, p.before);
      return (this.want = p.from);
    }
    const failedAt = this.failed.get(this.level);
    if (this.frameAvg > this.slow() && (failedAt === undefined || this.frameAvg > failedAt * RETRY) && this.dropTo(this.level) !== null) {
      this.slowFor += dt;
      if (this.slowFor > SLOW_FOR && this.toBlame(this.level)) this.phase = { kind: 'before', time: 0, sum: 0, frames: 0, before: 0, from: this.level };
    } else this.slowFor = Math.max(0, this.slowFor - dt * 0.5);
    return this.want;
  }

  /**
   * The level to draw at (`nowMs`: the same clock as frame()'s). It's moved
   * to with applied() once the layers can be resized.
   */
  next(nowMs: number): number {
    if (this.want !== this.level || nowMs - this.weighedAt < EVERY_MS) return this.want;
    this.weighedAt = nowMs;
    const c = this.climbed;
    if (c && nowMs - c.at > STUCK_S * 1000) {
      if (c.kind === 'probe') this.probe = PROBE_S;
      else this.backoff = HOLD_S;
      this.climbed = null;
    }
    if (!this.started) return (this.want = this.first());
    // A climb: frames easy, the hold over, and where timed the level above
    // predicted to fit, on each layer's draws at this level alone.
    const since = (nowMs - this.changedAt) / 1000;
    if (this.level === this.top || this.phase || this.slowFor > 0 || this.frameAvg >= this.frameMs() * EASY) return this.want;
    let to: number | null = null;
    let kind: Climb = 'climb';
    if (this.timed) {
      const drawn = LAYERS.filter((l) => this.px(this.level, l) > 0);
      if (!drawn.length || drawn.some((l) => this.fresh[l].length < FRESH_CLIMB[l])) return this.want;
      if (since >= this.backoff) to = this.climbTo(this.level, BUDGET_MS);
      if (to === null && since >= Math.max(this.backoff, this.probe)) {
        to = this.climbTo(this.level, PROBE_UNDER * BUDGET_MS, true);
        kind = 'probe';
      }
    } else if (since >= Math.max(UNTIMED_HOLD_S, this.backoff)) to = this.climbTo(this.level, Infinity);
    if (to === null) return this.want;
    for (let l = to; l < this.level; l++) this.failed.delete(l);
    this.climbing = kind;
    return (this.want = to);
  }

  /**
   * Before anything is measured: the level a past visit held, on a screen
   * about as big; else, where the GPU can't be timed, a big screen at 1
   * (where that draws fewer pixels than 0: the cap it always had before).
   */
  private first(): number {
    const s = this.kept;
    const screen = this.screen();
    if (s && s.level >= this.top && screen > 0 && Math.abs(s.px - screen) <= SAME_SCREEN * screen) return s.level;
    return this.canTime === false && this.top === 0 && this.pixels(1) < this.pixels(0) ? 1 : this.level;
  }

  /** The layers are now drawn at `level` (`nowMs`: the same clock as next()'s). */
  applied(level: number, nowMs: number) {
    const was = this.level;
    if (level === was) return;
    // A drop before the last climb held: it failed, and the next waits twice as long.
    if (level > was && this.climbed) {
      if (this.climbed.kind === 'probe') this.probe = Math.min(PROBE_MAX_S, this.probe * 2);
      else this.backoff = Math.min(BACKOFF_MAX_S, this.backoff * 2);
    }
    if (level > was) this.climbed = null;
    if (this.climbing) this.climbed = { at: nowMs, kind: this.climbing };
    this.climbing = null;
    // Each layer's cost at its busiest is carried over: per pixel, it holds at any level.
    for (const l of LAYERS) {
      const c = this.cost(l, FRESH_DROP[l]);
      if (c !== undefined) this.known[l] = c;
      this.fresh[l] = [];
    }
    this.peaks = {};
    this.level = level;
    this.want = level;
    this.started = true;
    this.changedAt = nowMs;
    this.weighedAt = -Infinity;
    this.slowFor = 0;
    // (Frames at the new level are timed afresh: a drop's 'after', or a climb's first.)
    if (this.phase?.kind === 'before') this.phase = null;
  }

  /**
   * What to keep for the next visit: the level now, on this screen, and the
   * waits. (Until anything is measured, or while there's no backdrop to say
   * how big the screen is, what was kept, if anything.)
   */
  saved(nowMs = Date.now()): Saved | null {
    if (!this.started || !this.screen()) return this.kept;
    return { at: nowMs, level: this.level, px: this.screen(), backoff: this.backoff, probe: this.probe };
  }
}
