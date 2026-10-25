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
  const firstRows = $derived.by((): ShareRow[] => {
    const was = firstStepsOf(B);
    const of = (f: FirstSteps, step: (typeof FIRST_JOURNEY)[number]['step']) => (f.from ? shareOf(f.counts[step], f.visits) : null);
    return FIRST_JOURNEY.map((s) => ({ name: s.name, count: firsts.from ? firsts.counts[s.step] : null, share: of(firsts, s.step), before: whole(was) ? of(was, s.step) : null, of: { now: firsts.visits, before: was.visits } }));
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

<div class="stack">
  <Section title="Visits a day" says="Visits to the start page each day; {fmt(L.visitors.total)} in all." area="chart">
    {#snippet aside()}
      <div class="total">
        <b>{perDay.now === null ? '–' : average(perDay.now)}</b>
        <span class="soft">a day on average</span>
        <Delta now={perDay.now} before={perDay.before} digits={1} of={perDay.of} period={period.before} />
      </div>
    {/snippet}
    <TrendChart days={L.days} now={L.visitors.perDay} before={B.visitors.perDay} {weekly} what="Visits" names={{ now: period.now, before: period.before[0].toUpperCase() + period.before.slice(1) }} height={340} />
  </Section>

  <div class="two">
    <Section title="How far a visit gets" says="The share of visits that got each step along.{since(journey)}" area="journey">
      {#if journey.from}
        <Shares rows={journeyRows} head="Step" label="Visits by how far they got" />
      {:else}
        <p class="soft">Not counted in these days.</p>
      {/if}
      {#if firsts.from}
        <h3>A first visit</h3>
        <p class="hint">Visits that found no save: mostly first visits.{since(firsts)}</p>
        <Shares rows={firstRows} head="Step" label="First visits by how far they got" />
      {/if}
    </Section>

    <Section title="How long they stay" says="The share of visits with the game on screen this long.{since(stay)}" area="stay">
      {#if stay.from}
        <Shares rows={stayRows} head="On screen" label="Visits by how long they stayed" />
      {:else}
        <p class="soft">Not counted in these days.</p>
      {/if}
      <h3>What else they open</h3>
      {#if opened.from}
        <Shares rows={openedRows} head="Opened" label="Visits that opened the codex or the achievements" />
      {:else}
        <p class="soft">Nobody opened the codex or the achievements in these days.</p>
      {/if}
      {#if L.sync.paired || B.sync.paired}
        <p class="line"><b>{fmt(L.sync.paired)}</b> {L.sync.paired === 1 ? 'device' : 'devices'} paired to sync. <Delta now={L.sync.paired} before={B.sync.paired} period={period.before} /></p>
      {/if}
    </Section>
  </div>

  <div class="two">
    <Section title="Where they are" says="Visits by country." area="where">
      <Bars bars={countries} top={10} empty="No visitors in these days." link={placeLink} fresh={freshOf(read.changes, read.at, 'countries')} />
    </Section>
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
  </div>

  <div class="two">
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
  </div>

  {#if countable}
    <!-- The whole width: a column for each of eight weeks. -->
    <Section title="By the week they first played" says="Visits each week after, for every 100 who first played that week." area="cohorts">
      <Cohorts cohorts={cohorts} />
    </Section>
  {/if}

  <How
    items={[
      'A visit counts a person once in 8 hours, so someone who comes back every day counts every day.',
      'Steps count every player in a seat, hosts and guests alike; a reload counts as a load.',
      'New or back: a visit within 8 hours of the last play is neither, so those shares are of the visits that are one or the other. A save counts with what paired devices synced to it.',
      "Safari on iPhone and iPad clears a save after about a week away, so iOS can't show anyone coming back after a week.",
      'A link in a chat app or a bookmark has no site, so it shows as typed in.',
      cohorts.length > 0 && !countable && 'Visits by the week players first played show once a week has been counted from its Monday (weeks are cut in UTC).',
      countable && 'By the week they first played: not a percent, as a keen player visits several times a week. A week begun before the period has its visits alone, in grey italics. Weeks are cut in UTC.',
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
  @media (max-width: 900px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  /* A big monitor: two columns, the chart beside how far a visit gets. */
  @media (min-width: 1900px) {
    .stack {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas:
        'chart journey'
        'back stay'
        'where found'
        'on on'
        'cohorts cohorts';
      align-items: stretch;
    }
    .two {
      display: contents;
    }
    .stack :global(.section[data-area='chart']) {
      grid-area: chart;
    }
    .stack :global(.section[data-area='journey']) {
      grid-area: journey;
    }
    .stack :global(.section[data-area='stay']) {
      grid-area: stay;
    }
    .stack :global(.section[data-area='back']) {
      grid-area: back;
    }
    .stack :global(.section[data-area='where']) {
      grid-area: where;
    }
    .stack :global(.section[data-area='found']) {
      grid-area: found;
    }
    .stack :global(.section[data-area='on']) {
      grid-area: on;
    }
    .stack :global(.section[data-area='cohorts']) {
      grid-area: cohorts;
    }
  }
</style>
