<script lang="ts">
  // The Wraeclast screens bench's view (./wraeclastRun.ts): a real run
  // (rules.ts), seeded, played to the screen the controls ask for (each item
  // opened on a plain grid of patches and answered, now and then after a
  // miss, a Vaal Orb used where one is held; the first loot card taken),
  // then that screen as the page draws it, the run's bar above it. A change
  // to the controls plays it again. The end screen's log is this run's
  // alone, and its New run goes back to the camp.
  import '../../wraeclast/screens.css';
  import { ITEMS_IN_RUN, Run, TOWN_AFTER, ZONES, ZONE_ITEMS, answerOf, gridAdjacency, type Ware } from '../../wraeclast/rules';
  import Hud from '../../wraeclast/Hud.svelte';
  import Vendor from '../../wraeclast/Vendor.svelte';
  import Travel from '../../wraeclast/Travel.svelte';
  import ItemScreen from '../../wraeclast/ItemScreen.svelte';
  import Loot from '../../wraeclast/Loot.svelte';
  import End from '../../wraeclast/End.svelte';
  import TuningPanel from '../../wraeclast/TuningPanel.svelte';
  import type { PieceProps } from '../bench.ts';

  let { v, set, small }: PieceProps = $props();

  const BOSS_AT = ZONES * ZONE_ITEMS;

  /** A plain object made deeply reactive, for the screens to follow (as play.svelte.ts does). */
  function reactive<T extends object>(value: T): T {
    const proxied = $state(value);
    return proxied;
  }

  type Options = { screen: string; seed: number; stocked: boolean; misses: boolean; vaal: boolean };

  /** The run, played on its plain state to the screen asked for; reactive only once it's there. */
  function build(o: Options) {
    const run = new Run({ seed: o.seed, now: () => 0 });
    const s = run.state;
    const stock: Ware[] = o.vaal ? ['vaal', 'flare', 'lengths', 'wisdom'] : ['flare', 'wisdom', 'lengths', 'strike'];
    if (o.stocked) for (const ware of stock) run.buy(s.stock.indexOf(ware));
    // A pack full of Flares (never used here), for a loot ware to swap in.
    if (o.screen === 'swap') s.pack = Array<Ware>(8).fill('flare');
    const open = () => s.item!.openedAt === null && run.open(gridAdjacency(s.tuning.seeds));
    /** The open item answered: wrong first now and then (a drink after), corrupted where an orb is held. */
    const answer = () => {
      open();
      const it = s.item!;
      const words = answerOf(it).words.flat();
      if (o.vaal) run.corrupt();
      if (o.misses && it.n % 4 === 0 && it.boss === null) {
        it.build = [...words, words[0]];
        run.submit();
        run.drink();
      }
      it.build = words;
      run.submit();
    };
    /** A miss after a miss on the open item, till the run is lost. */
    const lose = () => {
      open();
      const it = s.item!;
      const words = answerOf(it).words.flat();
      while (s.phase === 'item') {
        it.build = [...words, ...Array<string>(it.misses + 1).fill(words[0])];
        run.submit();
      }
    };
    /** The first loot card taken (a ware with the pack full left behind). */
    const loot = () => {
      if (s.loot!.taken === null) run.take(0);
      if (s.loot!.pending) run.keep(null);
      run.next();
    };
    /** Plays on until `stop` holds (or the run ends). */
    const until = (stop: () => boolean) => {
      for (let guard = 0; guard < 300 && !stop() && s.phase !== 'end'; guard++) {
        if (s.phase === 'camp' || s.phase === 'town') run.leave();
        else if (s.phase === 'travel') run.enter();
        else if (s.phase === 'item') answer();
        else if (s.phase === 'loot') loot();
        else run.next();
      }
    };
    const dealt = () => s.phase === 'loot' && s.loot!.taken === null;
    if (o.screen === 'travel') until(() => s.phase === 'travel');
    if (o.screen === 'loot') until(dealt);
    if (o.screen === 'unid') {
      until(dealt);
      if (s.phase === 'loot') run.take(s.loot!.cards.findIndex((c) => c.unid));
    }
    if (o.screen === 'swap') {
      until(() => dealt() && s.loot!.cards.some((c) => c.kind === 'supply' || c.kind === 'vaal'));
      if (s.phase === 'loot') run.take(s.loot!.cards.findIndex((c) => c.kind === 'supply' || c.kind === 'vaal'));
    }
    if (o.screen === 'beforeTown') until(() => (dealt() && s.item!.n === TOWN_AFTER - 1) || s.phase === 'town');
    if (o.screen === 'town') until(() => s.phase === 'town');
    if (o.screen === 'boss') until(() => s.phase === 'travel' && s.done === BOSS_AT);
    if (o.screen === 'won') until(() => s.done === ITEMS_IN_RUN);
    if (o.screen === 'lost') {
      until(() => s.phase === 'item' && s.done === 2);
      if (s.phase === 'item') lose();
    }
    run.state = reactive(s);
    return run;
  }

  const run = $derived(build({ screen: String(v.screen), seed: Number(v.seed), stocked: !!v.stocked, misses: !!v.misses, vaal: !!v.vaal }));
  const s = $derived(run.state);
</script>

<main class="wr bench" class:small>
  {#key run}
    {#if !small}<Hud {run} />{/if}
    {#if s.phase === 'camp' || s.phase === 'town'}
      <Vendor {run} />
    {:else if s.phase === 'travel'}
      <Travel {run} />
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
