<script lang="ts">
  // The Wraeclast run's page (wraeclast.html): the game's backdrop, the run's
  // bar (life, flask, gold, pack, where), the screen its phase calls for, and
  // the tuning panel (collapsed) at the foot.
  import Background from '../components/Background.svelte';
  import { play } from './play.svelte';
  import Hud from './Hud.svelte';
  import Vendor from './Vendor.svelte';
  import Deal from './Deal.svelte';
  import ItemScreen from './ItemScreen.svelte';
  import Between from './Between.svelte';
  import End from './End.svelte';
  import TuningPanel from './TuningPanel.svelte';

  if (!play.run) play.start();
  const run = $derived(play.run!);
  const s = $derived(run.state);

  // A run ends: its log is kept, for the end screen to copy.
  $effect(() => {
    if (s.phase === 'end') play.keep();
  });

  // Each new screen starts at its top (phones scroll).
  const screen = $derived(`${s.seed}:${s.phase}:${s.done}`);
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
      {#if s.phase === 'camp' || s.phase === 'town'}
        <Vendor {run} />
      {:else if s.phase === 'deal'}
        <Deal {run} />
      {:else if s.phase === 'item'}
        <ItemScreen {run} />
      {:else if s.phase === 'between'}
        <Between {run} />
      {:else}
        <End {run} />
      {/if}
    {/key}
  {/key}
  <TuningPanel />
</main>
