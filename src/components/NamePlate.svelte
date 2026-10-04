<script lang="ts">
  // The name plate behind a unique's name, as the game draws it: a copper
  // frame, a field of interlaced arches and, at each end, a brace of
  // scrollwork holding a gem. Drawn behind the head's own text, which sits
  // on top of it.
  // `lit` lights the gems (an unidentified item keeps them dark until the
  // reveal); `end` is what the right brace holds: a gem, or an empty socket
  // for a button to sit in (the dialog's close).
  let { lit = true, end = 'gem' }: { lit?: boolean; end?: 'gem' | 'socket' } = $props();

  type Pt = [number, number];
  const f = (v: number) => v.toFixed(2);

  /** A smooth curve through `pts` (Catmull-Rom, as cubic Béziers). */
  function spline(pts: Pt[]) {
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const [p1, p2] = [pts[i], pts[i + 1]];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
  }

  /**
   * A curl around `c`, winding out from radius `r0` to `r1` over `turns`
   * and ending at angle `end` (degrees, screen coordinates), heading
   * clockwise.
   */
  function curl(c: Pt, r0: number, r1: number, turns: number, end: number): Pt[] {
    const n = Math.round(turns * 10);
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const a = ((end - turns * 360 * (1 - t)) * Math.PI) / 180;
      const r = r0 + (r1 - r0) * t;
      return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Pt;
    });
  }

  const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x, -y]);

  // The brace at the left end, around its middle (y 0), the plate's edge at
  // x 0. The upper arm curls in at the top and sweeps round to the point,
  // where the gem sits; a smaller curl hangs in its bowl.
  const arm: Pt[] = [...curl([12.5, -17.5], 0.8, 6, 1.6, -90), [18, -24.6], [23.5, -21.5], [25.5, -14], [26.2, -7.5], [29, -2.8], [32.5, -0.6]];
  const hook: Pt[] = [[25.6, -13.5], [22.5, -12], [19.6, -9.2], [19.4, -6], [21.6, -4.8], [23.2, -6.6], [22, -8.2]];
  const brace = [arm, hook, mirror(arm), mirror(hook)].map(spline).join('');
  /** The lance from the gem into the field, tapering to a point, with a lozenge on it. */
  const spike = 'M42 -1.3L50 -0.7L53 -2.6L56 -0.5L66 0L56 0.5L53 2.6L50 0.7L42 1.3Z';
  const GEM: Pt = [37, 0];

  /** A pointed arch from `x` to `x` + 32, its feet on the sill, and a smaller one inside it. */
  const arches = (x: number) => `M${x} 56C${x} 36 ${x + 5} 22 ${x + 16} 11C${x + 27} 22 ${x + 32} 36 ${x + 32} 56`;
  const inner = (x: number) => `M${x + 4} 56C${x + 4} 40 ${x + 8} 29 ${x + 16} 20C${x + 24} 29 ${x + 28} 40 ${x + 28} 56`;

  const uid = $props.id();
  const id = (n: string) => `${uid}-${n}`;
</script>

{#snippet metal(d: string, w = 1.9)}
  <path class="shade" {d} fill="none" stroke-width={w + 1.8} />
  <path {d} fill="none" stroke="url(#{id('metal')})" stroke-width={w} />
  <path class="shine" {d} fill="none" stroke-width={w * 0.35} />
{/snippet}

{#snippet cap(holds: 'gem' | 'socket')}
  {@render metal(brace)}
  <path class="shade solid" d={spike} />
  <path d={spike} fill="url(#{id('lance')})" />
  <circle class="shade solid" cx={GEM[0]} cy={GEM[1] + 0.6} r={holds === 'gem' ? 6.4 : 9.2} />
  {#if holds === 'gem'}
    <g class="gem" class:lit>
      <circle class="glow" cx={GEM[0]} cy={GEM[1]} r="11" fill="url(#{id('glow')})" />
      <circle cx={GEM[0]} cy={GEM[1]} r="4.4" fill="url(#{id('dark')})" />
      <circle class="fire" cx={GEM[0]} cy={GEM[1]} r="4.4" fill="url(#{id('gem')})" />
      <ellipse class="fire" cx={GEM[0] - 1.4} cy={GEM[1] - 1.6} rx="1.2" ry="0.8" fill="#fff3dc" />
    </g>
    {@render metal(`M${GEM[0] - 5.2} 0a5.2 5.2 0 1 0 10.4 0a5.2 5.2 0 1 0 -10.4 0`, 1.3)}
  {:else}
    <circle cx={GEM[0]} cy={GEM[1]} r="8.2" fill="#070402" />
    {@render metal(`M${GEM[0] - 8.4} 0a8.4 8.4 0 1 0 16.8 0a8.4 8.4 0 1 0 -16.8 0`, 1.3)}
  {/if}
{/snippet}

<span class="plate" aria-hidden="true">
  <svg class="field" width="100%" height="100%">
    <defs>
      <!-- Interlaced pointed arches, each spanning two bays, as in a cloister. -->
      <pattern id={id('arches')} patternUnits="userSpaceOnUse" width="32" height="64" x="50%" y="-32">
        <path d={arches(0) + arches(16) + arches(-16) + 'M-1 56H33'} />
        <path class="inner" d={inner(0) + inner(16) + inner(-16) + 'M-1 58.5H33'} />
      </pattern>
    </defs>
    <svg y="50%" overflow="visible">
      <rect y="-32" width="100%" height="64" fill="url(#{id('arches')})" />
    </svg>
  </svg>
  <svg class="art" width="100%" height="100%">
    <defs>
      <linearGradient id={id('metal')} gradientUnits="userSpaceOnUse" x1="0" y1="-26" x2="0" y2="26">
        <stop offset="0" stop-color="#f7c88e" />
        <stop offset="0.3" stop-color="#cf8746" />
        <stop offset="0.5" stop-color="#7e4219" />
        <stop offset="0.7" stop-color="#c47c40" />
        <stop offset="1" stop-color="#5e2f11" />
      </linearGradient>
      <linearGradient id={id('lance')} gradientUnits="userSpaceOnUse" x1="42" y1="0" x2="66" y2="0">
        <stop offset="0" stop-color="#e9a76a" />
        <stop offset="0.5" stop-color="#b8723a" />
        <stop offset="1" stop-color="#b8723a" stop-opacity="0" />
      </linearGradient>
      <radialGradient id={id('gem')} cx="0.4" cy="0.36" r="0.7">
        <stop offset="0" stop-color="#ffd8a0" />
        <stop offset="0.3" stop-color="#f08a3a" />
        <stop offset="0.75" stop-color="#9c3f15" />
        <stop offset="1" stop-color="#3a1204" />
      </radialGradient>
      <radialGradient id={id('dark')} cx="0.4" cy="0.36" r="0.7">
        <stop offset="0" stop-color="#5a3a26" />
        <stop offset="0.6" stop-color="#24140b" />
        <stop offset="1" stop-color="#0c0603" />
      </radialGradient>
      <radialGradient id={id('glow')}>
        <stop offset="0" stop-color="#f59a4c" stop-opacity="0.55" />
        <stop offset="1" stop-color="#f59a4c" stop-opacity="0" />
      </radialGradient>
    </defs>
    <svg y="50%" overflow="visible">{@render cap('gem')}</svg>
    <svg x="100%" y="50%" overflow="visible">
      <g transform="scale(-1 1)">{@render cap(end)}</g>
    </svg>
  </svg>
</span>

<style>
  .plate {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    /* A warm glow behind the name, darker towards the braces. */
    background:
      radial-gradient(ellipse 42% 75% at 50% 50%, rgba(224, 138, 68, 0.26), transparent 72%),
      linear-gradient(90deg, rgba(0, 0, 0, 0.5), transparent 22%, transparent 78%, rgba(0, 0, 0, 0.5)),
      linear-gradient(180deg, #3d2411, #26150a 55%, #1b0f06);
    box-shadow:
      inset 0 0 18px rgba(0, 0, 0, 0.55),
      inset 0 -1px 0 #6b4520;
  }
  /* The frame: a bright copper line, and a dimmer one inside it. */
  .plate::before,
  .plate::after {
    content: '';
    position: absolute;
    pointer-events: none;
  }
  .plate::before {
    inset: 2px;
    border: 1px solid #a5622d;
    border-radius: 5px;
    box-shadow:
      inset 0 1px 0 rgba(255, 214, 160, 0.18),
      0 1px 0 rgba(0, 0, 0, 0.6);
  }
  .plate::after {
    inset: 5px;
    border: 1px solid rgba(120, 70, 32, 0.6);
    border-radius: 3px;
  }
  .field,
  .art {
    position: absolute;
    inset: 0;
  }
  .art {
    overflow: visible;
  }
  .field {
    /* Faint, and fainter still under the name. */
    opacity: 0.24;
    mask-image: radial-gradient(ellipse 30% 90% at 50% 50%, rgba(0, 0, 0, 0.35), #000 80%);
  }
  pattern path {
    fill: none;
    stroke: #c4743a;
    stroke-width: 0.8;
  }
  pattern .inner {
    stroke-width: 0.5;
    opacity: 0.6;
  }
  path {
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .shade {
    stroke: #0b0502;
    opacity: 0.85;
    transform: translateY(0.6px);
  }
  .shade.solid {
    fill: #0b0502;
    stroke: none;
  }
  .shine {
    stroke: #ffe2b8;
    opacity: 0.45;
    transform: translateY(-0.45px);
  }
  .gem .fire,
  .gem .glow {
    opacity: 0;
    transition: opacity 0.7s;
  }
  .gem.lit .fire,
  .gem.lit .glow {
    opacity: 1;
  }
</style>
