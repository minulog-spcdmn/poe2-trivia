<script lang="ts">
  // The graphics notice's view (./gpu.ts): the dialog with the steps of the
  // browser picked, whatever browser the desk itself runs in. Answered, it
  // opens again (nothing is kept: the bench's close is its own). Side by
  // side (All states) each cell shows its browser's steps still: a dialog
  // covers the whole page, so five live ones would lie on top of each other.
  import GpuDialog from '../../components/GpuDialog.svelte';
  import { accelerationFix, GENERAL_FIX } from '../../lib/gpuCheck';
  import type { PieceProps } from '../bench.ts';

  let { v, small }: PieceProps = $props();

  /** What each browser says it is, as far as the fix goes by it (lib/gpuCheck.ts accelerationFix). */
  const SAYS: Record<string, string> = {
    chrome: 'Chrome/141.0.0.0 Safari/537.36',
    edge: 'Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    opera: 'Chrome/141.0.0.0 Safari/537.36 OPR/120.0.0.0',
    firefox: 'Gecko/20100101 Firefox/143.0',
    other: 'SomeBrowser/1.0',
  };
  const browser = $derived(String(v.browser));
  const fix = $derived(accelerationFix(SAYS[browser] ?? '') ?? GENERAL_FIX);
  let opened = $state(0);
</script>

{#if small}
  <ol class="still">
    <li>{fix.address ? `Open ${fix.address} in a new tab.` : 'Open your browser’s settings.'}</li>
    <li>{fix.turnOn}</li>
    <li>{fix.restart}</li>
  </ol>
{:else}
  {#key `${browser}:${opened}`}
    <GpuDialog {fix} onclose={() => opened++} />
  {/key}
{/if}

<style>
  /* The steps on the dialog's own stone, at a cell's size. */
  .still {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0.7rem 0.9rem 0.7rem 2.2rem;
    background: linear-gradient(180deg, rgba(36, 29, 21, 0.97), rgba(15, 12, 9, 0.98));
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--text);
    font-size: 0.95rem;
    line-height: 1.4;
    text-align: left;
  }
  .still li::marker {
    font-family: var(--font-cinzel);
    font-weight: 700;
    color: var(--gold);
  }
</style>
