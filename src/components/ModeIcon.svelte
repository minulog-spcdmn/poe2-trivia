<script lang="ts" module>
  import { arc, f, hatch, line, transform, type Pt } from '../lib/arcane';

  // The lobby's mode emblems, engraved like the rune circle (docs/arcane-style.md):
  // a few exact lines, shading by hatching down one side, and a soft copy of the
  // lines under them for the glow. Drawn on a 32 unit square, each shown by its
  // own box round the drawing (so --mode-icon is the drawing's height, whatever
  // room it leaves in the square); the lines keep their width in screen pixels,
  // so an emblem drawn larger (Delve's, the lead card) is finer, never heavier.
  type Lines = { lines: string; hair: string };
  /**
   * An emblem: its box (x, y, width, height: the drawing's lines, the glow running past them), and where it has one, a
   * piece drawn behind it, cut clear of what lies over it (`cut`, a shape).
   */
  type Icon = Lines & { box: [number, number, number, number]; behind?: Lines & { cut: string } };
  export type ModeCard = 'delve' | 'versus';
  const join = (...d: string[]) => d.join('');
  const poly = (...ps: Pt[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('');

  /** Delve: an arched shaft, its stair going down into the dark. */
  function shaft(): Icon {
    const c: Pt = [16, 14];
    // Treads, nearer ones lower and wider, each `half` either side of the middle.
    const treads = [
      { y: 27.3, half: 5.9 },
      { y: 25.2, half: 5 },
      { y: 23.5, half: 4.2 },
      { y: 22.1, half: 3.6 },
      { y: 21, half: 3.1 },
    ];
    const top = treads.at(-1)!;
    // The dark beyond the last step: hatching slanted across the arch's mouth
    // (a convex shape, so each hatch line is one piece).
    const r = 6.1;
    const inside = ([x, y]: Pt) => y <= top.y - 0.5 && (y >= 14 ? Math.abs(x - 16) <= r : Math.hypot(x - 16, y - 14) <= r);
    const dark: string[] = [];
    for (let k = -14; k <= 14; k += 0.95) {
      // The line x - y = k, walked from top to bottom.
      const ins = Array.from({ length: 241 }, (_, i): Pt => [16 + k + (i / 240) * 16 - 8, 14 + (i / 240) * 16 - 8]).filter(inside);
      if (ins.length > 4) dark.push(`M${f(ins[0][0])} ${f(ins[0][1])}L${f(ins.at(-1)![0])} ${f(ins.at(-1)![1])}`);
    }
    return {
      box: [6, 3.3, 20, 26.2],
      lines: join(
        // The arch: outer and inner rings, broken by the keystone; posts down to the floor.
        'M6 29.5V14',
        arc(c, 10, -90, -9.2),
        arc(c, 10, 9.2, 90),
        'M26 14V29.5M9 29.5V14',
        arc(c, 7, -90, 90),
        'M23 14V29.5',
        'M14.6 7.15L14.25 3.3H17.75L17.4 7.15',
        // Springing lines and joints between the stones.
        'M6 14H9M23 14H26',
        ...[-55, 55].map((a) => {
          const r = (k: number): Pt => [c[0] + k * Math.sin((a * Math.PI) / 180), c[1] - k * Math.cos((a * Math.PI) / 180)];
          return line(r(7), r(10));
        }),
        // The stair's walls narrowing toward the dark, and its treads.
        poly([9, 29.5], [16 - top.half, top.y]),
        poly([23, 29.5], [16 + top.half, top.y]),
        ...treads.map((t) => `M${f(16 - t.half)} ${f(t.y)}H${f(16 + t.half)}`),
      ),
      hair: join(dark.join(''), hatch([9.4, top.y], [9.4, 28.6], [16 - top.half - 0.3, top.y], 0.85)),
    };
  }

  /**
   * Versus: two swords crossed, points up, as the deathmatch's mark has them (DuelMark), engraved at the emblems' size:
   * each blade ridged down its middle and hatched down its lower side, its grip bound, the one behind cut clear of the
   * blade in front.
   */
  function swords(): Icon {
    // Each sword drawn upright about the crossing (the origin), then turned out to either side;
    // the crossing sits a little under the middle so the pair, pommels and points, is centred.
    const c: Pt = [16, 17.1];
    const k = 1.08;
    const [tip, shoulder, half, guard, guardHalf, guardTo, gripTo, pommel] = [-17, -13.2, 1.8, 6, 4.9, 7.4, 11.5, 1.3];
    const blade = poly([-half, guard], [-half, shoulder], [0, tip], [half, shoulder], [half, guard]);
    const sword = (turn: number, side: 1 | -1): Lines => {
      // Hatching across the blade's lower side, from the ridge to the edge, and the grip's binding, slanting across it.
      const shade: string[] = [];
      for (let y = -14.3; y < guard - 0.4; y += 0.95) shade.push(`M${f(0.4 * side)} ${f(y)}H${f((half - 0.3) * side)}`);
      for (let y = 8.2; y < gripTo; y += 1) shade.push(`M-0.8 ${f(y)}L0.8 ${f(y - 0.7)}`);
      const pommelRing = `M${f(pommel)} ${f(gripTo + pommel)}A${pommel} ${pommel} 0 1 1 ${f(-pommel)} ${f(gripTo + pommel)}A${pommel} ${pommel} 0 1 1 ${f(pommel)} ${f(gripTo + pommel)}Z`;
      const lines = join(blade, `M0 ${tip + 2}V${guard}`, `M${-guardHalf} ${guard}H${guardHalf}V${guardTo}H${-guardHalf}Z`, `M-0.8 ${guardTo}V${gripTo}M0.8 ${guardTo}V${gripTo}`, pommelRing);
      return { lines: transform(lines, c, k, turn), hair: transform(shade.join(''), c, k, turn) };
    };
    // In front, the sword pointing up and right; behind, the other, cut where the blade in front (its outline, and a
    // clearance of an engraver's gap) lies over it.
    const front = sword(45, 1);
    const cutShape = transform(join(blade, 'Z'), c, k, 45);
    return { ...front, box: [3, 4.1, 26, 24.2], behind: { ...sword(-45, -1), cut: cutShape } };
  }

  const ICONS: Record<ModeCard, Icon> = { delve: shaft(), versus: swords() };
</script>

<script lang="ts">
  let { mode }: { mode: ModeCard } = $props();
  const icon = $derived(ICONS[mode]);
  const uid = $props.id();
</script>

{#snippet engraved(l: Lines)}
  <g class="glow">
    <path d={l.lines} />
    <path d={l.hair} />
  </g>
  <path class="lines" d={l.lines} />
  <path class="hair" d={l.hair} />
{/snippet}

<svg class="mode-icon" viewBox={icon.box.join(' ')} style:aspect-ratio="{icon.box[2]} / {icon.box[3]}" aria-hidden="true">
  {#if icon.behind}
    <defs>
      <mask id="{uid}-cut" maskUnits="userSpaceOnUse" x="-4" y="-4" width="40" height="40">
        <rect x="-4" y="-4" width="40" height="40" fill="#fff" />
        <path class="cut" d={icon.behind.cut} />
      </mask>
    </defs>
    <g mask="url(#{uid}-cut)">{@render engraved(icon.behind)}</g>
  {/if}
  {@render engraved(icon)}
</svg>

<style>
  .mode-icon {
    display: block;
    width: auto;
    height: var(--mode-icon, 26px);
    overflow: visible;
    fill: none;
    stroke: currentColor;
  }
  path {
    vector-effect: non-scaling-stroke;
  }
  .lines {
    stroke-width: 1px;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .hair {
    stroke-width: 0.5px;
    stroke-linecap: round;
    opacity: 0.85;
  }
  /* A soft copy of the lines under them: the glow, never on the lines themselves. */
  .glow {
    stroke-width: 2.6px;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: var(--glow, 0.16);
    transition: opacity 0.3s;
  }
  /* What the blade in front covers of the one behind, and an engraver's gap round it: scaled with the emblem, as its shape is. */
  .cut {
    vector-effect: none;
    fill: #000;
    stroke: #000;
    stroke-width: 2.3;
    stroke-linejoin: round;
  }
</style>
