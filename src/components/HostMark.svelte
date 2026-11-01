<!-- The host's mark on their chip: a hanging banner, the party's standard,
     where everyone else has their ×. Not the diamond: that means "you
     are here" and nothing else. -->
<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { calm } from '../lib/motion.svelte';

  /** `unfurl`: when the mark comes to a chip already there (the host changed), it unrolls from its pole down, as a banner hung. */
  let { unfurl = false }: { unfurl?: boolean } = $props();
  const hang = (_node: Element) => calm({ duration: unfurl ? 320 : 0, easing: cubicOut, css: (t: number) => `opacity: ${Math.min(1, t * 2)}; transform: scaleY(${0.3 + 0.7 * t});` });
</script>

<span class="host" in:hang role="img" aria-label="Host" title="Host"
  ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 3.5h15" /><path d="M7 3.5V19l5-3.4 5 3.4V3.5" /><path d="M12 7.2l1.6 1.6-1.6 1.6-1.6-1.6z" /></svg
  ></span
>

<style>
  .host {
    flex: none;
    display: grid;
    place-items: center;
    margin: 0 0.2rem 0 0.3rem;
    color: #d8b56e;
    filter: drop-shadow(0 0 5px rgba(241, 217, 155, 0.45));
    /* (Unfurling from its pole.) */
    transform-origin: 50% 15%;
  }
  svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
