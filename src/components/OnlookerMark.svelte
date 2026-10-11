<!-- A spectator's mark: where a player has a filled avatar in their colour, an
     onlooker has an empty ring round their initial. Watching, not yet in the
     party (they have no colour until they take a seat). -->
<script lang="ts">
  import { initialOf } from '../lib/names';

  let { name, size = 22 }: { name: string; size?: number } = $props();
  const initial = $derived(initialOf(name) || '?');
  // As in Avatar: A's wide base makes it look low when centred, so lift it.
  const dy = $derived(initial === 'A' ? '0.31em' : '0.35em');
</script>

<span class="onlooker" style:--s="{size}px" aria-hidden="true"
  ><svg viewBox="0 0 100 100"
    ><circle class="outer" cx="50" cy="50" r="47" /><circle class="inner" cx="50" cy="50" r="39" /><text
      x="50"
      y="50"
      {dy}
      text-anchor="middle">{initial}</text
    ></svg
  ></span
>

<style>
  .onlooker {
    flex: none;
    display: block;
    width: var(--s);
    height: var(--s);
    color: #b49563;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  circle {
    vector-effect: non-scaling-stroke;
    stroke: currentColor;
  }
  .outer {
    fill: #0f0b08;
    stroke-width: 1px;
    stroke-opacity: 0.75;
  }
  .inner {
    fill: none;
    stroke-width: 0.6px;
    stroke-opacity: 0.35;
  }
  text {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 44px;
    fill: currentColor;
  }
</style>
