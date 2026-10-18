<script lang="ts" generics="T extends string | number">
  // A row of choices, one picked: the game's own (the lobby's settings),
  // square buttons side by side, the picked one lit in gold.
  let { options, value, onpick, label }: { options: readonly { value: T; name: string }[]; value: T; onpick: (v: T) => void; label: string } = $props();
</script>

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" role="radio" class:on={o.value === value} aria-checked={o.value === value} onclick={() => o.value !== value && onpick(o.value)}>{o.name}</button>
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
      padding: 0.45rem 0.6rem;
      font-size: 0.9rem;
    }
  }
</style>
