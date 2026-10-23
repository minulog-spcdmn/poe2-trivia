<script lang="ts">
  // The privacy page over the game, in an iPhone's home-screen app only
  // (lib/legalSheet.svelte.ts): the page itself in a frame, with a way back
  // to the room above it. A modal <dialog> in the top layer, so it sits over
  // everything, and the game behind it is inert: no focus, no clicks, and no
  // keys reach the game's own handlers (stopped here, before the window).
  import { closeLegal, legalSheet } from '../lib/legalSheet.svelte';
  import { motion } from '../lib/motion.svelte';
  import { tick, untrack } from 'svelte';

  let dialog = $state<HTMLDialogElement>();
  let back = $state<HTMLButtonElement>();
  /** The page shown: kept while the sheet goes, so it doesn't empty first. */
  let shown = $state<string | null>(null);
  /** Going: the sheet sinks away before it closes. */
  let going = $state(false);
  /** How long it takes to go (its .going styles). */
  const GO_MS = 220;
  let goTimer: ReturnType<typeof setTimeout> | undefined;

  // It rises over the game from just below, as the game's dialogs do
  // (lib/dialogIn.ts), and sinks back as it goes.
  $effect(() => {
    if (!dialog) return;
    if (legalSheet.url) {
      clearTimeout(goTimer);
      shown = legalSheet.url;
      going = false;
      if (!dialog.open) {
        dialog.showModal();
        // (Once the bar it's in is drawn: `shown` was only just set.)
        void tick().then(() => back?.focus());
      }
    } else if (dialog.open && !untrack(() => going)) {
      if (motion.still) return close();
      going = true;
      goTimer = setTimeout(close, GO_MS);
    }
  });
  function close() {
    going = false;
    shown = null;
    dialog?.close();
  }

  /** Escape, wherever it is pressed: in the frame too, whose keys never reach this page. */
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLegal();
    }
  };

  /**
   * The page's own "back to the game" would load the game in the frame: the
   * bar above does that. Anything not this site's own pages (other sites,
   * mail) opens outside the frame.
   */
  function settle(e: Event) {
    try {
      const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
      if (!doc) return;
      doc.querySelector<HTMLElement>('.back')?.remove();
      for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        if (new URL(a.href, doc.baseURI).origin !== location.origin) a.target = '_blank';
      }
      doc.addEventListener('keydown', onKey);
    } catch {
      /* (Not this site's page: left as it is.) */
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  class="sheet"
  aria-label="Datenschutz"
  class:going
  bind:this={dialog}
  oncancel={(e) => {
    e.preventDefault();
    closeLegal();
  }}
  onkeydown={(e) => {
    onKey(e);
    e.stopPropagation();
  }}
>
  {#if shown}
    <div class="bar">
      <button class="btn small back" bind:this={back} onclick={closeLegal}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" /></svg>
        Back to the game
      </button>
    </div>
    <iframe src={shown} title="Datenschutz" onload={settle}></iframe>
  {/if}
</dialog>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    flex-direction: column;
    background: var(--bg);
    color: var(--text);
  }
  .sheet[open] {
    display: flex;
    animation: sheet-in 0.48s var(--ease-out);
  }
  /* (Its rise let go of, should it go before it's up, so this shows.) */
  .sheet.going {
    animation: none;
    opacity: 0;
    translate: 0 14px;
    transition:
      opacity 0.22s ease-in,
      translate 0.22s ease-in;
  }
  @keyframes sheet-in {
    from {
      opacity: 0;
      translate: 0 18px;
    }
    40% {
      opacity: 1;
    }
  }
  .sheet::backdrop {
    animation: sheet-dark 0.3s ease-out;
  }
  .sheet.going::backdrop {
    opacity: 0;
    transition: opacity 0.22s ease-in;
  }
  @keyframes sheet-dark {
    from {
      opacity: 0;
    }
  }
  :global(:root[data-still]) .sheet[open],
  :global(:root[data-still]) .sheet::backdrop {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet[open],
    .sheet::backdrop {
      animation: none;
    }
  }
  /* Opaque over the whole page, so nothing shows through to band. */
  .sheet::backdrop {
    background: var(--bg);
  }
  .bar {
    flex: none;
    display: flex;
    align-items: center;
    position: relative;
    padding: calc(0.6rem + env(safe-area-inset-top)) calc(1rem + env(safe-area-inset-right)) 0.6rem calc(1rem + env(safe-area-inset-left));
    border-bottom: 1px solid rgba(125, 99, 51, 0.22);
  }
  /* The game's header's hairline, brightest in the middle (App.svelte). */
  .bar::after {
    content: '';
    position: absolute;
    left: 10%;
    right: 10%;
    bottom: -1px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(224, 138, 68, 0.55), rgba(241, 217, 155, 0.7), rgba(224, 138, 68, 0.55), transparent);
    pointer-events: none;
  }
  /* An engraved chevron before the words, as the header's marks are drawn. */
  .back {
    padding-left: 0.7em;
    gap: 0.35em;
  }
  .back svg {
    width: 1.35em;
    height: 1.35em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  iframe {
    flex: 1;
    width: 100%;
    border: 0;
    background: var(--bg);
  }
</style>
