<script lang="ts">
  import ArcaneCircle from '../components/ArcaneCircle.svelte';
  import ForbiddenCircle from '../components/ForbiddenCircle.svelte';
  import MonadCircle from '../components/MonadCircle.svelte';
  import RoseCircle from '../components/RoseCircle.svelte';
  import BlackSunCircle from '../components/BlackSunCircle.svelte';
  import Avatar from '../components/Avatar.svelte';

  const CIRCLES = { eye: ArcaneCircle, monad: MonadCircle, rose: RoseCircle, blackSun: BlackSunCircle, moth: ForbiddenCircle };
  const asked = new URLSearchParams(location.search).get('c') as keyof typeof CIRCLES | null;
  let which = $state<keyof typeof CIRCLES>(asked && asked in CIRCLES ? asked : 'eye');
  const Circle = $derived(CIRCLES[which]);
  let replay = $state(0);
  let mood = $state<'idle' | 'good' | 'bad'>('idle');
  let avatar = $state(true);
  let w = $state(1200);
  let h = $state(800);
  // Two side by side, each as the end screen sizes its circle; the avatar 25% of it, as the end screen has it alone.
  const px = $derived(Math.floor(Math.min(w * 0.45, h * 0.78)));
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />

<main>
  <div class="pair">
    {#each ['before', 'after'] as side (side)}
      <figure>
        <figcaption>{side === 'before' ? 'before (whole)' : 'after (hollow)'}</figcaption>
        <div class="stage" style:width="{px}px" style:height="{px}px">
          {#key `${which}${replay}${side}`}
            <Circle size="{px}px" state={mood} hollow={side === 'after'} />
          {/key}
          {#if avatar}<div class="avatar"><Avatar name="Exile" hue={30} size={Math.round(px * 0.25)} /></div>{/if}
        </div>
      </figure>
    {/each}
  </div>
  <nav>
    {#each Object.keys(CIRCLES) as name (name)}
      <button class:on={which === name} onclick={() => (which = name as keyof typeof CIRCLES)}>{name}</button>
    {/each}
    <span></span>
    <button class:on={avatar} onclick={() => (avatar = !avatar)}>Avatar</button>
    <button onclick={() => (replay += 1)}>Draw in again</button>
    <button onclick={() => (mood = 'idle')}>Idle</button>
    <button onclick={() => (mood = 'good')}>Right</button>
    <button onclick={() => (mood = 'bad')}>Wrong</button>
  </nav>
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #0a0908;
  }
  .pair {
    display: flex;
    gap: 2vw;
    align-items: center;
  }
  figure {
    margin: 0;
    display: grid;
    justify-items: center;
    gap: 6px;
  }
  figcaption {
    color: #d9a45a;
    font: 16px 'EB Garamond', serif;
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }
  .stage {
    position: relative;
    display: grid;
    place-items: center;
  }
  .avatar {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
  }
  nav {
    position: fixed;
    bottom: 12px;
    left: 50%;
    translate: -50% 0;
    display: flex;
    gap: 8px;
  }
  nav span {
    width: 16px;
  }
  button {
    font: inherit;
    padding: 4px 12px;
    color: #d9a45a;
    background: #1a1612;
    border: 1px solid #3a3024;
    cursor: pointer;
  }
  button.on {
    border-color: #d9a45a;
  }
</style>
