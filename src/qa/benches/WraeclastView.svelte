<script lang="ts">
  // The Wraeclast item bench's view (./wraeclast.ts): a real run (rules.ts),
  // seeded, played up to the item the controls ask for, then the item screen
  // as the page draws it, the run's bar above it. The Veil opens the item as
  // on the page (its free patches burned in where there's art); then the
  // supply, strikes, misses, corruption and build asked for are played. A
  // change to the controls lays the item out again.
  import { untrack } from 'svelte';
  import '../../wraeclast/screens.css';
  import { CORRUPTIONS, DEFAULT_TUNING, MIN_NAMES, Run, ZONE_TYPES, answerOf, remaining, type Corruption, type Supply, type Ware, type ZoneType } from '../../wraeclast/rules';
  import Hud from '../../wraeclast/Hud.svelte';
  import ItemScreen from '../../wraeclast/ItemScreen.svelte';
  import type { PieceProps } from '../bench.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';

  let { v, small }: PieceProps = $props();

  const FULL: Ware[] = ['flare', 'flare', 'wisdom', 'strike', 'lengths', 'first', 'decoy', 'vaal'];

  /** A plain object made deeply reactive, for the screens to follow (as play.svelte.ts does). */
  function reactive<T extends object>(value: T): T {
    const proxied = $state(value);
    return proxied;
  }

  type Options = {
    place: string;
    zone: ZoneType;
    names: string;
    item: number;
    used: Supply | 'none';
    struck: number;
    misses: number;
    corrupt: Corruption | 'none';
    built: boolean;
    named: boolean;
    pack: boolean;
    spacing: boolean;
  };

  /** The run, played on its plain state up to the item asked for and laid out there; reactive once it is. */
  function build(o: Options) {
    const tuning = structuredClone(DEFAULT_TUNING);
    if (o.names !== 'auto') tuning.board = { early: +o.names, late: +o.names, boss: +o.names };
    tuning.spacing = o.spacing;
    // The corruption asked for, the only one the orb can roll.
    if (o.corrupt !== 'none') for (const c of CORRUPTIONS) tuning.corruption[c] = c === o.corrupt ? 1 : 0;
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
    run.enter();
    run.state = reactive(s);
    return run;
  }

  /** On the item the Veil has opened: the supply, strikes, misses, corruption and build asked for. */
  function play(run: Run, o: Options) {
    const s = run.state;
    const it = s.item!;
    if (o.used !== 'none') {
      s.pack.push(o.used);
      if (!run.use(o.used)) s.pack.pop();
    }
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
    if (o.corrupt !== 'none') {
      if (!s.pack.includes('vaal')) s.pack.push('vaal');
      run.corrupt();
    }
    const answer = answerOf(it).words.flat();
    if (o.named) {
      it.build = [...answer];
      run.submit();
    } else if (o.built) it.build = answer.slice(0, Math.max(it.locked, Math.ceil(answer.length / 2)));
  }

  /** Submits a wrong name of the board's, while it leaves the run some life. */
  function miss(run: Run) {
    const s = run.state;
    const it = s.item;
    const wrong = it && remaining(it).find((nm) => nm.id !== it.itemId);
    // Not while the item is still opening (a submit then counts for nothing).
    if (!it || it.openedAt === null || s.phase !== 'item' || !wrong || s.life <= run.missRange()[1]) return false;
    it.build = [...it.build.slice(0, it.locked), ...wrong.words.flat().slice(it.locked)];
    run.submit();
    return true;
  }

  const options = $derived<Options>({
    place: String(v.place),
    zone: String(v.zone) as ZoneType,
    names: String(v.names),
    item: Number(v.item),
    used: String(v.used) as Supply | 'none',
    struck: Number(v.struck),
    misses: Number(v.misses),
    corrupt: String(v.corrupt) as Corruption | 'none',
    built: !!v.built,
    named: !!v.named,
    pack: !!v.pack,
    spacing: !!v.spacing,
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
    if (it && run.state.phase === 'item') it.build = answerOf(it).words.flat();
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
