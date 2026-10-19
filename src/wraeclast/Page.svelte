<script lang="ts">
  // The Wraeclast run's page (wraeclast.html): the game's backdrop, the run's
  // header and strip (where, life, gold), the screen its phase calls for (a
  // town's boon draft or shop, the map, an item and its reveal, the end), the duel's two lines at
  // the foot, and the tuning panel (collapsed) under them.
  import { untrack } from 'svelte';
  import Background from '../components/Background.svelte';
  import { play } from './play.svelte';
  import Hud from './Hud.svelte';
  import Vendor from './Vendor.svelte';
  import MapScreen from './MapScreen.svelte';
  import ItemScreen from './ItemScreen.svelte';
  import End from './End.svelte';
  import Footer from './Footer.svelte';
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
  const screen = $derived(`${s.seed}:${s.phase === 'solved' ? 'item' : s.phase}:${s.done}:${s.log.route.length}`);
  $effect(() => {
    void screen;
    scrollTo({ top: 0 });
  });
</script>

<Background />
<main id="app" class="wr">
  {#key run}
    <Hud {run} />
    {#key screen}
      {#if s.phase === 'vendor' || s.phase === 'draft'}
        <Vendor {run} />
      {:else if s.phase === 'map'}
        <MapScreen {run} />
      {:else if s.phase === 'item' || s.phase === 'solved'}
        <ItemScreen {run} />
      {:else}
        <End {run} />
      {/if}
    {/key}
    <Footer {run} />
  {/key}
  <TuningPanel />
</main>
