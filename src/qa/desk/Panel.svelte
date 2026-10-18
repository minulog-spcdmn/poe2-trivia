<script lang="ts">
  // A bench's panel: its states (1 to 9, ↑ ↓; A: all of them side by side),
  // its controls (a piece's, or a scene's knobs), what can happen to it, its
  // seats, and Replay and Freeze. Only what the bench has shows.
  import type { Bench, Value, Values } from '../bench.ts';
  import type { Scene } from '../scene.ts';

  let {
    bench,
    states,
    stateIndex,
    all,
    v,
    scene,
    knobs,
    seats,
    seat,
    frozen,
    hasBoard,
    canPlay,
    reason,
    onstate,
    onall,
    onvalue,
    onknob,
    onseat,
    onact,
    onreplay,
    onfreeze,
    onplay,
    onhold,
  }: {
    bench: Bench;
    states: string[];
    stateIndex: number;
    all: boolean;
    v: Values;
    scene: Scene | null;
    knobs: Record<string, string>;
    seats: string[];
    seat: number | 'all';
    frozen: boolean;
    hasBoard: boolean;
    canPlay: boolean;
    /** Why this change touches it, if it does. */
    reason?: string;
    onstate: (i: number) => void;
    onall: () => void;
    onvalue: (key: string, value: Value) => void;
    onknob: (key: string, value: string) => void;
    onseat: (s: number | 'all') => void;
    onact: (key: string) => void;
    onreplay: () => void;
    onfreeze: () => void;
    onplay: () => void;
    onhold: (on: boolean) => void;
  } = $props();

  const piece = $derived(bench.kind === 'piece' ? bench : null);
</script>

<aside class="bench-panel">
  <header>
    <h1>{bench.label}</h1>
    <p class="about">{piece ? piece.about : `${bench.kind === 'scenes' ? bench.screen : ''}: the real game, a scene at a time.`}</p>
    {#if reason}<p class="reason">This change: {reason}</p>{/if}
  </header>

  <section>
    <h2>States <button class="all" class:on={all} onclick={onall}>All at once <kbd>A</kbd></button></h2>
    <ol class="states">
      {#each states as s, i (i)}
        <li>
          <button class:on={i === stateIndex && !all} onclick={() => onstate(i)}>
            <span class="n">{i < 9 ? i + 1 : ''}</span>{s}
          </button>
        </li>
      {/each}
    </ol>
  </section>

  {#if piece?.controls.length}
    <section class="controls">
      <h2>Controls</h2>
      {#each piece.controls as c (c.key)}
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
      {/each}
    </section>
  {/if}

  {#if scene?.knobs?.length}
    <section class="controls">
      <h2>Settings</h2>
      {#each scene.knobs as k (k.key)}
        <label class="control">
          <span class="label">{k.label}</span>
          <select value={knobs[k.key]} onchange={(e) => (onknob(k.key, e.currentTarget.value), e.currentTarget.blur())}>
            {#each k.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
          </select>
        </label>
      {/each}
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
    {#if hasBoard}
      <button onpointerdown={() => onhold(true)} onpointerup={() => onhold(false)} onpointerleave={() => onhold(false)}>Hold for design <kbd>H</kbd></button>
    {/if}
    {#if canPlay}
      <button onclick={onplay} title="This scene's room for real: every seat playable, by hand or by a bot, with its link to make bad">Play from here</button>
    {/if}
  </section>
</aside>
