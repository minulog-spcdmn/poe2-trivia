<script lang="ts">
  // A Craft item as a player sees it: the game's tooltip, its name (or
  // "Unidentified" for the one to name), its picture, and its mod lines as
  // they stand (ItemDetails), its maker's with what was done to them marked.
  import NamePlate from './NamePlate.svelte';
  import ArtImage from './ArtImage.svelte';
  import ItemDetails, { type ModShown } from './ItemDetails.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import type { Look } from '../lib/craftLooks.svelte';

  let {
    name,
    sub,
    art,
    mods,
    verdict = null,
  }: {
    /** Null until it is known: "Unidentified". */
    name: string | null;
    /** The base, or before the reveal the kind of item it is. */
    sub: string;
    /** Its picture, or null while it is on its way. */
    art: Look | null;
    mods: ModShown[];
    verdict?: 'good' | 'bad' | null;
  } = $props();
</script>

<div class="tooltip" data-cursor="item" use:backdropShadow={{ fill: 'linear' }} class:good={verdict === 'good'} class:bad={verdict === 'bad'}>
  <div class="head">
    <NamePlate fit lit={!!name} />
    <div class="head-text">
      <span class="iname" class:unknown={!name}>{name ?? 'Unidentified'}</span>
      <span class="ibase">{sub}</span>
    </div>
  </div>
  <div class="art" data-cursor="art" use:backdropShadow={{ fill: 'stage' }}>
    <div class="frame">
      {#if art}
        <ArtImage src={art.url} alt={name ?? 'The item to name'} w={art.w} h={art.h} float />
      {:else}
        <span class="loading" aria-label="Loading"></span>
      {/if}
    </div>
  </div>
  <div class="mods">
    {#if mods.length}
      <ItemDetails {mods} />
    {:else}
      <p class="none">No mod lines left</p>
    {/if}
  </div>
</div>

<style>
  /* The game's tooltip, as a question shows it (QuestionView), with the mod lines under the art. */
  .tooltip {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    border: 1px solid #5a3a1c;
    --bs-fill-a: rgba(5, 4, 3, 0.92);
    --bs-fill-b: rgba(5, 4, 3, 0.92);
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-a), var(--bs-fill-b)));
    --bs1-color: transparent;
    --bs1: 0px 50px;
    --bs2: 20px 60px;
    --bs2-color: rgba(0, 0, 0, 0.7);
    box-shadow:
      0 0 0 1px #000,
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      --bs1-color 0.6s,
      border-color 0.6s;
  }
  .tooltip.good {
    border-color: #4f7a45;
    --bs1-color: rgba(150, 190, 110, 0.12);
  }
  .tooltip.bad {
    border-color: #7a3a2c;
    --bs1-color: rgba(200, 90, 60, 0.09);
  }
  .head {
    position: relative;
    flex: none;
    display: grid;
    height: 56px;
    place-items: center;
    padding: 0 3.4rem;
  }
  .head-text {
    position: relative;
    grid-area: 1 / 1;
    display: flex;
    flex-flow: row wrap;
    justify-content: center;
    align-items: baseline;
    line-height: 1.15;
    text-align: center;
  }
  .iname {
    flex-basis: 100%;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .iname.unknown {
    color: #c8c8c8;
    letter-spacing: 0.1em;
    font-size: 1rem;
    text-shadow: none;
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.88rem;
    color: #d8a26a;
    opacity: 0.85;
  }
  .art {
    position: relative;
    flex: 1 1 auto;
    display: grid;
    place-items: center;
    min-height: 90px;
    container-type: size;
    --bs-fill-a: rgba(175, 96, 37, 0.16);
    background: var(
      --bs-fill-paint,
      radial-gradient(ellipse 55% 50% at 50% 52%, var(--bs-fill-a), transparent 70%),
      radial-gradient(ellipse 80% 45% at 50% 0%, rgba(90, 110, 160, 0.1), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709)
    );
    box-shadow:
      inset 0 1px 0 rgba(201, 164, 92, 0.12),
      inset 0 0 40px rgba(0, 0, 0, 0.6);
    transition: --bs-fill-a 0.9s;
    overflow: hidden;
  }
  .tooltip.good .art {
    --bs-fill-a: rgba(150, 185, 105, 0.13);
  }
  .tooltip.bad .art {
    --bs-fill-a: rgba(200, 90, 60, 0.08);
  }
  .frame {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 84%;
    height: 86%;
    display: grid;
    place-items: center;
  }
  .frame > :global(.art-slot) {
    position: absolute;
    inset: 0;
  }
  .mods {
    flex: none;
    padding: 0.55rem 0.9rem 0.7rem;
  }
  .mods :global(.line) {
    font-size: 0.92rem;
  }
  .none {
    margin: 0;
    text-align: center;
    font-family: var(--font-tooltip);
    color: #8c8c8c;
  }
  .loading {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(201, 164, 92, 0.15);
    border-top-color: var(--gold);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      rotate: 1turn;
    }
  }
  /* On a phone the picture gives way to the lines. */
  @media (orientation: portrait) and (max-width: 640px), (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .art {
      min-height: 40px;
    }
  }
  @media (orientation: portrait) and (max-width: 640px) {
    .head {
      height: 44px;
    }
    .iname {
      font-size: 0.98rem;
    }
    .mods {
      padding: 0.35rem 0.6rem 0.45rem;
    }
    .mods :global(.line) {
      font-size: 0.8rem;
      line-height: 1.2;
    }
  }
  /* A phone on its side: the picture beside the lines, under the name. */
  @media (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .tooltip {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    .head {
      grid-column: 1 / -1;
      height: 38px;
    }
    .art {
      min-height: 0;
    }
    .mods {
      align-self: center;
      min-height: 0;
      overflow: hidden;
      padding: 0.4rem 0.6rem;
    }
    .mods :global(.line) {
      font-size: 0.78rem;
      line-height: 1.15;
    }
  }
</style>
