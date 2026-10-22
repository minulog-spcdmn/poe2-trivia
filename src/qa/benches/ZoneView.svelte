<script lang="ts">
  // The zone card bench's view (./zone.ts): the run arrives in the zone the
  // controls pick, through the game's own beginArrival (a step down into it
  // with the plunge's time to the deal), and its card plays over the frame.
  // Side by side, a card over the whole screen each would cover the rest:
  // each names its zone instead.
  import { untrack } from 'svelte';
  import ZoneCard from '../../components/zonecard/ZoneCard.svelte';
  import { ZONE_DESCENT_MS } from '../../lib/delve';
  import type { GameState } from '../../lib/game';
  import { arrival, beginArrival, endArrival, previewNext } from '../../lib/zoneArrival.svelte';
  import type { Family } from '../../lib/zoneTitle';
  import type { PieceProps } from '../bench.ts';
  import { ZONES } from './zone.ts';

  let { v, small }: PieceProps = $props();

  const label = $derived(ZONES.find((o) => o.value === v.zone)?.label);

  $effect(() => {
    if (small) return;
    const wide = v.zone === 'wide';
    const depth = wide ? 101 : Number(v.zone);
    const family = (v.family || undefined) as Family | undefined;
    const best = v.best ? depth - 1 : null;
    untrack(() => {
      // Held till the next (no timer of its own takes it away): Freeze stops it at any moment.
      previewNext({ name: wide ? 'Fathomless Firmament' : undefined, family, hold: true });
      // A run just stepped down into it: the deal a plunge away.
      const s = { phase: 'choosing', round: depth, delve: { startedAt: 1, dealAt: ZONE_DESCENT_MS } } as unknown as GameState;
      beginArrival(s, 0, { best, group: false });
    });
    return () => {
      previewNext(null);
      endArrival();
    };
  });
</script>

{#if small}
  <p class="name">{label}</p>
{:else if arrival.card}
  <ZoneCard a={arrival.card} bar={48} />
{/if}

<style>
  .name {
    margin: 0;
    padding: 1rem;
    font-family: var(--font-display);
    color: var(--gold);
    text-align: center;
  }
</style>
