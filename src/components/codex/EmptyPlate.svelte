<script lang="ts">
  // An empty page of the Codex (nothing met yet, no run below): its few
  // lines and its button over a dim rune circle, summoned as the page
  // opens, so the first view isn't bare text. Hollow (no eye under the
  // words), and fading out toward its band, so it stays behind them and
  // clear of the medallion above.
  import type { Snippet } from 'svelte';
  import type { Circle } from '../circles';

  let { circle: C, children }: { circle: Circle; children: Snippet } = $props();
</script>

<div class="plated">
  <div class="plate" aria-hidden="true"><C size="100%" strength={0.2} hollow /></div>
  {@render children()}
</div>

<style>
  .plated {
    position: relative;
    isolation: isolate;
    /* Room round the words for the circle to show. */
    padding: 2.2rem 0 1.6rem;
  }
  .plate {
    position: absolute;
    z-index: -1;
    left: 50%;
    top: 50%;
    width: min(440px, 100%);
    aspect-ratio: 1;
    translate: -50% -50%;
    pointer-events: none;
    mask: radial-gradient(closest-side, #000 52%, transparent 96%);
  }
</style>
