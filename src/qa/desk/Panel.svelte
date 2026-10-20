<script lang="ts">
  // A bench's panel: its states (1 to 9, ↑ ↓; A: all of them side by side),
  // under their headings; its controls (a piece's, or the scene's own and
  // those of any game), what can happen to it, its seats, and Replay and
  // Freeze. Only what the bench has shows.
  import type { Bench, Control, Value, Values } from '../bench.ts';

  let {
    bench,
    states,
    stateIndex,
    all,
    controls,
    tweaks,
    v,
    changed,
    seats,
    seat,
    frozen,
    hasBoard,
    canPlay,
    canCompare,
    comparing,
    reason,
    onstate,
    onall,
    onvalue,
    onreset,
    onseat,
    onact,
    onreplay,
    onfreeze,
    onplay,
    onhold,
    oncompare,
  }: {
    bench: Bench;
    /** Its states, each with the heading it's listed under ('' for none). */
    states: { label: string; group: string }[];
    stateIndex: number;
    all: boolean;
    /** Its own controls; and (a screen's) those every game has, as this one has them. */
    controls: Control[];
    tweaks: Control[];
    v: Values;
    /** Whether this change touches a state. */
    changed?: (i: number) => boolean;
    seats: string[];
    seat: number | 'all';
    frozen: boolean;
    hasBoard: boolean;
    canPlay: boolean;
    /** Before and after: whether it can be (only the dev server has the code before), and whether it's on. */
    canCompare: boolean;
    comparing: boolean;
    /** Why this change touches it, if it does. */
    reason?: string;
    onstate: (i: number) => void;
    onall: () => void;
    onvalue: (key: string, value: Value) => void;
    onreset: () => void;
    onseat: (s: number | 'all') => void;
    onact: (key: string) => void;
    onreplay: () => void;
    onfreeze: () => void;
    onplay: () => void;
    onhold: (on: boolean) => void;
    oncompare: () => void;
  } = $props();

  const piece = $derived(bench.kind === 'piece' ? bench : null);
  /** The states by heading, each with its index. */
  const headed = $derived.by(() => {
    const out: { group: string; items: { label: string; i: number }[] }[] = [];
    states.forEach((s, i) => {
      const last = out[out.length - 1];
      if (last && last.group === s.group) last.items.push({ label: s.label, i });
      else out.push({ group: s.group, items: [{ label: s.label, i }] });
    });
    return out;
  });
  /** Whether a control is away from where the state on show (or its scene) has it. */
  const moved = $derived(stateIndex < 0 && !all);

  /** A long list's headings fold: only the one with the state on show is open, until another is opened. */
  const FOLD_OVER = 24;
  let opened = $state<Set<string>>(new Set());
  const here = $derived(states[stateIndex]?.group);
  // A bench of its own each time; the state on show always in sight.
  $effect.pre(() => {
    void bench;
    opened = new Set();
  });
  $effect.pre(() => {
    if (here !== undefined && !opened.has(here)) opened = new Set([...opened, here]);
  });
  const isOpen = (group: string) => !group || states.length <= FOLD_OVER || opened.has(group);
  function fold(group: string) {
    const next = new Set(opened);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    opened = next;
  }
</script>

{#snippet control(c: Control)}
  {#if c.kind === 'range'}
    <label class="control">
      <span class="label">{c.label}</span>
      <span class="range">
        <input type="range" min={c.min} max={c.max} step={c.step ?? 1} value={v[c.key]} oninput={(e) => onvalue(c.key, Number(e.currentTarget.value))} />
        <input
          class="num"
          type="number"
          min={c.min}
          max={c.max}
          step={c.step ?? 1}
          value={v[c.key]}
          oninput={(e) => {
            // Only a number it can be, while typing (2 on the way to 24 isn't 16); the rest once it's left.
            const n = e.currentTarget.valueAsNumber;
            if (n >= c.min && n <= c.max) onvalue(c.key, n);
          }}
          onchange={(e) => {
            const n = e.currentTarget.valueAsNumber;
            const kept = Number.isFinite(n) ? Math.max(c.min, Math.min(c.max, n)) : c.default;
            onvalue(c.key, kept);
            e.currentTarget.value = String(kept);
          }}
        />
        {#if c.unit}<span class="unit">{c.unit}</span>{/if}
      </span>
    </label>
  {:else if c.kind === 'choice'}
    <label class="control">
      <span class="label">{c.label}</span>
      <select value={v[c.key]} onchange={(e) => (onvalue(c.key, e.currentTarget.value), e.currentTarget.blur())}>
        {#each c.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
      </select>
    </label>
  {:else}
    <label class="control toggle">
      <input type="checkbox" checked={!!v[c.key]} onchange={(e) => onvalue(c.key, e.currentTarget.checked)} />
      <span class="label">{c.label}</span>
    </label>
  {/if}
{/snippet}

<aside class="bench-panel">
  <header>
    <h1>{bench.label}</h1>
    <p class="about">{piece ? piece.about : 'The real game on this screen, in each of its states.'}</p>
    {#if reason}<p class="reason">This change: {reason}</p>{/if}
  </header>

  <section>
    <h2>States <button class="all" class:on={all} onclick={onall}>All at once <kbd>A</kbd></button></h2>
    {#each headed as h, g (g)}
      {#if h.group && states.length > FOLD_OVER}
        <h3 class="heading"><button class="fold" class:open={isOpen(h.group)} onclick={() => fold(h.group)} aria-expanded={isOpen(h.group)}>{h.group}<span class="num">{h.items.length}</span></button></h3>
      {:else if h.group}<h3 class="heading">{h.group}</h3>{/if}
      <ol class="states" hidden={!isOpen(h.group)}>
        {#each h.items as s (s.i)}
          <li>
            <button class:on={s.i === stateIndex && !all} class:changed={changed?.(s.i)} onclick={() => onstate(s.i)} title={changed?.(s.i) ? 'This change touches it' : undefined}>
              <span class="n">{s.i < 9 ? s.i + 1 : ''}</span>{s.label}
            </button>
          </li>
        {/each}
      </ol>
    {/each}
  </section>

  {#if controls.length || tweaks.length}
    <section class="controls">
      <h2>Controls {#if moved}<button class="all" onclick={onreset} title="Every control back where the state has it">As it was</button>{/if}</h2>
      {#each controls as c (c.key)}{@render control(c)}{/each}
      {#if tweaks.length}
        <h3 class="heading">In any game</h3>
        {#each tweaks as c (c.key)}{@render control(c)}{/each}
      {/if}
    </section>
  {/if}

  {#if piece?.actions?.length}
    <section>
      <h2>What happens</h2>
      <div class="actions">
        {#each piece.actions as a (a.key)}
          <button class="act" onclick={() => onact(a.key)}>{a.label}{#if a.hint}<span class="hint">{a.hint}</span>{/if}</button>
        {/each}
      </div>
    </section>
  {/if}

  {#if seats.length > 1}
    <section>
      <h2>Seat</h2>
      <div class="seats">
        {#each seats as s, i (i)}
          <button class:on={seat === i} onclick={() => onseat(i)}>{s}</button>
        {/each}
        <button class:on={seat === 'all'} onclick={() => onseat('all')}>Side by side</button>
      </div>
    </section>
  {/if}

  <section class="tools">
    <button onclick={onreplay} title="Draw it in again, as it first came">Replay <kbd>R</kbd></button>
    <button class:on={frozen} onclick={onfreeze} title="Hold every animation where it is">{frozen ? 'Frozen' : 'Freeze'} <kbd>F</kbd></button>
    {#if canCompare}
      <button class:on={comparing} onclick={oncompare} title="The code before this change beside the code now, and where they differ">Before and after <kbd>B</kbd></button>
    {/if}
    {#if hasBoard}
      <button onpointerdown={() => onhold(true)} onpointerup={() => onhold(false)} onpointerleave={() => onhold(false)}>Hold for design <kbd>H</kbd></button>
    {/if}
    {#if canPlay}
      <button onclick={onplay} title="This scene's room for real: every seat playable, by hand or by a bot, with its link to make bad">Play from here</button>
    {/if}
  </section>
</aside>
