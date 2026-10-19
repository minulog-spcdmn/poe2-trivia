<script lang="ts">
  // The Wraeclast screens bench's view (./wraeclastRun.ts): a real run
  // (rules.ts), seeded, played to the screen the controls ask for along the
  // leftmost path (./wraeclastSetup.ts: each item opened on a plain grid of
  // patches and answered, now and then after a miss), then that screen as
  // the page draws it, the run's header above it. A change to the controls
  // plays it again. The end screen's log is this
  // run's alone, and its New run goes back to the camp.
  import '../../wraeclast/screens.css';
  import { Run, gridAdjacency, type Supply } from '../../wraeclast/rules';
  import Hud from '../../wraeclast/Hud.svelte';
  import Vendor from '../../wraeclast/Vendor.svelte';
  import MapScreen from '../../wraeclast/MapScreen.svelte';
  import ItemScreen from '../../wraeclast/ItemScreen.svelte';
  import End from '../../wraeclast/End.svelte';
  import TuningPanel from '../../wraeclast/TuningPanel.svelte';
  import type { PieceProps } from '../bench.ts';
  import { playOn } from './wraeclastSetup.ts';

  let { v, set, small }: PieceProps = $props();

  /** A plain object made deeply reactive, for the screens to follow (as play.svelte.ts does). */
  function reactive<T extends object>(value: T): T {
    const proxied = $state(value);
    return proxied;
  }

  type Options = { screen: string; seed: number; stocked: boolean; misses: boolean };

  /** The run, played on its plain state to the screen asked for; reactive only once it's there. */
  function build(o: Options) {
    const run = new Run({ seed: o.seed, now: () => 0 });
    run.pass();
    const s = run.state;
    const stock: Supply[] = ['flare', 'wisdom', 'lore'];
    if (o.stocked) for (const ware of stock) run.buy(ware);
    const go = (stop: () => boolean) => playOn(run, stop, { misses: o.misses });
    const kind = () => s.places[s.at].kind;
    switch (o.screen) {
      case 'map':
        run.leave();
        break;
      case 'mapLater':
        go(() => s.phase === 'map' && s.spread >= 3);
        break;
      case 'zone':
        go(() => s.phase === 'item' && kind() === 'zone');
        break;
      case 'last':
        go(() => s.phase === 'solved' && kind() === 'zone');
        break;
      case 'town':
        go(() => s.phase === 'vendor' && s.vendor?.at === 'town');
        break;
      case 'boss':
        go(() => s.phase === 'item' && kind() === 'lair');
        break;
      case 'won':
        go(() => false);
        break;
      case 'lost': {
        go(() => s.phase === 'item' && s.done >= 2);
        const it = s.item;
        if (it) {
          if (it.openedAt === null) run.open(gridAdjacency(s.tuning.seeds));
          for (let k = 0; s.phase === 'item' && k < 40; k++) {
            it.build = [...it.decoys.slice(0, 1), ...Array<string>(k).fill(it.decoys[1] ?? it.answer[0])];
            it.lineMarks = null;
            run.submit();
          }
        }
        break;
      }
    }
    run.state = reactive(s);
    return run;
  }

  const run = $derived(build({ screen: String(v.screen), seed: Number(v.seed), stocked: !!v.stocked, misses: !!v.misses }));
  const s = $derived(run.state);
</script>

<main class="wr bench" class:small>
  {#key run}
    {#if !small}<Hud {run} />{/if}
    {#if s.phase === 'map'}
      <MapScreen {run} />
    {:else if s.phase === 'vendor'}
      <Vendor {run} />
    {:else if s.phase === 'item' || s.phase === 'solved'}
      <ItemScreen {run} />
    {:else}
      <End {run} runs={[s.log]} onnew={() => set({ screen: 'camp' })} />
    {/if}
  {/key}
  {#if v.tuning}<TuningPanel open />{/if}
</main>

<style>
  .bench {
    width: min(1120px, 100vw);
    box-sizing: border-box;
  }
  .bench.small {
    width: 380px;
    padding-inline: 8px;
  }
</style>
