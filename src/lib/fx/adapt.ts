// When the effects lower their resolution (see core.ts, frame()): only when
// that can make frames quicker. Frames can be slow for reasons a smaller
// target does nothing for: another app holding the GPU (a game in focus
// beside the browser, where every page runs at 40fps, an empty one too),
// the page's own scripts and layout, a slow CPU, a display or power mode
// capped below 60fps. Dropping then only blurs the light. So:
//
// - Where the GPU's time can be read (renderer.gpuTime()), frames that are
//   slow count only while the effects' own GPU work is a good part of them.
//   On a GPU too weak for the effects it's most of each frame; with a game
//   holding the GPU, or the CPU slowed, it was a few percent.
// - Once frames have been slow for a while, they're timed for a second more
//   at the quality now (what made them count as slow was a peak, and any
//   stretch after one looks quicker), then the quality drops and they're
//   timed again. If the drop didn't make them clearly quicker it's undone,
//   and it isn't tried again from that level unless frames get far slower
//   than they were then. (Where the GPU can't be timed, this is all that
//   tells: a try that's wasted is made once from each level.)
//
// Kept apart from core.ts so it can be tested without a GPU.

/** Frames slower than this (ms, on average) count as slow: well past a 60Hz refresh. */
export const SLOW_MS = 22;
/** How long frames must keep slow before a drop is weighed (s). */
const SLOW_FOR = 0.6;
/** Of each frame's time, how much the effects' GPU work must take before a drop can help. */
const GPU_SHARE = 0.25;
/** How long frames are timed before a drop, and after it (s). */
const BEFORE = 1;
const AFTER = 1.5;
/** A drop must make frames at least this much quicker to stay. */
const HELPS = 0.85;
/** After a drop that didn't help: how much slower than then frames must get to try again. */
const RETRY = 1.5;

type Phase = { kind: 'before' | 'after'; time: number; frames: number; before: number; from: number };

export class QualityAdapt {
  quality: number;
  /** The next level down worth trying from `q` (one that draws fewer pixels), or null. */
  private lower: (q: number) => number | null;
  private frameAvg = 16;
  private slowFor = 0;
  /** The effects' GPU work as a share of frame time (null until the GPU has been timed). */
  private share: number | null = null;
  private window = { ms: 0, gpu: 0 };
  private phase: Phase | null = null;
  /** By level: how slow frames were (ms) when a drop from it was tried and didn't help. */
  private failed = new Map<number, number>();

  constructor(quality: number, lower: (q: number) => number | null) {
    this.quality = quality;
    this.lower = lower;
  }

  /** Whether the effects' own work is what makes frames slow, as far as can be told. */
  private toBlame() {
    return this.share === null || this.share > GPU_SHARE;
  }

  /**
   * One frame while effects run: `ms` since the one before, `gpuMs` the GPU
   * time read this frame (of frames a few back: it's read late), or null
   * where the GPU can't be timed. Returns true when the quality changed.
   */
  frame(ms: number, gpuMs: number | null): boolean {
    if (gpuMs !== null) {
      this.window.ms += ms;
      this.window.gpu += gpuMs;
      // (Over half a second: the GPU's times come in a few frames late.)
      if (this.window.ms > 500) {
        const s = this.window.gpu / this.window.ms;
        this.share = this.share === null ? s : this.share + (s - this.share) * 0.5;
        this.window = { ms: 0, gpu: 0 };
      }
    }
    // (A frame of a stall counts as one of 100ms: one hitch alone never makes frames slow.)
    this.frameAvg += (Math.min(ms, 100) - this.frameAvg) * 0.12;
    const dt = ms / 1000;
    const p = this.phase;
    if (p) {
      p.time += dt;
      p.frames++;
      if (p.time < (p.kind === 'before' ? BEFORE : AFTER)) return false;
      const avg = (p.time * 1000) / p.frames;
      this.phase = null;
      this.slowFor = 0;
      this.frameAvg = Math.min(avg, 100);
      if (p.kind === 'before') {
        const to = this.lower(this.quality);
        if (avg <= SLOW_MS || !this.toBlame() || to === null) return false;
        this.phase = { kind: 'after', time: 0, frames: 0, before: avg, from: this.quality };
        this.quality = to;
        return true;
      }
      if (avg <= p.before * HELPS) return false;
      this.failed.set(p.from, p.before);
      this.quality = p.from;
      return true;
    }
    const failedAt = this.failed.get(this.quality);
    const mayTry = this.lower(this.quality) !== null && (failedAt === undefined || this.frameAvg > failedAt * RETRY);
    if (this.frameAvg > SLOW_MS && mayTry && this.toBlame()) {
      this.slowFor += dt;
      if (this.slowFor > SLOW_FOR) this.phase = { kind: 'before', time: 0, frames: 0, before: 0, from: this.quality };
    } else this.slowFor = Math.max(0, this.slowFor - dt * 0.5);
    return false;
  }
}
