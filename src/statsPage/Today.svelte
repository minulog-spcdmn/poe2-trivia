<script lang="ts">
  // Today so far, against what a usual day of the last four weeks had by this hour
  // (model.ts usualByNow): one day a period ago swings with every few visits,
  // the usual day says whether today is busy. Busier or quieter is said only
  // beyond what chance moves a count that size by (insights.ts
  // beyondChanceOf). Each figure with what the last update added ("+5 new"),
  // and below them, in a line, where the new visitors came from
  // and on what, and what the new games were (changes.ts). Lit while that
  // update is the newest; once one brings nothing, the last that did stays,
  // dimmed, with its times. `tall`: the box stands beside a big chart on a
  // screen with the height for it (4K), so its figures are larger, one under
  // another.
  import type { Changes } from './changes';
  import { fmt } from './chart';
  import { beyondChanceOf } from './insights';
  import { percent } from './model';
  import type { Read } from './read';

  let { read, tall = false }: { read: Read; tall?: boolean } = $props();

  const L = $derived(read.now);
  const last = (vs: number[]) => vs[vs.length - 1] ?? 0;
  /**
   * Today's unique is counted by the game's days, from midnight UTC (model.ts
   * gameDay): its today is the UTC day it is now, which in a zone ahead of
   * UTC is the account's yesterday for the first hours after midnight, while
   * yesterday's item is still being answered, and in a zone behind UTC the
   * account's tomorrow by the evening. Without the hours, the last day's.
   */
  const game = $derived(L.gameDay ?? { day: L.days[L.days.length - 1], right: last(L.daily.rightPerDay), wrong: last(L.daily.wrongPerDay) });
  const today = $derived({
    visitors: last(L.visitors.perDay),
    games: last(L.games.perDay),
    daily: game.right + game.wrong,
    named: game.right,
  });
  /** Against the usual day by now: its figure, and busier or quieter where chance can't have done it. */
  const against = (now: number, usual: number | null) => {
    if (usual === null) return null;
    const round = Math.round(usual);
    const tone = !beyondChanceOf(now, usual) ? 'flat' : now > usual ? 'up' : 'down';
    return { usual: round, tone, says: tone === 'up' ? 'busier than usual' : tone === 'down' ? 'quieter than usual' : 'about usual' };
  };

  const changes = $derived<Changes | null>(read.changes ?? null);
  /** What the newest update brought, while it's the newest (marked on the figures). */
  const lit = $derived(changes && changes.at === read.at ? changes : null);
  const figures = $derived([
    { name: 'Visits', value: today.visitors, added: lit?.visitors ?? 0, vs: against(today.visitors, L.usual?.visitors ?? null), note: '' },
    { name: 'Games', value: today.games, added: lit?.games ?? 0, vs: against(today.games, L.usual?.games ?? null), note: '' },
    {
      name: "Today's unique",
      value: today.daily,
      added: lit?.answers ?? 0,
      vs: against(today.daily, L.usual?.answers ?? null),
      note: [today.daily ? `${percent(today.named, today.daily)} named it` : '', game.day < L.days[L.days.length - 1] ? "yesterday's item till 00:00 UTC" : ''].filter(Boolean).join('; '),
    },
  ]);
  const clock = $derived(new Date(read.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const list = (ns: { name: string; count: number }[]) => ns.slice(0, 3).map((n) => `${n.name} +${fmt(n.count)}`).join(', ') + (ns.length > 3 ? ` and ${ns.length - 3} more` : '');
  /** The update's line: what the figures' "+" don't say. */
  const parts = $derived(
    changes
      ? [
          changes.countries.length ? `from ${list(changes.countries)}` : '',
          changes.systems.length ? `on ${list(changes.systems)}` : '',
          changes.modes.length ? `playing ${changes.modes.map((m) => `${m.name} ${fmt(m.count)}`).join(', ')}` : '',
        ].filter(Boolean)
      : [],
  );
</script>

<section class="today" class:lit class:tall aria-label="Today so far" aria-live="polite">
  <h2>Today so far <span>to {clock}, against a usual day by then</span></h2>
  <div class="figures">
    {#each figures as f (f.name)}
      <div>
        <span class="name">{f.name}</span>
        <b>{fmt(f.value)}{#if f.added}<span class="added" title="New since the last update">+{fmt(f.added)} new</span>{/if}</b>
        {#if f.vs}<span class="vs"><i class={f.vs.tone}>{f.vs.says}</i> · usually {fmt(f.vs.usual)} by now</span>{/if}
        {#if f.note}<span class="soft">{f.note}</span>{/if}
      </div>
    {/each}
  </div>
  <!-- Always there, one line (the whole of it in its title): what arrives with an update never moves what's below. -->
  {#if changes && parts.length}
    <p class="new" title={parts.join('; ')}><span class="when">{lit ? `New since ${time(changes.since)}:` : `Last new, ${time(changes.since)} to ${time(changes.at)}:`}</span> {parts.join('; ')}</p>
  {:else}
    <p class="new"><span class="when">Nothing new yet</span> since {time(read.at)}.</p>
  {/if}
</section>

<style>
  /* A column: the figures at the top, the update's line at the foot when the box is taller than they need (beside a big chart). */
  .today {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    padding: 1.3rem 1.6rem 1.4rem;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-left: 4px solid var(--line);
    border-radius: 4px;
    container-type: inline-size;
  }
  .today.lit {
    border-color: rgba(217, 176, 98, 0.5);
    border-left-color: var(--a-now);
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--gold-hi);
  }
  h2 span {
    font-family: var(--font-data);
    font-size: 1rem;
    font-weight: 400;
    color: var(--a-muted);
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem 1.5rem;
  }
  .figures > div {
    display: grid;
    align-content: start;
    gap: 0.15rem;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    color: var(--a-ink);
  }
  .figures b {
    font-size: 2.6rem;
    font-weight: 650;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--a-ink);
  }
  .added {
    margin-left: 0.5rem;
    font-size: 0.5em;
    font-weight: 650;
    letter-spacing: 0;
    vertical-align: 0.55em;
    color: var(--a-now);
  }
  .soft,
  .vs {
    color: var(--a-muted);
  }
  .vs i {
    font-style: normal;
    font-weight: 650;
  }
  .new {
    margin: auto 0 0;
    padding-top: 0.9rem;
    border-top: 1px solid var(--a-rule);
    overflow: hidden;
    color: var(--a-text);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .when {
    font-weight: 600;
    color: var(--a-muted);
  }
  .lit .when {
    color: var(--a-now);
  }
  /* A narrow box (a phone): the three a size smaller, so each keeps to its line. */
  @container (max-width: 24rem) {
    .figures {
      gap: 0.8rem 1rem;
    }
    .figures b {
      font-size: 2.1rem;
    }
  }
  /* Beside a big chart: one under another, larger. */
  .tall .figures {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 1rem;
  }
  .tall .figures b {
    font-size: 3.2rem;
  }
</style>
