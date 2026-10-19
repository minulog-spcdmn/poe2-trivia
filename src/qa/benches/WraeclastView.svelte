<script lang="ts">
  // The Wraeclast item bench's view (./wraeclast.ts): a real run (rules.ts),
  // seeded, brought to the node the controls ask for (./wraeclastSetup.ts)
  // under its zone type, corruption and boss modifiers, then the item screen
  // as the page draws it, the run's header and strip above it. The Veil opens
  // the item as on the page; then the supply, misses and build asked for are
  // played. A change to the controls lays the item out again.
  import { untrack } from 'svelte';
  import '../../wraeclast/screens.css';
  import { DEFAULT_TUNING, Run, type BossMod, type Hidden, type Supply, type ZoneType } from '../../wraeclast/rules';
  import { GRAPH } from '../../wraeclast/map';
  import Hud from '../../wraeclast/Hud.svelte';
  import ItemScreen from '../../wraeclast/ItemScreen.svelte';
  import type { PieceProps } from '../bench.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';
  import { FULL_PACK, arrive, nodeAt, wrongLine } from './wraeclastSetup.ts';

  let { v, small }: PieceProps = $props();

  /** A plain object made deeply reactive, for the screens to follow (as play.svelte.ts does). */
  function reactive<T extends object>(value: T): T {
    const proxied = $state(value);
    return proxied;
  }

  type Options = {
    place: string;
    zone: ZoneType;
    hidden: Hidden | 'none';
    mods: string;
    item: number;
    used: Supply | 'none';
    misses: number;
    goldOnly: boolean;
    built: boolean;
    named: boolean;
    pack: boolean;
  };
  const STEPS: Record<string, number> = { early: 2, mid: 9, late: 14 };
  const MODS: Record<string, BossMod[]> = { none: [], three: ['bloodied', 'murky', 'teeming'] };

  /** The run, brought to the node asked for and its item laid out there; reactive once it is. */
  function build(o: Options) {
    const tuning = structuredClone(DEFAULT_TUNING);
    if (o.goldOnly) tuning.marks = 'gold';
    const run = new Run({ tuning, seed: o.item, now: () => 0 });
    const s = run.state;
    const boss = o.place.startsWith('boss') ? Number(o.place.slice(4)) - 1 : null;
    const id = boss !== null ? GRAPH.boss.id : nodeAt(STEPS[o.place] ?? 2);
    s.pack = o.pack ? structuredClone(FULL_PACK) : [];
    arrive(run, id, {
      place: boss !== null ? undefined : { kind: 'zone', type: o.zone },
      hidden: o.hidden === 'none' ? null : o.hidden,
      mods: MODS[o.mods] ?? [o.mods as BossMod],
    });
    if (boss !== null) s.visit!.done = Math.min(boss, s.visit!.items - 1);
    run.enter();
    run.state = reactive(s);
    return run;
  }

  /** On the item the Veil has opened: the supply, misses and build asked for. */
  function play(run: Run, o: Options) {
    const it = run.state.item!;
    if (o.used !== 'none') {
      // A supply the zone or the boss won't let work still shows as used, for a look at it.
      if (!run.use(o.used) && o.used === 'category') it.shown.category = true;
      if (o.used === 'category' && run.works('base')) run.use('base');
    }
    for (let k = 0; k < o.misses; k++) if (!miss(run)) break;
    if (o.named) {
      it.build = [...it.answer];
      it.lineMarks = null;
      run.submit();
    } else if (o.built) it.build = it.answer.slice(0, Math.max(it.locked, Math.ceil(it.answer.length / 2)));
  }

  /** Submits a wrong line, while it leaves the run some life. */
  function miss(run: Run) {
    const s = run.state;
    const it = s.item;
    // Not while the item is still opening (a submit then counts for nothing).
    if (!it || it.openedAt === null || s.phase !== 'item' || s.life <= run.missRange()[1]) return false;
    it.build = wrongLine(it, it.misses);
    it.lineMarks = null;
    return run.submit() === false;
  }

  const options = $derived<Options>({
    place: String(v.place),
    zone: String(v.zone) as ZoneType,
    hidden: String(v.hidden) as Hidden | 'none',
    mods: String(v.mods),
    item: Number(v.item),
    used: String(v.used) as Supply | 'none',
    misses: Number(v.misses),
    goldOnly: !!v.goldOnly,
    built: !!v.built,
    named: !!v.named,
    pack: !!v.pack,
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
    if (it && run.state.phase === 'item') {
      it.build = [...it.answer];
      it.lineMarks = null;
    }
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
