<script lang="ts">
  // Player groups (#groups): what sets the visitors from a country, or on a
  // kind of device or a system, apart, and where each mode is played. A
  // country or a device can be picked, a mode, or one of each; never a
  // country and a device together, as GoatCounter counts the two apart.
  // Nothing picked: what stands out (slices.ts standouts), each a sentence
  // with its two figures drawn. A group picked: a table of its figures
  // beside everyone's, each row saying what it counts, and how its games
  // split by mode. A mode picked: its own figures (games, played to the end,
  // players a game; Delve, how deep its runs go), and where it's played most
  // for its visitors; with a group, the group's against everyone's (Delve's
  // depths too, slices.ts depthsIn). GoatCounter breaks a whole period
  // down, not its days.
  import { fmt } from './chart';
  import DelveDepths from './DelveDepths.svelte';
  import How from './How.svelte';
  import { toldFromStart } from './insights';
  import { MODES, MODE_NAMES, deviceOf, finishedShare, modesOf, seatsOf, type Mode } from './model';
  import type { Period, Read } from './read';
  import { countsIn, depthsIn, dimOf, hashOf, knowsPlayed, phoneShare, profileIn, segments, standouts, type Sel, type SegmentRow, type Slices, type Standout, type Who } from './slices';

  let {
    read,
    period,
    slices,
    sel,
    reading,
    failed,
    depthsReading,
    depthsFailed,
    ondepths,
    onagain,
  }: {
    read: Read;
    period: Period;
    slices: Slices | null;
    sel: Sel | null;
    reading: number;
    failed: string;
    onagain: () => void;
    /** Delve's depths for the groups, read only once a group is picked with Delve (Analytics loadDepths). */
    depthsReading: boolean;
    depthsFailed: string;
    ondepths: () => void;
  } = $props();

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
  /** The installed app's share is of every visitor in the period: only shown where visits were told apart from its first day. */
  const appKnown = $derived(toldFromStart(read.now));

  const known = (r: SegmentRow) => r.who.name !== 'Unknown' && r.who.name !== 'Other';
  /** The chips of a kind: its biggest groups, and the picked one even where it isn't among them (opened from a list). */
  const chipsOf = (rows: SegmentRow[]) => {
    const ws = rows.filter(known).map((r) => r.who);
    return who && who.kind === rows[0]?.who.kind && !ws.some(isWho) ? [...ws, who] : ws;
  };
  const places = $derived(slices ? chipsOf(segments(slices, 'place', 8)) : []);
  const systems = $derived(slices ? chipsOf(segments(slices, 'system', 4)) : []);

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
      return { big: times(r), line: r > 1 ? `Visitors ${w} start ${times(r)} as many games each` : `Visitors ${w} start fewer games each`, mine: `${rate(f.mine)} games for every 100 visits`, all: rate(f.all) };
    if (f.what === 'daily')
      return { big: times(r), line: r > 1 ? `Visitors ${w} answer Today's unique ${times(r)} as often` : `Visitors ${w} answer Today's unique less often`, mine: `${pct(f.mine)} answered it`, all: pct(f.all) };
    if (f.what === 'back')
      return { big: times(r), line: r > 1 ? `Visitors ${w} come back ${times(r)} as often` : `Fewer of the visitors ${w} come back`, mine: `${pct(f.mine)} came back`, all: pct(f.all) };
    if (f.what === 'failures') return { big: times(r), line: `Visitors ${w} meet failures ${times(r)} as often`, mine: `${rate(f.mine)} for every 100 visits`, all: rate(f.all) };
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

  /** A row of a table setting a group beside everyone: what it counts, the two figures, and how they differ in words (none for a group too small to tell). */
  interface Row {
    name: string;
    unit: string;
    href?: string;
    mine: string;
    all: string;
    says: string;
    tone: Tone;
  }
  const row = (name: string, unit: string, mine: number | null, all: number | null, show: (v: number) => string, a: { says: string; tone: Tone }, few: boolean, href?: string): Row => ({
    name,
    unit,
    href,
    mine: mine === null ? '–' : show(mine),
    all: all === null ? '–' : show(all),
    says: few ? '' : a.says,
    tone: few ? 'flat' : a.tone,
  });

  /** A group's figures beside everyone's. */
  const groupRows = $derived.by((): Row[] => {
    if (!picked || !everyone) return [];
    const few = picked.visitors < FEW;
    const g = per100(picked.games, picked.visitors);
    const gAll = per100(everyone.games, everyone.visitors);
    return [
      { name: 'Visits', unit: 'in the period', mine: fmt(picked.visitors), all: fmt(everyone.visitors), says: `${pct(share(picked.visitors, everyone.visitors))} of everyone`, tone: 'flat' },
      ...(picked.played !== null && everyone.played !== null ? [row('Played a game', 'share of visits', picked.played, everyone.played, pct, against(picked.played, everyone.played, true), few)] : []),
      row('Games started', 'for every 100 visits', g, gAll, rate, against(g, gAll), few),
      row("Answered Today's unique", 'share of visits, on days it asked', picked.daily, everyone.daily, pct, against(picked.daily, everyone.daily), few),
      ...(picked.back !== null && everyone.back !== null ? [row('Came back to a save', 'share of visits new or back', picked.back, everyone.back, pct, against(picked.back, everyone.back, true), few)] : []),
      ...(picked.app !== null && everyone.app !== null && appKnown ? [row('Opened the installed app', 'share of visits', picked.app, everyone.app, pct, plain(against(picked.app, everyone.app, true)), few)] : []),
      row('Joins that worked', `share of ${fmt(picked.tried)} tries`, picked.joins, everyone.joins, pct, against(picked.joins, everyone.joins, true), few || picked.tried < 20),
      row('Failures met', 'for every 100 visits', picked.failures, everyone.failures, rate, against(picked.failures, everyone.failures, false, true), few),
    ];
  });
  /** A group's games by mode, beside everyone's: a mode a bigger or smaller part is neither better nor worse. */
  const groupModes = $derived.by((): Row[] => {
    if (!picked || !everyone) return [];
    const few = picked.games < 20;
    return picked.modes.map((m, i) => row(MODE_NAMES[m.mode], 'share of their games', m.share, everyone.modes[i].share, pct, plain(against(m.share, everyone.modes[i].share, true)), few, to(who, m.mode)));
  });

  /** A mode's own figures, as the Games view counts them. */
  const modeFacts = $derived.by(() => {
    if (!mode) return null;
    const sum = modesOf(read.now.games.rows).find((m) => m.mode === mode)!;
    const { seats, games } = seatsOf(read.now.games.rows.filter((r) => r.mode === mode));
    return { ...sum, perGame: games ? seats / games : null };
  });
  /** A group's games of the picked mode beside everyone's (in the group's own list's counts). */
  const pairRows = $derived.by((): Row[] => {
    if (!who || !mode || !mine || !all || !picked || !everyone) return [];
    const few = mine.visit < FEW;
    const g = per100(mine[mode], mine.visit);
    const gAll = per100(all[mode], all.visit);
    const part = share(mine[mode], picked.games);
    const partAll = share(all[mode], everyone.games);
    return [
      { name: `${MODE_NAMES[mode]} games`, unit: 'started in the period', mine: fmt(mine[mode]), all: fmt(all[mode]), says: `${pct(share(mine[mode], all[mode]))} of everyone's`, tone: 'flat' },
      row('Games started', 'for every 100 visits', g, gAll, rate, against(g, gAll), few),
      row('Part of their games', 'share of all they started', part, partAll, pct, plain(against(part, partAll, true)), picked.games < 20),
    ];
  });
  /** Delve's depths for the picked group and for everyone in its list; null where they weren't read. */
  const groupDepths = $derived(slices && who && mode === 'delve' ? depthsIn(slices, who) : null);
  const allDepths = $derived(slices && who && mode === 'delve' ? depthsIn(slices, null, dimOf(who.kind)) : null);
</script>

{#snippet compare(rows: Row[], whom: string, label: string)}
  <div class="scroll-x">
    <table class="table compare" aria-label={label}>
      <thead>
        <tr>
          <th scope="col"><span class="sr">What</span></th>
          <th scope="col" class="n">{whom}</th>
          <th scope="col" class="n">Everyone</th>
          <th scope="col">Against everyone</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.name)}
          <tr>
            <th scope="row">{#if r.href}<a class="pick" href={r.href}>{r.name}</a>{:else}{r.name}{/if}<span class="unit">{r.unit}</span></th>
            <td class="n strong">{r.mine}</td>
            <td class="n soft">{r.all}</td>
            <td class="says {r.tone}">{r.says}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

{#snippet pair(mine: number, all: number, max: number, tone: Tone, label: string, allLabel: string)}
  <div class="pair">
    <span class="bar {tone}"><i style:width="{(100 * mine) / Math.max(max, 1)}%"></i></span>
    <span class="fig">{label}</span>
    <span class="bar all"><i style:width="{(100 * all) / Math.max(max, 1)}%"></i></span>
    <span class="fig soft">{allLabel}</span>
  </div>
{/snippet}

{#snippet keenList(m: Mode)}
  {#if keen.length}
    <div class="tile wide">
      <h3>Where {MODE_NAMES[m]} is played most: games for every 100 visits</h3>
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
      <p class="hint">The line is everyone's, {rate(keenAll)}. Only those with {FEW} visits or more{#if keen.some((r) => r.few)}, and the one picked{/if}.</p>
    </div>
  {/if}
{/snippet}

{#snippet chipFor(w: Who)}
  {@const apart = !!who && !isWho(w) && (who.kind === 'place') !== (w.kind === 'place')}
  <a class="chip" class:on={isWho(w)} class:apart aria-current={isWho(w) ? 'true' : undefined} title={apart ? `Lets go of ${whoName(who!)}` : undefined} href={whoChip(w)}>{whoName(w)}</a>
{/snippet}

<nav class="picker" aria-label="Pick a group">
  <div class="line">
    <span class="what">Country</span>
    <a class="chip" class:on={who?.kind !== 'place'} aria-current={who?.kind !== 'place' ? 'true' : undefined} href={to(who?.kind === 'place' ? null : who)}>Any</a>
    {#each places as w (w.name)}{@render chipFor(w)}{/each}
  </div>
  <div class="line">
    <span class="what">Device</span>
    <a class="chip" class:on={!who || who.kind === 'place'} aria-current={!who || who.kind === 'place' ? 'true' : undefined} href={to(who?.kind === 'place' ? who : null)}>Any</a>
    {#each ['Phone or tablet', 'Computer'] as d (d)}{@render chipFor({ kind: 'device', name: d })}{/each}
    {#each systems as w (w.name)}{@render chipFor(w)}{/each}
  </div>
  <div class="line">
    <span class="what">Mode</span>
    <a class="chip" class:on={!mode} aria-current={!mode ? 'true' : undefined} href={to(who, null)}>All games</a>
    {#each MODES as m (m)}<a class="chip" class:on={mode === m} aria-current={mode === m ? 'true' : undefined} href={modeChip(m)}>{MODE_NAMES[m]}</a>{/each}
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
    <header class="head">
      <h2>{M} {from(who)}</h2>
      {#if mine.visit < FEW}<p>So few visits ({fmt(mine.visit)}) that a handful more or less changes a lot.</p>{/if}
    </header>
    {@render compare(pairRows, whoName(who), `${M} ${from(who)} against everyone`)}
    {#if mode === 'delve'}
      <section class="tile wide">
        <h3>How deep their runs go</h3>
        {#if groupDepths}
          <DelveDepths ranges={groupDepths} against={allDepths} whom={whoName(who)} />
        {:else if depthsReading}
          <p class="soft" aria-busy="true">Reading how deep they went…</p>
        {:else if depthsFailed}
          <p class="note" role="alert">{depthsFailed} <button type="button" class="again" onclick={ondepths}>Try again</button></p>
        {:else}
          <!-- (Read by itself once picked; this, where that read was called off by the groups being read again.) -->
          <button type="button" class="again alone" onclick={ondepths}>Read how deep they went</button>
        {/if}
      </section>
    {/if}
    {@render keenList(mode)}
  {:else if who && picked && everyone}
    <header class="head">
      <h2>{whoName(who)}</h2>
      {#if picked.visitors < FEW}<p>So few visits ({fmt(picked.visitors)}) that a handful more or less changes a lot.</p>{/if}
    </header>
    {@render compare(groupRows, whoName(who), `${whoName(who)} against everyone`)}
    <section class="tile wide">
      <h3>Their games by mode</h3>
      {@render compare(groupModes, whoName(who), `${whoName(who)}'s games by mode`)}
    </section>
  {:else if mode && modeFacts}
    {@const M = MODE_NAMES[mode]}
    {@const phones = phoneShare(slices, mode)}
    {@const phonesAll = phoneShare(slices, null)}
    <header class="head">
      <h2>{M}</h2>
    </header>
    {#if !modeFacts.started}
      <p class="soft">Nobody played it in these days.</p>
    {:else}
      <dl class="facts">
        <div><dt>Games started</dt><dd><b>{fmt(modeFacts.started)}</b><span>{pct(share(modeFacts.started, read.now.games.started))} of all games</span></dd></div>
        <div><dt>Played to the end</dt><dd><b>{finishedShare(modeFacts.finished, modeFacts.started)}</b><span>of those started</span></dd></div>
        <div><dt>Players a game</dt><dd><b>{modeFacts.perGame === null ? '–' : modeFacts.perGame.toFixed(1)}</b><span>on average</span></dd></div>
        <div><dt>On a phone or tablet</dt><dd><b>{pct(phones)}</b><span>all games: {pct(phonesAll)}</span></dd></div>
        <div><dt>For every 100 visits</dt><dd><b>{rate(keenAll)}</b><span>{M} games started</span></dd></div>
      </dl>
      {#if mode === 'delve'}
        <section class="tile wide">
          <h3>How deep the runs go</h3>
          <DelveDepths ranges={read.now.delve.ranges} />
        </section>
      {/if}
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

  <How
    items={[
      "A game counts on the device that runs it (the host's), so visitors who mostly join others' rooms start few games of their own.",
      played && '"Played a game" counts guests too.',
      `"Played a game" and "Today's unique" cover the same days as the overview's, so everyone's figures match it.`,
      everyone && everyone.back !== null && '"Came back" is of the visits that found a save or none. Safari on iPhone and iPad clears a save after about a week away, so iOS shows fewer coming back.',
      "A country and a device can't be picked together: GoatCounter counts them apart.",
    ]}
  />
{/if}
{#if slices && failed}
  <p class="note" role="alert">{failed} <button type="button" class="again" onclick={onagain}>Try again</button></p>
{/if}

<style>
  /* A group beside everyone: what a row counts in a smaller line under its name. */
  .compare {
    margin-bottom: 1.5rem;
  }
  .compare th[scope='row'] {
    white-space: normal;
  }
  .unit {
    display: block;
    font-size: 0.95rem;
    font-weight: 400;
    color: var(--a-muted);
  }
  .compare .strong {
    font-size: 1.25rem;
    font-weight: 650;
    color: var(--a-ink);
  }
  .compare .soft {
    color: var(--a-muted);
  }
  .compare td.says {
    width: 40%;
    font-weight: 600;
  }
  /* A mode's own figures, side by side. */
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem 3rem;
    margin: 0 0 1.5rem;
  }
  .facts div {
    display: grid;
    gap: 0.1rem;
  }
  .facts dt {
    color: var(--a-muted);
  }
  .facts dd {
    display: grid;
    margin: 0;
  }
  .facts b {
    font-size: 2rem;
    font-weight: 650;
    line-height: 1.1;
    color: var(--a-ink);
  }
  .facts span {
    color: var(--a-muted);
  }
  .tile.wide {
    margin-bottom: 1.5rem;
  }
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
  .tile.wide {
    margin-top: 1.1rem;
  }

  /* Two bars: the group's (gold, or green and red where better or worse) over everyone's (grey), each with its figure. */
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.3rem 0.8rem;
    margin-top: 0.6rem;
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

  .hint {
    margin: 0.8rem 0 0;
    font-size: 0.95rem;
    color: var(--a-muted);
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
  .again.alone {
    margin-left: 0;
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
