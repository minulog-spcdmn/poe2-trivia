<script lang="ts">
  // The Wraeclast screens bench's view (./wraeclastRun.ts): a real run
  // (rules.ts), seeded, played to the screen the controls ask for (each item
  // answered, now and then after a miss), then that screen as the page draws
  // it, the run's bar above it. A change to the controls plays it again. The
  // end screen's log is this run's alone, and its New run goes back to the
  // camp.
  import '../../wraeclast/screens.css';
  import { ITEMS_IN_RUN, Run, TOWN_AFTER, ZONES, ZONE_ITEMS, type Supply } from '../../wraeclast/rules';
  import Hud from '../../wraeclast/Hud.svelte';
  import Vendor from '../../wraeclast/Vendor.svelte';
  import Deal from '../../wraeclast/Deal.svelte';
  import ItemScreen from '../../wraeclast/ItemScreen.svelte';
  import Between from '../../wraeclast/Between.svelte';
  import End from '../../wraeclast/End.svelte';
  import TuningPanel from '../../wraeclast/TuningPanel.svelte';
  import type { PieceProps } from '../bench.ts';

  let { v, set, small }: PieceProps = $props();

  const STOCK: Supply[] = ['flare', 'flare', 'wisdom', 'strike'];
  const BOSS_AT = ZONES * ZONE_ITEMS;

  /** A plain object made deeply reactive, for the screens to follow (as play.svelte.ts does). */
  function reactive<T extends object>(value: T): T {
    const proxied = $state(value);
    return proxied;
  }

  /** The run, played on its plain state to the screen asked for; reactive only once it's there. */
  function build(o: { screen: string; seed: number; stocked: boolean; misses: boolean }) {
    const run = new Run({ seed: o.seed, now: () => 0 });
    const s = run.state;
    if (o.stocked) for (const sup of STOCK) run.buy(sup);
    /** The open item answered: wrong first now and then, at once when the run is to be won without a miss. */
    const answer = () => {
      run.open(null);
      const it = s.item!;
      const words = it.names.find((nm) => nm.id === it.itemId)!.words.flat();
      if (o.misses && it.n % 4 === 0 && it.boss === null) {
        it.build = [...words, words[0]];
        run.submit();
      }
      it.build = words;
      run.submit();
    };
    /** A miss after a miss on the open item, till the run is lost. */
    const lose = () => {
      run.open(null);
      const it = s.item!;
      const words = it.names.find((nm) => nm.id === it.itemId)!.words.flat();
      while (s.phase === 'item') {
        it.build = [...words, ...Array<string>(it.misses + 1).fill(words[0])];
        run.submit();
      }
    };
    /** Plays on until `stop` holds (or the run ends). */
    const until = (stop: () => boolean) => {
      for (let guard = 0; guard < 200 && !stop() && s.phase !== 'end'; guard++) {
        if (s.phase === 'camp' || s.phase === 'town') {
          // A drink on leaving the camp, so the first items heal what a miss cost.
          if (s.phase === 'camp' && o.misses) run.drink();
          run.leave();
        }
        else if (s.phase === 'deal') run.pick(0);
        else if (s.phase === 'item') answer();
        else run.next();
      }
    };
    if (o.screen === 'deal') until(() => s.phase === 'deal' && s.done === 1);
    if (o.screen === 'between') until(() => s.phase === 'between' && s.done === 1);
    if (o.screen === 'beforeTown') until(() => s.phase === 'between' && s.done === TOWN_AFTER);
    if (o.screen === 'town') until(() => s.phase === 'town');
    if (o.screen === 'boss') until(() => s.phase === 'deal' && s.done === BOSS_AT);
    if (o.screen === 'beforeBoss') until(() => s.phase === 'between' && s.done === BOSS_AT);
    if (o.screen === 'won') until(() => s.done === ITEMS_IN_RUN);
    if (o.screen === 'lost') {
      until(() => s.phase === 'item' && s.done === 2);
      lose();
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
    {#if s.phase === 'camp' || s.phase === 'town'}
      <Vendor {run} />
    {:else if s.phase === 'deal'}
      <Deal {run} />
    {:else if s.phase === 'item'}
      <ItemScreen {run} />
    {:else if s.phase === 'between'}
      <Between {run} />
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
