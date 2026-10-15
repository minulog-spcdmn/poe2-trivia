<script lang="ts">
  // The revive's glyph: a heart of the phial's rose light, set in gold, a
  // cross of pale light in it, in a glory of fine rays (in a 24 unit box
  // round its centre). The scoreboard's revive button beats it; the end
  // screen marks a life given, and one brought back, with it. It fills its box.
  const id = $props.id();
  const RAYS = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r1 = i % 2 ? 10.1 : 11.3;
    return `M${(Math.sin(a) * 8.6).toFixed(2)} ${(-Math.cos(a) * 8.6).toFixed(2)}L${(Math.sin(a) * r1).toFixed(2)} ${(-Math.cos(a) * r1).toFixed(2)}`;
  });
</script>

<svg class="heart-of-light" viewBox="-12 -12 24 24" aria-hidden="true">
  <defs>
    <radialGradient {id} cx="0.45" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#ffe4cf" />
      <stop offset="0.3" stop-color="#ff8a68" />
      <stop offset="0.62" stop-color="#ec3a48" />
      <stop offset="1" stop-color="#6e0820" />
    </radialGradient>
  </defs>
  <g class="rays">
    {#each RAYS as d (d)}<path {d} />{/each}
  </g>
  <path class="body" fill="url(#{id})" d="M0 6.6C0 6.6-6.9 2.2-6.9-2.5C-6.9-4.9-5.2-6.4-3.2-6.4C-1.8-6.4-0.6-5.6 0-4.4C0.6-5.6 1.8-6.4 3.2-6.4C5.2-6.4 6.9-4.9 6.9-2.5C6.9 2.2 0 6.6 0 6.6Z" />
  <path class="hair" d="M0 4.9C0 4.9-5.3 1.5-5.3-2.3C-5.3-4-4.1-5-2.8-5C-1.6-5-0.6-4.2 0-3.1C0.6-4.2 1.6-5 2.8-5C4.1-5 5.3-4 5.3-2.3C5.3 1.5 0 4.9 0 4.9Z" />
  <path class="cross" d="M0-3.6V1.8M-2.7-0.9H2.7" />
</svg>

<style>
  .heart-of-light {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    filter: drop-shadow(0 0 2px rgba(255, 110, 90, 0.65));
  }
  .rays path {
    stroke: #e9c983;
    stroke-width: 0.6;
    stroke-linecap: butt;
    opacity: 0.7;
  }
  .body {
    stroke: #e9c983;
    stroke-width: 0.9;
    stroke-linejoin: miter;
  }
  .hair {
    fill: none;
    stroke: rgba(255, 236, 214, 0.45);
    stroke-width: 0.4;
  }
  .cross {
    fill: none;
    stroke: #fff6ea;
    stroke-width: 1.5;
    stroke-linecap: butt;
    filter: drop-shadow(0 0 1px rgba(110, 8, 32, 0.9));
  }
</style>
