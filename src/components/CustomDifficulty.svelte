<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { KNOB_STEPS, knobsOf, type Knobs } from '../lib/game';
  import { KNOB_TEXT } from '../lib/difficultyText';
  import { dialogBackdrop } from '../lib/behindDialog';

  let { onclose }: { onclose: () => void } = $props();

  const s = $derived(session.state!);
  const knobs = $derived(knobsOf(s.settings));

  function set(change: Partial<Knobs>) {
    session.dispatch({ type: 'settings', settings: { custom: change } });
  }

  /** Why a step has no effect with the other knobs as they are, if so. */
  const offFor = (knob: { off?: unknown }, step: unknown) =>
    (knob.off as ((v: unknown, k: Knobs) => string | undefined) | undefined)?.(step, knobs);

  let box = $state<HTMLElement>();
  onMount(() => {
    // Focus moves into the dialog and goes back where it was (the Custom button) on close.
    const before = document.activeElement as HTMLElement | null;
    box?.focus();
    return () => before?.focus?.();
  });

  /** Escape closes; Tab keeps cycling through the dialog's own buttons. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== 'Tab' || !box) return;
    const items = [...box.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const first = items[0];
    const last = items.at(-1)!;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<div class="backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={onclose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="editor panel"
    bind:this={box}
    transition:fly={{ y: 20, duration: 250 }}
    onclick={(e) => e.stopPropagation()}
    {onkeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="custom-title"
    tabindex="-1"
  >
    <header>
      <h2 id="custom-title">Custom difficulty</h2>
      <button class="close" onclick={onclose} aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </header>

    <div class="rows">
      {#each KNOB_TEXT as knob (knob.key)}
        {@const steps = KNOB_STEPS[knob.key] as readonly Knobs[typeof knob.key][]}
        {@const why = offFor(knob, knobs[knob.key])}
        <!-- The step that's picked keeps its place when it has no effect; the hint says why. -->
        <div class="row" class:idle={steps.every((step) => offFor(knob, step))}>
          <div class="text">
            <span class="name">{knob.name}</span>
            <span class="hint" class:why>{why ?? knob.hint}</span>
          </div>
          <div class="track" style:--n={steps.length} role="radiogroup" aria-label={knob.name}>
            {#each steps as step (String(step))}
              <button
                class:on={knobs[knob.key] === step}
                role="radio"
                aria-checked={knobs[knob.key] === step}
                disabled={!!offFor(knob, step)}
                title={offFor(knob, step)}
                onclick={() => set({ [knob.key]: step })}
              >
                {(knob.label as (v: typeof step) => string)(step)}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <footer>
      <button class="btn primary" onclick={onclose}>Done</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer, like the leave dialog (App.svelte). */
    z-index: 94;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .editor {
    display: flex;
    flex-direction: column;
    width: min(660px, 100%);
    max-height: calc(100dvh - 2rem);
    padding: 1.4rem 1.4rem 1.2rem;
    outline: none;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    font-size: 1.12rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.35);
    color: var(--muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .close:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .close svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .rows {
    overflow-y: auto;
    overscroll-behavior: contain;
    /* Room for the scrollbar, so it never covers a control. */
    margin: 0 -0.6rem;
    padding: 0 0.6rem;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 20rem;
    align-items: center;
    gap: 1rem;
    padding: 0.7rem 0;
    border-bottom: 1px solid rgba(59, 48, 36, 0.6);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .name {
    font-size: 1.05rem;
    color: var(--gold-hi);
  }
  .hint {
    font-size: 0.88rem;
    font-style: italic;
    line-height: 1.25;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint.why {
    color: #c99a6a;
  }

  /* One joined control per knob, every one the same width. */
  .track {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    border: 1px solid var(--line);
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }
  .track button {
    min-width: 0;
    padding: 0.5rem 0.25rem;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    white-space: nowrap;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
    transition:
      color 0.2s,
      background 0.2s;
  }
  .track button + button {
    border-left: 1px solid var(--line);
  }
  /* A knob with no effect right now keeps its step, dimmed, for when it matters again. */
  .row.idle .name {
    color: var(--muted);
  }
  .row.idle .track {
    opacity: 0.4;
  }
  .row.idle .track button:disabled {
    opacity: 1;
  }
  .track button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .track button:hover:not(.on):not(:disabled) {
    color: var(--gold-hi);
    background: rgba(201, 164, 92, 0.08);
  }
  .track button.on {
    color: #fff1cf;
    background: linear-gradient(180deg, #8a5a22, #452a0e);
    text-shadow: 0 0 10px rgba(255, 220, 160, 0.5);
    box-shadow: inset 0 1px 0 rgba(255, 230, 170, 0.3);
  }

  footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 1rem;
  }

  @media (max-width: 600px) {
    .editor {
      padding: 1.1rem 1rem 1rem;
    }
    .row {
      grid-template-columns: 1fr;
      gap: 0.45rem;
    }
    footer {
      justify-content: stretch;
    }
    footer .btn {
      flex: 1;
    }
  }
</style>
