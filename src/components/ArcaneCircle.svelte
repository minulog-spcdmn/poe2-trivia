<script lang="ts">
  // A rune circle that draws itself behind the item art and turns slowly:
  // a ring of ticks, a band of runes and a pentagram, each turning its own
  // way. `state` colours it at the reveal.
  //
  // Each ring is its own <svg> turned as a whole, so the browser can spin it
  // on the compositor without repainting; the glow is a soft, wide copy of
  // the strokes underneath rather than a filter (which would repaint).
  // `size`, `color` and `strength` (opacity) override the stage defaults for
  // other places, like behind the winner on the victory screen.
  let {
    state = 'idle',
    size,
    color,
    strength,
  }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  // The inscription: Elder Futhark runes drawn on a small grid (x ±2.5,
  // y ±4), each followed by a pair of dots like a carved word divider.
  const GLYPHS = [
    'M0 -4V4M0 -1L2.5 -3.5M0 1.5L2.5 -1', // fehu
    'M-1 -4V4M-1 -2L2 0L-1 2', // thurisaz
    'M-1 -4V4M-1 -4L2 -1.5M-1 -1L2 1.5', // ansuz
    'M-1.5 4V-4L1.5 -2L-1.5 0L1.5 4', // raido
    'M2 -4L-1.5 0L2 4', // kaunan
    'M-2.5 -4L2.5 4M2.5 -4L-2.5 4', // gebo
    'M-2 -4V4M2 -4V4M-2 -1L2 1', // hagalaz
    'M0 -4V4M-2 -1.5L2 1.5', // naudiz
    'M-0.5 -4L-2.5 -1.5L-0.5 1M0.5 -1L2.5 1.5L0.5 4', // jera
    'M0 -4V4M0 -4L2 -2.5M0 4L-2 2.5', // eihwaz
    'M0 -4V4M0 -1L-2.5 -4M0 -1L2.5 -4', // algiz
    'M1.5 -4L-1.5 -1L1.5 1L-1.5 4', // sowilo
    'M0 -4V4M-2.5 -1.5L0 -4L2.5 -1.5', // tiwaz
    'M-1.5 4V-4L1.5 -2L-1.5 0L1.5 2L-1.5 4', // berkanan
    'M-2 4V-4L0 -1L2 -4V4', // ehwaz
    'M-2 4V-4L2 0M2 4V-4L-2 0', // mannaz
    'M-1 4V-4L2 -1.5', // laguz
    'M0 -4L2.5 0L0 4L-2.5 0Z', // ingwaz
    'M-2.5 -4V4L2.5 -4V4Z', // dagaz
    'M-2.5 4L2 -1L0 -4L-2 -1L2.5 4', // othala
  ];
  const RUNES = GLYPHS.map((d, i) => ({ a: (i / GLYPHS.length) * 360, d }));
  const TICKS = Array.from({ length: 72 }, (_, i) => ({ a: i * 5, long: i % 6 === 0 }));

  // The pentagram, as one line in drawing order (every second point), so it
  // draws itself in a single stroke. Its points touch a circle of radius R;
  // the pentagon inside has an inradius of R·cos 72°.
  const R = 65;
  const point = (k: number, r = R) => {
    const t = ((k * 72 - 90) * Math.PI) / 180;
    return [r * Math.cos(t), r * Math.sin(t)];
  };
  const STAR = [0, 2, 4, 1, 3]
    .map((k) => point(k).map((v) => v.toFixed(2)).join(','))
    .join(' ');
  const POINTS = [0, 1, 2, 3, 4].map((k) => point(k));
  const HEART = R * Math.cos((72 * Math.PI) / 180);
  // Five smaller runes sit in the bays between the star's arms.
  const SIGILS = [7, 11, 17, 12, 1].map((g, k) => ({ a: k * 72 + 36, d: GLYPHS[g] }));
</script>

{#snippet outer()}
  <circle r="97" class="draw" pathLength="100" />
  <circle r="93.5" class="draw thin" pathLength="100" />
  {#each TICKS as t (t.a)}
    <line y1="-93.5" y2={t.long ? -88 : -91} transform="rotate({t.a})" class="tick" />
  {/each}
{/snippet}

{#snippet band()}
  <circle r="85" class="draw thin" pathLength="100" />
  <circle r="69" class="draw thin" pathLength="100" />
  {#each RUNES as r (r.a)}
    <path d={r.d} transform="rotate({r.a}) translate(0 -77) scale(1.1)" class="rune" />
    <g transform="rotate({r.a + 180 / RUNES.length})">
      <circle cy="-78.6" r="0.55" class="dot" />
      <circle cy="-75.4" r="0.55" class="dot" />
    </g>
  {/each}
{/snippet}

{#snippet star()}
  <circle r={R} class="draw thin" pathLength="100" />
  <polygon points={STAR} class="draw pent" pathLength="100" />
  <circle r={HEART - 1.5} class="draw thin" pathLength="100" />
  {#each POINTS as [x, y], k (k)}
    <circle cx={x} cy={y} r="1.6" class="dot" />
  {/each}
  {#each SIGILS as s (s.a)}
    <path d={s.d} transform="rotate({s.a}) translate(0 -46)" class="rune" />
  {/each}
{/snippet}

<div class="arcane {state}" aria-hidden="true" style:--size={size} style:color={color} style:opacity={strength}>
  <svg class="ring outer" viewBox="-100 -100 200 200">
    <g class="glow">{@render outer()}</g>
    <g>{@render outer()}</g>
  </svg>
  <svg class="ring band" viewBox="-100 -100 200 200">
    <g class="glow">{@render band()}</g>
    <g>{@render band()}</g>
  </svg>
  <svg class="ring star" viewBox="-100 -100 200 200">
    <g class="glow">{@render star()}</g>
    <g>{@render star()}</g>
  </svg>
</div>

<style>
  .arcane {
    position: absolute;
    inset: 0;
    margin: auto;
    /* The stage is a size container (see QuestionView). */
    width: var(--size, min(92cqw, 92cqh, 420px));
    height: var(--size, min(92cqw, 92cqh, 420px));
    pointer-events: none;
    opacity: 0.22;
    color: #d9a45a;
    transition:
      opacity 0.8s,
      color 0.8s;
  }
  .arcane.good {
    opacity: 0.3;
    color: #d8dfa0;
  }
  .arcane.bad {
    opacity: 0.16;
    color: #d98a6e;
  }
  .ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    will-change: transform;
  }
  .outer {
    animation: turn 90s linear infinite;
  }
  .band {
    animation: turn 60s linear infinite reverse;
  }
  .star {
    animation: turn 150s linear infinite;
  }
  circle,
  polygon,
  .tick,
  .rune {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.9;
    stroke-linecap: round;
  }
  .thin {
    stroke-width: 0.55;
  }
  .tick {
    stroke-width: 0.5;
  }
  .rune {
    stroke-width: 0.75;
    stroke-linejoin: round;
  }
  .pent {
    stroke-width: 0.8;
    stroke-linejoin: miter;
  }
  .dot {
    fill: currentColor;
    stroke: none;
  }
  /* The glow: the same strokes, wide and faint, underneath. */
  .glow {
    opacity: 0.22;
  }
  .glow :global(*) {
    stroke-width: 3.2;
  }
  .draw {
    stroke-dasharray: 100;
    animation: draw 1.6s var(--ease-out) both;
  }
  .star .draw {
    animation-delay: 0.25s;
  }
  .band .draw {
    animation-delay: 0.5s;
  }
  /* The runes and dots are carved once the rings are down. */
  .rune,
  .dot {
    animation: carve 0.9s 1.1s var(--ease-out) both;
  }
  @keyframes carve {
    from {
      opacity: 0;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
</style>
