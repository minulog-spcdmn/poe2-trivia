<!-- A verdict's sign: a lit disc rimmed in the verdict's colour, its ✓, ✕ or
     clock drawn in light, drawing itself as it lands (a clock's hands and a
     cross's second stroke after the first). The reveal's verdict chip wears it
     beside its word (QuestionView); a wrong answer's face-down token on the
     scoreboard is the ✕ grown to cover the avatar (Avatar's wrong, token): opaque,
     so the letter under it is hidden, lit from its middle, its rim and glow
     grown with it. The parent sizes it and sets the colour: --v-icon and
     --v-tint, from app.css's --verdict-* tokens; and, if it lands later than
     the chip does, when it draws: --draw-at (Avatar, as the token turns over). -->
<script lang="ts">
  let { icon, token = false }: { icon: 'check' | 'cross' | 'clock'; token?: boolean } = $props();
</script>

<span class="sign" class:token aria-hidden="true"
  ><svg viewBox="0 0 20 20">
    {#if icon === 'check'}
      <path pathLength="1" d="M5.6 10.4l3 3 5.8-6.6" />
    {:else if icon === 'cross'}
      <path pathLength="1" d="M6.6 6.6l6.8 6.8" />
      <path pathLength="1" d="M13.4 6.6l-6.8 6.8" />
    {:else}
      <path pathLength="1" d="M10 4.4a5.6 5.6 0 1 1 0 11.2a5.6 5.6 0 1 1 0-11.2" />
      <path pathLength="1" d="M10 7v3.2l2.1 1.5" />
    {/if}
  </svg></span
>

<style>
  .sign {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--v-icon);
    border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, rgba(var(--v-tint), 0.45), rgba(var(--v-tint), 0.12) 70%), rgba(0, 0, 0, 0.5);
    /* The rim drawn inside (not a border), so the sign is sized by the whole disc. */
    box-shadow:
      inset 0 0 0 1px rgba(var(--v-tint), 0.75),
      inset 0 2px 0 rgba(255, 255, 255, 0.15),
      0 0 8px rgba(var(--v-tint), 0.45);
  }
  .token {
    background: radial-gradient(circle, rgba(var(--v-tint), 0.4), rgba(var(--v-tint), 0.1) 70%), #140f0b;
    box-shadow:
      inset 0 0 0 1.5px rgba(var(--v-tint), 0.75),
      0 0 12px rgba(var(--v-tint), 0.4);
  }
  /* The sign a quarter of the disc across, its line in step with its size. */
  svg {
    width: 72.4%;
    height: 72.4%;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 2px rgba(var(--v-tint), 0.8));
  }
  .token svg {
    filter: drop-shadow(0 0 4px rgba(var(--v-tint), 0.8));
  }
  /* Held back until it draws (with motion reduced, app.css's own rule cuts it short). */
  path {
    stroke-dasharray: 1;
    animation: draw 0.35s var(--ease-out) var(--draw-at, 0.22s) backwards;
  }
  path + path {
    animation-delay: calc(var(--draw-at, 0.22s) + 0.18s);
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
  }
</style>
