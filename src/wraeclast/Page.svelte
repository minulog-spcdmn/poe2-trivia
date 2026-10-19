<script lang="ts">
  // The Wraeclast run's page (wraeclast.html): the game's backdrop, the run's
  // header and strip (where, life, flask, gold, the step), the screen its
  // phase calls for (a vendor, the map, the boss's threshold, an item and its
  // reveal, the end), and the tuning panel (collapsed) at the foot. The whole
  // map opens over a vendor or a zone's last reveal (its Map key): the screen
  // under it is only set aside, so Back finds it as it was (the reveal's loot
  // landed, the vendor's table as dealt), and picking a place goes on from there.
  import { untrack } from 'svelte';
  import Background from '../components/Background.svelte';
  import { play } from './play.svelte';
  import Hud from './Hud.svelte';
  import Vendor from './Vendor.svelte';
  import MapScreen from './MapScreen.svelte';
  import Threshold from './Threshold.svelte';
  import ItemScreen from './ItemScreen.svelte';
  import End from './End.svelte';
  import TuningPanel from './TuningPanel.svelte';

  if (!play.run) play.start();
  const run = $derived(play.run!);
  const s = $derived(run.state);

  // After every item and as the run ends, its log is kept (for the end screen to copy): a reload loses nothing.
  $effect(() => {
    void s.log.items.length;
    void s.phase;
    untrack(() => play.keep());
  });

  // Each new screen starts at its top (phones scroll); a named item stays on its screen, for its reveal.
  /** The map, opened over a vendor or a reveal (closed again on any step). */
  let mapOpen = $state(false);
  const over = $derived(mapOpen && run.options().length > 0);
  const screen = $derived(`${s.seed}:${s.phase === 'solved' ? 'item' : s.phase}:${s.done}:${s.steps}`);
  $effect(() => {
    void s.steps;
    void s.phase;
    mapOpen = false;
  });
  $effect(() => {
    void screen;
    void over;
    scrollTo({ top: 0 });
  });
</script>

<Background />
<main id="app" class="wr">
  {#key run}
    <Hud {run} />
    {#key screen}
      {#if over}
        <MapScreen {run} onclose={() => (mapOpen = false)} />
      {/if}
      <div class="screen" class:away={over}>
        {#if s.phase === 'vendor'}
          <Vendor {run} onmap={() => (mapOpen = true)} />
        {:else if s.phase === 'map'}
          <MapScreen {run} />
        {:else if s.phase === 'boss'}
          <Threshold {run} />
        {:else if s.phase === 'item' || s.phase === 'solved'}
          <ItemScreen {run} onmap={() => (mapOpen = true)} />
        {:else}
          <End {run} />
        {/if}
      </div>
    {/key}
  {/key}
  <TuningPanel />
</main>

<style>
  /* The screen sits in the page's column as if unwrapped; set aside while the map is over it. */
  .screen {
    display: contents;
  }
  .screen.away {
    display: none;
  }
</style>
