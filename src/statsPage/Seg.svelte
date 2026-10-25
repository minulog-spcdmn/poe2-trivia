<script lang="ts" generics="T extends string | number">
  // A row of choices, one picked: the game's own (the lobby's settings),
  // square buttons side by side, the picked one lit in gold. A radio group:
  // Tab reaches the picked one, the arrow keys (Home, End) pick along it.
  let { options, value, onpick, label }: { options: readonly { value: T; name: string }[]; value: T; onpick: (v: T) => void; label: string } = $props();

  let el = $state<HTMLElement>();
  const lit = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
  function key(e: KeyboardEvent) {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : step === undefined ? null : (lit + step + options.length) % options.length;
    if (to === null) return;
    e.preventDefault();
    if (options[to].value !== value) onpick(options[to].value);
    el?.querySelectorAll<HTMLElement>('button')[to]?.focus();
  }
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="seg" role="radiogroup" aria-label={label} bind:this={el} onkeydown={key}>
  {#each options as o, i (o.value)}
    <button type="button" role="radio" class:on={o.value === value} aria-checked={o.value === value} tabindex={i === lit ? 0 : -1} onclick={() => o.value !== value && onpick(o.value)}>{o.name}</button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  button {
    min-width: 48px;
    white-space: nowrap;
    padding: 0.5rem 0.85rem;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1rem;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
  }
  button:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  button.on {
    color: #fff1cf;
    background: linear-gradient(180deg, #8a5a22, #452a0e);
    border-color: var(--gold);
    text-shadow: 0 0 10px rgba(255, 220, 160, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.3),
      0 0 14px rgba(201, 164, 92, 0.3);
  }
  button:active {
    transform: scale(0.96);
  }
  @media (max-width: 600px) {
    button {
      min-height: 44px;
      padding: 0.45rem 0.6rem;
      font-size: 0.9rem;
    }
  }
</style>
