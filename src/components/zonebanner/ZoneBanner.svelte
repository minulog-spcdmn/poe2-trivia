<script lang="ts">
  // A zone banner (one of the three designs in ./concepts) laid over the head
  // of the stage (Game.svelte's .head, which it fills). `leaving` plays its
  // exit; its owner removes it `conceptOf(concept).exit` ms later. With
  // reduced motion or the effects off, nothing is drawn or moves: it simply
  // fades in and out.
  import { onMount } from 'svelte';
  import Chisel from './Chisel.svelte';
  import Threshold from './Threshold.svelte';
  import Embers from './Embers.svelte';
  import { quiet } from './head';
  import type { ConceptId } from './concepts';

  let {
    concept,
    title,
    sigil,
    accent,
    leaving = false,
  }: {
    concept: ConceptId;
    /** The zone's name, or "Deeper than ever". */
    title: string;
    /** The zone whose sigil it bears (a stratum's name, lib/descent). */
    sigil: string;
    /** The zone's colour (lib/descent accentAt). */
    accent: string;
    leaving?: boolean;
  } = $props();

  let host: HTMLElement;
  const still = quiet();

  onMount(() => {
    if (still) host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'ease-out' });
  });
  $effect(() => {
    if (still && leaving) host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: 'ease-in', fill: 'forwards' });
  });

  const Design = $derived({ chisel: Chisel, threshold: Threshold, embers: Embers }[concept]);
</script>

<div class="host" bind:this={host}>
  <Design {title} {sigil} {accent} {leaving} {still} />
</div>

<style>
  .host {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }
</style>
