<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { toasts, type ToastKind } from '../lib/toasts.svelte';
  import { playerColor } from '../lib/ui';
  import { twinkle } from '../lib/fx/moments';
  import Avatar from './Avatar.svelte';

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
  const enter = $derived(narrow ? { y: -24, duration: 320 } : { x: 56, duration: 320 });
  // Phones show fewer at once, so a burst of news can't cover the game.
  $effect(() => toasts.setMax(narrow ? 2 : 4));

  // A guest's lost connection to the host stays up (with what to do about it)
  // until it's back or they leave.
  const lost = $derived(session.mode === 'client' && session.status === 'lost');

  /** Svelte action: a little sparkle as good news arrives. */
  function sparkle(node: HTMLElement, kind: ToastKind) {
    if (kind === 'info') requestAnimationFrame(() => node.isConnected && twinkle(node));
  }
</script>

{#snippet glyph(kind: ToastKind)}
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {#if kind === 'info'}
      <path class="solid" d="M12 3.5c.7 4.9 2.6 6.8 7.5 7.5-4.9.7-6.8 2.6-7.5 7.5-.7-4.9-2.6-6.8-7.5-7.5 4.9-.7 6.8-2.6 7.5-7.5z" />
    {:else if kind === 'warn'}
      <path d="M12 6v7.5" /><circle class="solid" cx="12" cy="18" r="1.6" />
    {:else}
      <path d="M7.5 7.5l9 9M16.5 7.5l-9 9" />
    {/if}
  </svg>
{/snippet}

<div class="toasts" class:narrow role="region" aria-label="Notifications" aria-live="polite">
  {#if lost}
    <div class="toast {session.gaveUp ? 'error' : 'warn'}" role="alert" in:fly={enter} out:fade={{ duration: 200 }}>
      <span class="seal">
        {#if session.gaveUp}
          <span class="gem">{@render glyph('error')}</span>
        {:else}
          <span class="gem spin"></span>
        {/if}
      </span>
      <div class="body">
        <p class="title">{session.gaveUp ? 'Host unreachable' : 'Connection lost'}</p>
        <p class="msg">{session.gaveUp ? 'The room may have closed.' : 'Reconnecting to the host…'}</p>
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
      class:held={t.held}
      role={t.kind === 'error' ? 'alert' : 'status'}
      style:--life="{t.life}ms"
      use:sparkle={t.kind}
      animate:flip={{ duration: 260 }}
      in:fly={enter}
      out:fade={{ duration: 200 }}
      onpointerenter={() => toasts.hold(t.id)}
      onpointerleave={() => toasts.release(t.id)}
    >
      <span class="seal">
        {#if t.who}
          <Avatar name={t.who.name} hue={t.who.hue ?? 0} size={28} dim={t.who.hue === undefined} />
          {#if t.kind !== 'info'}<span class="gem badge">{@render glyph(t.kind)}</span>{/if}
        {:else}
          <span class="gem">{@render glyph(t.kind)}</span>
        {/if}
      </span>
      <div class="body">
        {#if t.title}<p class="title">{t.title}</p>{/if}
        {#if t.who}
          <p class="msg name" style:color={t.who.hue === undefined ? null : playerColor(t.who.hue)}>{t.message}</p>
        {:else}
          <p class="msg">{t.message}</p>
        {/if}
      </div>
      <button class="close" data-sfx="none" onclick={() => toasts.dismiss(t.id)} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
      <span class="fuse" aria-hidden="true"></span>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: max(22px, env(safe-area-inset-right));
    bottom: max(22px, env(safe-area-inset-bottom));
    /* Below the effects layer (95), so a toast's sparkle draws over it. */
    z-index: 90;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
    width: min(330px, calc(100vw - 44px));
    pointer-events: none;
  }
  /* Phones: across the top, newest first. */
  .toasts.narrow {
    top: max(10px, env(safe-area-inset-top));
    bottom: auto;
    left: max(10px, env(safe-area-inset-left));
    right: max(10px, env(safe-area-inset-right));
    width: auto;
    flex-direction: column-reverse;
    align-items: stretch;
    gap: 0.4rem;
  }

  /* Each kind is a stone colour: gold for news, amber for trouble, crimson for errors. */
  .toast {
    --hi: #f6e3ad;
    --c: #c9a45c;
    --lo: #6d5329;
    --glow: rgba(201, 164, 92, 0.22);
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.5rem 2.6rem 0.55rem 0.65rem;
    background:
      radial-gradient(90px 60px at 24px 50%, var(--glow), transparent 70%),
      linear-gradient(180deg, rgba(36, 29, 21, 0.97), rgba(15, 12, 9, 0.98));
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.65),
      inset 0 1px 0 rgba(255, 220, 150, 0.07),
      0 10px 26px rgba(0, 0, 0, 0.55);
    pointer-events: auto;
    animation: ignite 1.4s var(--ease-out);
  }
  .toast.warn {
    --hi: #ffd5a1;
    --c: #e08a44;
    --lo: #7a3a10;
    --glow: rgba(224, 138, 68, 0.22);
  }
  .toast.error {
    --hi: #ffbcab;
    --c: #e0553f;
    --lo: #6e1a10;
    --glow: rgba(224, 85, 63, 0.26);
    border-color: #4a2a22;
  }
  /* It arrives with a flare of its colour that settles into the panel. */
  @keyframes ignite {
    from {
      border-color: var(--c);
      box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.65),
        inset 0 1px 0 rgba(255, 220, 150, 0.07),
        0 0 24px var(--glow),
        0 10px 26px rgba(0, 0, 0, 0.55);
    }
  }
  /* A lit edge along the top, in the toast's colour. */
  .toast::after {
    content: '';
    position: absolute;
    top: -1px;
    left: 18px;
    right: 18px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--hi), transparent);
    opacity: 0.55;
    pointer-events: none;
  }
  /* The stone (or the player's avatar) on the left. */
  .seal {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
  }
  .gem {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, var(--hi), var(--c) 55%, var(--lo));
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 0 3px var(--gold-lo),
      0 0 12px var(--glow),
      0 3px 8px rgba(0, 0, 0, 0.5);
  }
  .gem svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: #160e08;
    stroke-width: 2.6;
    stroke-linecap: round;
  }
  .gem .solid {
    fill: #160e08;
    stroke: none;
  }
  /* On an avatar: a small stone in its corner says what happened to them. */
  .gem.badge {
    position: absolute;
    right: -4px;
    bottom: -3px;
    width: 14px;
    height: 14px;
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 8px var(--glow);
  }
  .gem.badge svg {
    width: 10px;
    height: 10px;
    stroke-width: 3.4;
  }
  /* Reconnecting: a dark stone with a turning arc of light. */
  .gem.spin {
    background:
      radial-gradient(circle, #120e0a 56%, transparent 58%),
      conic-gradient(from 0deg, transparent 0 55%, var(--c) 85%, var(--hi));
    animation: spin 1s linear infinite;
  }

  .body {
    flex: 1;
    min-width: 0;
  }
  .body p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .title {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    line-height: 1.25;
    color: var(--hi);
    text-shadow: 0 0 12px var(--glow);
  }
  .title + .msg {
    margin-top: 0.05rem;
  }
  .msg {
    font-size: 0.95rem;
    line-height: 1.25;
    color: var(--text);
  }
  /* A player's name, in their colour (a spectator's in gold). */
  .msg.name {
    font-weight: 500;
    color: var(--gold-hi);
  }
  .toast.error .msg {
    color: #ecd0c6;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.45rem;
  }

  /* A small round button like the header's icon buttons. */
  .close {
    position: absolute;
    top: 50%;
    right: 8px;
    translate: 0 -50%;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 50%;
    color: var(--muted);
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    cursor: pointer;
    transition:
      color 0.2s,
      border-color 0.2s,
      box-shadow 0.25s;
  }
  .close:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.1),
      0 0 12px rgba(201, 164, 92, 0.3);
  }
  .close svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  /* A line along the bottom edge that runs down until the toast goes. */
  .fuse {
    position: absolute;
    left: 10px;
    bottom: -1px;
    width: calc(100% - 20px);
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--c) 40%);
    opacity: 0.8;
    animation: burn var(--life) linear forwards;
    pointer-events: none;
  }
  .held .fuse {
    animation-play-state: paused;
  }
  @keyframes burn {
    to {
      width: 0;
    }
  }

  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
</style>
