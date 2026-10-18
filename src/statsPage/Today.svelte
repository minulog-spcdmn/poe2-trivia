<script lang="ts">
  // Today so far, against the same time of day a period ago (load() cuts the
  // period before's last day there), each figure with what the last update
  // added ("+5"), and below them, in a line, where the new visitors came from
  // and on what, and what the new games were (changes.ts). Lit while that
  // update is the newest; once one brings nothing, the last that did stays,
  // dimmed, with its times. `tall`: the box stands beside a big chart on a
  // screen with the height for it (4K), so its figures are larger, one under
  // another.
  import type { Changes } from './changes';
  import { fmt, longDay } from './chart';
  import Delta from './Delta.svelte';
  import { answersPerDay, percent } from './model';
  import type { Read } from './read';

  let { read, tall = false }: { read: Read; tall?: boolean } = $props();

  const L = $derived(read.now);
  const B = $derived(read.before);
  const last = (vs: number[]) => vs[vs.length - 1] ?? 0;
  const today = $derived({
    visitors: [last(L.visitors.perDay), last(B.visitors.perDay)],
    games: [last(L.games.perDay), last(B.games.perDay)],
    daily: [last(answersPerDay(L)), last(answersPerDay(B))],
    named: last(L.daily.rightPerDay),
  });
  const sameTime = $derived(`${longDay(read.toBefore)} at this time`);

  const changes = $derived<Changes | null>(read.changes ?? null);
  /** What the newest update brought, while it's the newest (marked on the figures). */
  const lit = $derived(changes && changes.at === read.at ? changes : null);
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
  </div>
  {#if changes && parts.length}
    <p class="new"><span class="when">{lit ? `New since ${time(changes.since)}:` : `Last new, ${time(changes.since)} to ${time(changes.at)}:`}</span> {parts.join('; ')}</p>
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
    border-left: 4px solid var(--a-before);
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
  .soft {
    color: var(--a-muted);
  }
  .new {
    margin: auto 0 0;
    padding-top: 0.9rem;
    border-top: 1px solid var(--a-rule);
    color: var(--a-text);
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
