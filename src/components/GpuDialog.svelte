<script lang="ts">
  // The notice that the browser draws the game without the GPU, and how to
  // switch hardware acceleration back on (lib/gpuNotice.svelte.ts says when
  // it comes up). A dialog in the middle of the screen, since the notice in
  // the corner it used to be went unread: what's wrong, the three steps in
  // the player's own browser, and the settings page's address to copy (a
  // page may not open a browser's settings itself). The gold button is the
  // first step of the fix; Play anyway, or Escape, is the answer that's kept.
  // It comes up by itself, perhaps under a click or a key meant for the page
  // (Escape opens the settings): a press beside it answers nothing, and its
  // own answer counts only once it has been up long enough to be seen.
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { CopyPress } from '../lib/copyPress.svelte';
  import { dialogBackdrop } from '../lib/dialogBackdrop';
  import { dialogIn, dialogOut } from '../lib/dialogIn';
  import type { AccelerationFix } from '../lib/gpuCheck';
  import { answerGpuNotice, shownFix } from '../lib/gpuNotice.svelte';
  import { typedIn } from '../lib/keybinds.svelte';
  import CopyNote from './CopyNote.svelte';

  let { fix = shownFix(), onclose = answerGpuNotice }: { fix?: AccelerationFix; onclose?: () => void } = $props();

  const press = new CopyPress(() => fix.address ?? '', 'Address copied');
  /**
   * The gold button's click copies the address as a press on it does; a
   * key's click comes from nowhere, so its note stands by the button. Not
   * before the dialog has been seen, as with its answer: a click on its way
   * to the page would write over what the player had copied (a room code).
   */
  function copy(e: MouseEvent & { currentTarget: HTMLButtonElement }) {
    if (!seen) return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = e.detail === 0 ? { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 } : e;
    const by = (e as Partial<PointerEvent>).pointerType;
    press.copy(at, !!by && by !== 'mouse');
  }

  /** How long it's up, on a page that is seen, before an answer counts (ms): its rise, and the time it takes to see it and hold back a click already on its way. */
  const SEEN_MS = 700;
  let seen = $state(false);
  const answer = () => {
    if (seen) onclose();
  };

  let panel = $state<HTMLDivElement>();
  // Focus in the dialog, and back where it was once it goes. Not out of a
  // field, though: it can come up while a name or a room code is being
  // typed, and the rest of it would go to the page's keys (an M mutes).
  onMount(() => {
    const box = panel;
    const before = document.activeElement;
    if (!typedIn(before)) box?.focus({ preventScroll: true });
    // Seen only on a page that is: come up in a tab behind another, it counts from when that tab is shown.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const shown = () => {
      clearTimeout(timer);
      if (!seen && !document.hidden) timer = setTimeout(() => (seen = true), SEEN_MS);
    };
    shown();
    document.addEventListener('visibilitychange', shown);
    // Until it has been seen Escape answers nothing: not here, and not under
    // it either, where the settings would close on it.
    const early = (e: KeyboardEvent) => {
      if (seen || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', early, { capture: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', shown);
      document.removeEventListener('keydown', early, { capture: true });
      // (Only where the dialog's going left focus nowhere: put elsewhere since, it stays there.)
      const now = document.activeElement;
      const nowhere = !now || now === document.body || !!box?.contains(now);
      if (nowhere && before instanceof HTMLElement && before !== document.body && before.isConnected) before.focus({ preventScroll: true });
    };
  });
</script>

<div class="backdrop" use:dialogBackdrop={seen ? { close: onclose, closer: '.btn.ghost, .btn.primary', beside: false } : undefined} transition:fade|global={{ duration: 150 }} role="presentation">
  <div class="gpu panel" bind:this={panel} in:dialogIn|global out:dialogOut|global role="dialog" aria-modal="true" aria-labelledby="gpu-title" tabindex="-1">
    <!-- The stone a warning's notice wears (Toasts.svelte), larger. -->
    <span class="gem" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M12 6v7.5" /><circle cx="12" cy="18" r="1.6" /></svg>
    </span>
    <h3 id="gpu-title">{fix.name} is off</h3>
    <p class="lead">Your browser is drawing the game without your graphics card, which makes it slow and choppy. Switching it on takes a few seconds.</p>

    <ol class="steps">
      <li>
        {#if fix.address}
          <!-- (A press on the address copies it only once the dialog has been seen, as the button does.) -->
          <span>Open <span class="address" class:lit={press.lit} data-copy {@attach seen && press.attach}>{fix.address}</span> in a new tab.</span>
          <CopyNote {press} />
        {:else}
          <span>Open your browser’s settings.</span>
        {/if}
      </li>
      <li><span>{fix.turnOn}</span></li>
      <li><span>{fix.restart}</span></li>
    </ol>

    <p class="again">These steps stay in the settings, under Screen.</p>

    <div class="actions">
      {#if fix.address}
        <button class="btn ghost" onclick={answer}>Play anyway</button>
        <button class="btn primary" onclick={copy}>Copy the address</button>
      {:else}
        <button class="btn primary" onclick={answer}>Got it</button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Taller than a short window, the dialog scrolls with its backdrop. */
  .backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer, like every dialog. */
    z-index: 94;
    display: flex;
    padding: 1rem;
    overflow-y: auto;
  }
  .gpu {
    width: min(480px, 100%);
    margin: auto;
    padding: 1.5rem 1.7rem 1.6rem;
    text-align: center;
  }
  /* (Focused as it opens, so keys reach it; the frame needs no ring.) */
  .gpu:focus {
    outline: none;
  }

  /* Amber, a warning's colour (Toasts.svelte .toast.warn). */
  .gem {
    --hi: #ffd5a1;
    --c: #e08a44;
    --lo: #7a3a10;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    margin: 0 auto 0.8rem;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, var(--hi), var(--c) 55%, var(--lo));
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 0 3px var(--gold-lo),
      0 0 14px rgba(224, 138, 68, 0.3),
      0 3px 8px rgba(0, 0, 0, 0.5);
  }
  .gem svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: #160e08;
    stroke-width: 2.6;
    stroke-linecap: round;
  }
  .gem circle {
    fill: #160e08;
    stroke: none;
  }

  h3 {
    color: var(--gold-hi);
    font-size: 1.25rem;
  }
  .lead {
    margin: 0.6rem 0 0;
    line-height: 1.4;
    color: var(--text);
  }

  /* The steps, set left under a hairline, each behind its number. */
  .steps {
    display: grid;
    gap: 0.6rem;
    margin: 1.1rem 0 0;
    padding: 1rem 0 0;
    border-top: 1px solid var(--line);
    list-style: none;
    counter-reset: step;
    text-align: left;
    line-height: 1.4;
    color: var(--text);
  }
  .steps li {
    display: grid;
    grid-template-columns: 1.7rem 1fr;
    align-items: baseline;
    counter-increment: step;
  }
  .steps li::before {
    content: counter(step);
    font-family: var(--font-cinzel);
    font-weight: 700;
    color: var(--gold);
  }

  /* The address, on a dark plate: a click or a tap copies it, as a code's does (lib/copyPress.svelte.ts). */
  .address {
    display: inline-block;
    padding: 0 0.5em 0.05em;
    white-space: nowrap;
    color: var(--gold-hi);
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    cursor: pointer;
    transition:
      border-color 0.2s,
      box-shadow 0.25s;
  }
  .address:hover,
  .address.lit {
    border-color: var(--gold);
    box-shadow: 0 0 12px rgba(201, 164, 92, 0.3);
  }

  .again {
    margin: 1rem 0 0;
    font-style: italic;
    color: var(--note);
  }
  .actions {
    display: flex;
    gap: 0.6rem;
    justify-content: center;
    margin-top: 1.1rem;
  }
</style>
