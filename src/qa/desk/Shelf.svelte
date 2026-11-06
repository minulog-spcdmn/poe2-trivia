<script lang="ts">
  // The desk's list of benches: first where this change shows (the places
  // that run what it changes, each opening at that state), then the pieces,
  // then the game's screens. The search (/) finds a bench by its name, or a
  // state of a screen by any words of its name ("race twelve"); Enter opens
  // the first found, at that state.
  import type { Bench } from '../bench.ts';
  import type { Change } from '../change.ts';
  import { matches } from './walk.ts';

  let {
    benches,
    current,
    change,
    here,
    query = $bindable(''),
    listed = $bindable([]),
    shelfOf,
    onopen,
    onplace,
  }: {
    benches: Bench[];
    current: Bench;
    /** Where this change shows: its places (most its own first), what changes every screen, what no place runs. */
    change: { places: { key: string; why: string; label: string; where: string }[]; everywhere: Change['everywhere']; uncovered: string[] } | null;
    /** The place on show, if the view stands at one. */
    here: string | null;
    query: string;
    /** The benches as listed, in order (for ← and →). */
    listed: Bench[];
    shelfOf: (b: Bench) => string;
    onopen: (b: Bench, at?: number) => void;
    onplace: (key: string) => void;
  } = $props();

  let input = $state<HTMLInputElement>();
  export const focus = () => input?.focus();

  /** How many of the change's places show before "and N more". */
  const FEW = 8;
  let more = $state(false);

  const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
  /** A bench the search finds, and (a screen) the first of its states it finds, if not by its own name. */
  function found(b: Bench, q: string): { ok: boolean; at?: number } {
    const w = words(q);
    if (!w.length) return { ok: true };
    const own = `${b.label} ${shelfOf(b)} ${b.key} ${b.kind === 'piece' ? b.about : ''}`.toLowerCase();
    if (w.every((x) => own.includes(x))) return { ok: true };
    const at = b.kind === 'scenes' ? b.states.findIndex((s) => matches(s.scene, q, `${s.label} ${s.group}`)) : -1;
    return { ok: at >= 0, at: at >= 0 ? at : undefined };
  }
  const hits = $derived(new Map(benches.map((b) => [b, found(b, query)])));
  /** The change's places the search leaves, and those shown of them. */
  const places = $derived((change?.places ?? []).filter((p) => words(query).every((x) => `${p.label} ${p.where} ${p.key}`.toLowerCase().includes(x))));
  const shown = $derived(more || places.length <= FEW + 1 ? places : places.slice(0, FEW));
  /** What changes every screen (or every piece), each file named once. */
  const everywhere = $derived(
    (['screens', 'pieces'] as const)
      .map((of) => ({ of, files: [...new Set((change?.everywhere ?? []).filter((e) => e.of === of).map((e) => e.file.split('/').pop()!))], why: (change?.everywhere ?? []).filter((e) => e.of === of).map((e) => e.why) }))
      .filter((e) => e.files.length),
  );
  const shelves = $derived.by(() => {
    const out: { name: string; benches: Bench[] }[] = [];
    for (const b of benches) {
      if (!hits.get(b)!.ok) continue;
      const name = shelfOf(b);
      const shelf = out.find((s) => s.name === name) ?? (out.push({ name, benches: [] }), out[out.length - 1]);
      shelf.benches.push(b);
    }
    return out;
  });
  $effect(() => {
    listed = shelves.flatMap((s) => s.benches);
  });
  const count = (b: Bench) => b.states.length;
  const changeShown = $derived(!!places.length || (!query && (!!everywhere.length || !!change?.uncovered.length)));

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const b = listed[0];
    if (places[0]) onplace(places[0].key);
    else if (b) onopen(b, hits.get(b)?.at);
    input?.blur();
  }
</script>

<nav class="shelf" aria-label="Benches">
  <input class="search" type="search" placeholder="Find  /" bind:value={query} bind:this={input} {onkeydown} aria-label="Find a bench or a scene" />
  <div class="shelves">
    {#if changeShown}
      <section>
        <h2 class="change">This change</h2>
        {#each shown as p (p.key)}
          <button class="bench place changed" class:on={p.key === here} title={p.why} onclick={() => onplace(p.key)}>
            <span class="name">{p.label}</span>
            <span class="where">{p.where}</span>
          </button>
        {/each}
        {#if shown.length < places.length}
          <button class="more" onclick={() => (more = true)}>and {places.length - shown.length} more</button>
        {/if}
        {#if !query}
          {#each everywhere as e (e.of)}
            <p class="aside" title={e.why.join('\n')}>Also changes what every {e.of === 'screens' ? 'screen' : 'piece'} runs: {e.files.join(', ')}</p>
          {/each}
          {#if change?.uncovered.length}
            <p class="aside" title={change.uncovered.join('\n')}>Changed, on no bench: {change.uncovered.map((f) => f.replace(/^[^ ]*\//, '')).join(', ')}</p>
          {/if}
        {/if}
      </section>
    {/if}
    {#each shelves as s (s.name)}
      <section>
        <h2>{s.name}</h2>
        {#each s.benches as b (b.key)}
          <button class="bench" class:on={b === current} title={b.kind === 'piece' ? b.about : `${b.label}: the real game, ${b.states.length} states`} onclick={() => onopen(b, hits.get(b)?.at)}>
            <span class="name">{b.label}</span>
            <span class="num">{count(b)}</span>
          </button>
        {/each}
      </section>
    {/each}
    {#if !shelves.length && !places.length}<p class="none">Nothing called “{query}”.</p>{/if}
  </div>
</nav>
