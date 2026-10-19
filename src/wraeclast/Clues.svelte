<script lang="ts">
  // What is known of the item, set as its own tooltip lines (ItemDetails.svelte:
  // Fontin small capitals, blue mods, orange flavour text), each under a small
  // label that says what it is: "Free • " before the zone's free clue, and
  // "Stacked Deck • " before one a Stacked Deck drew. A rule between every
  // two. No counts: nothing says how many lines are still hidden. Under them,
  // the names tried and wrong, fused as the answer line set them, with their
  // marks. Once named, the whole tooltip.
  // `beside`: the lines stand in the narrow column beside the art (a short
  // phone): smaller type, set from the left.
  import { CLUES, SUPPLY_NAMES, baseText, nameOf, type DeckClue, type Mark, type Run } from './rules';
  import { verses } from './markup';
  import ClueText from './ClueText.svelte';
  import { DECK_DREW, FREE_LABEL, LENGTHS_CLUE, NO_CLUES, NO_CLUES_EMPTY, PATCH_CLUE, SAME_KIND } from './words';

  let { run, beside = false }: { run: Run; beside?: boolean } = $props();
  const it = $derived(run.state.item!);
  const named = $derived(run.state.phase === 'solved');
  const clues = $derived(CLUES[it.itemId]);
  const free = $derived(it.freeClue);
  const gem = $derived(clues.support !== null);
  const tried = $derived(it.log.submits.filter((sub) => !sub.right));

  /** A clue's label: what it is, and what gave it when that was the zone or a Stacked Deck. */
  type Label = { main: string; drew?: string };
  type Line =
    | { k: 'cat' }
    | { k: 'mod'; i: number; label?: Label }
    | { k: 'orb'; label: Label }
    | { k: 'flavor'; label?: Label }
    | { k: 'base'; label: Label }
    | { k: 'plain'; label: Label; text: string };

  /** Whether a Stacked Deck gave this clue (it never draws one already shown). */
  const dealt = (clue: DeckClue) => it.deck.some((d) => d.clue === clue);
  const label = (what: string, by: 'free' | 'deck' | null): Label =>
    by === 'free' ? { main: `${FREE_LABEL} • ${what}` } : by === 'deck' ? { main: SUPPLY_NAMES.deck, drew: `• ${what}` } : { main: what };

  const lines = $derived.by((): Line[] => {
    if (named) return [{ k: 'cat' }, ...clues.mods.map((_, i) => ({ k: 'mod' as const, i })), ...(clues.flavor !== null ? [{ k: 'flavor' as const }] : [])];
    const out: Line[] = [];
    const deckMods = new Set(it.deck.flatMap((d) => (d.mod === undefined ? [] : [d.mod])));
    it.shown.mods.forEach((i, k) => out.push({ k: 'mod', i, label: label(DECK_DREW.mod, k === 0 && free === 'mod' ? 'free' : deckMods.has(i) ? 'deck' : null) }));
    // With no sibling the Ancient Orb greys out: it never shows the category in its place.
    if (it.shown.category && it.sibling) out.push({ k: 'orb', label: label(DECK_DREW.category, dealt('category') ? 'deck' : null) });
    if (it.shown.flavor && clues.flavor !== null) out.push({ k: 'flavor', label: label(DECK_DREW.flavor, free === 'flavor' ? 'free' : dealt('flavor') ? 'deck' : null) });
    if (it.shown.base) out.push({ k: 'base', label: label(gem ? 'Support text' : DECK_DREW.base, free === 'base' ? 'free' : dealt('base') ? 'deck' : null) });
    if (it.shown.lengths) out.push({ k: 'plain', label: label(DECK_DREW.lengths, free === 'lengths' ? 'free' : dealt('lengths') ? 'deck' : null), text: LENGTHS_CLUE });
    if (free === 'burn') out.push({ k: 'plain', label: label(DECK_DREW.burn, 'free'), text: PATCH_CLUE });
    if (dealt('burn')) out.push({ k: 'plain', label: label(DECK_DREW.burn, 'deck'), text: PATCH_CLUE });
    return out;
  });
  /** Once named, the tooltip's own rules: between its parts, not between two mod lines. */
  const ruled = (k: number) => k > 0 && (!named || lines[k].k !== lines[k - 1].k);

  /** A try as the answer line set it: its words, each tile with its mark. */
  function words(sub: { tiles: string[]; breaks: number[]; marks: string[] }) {
    const out: { t: string; m: Mark | null }[][] = [[]];
    sub.tiles.forEach((t, i) => {
      if (i > 0 && sub.breaks.includes(i)) out.push([]);
      const m = sub.marks[i];
      out.at(-1)!.push({ t, m: m === 'gold' || m === 'silver' || m === 'struck' ? m : null });
    });
    return out;
  }
</script>

{#snippet tag(l: Label | undefined)}
  {#if l}<span class="lbl-t">{l.main}{#if l.drew}{' '}<span class="drew">{l.drew}</span>{/if}</span>{/if}
{/snippet}

<div class="lines" class:beside>
  {#each lines as line, k (k)}
    {#if ruled(k)}<div class="rule" aria-hidden="true"></div>{/if}
    {#if line.k === 'cat'}
      <p class="tline cat">{clues.category}</p>
    {:else if line.k === 'mod'}
      {@const [kind, text] = clues.mods[line.i]}
      <p class="tline mod {kind}">{@render tag(line.label)}<ClueText {text} /></p>
    {:else if line.k === 'orb'}
      <p class="tline orb">{@render tag(line.label)}<b>{nameOf(it.sibling!)}</b> • {SAME_KIND}</p>
    {:else if line.k === 'flavor'}
      <p class="tline flav">
        {@render tag(line.label)}
        {#each verses(clues.flavor!) as v, j (j)}<span class="verse"><ClueText text={v} /></span>{/each}
      </p>
    {:else if line.k === 'base'}
      <p class="tline base">{@render tag(line.label)}<ClueText text={baseText(clues)} /></p>
    {:else}
      <p class="tline plain">{@render tag(line.label)}{line.text}</p>
    {/if}
  {/each}
  {#if !lines.length}
    <p class="tline plain">{run.state.pack.length ? NO_CLUES : NO_CLUES_EMPTY}</p>
  {/if}
  {#if !named}
    {#each tried as sub, k (k)}
      {@const ws = words(sub)}
      <div class="tried">
        <span class="sr">Tried {ws.map((w) => w.map((g) => g.t).join('')).join(' ')}: −{sub.lost} life</span>
        <span class="x" aria-hidden="true">✕</span>
        {#each ws as w, j (j)}
          {#if j > 0}<span class="gap" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10v5.2h15V10" /></svg></span>{/if}
          <span class="fw" aria-hidden="true">{#each w as g, d (d)}<span class="seg {g.m ?? ''}"><span>{g.t}</span></span>{/each}</span>
        {/each}
        <span class="cost" aria-hidden="true">−{sub.lost}</span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .lines {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    min-width: 0;
    padding: 10px 12px 12px;
    text-align: center;
    font-family: var(--font-tooltip);
    font-variant-numeric: lining-nums;
  }
  .tline {
    margin: 0;
    font-size: 14px;
    line-height: 1.3;
    color: #8c8c8c;
    text-wrap: pretty;
  }
  .tline b {
    font-weight: 400;
    color: #f2efe8;
  }
  /* Explicit mods blue; properties, requirements and a gem's text grey with white values. */
  .tline.mod.e {
    color: #8888ff;
  }
  /* Implicit and enchant lines, as the game sets them apart. */
  .tline.mod.i {
    color: #b6b6ff;
  }
  .tline.flav {
    font-family: var(--font-tooltip-italic);
    font-style: italic;
    color: #af6025;
  }
  .verse {
    display: block;
  }
  .tline.cat {
    color: #c8c8c8;
  }
  /* The Ancient Orb's sibling, in the body's plain colour, its name white. */
  .tline.orb b {
    color: #e8e4dc;
  }
  .tline.plain {
    font-family: var(--font-body);
    font-style: italic;
    color: var(--muted);
  }
  /* What each line is, and what gave it. */
  .lbl-t {
    display: block;
    margin-bottom: 2px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 9.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #8a7a62;
    font-style: normal;
  }
  .lbl-t .drew {
    color: var(--muted);
    letter-spacing: 0.12em;
  }
  .rule {
    flex: none;
    height: 1px;
    margin: 7px auto;
    width: 84%;
    background: linear-gradient(90deg, transparent, rgba(175, 96, 37, 0.75) 22%, rgba(175, 96, 37, 0.75) 78%, transparent);
  }

  /* A name tried and wrong: fused as the answer line set it, its breaks and marks kept, and what it cost. */
  .tried {
    align-self: center;
    max-width: 100%;
    display: flex;
    align-items: center;
    margin-top: 8px;
    overflow: hidden;
  }
  .tried + .tried {
    margin-top: 5px;
  }
  .tried .x {
    margin-right: 6px;
    font-size: 12px;
    color: #f0a68c;
  }
  .tried .fw {
    flex: none;
    display: inline-flex;
    height: 20px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(30, 24, 17, 0.9);
    overflow: hidden;
  }
  .tried .seg {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 0 3px;
    font-family: var(--font-body);
    font-size: 13.5px;
    line-height: 1;
    white-space: nowrap;
    color: #e9c8a2;
  }
  .tried .seg:first-child {
    padding-left: 5px;
  }
  .tried .seg:last-child {
    padding-right: 5px;
  }
  .tried .seg + .seg::before {
    content: '';
    position: absolute;
    left: 0;
    top: 5px;
    bottom: 5px;
    width: 1px;
    background: rgba(241, 217, 155, 0.22);
  }
  .tried .seg.gold {
    color: #fff4d6;
    background: linear-gradient(180deg, rgba(110, 80, 34, 0.96), rgba(56, 40, 17, 0.96));
  }
  .tried .seg.silver {
    color: #f4f8fc;
    background: linear-gradient(180deg, rgba(70, 76, 84, 0.96), rgba(34, 37, 42, 0.96));
  }
  .tried .seg.struck {
    color: #c9b9a2;
    background: linear-gradient(180deg, rgba(48, 22, 16, 0.92), rgba(24, 12, 9, 0.92));
    text-decoration: line-through;
    text-decoration-color: rgba(224, 85, 63, 0.9);
    text-decoration-thickness: 1px;
  }
  .tried .seg.struck > span {
    opacity: 0.6;
  }
  .tried .gap {
    flex: none;
    width: 9px;
    height: 20px;
    display: grid;
    place-items: center;
    color: var(--gold-lo);
  }
  .tried .gap svg {
    width: 8px;
    height: 8px;
    translate: 0 3px;
  }
  .tried .cost {
    margin-left: 6px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 11.5px;
    color: #f0a68c;
  }

  /* Beside the art on a short phone: a narrow column, set from the left. */
  .lines.beside {
    padding: 6px 8px 6px 10px;
    text-align: left;
  }
  .beside .tline {
    font-size: 12px;
    line-height: 1.18;
  }
  .beside .lbl-t {
    margin-bottom: 1px;
  }
  .beside .rule {
    margin: 4px 0;
  }
  .beside .tried {
    align-self: flex-start;
    margin-top: 6px;
  }
  .beside .tried + .tried {
    margin-top: 4px;
  }

  @container item (min-width: 700px) {
    .lines {
      padding: 14px 24px 12px;
    }
    .tline {
      font-size: 17px;
    }
    .lbl-t {
      font-size: 10.5px;
    }
    .rule {
      margin: 9px auto;
    }
    .tried .fw {
      height: 24px;
    }
    .tried .seg {
      font-size: 15.5px;
    }
  }
</style>
