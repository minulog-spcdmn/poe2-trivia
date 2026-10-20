<script lang="ts">
  // The desk's list of benches: those this change touches first, then the
  // pieces, then the game's screens. The search (/) finds a bench by its
  // name, or a state of a screen by any words of its name ("race twelve");
  // Enter opens the first found, at that state.
  import type { Bench } from '../bench.ts';
  import { matches } from './walk.ts';

  let {
    benches,
    current,
    touched,
    query = $bindable(''),
    listed = $bindable([]),
    shelfOf,
    onopen,
  }: {
    benches: Bench[];
    current: Bench;
    touched: { benches: { key: string; why: string }[]; uncovered: string[] } | null;
    query: string;
    /** The benches as listed, in order (for ← and →). */
    listed: Bench[];
    shelfOf: (b: Bench) => string;
    onopen: (b: Bench, at?: number) => void;
  } = $props();

  let input = $state<HTMLInputElement>();
  export const focus = () => input?.focus();

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
  const why = $derived(new Map((touched?.benches ?? []).map((t) => [t.key, t.why])));
  const shelves = $derived.by(() => {
    const out: { name: string; benches: Bench[] }[] = [];
    const changed = benches.filter((b) => why.has(b.key) && hits.get(b)!.ok);
    if (changed.length) out.push({ name: 'This change', benches: changed });
    for (const b of benches) {
      if (!hits.get(b)!.ok) continue;
      const name = shelfOf(b);
      const shelf = out.find((s) => s.name === name) ?? (out.push({ name, benches: [] }), out[out.length - 1]);
      shelf.benches.push(b);
    }
    return out;
  });
  $effect(() => {
    const seen = new Set<Bench>();
    listed = shelves.flatMap((s) => s.benches).filter((b) => !seen.has(b) && (seen.add(b), true));
  });
  const count = (b: Bench) => b.states.length;

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const b = listed[0];
    if (b) onopen(b, hits.get(b)?.at);
    input?.blur();
  }
</script>

<nav class="shelf" aria-label="Benches">
  <input class="search" type="search" placeholder="Find  /" bind:value={query} bind:this={input} {onkeydown} aria-label="Find a bench or a scene" />
  <div class="shelves">
    {#each shelves as s (s.name)}
      <section>
        <h2 class:change={s.name === 'This change'}>{s.name}</h2>
        {#each s.benches as b (b.key)}
          <button class="bench" class:on={b === current} class:changed={why.has(b.key)} title={why.get(b.key) ?? (b.kind === 'piece' ? b.about : `${b.label}: the real game, ${b.states.length} states`)} onclick={() => onopen(b, hits.get(b)?.at)}>
            <span class="name">{b.label}</span>
            <span class="num">{count(b)}</span>
          </button>
        {/each}
      </section>
    {/each}
    {#if !shelves.length}<p class="none">Nothing called “{query}”.</p>{/if}
    {#if touched?.uncovered.length && !query}
      <p class="uncovered" title={touched.uncovered.join('\n')}>
        Changed, on no bench: {touched.uncovered.map((f) => f.split('/').pop()).join(', ')}
      </p>
    {/if}
  </div>
</nav>
