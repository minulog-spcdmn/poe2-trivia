<script lang="ts">
  // The aura picker bench's view (./aurapicker.ts): the class sigils' picker
  // and the auras' under it, as on the achievements page, the auras as the
  // controls set them, stored in the frame's own storage first and drawn
  // afresh once they are.
  import AuraPicker from '../../components/AuraPicker.svelte';
  import SigilPicker from '../../components/SigilPicker.svelte';
  import type { PieceProps } from '../bench.ts';
  import { WORN, type AuraKind } from '../../lib/auraKinds.ts';
  import { serializeAuras, type AuraStore } from '../../lib/auraStore.ts';
  import { writeStored } from '../../lib/storage.ts';

  let { v }: PieceProps = $props();
  /** When they were found: a fixed day, so every state is the same. */
  const AT = Date.UTC(2026, 10, 1);
  /** The auras as stored, by their controls: the picker reads them as it mounts. */
  let stored = $state('');
  $effect.pre(() => {
    const kinds = WORN.slice(0, Number(v.found));
    const s: AuraStore = { owned: Object.fromEntries(kinds.map((k, i) => [k, { at: AT + i * 60_000 }])), worn: v.worn ? (kinds.at(-1) ?? null) : null };
    writeStored('auras', serializeAuras(s));
    stored = `${v.found}:${v.worn}`;
  });
  let aura = $state<AuraKind | null>(null);
  const strip = $derived(!!v.strip);
</script>

<div class="page" class:strip>
  {#key stored}{#if stored}
      <SigilPicker achievements={0} {strip} {aura} />
      <AuraPicker {strip} bind:worn={aura} />
    {/if}{/key}
</div>

<style>
  .page {
    width: min(760px, 100%);
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }
  .page.strip {
    width: min(1100px, 100%);
  }
</style>
