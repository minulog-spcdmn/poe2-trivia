<script lang="ts">
  // What the last update brought in (changes.ts), in a line: visitors, games
  // by mode, answers, joins and failures added, then the countries the new
  // visitors came from and the systems they came on. Lit while it's the
  // newest update's; once an update brings nothing, the last that did stays,
  // dimmed, with its times.
  import type { Changes } from './changes';
  import { fmt } from './chart';

  let { changes, at }: { changes: Changes; at: number } = $props();

  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const lit = $derived(changes.at === at);
  const many = (n: number, one: string, more = `${one}s`) => `+${fmt(n)} ${n === 1 ? one : more}`;
  const list = (ns: { name: string; count: number }[]) => ns.slice(0, 4).map((n) => `${n.name} +${fmt(n.count)}`).join(', ') + (ns.length > 4 ? ` and ${ns.length - 4} more` : '');
</script>

<section class="new" class:lit aria-label="New since the last update" aria-live="polite">
  <h2>{lit ? `New since ${time(changes.since)}` : `Last new, ${time(changes.since)} to ${time(changes.at)}`}</h2>
  <ul>
    {#if changes.visitors}<li><b>{many(changes.visitors, 'visitor')}</b></li>{/if}
    {#if changes.games}<li><b>{many(changes.games, 'game')}</b>{#if changes.modes.length}<span class="of">{changes.modes.map((m) => `${m.name} ${fmt(m.count)}`).join(', ')}</span>{/if}</li>{/if}
    {#if changes.answers}<li><b>{many(changes.answers, "answer to Today's unique", "answers to Today's unique")}</b></li>{/if}
    {#if changes.tries}<li><b>{many(changes.tries, 'try to join', 'tries to join')}</b></li>{/if}
    {#if changes.failures}<li class="bad"><b>{many(changes.failures, 'failure')}</b></li>{/if}
  </ul>
  {#if changes.countries.length || changes.systems.length}
    <ul class="whence">
      {#if changes.countries.length}<li><span class="what">From</span> {list(changes.countries)}</li>{/if}
      {#if changes.systems.length}<li><span class="what">On</span> {list(changes.systems)}</li>{/if}
    </ul>
  {/if}
</section>

<style>
  .new {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    /* Its lines together at the top when a grid makes the box taller than they are (the board). */
    align-content: start;
    gap: 0.3rem 1.4rem;
    padding: 0.8rem 1.3rem;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-left: 4px solid var(--a-before);
    border-radius: 4px;
  }
  .new.lit {
    border-color: rgba(217, 176, 98, 0.5);
    border-left-color: var(--a-now);
  }
  h2 {
    margin: 0;
    font-family: var(--font-data);
    font-size: 1rem;
    font-weight: 600;
    color: var(--a-muted);
  }
  .lit h2 {
    color: var(--a-now);
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  b {
    font-weight: 650;
    color: var(--a-ink);
  }
  .bad b {
    color: var(--a-down);
  }
  .of,
  .what {
    color: var(--a-muted);
  }
  /* (Svelte drops the space before it at the start of the element.) */
  .of {
    margin-left: 0.4em;
  }
  .whence {
    color: var(--a-text);
  }
</style>
