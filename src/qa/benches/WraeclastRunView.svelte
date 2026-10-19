<script lang="ts">
  // The Wraeclast screens bench's view (./wraeclastRun.ts): a real run
  // (rules.ts), seeded, played to the screen the controls ask for along the
  // route asked for (./wraeclastSetup.ts: each item opened on a plain grid of
  // patches and answered, now and then after a miss; the loot collected),
  // then that screen as the page draws it, the run's header and strip above
  // it. A change to the controls plays it again. The end screen's log is this
  // run's alone, and its New run goes back to the camp.
  import '../../wraeclast/screens.css';
  import { Run, SUPPLIES, gridAdjacency, type Supply } from '../../wraeclast/rules';
  import Hud from '../../wraeclast/Hud.svelte';
  import Vendor from '../../wraeclast/Vendor.svelte';
  import MapScreen from '../../wraeclast/MapScreen.svelte';
  import Threshold from '../../wraeclast/Threshold.svelte';
  import ItemScreen from '../../wraeclast/ItemScreen.svelte';
  import Loot from '../../wraeclast/Loot.svelte';
  import End from '../../wraeclast/End.svelte';
  import TuningPanel from '../../wraeclast/TuningPanel.svelte';
  import type { PieceProps } from '../bench.ts';
  import { playOn, type Route } from './wraeclastSetup.ts';

  let { v, set, small }: PieceProps = $props();

  /** A plain object made deeply reactive, for the screens to follow (as play.svelte.ts does). */
  function reactive<T extends object>(value: T): T {
    const proxied = $state(value);
    return proxied;
  }

  type Options = { screen: string; seed: number; route: Route; stocked: boolean; misses: boolean };

  /** The run, played on its plain state to the screen asked for; reactive only once it's there. */
  function build(o: Options) {
    const run = new Run({ seed: o.seed, now: () => 0 });
    const s = run.state;
    const stock: Supply[] = ['flare', 'wisdom', 'lengths'];
    if (o.stocked) for (const ware of stock) run.buy(s.stock.indexOf(ware));
    const go = (stop: () => boolean, route: Route = o.route) => playOn(run, stop, { route, misses: o.misses });
    const kind = () => s.places[s.at].kind;
    switch (o.screen) {
      case 'map':
        go(() => s.phase === 'map');
        break;
      case 'mapLater':
        go(() => s.phase === 'map' && run.node.step >= 6);
        break;
      case 'zone':
        go(() => s.phase === 'zone' && kind() === 'zone' && !run.hiddenHere());
        break;
      case 'corrupted':
        go(() => s.phase === 'zone' && !!run.hiddenHere(), 'corrupt');
        break;
      case 'well':
        go(() => s.phase === 'well');
        break;
      case 'loot':
        go(() => s.phase === 'loot' && !s.loot!.collected);
        break;
      case 'collected':
        go(() => s.phase === 'loot' && !s.loot!.collected);
        if (s.phase === 'loot') run.collect();
        break;
      case 'swap':
        // A pack of eight full stacks (no supply loot fits), till a supply card comes.
        go(() => s.phase === 'item');
        s.pack = SUPPLIES.map((supply) => ({ supply, n: 5 }));
        go(() => s.phase === 'loot' && !s.loot!.collected && s.loot!.cards.some((c) => c.kind === 'supply'));
        if (s.phase === 'loot') run.collect();
        break;
      case 'expedition':
        go(() => s.phase === 'vendor' && s.vendor?.at === 'expedition');
        break;
      case 'town':
        go(() => s.phase === 'vendor' && s.vendor?.at === 'town');
        break;
      case 'boss':
        go(() => s.phase === 'zone' && kind() === 'boss');
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

  const run = $derived(build({ screen: String(v.screen), seed: Number(v.seed), route: String(v.route) as Route, stocked: !!v.stocked, misses: !!v.misses }));
  const s = $derived(run.state);
</script>

<main class="wr bench" class:small>
  {#key run}
    {#if !small}<Hud {run} />{/if}
    {#if s.phase === 'vendor'}
      <Vendor {run} />
    {:else if s.phase === 'map'}
      <MapScreen {run} />
    {:else if s.phase === 'zone' || s.phase === 'well'}
      <Threshold {run} />
    {:else if s.phase === 'item' || s.phase === 'solved'}
      <ItemScreen {run} />
    {:else if s.phase === 'loot'}
      <Loot {run} />
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
