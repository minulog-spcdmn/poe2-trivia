// Curves the particles' shader looks up rather than works out (renderer.ts):
// on D3D every step of a pixel's code makes the shader slower to compile, and
// a lookup is one step. A texture CURVES texels square, two channels, read
// at its top level only, its edges held:
// - red: a shard's glint, a star with a bright core, by how far the pixel is
//   from it across and down (each 0 to GLINT_REACH widths);
// - green: smoothstep along x (0 to 1 across the texture), the same down it.

export const CURVES = 64;
/** How far the glint's star reaches, in widths; it's gone by then. */
export const GLINT_REACH = 3;
/** The glint at its brightest (its middle), which the shader scales back up by. */
export const GLINT_PEAK = 3.5;

/** The glint's star at (x, y) widths from its middle (each 0 or more). */
export function glintAt(x: number, y: number): number {
  return Math.exp(-y * y * 70 - x * 2.4) + Math.exp(-x * x * 70 - y * 2.4) + 1.5 * Math.exp(-(x * x + y * y) * 8);
}

let made: Float32Array | null = null;

/** The texture, row by row, two floats a texel. Made once. */
export function curves(): Float32Array {
  if (made) return made;
  const out = (made = new Float32Array(CURVES * CURVES * 2));
  for (let j = 0; j < CURVES; j++) {
    for (let i = 0; i < CURVES; i++) {
      const o = (j * CURVES + i) * 2;
      const x = i / (CURVES - 1);
      out[o] = glintAt(x * GLINT_REACH, (j / (CURVES - 1)) * GLINT_REACH) / GLINT_PEAK;
      out[o + 1] = x * x * (3 - 2 * x);
    }
  }
  return out;
}
