<script lang="ts">
  // A mark for every stop of the walk, a gap between scenes; the stop shown
  // is ringed. Clicking a mark goes there.
  import type { Stop } from './walk.ts';

  let { stops, current, onpick }: { stops: Stop[]; current?: string; onpick: (id: string) => void } = $props();
</script>

<nav class="strip" aria-label="Every stop">
  {#each stops as s, i (s.id)}
    <button
      class="mark"
      class:now={s.id === current}
      class:first={i > 0 && stops[i - 1].scene !== s.scene}
      title="{s.scene.label} • {s.size}"
      aria-label="{s.scene.label}, {s.size}"
      aria-current={s.id === current ? 'true' : undefined}
      onclick={() => onpick(s.id)}
    ></button>
  {/each}
</nav>
