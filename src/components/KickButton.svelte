<!-- The host's kick: a small seal, a double ring round a drawn ×, as the
     achievements' seals are a double ring round a sign. Pointed at, it warms
     to rust with a faint glow. Kicking takes two clicks (lib/kick): armed, the
     ring grows sideways into a pill and the × gives way to Kick. Same ring,
     same red, only longer. Sized by the parent: --kick-size. -->
<script lang="ts">
  import DrawnMark from './DrawnMark.svelte';

  let {
    name,
    armed = false,
    title,
    onclick,
  }: { name: string; armed?: boolean; title?: string; onclick: () => void } = $props();
</script>

<button
  class="kick"
  class:armed
  title={title ?? `Remove ${name}`}
  aria-label={armed ? `Click again to remove ${name}` : `Remove ${name}`}
  {onclick}>{#if armed}Kick{:else}<DrawnMark />{/if}</button
>

<style>
  .kick {
    --size: var(--kick-size, 24px);
    flex: none;
    width: var(--size);
    height: var(--size);
    padding: 0;
    display: inline-grid;
    place-items: center;
    overflow: hidden;
    white-space: nowrap;
    border-radius: 999px;
    border: 1px solid rgba(201, 164, 92, 0.34);
    background: radial-gradient(circle at 50% 30%, #1f160e, #0d0a07 72%);
    /* The seal's inner ring, a hair inside the outer one. */
    box-shadow:
      inset 0 0 0 2px #0d0a07,
      inset 0 0 0 2.6px rgba(201, 164, 92, 0.16);
    color: #a8987f;
    --mark-size: min(calc(var(--size) * 0.3), 9px);
    cursor: pointer;
    transition:
      width 0.22s var(--ease-out),
      color 0.2s,
      border-color 0.2s,
      background-color 0.2s,
      box-shadow 0.2s;
  }
  .kick:hover {
    color: #ff9c86;
    border-color: rgba(224, 85, 63, 0.7);
    box-shadow:
      inset 0 0 0 2px #0d0a07,
      inset 0 0 0 2.6px rgba(224, 85, 63, 0.38),
      0 0 10px rgba(224, 85, 63, 0.22);
  }
  .kick:focus-visible {
    outline: 1px solid var(--gold-hi);
    outline-offset: 2px;
  }
  .kick.armed {
    width: var(--kick-armed, 56px);
    border-color: rgba(224, 85, 63, 0.75);
    background: #2a120d;
    box-shadow: 0 0 10px rgba(224, 85, 63, 0.25);
    color: #ff9c86;
    font-family: var(--font-display);
    font-size: 0.62rem;
    font-weight: 700;
    font-style: normal;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    line-height: 1;
  }
  .kick.armed:hover {
    color: #ffd2c6;
    border-color: #e0553f;
    background: #3a170f;
  }
</style>
