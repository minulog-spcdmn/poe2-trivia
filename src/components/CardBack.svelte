<script module lang="ts">
  // The back of a category card, engraved like the back of an old card:
  // the same either way up, and unlike the face (CardPlate):
  // • a field with notched corners, a lattice of diamonds across it with a
  //   star in each;
  // • in the middle an oval cartouche with a beaded moulding, cleared of the
  //   lattice, a star on its ends and lozenges on its sides;
  // • in the oval the seal (drawn by the card) as the sun, ringed in a
  //   corona, its glory of straight and wavy rays out to the oval, and a
  //   crescent moon toward either end, horns out, a star in them.
  // A tall card stands the oval up, with the moons above and below the seal;
  // a narrow one, laid in a row, lays it down, the moons to either side.
  //
  // It is drawn in pixels from the middle of the card, so the oval and the
  // moons keep their size whatever the card's, and the lattice simply runs
  // on to its edges. The field's frame is drawn to a nominal size and
  // stretched (its corners are small enough not to show it).
  import { at, crescent, f, glory, ridges, star, type Pt } from '../lib/engraving';

  /** A rectangle with its corners notched by quarter circles of radius `n` about them, its sides `d` in. */
  const notched = (x0: number, y0: number, x1: number, y1: number, n: number, d = 0) => {
    const s = Math.sqrt(n * n - d * d);
    const a = `A${n} ${n} 0 0 0`;
    return (
      `M${f(x0 + s)} ${f(y0 + d)}H${f(x1 - s)}${a} ${f(x1 - d)} ${f(y0 + s)}V${f(y1 - s)}${a} ${f(x1 - s)} ${f(y1 - d)}` +
      `H${f(x0 + s)}${a} ${f(x0 + d)} ${f(y1 - s)}V${f(y0 + s)}${a} ${f(x0 + s)} ${f(y0 + d)}Z`
    );
  };
  /** The field's frame, double, for a field `w` by `h`. */
  const frame = (w: number, h: number) => [notched(0.5, 0.5, w - 0.5, h - 0.5, 5), notched(0.5, 0.5, w - 0.5, h - 0.5, 7.5, 2.5)];
  const TALL_FIELD = [188, 268] as const;
  const ROW_FIELD = [340, 72] as const;

  const O: Pt = [0, 0];
  const ellipse = (rx: number, ry: number) => `M${-rx} 0A${rx} ${ry} 0 1 1 ${rx} 0A${rx} ${ry} 0 1 1 ${-rx} 0Z`;

  /** One way of laying out the oval and what's in it. */
  const layout = ({ rx, ry, ring, rays, moon, moonAt, moonTurn, side }: {
    rx: number;
    ry: number;
    /** The seal's engraved ring and the sun's corona inside it, if there's room for them. */
    ring: number | null;
    /** Where the glory begins, and how many rays. */
    rays: [number, number];
    moon: number;
    /** The moons' centres, and how far each is turned (her horns point left unturned). */
    moonAt: [Pt, Pt];
    moonTurn: [number, number];
    /** Small stars beside each moon. */
    side: Pt[];
  }) => {
    const m = crescent(moon, moon * 0.855, moon * 0.38);
    const ends: Pt[] = rx > ry ? [[-rx, 0], [rx, 0]] : [[0, -ry], [0, ry]];
    const flanks: Pt[] = rx > ry ? [[0, -ry], [0, ry]] : [[-rx, 0], [rx, 0]];
    const tip = Math.min(rx, ry) > 50 ? 6.5 : 5;
    return {
      rx,
      ry,
      ring,
      corona: ring ? glory(O, 48, ring - 13, [ring - 2.5, ring - 5.5, ring - 3.5], 0.45, 2) : '',
      oval: [ellipse(rx, ry), ellipse(rx - 3, ry - 3)],
      beads: ellipse(rx - 1.5, ry - 1.5),
      inside: ellipse(rx - 3, ry - 3),
      glory: glory(O, rays[1], rays[0], [Math.max(rx, ry), Math.max(rx, ry) * 0.8, Math.max(rx, ry) * 0.9], 0.9, 5.5),
      moon: m,
      moons: moonAt.map((c, k) => ({ c, turn: moonTurn[k] })),
      side,
      ends: ends.map((c) => ({ c, r: tip })),
      flanks,
      cuts: [...moonAt.map((c) => ({ c, r: moon + 3 })), ...side.map((c) => ({ c, r: 5 })), ...ends.map((c) => ({ c, r: tip + 2.5 }))],
    };
  };
  const TALL = layout({
    rx: 78,
    ry: 120,
    ring: 63,
    rays: [70, 48],
    moon: 11,
    moonAt: [
      [0, -94],
      [0, 94],
    ],
    moonTurn: [90, -90],
    side: [
      [-24, -96],
      [24, -96],
      [-24, 96],
      [24, 96],
    ],
  });
  const ROW = layout({
    rx: 124,
    ry: 29,
    ring: null,
    rays: [26, 40],
    moon: 9,
    moonAt: [
      [-62, 0],
      [62, 0],
    ],
    moonTurn: [0, 180],
    side: [
      [-90, 0],
      [90, 0],
    ],
  });
  type Layout = typeof TALL;

  /** A four-pointed star of radius `r`, its sides drawn in. */
  const spark = (c: Pt, r: number) => {
    const p = [0, 90, 180, 270].map((a) => at(c, a, r));
    const q = (i: number) => `Q${f(c[0])} ${f(c[1])} ${f(p[i][0])} ${f(p[i][1])}`;
    return `M${f(p[0][0])} ${f(p[0][1])}${q(1)}${q(2)}${q(3)}${q(0)}Z`;
  };
  // The lattice's tile: a diamond, a star in it, beads where the diamonds meet.
  const TILE = [16, 22] as const;
</script>

<script lang="ts">
  const uid = $props.id();
</script>

{#snippet oval(l: Layout, kind: string)}
  <g class={kind}>
    <defs>
      <clipPath id="{uid}-{kind}-in"><path d={l.inside} /></clipPath>
      <mask id="{uid}-{kind}-cut" maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800">
        <rect x="-400" y="-400" width="800" height="800" fill="#fff" />
        {#each l.cuts as { c, r }, k (k)}
          <circle cx={f(c[0])} cy={f(c[1])} {r} fill="#000" />
        {/each}
      </mask>
    </defs>
    <g mask="url(#{uid}-{kind}-cut)">
      <path d={l.glory} class="hair glory" clip-path="url(#{uid}-{kind}-in)" />
      {#if l.ring}
        <path d={l.corona} class="hair corona" />
        <circle r={l.ring} class="line" />
        <circle r={l.ring + 3.5} class="beads" />
      {/if}
      <path d={l.oval[0]} class="line" />
      <path d={l.oval[1]} class="hair" />
      <path d={l.beads} class="beads" />
    </g>
    <g class="sign">
      {#each l.moons as { c, turn }, k (k)}
        <g transform="translate({f(c[0])} {f(c[1])}) rotate({turn})">
          <path d={l.moon.outline} class="line" />
          <path d={l.moon.shade} class="hair" />
          <path d={star(l.moon.star, 2.4)} class="fill" />
        </g>
      {/each}
      {#each l.side as c, k (k)}
        <path d={star(c, 3.2)} class="fill" />
      {/each}
      {#each l.ends as { c, r }, k (k)}
        <path d={star(c, r)} class="line ground" />
        <path d={ridges(c, r)} class="hair" />
      {/each}
      {#each l.flanks as [x, y], k (k)}
        <path d="M0 -3.4L2 0L0 3.4L-2 0Z" transform="translate({f(x)} {f(y)}) rotate({x ? 0 : 90})" class="line ground" />
      {/each}
    </g>
  </g>
{/snippet}

<span class="backing" aria-hidden="true">
  <svg class="lattice">
    <defs>
      <pattern id="{uid}-tile" x="50%" y="50%" width={TILE[0]} height={TILE[1]} patternUnits="userSpaceOnUse">
        <path d="M{TILE[0] / 2} 0L{TILE[0]} {TILE[1] / 2}L{TILE[0] / 2} {TILE[1]}L0 {TILE[1] / 2}Z" class="hair" />
        <path d={spark([TILE[0] / 2, TILE[1] / 2], 2.2)} class="fill" />
        <circle cx={TILE[0] / 2} cy="0" r="0.6" class="fill" />
        <circle cx={TILE[0] / 2} cy={TILE[1]} r="0.6" class="fill" />
        <circle cx="0" cy={TILE[1] / 2} r="0.6" class="fill" />
        <circle cx={TILE[0]} cy={TILE[1] / 2} r="0.6" class="fill" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#{uid}-tile)" />
  </svg>
  <svg class="frame tall" viewBox="0 0 {TALL_FIELD[0]} {TALL_FIELD[1]}" preserveAspectRatio="none">
    {#each frame(...TALL_FIELD) as d, k (k)}<path {d} class={k ? 'hair' : 'line'} />{/each}
  </svg>
  <svg class="frame row" viewBox="0 0 {ROW_FIELD[0]} {ROW_FIELD[1]}" preserveAspectRatio="none">
    {#each frame(...ROW_FIELD) as d, k (k)}<path {d} class={k ? 'hair' : 'line'} />{/each}
  </svg>
  <svg class="motif">
    <svg x="50%" y="50%" overflow="visible">
      {@render oval(TALL, 'tall')}
      {@render oval(ROW, 'row')}
    </svg>
  </svg>
</span>

<style>
  .backing {
    position: absolute;
    inset: 16px;
    --ox: 78px;
    --oy: 120px;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    color: var(--ink);
  }
  /* The lattice runs to the field's edge and stops at the oval. */
  .lattice {
    opacity: 0.5;
    -webkit-mask: radial-gradient(ellipse var(--ox) var(--oy) at 50% 50%, transparent 99%, #000 100%);
    mask: radial-gradient(ellipse var(--ox) var(--oy) at 50% 50%, transparent 99%, #000 100%);
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
  .frame path {
    vector-effect: non-scaling-stroke;
    opacity: 0.85;
  }
  .fill {
    fill: currentColor;
    stroke: none;
  }
  .ground {
    fill: var(--ground);
  }
  .glory {
    opacity: 0.6;
  }
  .corona {
    color: var(--ink-hi);
  }
  /* Round beads, from dashes with no length. */
  .beads {
    stroke-width: 1;
    stroke-dasharray: 0 3.2;
    stroke-linecap: round;
    opacity: 0.8;
  }
  .sign {
    color: var(--ink-hi);
  }
  .row {
    display: none;
  }

  @media (max-width: 700px) {
    .backing {
      inset: 10px;
      --ox: 124px;
      --oy: 29px;
    }
    .tall {
      display: none;
    }
    .row {
      display: inline;
    }
  }
</style>
