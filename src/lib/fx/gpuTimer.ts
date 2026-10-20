// Times draws on the GPU (EXT_disjoint_timer_query_webgl2, where the browser
// has it: desktop Chrome and Edge do, Firefox and Safari don't), for the
// layers' budget (gpuBudget.ts). Each draw is timed in a query of its own,
// read a few frames on once the GPU is done with it; never waited for.

type Ext = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

/** One timed draw: its GPU time (ms) and the device pixels it drew. */
export type GpuDraw = { ms: number; px: number };

export class GpuTimer {
  private gl: WebGL2RenderingContext;
  private ext: Ext | null;
  private free: WebGLQuery[] = [];
  private pending: { q: WebGLQuery; px: number }[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  /** Whether draws can be timed here. */
  get available() {
    return !!this.ext;
  }

  /** Runs `draw`, which draws `px` device pixels, timed where it can be. */
  time(px: number, draw: () => void) {
    const ext = this.ext;
    // (A few frames' queries waiting at most: if the GPU falls further behind, the frames past them go untimed.)
    const q = ext && this.pending.length < 6 && !this.gl.isContextLost() ? (this.free.pop() ?? this.gl.createQuery()) : null;
    if (q) this.gl.beginQuery(ext!.TIME_ELAPSED_EXT, q);
    try {
      draw();
    } finally {
      if (q) {
        this.gl.endQuery(ext!.TIME_ELAPSED_EXT);
        this.pending.push({ q, px });
      }
    }
  }

  /**
   * The draws whose times have come in since the last call. (Those the
   * GPU's clock was disturbed through, by a power state, say, are left out.)
   */
  read(): GpuDraw[] {
    const gl = this.gl;
    const ext = this.ext;
    if (!ext || gl.isContextLost()) return [];
    // (The GPU's clock disturbed: every query still out may have run through
    // it, so none of them is read. The flag is cleared as it's read.)
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const p of this.pending) gl.deleteQuery(p.q);
      this.pending = [];
      return [];
    }
    const out: GpuDraw[] = [];
    while (this.pending.length && gl.getQueryParameter(this.pending[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const p = this.pending.shift()!;
      out.push({ ms: gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6, px: p.px });
      this.free.push(p.q);
    }
    return out;
  }

  /** Lets go of its queries. */
  dispose() {
    for (const q of [...this.free, ...this.pending.map((p) => p.q)]) this.gl.deleteQuery(q);
    this.free = [];
    this.pending = [];
  }
}
