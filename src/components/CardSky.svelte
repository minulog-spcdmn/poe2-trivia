<script module lang="ts">
  // The night over a category card's emblem: a pointed arch in a square
  // frame, its border cut in blocks like a church window's and the corners
  // above it hatched, standing on a ground marked
  // with the sign of the sun; in its apex Luna, a horned crescent shaded
  // in hatching, among eight-pointed stars. With Sol behind the emblem
  // (CardSun), the card holds the alchemists' sun and moon.
  //
  // The arch is drawn for a card 188 wide and runs on down, so it can stand
  // on the ground however tall the card is; the box clips it there.
  type Pt = [number, number];
  const f = (v: number) => v.toFixed(2);
  const rad = (a: number) => (a * Math.PI) / 180;
  const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;

  const W = 188;
  const MID = W / 2;
  const R = 110;
  const BAND = 3.5;
  /** The two arcs' centres sit this far either side of the middle. */
  const OFF = R - (MID - 6);
  /** Where the arch springs from its sides. */
  const SPRING = 6 + Math.sqrt(R * R - OFF * OFF);
  const LONG = 420;

  /** The arch at radius `r`, in two halves from the apex down either side (so it draws from there). */
  const arch = (r: number) => {
    const apex = `M${f(MID)} ${f(SPRING - Math.sqrt(r * r - OFF * OFF))}`;
    const [l, rt] = [MID + OFF - r, MID - OFF + r];
    return [`${apex}A${r} ${r} 0 0 0 ${f(l)} ${f(SPRING)}V${LONG}`, `${apex}A${r} ${r} 0 0 1 ${f(rt)} ${f(SPRING)}V${LONG}`];
  };
  // The spandrels, the corners above the arch, shaded in diagonal hatching:
  // lines across the box, cut where they enter the arch.
  const SPANDRELS = (() => {
    const r = R + 1.2;
    /** How far the outside of the arch reaches in from either side at height `y`. */
    const edge = (y: number) => (y >= SPRING ? 6 - 1.2 : MID + OFF - Math.sqrt(r * r - (SPRING - y) ** 2));
    let d = '';
    const STEP = 2.6;
    for (let c = -SPRING; c < W; c += STEP)
      for (const side of [-1, 1]) {
        // A line rising to the outside, from (c, SPRING) to (c + SPRING, 0), in each corner.
        let run: Pt | null = null;
        for (let y = SPRING; y >= -0.5; y -= 0.5) {
          const x = c + (SPRING - y);
          const inX = x >= 0 && x <= MID && x < edge(y);
          const p: Pt = [side < 0 ? x : W - x, y];
          if (inX && !run) run = p;
          if ((!inX || y < 0) && run) {
            d += `M${pt(run)}L${pt(p)}`;
            run = null;
          }
        }
      }
    return d;
  })();

  // The inside of the arch, as a mask for what is set within it (the sun),
  // scaled with the card's width just as the drawing is.
  const WITHIN = (() => {
    const r = R - BAND - 0.4;
    const apex = SPRING - Math.sqrt(r * r - OFF * OFF);
    const [l, rt] = [MID + OFF - r, MID - OFF + r];
    const d = `M${f(l)} ${LONG}V${f(SPRING)}A${r} ${r} 0 0 1 ${f(MID)} ${f(apex)}A${r} ${r} 0 0 1 ${f(rt)} ${f(SPRING)}V${LONG}Z`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${LONG}"><path d="${d}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") top / 100% auto no-repeat`;
  })();

  // The blocks: short strokes across the band, round the arcs and down the sides.
  const BLOCKS = (() => {
    let d = '';
    const top = (Math.acos(OFF / (R - BAND)) * 180) / Math.PI;
    for (let a = 4; a < top - 2; a += 6.5)
      for (const side of [-1, 1]) {
        const c: Pt = [MID - side * OFF, SPRING];
        const p = (r: number): Pt => [c[0] + side * r * Math.cos(rad(a)), c[1] - r * Math.sin(rad(a))];
        d += `M${pt(p(R - BAND))}L${pt(p(R))}`;
      }
    for (let y = SPRING + 7; y < LONG; y += 11) d += `M6 ${f(y)}H${6 + BAND}M${W - 6} ${f(y)}H${W - 6 - BAND}`;
    return d;
  })();

  // Luna, horns up: a disc less a disc set higher, hatched across.
  const MOON = { x: MID, y: 30, r: 8.5, cut: 7.2, lift: 3 };
  const LUNA = (() => {
    const { r, cut, lift } = MOON;
    // Where the two circles meet.
    const y = (cut * cut - r * r - lift * lift) / (2 * lift);
    const x = Math.sqrt(r * r - y * y);
    return `M${f(-x)} ${f(y)}A${r} ${r} 0 1 0 ${f(x)} ${f(y)}A${cut} ${cut} 0 0 1 ${f(-x)} ${f(y)}Z`;
  })();
  const LUNA_HATCH = (() => {
    const { r, cut, lift } = MOON;
    let d = '';
    for (let y = -r + 1; y < r; y += 1) {
      // Only the lower half of the crescent is shaded.
      if (y < 0) continue;
      const out = Math.sqrt(r * r - y * y) - 0.6;
      const inner = cut * cut - (y + lift) ** 2;
      if (inner > 0) {
        const i = Math.sqrt(inner) + 0.6;
        if (out - i > 0.3) d += `M${f(-out)} ${y}H${f(-i)}M${f(i)} ${y}H${f(out)}`;
      } else d += `M${f(-out)} ${y}H${f(out)}`;
    }
    return d;
  })();

  /** An eight-pointed star, its points long and short in turn. */
  const star = (R: number) =>
    'M' +
    Array.from({ length: 16 }, (_, k) => {
      const a = (k / 16) * 360;
      const r = k % 4 === 0 ? R : k % 2 === 0 ? R * 0.55 : R * 0.2;
      return pt([r * Math.sin(rad(a)), -r * Math.cos(rad(a))]);
    }).join('L') +
    'Z';
  const STARS = [
    { x: MID - 26, y: 36, r: 6 },
    { x: MID + 26, y: 36, r: 6 },
    { x: MID - 44, y: 62, r: 3.6 },
    { x: MID + 44, y: 62, r: 3.6 },
  ].map((s) => ({ ...s, d: star(s.r) }));
  // And pinpricks of light between.
  const MOTES = [
    [MID - 13, 18],
    [MID + 13, 18],
    [MID - 38, 46],
    [MID + 38, 46],
    [MID - 56, 84],
    [MID + 56, 84],
    [MID - 18, 54],
    [MID + 18, 54],
  ] as Pt[];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * `drawn`: whether it is drawn in as the card turns face up in the deal
   * (the face's, not the back's). `children`: what is set within the arch,
   * cut off at its edge.
   */
  let { drawn = false, children }: { drawn?: boolean; children?: Snippet } = $props();
</script>

<span class="sky" class:drawn aria-hidden="true">
  <span class="within" style:--within={WITHIN}>{@render children?.()}</span>
  <svg viewBox="0 0 {W} {LONG}" preserveAspectRatio="xMidYMin meet">
    {#each [...arch(R), ...arch(R - BAND)] as d, k (k)}
      <path {d} class="arch" class:hair={k > 1} pathLength="100" />
    {/each}
    <path d={BLOCKS} class="blocks" />
    <path d={SPANDRELS} class="spandrels" />
    {#each [0.5, W - 0.5] as x (x)}
      <path d="M{MID} 0.5H{x}V{LONG}" class="arch hair" pathLength="100" />
    {/each}
    <g class="luna" transform="translate({MOON.x} {MOON.y})">
      <path d={LUNA} class="moon" />
      <path d={LUNA_HATCH} class="hatch" />
    </g>
    {#each STARS as s, k (k)}
      <path d={s.d} transform="translate({f(s.x)} {f(s.y)})" class="star" class:small={s.r < 5} style:--k={k} />
    {/each}
    {#each MOTES as [x, y], k (k)}
      <circle cx={f(x)} cy={f(y)} r="0.7" class="mote" />
    {/each}
  </svg>
  <span class="ground"><span class="sol"></span></span>
</span>

<style>
  .sky {
    position: absolute;
    inset: 0;
    overflow: clip;
    pointer-events: none;
  }
  svg {
    position: relative;
    display: block;
    width: 100%;
    height: auto;
  }
  .within {
    position: absolute;
    inset: 0;
    -webkit-mask: var(--within);
    mask: var(--within);
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-linejoin: round;
  }
  .arch {
    stroke-width: 0.8;
  }
  .hair {
    stroke-width: 0.4;
  }
  .blocks {
    stroke-width: 0.45;
  }
  .spandrels {
    stroke-width: 0.3;
    opacity: 0.45;
  }
  .moon {
    stroke-width: 0.6;
    fill: var(--ground, #120d09);
  }
  .hatch {
    stroke-width: 0.35;
    stroke-linecap: round;
  }
  .star {
    stroke-width: 0.5;
    fill: var(--ground, #120d09);
  }
  .star.small {
    fill: currentColor;
    fill-opacity: 0.6;
  }
  .mote {
    fill: currentColor;
    stroke: none;
  }

  /* The ground the arch stands on: a double line, the sun's sign at its middle. */
  .ground {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4.5px;
    border-top: 0.5px solid currentColor;
    border-bottom: 1px solid currentColor;
  }
  .sol {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 11px;
    height: 11px;
    translate: -50% -50%;
    border: 1px solid currentColor;
    border-radius: 50%;
    background: radial-gradient(circle, currentColor 0 1.3px, var(--ground, #120d09) 1.8px);
  }

  /* As the card turns face up, the arch is drawn down from its apex and
     the moon and stars come out after it. */
  :global(.dealt) .drawn .arch {
    stroke-dasharray: 100;
    animation: draw 1s var(--face, 0ms) cubic-bezier(0.55, 0, 0.25, 1) both;
  }
  :global(.dealt) .drawn .blocks,
  :global(.dealt) .drawn .spandrels {
    animation: carve 0.5s calc(var(--face, 0ms) + 500ms) ease-out both;
  }
  :global(.dealt) .drawn .luna {
    animation: carve 0.8s calc(var(--face, 0ms) + 650ms) ease-out both;
  }
  :global(.dealt) .drawn .star,
  :global(.dealt) .drawn .mote {
    animation: carve 0.5s calc(var(--face, 0ms) + 800ms + var(--k, 0) * 80ms) ease-out both;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes carve {
    from {
      opacity: 0;
    }
  }
</style>
