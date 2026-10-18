<script lang="ts">
  // Player groups (#groups): what sets the visitors from a country, or on a
  // kind of device or a system, apart, and where each mode is played. A
  // country or a device can be picked, a mode, or one of each; never a
  // country and a device together, as GoatCounter counts the two apart.
  // Nothing picked: what stands out (slices.ts standouts), each a sentence
  // with its two figures drawn. Something picked: its few figures, each
  // against everyone; a mode, where it's played most for its visitors, a
  // bar each. GoatCounter breaks a whole period down, not its days.
  import { fmt } from './chart';
  import { MODES, MODE_NAMES, deviceOf, modesOf, type Mode } from './model';
  import type { Period, Read } from './read';
  import { countsIn, dimOf, hashOf, knowsPlayed, phoneShare, profileIn, segments, standouts, type Sel, type SegmentRow, type Slices, type Standout, type Who } from './slices';

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

  const who = $derived(sel?.who ?? null);
  const mode = $derived(sel?.mode ?? null);
  const played = $derived(!!slices && knowsPlayed(slices));
  /** Everyone, counted in the list the picked group is in: a system's against every system's. */
  const all = $derived(slices ? countsIn(slices, null, who ? dimOf(who.kind) : 'locations') : null);
  const mine = $derived(slices && who ? countsIn(slices, who) : null);
  const everyone = $derived(slices ? profileIn(slices, null, who ? dimOf(who.kind) : 'locations') : null);
  const picked = $derived(slices && who ? profileIn(slices, who) : null);
  const found = $derived(slices && !who && !mode ? standouts(slices) : []);

  const known = (r: SegmentRow) => r.who.name !== 'Unknown' && r.who.name !== 'Other';
  const places = $derived(slices ? segments(slices, 'place', 8).filter(known) : []);
  const systems = $derived(slices ? segments(slices, 'system', 4).filter(known) : []);

  // ---- words ----
  const DEVICE: Record<string, string> = { 'Phone or tablet': 'phones and tablets', Computer: 'computers' };
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
  /** "Germany", "Phones and tablets", "iOS". */
  const whoName = (w: Who) => (w.kind === 'device' ? cap(DEVICE[w.name] ?? w.name) : w.name);
  /** "from Germany", "on phones and tablets", "on iOS". */
  const from = (w: Who) => (w.kind === 'place' ? `from ${w.name}` : `on ${w.kind === 'device' ? (DEVICE[w.name] ?? w.name) : w.name}`);
  const times = (r: number) => `${r >= 10 ? Math.round(r) : r.toFixed(1)}×`;
  const pct = (v: number) => `${Math.round(v)}%`;
  /** For each 100 visitors: a whole number, or one decimal while it's small. */
  const rate = (v: number) => (v >= 10 || v === 0 ? String(Math.round(v)) : v.toFixed(1));
  const per100 = (n: number, visitors: number) => (visitors ? (100 * n) / visitors : 0);
  const share = (n: number, of: number) => (of ? (100 * n) / of : 0);

  /** A finding in words: its big figure, its sentence, and the labels of its two bars. */
  function told(f: Standout): { big: string; line: string; mine: string; all: string } {
    const r = f.mine / f.all;
    const w = from(f.who);
    if (f.what === 'mode') return { big: times(r), line: `${MODE_NAMES[f.mode!]} is ${times(r)} as big a part of the games started ${w}`, mine: `${pct(f.mine)} of their games`, all: pct(f.all) };
    if (f.what === 'played')
      return { big: times(r), line: r > 1 ? `Visitors ${w} play a game ${times(r)} as often` : `Fewer of the visitors ${w} play a game`, mine: `${pct(f.mine)} played one`, all: pct(f.all) };
    if (f.what === 'games')
      return { big: times(r), line: r > 1 ? `Visitors ${w} start ${times(r)} as many games each` : `Visitors ${w} start fewer games each`, mine: `${rate(f.mine)} games for 100 visitors`, all: rate(f.all) };
    if (f.what === 'daily')
      return { big: times(r), line: r > 1 ? `Visitors ${w} answer Today's unique ${times(r)} as often` : `Visitors ${w} answer Today's unique less often`, mine: `${pct(f.mine)} answered it`, all: pct(f.all) };
    if (f.what === 'failures') return { big: times(r), line: `Visitors ${w} meet failures ${times(r)} as often`, mine: `${rate(f.mine)} for 100 visitors`, all: rate(f.all) };
    return { big: pct(f.mine), line: `Tries to join a room ${w} work ${f.mine < f.all ? 'less' : 'more'} often`, mine: `${pct(f.mine)} of tries worked`, all: pct(f.all) };
  }

  type Tone = 'up' | 'down' | 'flat';
  /** Against everyone (or `whom`) in a few words: about the same, or how far above or below; `lower`: less is better. */
  function against(mine: number | null, all: number | null, points = false, lower = false, whom = 'everyone'): { says: string; tone: Tone } {
    if (mine === null || all === null || !all) return { says: '', tone: 'flat' };
    const tone = (above: boolean): Tone => (above !== lower ? 'up' : 'down');
    if (points) {
      const d = Math.round(mine - all);
      return Math.abs(d) < 4 ? { says: `about the same as ${whom}`, tone: 'flat' } : { says: `${Math.abs(d)} points ${d > 0 ? 'above' : 'below'} ${whom}`, tone: tone(d > 0) };
    }
    const r = mine / all;
    return Math.abs(r - 1) < 0.12 ? { says: `about the same as ${whom}`, tone: 'flat' } : { says: `${times(r)} ${whom}`, tone: tone(r > 1) };
  }
  /** Said, not coloured: more of a mode is neither better nor worse. */
  const plain = (a: { says: string }) => ({ says: a.says, tone: 'flat' as Tone });

  // ---- where a chip leads: the same picks with one changed, the lit one let go ----
  const to = (w: Who | null, m: Mode | null = mode) => hashOf({ who: w, mode: m });
  const isWho = (w: Who) => !!who && who.kind === w.kind && who.name === w.name;
  const whoChip = (w: Who) => to(isWho(w) ? null : w);
  const modeChip = (m: Mode) => to(who, mode === m ? null : m);

  // ---- a mode on its own: as the rest of the page counts it (the groups' own read can come out a little apart) ----
  const modeGames = $derived(mode ? (modesOf(read.now.games.rows).find((m) => m.mode === mode)?.started ?? 0) : 0);
  const visits = $derived(read.now.visitors.total);
  // ---- where a mode is played most: each country's games of it for 100 visitors, against everyone's ----
  /** Countries (systems, where a device or system is picked) big enough to tell, most for their visitors first; the picked one even where it isn't among them. */
  const keen = $derived.by(() => {
    if (!slices || !mode) return [];
    const m = mode;
    const rateOf = (r: SegmentRow) => per100(r.counts[m], r.counts.visit);
    const every = segments(slices, who && who.kind !== 'place' ? 'system' : 'place', 1000).filter(known);
    const big = every.filter((r) => r.counts.visit >= FEW).sort((a, b) => rateOf(b) - rateOf(a)).slice(0, 8);
    const lost = who && !big.some((r) => isWho(r.who)) ? every.find((r) => isWho(r.who)) : undefined;
    return [...big, ...(lost ? [lost] : [])].map((r) => ({ who: r.who, rate: rateOf(r), few: r.counts.visit < FEW }));
  });
  /** Everyone's games of the mode for 100 visitors, in the list's own counts. */
  const keenAll = $derived.by(() => {
    if (!slices || !mode) return 0;
    const n = countsIn(slices, null, who && who.kind !== 'place' ? 'systems' : 'locations');
    return per100(n[mode], n.visit);
  });
  const keenMax = $derived(Math.max(keenAll, ...keen.map((r) => r.rate), 0.1));
  /** The picked group's row, or a picked kind of device's systems. */
  const lit = (w: Who) => isWho(w) || (who?.kind === 'device' && deviceOf(w.name) === who.name);

  const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

{#snippet keenList(m: Mode)}
  {#if keen.length}
    <div class="tile wide">
      <h3>Where {MODE_NAMES[m]} is played most, for its visitors</h3>
      <ol class="from">
        {#each keen as r (r.who.name)}
          {@const lean = keenAll ? r.rate / keenAll : 1}
          <li class:on={lit(r.who)}>
            <a class="name pick" href={to(r.who, m)}>{whoName(r.who)}</a>
            <span class="bar flat"><i style:width="{(100 * r.rate) / keenMax}%"></i><b class="mark" style:left="{(100 * keenAll) / keenMax}%"></b></span>
            <b>{rate(r.rate)}</b>
            <span class="lean">{#if !r.few && (lean >= 1.25 || lean <= 0.8)}{times(lean)} everyone{/if}</span>
          </li>
        {/each}
      </ol>
      <p class="hint">{MODE_NAMES[m]} games for 100 visitors; the line is everyone's, {rate(keenAll)}. Only those with {FEW} visitors or more{#if keen.some((r) => r.few)}, and the one picked{/if}.</p>
    </div>
  {/if}
{/snippet}

{#snippet chipFor(w: Who)}
  <a class="chip" class:on={isWho(w)} class:apart={!!who && !isWho(w) && (who.kind === 'place') !== (w.kind === 'place')} href={whoChip(w)}>{whoName(w)}</a>
{/snippet}

<nav class="picker" aria-label="Pick a group">
  <div class="line">
    <span class="what">Country</span>
    <a class="chip" class:on={who?.kind !== 'place'} href={to(who?.kind === 'place' ? null : who)}>Any</a>
    {#each places as r (r.who.name)}{@render chipFor(r.who)}{/each}
    {#if who && who.kind !== 'place'}<span class="apart-note">Picking one lets go of {whoName(who)}: GoatCounter counts countries and devices apart.</span>{/if}
  </div>
  <div class="line">
    <span class="what">Device</span>
    <a class="chip" class:on={!who || who.kind === 'place'} href={to(who?.kind === 'place' ? who : null)}>Any</a>
    {#each ['Phone or tablet', 'Computer'] as d (d)}{@render chipFor({ kind: 'device', name: d })}{/each}
    {#each systems as r (r.who.name)}{@render chipFor(r.who)}{/each}
    {#if who?.kind === 'place'}<span class="apart-note">Picking one lets go of {who.name}: GoatCounter counts countries and devices apart.</span>{/if}
  </div>
  <div class="line">
    <span class="what">Mode</span>
    <a class="chip" class:on={!mode} href={to(who, null)}>All games</a>
    {#each MODES as m (m)}<a class="chip" class:on={mode === m} href={modeChip(m)}>{MODE_NAMES[m]}</a>{/each}
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
{:else}
  {#if who && mode && mine && all && picked && everyone}
    {@const M = MODE_NAMES[mode]}
    {@const mineRate = per100(mine[mode], mine.visit)}
    {@const allRate = per100(all[mode], all.visit)}
    {@const mineShare = share(mine[mode], picked.games)}
    {@const allShare = share(all[mode], everyone.games)}
    <header class="head">
      <h2>{M} {from(who)}</h2>
      <p>{fmt(mine[mode])} games started {from(who)} in {period.now.toLowerCase()}, by {fmt(mine.visit)} visitors{#if mine.visit < FEW}; so few that a handful more or less changes a lot{/if}.</p>
    </header>
    <div class="tiles">
      {@render tile(`${M} games for 100 visitors`, rate(mineRate), plain(against(mineRate, allRate)), mineRate, allRate, Math.max(mineRate, allRate), `${rate(mineRate)} ${from(who)}`, `everyone: ${rate(allRate)}`)}
      {@render tile('Part of their games', pct(mineShare), plain(against(mineShare, allShare, true)), mineShare, allShare, 100, `of their games are ${M}`, `everyone: ${pct(allShare)}`)}
    </div>
    {@render keenList(mode)}
  {:else if who && picked && everyone}
    {@const mineGames = per100(picked.games, picked.visitors)}
    {@const allGames = per100(everyone.games, everyone.visitors)}
    {@const top = [...picked.modes].sort((a, b) => b.count - a.count)[0]}
    <header class="head">
      <h2>{whoName(who)}</h2>
      <p>{fmt(picked.visitors)} visitors in {period.now.toLowerCase()}, {pct(share(picked.visitors, everyone.visitors))} of everyone{#if picked.visitors < FEW}; so few that a handful more or less changes a lot{/if}.</p>
    </header>
    <div class="tiles">
      {#if picked.played !== null && everyone.played !== null}
        {@render tile('Played a game', pct(picked.played), against(picked.played, everyone.played, true), picked.played, everyone.played, 100, 'of visitors, hosts and guests', `everyone: ${pct(everyone.played)}`)}
      {/if}
      {@render tile('Games started', rate(mineGames), against(mineGames, allGames), mineGames, allGames, Math.max(mineGames, allGames), 'for every 100 visitors', `everyone: ${rate(allGames)}`)}
      {@render tile("Today's unique", picked.daily === null ? '–' : pct(picked.daily), against(picked.daily, everyone.daily), picked.daily ?? 0, everyone.daily ?? 0, 100, 'of visitors answered it', `everyone: ${pct(everyone.daily ?? 0)}`)}
      {@render tile('Joins that work', picked.joins === null ? '–' : pct(picked.joins), against(picked.joins, everyone.joins, true), picked.joins ?? 0, everyone.joins ?? 0, 100, `of ${fmt(picked.tried)} tries`, `everyone: ${pct(everyone.joins ?? 0)}`)}
      {@render tile('Failures', rate(picked.failures ?? 0), against(picked.failures, everyone.failures, false, true), picked.failures ?? 0, everyone.failures ?? 0, Math.max(picked.failures ?? 0, everyone.failures ?? 0), 'for every 100 visitors', `everyone: ${rate(everyone.failures ?? 0)}`)}
    </div>
    <div class="tile wide">
      <h3>Their games by mode</h3>
      <p class="most">Mostly <b>{top?.count ? MODE_NAMES[top.mode] : '–'}</b>{#if top?.count}, {top.share}% of the games started {from(who)}{/if}</p>
      <div class="modes">
        {#each picked.modes as m, i (m.mode)}
          {@const a = everyone.modes[i]}
          {@const r = a.share ? m.share / a.share : 1}
          <div class="mode">
            <span class="name"><a class="pick" href={to(who, m.mode)}>{MODE_NAMES[m.mode]}</a>{#if Math.abs(r - 1) >= 0.15}<em>{times(r)} everyone's part</em>{/if}</span>
            {@render pair(m.share, a.share, 100, 'flat', `${m.share}%`, `everyone: ${a.share}%`)}
          </div>
        {/each}
      </div>
    </div>
  {:else if mode}
    {@const M = MODE_NAMES[mode]}
    {@const phones = phoneShare(slices, mode)}
    {@const phonesAll = phoneShare(slices, null)}
    <header class="head">
      <h2>{M}</h2>
      <p>{fmt(modeGames)} games started in {period.now.toLowerCase()}, {rate(per100(modeGames, visits))} for every 100 visitors.</p>
    </header>
    {#if !modeGames}
      <p class="soft">Nobody played it in these days.</p>
    {:else}
      <div class="tiles">
        {@render tile('Part of all games', pct(share(modeGames, read.now.games.started)), { says: `of the ${fmt(read.now.games.started)} games started`, tone: 'flat' }, 0, 0, 0, '', '')}
        {@render tile('Started on a phone or tablet', pct(phones), plain(against(phones, phonesAll, true, false, 'all games')), phones, phonesAll, 100, `of ${M} games`, `all games: ${pct(phonesAll)}`)}
      </div>
      {@render keenList(mode)}
    {/if}
  {:else}
    <section aria-label="What stands out">
      <h2>What stands out</h2>
      <p class="sub">{period.now}, read at {clock(slices.at)}. Only groups big enough to tell apart.</p>
      {#if found.length}
        <div class="cards">
          {#each found as f (`${hashOf({ who: f.who })}/${f.what}/${f.mode ?? ''}`)}
            {@const t = told(f)}
            <a class="card" href={hashOf({ who: f.who, mode: f.what === 'mode' ? f.mode : null })}>
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

  <p class="aside">
    How it's counted: a game counts on the device that runs it (the host's, or the one screen everyone plays on), so visitors who mostly join others' rooms start few games of their own{#if played}; "Played a game" counts guests too{/if}. GoatCounter counts countries and devices apart, so a country can't be narrowed to a device.
  </p>
{/if}
{#if slices && failed}
  <p class="note" role="alert">{failed} <button type="button" class="again" onclick={onagain}>Try again</button></p>
{/if}

<style>
  /* ---- the picker: a row for each kind of pick, the picked lit ---- */
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
  /* One that would let go of the other kind's pick: there, but quieter. */
  .chip.apart {
    color: var(--a-muted);
    border-style: dashed;
  }
  .apart-note {
    margin-left: 0.4rem;
    font-size: 0.95rem;
    color: var(--a-muted);
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
  .tile {
    container-type: inline-size;
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
  .value .pick {
    color: inherit;
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

  /* ---- a group's figures, each against everyone: as many to a row as fit ---- */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
    gap: 1.1rem;
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
  /* A narrow tile: each bar the tile's width, its figure under it. */
  @container (max-width: 19rem) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25rem;
    }
    .fig {
      text-align: left;
    }
    .bar.all {
      margin-top: 0.3rem;
    }
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

  /* ---- where a mode is played most: a bar each, everyone's a line across them ---- */
  .from {
    display: grid;
    /* The names' column as wide as the longest name, so on a wide screen the bars start beside them. */
    grid-template-columns: fit-content(15rem) minmax(5rem, 1fr) auto minmax(7rem, auto);
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
  .from li.on .pick {
    font-weight: 650;
    color: var(--gold-hi);
  }
  .from .name {
    justify-self: start;
  }
  .from .bar {
    position: relative;
    height: 0.75rem;
  }
  .from li.on .bar > i {
    background: var(--gold-hi);
  }
  .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--a-ink);
    /* Edged dark, so it shows over a bar that reaches past it too. */
    box-shadow: 0 0 0 1px rgba(10, 8, 6, 0.7);
  }
  .from b:not(.mark) {
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
    margin-top: 1.6rem;
    max-width: 75rem;
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
    .apart-note {
      width: 100%;
      margin-left: 0;
    }
    .from {
      grid-template-columns: minmax(0, 1fr) minmax(3rem, 1fr) auto;
    }
    .lean {
      grid-column: 1 / -1;
    }
  }
</style>
