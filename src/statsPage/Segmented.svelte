<script lang="ts" generics="T extends string | number">
  // A row of choices, one picked: the game's gold-edged switch. `small` for
  // one inside a panel's header.
  let {
    options,
    value,
    onpick,
    label,
    small = false,
  }: { options: readonly { value: T; name: string }[]; value: T; onpick: (v: T) => void; label: string; small?: boolean } = $props();
</script>

<div class="seg" class:small role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" role="radio" aria-checked={o.value === value} onclick={() => o.value !== value && onpick(o.value)}>{o.name}</button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 2px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 999px;
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.05);
  }
  button {
    padding: 0.42em 1em;
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    white-space: nowrap;
    color: var(--muted);
    background: none;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    transition:
      color 0.2s,
      background-color 0.2s,
      box-shadow 0.2s;
  }
  button:hover {
    color: var(--gold-hi);
  }
  button[aria-checked='true'] {
    color: #fff6de;
    background: linear-gradient(180deg, #8a5a22, #5c3a12);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.3),
      0 0 0 1px rgba(216, 181, 110, 0.55);
    cursor: default;
  }
  .small button {
    padding: 0.32em 0.8em;
    font-size: 0.66rem;
  }
</style>
