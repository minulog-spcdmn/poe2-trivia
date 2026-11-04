<!-- The host's kick: a small seal, a ring round a ring struck through (not
     allowed here: a kicked player is barred from the room; never the × of a
     wrong answer, nor the header's Leave, which is your own way out). One ring
     only, where the achievements' seals have two, or the sign's own ring
     would make three. Pointed at, it warms to rust with a faint glow. Kicking
     takes two clicks (lib/kick): armed, the ring grows sideways into a pill
     and the sign gives way to Kick. Same ring, same red, only longer. Sized by
     the parent: --kick-size. On a touch screen it takes a thumb's tap (44pt)
     round it, drawn no larger. -->
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
  {onclick}><span class="face">{#if armed}Kick{:else}<DrawnMark shape="banned" />{/if}</span></button
>

<style>
  /* The button is the seal's box; its face draws it (clipped, for the pill's
     word as it grows), so the box can take a larger tap round it. */
  .kick {
    --size: var(--kick-size, 24px);
    position: relative;
    flex: none;
    width: var(--size);
    height: var(--size);
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    transition: width 0.22s var(--ease-out);
  }
  .face {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    white-space: nowrap;
    border-radius: 999px;
    border: 1px solid rgba(201, 164, 92, 0.34);
    background: radial-gradient(circle at 50% 30%, #1f160e, #0d0a07 72%);
    color: #a8987f;
    /* Larger than a cross would be: the ring inside the seal needs the room to read. */
    --mark-size: min(calc(var(--size) * 0.42), 11px);
    transition:
      color 0.2s,
      border-color 0.2s,
      background-color 0.2s,
      box-shadow 0.2s;
  }
  @media (pointer: coarse) {
    .kick::before {
      content: '';
      position: absolute;
      /* (44px on screen however small a full room's row draws it: Scoreboard's --board-zoom.) */
      inset: min(0px, (var(--size) - 44px / var(--board-zoom, 1)) / 2);
      border-radius: 999px;
    }
  }
  .kick:hover .face {
    color: #ff9c86;
    border-color: rgba(224, 85, 63, 0.7);
    box-shadow: 0 0 10px rgba(224, 85, 63, 0.22);
  }
  .kick:focus-visible {
    outline: 1px solid var(--gold-hi);
    outline-offset: 2px;
    border-radius: 999px;
  }
  .kick.armed {
    width: var(--kick-armed, 56px);
  }
  .kick.armed .face {
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
  .kick.armed:hover .face {
    color: #ffd2c6;
    border-color: #e0553f;
    background: #3a170f;
  }
</style>
