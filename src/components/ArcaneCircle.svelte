<script lang="ts">
  // A rune circle that draws itself behind the item art and turns slowly:
  // a ring of runes one way and a heptagram with a rune seal at each point
  // the other. `state` colours it at the reveal.
  //
  // Each layer is turned as a whole, so the browser can spin it on the
  // compositor without repainting; the glow is a soft, wide copy of the
  // strokes underneath rather than a filter (which would repaint).
  // `size`, `color` and `strength` (opacity) override the stage defaults for
  // other places, like behind the winner on the victory screen.
  let {
    state = 'idle',
    size,
    color,
    strength,
  }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  // Elder Futhark runes, drawn on a small grid (x ±2.5, y ±4).
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

  const f = (v: number) => v.toFixed(2);
  /** The point at `a` degrees clockwise from the top, `r` from the centre. */
  const at = (a: number, r: number) => {
    const t = (a * Math.PI) / 180;
    return [r * Math.sin(t), -r * Math.cos(t)];
  };
  /** A circle of radius `r`, broken by a `gap` wide at each of `angles`. */
  const broken = (r: number, angles: number[], gap: number) => {
    const g = (gap / 2 / r) * (180 / Math.PI);
    return angles
      .map((a, i) => {
        const [x0, y0] = at(a + g, r);
        const [x1, y1] = at((angles[i + 1] ?? angles[0] + 360) - g, r);
        return `M${f(x0)} ${f(y0)}A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}`;
      })
      .join('');
  };

  // The outer ring: one rune in every break.
  const RING = 90;
  const RUNES = Array.from({ length: 21 }, (_, i) => ({ a: (i / 21) * 360, d: GLYPHS[i % GLYPHS.length] }));
  const RING_PATH = broken(
    RING,
    RUNES.map((r) => r.a),
    10,
  );

  // The heptagram {7/3}: each line joins a point to the third one on, in
  // drawing order so it traces itself in one go. Every point is a small
  // seal with its own rune, and the lines stop at its edge.
  const R = 74;
  const SEAL = 7;
  const SEALS = [2, 5, 9, 10, 12, 15, 17].map((g, k) => {
    const a = (k / 7) * 360;
    const [x, y] = at(a, R);
    return { a, x, y, d: GLYPHS[g] };
  });
  const STAR = Array.from({ length: 7 }, (_, i) => {
    const p = SEALS[(i * 3) % 7];
    const q = SEALS[(i * 3 + 3) % 7];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const [ux, uy] = [(q.x - p.x) / len, (q.y - p.y) / len];
    const cut = SEAL + 1;
    return `M${f(p.x + ux * cut)} ${f(p.y + uy * cut)}L${f(q.x - ux * cut)} ${f(q.y - uy * cut)}`;
  }).join('');
  const STAR_RING = broken(
    R,
    SEALS.map((s) => s.a),
    SEAL * 2 + 2,
  );
</script>

{#snippet ring()}
  <path d={RING_PATH} class="draw thin" pathLength="100" />
  {#each RUNES as r (r.a)}
    <path d={r.d} transform="rotate({r.a}) translate(0 -{RING})" class="rune" />
  {/each}
{/snippet}

{#snippet star()}
  <path d={STAR_RING} class="draw thin" pathLength="100" />
  <path d={STAR} class="draw line" pathLength="100" />
  {#each SEALS as s (s.a)}
    <circle cx={f(s.x)} cy={f(s.y)} r={SEAL} class="draw thin" pathLength="100" />
    <path d={s.d} transform="translate({f(s.x)} {f(s.y)}) rotate({s.a}) scale(0.95)" class="rune" />
  {/each}
{/snippet}

<div class="arcane {state}" aria-hidden="true" style:--size={size} style:color={color} style:opacity={strength}>
  <div class="layer ring">
    <svg class="glow" viewBox="-100 -100 200 200">{@render ring()}</svg>
    <svg viewBox="-100 -100 200 200">{@render ring()}</svg>
  </div>
  <div class="layer star">
    <svg class="glow" viewBox="-100 -100 200 200">{@render star()}</svg>
    <svg viewBox="-100 -100 200 200">{@render star()}</svg>
  </div>
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
  .layer,
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .layer {
    will-change: transform;
  }
  .ring {
    animation: turn 120s linear infinite;
  }
  .star {
    animation: turn 80s linear infinite reverse;
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .line {
    stroke-width: 0.9;
  }
  .rune {
    stroke-width: 0.75;
  }
  /* The glow: the same strokes, wide and faint, on their own layer so it
     can breathe without repainting. */
  .glow {
    opacity: 0.22;
    animation: breathe 6s ease-in-out infinite alternate;
  }
  .glow :global(*) {
    stroke-width: 3.2;
  }
  .draw {
    stroke-dasharray: 100;
    animation: draw 1.8s var(--ease-out) both;
  }
  .star .draw {
    animation-delay: 0.3s;
  }
  /* The runes are carved once the lines are down. */
  .rune {
    animation: carve 0.9s 1.2s var(--ease-out) both;
  }
  @keyframes breathe {
    from {
      opacity: 0.14;
    }
    to {
      opacity: 0.34;
    }
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
