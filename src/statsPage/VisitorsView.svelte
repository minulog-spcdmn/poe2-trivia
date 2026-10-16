<script lang="ts">
  // Visitors: how many came, from where, how they found the game, and on
  // what. All of it is the start page's visitors, not what they did there.
  import Bars from './Bars.svelte';
  import { fmt } from './chart';
  import Delta from './Delta.svelte';
  import { deviceOf, percent } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';
  import TrendChart from './TrendChart.svelte';

  let { read, period, weekly }: { read: Read; period: Period; weekly: boolean } = $props();

  const L = $derived(read.now);
  const countries = $derived(read.countries.map((c) => ({ label: c.name || 'Unknown', count: c.count })));
  const refs = $derived(read.refs.map((r) => ({ label: !r.name || r.name === '(unknown)' ? 'Typed in, or unknown' : r.name, count: r.count })));
  const systems = $derived(read.systems.map((s) => ({ label: s.name || 'Unknown', count: s.count })));
  const devices = $derived.by(() => {
    const by = { computer: 0, phone: 0, other: 0 };
    for (const s of read.systems) {
      const d = deviceOf(s.name);
      by[d === 'Phone or tablet' ? 'phone' : d === 'Computer' ? 'computer' : 'other'] += s.count;
    }
    return { ...by, all: by.computer + by.phone + by.other };
  });
</script>

<div class="stack">
  <Section title="Visitors a day" says="People who opened the start page, each counted once a visit.">
    {#snippet aside()}
      <div class="total">
        <b>{fmt(L.visitors.total)}</b>
        <Delta now={L.visitors.total} before={read.before.visitors.total} period={period.before} />
      </div>
    {/snippet}
    <TrendChart days={L.days} now={L.visitors.perDay} before={read.before.visitors.perDay} {weekly} what="Visitors" names={{ now: period.now, before: period.before[0].toUpperCase() + period.before.slice(1) }} height={340} />
  </Section>

  <div class="two">
    <Section title="Where they are" says="By country, as GoatCounter places them.">
      <Bars bars={countries} top={10} empty="No visitors in these days." />
    </Section>
    <Section title="How they found the game" says="The site they came from; a link in a chat app or a bookmark shows as typed in.">
      <Bars bars={refs} top={10} empty="No visitors in these days." />
    </Section>
  </div>

  <Section title="What they play on">
    {#if devices.all}
      <div class="split" aria-hidden="true">
        <i class="computer" style:flex-grow={devices.computer}></i>
        <i class="phone" style:flex-grow={devices.phone}></i>
        {#if devices.other}<i class="other" style:flex-grow={devices.other}></i>{/if}
      </div>
      <dl class="devices">
        <div><dt><i class="computer"></i>Computer</dt><dd><b>{percent(devices.computer, devices.all)}</b> {fmt(devices.computer)}</dd></div>
        <div><dt><i class="phone"></i>Phone or tablet</dt><dd><b>{percent(devices.phone, devices.all)}</b> {fmt(devices.phone)}</dd></div>
        {#if devices.other}<div><dt><i class="other"></i>Other</dt><dd><b>{percent(devices.other, devices.all)}</b> {fmt(devices.other)}</dd></div>{/if}
      </dl>
      <h3>By system</h3>
      <Bars bars={systems} top={8} />
    {:else}
      <p class="soft">No visitors in these days.</p>
    {/if}
  </Section>
</div>

<style>
  .stack {
    display: grid;
    gap: 1.25rem;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
    align-items: start;
  }
  .total {
    display: grid;
    justify-items: end;
    gap: 0.2rem;
  }
  .total b {
    font-size: 2.6rem;
    font-weight: 650;
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--a-ink);
  }
  /* Computer and phone side by side: the two shares, in gold and grey, with their names below. */
  .split {
    display: flex;
    gap: 3px;
    height: 1.6rem;
    border-radius: 3px;
    overflow: hidden;
  }
  .split i {
    flex-basis: 0;
  }
  .computer {
    background: var(--a-now);
  }
  .phone {
    background: var(--a-before);
  }
  .other {
    background: var(--a-track);
  }
  .devices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 2.5rem;
    margin: 1rem 0 1.8rem;
  }
  .devices div {
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
  }
  .devices dt {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--a-ink);
  }
  .devices dt i {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border-radius: 2px;
  }
  .devices dd {
    margin: 0;
    color: var(--a-muted);
  }
  .devices b {
    font-size: 1.4rem;
    font-weight: 650;
    color: var(--a-ink);
  }
  h3 {
    margin: 0 0 0.6rem;
    font-family: var(--font-data);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--a-muted);
  }
  .soft {
    color: var(--a-muted);
  }
  @media (max-width: 900px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
