<script lang="ts">
  // A room code's letters, each in its own box, as the lobby shows them (and
  // the invite screen, the room it leads to). One click or long press selects
  // the whole code; selected, the letters light up in place of the browser's
  // highlight, a copy gives just the letters, and the selection can't be
  // dragged off as a picture. `hidden` shows dots (for streaming), `sparks`
  // makes each letter spark as it lands, `delay` holds back their drop (ms).
  import { glyphLanded } from '../lib/fx/moments';

  let { code, hidden = false, sparks = false, delay = 0 }: { code: string; hidden?: boolean; sparks?: boolean; delay?: number } = $props();

  let glyphs = $state<HTMLElement>();
  let selected = $state(false);
  function selectionChanged() {
    const sel = getSelection();
    selected = !!glyphs && !!sel && !sel.isCollapsed && sel.containsNode(glyphs, true);
  }

  /**
   * Each letter is its own box, so a plain copy puts line breaks (pasted as
   * spaces) between them. Copy just the letters instead.
   */
  function copyCode(e: ClipboardEvent) {
    const text = getSelection()?.toString().replace(/\s/g, '');
    if (!text || !e.clipboardData) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  }

  /** Svelte action: sparks as a letter lands (its drop is staggered by index). */
  function landing(node: HTMLElement, i: number) {
    if (!sparks) return;
    const t = setTimeout(() => glyphLanded(node), delay + 330 + i * 80);
    return { destroy: () => clearTimeout(t) };
  }
</script>

<svelte:document onselectionchange={selectionChanged} />

<!-- svelte-ignore a11y_no_static_element_interactions (the dragstart only stops a drag of the selection) -->
<span class="glyphs" class:hidden class:selected bind:this={glyphs} oncopy={copyCode} ondragstart={(e) => e.preventDefault()}>
  {#each code.split('') as ch, i (i)}
    <span class="glyph" use:landing={i} style:animation-delay="{delay + i * 80}ms" style:--i={i}>{hidden ? '•' : ch}</span>
  {/each}
</span>

<style>
  /* The boxes share the width they are given, so the letters are sized from
     it (six boxes, five gaps), never wider than a box: an M or a W must not
     be clipped. One click or long press selects the whole code. */
  .glyphs {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    container-type: inline-size;
    -webkit-user-select: all;
    user-select: all;
  }
  /* Selected, the letters light up in place of the browser's highlight. */
  .glyphs ::selection,
  .glyphs::selection {
    background: transparent;
    color: inherit;
  }
  .glyph {
    flex: 1;
    min-width: 0;
    height: clamp(58px, 14vw, 72px);
    display: grid;
    place-items: center;
    position: relative;
    overflow: hidden;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: min(2.6rem, (100cqi - 5 * 0.5rem) / 6 * 0.74);
    color: var(--gold-hi);
    background: linear-gradient(180deg, #221a11, #0d0a07);
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow:
      inset 0 0 18px rgba(201, 164, 92, 0.12),
      0 6px 18px rgba(0, 0, 0, 0.6);
    text-shadow: 0 0 16px rgba(241, 217, 155, 0.45);
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s,
      box-shadow 0.15s,
      text-shadow 0.15s;
    animation: drop 0.6s var(--ease-back) both;
  }
  .hidden .glyph {
    color: var(--gold-lo);
  }
  .selected .glyph {
    color: #fff4dc;
    border-color: var(--gold);
    background: linear-gradient(180deg, #3a2a15, #17100a);
    box-shadow:
      inset 0 0 22px rgba(241, 217, 155, 0.22),
      0 0 16px rgba(201, 164, 92, 0.35),
      0 6px 18px rgba(0, 0, 0, 0.6);
    text-shadow: 0 0 18px rgba(255, 230, 170, 0.75);
  }
  /* Light glances off the letters one after another. */
  .glyph::after {
    content: '';
    position: absolute;
    inset: -20% auto -20% -80%;
    width: 60%;
    background: linear-gradient(100deg, transparent, rgba(255, 240, 200, 0.22), transparent);
    transform: skewX(-16deg);
    animation: glance 6s ease-in-out infinite;
    animation-delay: calc(1.2s + var(--i, 0) * 0.12s);
    pointer-events: none;
  }
  @keyframes glance {
    0% {
      translate: 0 0;
    }
    18%,
    100% {
      translate: 420% 0;
    }
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-18px) rotateX(70deg);
    }
  }
  @media (max-width: 520px) {
    .glyphs {
      gap: 0.35rem;
    }
    .glyph {
      height: 54px;
    }
  }
</style>
