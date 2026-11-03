<script lang="ts">
  // Visitors: how many came, how far a visit got (a first visit's too) and
  // how long it stayed, whether they came back to a save and by the week
  // they first played, from where, how they found the game, and on what.
  // Visits and the steps they reach are each counted once a visitor in eight
  // hours, so the shares here are of people; each share is read from the
  // day the game began counting it (insights.ts), and set against the
  // period before, a line on its bar.
  import Bars from './Bars.svelte';
  import { freshOf } from './changes';
  import { average, fmt, restsOn, shortDay, siteName } from './chart';
  import Delta from './Delta.svelte';
  import Cohorts from './Cohorts.svelte';
  import { FIRST_JOURNEY, JOURNEY, OPENED, STAY, appShare, beforeShare, backShare, comersOf, firstStepsOf, journeyOf, reachedOf, recentCohorts, reachedShare, shareOf, type FirstSteps, type Reached } from './insights';
  import { RETURNS, RETURN_NAMES, dayAverages, deviceOf, percent, type Reach } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';
  import Shares, { type ShareRow } from './Shares.svelte';
  import { deviceLink, placeLink, systemLink } from './slices';
  import How from './How.svelte';
  import TrendChart from './TrendChart.svelte';
  import { untrack, type Snippet } from 'svelte';

  let { read, period, weekly }: { read: Read; period: Period; weekly: boolean } = $props();

  const L = $derived(read.now);
  const B = $derived(read.before);
  const countries = $derived(read.countries.map((c) => ({ label: c.name || 'Unknown', count: c.count })));
  const refs = $derived(read.refs.map((r) => ({ label: !r.name || r.name === '(unknown)' ? 'Typed in, or unknown' : siteName(r.name), count: r.count })));
  const campaigns = $derived((read.campaigns ?? []).map((c) => ({ label: c.name || 'Unknown', count: c.count })));
  /** The share of visits that came with no site. */
  const unsourced = $derived.by(() => {
    const all = read.refs.reduce((n, r) => n + r.count, 0);
    return all ? read.refs.filter((r) => !r.name || r.name === '(unknown)').reduce((n, r) => n + r.count, 0) / all : 0;
  });
  /** Visits a day over the whole days (today's left out), against the period before's. */
  const perDay = $derived(dayAverages(L.visitors.perDay, B.visitors.perDay));
  const systems = $derived(read.systems.map((s) => ({ label: s.name || 'Unknown', count: s.count })));
  const devices = $derived.by(() => {
    const by = { computer: 0, phone: 0, other: 0 };
    for (const s of read.systems) {
      const d = deviceOf(s.name);
      by[d === 'Phone or tablet' ? 'phone' : d === 'Computer' ? 'computer' : 'other'] += s.count;
    }
    return { ...by, all: by.computer + by.phone + by.other };
  });

  let innerWidth = $state(1400);
  let innerHeight = $state(900);
  /** A monitor on its side. */
  const upright = $derived(innerHeight > innerWidth && innerWidth >= 900 && innerHeight >= 1500);
  /**
   * A big monitor, or one on its side: a column of sections each, coming
   * back beside the visits. The view is taller than one screen even so (a
   * first visit's thirteen steps, the lists), so the chart isn't fitted to
   * the screen, which would only squeeze it: it takes what its column has
   * left beside the tallest, up to a height that still reads as a chart in
   * a narrow column.
   */
  const columns = $derived.by((): Snippet[][] | null => {
    if (upright) return [[visits, comeBack, byWeek, whereFrom], [howFar, howLong, found, playOn]];
    if (innerWidth >= 1900) return [[visits, comeBack, byWeek], [howFar, howLong], [whereFrom, found, playOn]];
    return null;
  });
  /** The chart's own height: 340px at the root's 16px, grown with the type on a big monitor. */
  const base = $derived(columns ? Math.round((340 / 16) * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)) : 340);
  /** Each column's height, the chart at its own. */
  let heights = $state<number[]>([]);
  let chartH = $state(340);
  $effect(() => {
    const others = Math.max(0, ...heights.slice(1, columns?.length));
    if (!columns || !heights[0]) return void (chartH = base);
    const own = heights[0] - untrack(() => chartH) + base;
    chartH = Math.round(Math.max(base, Math.min(innerHeight * (upright ? 0.3 : 0.42), base + others - own)));
  });
  /** What a step's share is of: page loads once those were counted, visits before (insights.ts reachedOf). */
  const loads = (r: Reached) => (r.paged ? 'page loads' : 'visits');

  /** Whether the period before's share was counted from its first day: one counted only from a later day rests on those days alone, and isn't set against. */
  const whole = (r: { from: string | null }) => r.from !== null && r.from === B.days[0];
  /** Each step's share, against the period before's where that was a share of the same (beforeShare), over all its days. */
  const rowsOf = (steps: readonly { step: Reach; name: string }[], now: Reached, was: Reached): ShareRow[] =>
    steps.map((s) => ({ name: s.name, count: now.counts[s.step] ?? null, share: reachedShare(now, s.step), before: whole(was) ? beforeShare(now, was, s.step) : null, of: { now: now.visitors, before: was.visitors } }));
  /** " Counted since Oct 17." where a step was first counted inside the period. */
  const since = (r: { from: string | null }) => (r.from && r.from > read.from ? ` Counted since ${shortDay(r.from)}.` : '');

  const journey = $derived(journeyOf(L));
  const journeyRows = $derived(rowsOf(JOURNEY, journey, journeyOf(B)));
  /** A first visit's steps, each a share of the visits that found no save. */
  const firsts = $derived(firstStepsOf(L));
  /** " The start page's steps since Oct 28." where those (LATER_FIRSTS' first group) were first counted inside the period, after the rest. */
  const laterSince = $derived.by(() => {
    const from = firsts.steps.acted.from;
    return from && from !== firsts.from && from > read.from ? ` The start page's steps, pressing a control to a practice answer, since ${shortDay(from)}.` : '';
  });
  const firstRows = $derived.by((): ShareRow[] => {
    const was = firstStepsOf(B);
    // Each step from the day it was counted (FirstSteps steps): the ones added later aren't a share of the days before them.
    const of = (f: FirstSteps, step: (typeof FIRST_JOURNEY)[number]['step']) => (f.steps[step].from ? shareOf(f.counts[step], f.steps[step].visits) : null);
    return FIRST_JOURNEY.map((s) => ({
      name: s.name,
      count: firsts.steps[s.step].from ? firsts.counts[s.step] : null,
      share: of(firsts, s.step),
      before: whole(was.steps[s.step]) ? of(was, s.step) : null,
      of: { now: firsts.steps[s.step].visits, before: was.steps[s.step].visits },
    }));
  });
  const stay = $derived(reachedOf(L, STAY.map((s) => s.step)));
  const stayRows = $derived(rowsOf(STAY, stay, reachedOf(B, STAY.map((s) => s.step))));
  const opened = $derived(reachedOf(L, OPENED.map((s) => s.step)));
  const openedRows = $derived(rowsOf(OPENED, opened, reachedOf(B, OPENED.map((s) => s.step))));

  const cohorts = $derived(recentCohorts(L.cohorts, read.to));
  /** Weeks only once one was counted from its Monday: before that a row is visits without the 100 they're for. */
  const countable = $derived(cohorts.some((c) => c.started !== null));
  const comers = $derived(comersOf(L));
  const comersWas = $derived(comersOf(B));
  const back = $derived(backShare(comers));
  const app = $derived(appShare(comers));
  /** New or back after so long, each a share of those told apart. */
  const comerRows = $derived.by((): ShareRow[] => {
    const told = (w: typeof comers) => w.fresh + w.returned;
    const row = (name: string, n: (w: typeof comers) => number): ShareRow => ({
      name,
      count: comers.from ? n(comers) : null,
      share: comers.from ? shareOf(n(comers), told(comers)) : null,
      before: whole(comersWas) ? shareOf(n(comersWas), told(comersWas)) : null,
      of: { now: told(comers), before: told(comersWas) },
    });
    return [row('No save, here or paired', (w) => w.fresh), ...RETURNS.map((r) => row(RETURN_NAMES[r], (w) => w.back[r]))];
  });
</script>

{#snippet visits()}
  <Section title="Visits a day" says="Visits to the start page each day; {fmt(L.visitors.total)} in all." area="chart">
    {#snippet aside()}
      <div class="total">
        <b>{perDay.now === null ? '–' : average(perDay.now)}</b>
        <span class="soft">a day on average</span>
        <Delta now={perDay.now} before={perDay.before} digits={1} of={perDay.of} period={period.before} />
      </div>
    {/snippet}
    <TrendChart days={L.days} now={L.visitors.perDay} before={B.visitors.perDay} {weekly} what="Visits" names={{ now: period.now, before: period.before[0].toUpperCase() + period.before.slice(1) }} height={chartH} />
  </Section>
{/snippet}

{#snippet comeBack()}
  <Section title="Who comes back" says="New, or back to a save, and how long since they last played.{since(comers)}" area="back">
    {#if comers.from}
      <div class="total left">
        <b>{percent(comers.returned, comers.fresh + comers.returned)}</b>
        <span class="soft">came back to their save</span>
        <Delta now={back} before={whole(comersWas) ? backShare(comersWas) : null} rate of={{ now: comers.fresh + comers.returned, before: comersWas.fresh + comersWas.returned }} period={period.before} />
      </div>
      <Shares rows={comerRows} head="Who" label="Visits with no save, and back to one" />
    {:else}
      <p class="soft">Not counted in these days.</p>
    {/if}
  </Section>
{/snippet}

{#snippet byWeek()}
  {#if countable}
    <Section title="By the week they first played" says="Visits each week after, for every 100 who first played that week." area="cohorts">
      <Cohorts cohorts={cohorts} />
    </Section>
  {/if}
{/snippet}

{#snippet howFar()}
  <Section title="How far a visit gets" says="The share of {loads(journey)} that got each step along.{since(journey)}" area="journey">
    {#if journey.from}
      <Shares rows={journeyRows} head="Step" counted={journey.paged ? 'Page loads' : 'Visits'} label="{journey.paged ? 'Page loads' : 'Visits'} by how far they got" />
    {:else}
      <p class="soft">Not counted in these days.</p>
    {/if}
    {#if firsts.from}
      <h3>A first visit</h3>
      <p class="hint">Visits that found no save: mostly first visits.{since(firsts)}{laterSince}</p>
      <Shares rows={firstRows} head="Step" label="First visits by how far they got" />
    {/if}
  </Section>
{/snippet}

{#snippet howLong()}
  <Section title="How long they stay" says="The share of {loads(stay)} with the game on screen this long.{since(stay)}" area="stay">
    {#if stay.from}
      <Shares rows={stayRows} head="On screen" counted={stay.paged ? 'Page loads' : 'Visits'} label="{stay.paged ? 'Page loads' : 'Visits'} by how long they stayed" />
    {:else}
      <p class="soft">Not counted in these days.</p>
    {/if}
    <h3>What else they open</h3>
    {#if opened.from}
      <Shares rows={openedRows} head="Opened" counted={opened.paged ? 'Page loads' : 'Visits'} label="{opened.paged ? 'Page loads' : 'Visits'} that opened the codex or the achievements" />
    {:else}
      <p class="soft">Nobody opened the codex or the achievements in these days.</p>
    {/if}
    {#if L.sync.paired || B.sync.paired}
      <p class="line"><b>{fmt(L.sync.paired)}</b> {L.sync.paired === 1 ? 'device' : 'devices'} paired to sync. <Delta now={L.sync.paired} before={B.sync.paired} period={period.before} /></p>
    {/if}
  </Section>
{/snippet}

{#snippet whereFrom()}
  <Section title="Where they are" says="Visits by country." area="where">
    <Bars bars={countries} top={10} empty="No visitors in these days." link={placeLink} fresh={freshOf(read.changes, read.at, 'countries')} />
  </Section>
{/snippet}

{#snippet found()}
  <Section title="How they found the game" says="Visits by the site they came from." area="found">
    <Bars bars={refs} top={10} empty="No visitors in these days." />
    {#if unsourced > 0.5}
      <p class="hint">Most came with no site: a chat app's link or a bookmark has none. A link tagged poe2.quest/?ref=… says where it was posted.</p>
    {/if}
    {#if campaigns.length}
      <h3>Tagged links</h3>
      <p class="hint">Visits by the tag of their link (poe2.quest/?ref=…).</p>
      <Bars bars={campaigns} top={6} />
    {/if}
  </Section>
{/snippet}

{#snippet playOn()}
  <Section title="What they play on" area="on">
    {#if devices.all}
      <div class="split" aria-hidden="true">
        <i class="computer" style:flex-grow={devices.computer}></i>
        <i class="phone" style:flex-grow={devices.phone}></i>
        {#if devices.other}<i class="other" style:flex-grow={devices.other}></i>{/if}
      </div>
      <dl class="devices">
        <div><dt><i class="computer"></i><a class="pick" href={deviceLink('Computer')}>Computer</a></dt><dd><b>{percent(devices.computer, devices.all)}</b> {fmt(devices.computer)}</dd></div>
        <div><dt><i class="phone"></i><a class="pick" href={deviceLink('Phone or tablet')}>Phone or tablet</a></dt><dd><b>{percent(devices.phone, devices.all)}</b> {fmt(devices.phone)}</dd></div>
        {#if devices.other}<div><dt><i class="other"></i>Other</dt><dd><b>{percent(devices.other, devices.all)}</b> {fmt(devices.other)}</dd></div>{/if}
      </dl>
      {#if app !== null}
        <p class="line app"><b>{Math.round(app)}%</b> opened it as the installed app, from a home screen{restsOn(comers.app, comers.visitors, comers.from && comers.from > read.from ? comers.from : null)}; the rest in a browser. <Delta now={app} before={whole(comersWas) ? appShare(comersWas) : null} rate of={{ now: comers.visitors, before: comersWas.visitors }} period={period.before} /></p>
      {/if}
      <h3>By system</h3>
      <Bars bars={systems} top={8} link={systemLink} fresh={freshOf(read.changes, read.at, 'systems')} />
    {:else}
      <p class="soft">No visitors in these days.</p>
    {/if}
  </Section>
{/snippet}

<svelte:window bind:innerWidth bind:innerHeight />

<div class="stack">
  {#if columns}
    <div class="columns" style:--columns={columns.length}>
      {#each columns as column, i (i)}
        <div class="column" bind:clientHeight={heights[i]}>
          {#each column as part (part)}{@render part()}{/each}
        </div>
      {/each}
    </div>
  {:else}
    {@render visits()}
    <div class="two">
      {@render comeBack()}
      {@render playOn()}
    </div>
    <!-- The whole width: a column for each of eight weeks. -->
    {@render byWeek()}
    <div class="two">
      {@render howFar()}
      {@render howLong()}
    </div>
    <div class="two">
      {@render whereFrom()}
      {@render found()}
    </div>
  {/if}

  <How
    items={[
      'A visit counts a person once in 8 hours, so someone who comes back every day counts every day.',
      'Steps count every player in a seat, hosts and guests alike; a reload counts as a load.',
      'New or back: a visit within 8 hours of the last play is neither, so those shares are of the visits that are one or the other. A save counts with what paired devices synced to it.',
      "Safari on iPhone and iPad clears a save after about a week away, so iOS can't show anyone coming back after a week.",
      'A link in a chat app or a bookmark has no site, so it shows as typed in.',
      cohorts.length > 0 && !countable && 'Visits by the week players first played show once a week has been counted from its Monday (weeks are cut in UTC).',
      countable && 'By the week they first played: not a percent, as a keen player visits several times a week. A week begun before the period has its visits alone, in grey italics. The week still going has only its days so far, and is marked so. Weeks are cut in UTC.',
      'A change is coloured where chance alone would move it that far about 1 time in 20. Each row is tested on its own, so a table of thirty rows shows one or two coloured by chance.',
    ]}
  />
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
  /* A section's own figure, above what it breaks down. */
  .total.left {
    justify-items: start;
    margin-bottom: 1.2rem;
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
    margin: 1.8rem 0 0.6rem;
    font-family: var(--font-data);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--a-muted);
  }
  .devices + h3,
  .app + h3 {
    margin-top: 0;
  }
  .line {
    margin: 1.2rem 0 0;
    color: var(--a-text);
  }
  .line.app {
    margin: -0.6rem 0 1.8rem;
  }
  .line b {
    font-weight: 650;
    color: var(--a-ink);
  }
  .hint {
    margin: -0.3rem 0 0.4rem;
    font-size: 0.95rem;
    color: var(--a-muted);
  }
  .soft {
    color: var(--a-muted);
  }
  /* One column: coming back straight under the visits, what they play on last. */
  @media (max-width: 900px) {
    .two {
      display: contents;
    }
    .stack > :global(.section[data-area='cohorts']) {
      order: 1;
    }
    .two > :global(.section) {
      order: 2;
    }
    .two > :global(.section[data-area='back']) {
      order: 0;
    }
    .two > :global(.section[data-area='on']) {
      order: 3;
    }
    .stack > :global(.how) {
      order: 4;
    }
  }
  /* A big monitor, or one on its side: a column of sections each, each as tall as its sections. */
  .columns {
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    align-items: start;
    gap: 1.25rem;
  }
  .column {
    display: grid;
    gap: 1.25rem;
  }
  /* Rows a little closer, and the names each on a line, so the view keeps to the screen. */
  .columns :global(.table th),
  .columns :global(.table td) {
    padding-top: 0.4rem;
    padding-bottom: 0.4rem;
  }
  .columns :global(.bars li) {
    padding: 0.3rem 0;
  }
</style>
