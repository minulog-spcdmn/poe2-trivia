<script lang="ts">
  // The privacy page over the game, in an iPhone's home-screen app only
  // (lib/legalSheet.svelte.ts): the page itself in a frame, with a way back
  // to the room above it. A modal <dialog> in the top layer, so it sits over
  // everything, and the game behind it is inert: no focus, no clicks, and no
  // keys reach the game's own handlers (stopped here, before the window).
  import { closeLegal, legalSheet } from '../lib/legalSheet.svelte';

  let dialog = $state<HTMLDialogElement>();
  let back = $state<HTMLButtonElement>();

  $effect(() => {
    if (!dialog) return;
    if (legalSheet.url && !dialog.open) {
      dialog.showModal();
      back?.focus();
    } else if (!legalSheet.url && dialog.open) dialog.close();
  });

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
  {#if legalSheet.url}
    <div class="bar">
      <button class="btn small" bind:this={back} onclick={closeLegal}>← Back to the game</button>
    </div>
    <iframe src={legalSheet.url} title="Datenschutz" onload={settle}></iframe>
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
  }
  /* Opaque over the whole page, so nothing shows through to band. */
  .sheet::backdrop {
    background: var(--bg);
  }
  .bar {
    flex: none;
    display: flex;
    align-items: center;
    padding: calc(0.6rem + env(safe-area-inset-top)) calc(1rem + env(safe-area-inset-right)) 0.6rem calc(1rem + env(safe-area-inset-left));
    border-bottom: 1px solid var(--line);
  }
  iframe {
    flex: 1;
    width: 100%;
    border: 0;
    background: var(--bg);
  }
</style>
