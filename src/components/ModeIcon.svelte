<script lang="ts" module>
  import { arc, f, hatch, line, type Pt } from '../lib/arcane';
  import type { GameMode } from '../lib/game';

  // The lobby's mode emblems, engraved like the rune circle (docs/arcane-style.md)
  // but drawn for 32 px: a few exact lines, shading by hatching down one side,
  // and a soft copy of the lines under them for the glow. 32 unit viewBox.
  type Icon = { lines: string; hair: string };
  const join = (...d: string[]) => d.join('');
  const poly = (...ps: Pt[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('');

  /** Take turns: an hourglass, its sand running from one turn to the next. */
  function hourglass(): Icon {
    // The glass's sides run straight from the shoulder to the neck.
    const side = (y: number) => 11 + ((y - 7) * 4.2) / 8.3;
    const sand = 10.6;
    return {
      lines: join(
        // Plates, and turned posts with a bead the lines stop short of.
        'M6.5 3H25.5V5.4H6.5ZM6.5 26.6H25.5V29H6.5Z',
        'M8.4 5.4V15.1M8.4 16.9V26.6M23.6 5.4V15.1M23.6 16.9V26.6',
        'M9.3 16a0.9 0.9 0 1 1 -1.8 0a0.9 0.9 0 1 1 1.8 0ZM24.5 16a0.9 0.9 0 1 1 -1.8 0a0.9 0.9 0 1 1 1.8 0Z',
        poly([11, 5.4], [11, 7], [15.2, 15.3], [15.2, 16.7], [11, 25], [11, 26.6]),
        poly([21, 5.4], [21, 7], [16.8, 15.3], [16.8, 16.7], [21, 25], [21, 26.6]),
        // The sand left above, and the heap below.
        line([side(sand) + 0.5, sand], [32 - side(sand) - 0.5, sand]),
        'M12 26.6Q16 20.9 20 26.6',
      ),
      hair: join(
        hatch([side(sand) + 0.6, sand + 0.2], [16, 15.1], [32 - side(sand) - 0.6, sand + 0.2], 0.95),
        // The heap shaded down its right side, and the thread of sand falling onto it.
        hatch([16.2, 24], [19.4, 26.4], [16.2, 26.4], 0.85),
        'M16 16.9V22.9',
      ),
    };
  }

  /** Race: a lightning bolt, ridged down its middle and hatched down one side. */
  function bolt(): Icon {
    const [a, b, c, d, e, g]: Pt[] = [
      [21.6, 1.8],
      [7.6, 18],
      [14.6, 18],
      [10.8, 30.2],
      [24.8, 12.4],
      [17.8, 12.4],
    ];
    const ridge: Pt[] = [
      [20.4, 4.8],
      [11.4, 15.3],
      [20.4, 15.3],
      [12.2, 27.2],
    ];
    return {
      lines: poly(a, b, c, d, e, g) + 'Z' + poly(...ridge),
      hair: join(hatch(ridge[1], b, ridge[0], 0.9), hatch(ridge[3], c, ridge[2], 0.9)),
    };
  }

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

  const ICONS: Record<GameMode, Icon> = { turns: hourglass(), race: bolt(), delve: shaft() };
</script>

<script lang="ts">
  let { mode }: { mode: GameMode } = $props();
  const icon = $derived(ICONS[mode]);
</script>

<svg class="mode-icon" viewBox="0 0 32 32" aria-hidden="true">
  <g class="glow">
    <path d={icon.lines} />
    <path d={icon.hair} />
  </g>
  <path class="lines" d={icon.lines} />
  <path class="hair" d={icon.hair} />
</svg>

<style>
  .mode-icon {
    display: block;
    width: 32px;
    height: 32px;
    overflow: visible;
    fill: none;
    stroke: currentColor;
  }
  .lines {
    stroke-width: 1;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .hair {
    stroke-width: 0.5;
    stroke-linecap: round;
    opacity: 0.85;
  }
  /* A soft copy of the lines under them: the glow, never on the lines themselves. */
  .glow {
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: var(--glow, 0.16);
    transition: opacity 0.3s;
  }
</style>
