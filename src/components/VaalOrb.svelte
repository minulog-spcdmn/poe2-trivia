<script lang="ts" module>
  // A Vaal Orb as a small engraving (turns: the orb counts on the scoreboard,
  // the Corrupt pill, a corrupted question's chip), in the craft of
  // docs/arcane-style.md: a gold rim round a crimson orb cut like a gem, a
  // six-sided table in the middle and six facets falling away to the rim,
  // lit from the upper right; the facets away from the light hatched down
  // one side, a pale catch of light inside the rim, and a soft crimson glow
  // under the lines. Every line comes from the geometry below, in units of
  // about a pixel at its usual 12px.
  import { arc, at, lerp, line, pt, ring, type Pt } from '../lib/arcane';

  const O: Pt = [0, 0];
  /** The rim, and the table's corners. */
  const R = 5.4;
  const T = 2.3;
  /** The table's corners, clockwise from the top: flat on top and below, pointed at the sides. */
  const CORNERS = [30, 90, 150, 210, 270, 330];
  const dir = (a: number): Pt => at(O, a, 1);
  const dot = (p: Pt, q: Pt) => p[0] * q[0] + p[1] * q[1];

  type Tone = 'dark' | 'mid' | 'lit';
  /** A facet's tone, by how squarely it faces the light (from the upper right, 45°). */
  const toneAt = (a: number): Tone => {
    const c = Math.cos(((a - 45) * Math.PI) / 180);
    return c > 0.5 ? 'lit' : c > -0.5 ? 'mid' : 'dark';
  };

  /**
   * Hatching across facet `k` (between corners k and k + 1), parallel to its
   * first side and stopping short of every edge, as an engraver would cut it:
   * each line clipped to the facet (inside the rim, outside the table, between
   * its two sides) worked out exactly.
   */
  function facetHatch(k: number, gap: number) {
    const [a0, a1] = [CORNERS[k], CORNERS[(k + 1) % 6] + (k === 5 ? 360 : 0)];
    const mid = (a0 + a1) / 2;
    const u = dir(a0);
    const n = dir(a0 + 90);
    const v0 = at(O, a0, T);
    const clear = 0.3;
    // Half-planes the facet lies in: [a point on the edge, its inward normal].
    const sides: [Pt, Pt][] = [
      [v0, dir(mid)],
      [O, dir(a0 + 90)],
      [O, dir(a1 - 90)],
    ];
    let out = '';
    for (let s = gap * 0.75; s < R; s += gap) {
      const p0: Pt = [n[0] * s, n[1] * s];
      let lo = -Infinity;
      let hi = Infinity;
      for (const [a, nrm] of sides) {
        const c = dot([p0[0] - a[0], p0[1] - a[1]], nrm) - clear;
        const d = dot(u, nrm);
        if (Math.abs(d) < 1e-9) {
          if (c < 0) lo = Infinity;
          continue;
        }
        if (d > 0) lo = Math.max(lo, -c / d);
        else hi = Math.min(hi, -c / d);
      }
      // Inside the rim: |p0 + t u| <= R - clear.
      const b = dot(p0, u);
      const disc = b * b - (dot(p0, p0) - (R - clear) ** 2);
      if (disc <= 0) continue;
      lo = Math.max(lo, -b - Math.sqrt(disc));
      hi = Math.min(hi, -b + Math.sqrt(disc));
      if (hi - lo < 0.3) continue;
      out += line([p0[0] + u[0] * lo, p0[1] + u[1] * lo], [p0[0] + u[0] * hi, p0[1] + u[1] * hi]);
    }
    return out;
  }

  const table = CORNERS.map((a) => at(O, a, T));
  const facets = CORNERS.map((a0, k) => {
    const a1 = CORNERS[(k + 1) % 6];
    const d = `M${pt(table[k])}L${pt(at(O, a0, R))}A${R} ${R} 0 0 1 ${pt(at(O, a1, R))}L${pt(table[(k + 1) % 6])}Z`;
    return { d, tone: toneAt(a0 + 30), k };
  });
  const ORB = {
    facets,
    table: 'M' + table.map(pt).join('L') + 'Z',
    // The table's rim, and the six edges falling from its corners to the orb's.
    edges: 'M' + table.map(pt).join('L') + 'Z' + CORNERS.map((a, k) => line(table[k], at(O, a, R - 0.3))).join(''),
    hatch: facets
      .filter((f) => f.tone === 'dark')
      .map((f) => facetHatch(f.k, 0.85))
      .join(''),
    // Light caught inside the rim on the lit side, and on the table's upper right edge.
    catch: arc(O, R - 0.95, 18, 72) + line(at(lerp(table[0], table[1], 0.2), 60, -0.45), at(lerp(table[0], table[1], 0.8), 60, -0.45)),
    rim: ring(O, R),
  };
</script>

<svg class="vaal-orb" viewBox="-6.4 -6.4 12.8 12.8" aria-hidden="true">
  {#each ORB.facets as f (f.k)}
    <path class="face {f.tone}" d={f.d} />
  {/each}
  <path class="face core" d={ORB.table} />
  <!-- The glow: the lines again, soft and wide, under them. -->
  <path class="glow" d={ORB.edges + ORB.rim} />
  <path class="hatch" d={ORB.hatch} />
  <path class="edges" d={ORB.edges} />
  <path class="catch" d={ORB.catch} />
  <path class="rim" d={ORB.rim} />
</svg>

<style>
  .vaal-orb {
    display: block;
    flex: none;
    width: var(--h, 12px);
    height: var(--h, 12px);
    overflow: visible;
    color: #d9a45a;
  }
  path {
    vector-effect: non-scaling-stroke;
  }
  .face {
    stroke: none;
  }
  .face.dark {
    fill: #2c0604;
  }
  .face.mid {
    fill: #6a120a;
  }
  .face.lit {
    fill: #b42a16;
  }
  .face.core {
    fill: #86190d;
  }
  .glow {
    fill: none;
    stroke: rgba(255, 86, 56, 0.4);
    stroke-width: 1.6px;
    stroke-linejoin: round;
  }
  .hatch {
    fill: none;
    stroke: rgba(8, 0, 0, 0.85);
    stroke-width: 0.4px;
    stroke-linecap: round;
  }
  .edges {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.4px;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
    opacity: 0.85;
  }
  .catch {
    fill: none;
    stroke: #ffd9c8;
    stroke-width: 0.5px;
    stroke-linecap: round;
    opacity: 0.85;
  }
  .rim {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.8px;
  }
</style>
