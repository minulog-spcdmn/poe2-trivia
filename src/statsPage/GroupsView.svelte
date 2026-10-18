<script lang="ts">
  // Player groups (#groups): what sets the visitors from a country, or on a
  // kind of device or a system, apart, and where each mode is played. A
  // country or a device can be picked, a mode, or one of each; never a
  // country and a device together, as GoatCounter counts the two apart.
  // Nothing picked: what stands out (slices.ts standouts), each a sentence
  // with its two figures drawn. Something picked: its few figures, each
  // against everyone. Below, always, the groups side by side, a picked mode's
  // figures where there is one. GoatCounter breaks a whole period down, not
  // its days.
  import { fmt } from './chart';
  import { MODES, MODE_NAMES, modesOf, type Mode } from './model';
  import type { Period, Read } from './read';
  import Seg from './Seg.svelte';
  import { countsIn, dimOf, hashOf, knowsPlayed, phoneShare, profileIn, segments, standouts, type Group, type Kind, type Profile, type Sel, type SegmentRow, type Slices, type Standout, type Who } from './slices';

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
  /** The country that plays a mode most for its visitors, among those big enough to tell. */
  const keenest = $derived.by(() => {
    if (!slices || !mode) return null;
    const rate = (n: Record<Group, number>) => per100(n[mode], n.visit);
    const best = segments(slices, 'place', 1000)
      .filter((r) => known(r) && r.profile.visitors >= FEW && r.counts[mode] >= 10)
      .sort((a, b) => rate(b.counts) - rate(a.counts))[0];
    return best ? { who: best.who, rate: rate(best.counts) } : null;
  });

  // ---- side by side: a row a group, the picked one lit ----
  const KINDS: { value: Kind; name: string }[] = [
    { value: 'place', name: 'Countries' },
    { value: 'device', name: 'Devices' },
    { value: 'system', name: 'Systems' },
  ];
  /** The table's kind: the picked group's, until another is chosen for it. */
  let chosen = $state<{ for: string; kind: Kind } | null>(null);
  const whoKey = $derived(who ? `${who.kind}/${who.name}` : '');
  const kind = $derived(chosen && chosen.for === whoKey ? chosen.kind : (who?.kind ?? 'place'));
  const rows = $derived.by(() => {
    if (!slices) return [];
    const list = segments(slices, kind, kind === 'place' ? 12 : 8).filter(known);
    // The picked group even where it's too small to be among them.
    const lost = who && who.kind === kind && !list.some((r) => isWho(r.who)) ? segments(slices, kind, 1000).find((r) => isWho(r.who)) : undefined;
    return lost ? [...list, lost] : list;
  });
  const base = $derived(slices ? countsIn(slices, null, dimOf(kind)) : null);
  const baseProfile = $derived(slices ? profileIn(slices, null, dimOf(kind)) : null);

  interface Col {
    head: string;
    unit: string;
    of: (n: Record<Group, number>, p: Profile) => number | null;
    show: (v: number) => string;
    /** Set against everyone's in points (percents), or as a ratio. */
    points?: boolean;
    /** Which way is better, coloured green and red; null: told apart in gold, neither better nor worse. */
    better: 'up' | 'down' | null;
    /** Whether a row has enough behind this figure to colour it. */
    enough?: (n: Record<Group, number>, p: Profile) => boolean;
  }
  const modeShare = (p: Profile, m: Mode) => (p.games ? p.modes.find((x) => x.mode === m)!.share : null);
  const cols = $derived.by((): Col[] => {
    if (mode) {
      const M = MODE_NAMES[mode];
      return [
        { head: `${M} games`, unit: 'started', of: (n) => n[mode], show: fmt, better: null, enough: () => false },
        { head: 'For 100 visitors', unit: `${M} games`, of: (n) => (n.visit ? per100(n[mode], n.visit) : null), show: rate, better: null, enough: (n) => n[mode] >= 10 },
        { head: 'Part of their games', unit: `are ${M}`, of: (_, p) => modeShare(p, mode), show: pct, points: true, better: null, enough: (_, p) => p.games >= 20 },
      ];
    }
    return [
      ...(played ? [{ head: 'Played a game', unit: 'of visitors', of: (_: unknown, p: Profile) => p.played, show: pct, points: true, better: 'up' as const }] : []),
      { head: 'Games started', unit: 'for 100 visitors', of: (_, p) => (p.visitors ? per100(p.games, p.visitors) : null), show: rate, better: 'up', enough: (_, p) => p.games >= 20 },
      ...MODES.map((m): Col => ({ head: MODE_NAMES[m], unit: 'of their games', of: (_, p) => modeShare(p, m), show: pct, points: true, better: null, enough: (_, p) => p.games >= 20 })),
      { head: "Today's unique", unit: 'of visitors answered', of: (_, p) => p.daily, show: pct, better: 'up' },
      { head: 'Joins that work', unit: 'of tries', of: (_, p) => p.joins, show: pct, points: true, better: 'up', enough: (_, p) => p.tried >= 20 },
      { head: 'Failures', unit: 'for 100 visitors', of: (_, p) => p.failures, show: rate, better: 'down', enough: (n) => n.failed >= 5 },
    ];
  });
  /** A cell's colour: only where the row has enough behind it, and it's far enough from everyone's. */
  function toneOf(c: Col, v: number | null, n: Record<Group, number>, p: Profile): string {
    if (v === null || !base || !baseProfile || p.visitors < FEW || (c.enough && !c.enough(n, p))) return '';
    const b = c.of(base, baseProfile);
    if (b === null || !b) return '';
    // A mode told apart as a finding is (slices.ts standouts): a quarter more or less of it; better or worse, by less.
    if (c.better === null) return v / b >= 1.25 || v / b <= 1 / 1.25 ? 'lean' : '';
    const far = c.points ? Math.abs(v - b) >= 5 : v / b >= 1.2 || v / b <= 1 / 1.2;
    if (!far) return '';
    return v > b === (c.better === 'up') ? 'up' : 'down';
  }

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
    {@const ofAll = share(mine[mode], all[mode])}
    {@const ofVisits = share(mine.visit, all.visit)}
    <header class="head">
      <h2>{M} {from(who)}</h2>
      <p>{fmt(mine[mode])} games started {from(who)} in {period.now.toLowerCase()}, by {fmt(mine.visit)} visitors{#if mine.visit < FEW}; so few that a handful more or less changes a lot{/if}.</p>
    </header>
    <div class="tiles">
      {@render tile(`${M} games for 100 visitors`, rate(mineRate), plain(against(mineRate, allRate)), mineRate, allRate, Math.max(mineRate, allRate), `${rate(mineRate)} ${from(who)}`, `everyone: ${rate(allRate)}`)}
      {@render tile('Part of their games', pct(mineShare), plain(against(mineShare, allShare, true)), mineShare, allShare, 100, `of their games are ${M}`, `everyone: ${pct(allShare)}`)}
      {@render tile(`Of all ${M} games`, pct(ofAll), plain(against(ofAll, ofVisits, true, false, 'their share of visitors')), ofAll, ofVisits, Math.max(ofAll, ofVisits), `of ${M} games`, `of visitors: ${pct(ofVisits)}`)}
    </div>
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
        {#if keenest}
          {@const allRate = per100(modeGames, visits)}
          <div class="tile">
            <h3>Played most, for its visitors</h3>
            <b class="value flat"><a class="pick" href={to(keenest.who)}>{keenest.who.name}</a></b>
            <span class="says flat">{rate(keenest.rate)} games for 100 visitors; {against(keenest.rate, allRate).says}</span>
            {@render pair(keenest.rate, allRate, Math.max(keenest.rate, allRate), 'flat', `${rate(keenest.rate)} for 100 visitors`, `everyone: ${rate(allRate)}`)}
          </div>
        {/if}
      </div>
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

  <section class="side" aria-label="Side by side">
    <div class="side-head">
      <h2>{mode ? `${MODE_NAMES[mode]}, side by side` : 'Side by side'}</h2>
      <Seg options={KINDS} value={kind} label="Groups to set side by side" onpick={(k) => (chosen = { for: whoKey, kind: k })} />
    </div>
    <div class="scroll-x">
      <table class="table groups">
        <thead>
          <tr>
            <th scope="col">{KINDS.find((k) => k.value === kind)?.name}</th>
            <th scope="col" class="n">Visitors</th>
            {#each cols as c (c.head)}<th scope="col" class="n">{c.head}<span class="unit">{c.unit}</span></th>{/each}
          </tr>
        </thead>
        <tbody>
          {#if base && baseProfile}
            <tr class="everyone">
              <th scope="row">Everyone</th>
              <td class="n">{fmt(base.visit)}</td>
              {#each cols as c (c.head)}{@const v = c.of(base, baseProfile)}<td class="n">{v === null ? '–' : c.show(v)}</td>{/each}
            </tr>
          {/if}
          {#each rows as r (r.who.name)}
            <tr class:on={isWho(r.who)} class:few={r.profile.visitors < FEW}>
              <th scope="row"><a class="pick" href={to(r.who)}>{whoName(r.who)}</a></th>
              <td class="n">{fmt(r.profile.visitors)}</td>
              {#each cols as c (c.head)}{@const v = c.of(r.counts, r.profile)}<td class="n {toneOf(c, v, r.counts, r.profile)}">{v === null ? '–' : c.show(v)}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="hint">
      {#if mode}Gold: far more or less of {MODE_NAMES[mode]} than everyone.{:else}Green and red: better or worse than everyone by enough to matter; gold: a mode far more or less of their games.{/if}
      Greyed: fewer than {FEW} visitors, too few to tell.
    </p>
  </section>
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

  /* ---- side by side: a row a group, everyone's on top, the picked lit ---- */
  .side {
    margin-top: 2.6rem;
  }
  .side-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem 1.5rem;
    margin-bottom: 1rem;
  }
  .groups th,
  .groups td {
    padding-inline: 0.7rem;
  }
  /* Headings wrap, so the figures, not their names, set how wide a column is. */
  .groups thead th {
    vertical-align: bottom;
    white-space: normal;
  }
  .groups thead th.n {
    min-width: 5.5rem;
  }
  .unit {
    display: block;
    font-size: 0.85rem;
    font-weight: 400;
  }
  .groups .everyone > * {
    font-weight: 600;
    color: var(--a-ink);
    border-bottom-color: rgba(163, 152, 131, 0.4);
  }
  .groups tr.on > * {
    background: rgba(217, 176, 98, 0.1);
  }
  .groups tr.on .pick {
    font-weight: 650;
    color: var(--gold-hi);
  }
  .groups tr.few > * {
    color: var(--a-muted);
  }
  .groups td.up {
    font-weight: 650;
    color: var(--a-up);
  }
  .groups td.down {
    font-weight: 650;
    color: var(--a-down);
  }
  .groups td.lean {
    font-weight: 650;
    color: var(--a-now);
  }
  /* The names stay in sight while a phone scrolls the figures. */
  .groups tbody th,
  .groups thead th:first-child {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--bg);
    white-space: nowrap;
  }
  .groups tr.on th {
    background: linear-gradient(rgba(217, 176, 98, 0.1), rgba(217, 176, 98, 0.1)), var(--bg);
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
    .groups .unit {
      font-size: 0.8rem;
    }
  }
</style>
