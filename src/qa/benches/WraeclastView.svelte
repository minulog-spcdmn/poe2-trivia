<script lang="ts">
  // The Wraeclast item bench's view (./wraeclast.ts): a real run (rules.ts),
  // seeded, played up to the item the controls ask for, then the item screen
  // as the page draws it, the run's bar above it. The Veil opens the item as
  // on the page (its free patches lifted where there's art); then the
  // strikes, misses and half-built answer asked for are played. A change to
  // the controls lays the item out again.
  import { untrack } from 'svelte';
  import '../../wraeclast/screens.css';
  import { DEFAULT_TUNING, MIN_NAMES, Run, ZONE_TYPES, remaining, type BoardSize, type Supply, type ZoneType } from '../../wraeclast/rules';
  import Hud from '../../wraeclast/Hud.svelte';
  import ItemScreen from '../../wraeclast/ItemScreen.svelte';
  import type { PieceProps } from '../bench.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';

  let { v, small }: PieceProps = $props();

  const FULL: Supply[] = ['flare', 'flare', 'flare', 'requirement', 'wisdom', 'wisdom', 'strike', 'lore'];

  /** A plain object made deeply reactive, for the screens to follow (as play.svelte.ts does). */
  function reactive<T extends object>(value: T): T {
    const proxied = $state(value);
    return proxied;
  }

  type Options = { place: string; zone: ZoneType; names: string; item: number; struck: number; misses: number; built: boolean; pack: boolean; wordCount: boolean };

  /** The run, played on its plain state up to the item asked for and laid out there; reactive once it is. */
  function build(o: Options) {
    const tuning = structuredClone(DEFAULT_TUNING);
    if (o.names !== 'auto') tuning.board = { early: +o.names as BoardSize, late: +o.names as BoardSize, boss: +o.names as BoardSize };
    tuning.wordCount = o.wordCount;
    const run = new Run({ tuning, seed: o.item, now: () => 0 });
    const s = run.state;
    const boss = o.place.startsWith('boss') ? Number(o.place.slice(4)) - 1 : null;
    const zoneNo = boss !== null ? 5 : o.place === 'late' ? 3 : 1;
    // The zone asked for where the item is (zone 1 or 3), the other three around it.
    const others = ZONE_TYPES.filter((z) => z !== o.zone);
    if (zoneNo === 1) s.zones = [o.zone, ...others];
    if (zoneNo === 3) s.zones = [others[0], others[1], o.zone, others[2]];
    s.done = boss !== null ? 12 + boss : zoneNo === 3 ? 6 : 0;
    s.pack = o.pack ? [...FULL] : [];
    run.leave();
    run.pick(0);
    run.state = reactive(s);
    return run;
  }

  /** On the item the Veil has opened: the strikes, misses and build asked for. */
  function play(run: Run, o: Options) {
    const s = run.state;
    const it = s.item!;
    for (let k = 0; k < o.struck && remaining(it).length > MIN_NAMES; k++) {
      s.pack.push('strike');
      // At the boss a strike does nothing (Silent): struck as if it had.
      if (!run.use('strike')) {
        s.pack.pop();
        const wrong = remaining(it).filter((nm) => nm.id !== it.itemId);
        it.struck.push(wrong[k % wrong.length].id);
      }
    }
    for (let k = 0; k < o.misses; k++) if (!miss(run)) break;
    if (o.built) {
      const answer = it.names.find((nm) => nm.id === it.itemId)!.words.flat();
      it.build = answer.slice(0, Math.ceil(answer.length / 2));
    }
  }

  /** Submits a wrong name of the board's, while it leaves the run some life. */
  function miss(run: Run) {
    const s = run.state;
    const it = s.item;
    const wrong = it && remaining(it).find((nm) => nm.id !== it.itemId);
    if (!it || !wrong || s.life <= s.tuning.missCost[it.boss !== null ? 'boss' : it.zoneNo > 2 ? 'late' : 'early']) return false;
    it.build = wrong.words.flat();
    run.submit();
    return true;
  }

  const options = $derived<Options>({
    place: String(v.place),
    zone: String(v.zone) as ZoneType,
    names: String(v.names),
    item: Number(v.item),
    struck: Number(v.struck),
    misses: Number(v.misses),
    built: !!v.built,
    pack: !!v.pack,
    wordCount: !!v.wordCount,
  });
  const run = $derived(build(options));

  // Once the Veil has opened this run's item, the rest is played on it, once.
  let played: Run | null = null;
  $effect(() => {
    const r = run;
    if (r.state.item?.openedAt == null || played === r) return;
    played = r;
    untrack(() => play(r, options));
  });

  onAction('miss', () => miss(run));
  onAction('answer', () => {
    const it = run.state.item;
    if (it) it.build = it.names.find((nm) => nm.id === it.itemId)!.words.flat();
  });
</script>

<main class="wr bench" class:small>
  {#key run}
    {#if !small}<Hud {run} />{/if}
    {#if run.state.item}<ItemScreen {run} />{/if}
  {/key}
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
