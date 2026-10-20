// Before and after: where two shots of the same view differ, the code from
// before this change against the code now. A pixel counts as changed once a
// channel is off by more than a shade (antialiasing and dithering aside);
// changed pixels gather into cells, and cells near each other into areas,
// each a box. Areas that also differ between two shots of the code now (a
// clock, a glint the shot caught at another moment) move on their own: they
// aren't the change's, and are left out and counted apart.
// Plain data in and out, so the tests can check it without a browser.

/** A picture's pixels, as a canvas gives them (RGBA, row by row). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** An area that differs, in the shot's pixels. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Its pixels that differ. */
  px: number;
}

export interface Difference {
  /** The areas that differ, largest first. */
  areas: Area[];
  /** How much of the picture differs (0 to 1), the areas' pixels over all. */
  share: number;
  /** Areas that differ from one shot of the code now to another: left out of `areas`. */
  restless: number;
  /** Each pixel: 1 where it differs (and isn't restless), 0 elsewhere. */
  mask: Uint8Array;
}

/** How far off a channel may be and still count as the same (of 255). */
const SHADE = 16;
/** The cells pixels gather in (px a side), and how many must differ for a cell to. */
const CELL = 8;
const ENOUGH = 3;
/** Cells this many apart still make one area. */
const REACH = 2;

function changed(a: Pixels, b: Pixels): Uint8Array {
  const out = new Uint8Array(a.width * a.height);
  const d1 = a.data;
  const d2 = b.data;
  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    if (Math.abs(d1[i] - d2[i]) > SHADE || Math.abs(d1[i + 1] - d2[i + 1]) > SHADE || Math.abs(d1[i + 2] - d2[i + 2]) > SHADE) out[p] = 1;
  }
  return out;
}

/** Each cell's count of set pixels. */
function cells(mask: Uint8Array, w: number, h: number) {
  const cw = Math.ceil(w / CELL);
  const ch = Math.ceil(h / CELL);
  const n = new Uint32Array(cw * ch);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const crow = ((y / CELL) | 0) * cw;
    for (let x = 0; x < w; x++) if (mask[row + x]) n[crow + ((x / CELL) | 0)]++;
  }
  return { n, cw, ch };
}

/** The cells' groups, each a list of cell indexes: cells within REACH of each other go together. */
function groups(on: Uint8Array, cw: number, ch: number): number[][] {
  const seen = new Uint8Array(on.length);
  const out: number[][] = [];
  for (let start = 0; start < on.length; start++) {
    if (!on[start] || seen[start]) continue;
    const group: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      group.push(c);
      const cx = c % cw;
      const cy = (c / cw) | 0;
      for (let dy = -REACH; dy <= REACH; dy++)
        for (let dx = -REACH; dx <= REACH; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
          const k = y * cw + x;
          if (on[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
    }
    out.push(group);
  }
  return out;
}

/**
 * Where `now` differs from `before`, leaving out what differs between `now`
 * and `again` (another shot of the code now). Pictures of other sizes differ
 * all over: one area, the whole of the larger.
 */
export function compare(before: Pixels, now: Pixels, again?: Pixels): Difference {
  const w = now.width;
  const h = now.height;
  if (before.width !== w || before.height !== h) {
    const mask = new Uint8Array(w * h).fill(1);
    return { areas: [{ x: 0, y: 0, w: Math.max(w, before.width), h: Math.max(h, before.height), px: w * h }], share: 1, restless: 0, mask };
  }
  const mask = changed(before, now);
  // What moves on its own: the cells where two shots of the code now differ, and those round them.
  let restless = 0;
  if (again && again.width === w && again.height === h) {
    const noise = changed(now, again);
    const { n, cw, ch } = cells(noise, w, h);
    const on = new Uint8Array(n.length);
    for (let i = 0; i < n.length; i++) if (n[i]) on[i] = 1;
    const moving = groups(on, cw, ch);
    restless = moving.length;
    for (const g of moving)
      for (const c of g) {
        const x0 = (c % cw) * CELL - CELL;
        const y0 = ((c / cw) | 0) * CELL - CELL;
        for (let y = Math.max(0, y0); y < Math.min(h, y0 + 3 * CELL); y++) mask.fill(0, y * w + Math.max(0, x0), y * w + Math.min(w, x0 + 3 * CELL));
      }
  }
  const { n, cw, ch } = cells(mask, w, h);
  const on = new Uint8Array(n.length);
  for (let i = 0; i < n.length; i++) if (n[i] >= ENOUGH) on[i] = 1;
  const areas: Area[] = groups(on, cw, ch).map((g) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let px = 0;
    for (const c of g) {
      const cx = c % cw;
      const cy = (c / cw) | 0;
      x0 = Math.min(x0, cx);
      y0 = Math.min(y0, cy);
      x1 = Math.max(x1, cx);
      y1 = Math.max(y1, cy);
      px += n[c];
    }
    const x = x0 * CELL;
    const y = y0 * CELL;
    return { x, y, w: Math.min(w, (x1 + 1) * CELL) - x, h: Math.min(h, (y1 + 1) * CELL) - y, px };
  });
  areas.sort((a, b) => b.w * b.h - a.w * a.h);
  const px = areas.reduce((s, a) => s + a.px, 0);
  return { areas, share: px / (w * h), restless, mask };
}
