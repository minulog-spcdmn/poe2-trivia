<script lang="ts" module>
  import { arc, at, f, hatch, lerp, line, type Pt } from '../lib/arcane';

  // The night's Crown (lib/series.ts), engraved like the rune circle
  // (docs/arcane-style.md) but drawn for 12 to 48 px: a band seen from a
  // little above, its rims a slice of a ring about a centre over it, so they
  // curve down in front; three points rising from its top rim as rays from a
  // centre far below, so the outer ones lean out; a pearl on each tip that
  // the lines stop short of, and three jewels in the band. Shading by
  // hatching down one side of each point and along the band's lower rim; a
  // soft copy of the lines under them for the glow.
  const BAND: Pt = [12, -26];
  const RIM_TOP = 41.5;
  const RIM_BOTTOM = 45.5;
  /** Degrees either side of the band's middle. */
  const SPAN = 12.2;
  const RAYS: Pt = [12, 34];
  /** Each point: its angle about RAYS (clockwise from the top) and the radius of its tip. */
  const POINTS = [
    { a: -17.5, r: 29 },
    { a: 0, r: 30.6 },
    { a: 17.5, r: 29 },
  ];
  const PEARL = 1.25;
  /** On the band: `u` degrees right of its middle, `r` from its centre. */
  const onBand = (u: number, r: number) => at(BAND, 180 - u, r);
  const circle = (c: Pt, r: number) => `M${f(c[0] - r)} ${f(c[1])}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;

  const pearls = POINTS.map((p) => at(RAYS, p.a, p.r + 0.75));
  const tipHoles = pearls.map((c) => ({ c, r: PEARL + 0.55 }));
  const mid = (RIM_TOP + RIM_BOTTOM) / 2;
  const jewels = [
    { c: onBand(0, mid), r: 1.05 },
    { c: onBand(-6.6, mid), r: 0.75 },
    { c: onBand(6.6, mid), r: 0.75 },
  ];
  const jewelHoles = jewels.map((j) => ({ c: j.c, r: j.r + 0.5 }));
  // The points stand side by side on the top rim, sharing their corners.
  const corners = [-1, -1 / 3, 1 / 3, 1].map((u) => onBand(u * SPAN, RIM_TOP));
  const points = POINTS.map((p, i) => {
    const [l, r, tip] = [corners[i], corners[i + 1], at(RAYS, p.a, p.r)];
    const base = lerp(l, r, 0.5);
    return { lines: line(l, tip, { holes: tipHoles }) + line(r, tip, { holes: tipHoles }) + line(base, tip, { holes: tipHoles }), hatch: hatch(base, l, tip, 0.75, { holes: tipHoles }) };
  });
  const LINES =
    arc(BAND, RIM_TOP, 180 - SPAN, 180 + SPAN) +
    arc(BAND, RIM_BOTTOM, 180 - SPAN, 180 + SPAN) +
    line(onBand(-SPAN, RIM_TOP), onBand(-SPAN, RIM_BOTTOM)) +
    line(onBand(SPAN, RIM_TOP), onBand(SPAN, RIM_BOTTOM)) +
    points.map((p) => p.lines).join('');
  const GEMS = pearls.map((c) => circle(c, PEARL)).join('') + jewels.map((j) => circle(j.c, j.r)).join('');
  // Short strokes up from the lower rim, stopping short of the jewels.
  const rim: string[] = [];
  for (let u = -SPAN + 0.7; u < SPAN - 0.35; u += 0.95) rim.push(line(onBand(u, RIM_BOTTOM), onBand(u, RIM_BOTTOM - 1.5), { holes: jewelHoles }));
  const HAIR = points.map((p) => p.hatch).join('') + rim.join('');
  // A square box about the crown: from the outer pearls' edges across, from the middle pearl's top to the band's lowest point.
  const [x0, x1] = [pearls[0][0] - PEARL, pearls[2][0] + PEARL];
  const [y0, y1] = [pearls[1][1] - PEARL, BAND[1] + RIM_BOTTOM];
  const side = Math.max(x1 - x0, y1 - y0) + 0.8;
  const VIEW = `${f((x0 + x1 - side) / 2)} ${f((y0 + y1 - side) / 2)} ${f(side)} ${f(side)}`;
</script>

<script lang="ts">
  /** `size`: its width and height in px. Lines keep their weight at any size (a little bolder as it grows). */
  let { size = 12 }: { size?: number } = $props();
  const weight = $derived(size <= 14 ? 0.9 : size <= 24 ? 1 : 1.2);
</script>

<svg class="crown-mark" viewBox={VIEW} width={size} height={size} style:--w="{weight}px" aria-hidden="true">
  <g class="glow">
    <path d={LINES} />
    <path d={GEMS} />
  </g>
  <path class="lines" d={LINES} />
  <path class="lines" d={GEMS} />
  <path class="hair" d={HAIR} />
</svg>

<style>
  .crown-mark {
    display: inline-block;
    flex: none;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    color: var(--crown, #d9a45a);
  }
  /* Fine at every size: the lines are drawn in screen pixels, not the box's units. */
  path {
    vector-effect: non-scaling-stroke;
  }
  .lines {
    stroke-width: var(--w);
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .hair {
    stroke-width: calc(var(--w) * 0.5);
    stroke-linecap: round;
    opacity: 0.85;
  }
  /* A soft copy of the lines under them: the glow, never on the lines themselves. */
  .glow {
    stroke-width: calc(var(--w) * 2.6);
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: var(--glow, 0.22);
  }
</style>
