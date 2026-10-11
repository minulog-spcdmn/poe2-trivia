<script lang="ts">
  // "PoE2.Quest" in gold, as the start page and the invite screen head it:
  // a gradient cut into the letters, a band of light sweeping across now and
  // then, the backdrop's god rays and royal glow around it (lib/lights.ts),
  // and the odd glint. `lines`: a fine gold rule either side.
  import { fly } from 'svelte/transition';
  import { backdropDropShadow } from '../lib/backdropDropShadow';
  import { titleGlints } from '../lib/fx/moments';
  import type { Handle } from '../lib/fx/core';
  import { setHomeScene } from '../lib/lights';

  let { lines = false }: { lines?: boolean } = $props();

  /** Svelte action: the title's light, and its glints once its entrance is over. */
  function glinting(node: HTMLElement) {
    let h: Handle | null = null;
    setHomeScene(node);
    const t = setTimeout(() => (h = titleGlints(node)), 1200);
    return {
      destroy() {
        clearTimeout(t);
        h?.stop();
        setHomeScene(null);
      },
    };
  }
</script>

<h1 class:lines use:glinting in:fly={{ y: 20, duration: 800, delay: 150 }}>
  <span class="gold" use:backdropDropShadow
    >{#if lines}<span class="line"></span>{/if}PoE2.Quest{#if lines}<span class="line"></span>{/if}</span
  >
  <span class="gleam" aria-hidden="true"
    >{#if lines}<span class="line"></span>{/if}PoE2.Quest{#if lines}<span class="line"></span>{/if}</span
  >
</h1>

<style>
  h1 {
    position: relative;
    /* The gold and the gleam are two copies of the title, stacked. */
    display: grid;
    font-family: var(--font-title);
    font-size: var(--title-size, 92px);
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0.02em;
    margin-bottom: -0.3em;
  }
  h1 > span {
    grid-area: 1 / 1;
    display: flex;
    align-items: center;
    gap: 0.22em;
    /* The text is painted by its background, which ends at the padding box,
       so give the Q's tail room below the line box (the h1's negative margin
       keeps everything else in place). */
    padding-bottom: 0.3em;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .lines > span {
    justify-content: center;
  }
  /* The gold and its shadow, painted once. The gleam is a separate copy: on
     this one, every frame of the sweep would blur the shadow again. */
  .gold {
    background-image: linear-gradient(180deg, #fff1c9 0.1em, #d7b068 0.5em, #8b6526 0.95em);
    /* Drawn by the WebGL backdrop when it can (see lib/backdropDropShadow.ts). */
    --drop-shadow: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 34px rgba(224, 170, 90, 0.36));
    filter: var(--drop-shadow-paint, var(--drop-shadow));
  }
  /* A band of light sweeps across the gold every few seconds, on a layer of
     its own so its repaints leave the gold and its shadow alone. */
  .gleam {
    will-change: transform;
    background-image: linear-gradient(100deg, transparent 42%, rgba(255, 250, 232, 0.75) 50%, transparent 58%);
    background-repeat: no-repeat;
    background-size: 250% 100%;
    background-position: 160% 0;
    animation: gleam 7s ease-in-out 1.6s infinite;
  }
  .gleam .line {
    visibility: hidden;
  }
  @keyframes gleam {
    0% {
      background-position: 160% 0;
    }
    22%,
    100% {
      background-position: -60% 0;
    }
  }
  .line {
    display: block;
    flex: none;
    width: clamp(30px, 6vw, 90px);
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold));
  }
  .line:last-child {
    background: linear-gradient(270deg, transparent, var(--gold));
  }
</style>
