<script lang="ts">
  // The launch countdown's view (./launch.ts): set in the middle as it is on
  // the start page, with room under it for its note. The launch is noon on its
  // day in Pacific time (an hour GGG might name), and the clock runs on from
  // the time the controls set, afresh whenever they move.
  import LaunchCountdown from '../../components/LaunchCountdown.svelte';
  import { LAUNCH_DAY } from '../../lib/launch';
  import type { PieceProps } from '../bench.ts';

  let { v }: PieceProps = $props();

  const NOON = Date.parse(`${LAUNCH_DAY}T20:00:00Z`);
  const before = $derived(((Number(v.days) * 24 + Number(v.hours)) * 60 + Number(v.minutes)) * 60_000);
  const at = $derived(v.hour ? NOON : null);
  /** A clock at `from`, running on. */
  const runFrom = (from: number) => {
    const t0 = Date.now();
    return () => from + (Date.now() - t0);
  };
</script>

<div class="corner">
  {#key `${before} ${at}`}
    <LaunchCountdown quiet={!!v.header} {at} time={runFrom(NOON - before)} />
  {/key}
</div>

<style>
  .corner {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 230px;
    padding: 20px 24px;
  }
</style>
