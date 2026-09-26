<script lang="ts">
  import { fade } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { playerColor, preload, itemImage } from '../lib/ui';
  import Scoreboard from './Scoreboard.svelte';
  import ChooseCategory from './ChooseCategory.svelte';
  import QuestionView from './QuestionView.svelte';

  const s = $derived(session.state!);
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);
  const local = $derived(session.mode === 'local');

  // Start fetching the art the moment a question exists.
  $effect(() => {
    if (s.question) preload(itemImage(s.question.itemId));
  });

  const race = $derived(s.settings.mode === 'race');
  const bannerTitle = $derived(
    race ? `Question ${s.turnCount + 1}` : mine && !local ? 'Your turn' : `${active.name}'s turn`,
  );
</script>

<div class="game">
  <Scoreboard />

  {#key s.turnCount}
    <div class="stage" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 180 }}>
      <div class="banner" style:--c={race ? 'var(--unique-hi)' : playerColor(active.hue)}>
        <span class="rule"></span>
        <h2>{bannerTitle}</h2>
        <span class="rule"></span>
      </div>

      {#if s.phase === 'choosing'}
        <ChooseCategory />
      {:else}
        <QuestionView />
      {/if}

      {#if session.isHost && !local && !race && !active.connected && s.phase !== 'reveal'}
        <div class="skip" transition:fade>
          <span class="muted">{active.name} is disconnected.</span>
          <button class="btn small" onclick={() => session.dispatch({ type: 'skip' })}>Skip their turn</button>
        </div>
      {/if}
    </div>
  {/key}
</div>

<style>
  .game {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1rem 2.5rem;
  }
  .stage {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.2rem;
    margin: 0.6rem 0 1.4rem;
  }
  .banner h2 {
    font-size: clamp(1.5rem, 4.5vw, 2.4rem);
    font-weight: 900;
    color: var(--gold-hi);
    text-shadow:
      0 0 24px color-mix(in srgb, var(--c), transparent 40%),
      0 3px 12px rgba(0, 0, 0, 0.9);
    animation: arrive 0.9s var(--ease-out) both;
    text-align: center;
    white-space: nowrap;
  }
  .rule {
    flex: 0 1 140px;
    min-width: 16px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--c));
    animation: grow 0.9s var(--ease-out) both;
  }
  .rule:last-child {
    background: linear-gradient(270deg, transparent, var(--c));
  }
  @keyframes arrive {
    from {
      opacity: 0;
      letter-spacing: 0.4em;
      filter: blur(6px);
    }
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  .skip {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: center;
    margin-top: 1.5rem;
  }
</style>
