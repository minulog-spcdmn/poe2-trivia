<script module lang="ts">
  // The engraved plate of a category card, laid out like an old tarot card
  // and cut in the same hand as the alchemist's circle:
  // • a panel with notched corners, and under it a nameplate of the same
  //   cut, the name centred in it however many lines it takes;
  // • in the panel, a pointed arch with a beaded moulding, a star set on its
  //   apex, and the panel round it hatched;
  // • Sol and Luna in the corners above the arch, the sun a disc ringed in
  //   straight and wavy rays, the moon a crescent turned to it with a star
  //   in its horns;
  // • inside the arch, the emblem's medallion: graduations, a guilloche
  //   braid and a ring of beads, with a glory of rays, straight and wavy,
  //   out to the arch, and a few stars in the sky above.
  // Lines stop short of every sign they meet, as if drawn around it. It's
  // drawn the same for every card, in currentColor, and stands still.
  //
  // The card is 220 by 300; the emblem sits in the medallion at (110, 134).
  // `compact` draws only the medallion and its glory, for the narrow cards
  // laid out in a row.
  import { at, crescent, f, glory, pt, rad, ridges, seg, star, wavy, type Pt } from '../lib/engraving';

  export const W = 220;
  export const H = 300;
  const MID = W / 2;
  /** The emblem's centre. */
  export const C: Pt = [MID, 134];

  /** A rectangle with its corners notched by quarter circles of radius `n` about them, its sides `d` in. */
  const notched = (x0: number, y0: number, x1: number, y1: number, n: number, d = 0) => {
    const s = Math.sqrt(n * n - d * d);
    const a = `A${n} ${n} 0 0 0`;
    return (
      `M${f(x0 + s)} ${f(y0 + d)}H${f(x1 - s)}${a} ${f(x1 - d)} ${f(y0 + s)}V${f(y1 - s)}${a} ${f(x1 - s)} ${f(y1 - d)}` +
      `H${f(x0 + s)}${a} ${f(x0 + d)} ${f(y1 - s)}V${f(y0 + s)}${a} ${f(x0 + s)} ${f(y0 + d)}Z`
    );
  };
  const PANEL = [16, 16, 204, 230] as const;
  const PLATE = [16, 236, 204, 284] as const;
  const FRAMES = [PANEL, PLATE].flatMap(([x0, y0, x1, y1]) => [notched(x0, y0, x1, y1, 5), notched(x0, y0, x1, y1, 7.5, 2.5)]);

  // The pointed arch: two arcs of radius 96 from sides 26 in, springing at
  // 128 and meeting at the apex; the sides run down to the panel's foot.
  const SIDE = 26;
  const SPRING = 128;
  const FOOT = PANEL[3];
  const ARCH_R = 96;
  const OFF = SIDE + ARCH_R - MID;
  const apexOf = (r: number) => SPRING - Math.sqrt(r * r - OFF * OFF);
  const APEX: Pt = [MID, apexOf(ARCH_R)];
  /** The arch `d` in from its outer line, in two halves from the apex down (so beads run alike either side). */
  const archHalves = (d: number) => {
    const r = ARCH_R - d;
    const top = `M${f(MID)} ${f(apexOf(r))}`;
    return [`${top}A${r} ${r} 0 0 0 ${f(SIDE + d)} ${SPRING}V${FOOT}`, `${top}A${r} ${r} 0 0 1 ${f(W - SIDE - d)} ${SPRING}V${FOOT}`];
  };
  /** The arch `d` in, as a closed shape down to `foot`. */
  const archShape = (d: number, foot: number) => {
    const r = ARCH_R - d;
    return `M${f(SIDE + d)} ${foot}V${SPRING}A${r} ${r} 0 0 1 ${f(MID)} ${f(apexOf(r))}A${r} ${r} 0 0 1 ${f(W - SIDE - d)} ${SPRING}V${foot}Z`;
  };
  const ARCH = [...archHalves(0), ...archHalves(3.6)];
  const BEADS = archHalves(1.8);
  /** The panel less the arch: where the hatching goes. */
  const SPANDRELS = notched(...PANEL, 7.5, 2.5) + archShape(0, FOOT + 5);
  /** The arch's inside, down to the panel's inner line: where the glory goes. */
  const INSIDE = archShape(3.6, FOOT - 2.5);

  // The hatching, in lines rising toward the middle, mirrored either side.
  const HATCH = (() => {
    const [x0, y0, , y1] = PANEL;
    let d = '';
    for (let k = x0 + y0; k < MID + y1; k += 2.3) {
      const a: Pt = [Math.max(x0, k - y1), 0];
      a[1] = k - a[0];
      const b: Pt = [Math.min(MID, k - y0), 0];
      b[1] = k - b[0];
      if (b[0] - a[0] > 0.2) d += seg(a, b);
    }
    return d;
  })();

  // Sol, in the left corner above the arch.
  const SOL: Pt = [41, 41];
  const SOL_RAYS = Array.from({ length: 16 }, (_, k) =>
    k % 2 ? wavy(SOL, k * 22.5, 7.6, 12.6, 0.55, 1.7) : seg(at(SOL, k * 22.5, 7.6), at(SOL, k * 22.5, k % 4 ? 12.4 : 14)),
  ).join('');
  // Luna, in the right, her horns to the sun.
  const LUNA: Pt = [W - 41, 41];
  const MOON = crescent(11, 9.4, 4.2);

  // The sky inside the arch, above the medallion.
  const SKY = [
    { c: [72, 66] as Pt, r: 3.6 },
    { c: [W - 72, 66] as Pt, r: 3.6 },
  ];
  const MOTES: Pt[] = [
    [89, 51],
    [W - 89, 51],
    [61, 88],
    [W - 61, 88],
  ];

  // The medallion round the emblem.
  const RING = 64;
  const TICKS = Array.from({ length: 120 }, (_, k) => seg(at(C, k * 3, k % 5 ? 58.7 : 57), at(C, k * 3, 60.9))).join('');
  const BRAID = Array.from({ length: 4 }, (_, j) => {
    const n = 288;
    return (
      'M' +
      Array.from({ length: n }, (_, i) => pt(at(C, (i / n) * 360, 49.4 + 4.4 * Math.sin(12 * rad((i / n) * 360) + (j / 4) * Math.PI)))).join('L') +
      'Z'
    );
  }).join('');
  const LOZENGES = [0, 90, 180, 270].map((a) => {
    const [x, y] = at(C, a, RING - 1.2);
    return { x, y, a };
  });

  // The glory: rays from the medallion out to the arch.
  const GLORY = glory(C, 60, RING + 4, [140, 112, 104], 0.85, 5.5);

  /** Where the lines stop short, as circles: the signs, and the medallion's own ring. */
  const CUTS = [
    { c: APEX, r: 11 },
    { c: SOL, r: 16 },
    { c: LUNA, r: 13.5 },
    ...SKY.map(({ c, r }) => ({ c, r: r + 2.4 })),
    ...MOTES.map((c) => ({ c, r: 2.6 })),
  ];
</script>

<script lang="ts">
  /** `compact`: only the medallion and its glory. */
  let { compact = false }: { compact?: boolean } = $props();
  const uid = $props.id();
</script>

<svg
  class="plate"
  class:compact
  viewBox={compact ? `${C[0] - 100} ${C[1] - 100} 200 200` : `0 0 ${W} ${H}`}
  preserveAspectRatio="xMidYMid slice"
  aria-hidden="true"
>
  <defs>
    <clipPath id="{uid}-in"><path d={INSIDE} /></clipPath>
    <clipPath id="{uid}-sp"><path d={SPANDRELS} clip-rule="evenodd" /></clipPath>
    <radialGradient id="{uid}-fade" cx={C[0]} cy={C[1]} r="124" gradientUnits="userSpaceOnUse">
      <stop offset="0.55" stop-color="#fff" />
      <stop offset="1" stop-color="#000" />
    </radialGradient>
    <mask id="{uid}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
      <rect width={W} height={H} fill="#fff" />
      {#each CUTS as { c, r }, k (k)}
        <circle cx={f(c[0])} cy={f(c[1])} {r} fill="#000" />
      {/each}
    </mask>
    <mask id="{uid}-glory" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
      <rect width={W} height={H} fill="url(#{uid}-fade)" />
      {#if !compact}
        {#each CUTS as { c, r }, k (k)}
          <circle cx={f(c[0])} cy={f(c[1])} {r} fill="#000" />
        {/each}
      {/if}
    </mask>
  </defs>

  <g mask="url(#{uid}-glory)">
    <path d={GLORY} class="glory" clip-path={compact ? undefined : `url(#${uid}-in)`} />
  </g>

  <g class="medallion">
    <circle cx={C[0]} cy={C[1]} r={RING} class="line" />
    <circle cx={C[0]} cy={C[1]} r={RING - 2.4} class="hair" />
    <circle cx={C[0]} cy={C[1]} r="55.6" class="hair" />
    <path d={TICKS} class="hair" />
    <path d={BRAID} class="hair braid" />
    <circle cx={C[0]} cy={C[1]} r="43.3" class="beads" />
    {#each LOZENGES as { x, y, a } (a)}
      <path d="M0 -3.2L1.9 0L0 3.2L-1.9 0Z" transform="translate({f(x)} {f(y)}) rotate({a})" class="line lozenge" />
    {/each}
  </g>

  {#if !compact}
    <g mask="url(#{uid}-cut)">
      <g clip-path="url(#{uid}-sp)"><path d={HATCH} class="hatch" /><path d={HATCH} class="hatch" transform="translate({W} 0) scale(-1 1)" /></g>
      {#each ARCH as d, k (k)}
        <path {d} class={k < 2 ? 'line' : 'hair'} />
      {/each}
      {#each BEADS as d, k (k)}
        <path {d} class="beads" />
      {/each}
    </g>
    {#each FRAMES as d, k (k)}
      <path {d} class={k % 2 ? 'hair' : 'line'} />
    {/each}

    <g class="sign">
      <path d={star(APEX, 7.5)} class="line" />
      <path d={ridges(APEX, 7.5)} class="hair" />
      <circle cx={f(SOL[0])} cy={f(SOL[1])} r="5.6" class="line" />
      <circle cx={f(SOL[0])} cy={f(SOL[1])} r="4.3" class="hair" />
      <circle cx={f(SOL[0])} cy={f(SOL[1])} r="1" class="fill" />
      <path d={SOL_RAYS} class="hair sol-rays" />
      <g transform="translate({LUNA[0]} {LUNA[1]})">
        <path d={MOON.outline} class="line" />
        <path d={MOON.shade} class="hair" />
        <path d={star(MOON.star, 2.6)} class="fill" />
      </g>
      {#each SKY as { c, r }, k (k)}
        <path d={star(c, r)} class="fill" />
      {/each}
      {#each MOTES as c, k (k)}
        <circle cx={f(c[0])} cy={f(c[1])} r="0.75" class="fill" />
      {/each}
    </g>

  {/if}
</svg>

<style>
  .plate {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
    color: var(--ink);
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-linejoin: round;
  }
  .line {
    stroke-width: 0.6;
  }
  .hair {
    stroke-width: 0.3;
  }
  .fill {
    fill: currentColor;
    stroke: none;
  }
  .hatch {
    stroke-width: 0.28;
    opacity: 0.4;
  }
  .glory {
    stroke-width: 0.3;
    opacity: 0.55;
  }
  .medallion {
    opacity: 0.85;
  }
  .braid {
    opacity: 0.8;
  }
  /* Round beads, from dashes with no length. */
  .beads {
    stroke-width: 1;
    stroke-dasharray: 0 3.2;
    stroke-linecap: round;
    opacity: 0.8;
  }
  .lozenge {
    fill: var(--ground);
  }
  /* The signs are cut a little deeper than the lines round them. */
  .sign {
    color: var(--ink-hi);
  }
  .sol-rays {
    stroke-width: 0.4;
  }
</style>
