<script lang="ts">
  // A piece's frame (./piece.ts): its view in the middle of the screen, as
  // the panel sets it; or (all) every state of its bench side by side, each
  // named, a click on one showing it alone. There, a control moved in the
  // panel moves in every state, and an action plays in all of them at once.
  import { untrack, type Component } from 'svelte';
  import FxLayer from '../../components/FxLayer.svelte';
  import { stateValues, type PieceBench, type PieceProps, type Values } from '../bench.ts';
  import { piece } from './pieceState.svelte.ts';

  let {
    bench,
    View,
    all,
    set,
    pick,
  }: { bench: PieceBench; View: Component<PieceProps>; all: boolean; set: (values: Values) => void; pick: (index: number) => void } = $props();

  function setHere(values: Values) {
    for (const [k, v] of Object.entries(values)) piece.values[k] = v;
    set(values);
  }

  /** Each state's controls, side by side: its own, and whatever the panel moved since. */
  const fresh = () => bench.states.map((s) => stateValues(bench, s));
  let cells = $state(fresh());
  let last: Values = { ...untrack(() => piece.values) };
  $effect(() => {
    const now = { ...piece.values };
    untrack(() => {
      for (const [k, v] of Object.entries(now)) if (last[k] !== v) for (const c of cells) c[k] = v;
      last = now;
    });
  });
  $effect(() => {
    void piece.replay;
    untrack(() => (cells = fresh()));
  });
</script>

<FxLayer />

{#if all}
  <main class="all">
    {#each bench.states as s, i (i)}
      <div class="cell" role="button" tabindex="0" onclick={() => pick(i)} onkeydown={(e) => e.key === 'Enter' && pick(i)} title="Show it alone">
        <span class="view">
          {#key piece.replay}
            <View v={cells[i]} set={(values) => Object.assign(cells[i], values)} small />
          {/key}
        </span>
        <span class="label"><span class="n">{i + 1}</span>{s.label}</span>
      </div>
    {/each}
  </main>
{:else}
  <main class="one">
    {#key piece.replay}
      <View v={piece.values} set={setHere} small={false} />
    {/key}
  </main>
{/if}

<style>
  main {
    min-height: 100dvh;
    box-sizing: border-box;
    background: var(--bg);
  }
  .one {
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .all {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    align-content: start;
    gap: 12px;
    padding: 16px;
  }
  .cell {
    display: grid;
    grid-template-rows: minmax(140px, 1fr) auto;
    text-align: center;
    border: 1px solid var(--line);
    border-radius: 4px;
    cursor: pointer;
  }
  .cell:hover {
    border-color: var(--gold-lo);
  }
  .view {
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .label {
    padding: 0.4rem 0.6rem 0.5rem;
    color: var(--muted);
    font-size: 0.9rem;
    border-top: 1px solid var(--line);
  }
  .n {
    margin-right: 0.5em;
    font-family: var(--font-cinzel);
    color: var(--gold-lo);
  }
</style>
