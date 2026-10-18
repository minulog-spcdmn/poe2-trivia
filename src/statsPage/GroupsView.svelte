<script lang="ts">
  // Player groups (#groups): how players in one country, on one system or
  // kind of device play against everyone, and where those who did one thing
  // (played Delve, answered Today's unique) come from and on what. Each name
  // opens its group. GoatCounter breaks down a whole period, not its days,
  // and never a country by system: what slices.ts can put together.
  import { fmt } from './chart';
  import { MODE_NAMES } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';
  import { GROUPS, countsIn, groupName, hashOf, profileOf, segments, selName, whereOf, type Group, type Profile, type Sel, type Slices, type WhereRow } from './slices';

  let {
    read,
    period,
    slices,
    sel,
    reading,
    failed,
    onagain,
  }: { read: Read; period: Period; slices: Slices | null; sel: Sel | null; reading: number; failed: string; onagain: () => void } = $props();

  /** Fewer visitors than this, and a group's shares swing on a handful. */
  const FEW = 20;

  const everyone = $derived(slices ? profileOf(countsIn(slices, null)) : null);
  /** Everyone, added up by system: what the device table sets its rows against. */
  const everyoneOn = $derived(slices ? profileOf(countsIn(slices, null, 'systems')) : null);
  const picked = $derived(slices && sel && sel.kind !== 'did' ? profileOf(countsIn(slices, sel)) : null);
  const did = $derived(sel?.kind === 'did' ? sel.group : null);

  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);
  const most = (p: Profile) => {
    const top = [...p.modes].sort((a, b) => b.count - a.count)[0];
    return top && top.count ? `${MODE_NAMES[top.mode]}, ${top.share}%` : '–';
  };
  /** Its share of those who did it over its share of visitors: 1.5× is half again as many as its visits would bring. */
  const lean = (r: WhereRow) => (r.visitShare ? r.share / r.visitShare : null);
  const leanTone = (v: number | null) => (v === null ? '' : v >= 1.15 ? 'more' : v <= 0.87 ? 'less' : '');
  /** The country (of 5 or more, so not a lone player) most over its share of visitors. */
  const leanest = (rows: WhereRow[]) => rows.filter((r) => r.count >= 5).sort((a, b) => (lean(b) ?? 0) - (lean(a) ?? 0))[0];
  /** The largest share in a table, either kind: its bars are drawn against it. */
  const widest = (rows: WhereRow[]) => Math.max(1, ...rows.map((r) => Math.max(r.share, r.visitShare)));
  const per100 = (n: number, visitors: number) => (visitors ? `${Math.round((100 * n) / visitors)}` : '–');
  const at = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const places = $derived(slices ? segments(slices, 'place', 12) : []);
  const devices = $derived(slices ? segments(slices, 'device') : []);
  const systems = $derived(slices ? segments(slices, 'system', 8) : []);
  /** What each thing people did comes to: how many, the country most of them came from, and the share on a phone. */
  const doings = $derived(
    slices
      ? GROUPS.filter((g) => g.group !== 'visit').map((g) => {
          const from = whereOf(slices, g.group, 'locations');
          const on = whereOf(slices, g.group, 'systems', true);
          const top = leanest(from);
          const leaning = top && (lean(top) ?? 0) >= 1.15 ? top : undefined;
          return { group: g.group, count: from.reduce((n, r) => n + r.count, 0), top: from[0], leaning, phone: on.find((r) => r.name === 'Phone or tablet')?.share ?? 0 };
        })
      : [],
  );
  const where = $derived(slices && did ? whereOf(slices, did, 'locations') : []);
  const onKind = $derived(slices && did ? whereOf(slices, did, 'systems', true) : []);
  const onSystem = $derived(slices && did ? whereOf(slices, did, 'systems') : []);
  const didCount = $derived(where.reduce((n, r) => n + r.count, 0));
</script>

{#snippet compared(label: string, mine: string, all: string | null, means: string, against = 'Everyone')}
  <div class="fig">
    <dt>{label}</dt>
    <dd><b>{mine}</b><span class="means">{means}</span>{#if all !== null}<span class="all">{against}: {all}</span>{/if}</dd>
  </div>
{/snippet}

{#snippet whereTable(rows: WhereRow[], label: string, kind: 'place' | 'system' | 'device', top: number)}
  <div class="scroll-x">
    <table class="table" aria-label={label}>
      <thead>
        <tr>
          <th scope="col">{kind === 'place' ? 'Country' : kind === 'device' ? 'Device' : 'System'}</th>
          <th scope="col" class="n">Counted</th>
          <th scope="col" class="n">Of them</th>
          <th scope="col" class="n">Of visitors</th>
          <th scope="col" class="bar"><span class="key"><i class="k-now"></i>them <i class="k-all"></i>visitors</span></th>
          <th scope="col" class="n" title="Its share of them over its share of visitors">Lean</th>
        </tr>
      </thead>
      <tbody>
        {#each rows.slice(0, top) as r (r.name)}
          {@const l = lean(r)}
          <tr class:few={r.count < 5}>
            <th scope="row"><a class="pick" href={hashOf({ kind, name: r.name })}>{r.name}</a></th>
            <td class="n">{fmt(r.count)}</td>
            <td class="n strong">{Math.round(r.share)}%</td>
            <td class="n soft">{Math.round(r.visitShare)}%</td>
            <td class="bar">
              <span class="pair" aria-hidden="true">
                <span class="meter"><i style:width="{(100 * r.share) / widest(rows)}%"></i></span>
                <span class="meter all"><i style:width="{(100 * r.visitShare) / widest(rows)}%"></i></span>
              </span>
            </td>
            <td class="n lean {leanTone(l)}">{l === null ? '–' : `${l.toFixed(1)}×`}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

{#snippet segmentTable(rows: { sel: Exclude<Sel, { kind: 'did' }>; profile: Profile }[], label: string, head: string, everyone: Profile | null)}
  <div class="scroll-x">
    <table class="table" aria-label={label}>
      <thead>
        <tr>
          <th scope="col">{head}</th>
          <th scope="col" class="n">Visitors</th>
          <th scope="col" class="n">Games for 100 visitors</th>
          <th scope="col">Plays most</th>
          <th scope="col" class="n">Answered Today's unique</th>
          <th scope="col" class="n">Joins worked</th>
        </tr>
      </thead>
      <tbody>
        {#if everyone}
          <tr class="everyone">
            <th scope="row">Everyone</th>
            <td class="n">{fmt(everyone.visitors)}</td>
            <td class="n">{per100(everyone.games, everyone.visitors)}</td>
            <td>{most(everyone)}</td>
            <td class="n">{pct(everyone.daily)}</td>
            <td class="n">{pct(everyone.joins)}</td>
          </tr>
        {/if}
        {#each rows as r (r.sel.name)}
          <tr class:few={r.profile.visitors < FEW}>
            <th scope="row"><a class="pick" href={hashOf(r.sel)}>{r.sel.name}</a></th>
            <td class="n strong">{fmt(r.profile.visitors)}</td>
            <td class="n">{per100(r.profile.games, r.profile.visitors)}</td>
            <td>{most(r.profile)}</td>
            <td class="n">{pct(r.profile.daily)}</td>
            <td class="n">{pct(r.profile.joins)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

<div class="stack">
  <div class="picked">
    <a class="crumb" href="#groups" class:on={!sel}>Everyone</a>
    {#if sel}
      <span class="sep" aria-hidden="true">›</span>
      <span class="crumb on">{selName(sel)}</span>
      <a class="clear" href="#groups" title="Back to everyone" aria-label="Back to everyone">×</a>
    {/if}
    <span class="how">
      {#if reading}
        Reading the groups… {Math.round(reading * 100)}%
      {:else if slices}
        {period.now}, read at {at(slices.at)}. Pick a name to see that group.
      {/if}
    </span>
  </div>

  {#if !slices}
    {#if failed}
      <p class="note bad" role="alert">{failed} <button type="button" class="again" onclick={onagain}>Try again</button></p>
    {:else}
      <div class="reading" aria-busy="true">
        <p>Reading how each thing people do breaks down by country and by system: a call for each, so a few seconds.</p>
        <span class="meter"><i style:width="{Math.max(4, reading * 100)}%"></i></span>
      </div>
    {/if}
  {:else if sel && sel.kind !== 'did' && picked && everyone}
    <Section title={sel.name} says="{fmt(picked.visitors)} visitors, {everyone.visitors ? Math.round((100 * picked.visitors) / everyone.visitors) : 0}% of everyone. Against everyone in {period.now.toLowerCase()}.">
      {#if picked.visitors < FEW}<p class="caution">Few visitors: a handful more or less would change these a lot.</p>{/if}
      <dl class="figs">
        {@render compared('Games', per100(picked.games, picked.visitors), per100(everyone.games, everyone.visitors), 'started for every 100 visitors')}
        {@render compared("Answered Today's unique", pct(picked.daily), pct(everyone.daily), 'of visitors')}
        {@render compared('Joins worked', pct(picked.joins), pct(everyone.joins), `of ${fmt(picked.tried)} tries`)}
        {@render compared('Failures', per100(picked.failed, picked.visitors), per100(everyone.failed, everyone.visitors), 'for every 100 visitors')}
      </dl>
    </Section>

    <div class="two">
      <Section title="What they play" says="Each mode's share of their games, against everyone's.">
        <div class="modes">
          {#each picked.modes as m, i (m.mode)}
            {@const all = everyone.modes[i]}
            <div class="mode">
              <span class="name"><a class="pick" href={hashOf({ kind: 'did', group: m.mode })}>{MODE_NAMES[m.mode]}</a></span>
              <span class="pair" aria-hidden="true">
                <span class="meter"><i style:width="{m.share}%"></i></span>
                <span class="meter all"><i style:width="{all.share}%"></i></span>
              </span>
              <b>{m.share}%</b>
              <span class="soft">{all.share}%</span>
              <span class="per">{per100(m.count, picked.visitors)} games for every 100 visitors; everyone {per100(all.count, everyone.visitors)}</span>
            </div>
          {/each}
        </div>
        <p class="key-line"><span class="key"><i class="k-now"></i>{sel.name} <i class="k-all"></i>everyone</span></p>
      </Section>
      <Section title="What they did" says="Each thing counted, for every 100 of their visitors.">
        <div class="scroll-x">
          <table class="table" aria-label="What they did, for every 100 visitors">
            <thead>
              <tr><th scope="col"></th><th scope="col" class="n">Counted</th><th scope="col" class="n">For 100 visitors</th><th scope="col" class="n">Everyone</th></tr>
            </thead>
            <tbody>
              {#each GROUPS.filter((g) => g.group !== 'visit') as g (g.group)}
                {@const mine = countsIn(slices, sel)[g.group]}
                {@const all = countsIn(slices, null)[g.group]}
                <tr>
                  <th scope="row"><a class="pick" href={hashOf({ kind: 'did', group: g.group })}>{g.name}</a></th>
                  <td class="n">{fmt(mine)}</td>
                  <td class="n strong">{per100(mine, picked.visitors)}</td>
                  <td class="n soft">{per100(all, everyone.visitors)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
    <p class="aside">GoatCounter never breaks a country down by system, so a country's devices (or a system's countries) can't be shown.</p>
  {:else if did && everyone}
    {@const leans = leanest(where)}
    {@const phone = onKind.find((r) => r.name === 'Phone or tablet')}
    {@const visitPhone = whereOf(slices, 'visit', 'systems', true).find((r) => r.name === 'Phone or tablet')}
    <Section title={groupName(did)} says="Where they come from and what they play on, against all visitors in {period.now.toLowerCase()}.">
      {#if didCount}
        <dl class="figs">
          {@render compared('Counted', fmt(didCount), null, `${per100(didCount, everyone.visitors)} for every 100 visitors`)}
          {@render compared('Most from', where[0] ? `${Math.round(where[0].share)}%` : '–', where[0] ? `${Math.round(where[0].visitShare)}%` : '–', `of them from ${where[0]?.name ?? 'one country'}`, 'Of all visitors')}
          {@render compared('Leans most', leans ? `${(lean(leans) ?? 0).toFixed(1)}×` : '–', null, leans ? `${leans.name}, the most over its share of visitors` : 'nowhere yet')}
          {@render compared('On a phone', phone ? `${Math.round(phone.share)}%` : '0%', visitPhone ? `${Math.round(visitPhone.share)}%` : '0%', 'or a tablet', 'Of all visitors')}
        </dl>
      {:else}
        <p class="soft">Nobody in these days.</p>
      {/if}
    </Section>
    {#if didCount}
      <Section title="Where they come from" says="Lean: its share of them over its share of visitors; above 1, more of them than its visits would bring.">
        {@render whereTable(where, `Where those who ${groupName(did).toLowerCase()} come from`, 'place', 12)}
      </Section>
      <Section title="What they play on" says="Phones and computers, then each system.">
        <div class="tables">
          {@render whereTable(onKind, 'By kind of device', 'device', 3)}
          {@render whereTable(onSystem, 'By system', 'system', 8)}
        </div>
      </Section>
    {/if}
  {:else}
    <Section title="By country" says="Each country's players against everyone: how much they play, what most, and how the rest goes. Pick one to see it all.">
      {@render segmentTable(places, 'Players by country', 'Country', everyone)}
    </Section>
    <Section title="By device" says="Phones and computers, then each system.">
      {@render segmentTable([...devices, ...systems], 'Players by device and system', 'Device', everyoneOn)}
    </Section>
      <Section title="By what they did" says="Those who did each thing: how many, where most came from, the country most leaning to it, and how many on a phone.">
        <div class="scroll-x">
          <table class="table" aria-label="Players by what they did">
            <thead>
              <tr><th scope="col"></th><th scope="col" class="n">Counted</th><th scope="col">Most from</th><th scope="col">Leans to it</th><th scope="col" class="n">On a phone</th></tr>
            </thead>
            <tbody>
              {#each doings as d (d.group)}
                <tr class:few={!d.count}>
                  <th scope="row"><a class="pick" href={hashOf({ kind: 'did', group: d.group as Group })}>{groupName(d.group)}</a></th>
                  <td class="n strong">{fmt(d.count)}</td>
                  <td>{d.top ? `${d.top.name}, ${Math.round(d.top.share)}%` : '–'}</td>
                  <td>{d.leaning ? `${d.leaning.name}, ${(lean(d.leaning) ?? 0).toFixed(1)}×` : '–'}</td>
                  <td class="n">{d.count ? `${Math.round(d.phone)}%` : '–'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Section>
  {/if}
  {#if slices && failed}
    <p class="note bad" role="alert">{failed} <button type="button" class="again" onclick={onagain}>Try again</button></p>
  {/if}
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
  .picked {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem 0.7rem;
    font-size: 1.3rem;
  }
  .crumb {
    font-weight: 600;
    color: var(--gold);
    text-decoration: none;
  }
  a.crumb:hover {
    color: var(--gold-hi);
    text-decoration: underline;
  }
  .crumb.on {
    color: var(--a-ink);
  }
  a.crumb.on {
    pointer-events: none;
  }
  .sep {
    color: var(--a-muted);
  }
  .clear {
    padding: 0 0.3rem;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--a-muted);
    text-decoration: none;
  }
  .clear:hover {
    color: var(--a-ink);
  }
  .how {
    margin-left: auto;
    font-size: 1rem;
    color: var(--a-muted);
  }
  .reading {
    display: grid;
    gap: 0.8rem;
    max-width: 40rem;
    color: var(--a-muted);
  }
  .reading p {
    margin: 0;
  }
  .note {
    margin: 0;
    padding: 0.8rem 1.1rem;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  .note.bad {
    border-color: rgba(236, 102, 80, 0.45);
    color: var(--a-ink);
  }
  .again {
    margin-left: 0.6rem;
    padding: 0;
    font: inherit;
    font-weight: 600;
    color: var(--gold);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .everyone > * {
    font-weight: 600;
    color: var(--a-muted);
  }
  .few > * {
    opacity: 0.6;
  }
  .strong {
    font-weight: 650;
    color: var(--a-ink);
  }
  .soft {
    color: var(--a-muted);
  }
  .caution {
    margin: 0 0 1rem;
    color: var(--a-muted);
  }
  .figs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.4rem 2rem;
    margin: 0;
  }
  .fig {
    min-width: 0;
  }
  dt {
    font-weight: 600;
    color: var(--a-ink);
  }
  dd {
    display: grid;
    gap: 0.15rem;
    margin: 0.2rem 0 0;
  }
  dd b {
    font-size: 2.4rem;
    font-weight: 650;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--a-now);
  }
  .means,
  .all {
    font-size: 1rem;
    color: var(--a-muted);
  }
  .all {
    color: var(--a-text);
  }
  .modes {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(6rem, 2fr) auto auto;
    column-gap: 1rem;
  }
  .mode {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--a-rule);
  }
  .mode:last-child {
    border-bottom: 0;
  }
  .mode .name {
    color: var(--a-ink);
  }
  .mode b {
    font-weight: 650;
    text-align: right;
    color: var(--a-ink);
  }
  .mode .soft {
    text-align: right;
  }
  .per {
    grid-column: 1 / -1;
    margin-top: 0.2rem;
    font-size: 1rem;
    color: var(--a-muted);
  }
  .pair {
    display: grid;
    gap: 3px;
  }
  .pair .meter {
    height: 0.55rem;
  }
  .meter.all > i {
    background: var(--a-before);
  }
  .bar {
    width: 26%;
    min-width: 5rem;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 500;
    color: var(--a-muted);
  }
  .key i {
    display: inline-block;
    width: 0.8rem;
    height: 0.55rem;
    border-radius: 2px;
  }
  .key i + i,
  .key-line .k-all {
    margin-left: 0.4rem;
  }
  .k-now {
    background: var(--a-now);
  }
  .k-all {
    background: var(--a-before);
  }
  .key-line {
    margin: 0.9rem 0 0;
    font-size: 1rem;
  }
  .lean.more {
    font-weight: 650;
    color: var(--a-now);
  }
  .lean.less {
    color: var(--a-muted);
  }
  .tables {
    display: grid;
    gap: 1.8rem;
  }
  .aside {
    margin: 0;
    font-size: 1rem;
    color: var(--a-muted);
  }
  @media (max-width: 1100px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 900px) {
    .figs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .how {
      flex-basis: 100%;
      margin-left: 0;
    }
  }
  @media (max-width: 600px) {
    dd b {
      font-size: 1.9rem;
    }
  }
</style>
