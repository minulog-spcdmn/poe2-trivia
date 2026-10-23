// A tile of smooth noise that repeats seamlessly: three octaves of value
// noise summed, NOISE_TILE px square, the coarsest NOISE_CELLS cells across
// and each octave twice as fine. Made once. The effects' smoke reads it as a
// texture (renderer.ts, Shape.Smoke) rather than working the noise out for
// every pixel it covers, and the page's smoke pictures are drawn from it
// (lib/blastSmoke.ts).

export const NOISE_TILE = 128;
export const NOISE_CELLS = 8;
/** The noise's range: stored as 0 to 255 for 0 to this, about 0.44 on average. */
export const NOISE_MAX = 0.875;

let tile: Uint8Array | null = null;

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise repeating every `period` cells, at (x, y) in cells. */
function periodic(x: number, y: number, period: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % period) + period) % period;
  const y0 = ((iy % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, s);
  const b = hash(x1, y0, s);
  const c = hash(x0, y1, s);
  const d = hash(x1, y1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** The tile being made, a few rows a step (noiseTileSteps), and what finishes it. */
let making: Generator<void, Uint8Array> | null = null;

function* makeTile(): Generator<void, Uint8Array> {
  const out = new Uint8Array(NOISE_TILE * NOISE_TILE);
  const k = NOISE_CELLS / NOISE_TILE;
  for (let y = 0; y < NOISE_TILE; y++) {
    for (let x = 0; x < NOISE_TILE; x++) {
      let v = 0;
      let a = 0.5;
      let f = 1;
      for (let o = 0; o < 3; o++) {
        v += a * periodic(x * k * f, y * k * f, NOISE_CELLS * f, 17 + o * 31);
        a *= 0.5;
        f *= 2;
      }
      out[y * NOISE_TILE + x] = Math.round((v / NOISE_MAX) * 255);
    }
    if (y % 16 === 15) yield;
  }
  tile = out;
  return out;
}

/** The tile, row by row, one byte a pixel. */
export function noiseTile(): Uint8Array {
  if (tile) return tile;
  making ??= makeTile();
  for (let r = making.next(); ; r = making.next()) if (r.done) return r.value;
}

/** Makes the tile a few rows a step (a ms or two each), for the page's idle moments (lib/blastSmoke.ts). */
export function* noiseTileSteps(): Generator<void> {
  if (tile) return;
  making ??= makeTile();
  while (!making.next().done) yield;
}

/** Texels across smokeBody (by how far out) and down it (by the noise). */
export const SMOKE_BODY = 64;
/** How far out smokeBody reaches (squared, in widths): a puff is gone by then. */
export const SMOKE_REACH2 = 4;

let body: Float32Array | null = null;

/**
 * A puff of the effects' smoke (renderer.ts) by how far out a pixel is
 * (squared, in widths: 0 to SMOKE_REACH2 across) and the noise there (0 to
 * NOISE_MAX down): billows over a soft round body, torn where they thin out,
 * gone by the quad's edge however strong the noise there. Looked up rather
 * than worked out for every pixel, which made the particles' shader slower
 * to compile. Row by row, a float a texel. Made once.
 */
export function smokeBody(): Float32Array {
  if (body) return body;
  const out = new Float32Array(SMOKE_BODY * SMOKE_BODY);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  for (let j = 0; j < SMOKE_BODY; j++) {
    const n = (j / (SMOKE_BODY - 1)) * NOISE_MAX;
    for (let i = 0; i < SMOKE_BODY; i++) {
      const r2 = (i / (SMOKE_BODY - 1)) * SMOKE_REACH2;
      const e = clamp((Math.exp(-r2 * 0.55) - (0.62 - n) * 1.2) / 0.55);
      out[j * SMOKE_BODY + i] = e * e * (3 - 2 * e) * clamp((3.9 - r2) * 0.53) * (0.4675 + 0.3825 * n);
    }
  }
  body = out;
  return out;
}

/** The noise at (x, y), in cells (it repeats every NOISE_CELLS), smoothly between the tile's pixels: 0 to NOISE_MAX. */
export function noiseAt(x: number, y: number): number {
  const t = noiseTile();
  const px = (x / NOISE_CELLS) * NOISE_TILE - 0.5;
  const py = (y / NOISE_CELLS) * NOISE_TILE - 0.5;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const m = NOISE_TILE - 1;
  const at = (i: number, j: number) => t[(j & m) * NOISE_TILE + (i & m)];
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
  const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
  return ((top + (bottom - top) * fy) / 255) * NOISE_MAX;
}
