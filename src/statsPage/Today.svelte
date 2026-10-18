<script lang="ts">
  // Today so far, against the same time of day a period ago (load() cuts the
  // period before's last day there), with what the last update brought in:
  // each figure's "+5", then the games by mode, the tries to join, and the
  // countries the new visitors came from and the systems they came on
  // (changes.ts). Lit while that update is the newest; once one brings
  // nothing, the last that did stays below, dimmed, with its times. The
  // failures say the period's too, opening Joining (what went wrong most on
  // pointing at it). `tall`: the box stands beside a big chart (a big
  // monitor), so its figures are larger, two by two.
  import type { Changes } from './changes';
  import { fmt, longDay } from './chart';
  import Delta from './Delta.svelte';
  import { percent } from './model';
  import type { Period, Read } from './read';

  let { read, period, tall = false }: { read: Read; period: Period; tall?: boolean } = $props();

  const L = $derived(read.now);
  const B = $derived(read.before);
  const last = (vs: number[]) => vs[vs.length - 1] ?? 0;
  const answers = (c: typeof L) => last(c.daily.rightPerDay) + last(c.daily.wrongPerDay);
  const today = $derived({
    visitors: [last(L.visitors.perDay), last(B.visitors.perDay)],
    games: [last(L.games.perDay), last(B.games.perDay)],
    daily: [answers(L), answers(B)],
    named: last(L.daily.rightPerDay),
    failed: last(L.failuresPerDay),
  });
  const failed = $derived(L.failures.reduce((n, f) => n + f.count, 0));
  const worst = $derived(L.failures[0]);
  const sameTime = $derived(`${longDay(read.toBefore)} at this time`);

  const changes = $derived<Changes | null>(read.changes ?? null);
  /** What the newest update brought, while it's the newest (marked on the figures). */
  const lit = $derived(changes && changes.at === read.at ? changes : null);
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const list = (ns: { name: string; count: number }[]) => ns.slice(0, 4).map((n) => `${n.name} +${fmt(n.count)}`).join(', ') + (ns.length > 4 ? ` and ${ns.length - 4} more` : '');
  /** The update's lines below the figures: what the figures' "+" don't say. */
  const more = $derived(!!changes && (changes.modes.length > 0 || changes.tries > 0 || changes.countries.length > 0 || changes.systems.length > 0));
</script>

<section class="today" class:lit class:tall aria-label="Today so far" aria-live="polite">
  <h2>Today so far <span>against {sameTime}</span></h2>
  <div class="figures">
    <div>
      <span class="name">Visitors</span>
      <b>{fmt(today.visitors[0])}{#if lit?.visitors}<span class="added">+{fmt(lit.visitors)}</span>{/if}</b>
      <Delta now={today.visitors[0]} before={today.visitors[1]} period="" />
    </div>
    <div>
      <span class="name">Games</span>
      <b>{fmt(today.games[0])}{#if lit?.games}<span class="added">+{fmt(lit.games)}</span>{/if}</b>
      <Delta now={today.games[0]} before={today.games[1]} period="" />
    </div>
    <div>
      <span class="name">Today's unique</span>
      <b>{fmt(today.daily[0])}{#if lit?.answers}<span class="added">+{fmt(lit.answers)}</span>{/if}</b>
      <span class="soft">{today.daily[0] ? `${percent(today.named, today.daily[0])} named it` : 'nobody yet'}</span>
    </div>
    <div class:bad={today.failed > 0}>
      <span class="name">Failures</span>
      <b>{fmt(today.failed)}{#if lit?.failures}<span class="added">+{fmt(lit.failures)}</span>{/if}</b>
      {#if failed}
        <a class="why" href="#joining" title="Most often: {worst.host ? 'opening a room, ' : ''}{worst.label.toLowerCase()} ({fmt(worst.count)})">{fmt(failed)} in {period.now.toLowerCase()} ›</a>
      {:else}
        <span class="soft">none in {period.now.toLowerCase()}</span>
      {/if}
    </div>
  </div>
  {#if changes && more}
    <div class="new">
      <p class="head">
        <span class="when">{lit ? `New since ${time(changes.since)}` : `Last new, ${time(changes.since)} to ${time(changes.at)}`}</span>
        {#if changes.modes.length}<span><span class="what">Games</span> {changes.modes.map((m) => `${m.name} ${fmt(m.count)}`).join(', ')}</span>{/if}
        {#if changes.tries}<span><span class="what">Tries to join</span> {fmt(changes.tries)}</span>{/if}
      </p>
      {#if changes.countries.length}<p><span class="what">From</span> {list(changes.countries)}</p>{/if}
      {#if changes.systems.length}<p><span class="what">On</span> {list(changes.systems)}</p>{/if}
    </div>
  {/if}
</section>

<style>
  /* A column: the figures at the top, what the update brought at the foot when the box is taller than they need (beside a big chart). */
  .today {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.1rem 1.4rem 1.2rem;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-left: 4px solid var(--a-before);
    border-radius: 4px;
    /* Four figures to a row where there's room, two where there isn't. */
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.8rem 1.2rem;
  }
  .figures > div {
    display: grid;
    align-content: start;
    gap: 0.1rem;
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
  .bad b {
    color: var(--a-down);
  }
  .soft {
    color: var(--a-muted);
  }
  .why {
    color: var(--a-down);
    text-decoration: none;
    cursor: pointer;
  }
  .why:hover {
    text-decoration: underline;
  }
  .new {
    display: grid;
    gap: 0.2rem;
    margin-top: auto;
    padding-top: 0.8rem;
    border-top: 1px solid var(--a-rule);
  }
  .new p {
    margin: 0;
    color: var(--a-text);
  }
  /* When, then the games by mode and the tries, on one line where they fit. */
  .new .head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem 1.2rem;
  }
  .when {
    font-weight: 600;
    color: var(--a-muted);
  }
  .lit .when {
    color: var(--a-now);
  }
  .what {
    color: var(--a-muted);
  }
  .tall .figures {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 1.6rem;
  }
  .tall .figures b {
    font-size: 4.2rem;
  }
  @container (max-width: 30rem) {
    .figures {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
