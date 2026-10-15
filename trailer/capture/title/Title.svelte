<script lang="ts">
  // The trailer's title card, in phases the capture calls (window.__phase):
  // 1 "PoE2.Quest presents" comes up out of the dark; 2 the arcane circle
  // draws itself behind it; 3 the line rises and Delve is written in.
  import ArcaneCircle from '../../../src/components/ArcaneCircle.svelte';

  let phase = $state(0);
  // A dither over everything: half the pixels a level lighter, at random, so the soft glows under it
  // (the circle's, the pool behind the words) can't settle into bands in 8 bits.
  function dither(c: HTMLCanvasElement) {
    c.width = innerWidth; c.height = innerHeight;
    const g = c.getContext('2d')!, im = g.createImageData(c.width, c.height);
    for (let i = 0; i < im.data.length; i += 4) {
      im.data[i] = im.data[i + 1] = im.data[i + 2] = 255;
      im.data[i + 3] = Math.random() < 0.5 ? 3 : 0;
    }
    g.putImageData(im, 0, 0);
  }
  (window as unknown as { __phase: (n: number) => void }).__phase = (n) => (phase = n);
</script>

<div class="stage">
  {#if phase >= 2}
    <div class="circle"><ArcaneCircle size="640px" strength={0.46} color="#e2bd78" /></div>
  {/if}
  <!-- the words, one layer (the capture hides it for the backdrop pass: html.clean .layer-fg) -->
  <div class="layer-fg">
    <div class="shade" class:on={phase >= 1} class:wide={phase >= 3}></div>
    <div class="presents" class:on={phase >= 1} class:up={phase >= 3}>
      <span class="name">PoE2.Quest</span>
      <span class="by">presents</span>
    </div>
    <h1 class="title" class:on={phase >= 3}>Delve</h1>
    <div class="rule" class:on={phase >= 3}></div>
  </div>
  <canvas class="dither" use:dither></canvas>
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    overflow: hidden;
    /* Flat: the warm glow behind the card is added by the compositor in floating point and dithered
       on output (a soft glow this wide in 8 bits steps through too few levels: CLAUDE.md, "No banding"). */
    background: #0a0908;
  }
  .circle {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    width: 640px;
    height: 640px;
  }
  /* A dark pool behind the words, so the circle's lines don't run through them. */
  .shade {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 360px;
    height: 150px;
    translate: -50% -50%;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(10, 9, 8, 0.92), rgba(10, 9, 8, 0.6) 55%, rgba(10, 9, 8, 0)), var(--dither);
    image-rendering: pixelated;
    opacity: 0;
    transition:
      opacity 1s,
      width 1.1s cubic-bezier(0.6, 0, 0.2, 1),
      height 1.1s cubic-bezier(0.6, 0, 0.2, 1),
      top 1.1s cubic-bezier(0.6, 0, 0.2, 1);
  }
  .shade.on {
    opacity: 1;
  }
  .shade.wide {
    width: 680px;
    height: 400px;
    top: 44%;
  }
  .presents {
    position: absolute;
    left: 50%;
    top: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    translate: -50% -50%;
    opacity: 0;
    filter: blur(8px);
    transform: translateY(10px);
    transition:
      opacity 1.3s ease-out,
      filter 1.3s ease-out,
      transform 1.6s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .presents.on {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
  .presents.up {
    transform: translateY(-122px) scale(0.78);
    transition: transform 1.1s cubic-bezier(0.6, 0, 0.2, 1);
  }
  .name {
    font-family: var(--font-title);
    font-size: 40px;
    letter-spacing: 0.06em;
    color: var(--gold-hi);
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.25);
  }
  .by {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 23px;
    letter-spacing: 0.12em;
    color: #c8b08a;
  }
  .title {
    position: absolute;
    left: 50%;
    top: 50%;
    margin: 0;
    translate: -50% -46%;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 176px;
    line-height: 1;
    letter-spacing: 0.22em;
    background: linear-gradient(180deg, #fbecc6 0%, #e8c784 48%, #a87d3e 100%);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 22px rgba(241, 210, 140, 0.3));
    /* the wipe's mask reaches well past the word, so its glow isn't cut off at the edges */
    clip-path: inset(-30% 115% -30% -15%);
    opacity: 0;
    transition:
      clip-path 1.5s cubic-bezier(0.3, 0.6, 0.2, 1) 0.25s,
      letter-spacing 2.2s cubic-bezier(0.2, 0.7, 0.2, 1) 0.25s,
      opacity 0.6s ease-out 0.25s;
  }
  .title.on {
    clip-path: inset(-30% -15% -30% -15%);
    letter-spacing: 0.04em;
    opacity: 1;
  }
  .rule {
    position: absolute;
    left: 50%;
    top: calc(50% + 112px);
    width: 460px;
    height: 1px;
    translate: -50% 0;
    background: linear-gradient(90deg, transparent, var(--gold) 20%, var(--gold-hi) 50%, var(--gold) 80%, transparent);
    transform: scaleX(0);
    transition: transform 1.4s cubic-bezier(0.3, 0.6, 0.2, 1) 0.9s;
  }
  .layer-fg {
    position: absolute;
    inset: 0;
  }
  .dither {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    image-rendering: pixelated;
  }
  .rule.on {
    transform: scaleX(1);
  }
</style>
