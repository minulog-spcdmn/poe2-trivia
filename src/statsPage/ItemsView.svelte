<script lang="ts">
  // Items: which items players miss more than the rest asked under the same
  // rules, from the item tally (tally.ts; lib/itemTallyRank.ts ranks it, as
  // scripts/item-tally.mjs does), so the ones hardly anyone recognises can
  // be found. Its answers have no dates, so the period doesn't apply here:
  // Analytics' dates line says "All answers so far" instead. Read as the view
  // opens and on Read again (Analytics.svelte); the choices narrow it here.
  import { onMount } from 'svelte';
  import { TALLY_ROWS, rank, type RankOptions, type Ranked, type TallyMode, type TallyRow } from '../lib/itemTallyRank';
  import { itemSrcset, itemThumb } from '../lib/ui-paths';
  import { fmt } from './chart';
  import How from './How.svelte';
  import Section from './Section.svelte';
  import Seg from './Seg.svelte';

  let { rows, reading, failed, onagain }: { rows: TallyRow[] | null; reading: boolean; failed: string; onagain: () => void } = $props();

  type Item = { name: string; group: string };
  /** items.json, loaded as the view opens (the page's other views never need it). */
  let items = $state<Map<string, Item> | null>(null);
  onMount(() => {
    void import('../data/items.json')
      .then((m) => (items = new Map(m.default.map((i) => [i.id, { name: i.name, group: i.group }]))))
      .catch(() => undefined);
  });

  const FORMS = [
    { value: 'both', name: 'Both' },
    { value: 'n', name: 'Name' },
    { value: 'a', name: 'Art' },
  ] as const;
  const MODES = [
    { value: 'all', name: 'All' },
    { value: 'delve', name: 'Delve alone' },
    { value: 'together', name: 'Together' },
    { value: 'turns', name: 'Take turns' },
    { value: 'race', name: 'Race' },
    { value: 'practice', name: 'Practice' },
    { value: 'daily', name: 'Daily' },
  ] as const;
  const FIRSTS = [
    { value: 'off', name: 'Off' },
    { value: 'on', name: 'On' },
  ] as const;
  const MINS = [1, 10, 30, 100].map((n) => ({ value: n, name: String(n) }));
  /** The list's first rows; the rest on asking. */
  const FIRST_ROWS = 50;
  /** The furthest the axis reaches: past it, an interval (or a score) runs off its end. */
  const AXIS_MOST = 5;

  let form = $state<(typeof FORMS)[number]['value']>('both');
  let mode = $state<(typeof MODES)[number]['value']>('all');
  let first = $state<(typeof FIRSTS)[number]['value']>('off');
  let min = $state(10);
  let all = $state(false);

  const options = $derived<RankOptions>({ form: form === 'both' ? undefined : form, mode: mode === 'all' ? undefined : (mode as TallyMode), first: first === 'on', min });
  const ranked = $derived(rows ? rank(rows, options) : null);
  const list = $derived(ranked?.list ?? []);
  const shown = $derived(all ? list : list.slice(0, FIRST_ROWS));
  /** Sums for ids items.json doesn't have: a table filling with them is someone making them up. */
  const unknown = $derived(rows && items ? rows.filter((x) => !items!.has(x.item)).length : null);

  /** One axis for every row of the list (not only those shown, so showing the rest doesn't move it): from 0 to the highest score, half a step up, 2 at least and AXIS_MOST at most. */
  const top = $derived(Math.min(AXIS_MOST, Math.max(2, Math.ceil(2 * list.reduce((m, s) => Math.max(m, s.score ?? 0), 0)) / 2)));
  const at = (x: number) => `${(100 * Math.min(1, Math.max(0, x / top))).toFixed(2)}%`;
  const ticks = $derived(Array.from({ length: Math.floor(top) + 1 }, (_, i) => i));
  /** Whether the item is surely missed more than the rest (its interval clear of 1). */
  const clear = (s: Ranked) => s.score !== null && s.low > 1;
  const two = (x: number | null) => (x === null ? '–' : x.toFixed(2));
  const interval = (s: Ranked) => (s.score === null ? 'No score: every answer in its contexts was right' : `90% interval ${two(s.low)} to ${Number.isFinite(s.high) ? two(s.high) : 'no end'}`);
</script>

<div class="stack">
  <p class="what">
    Every player’s answers, item by item, each held against how often all items are missed under the same rules. The items hardly anyone recognises come first.
  </p>

  <div class="picks">
    <div class="pick-one"><span class="cap">Question</span><Seg label="Question form" options={FORMS} value={form} onpick={(v) => (form = v)} /></div>
    <div class="pick-one"><span class="cap">Mode</span><Seg label="Mode" options={MODES} value={mode} onpick={(v) => (mode = v)} /></div>
    <div class="pick-one"><span class="cap">First meetings only</span><Seg label="First meetings only" options={FIRSTS} value={first} onpick={(v) => (first = v)} /></div>
    <div class="pick-one"><span class="cap">Answers at least</span><Seg label="Answers at least" options={MINS} value={min} onpick={(v) => (min = v)} /></div>
  </div>

  <!-- (Its room kept while the tally is read, so the list doesn't move down as it arrives.) -->
  <p class="line" aria-live="polite">
    {#if rows && ranked}
      Tally version <span class="num">{ranked.v}</span>: <span class="num">{fmt(rows.length)}</span> sums kept, of <span class="num">{fmt(TALLY_ROWS)}</span> at most{#if unknown !== null}; <span class="num">{fmt(unknown)}</span> of them for ids items.json doesn’t have{/if}.
    {:else}&nbsp;{/if}
  </p>

  {#if failed}
    <p class="say bad" role="alert">The tally couldn’t be read: {failed} <button type="button" class="again" onclick={onagain}>Try again</button></p>
  {/if}

  <Section title="Most missed first" says="Misses over those the item’s rules would expect: 1 is as missed as the rest, 2 twice as often. The line is the score’s 90% interval, gold where it stands clear of 1.">
    {#if !rows}
      <p class="say">{reading ? 'Reading the tally…' : ''}&nbsp;</p>
    {:else if !rows.length}
      <p class="say">Nobody has answered since the tally began.</p>
    {:else if !list.length}
      <p class="say">No item has {min === 1 ? 'an answer' : `${min} answers or more`} with these choices.</p>
    {:else}
      <div class="scroll-x">
      <table class="table items" aria-label="Items, most missed first" style:--top={top}>
        <thead>
          <tr>
            <th scope="col" class="art-col"><span class="sr">Art</span></th>
            <th scope="col">Item</th>
            <th scope="col" class="n opt">Answers</th>
            <th scope="col" class="n opt">Missed</th>
            <th scope="col" class="n opt">Expected</th>
            <th scope="col" class="n opt">Score</th>
            <th scope="col" class="axis">
              <span class="sr">The score and its 90% interval</span>
              <span class="scale" aria-hidden="true">
                {#each ticks as t (t)}<span class="tick" class:one={t === 1} style:left={at(t)}>{t}</span>{/each}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {#each shown as s (s.item)}
            {@const item = items?.get(s.item)}
            <tr>
              <td class="art-col">
                {#if item}<img class="art" srcset={itemSrcset(s.item)} src={itemThumb(s.item, 128)} alt="" loading="lazy" decoding="async" />{:else}<span class="art"></span>{/if}
              </td>
              <th scope="row" class="item">
                {#if item}
                  <span class="iname">{item.name}</span><span class="kind">{item.group}</span>
                {:else if items}
                  <span class="iname unknown">{s.item}</span><span class="kind">Not in items.json</span>
                {:else}
                  <span class="iname unknown">{s.item}</span>
                {/if}
                <span class="on-phone"><span class="num">{fmt(s.n)}</span> answers, <span class="num">{fmt(s.miss)}</span> missed, <span class="num">{s.expected.toFixed(1)}</span> expected</span>
              </th>
              <td class="n opt num">{fmt(s.n)}</td>
              <td class="n opt num">{fmt(s.miss)}</td>
              <td class="n opt num">{s.expected.toFixed(1)}</td>
              <td class="n opt num strong" title={interval(s)}>{two(s.score)}</td>
              <td class="axis" title={interval(s)}>
                <span class="on-phone num strong">{two(s.score)}</span>
                <span class="track" class:clear={clear(s)}>
                  {#if s.score !== null}
                    <i class="span" class:open={s.high > top} style:left={at(s.low)} style:right="calc(100% - {at(s.high)})"></i>
                    <i class="dot" class:past={s.score > top} style:left={at(s.score)}></i>
                  {/if}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>
      {#if list.length > FIRST_ROWS}
        <button type="button" class="more" aria-expanded={all} onclick={() => (all = !all)}>{all ? `Show the first ${FIRST_ROWS}` : `Show all ${fmt(list.length)} items`}</button>
      {/if}
    {/if}
  </Section>

  <div class="foot">
    <How
      items={[
        'From the matchmaking server, not GoatCounter: every answer of every player who’s counted, summed per item, question form (Name: naming it from its art; Art: finding its art for its name), the rules it was asked under (Delve alone or together by its band of ten depths, Take turns and Race by difficulty, practice, Today’s unique) and whether it was the player’s first meeting with the item. It keeps no dates, so the period doesn’t apply here.',
        'An item’s expected misses are its answers under each of those rules times how often every item is missed under them, summed: an item asked deep in Delve is held to how often deep questions are missed. Its score is its misses over that; its interval, a 90% Poisson interval on the misses (Byar’s approximation) over the same.',
        'The list runs by the interval’s low end, so an item with few answers has to be missed far more to come near the top. An item never missed where nothing else was either has no score and goes last.',
        'The choices narrow the answers before the rates are worked out: with first meetings only, an item is held to other first meetings.',
        `The tally keeps ${fmt(TALLY_ROWS)} sums at most; past that no new one is started. Many for ids items.json doesn’t have means someone is sending made-up ones.`,
        'npm run item-tally lists the same in a terminal.',
      ]}
    />
  </div>
</div>

<style>
  .stack {
    display: grid;
    gap: 1.25rem;
  }
  .what {
    margin: 0;
    max-width: 62rem;
    font-size: 1.2rem;
    color: var(--a-text);
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 2rem;
  }
  .pick-one {
    display: grid;
    gap: 0.35rem;
    align-content: start;
  }
  .cap {
    font-size: 1rem;
    color: var(--a-muted);
  }
  /* Figures in the page's Inter, fixed widths so the columns line up (analytics.css). */
  .num {
    font-weight: 600;
  }
  /* The tally's own line, the empty and the failed: a note, as the other views set theirs. */
  .line,
  .say {
    margin: 0;
    font-size: 1rem;
    color: var(--a-muted);
  }
  .say.bad {
    color: var(--a-ink);
  }
  .again {
    margin-left: 0.4rem;
    padding: 0;
    font: inherit;
    font-style: normal;
    font-family: var(--font-data);
    font-weight: 600;
    color: var(--gold);
    background: none;
    border: 0;
    text-decoration: underline;
    cursor: pointer;
  }
  .art-col {
    width: 2.75rem;
    padding-right: 0.5rem;
  }
  .art {
    display: block;
    width: 2.5rem;
    height: 2.5rem;
    object-fit: contain;
  }
  .item {
    min-width: 11rem;
  }
  .iname {
    display: block;
    font-weight: 600;
    color: var(--unique-hi);
  }
  .iname.unknown {
    color: var(--a-ink);
    word-break: break-all;
  }
  .kind {
    display: block;
    font-size: 0.95rem;
    font-weight: 400;
    color: var(--a-muted);
  }
  .strong {
    color: var(--a-ink);
  }
  .table .n.num {
    font-size: 1rem;
  }

  /* The score's axis: every row on the same one, 1 (as missed as the rest) marked down the list. */
  .axis {
    width: 40%;
    min-width: 8rem;
  }
  thead .axis {
    vertical-align: bottom;
  }
  .scale {
    position: relative;
    display: block;
    height: 1.4rem;
    margin: 0 0.5rem;
  }
  .tick {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--a-muted);
  }
  .tick.one {
    color: var(--a-ink);
  }
  .track {
    position: relative;
    display: block;
    height: 1rem;
    margin: 0 0.5rem;
    background: linear-gradient(var(--a-track), var(--a-track)) 0 50% / 100% 1px no-repeat;
  }
  /* 1, the rest's own rate: a line through every row. */
  .track::before {
    content: '';
    position: absolute;
    top: -0.9rem;
    bottom: -0.9rem;
    left: calc(100% / var(--top, 1));
    width: 1px;
    background: rgba(239, 230, 214, 0.35);
  }
  .span {
    position: absolute;
    top: 50%;
    height: 4px;
    margin-top: -2px;
    border-radius: 2px;
    background: var(--a-before);
  }
  /* Running off the axis's end: past what it shows. */
  .span.open {
    border-radius: 2px 0 0 2px;
    mask-image: linear-gradient(to left, transparent, #000 1.5rem);
  }
  .dot {
    position: absolute;
    top: 50%;
    width: 0.6rem;
    height: 0.6rem;
    margin: -0.3rem 0 0 -0.3rem;
    border-radius: 50%;
    background: var(--a-text);
  }
  .dot.past {
    border-radius: 0 50% 50% 0;
  }
  .clear .span {
    background: rgba(217, 176, 98, 0.55);
  }
  .clear .dot {
    background: var(--a-now);
  }
  .more {
    margin-top: 0.8rem;
    padding: 0.3rem 0;
    font: inherit;
    font-size: 1rem;
    font-weight: 600;
    color: var(--gold);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .more:hover {
    color: var(--gold-hi);
    text-decoration: underline;
  }
  .foot {
    margin: 0;
    font-size: 1rem;
    color: var(--a-muted);
  }
  /* A phone: the figures under the name, the score above its axis. */
  @media (max-width: 700px) {
    .item {
      min-width: 0;
    }
    .axis {
      width: 38%;
      min-width: 6.5rem;
    }
    .axis .on-phone {
      margin: 0 0.5rem 0.15rem;
      font-size: 0.95rem;
      color: var(--a-ink);
    }
    .on-phone .num {
      font-weight: 500;
    }
    .art-col {
      width: 2.25rem;
    }
    .art {
      width: 2rem;
      height: 2rem;
    }
  }
  @media (max-width: 760px) {
    .what {
      font-size: 1.05rem;
    }
    .picks {
      gap: 0.8rem;
    }
  }
</style>
