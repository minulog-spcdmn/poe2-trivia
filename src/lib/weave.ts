// The name plate's field (NamePlate.svelte): an interlace of waves against
// their mirror images, the rows closer together than the waves are tall, so
// that every strap crosses not just its own mirror but the mirrors in the
// rows above and below. Six crossings a wave, and the straps go over and
// under in turn along each, as the circle's star does. Faint, as if cut into
// the dark; one tile of it repeats over the whole plate.
//
// Pure geometry, apart from the plate so that a worker can work it out
// (weaveWorker.ts): on an iPhone it held the page some 60 ms, in the tap that
// opened the codex's first item window (lib/weaveTile.ts).

type Pt = [number, number];
const f = (v: number) => v.toFixed(2);
const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const poly = (pts: Pt[]) => 'M' + pts.map(pt).join('L');

/** How wide a wave is (px): the tile's width. */
export const BAY = 40;
const AMP = 8.5;
/** How far apart the rows are (px): the tile's height. */
export const ROW = 11;
const W = 0.75;
const GAP = 0.7;
// The pattern repeats every row, so a tile one row high holds it; the rows
// either side are drawn too, for the waves that reach into it.
const ROWS = [-2, -1, 0, 1, 2, 3];
/** Where along a wave (as an angle) it crosses a mirror in the next row up or down. */
const SKEW = Math.asin(ROW / (2 * AMP));
// Along a rising wave the crossings come at 0, SKEW, π - SKEW, π, π + SKEW
// and 2π - SKEW; it goes under at every second one. Its mirror goes under
// at the others.
const UNDER = { rise: [SKEW, Math.PI, 2 * Math.PI - SKEW], fall: [0, Math.PI - SKEW, Math.PI + SKEW, 2 * Math.PI] };
/** How many steps a wave is drawn in, across the bay (its points evenly spaced across). */
const STEPS = 240;
const wave = (c: number, sign: number): Pt[] =>
  Array.from({ length: STEPS + 1 }, (_, k) => [(k / STEPS) * BAY, c + sign * AMP * Math.sin((2 * Math.PI * k) / STEPS)] as Pt);
type Strand = { sign: number; mid: Pt[] };
/** How near (squared) another strap's middle comes where this one passes under it. */
const REACH2 = (W + GAP) ** 2;

/** One edge of a strap, `side` (±1) of its wave, cut where it passes under another. */
function strapEdge(strands: Strand[], s: Strand, side: number) {
  const others = strands.filter((o) => o.sign !== s.sign);
  const under = s.sign > 0 ? UNDER.rise : UNDER.fall;
  const pieces: Pt[][] = [[]];
  s.mid.forEach((p, i) => {
    const [q, r] = [s.mid[Math.max(0, i - 1)], s.mid[Math.min(s.mid.length - 1, i + 1)]];
    const len = dist(q, r);
    const e: Pt = [p[0] - ((r[1] - q[1]) / len) * W * side, p[1] + ((r[0] - q[0]) / len) * W * side];
    const theta = (2 * Math.PI * p[0]) / BAY;
    const crossing = under.some((a) => Math.abs(theta - a) < 0.5);
    // Only the points within 3 px across can count, and a wave's points
    // are evenly spaced across (wave): just those are asked, a step more
    // either side for the rounding, not every point of every other wave. (The
    // distance squared: Math.hypot is slow.)
    const lo = Math.max(0, Math.floor(((e[0] - 3) * STEPS) / BAY) - 1);
    const hi = Math.min(STEPS, Math.ceil(((e[0] + 3) * STEPS) / BAY) + 1);
    const close = (o: Strand) => {
      for (let k = lo; k <= hi; k++) {
        const dx = o.mid[k][0] - e[0];
        const dy = o.mid[k][1] - e[1];
        if (Math.abs(dx) < 3 && dx * dx + dy * dy < REACH2) return true;
      }
      return false;
    };
    const near = crossing && others.some(close);
    if (near) {
      if (pieces.at(-1)!.length) pieces.push([]);
    } else pieces.at(-1)!.push(e);
  });
  return pieces.filter((q) => q.length > 1).map(poly).join('');
}

/** The tile's straps, as one SVG path. */
export function weavePath(): string {
  const strands: Strand[] = ROWS.flatMap((r) => [1, -1].map((sign) => ({ sign, mid: wave(r * ROW, sign) })));
  return strands.flatMap((s) => [1, -1].map((side) => strapEdge(strands, s, side))).join('');
}

/**
 * The tile drawn from its path, as a CSS background: it repeats over the
 * whole plate whatever its height, in every browser (an SVG pattern fill
 * fell short of the plate's top and bottom on some phones).
 */
export function weaveImage(d: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${BAY}' height='${ROW}' viewBox='0 0 ${BAY} ${ROW}'><path d='${d}' fill='none' stroke='#c47a44' stroke-width='0.55'/></svg>`,
  )}")`;
}
