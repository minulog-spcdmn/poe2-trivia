<script lang="ts">
  // The desk's list of benches: first where this change shows (the places
  // that run what it changes, each opening at that state), then the pieces,
  // then the game's screens. The search (/) finds a bench by its name, and
  // any state of a screen by any words of its name, its heading's or its
  // screen's ("race wrong"), listed in its panel or behind a control, a
  // row each that opens it; Enter opens the first found.
  import type { Bench } from '../bench.ts';
  import type { Change } from '../change.ts';

  let {
    benches,
    current,
    change,
    findable,
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
    /** Every state of every screen, for the search: its names, its words (lower case), and how to open it. */
    findable: { id: string; label: string; where: string; words: string; open: () => void }[];
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
  let moreFound = $state(false);

  const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
  /** A bench the search finds by its own name. */
  function found(b: Bench, q: string): boolean {
    const own = `${b.label} ${shelfOf(b)} ${b.key} ${b.kind === 'piece' ? b.about : ''}`.toLowerCase();
    return words(q).every((x) => own.includes(x));
  }
  /** The first `FEW` of `list`, or all of it once more is asked for (or there's only one more). */
  function few<T>(list: T[], all: boolean): T[] {
    return all || list.length <= FEW + 1 ? list : list.slice(0, FEW);
  }
  /** The change's places the search leaves, and those shown of them. */
  const places = $derived((change?.places ?? []).filter((p) => words(query).every((x) => `${p.label} ${p.where} ${p.key}`.toLowerCase().includes(x))));
  const shown = $derived(few(places, more));
  /** The states the search finds, but those This change lists already, and those shown of them. */
  const states = $derived(words(query).length ? findable.filter((f) => !places.some((p) => p.key === f.id) && words(query).every((x) => f.words.includes(x))) : []);
  const statesShown = $derived(few(states, moreFound));
  $effect(() => {
    void query;
    moreFound = false;
  });
  /** What changes every screen (or every piece), each file named once. */
  const everywhere = $derived(
    (['screens', 'pieces'] as const)
      .map((of) => ({ of, files: [...new Set((change?.everywhere ?? []).filter((e) => e.of === of).map((e) => e.file.split('/').pop()!))], why: (change?.everywhere ?? []).filter((e) => e.of === of).map((e) => e.why) }))
      .filter((e) => e.files.length),
  );
  const shelves = $derived.by(() => {
    const out: { name: string; benches: Bench[] }[] = [];
    for (const b of benches) {
      if (!found(b, query)) continue;
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
    if (places[0]) onplace(places[0].key);
    else if (states[0]) states[0].open();
    else if (listed[0]) onopen(listed[0]);
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
    {#if states.length}
      <section>
        <h2>States</h2>
        {#each statesShown as f (f.id)}
          <button class="bench place" class:on={f.id === here} onclick={f.open}>
            <span class="name">{f.label}</span>
            <span class="where">{f.where}</span>
          </button>
        {/each}
        {#if statesShown.length < states.length}
          <button class="more" onclick={() => (moreFound = true)}>and {states.length - statesShown.length} more</button>
        {/if}
      </section>
    {/if}
    {#each shelves as s (s.name)}
      <section>
        <h2>{s.name}</h2>
        {#each s.benches as b (b.key)}
          <button class="bench" class:on={b === current} title={b.kind === 'piece' ? b.about : `${b.label}: the real game, ${b.states.length} states`} onclick={() => onopen(b)}>
            <span class="name">{b.label}</span>
            <span class="num">{count(b)}</span>
          </button>
        {/each}
      </section>
    {/each}
    {#if !shelves.length && !places.length && !states.length}<p class="none">Nothing called “{query}”.</p>{/if}
  </div>
</nav>
