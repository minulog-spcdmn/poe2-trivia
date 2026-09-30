<script lang="ts">
  // A rune circle that draws itself behind the item art and turns slowly:
  // two rings of ticks and rune marks turning opposite ways around a
  // hexagram. `state` colours it at the reveal.
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

  // Rune marks: a few short strokes each, from a fixed seed so every circle
  // carries the same inscription.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const RUNES = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * 360;
    const strokes = 2 + Math.floor(rnd() * 2);
    let d = '';
    for (let k = 0; k < strokes; k++) {
      const x0 = -3 + rnd() * 6;
      const y0 = -4 + rnd() * 2;
      const x1 = -3 + rnd() * 6;
      const y1 = 2 + rnd() * 2;
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return { a, d };
  });
  const TICKS = Array.from({ length: 72 }, (_, i) => ({ a: i * 5, long: i % 6 === 0 }));

  // Hexagram points.
  const tri = (r: number, off: number) =>
    [0, 1, 2]
      .map((k) => {
        const t = ((k * 120 + off - 90) * Math.PI) / 180;
        return `${(r * Math.cos(t)).toFixed(2)},${(r * Math.sin(t)).toFixed(2)}`;
      })
      .join(' ');
</script>

{#snippet outer()}
  <circle r="96" class="draw" pathLength="100" />
  <circle r="88" class="draw thin" pathLength="100" />
  {#each TICKS as t (t.a)}
    <line y1={t.long ? -96 : -95} y2={t.long ? -89 : -92} transform="rotate({t.a})" class="tick" />
  {/each}
{/snippet}

{#snippet inner()}
  {#each RUNES as r (r.a)}
    <path d={r.d} transform="rotate({r.a}) translate(0 -79)" class="rune" />
  {/each}
  <circle r="71" class="draw thin" pathLength="100" />
  <polygon points={tri(70, 0)} class="draw thin" pathLength="100" />
  <polygon points={tri(70, 180)} class="draw thin" pathLength="100" />
  <circle r="35" class="draw thin" pathLength="100" />
{/snippet}

<div class="arcane {state}" aria-hidden="true" style:--size={size} style:color={color} style:opacity={strength}>
  <svg class="ring outer" viewBox="-100 -100 200 200">
    <g class="glow">{@render outer()}</g>
    <g>{@render outer()}</g>
  </svg>
  <svg class="ring inner" viewBox="-100 -100 200 200">
    <g class="glow">{@render inner()}</g>
    <g>{@render inner()}</g>
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
  .inner {
    animation: turn 60s linear infinite reverse;
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
    stroke-width: 0.8;
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
  .inner .draw {
    animation-delay: 0.3s;
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
