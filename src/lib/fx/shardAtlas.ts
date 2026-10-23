// The effects' shards (renderer.ts, Shape.Shard), worked out once: SHARD_KINDS
// slivers, each with five corners jittered its own way and cut in three
// faces by ridges that meet off its middle, baked into a texture rather than
// worked out for every pixel a shard covers (which made the particles'
// shader twice as slow to compile): a layer each, so however small a shard
// is drawn (a small mip), it never takes in another's. Each texel holds how much of it each
// face covers (red, green, blue: their sum the sliver's own cover), and in
// alpha the light it gives whichever way it's turned (SHARD_GLOW: a little
// over all of it, more on its rim and along the ridges where its faces
// meet), smooth between texels. How each face is tilted, and where
// its middle is (for a glint), go to the shader as uniforms (shardFaces):
// the light each face catches is worked out once a shard, not once a pixel.

export const SHARD_KINDS = 16;
/** A layer's side, in texels. */
export const SHARD_CELL = 32;
/** How far a layer reaches from its middle in the sliver's own units (its corners within 1), so a margin is left empty. */
export const SHARD_REACH = 1.15;

/** Samples a texel takes across (and down). */
const SAMPLES = 3;
/** How far in from the edge the rim reaches. */
const RIM = 0.25;
/** The light a sliver gives whichever way it's turned: over all of it, on its rim, along its ridges. */
const SHARD_GLOW = { body: 0.16, rim: 0.3, ridge: 0.5 };

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Kind = {
  /** Its edges, each as a normal pointing out and how far along it the edge is. */
  edges: [number, number, number][];
  /** Its faces: their middles, and how each is tilted (its normal's x and y; z is 0.6). */
  faces: [number, number, number, number][];
};

function kind(k: number): Kind {
  const corners: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i + 0.7 * (hash(k, i) - 0.5)) * ((2 * Math.PI) / 5);
    const r = 0.62 + 0.38 * hash(k + 101, i);
    corners.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const edges = corners.map(([x0, y0], i): [number, number, number] => {
    const [x1, y1] = corners[(i + 1) % 5];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = (y1 - y0) / len;
    const ny = -(x1 - x0) / len;
    return [nx, ny, nx * x0 + ny * y0];
  });
  const turn = hash(k + 211, 7) * 2 * Math.PI;
  const faces = [0, 1, 2].map((j): [number, number, number, number] => {
    const b = turn + j * ((2 * Math.PI) / 3) + 1.2 * (hash(k + 307, j) - 0.5);
    const tilt = b + 0.9 * (hash(k + 401, j) - 0.5);
    return [Math.cos(b) * 0.42, Math.sin(b) * 0.42, Math.cos(tilt) * 0.8, Math.sin(tilt) * 0.8];
  });
  return { edges, faces };
}

let kinds: Kind[] | null = null;
const allKinds = () => (kinds ??= Array.from({ length: SHARD_KINDS }, (_, k) => kind(k)));

/** Each kind's three faces in turn, as (middle x, middle y, tilt x, tilt y): the shader's uShardFaces. */
export function shardFaces(): Float32Array {
  return new Float32Array(allKinds().flatMap((k) => k.faces.flat()));
}

let atlas: Uint8Array | null = null;

/** The atlas, layer by layer and row by row, four bytes a texel (see the top of the file). Made once. */
export function shardAtlas(): Uint8Array {
  if (atlas) return atlas;
  const out = (atlas = new Uint8Array(SHARD_KINDS * SHARD_CELL * SHARD_CELL * 4));
  const n = SAMPLES * SAMPLES;
  /** A sample's place in its layer, in the sliver's units, by its column (or row) of samples across it (the middle one a texel's middle). */
  const at = new Float64Array(SHARD_CELL * SAMPLES);
  for (let i = 0; i < at.length; i++) at[i] = (((i + 0.5) / (SHARD_CELL * SAMPLES)) * 2 - 1) * SHARD_REACH;
  /** Half a texel's diagonal, in the sliver's units: nothing in a texel is further than that from its middle. */
  const half = (SHARD_REACH / SHARD_CELL) * Math.SQRT2;
  const e = new Float64Array(15);
  const f = new Float64Array(6);
  /** How far outside the sliver (q x, q y) is (less than 0 inside). */
  const outside = (qx: number, qy: number) => {
    let d = -Infinity;
    for (let i = 0; i < 15; i += 3) d = Math.max(d, e[i] * qx + e[i + 1] * qy - e[i + 2]);
    return d;
  };
  const dist = (qx: number, qy: number, j: number) => Math.sqrt((qx - f[j * 2]) ** 2 + (qy - f[j * 2 + 1]) ** 2);
  const rimAt = (d: number) => {
    const t = Math.max(0, Math.min(1, (d + RIM) / RIM));
    return t * t * (3 - 2 * t);
  };
  const cover = [0, 0, 0];
  allKinds().forEach(({ edges, faces }, k) => {
    for (let i = 0; i < 5; i++) e.set(edges[i], i * 3);
    for (let j = 0; j < 3; j++) f.set(faces[j].slice(0, 2), j * 2);
    for (let ty = 0; ty < SHARD_CELL; ty++) {
      for (let tx = 0; tx < SHARD_CELL; tx++) {
        const mx = at[tx * SAMPLES + (SAMPLES >> 1)];
        const my = at[ty * SAMPLES + (SAMPLES >> 1)];
        const d = outside(mx, my);
        // (Wholly outside: left empty.)
        if (d > half) continue;
        cover[0] = cover[1] = cover[2] = 0;
        let rim = 0;
        const r0 = dist(mx, my, 0);
        const r1 = dist(mx, my, 1);
        const r2 = dist(mx, my, 2);
        const near = r0 <= r1 && r0 <= r2 ? 0 : r1 <= r2 ? 1 : 2;
        const gap = near === 0 ? Math.min(r1, r2) - r0 : near === 1 ? Math.min(r0, r2) - r1 : Math.min(r0, r1) - r2;
        if (d < -half && gap > 2 * half) {
          // Wholly inside one face: no need to sample it.
          cover[near] = n;
          rim = rimAt(d) * n;
        } else {
          for (let sy = 0; sy < SAMPLES; sy++) {
            const qy = at[ty * SAMPLES + sy];
            for (let sx = 0; sx < SAMPLES; sx++) {
              const qx = at[tx * SAMPLES + sx];
              const ds = outside(qx, qy);
              if (ds >= 0) continue;
              const s0 = dist(qx, qy, 0);
              const s1 = dist(qx, qy, 1);
              const s2 = dist(qx, qy, 2);
              cover[s0 <= s1 && s0 <= s2 ? 0 : s1 <= s2 ? 1 : 2]++;
              rim += rimAt(ds);
            }
          }
        }
        const o = ((k * SHARD_CELL + ty) * SHARD_CELL + tx) * 4;
        out[o] = Math.round((cover[0] / n) * 255);
        out[o + 1] = Math.round((cover[1] / n) * 255);
        out[o + 2] = Math.round((cover[2] / n) * 255);
        const ridge = cover[0] + cover[1] + cover[2] - Math.max(cover[0], cover[1], cover[2]);
        out[o + 3] = Math.round(((SHARD_GLOW.body * (cover[0] + cover[1] + cover[2]) + SHARD_GLOW.rim * rim + SHARD_GLOW.ridge * ridge) / n) * 255);
      }
    }
  });
  return out;
}
