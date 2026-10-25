<script lang="ts">
  // What happened: what the numbers bear out by themselves, a line each
  // (insights.ts). The days far busier than usual and the site behind each;
  // the site and the country that brought far more, or far fewer, than the
  // period before, beyond how all of them moved together (insights.ts
  // moversOf). Nothing said that chance could have done.
  import { fmt, longDay, siteName } from './chart';
  import { moversOf, spikeSource, spikesOf } from './insights';
  import type { Period, Read } from './read';

  let { read, period, top = 3 }: { read: Read; period: Period; top?: number } = $props();

  const times = (v: number) => `${v.toFixed(1)}×`;

  const spikes = $derived(
    spikesOf(read.now.days, read.now.visitors.perDay, top).map((s) => ({ ...s, from: spikeSource(read.spikeRefs?.[s.day] ?? [], read.refs) })),
  );
  const refs = $derived(moversOf(read.refs, read.refsBefore ?? []));
  const places = $derived(moversOf(read.countries, read.countriesBefore ?? []));
  const none = $derived(!spikes.length && !refs.up && !refs.down && !places.up && !places.down);
</script>

{#if none}
  <p class="quiet">Nothing out of the ordinary: no day far busier than usual, and no site or country bringing far more or fewer than {period.before}, beyond how they all moved.</p>
{:else}
  <ul class="happened">
    {#each spikes as s (s.day)}
      <li class="rise">
        <span class="when">{longDay(s.day)}{s.day === read.to ? ', so far' : ''}</span>
        <span><b>{fmt(s.value)} visits</b>, {times(s.value / s.usual)} a usual day{#if s.from}; <b>{Math.round(s.from.share)}%</b> came from <b>{siteName(s.from.name)}</b>{/if}.</span>
      </li>
    {/each}
    {#if refs.up}
      <li class="rise"><span><b>{siteName(refs.up.name)}</b> brought <b>{fmt(refs.up.now)}</b> visitors, against {fmt(refs.up.before)} in {period.before}.</span></li>
    {/if}
    {#if places.up}
      <li class="rise"><span><b>{places.up.name}</b>: <b>{fmt(places.up.now)}</b> visitors, against {fmt(places.up.before)} in {period.before}.</span></li>
    {/if}
    {#if refs.down}
      <li class="fall"><span><b>{siteName(refs.down.name)}</b> brought <b>{fmt(refs.down.now)}</b> visitors, against {fmt(refs.down.before)} in {period.before}.</span></li>
    {/if}
    {#if places.down}
      <li class="fall"><span><b>{places.down.name}</b>: <b>{fmt(places.down.now)}</b> visitors, against {fmt(places.down.before)} in {period.before}.</span></li>
    {/if}
  </ul>
{/if}

<style>
  .happened {
    display: grid;
    gap: 0.7rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    gap: 0.05rem;
    padding-left: 0.9rem;
    line-height: 1.4;
    border-left: 3px solid var(--a-now);
  }
  li.fall {
    border-left-color: var(--a-down);
  }
  li.rise {
    border-left-color: var(--a-up);
  }
  .when {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--a-muted);
  }
  b {
    font-weight: 650;
    color: var(--a-ink);
  }
  .quiet {
    margin: 0;
    color: var(--a-muted);
  }
</style>
