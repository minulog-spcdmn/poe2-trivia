<script lang="ts">
  // Player groups (#groups): what sets a country's, a device's or a mode's
  // players apart, read at a glance. First what stands out (slices.ts
  // standouts), each a sentence with its two figures drawn; then a group of
  // one's own picking, its few figures each against everyone. GoatCounter
  // breaks a whole period down, not its days, and never a country by device.
  import { fmt } from './chart';
  import { MODES, MODE_NAMES, type Mode } from './model';
  import type { Period, Read } from './read';
  import { countsIn, groupName, hashOf, profileOf, segments, standouts, whereOf, type Sel, type Slices, type Standout } from './slices';

  let {
    read,
    period,
    slices,
    sel,
    reading,
    failed,
    onagain,
  }: { read: Read; period: Period; slices: Slices | null; sel: Sel | null; reading: number; failed: string; onagain: () => void } = $props();

  /** Fewer visitors than this, and a group's figures swing on a handful. */
  const FEW = 30;

  const everyone = $derived(slices ? profileOf(countsIn(slices, null)) : null);
  const picked = $derived(slices && sel && sel.kind !== 'did' ? profileOf(countsIn(slices, sel)) : null);
  const did = $derived(sel?.kind === 'did' ? sel.group : null);
  const found = $derived(slices ? standouts(slices) : []);

  const places = $derived(slices ? segments(slices, 'place', 8).filter((r) => r.sel.name !== 'Unknown') : []);
  const systems = $derived(slices ? segments(slices, 'system', 4).filter((r) => r.sel.name !== 'Unknown') : []);

  // ---- words ----
  const DEVICE: Record<string, string> = { 'Phone or tablet': 'phones and tablets', Computer: 'computers' };
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
  const nameOf = (s: Sel) => (s.kind === 'did' ? (MODES.includes(s.group as Mode) ? MODE_NAMES[s.group as Mode] : groupName(s.group)) : s.kind === 'device' ? cap(DEVICE[s.name] ?? s.name) : s.name);
  /** "Players in Germany", "Players on phones and tablets". */
  const who = (s: Exclude<Sel, { kind: 'did' }>) => (s.kind === 'place' ? `Players in ${s.name}` : `Players on ${s.kind === 'device' ? (DEVICE[s.name] ?? s.name) : s.name}`);
  const times = (r: number) => `${r >= 10 ? Math.round(r) : r.toFixed(1)}×`;
  const per100 = (n: number, visitors: number) => (visitors ? Math.round((100 * n) / visitors) : 0);
  const pct = (v: number) => `${Math.round(v)}%`;

  /** A finding in words: its big figure, its sentence, and the labels of its two bars. */
  function told(f: Standout): { big: string; line: string; mine: string; all: string } {
    const r = f.mine / f.all;
    if (f.what === 'mode') return { big: times(r), line: `${who(f.sel)} play ${MODE_NAMES[f.mode!]} ${times(r)} as much`, mine: `${pct(f.mine)} of their games`, all: pct(f.all) };
    if (f.what === 'games')
      return { big: times(r), line: r > 1 ? `${who(f.sel)} play ${times(r)} as many games` : `${who(f.sel)} play fewer games`, mine: `${Math.round(f.mine)} games for 100 visitors`, all: String(Math.round(f.all)) };
    if (f.what === 'daily')
      return { big: times(r), line: r > 1 ? `${who(f.sel)} answer Today's unique ${times(r)} as often` : `${who(f.sel)} answer Today's unique less often`, mine: `${pct(f.mine)} answered it`, all: pct(f.all) };
    return { big: pct(f.mine), line: f.mine < f.all ? `${who(f.sel)} get into rooms less often` : `${who(f.sel)} get into rooms more often`, mine: `${pct(f.mine)} of joins worked`, all: pct(f.all) };
  }

  type Tone = 'up' | 'down' | 'flat';
  /** Against everyone in a few words: about the same, or how far above or below. */
  function against(mine: number | null, all: number | null, points = false): { says: string; tone: Tone } {
    if (mine === null || all === null || !all) return { says: '', tone: 'flat' };
    if (points) {
      const d = Math.round(mine - all);
      return Math.abs(d) < 4 ? { says: 'about the same as everyone', tone: 'flat' } : { says: `${Math.abs(d)} points ${d > 0 ? 'above' : 'below'} everyone`, tone: d > 0 ? 'up' : 'down' };
    }
    const r = mine / all;
    return Math.abs(r - 1) < 0.12 ? { says: 'about the same as everyone', tone: 'flat' } : { says: `${times(r)} everyone`, tone: r > 1 ? 'up' : 'down' };
  }

  // ---- a mode: where its players come from, and on what ----
  const fromAll = $derived(slices && did ? whereOf(slices, did, 'locations') : []);
  const where = $derived(fromAll.filter((r) => r.name !== 'Unknown').slice(0, 6));
  const didCount = $derived(fromAll.reduce((n, r) => n + r.count, 0));
  const phoneShare = (rows: { name: string; share: number }[]) => rows.find((r) => r.name === 'Phone or tablet')?.share ?? 0;
  const phonesDid = $derived(slices && did ? phoneShare(whereOf(slices, did, 'systems', true)) : 0);
  const phonesAll = $derived(slices ? phoneShare(whereOf(slices, 'visit', 'systems', true)) : 0);
  const widest = $derived(Math.max(1, ...where.map((r) => r.share)));

  const at = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isSel = (s: Sel) => !!sel && hashOf(sel) === hashOf(s);
</script>

{#snippet pair(mine: number, all: number, max: number, tone: Tone, label: string, allLabel: string)}
  <div class="pair">
    <span class="bar {tone}"><i style:width="{(100 * mine) / Math.max(max, 1)}%"></i></span>
    <span class="fig">{label}</span>
    <span class="bar all"><i style:width="{(100 * all) / Math.max(max, 1)}%"></i></span>
    <span class="fig soft">{allLabel}</span>
  </div>
{/snippet}

{#snippet tile(title: string, value: string, a: { says: string; tone: Tone }, mine: number, all: number, max: number, mineLabel: string, allLabel: string)}
  <div class="tile">
    <h3>{title}</h3>
    <b class="value {a.tone}">{value}</b>
    <span class="says {a.tone}">{a.says}</span>
    {#if max > 0}{@render pair(mine, all, max, a.tone, mineLabel, allLabel)}{/if}
  </div>
{/snippet}

<nav class="picker" aria-label="Pick a group">
  <div class="line">
    <span class="what">Countries</span>
    <a class="chip" class:on={!sel} href="#groups">Everyone</a>
    {#each places as r (r.sel.name)}<a class="chip" class:on={isSel(r.sel)} href={hashOf(r.sel)}>{r.sel.name}</a>{/each}
  </div>
  <div class="line">
    <span class="what">Devices</span>
    {#each ['Phone or tablet', 'Computer'] as d (d)}<a class="chip" class:on={isSel({ kind: 'device', name: d })} href={hashOf({ kind: 'device', name: d })}>{cap(DEVICE[d])}</a>{/each}
    {#each systems as r (r.sel.name)}<a class="chip" class:on={isSel(r.sel)} href={hashOf(r.sel)}>{r.sel.name}</a>{/each}
  </div>
  <div class="line">
    <span class="what">Modes</span>
    {#each MODES as m (m)}<a class="chip" class:on={isSel({ kind: 'did', group: m })} href={hashOf({ kind: 'did', group: m })}>{MODE_NAMES[m]}</a>{/each}
  </div>
</nav>

{#if !slices}
  {#if failed}
    <p class="note" role="alert">{failed} <button type="button" class="again" onclick={onagain}>Try again</button></p>
  {:else}
    <div class="reading" aria-busy="true">
      <p>Reading the groups from GoatCounter…</p>
      <span class="bar"><i style:width="{Math.max(4, reading * 100)}%"></i></span>
    </div>
  {/if}
{:else if sel && sel.kind !== 'did' && picked && everyone}
  {@const mineGames = per100(picked.games, picked.visitors)}
  {@const allGames = per100(everyone.games, everyone.visitors)}
  {@const top = [...picked.modes].sort((a, b) => b.count - a.count)[0]}
  <header class="head">
    <h2>{nameOf(sel)}</h2>
    <p>{fmt(picked.visitors)} visitors, {Math.round((100 * picked.visitors) / Math.max(1, everyone.visitors))}% of everyone{#if picked.visitors < FEW}; so few that a handful more or less changes a lot{/if}.</p>
  </header>
  <div class="tiles three">
    {@render tile('Games played', String(mineGames), against(mineGames, allGames), mineGames, allGames, Math.max(mineGames, allGames), 'for every 100 visitors', `everyone: ${allGames}`)}
    {@render tile("Today's unique", picked.daily === null ? '–' : pct(picked.daily), against(picked.daily, everyone.daily), picked.daily ?? 0, everyone.daily ?? 0, 100, 'of visitors answered it', `everyone: ${pct(everyone.daily ?? 0)}`)}
    {@render tile('Joins that work', picked.joins === null ? '–' : pct(picked.joins), against(picked.joins, everyone.joins, true), picked.joins ?? 0, everyone.joins ?? 0, 100, `of ${fmt(picked.tried)} tries`, `everyone: ${pct(everyone.joins ?? 0)}`)}
  </div>
  <div class="tile wide">
    <h3>What they play</h3>
    <p class="most">Mostly <b>{top?.count ? MODE_NAMES[top.mode] : '–'}</b>{#if top?.count}, {top.share}% of their games{/if}</p>
    <div class="modes">
      {#each picked.modes as m, i (m.mode)}
        {@const a = everyone.modes[i]}
        {@const r = a.share ? m.share / a.share : 1}
        <div class="mode">
          <span class="name"><a class="pick" href={hashOf({ kind: 'did', group: m.mode })}>{MODE_NAMES[m.mode]}</a>{#if Math.abs(r - 1) >= 0.15}<em>{times(r)} everyone</em>{/if}</span>
          {@render pair(m.share, a.share, 100, 'flat', `${m.share}%`, `everyone: ${a.share}%`)}
        </div>
      {/each}
    </div>
  </div>
  <p class="aside">The upper bar is {nameOf(sel)}, the grey one everyone. GoatCounter never splits a country by device, so the two can't be combined.</p>
{:else if did && everyone}
  <header class="head">
    <h2>{nameOf(sel!)}</h2>
    <p>{fmt(didCount)} games in {period.now.toLowerCase()}, {per100(didCount, everyone.visitors)} for every 100 visitors.</p>
  </header>
  {#if !didCount}
    <p class="soft">Nobody in these days.</p>
  {:else}
    {@const first = where[0]}
    <div class="tiles three">
      {@render tile('How common', String(per100(didCount, everyone.visitors)), { says: 'games for every 100 visitors', tone: 'flat' }, 0, 0, 0, '', '')}
      <div class="tile">
        <h3>Most from</h3>
        <b class="value flat">{first?.name ?? '–'}</b>
        <span class="says flat">{first ? `${pct(first.share)} of its players; ${pct(first.visitShare)} of all visitors` : ''}</span>
      </div>
      <!-- More or fewer on a phone is neither better nor worse: said, not coloured. -->
      {@render tile('On a phone or tablet', pct(phonesDid), { says: `${against(phonesDid, phonesAll, true).says} (${pct(phonesAll)})`, tone: 'flat' }, 0, 0, 0, '', '')}
    </div>
    <div class="tile wide">
        <h3>Where they come from</h3>
        <ol class="from">
          {#each where as r (r.name)}
            {@const lean = r.visitShare ? r.share / r.visitShare : 0}
            <li>
              <a class="name pick" href={hashOf({ kind: 'place', name: r.name })}>{r.name}</a>
              <span class="bar flat"><i style:width="{(100 * r.share) / widest}%"></i></span>
              <b>{pct(r.share)}</b>
              <span class="lean">{#if r.count >= 5 && lean >= 1.3}{times(lean)} its share{/if}</span>
            </li>
          {/each}
        </ol>
        <p class="hint">"1.5× its share": half again as many as that country's visitors would bring.</p>
    </div>
  {/if}
{:else}
  <section aria-label="What stands out">
    <h2>What stands out</h2>
    <p class="sub">{period.now}, read at {at(slices.at)}. Only groups big enough to tell apart.</p>
    {#if found.length}
      <div class="cards">
        {#each found as f (`${hashOf(f.sel)}/${f.what}/${f.mode ?? ''}`)}
          {@const t = told(f)}
          <a class="card" href={hashOf(f.sel)}>
            <b class="value {f.tone}">{t.big}</b>
            <span class="line">{t.line}</span>
            {@render pair(f.mine, f.all, Math.max(f.mine, f.all), f.tone, t.mine, `everyone: ${t.all}`)}
          </a>
        {/each}
      </div>
    {:else}
      <p class="soft">Nothing stands out: the groups play much alike, or are still too small to tell apart.</p>
    {/if}
  </section>
{/if}
{#if slices && failed}
  <p class="note" role="alert">{failed} <button type="button" class="again" onclick={onagain}>Try again</button></p>
{/if}

<style>
  /* ---- the picker: every group a chip, the one on show lit ---- */
  .picker {
    display: grid;
    gap: 0.6rem;
    margin-bottom: 1.8rem;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
  }
  .what {
    width: 6.5rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--a-muted);
  }
  .chip {
    padding: 0.3rem 0.85rem;
    font-size: 1rem;
    color: var(--a-text);
    text-decoration: none;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-radius: 999px;
    cursor: pointer;
  }
  .chip:hover {
    color: var(--a-ink);
    border-color: var(--gold);
  }
  .chip.on {
    font-weight: 600;
    color: #1a140c;
    background: var(--a-now);
    border-color: var(--a-now);
  }

  /* ---- headings ---- */
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
    color: var(--gold-hi);
  }
  .head {
    margin-bottom: 1.2rem;
  }
  .head p,
  .sub {
    margin: 0.2rem 0 0;
    color: var(--a-muted);
  }
  .sub {
    margin-bottom: 1.2rem;
  }
  h3 {
    margin: 0;
    font-family: var(--font-data);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--a-ink);
  }

  /* ---- what stands out: a card a finding, opening its group ---- */
  /* A row the cards fill between them, however many there are. */
  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 1.1rem;
  }
  .cards > .card {
    flex: 1 1 22rem;
    min-width: 0;
  }
  .card,
  .tile {
    display: grid;
    align-content: start;
    gap: 0.35rem;
    padding: 1.3rem 1.5rem 1.4rem;
    color: var(--a-text);
    text-decoration: none;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  .card {
    cursor: pointer;
  }
  .card:hover {
    border-color: var(--gold);
  }
  .card .line {
    font-size: 1.2rem;
    line-height: 1.35;
    color: var(--a-ink);
  }
  .value {
    font-size: 2.6rem;
    font-weight: 650;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }
  .value.flat {
    color: var(--a-now);
  }
  .value.up,
  .says.up {
    color: var(--a-up);
  }
  .value.down,
  .says.down {
    color: var(--a-down);
  }
  .says {
    font-weight: 600;
  }
  .says.flat {
    color: var(--a-muted);
  }

  /* ---- a group's figures, each against everyone ---- */
  .tiles {
    display: grid;
    gap: 1.1rem;
  }
  .tiles.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .tile.wide {
    margin-top: 1.1rem;
  }
  .most {
    margin: 0.2rem 0 0.4rem;
    font-size: 1.2rem;
    color: var(--a-text);
  }
  .most b {
    font-weight: 650;
    color: var(--a-now);
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem 2rem;
  }
  .mode {
    display: grid;
    gap: 0.15rem;
  }
  .mode .name {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.6rem;
  }
  .mode em {
    font-size: 0.95rem;
    font-style: normal;
    font-weight: 600;
    color: var(--a-now);
  }

  /* Two bars: the group's (gold, or green and red where better or worse) over everyone's (grey), each with its figure. */
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.3rem 0.8rem;
    margin-top: 0.6rem;
  }
  .mode .pair {
    margin-top: 0;
  }
  .fig {
    font-size: 0.95rem;
    text-align: right;
    white-space: nowrap;
  }
  .bar {
    display: block;
    height: 0.6rem;
    background: var(--a-track);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar > i {
    display: block;
    height: 100%;
    background: var(--a-now);
    border-radius: 2px;
  }
  .bar.up > i {
    background: var(--a-up);
  }
  .bar.down > i {
    background: var(--a-down);
  }
  .bar.all > i {
    background: var(--a-before);
  }

  /* ---- where a mode's players come from ---- */
  .from {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(5rem, 1.6fr) auto minmax(7rem, auto);
    column-gap: 0.9rem;
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
  }
  .from li {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--a-rule);
  }
  .from li:last-child {
    border-bottom: 0;
  }
  .from .name {
    justify-self: start;
  }
  .from b {
    font-weight: 650;
    text-align: right;
    color: var(--a-ink);
  }
  .lean {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--a-now);
  }
  .hint,
  .aside {
    margin: 0.8rem 0 0;
    font-size: 0.95rem;
    color: var(--a-muted);
  }
  .aside {
    margin-top: 1.2rem;
  }

  .reading {
    display: grid;
    gap: 0.8rem;
    max-width: 36rem;
    color: var(--a-muted);
  }
  .reading p {
    margin: 0;
  }
  .soft {
    color: var(--a-muted);
  }
  .note {
    margin: 1rem 0 0;
    padding: 0.8rem 1.1rem;
    color: var(--a-ink);
    background: var(--a-surface);
    border: 1px solid rgba(236, 102, 80, 0.45);
    border-radius: 4px;
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
  @media (max-width: 900px) {
    .tiles.three,
    .modes {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 600px) {
    .what {
      width: 100%;
    }
    .value {
      font-size: 2.1rem;
    }
    .from {
      grid-template-columns: minmax(0, 1fr) minmax(3rem, 1fr) auto;
    }
    .lean {
      grid-column: 1 / -1;
    }
  }
</style>
