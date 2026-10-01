<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { toasts, type ToastKind } from '../lib/toasts.svelte';
  import { twinkle } from '../lib/fx/moments';

  // Bottom right on wide screens. On phones the stack sits at the top instead:
  // the keyboard covers the bottom while typing a name or code, and the answer
  // buttons are down there during a game.
  const narrowQuery = '(max-width: 640px)';
  let narrow = $state(matchMedia(narrowQuery).matches);
  $effect(() => {
    const mq = matchMedia(narrowQuery);
    const update = () => (narrow = mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });
  const enter = $derived(narrow ? { y: -24, duration: 280 } : { x: 48, duration: 280 });

  // A guest's lost connection to the host stays up (with what to do about it)
  // until it's back or they leave.
  const lost = $derived(session.mode === 'client' && session.status === 'lost');

  /** Svelte action: a little sparkle as good news arrives. */
  function sparkle(node: HTMLElement, kind: ToastKind) {
    if (kind === 'info') requestAnimationFrame(() => node.isConnected && twinkle(node));
  }
</script>

{#snippet icon(kind: ToastKind)}
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    {#if kind === 'info'}
      <path class="fill" d="M12 4.5l4.5 7.5-4.5 7.5L7.5 12z" />
    {:else if kind === 'warn'}
      <path d="M12 3.8 21 19.5H3z" /><path d="M12 9.5v4.5M12 16.8v.1" />
    {:else}
      <circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" />
    {/if}
  </svg>
{/snippet}

<div class="toasts" class:narrow role="region" aria-label="Notifications" aria-live="polite">
  {#if lost}
    <div
      class="toast {session.gaveUp ? 'error' : 'warn'}"
      role="alert"
      in:fly={enter}
      out:fade={{ duration: 200 }}
    >
      {#if session.gaveUp}
        {@render icon('error')}
      {:else}
        <span class="spinner" aria-hidden="true"></span>
      {/if}
      <div class="body">
        <p>
          {#if session.gaveUp}
            Can't reach the host. The room may have closed.
          {:else}
            Connection to the host lost; reconnecting…
          {/if}
        </p>
        <div class="actions">
          <button class="btn small" onclick={() => session.reconnect()}>Retry</button>
          <button class="btn small ghost" onclick={() => session.leave()}>Leave</button>
        </div>
      </div>
    </div>
  {/if}

  {#each toasts.list as t (t.id)}
    <div
      class="toast {t.kind}"
      role={t.kind === 'error' ? 'alert' : 'status'}
      use:sparkle={t.kind}
      animate:flip={{ duration: 250 }}
      in:fly={enter}
      out:fade={{ duration: 200 }}
      onpointerenter={() => toasts.hold(t.id)}
      onpointerleave={() => toasts.release(t.id)}
    >
      {@render icon(t.kind)}
      <div class="body"><p>{t.message}</p></div>
      <button class="close" data-sfx="none" onclick={() => toasts.dismiss(t.id)} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: max(20px, env(safe-area-inset-right));
    bottom: max(20px, env(safe-area-inset-bottom));
    /* Below the effects layer (95), so a toast's sparkle draws over it. */
    z-index: 90;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.6rem;
    width: min(380px, calc(100vw - 40px));
    pointer-events: none;
  }
  /* Phones: across the top, newest first. */
  .toasts.narrow {
    top: max(8px, env(safe-area-inset-top));
    bottom: auto;
    left: max(8px, env(safe-area-inset-left));
    right: max(8px, env(safe-area-inset-right));
    width: auto;
    flex-direction: column-reverse;
    align-items: stretch;
    gap: 0.45rem;
  }

  .toast {
    --accent: var(--gold);
    --tint: rgba(201, 164, 92, 0.16);
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    width: 100%;
    padding: 0.7rem 0.6rem 0.7rem 0.85rem;
    background: linear-gradient(180deg, rgba(34, 26, 16, 0.97), rgba(14, 11, 8, 0.97));
    border: 1px solid var(--line);
    border-left: 3px solid var(--accent);
    border-radius: 3px;
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.08),
      0 0 0 1px rgba(0, 0, 0, 0.6),
      0 0 24px var(--tint),
      0 10px 30px rgba(0, 0, 0, 0.6);
    color: var(--text);
    font-size: 1rem;
    line-height: 1.35;
    pointer-events: auto;
  }
  .toast.info {
    color: var(--gold-hi);
    text-shadow: 0 0 12px rgba(241, 217, 155, 0.3);
  }
  .toast.warn {
    --accent: var(--unique-hi);
    --tint: rgba(224, 138, 68, 0.16);
  }
  .toast.error {
    --accent: var(--bad);
    --tint: rgba(224, 85, 63, 0.2);
    background: linear-gradient(180deg, rgba(48, 20, 15, 0.97), rgba(20, 9, 7, 0.97));
    color: #f3c2b6;
  }

  .icon {
    flex: none;
    width: 18px;
    height: 18px;
    margin-top: 0.12em;
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 5px var(--accent));
  }
  .icon .fill {
    fill: var(--accent);
    stroke: none;
  }
  .spinner {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 0.15em;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--gold-hi);
    animation: spin 0.8s linear infinite;
  }

  .body {
    flex: 1;
    min-width: 0;
  }
  .body p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .close {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    margin: -0.15rem 0 -0.15rem 0.1rem;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 50%;
    color: var(--muted);
    cursor: pointer;
    transition: color 0.2s;
  }
  .close:hover {
    color: var(--gold-hi);
  }
  .close svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
</style>
