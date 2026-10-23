<script lang="ts">
  // A Craft round, step by step (craft.ts): the shop, scrambling your own
  // item, naming the one passed to you, and the reveal of both. What it
  // shows is only this player's to see (session.mine). Currency is used as
  // in Path of Exile 2: picked up (a click, or a right click), then put on
  // what it is for; shift keeps it in hand, Esc or a right click puts it back.
  import { fade } from 'svelte/transition';
  import type { Snippet } from 'svelte';
  import { engine, session } from '../lib/session.svelte';
  import { CRAFT, ORBS, SCRAMBLES, UNDOS, canScramble, guessedBy, holds, madeBy, rightGuess, type Aim, type Orb, type Piece } from '../lib/craft';
  import { loadCraftLines } from '../lib/craftLines';
  import type { ModLines } from '../lib/craft';
  import { looks } from '../lib/craftLooks.svelte';
  import { itemImage } from '../lib/ui-paths';
  import { backdropShadow } from '../lib/backdropShadow';
  import CraftItem from './CraftItem.svelte';
  import type { ModShown } from './ItemDetails.svelte';

  let { timer }: { timer?: Snippet } = $props();

  const s = $derived(session.mine!);
  const c = $derived(s.craft!);
  const me = $derived(session.myPlayerId ?? '');
  /** Not a spectator: one of the game's players. */
  const playing = $derived(s.players.some((p) => p.id === me));
  const gold = $derived(s.players.find((p) => p.id === me)?.score ?? 0);
  const done = $derived(c.ready.includes(me));
  const mine = $derived(madeBy(c, me));
  const theirs = $derived(guessedBy(c, me));
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
  const itemOf = (id: string) => engine.byId.get(id) ?? null;

  // The items' own mod lines, to mark what was done to a line (its maker's view, and the reveal's).
  let lines = $state<ModLines | null>(null);
  void loadCraftLines().then((l) => (lines = l));

  /** A piece's lines with what was done to them marked: its own, struck where taken away, another item's where swapped. */
  function marked(p: Piece, l: ModLines | null): ModShown[] {
    if (!l || !p.item) return p.shown.map((text) => ({ text }));
    const own = l(p.item);
    return p.slots.map((slot, i) =>
      slot === 'kept' ? { text: own[i] } : slot === 'gone' ? { text: own[i], mark: 'gone' as const } : { text: l(slot.art)[slot.line] ?? '', mark: 'swapped' as const },
    );
  }

  /** The kind of item a piece is, as its six names say: their group (Boots, Rings…), or the category they share. */
  const kindOf = (p: Piece) => {
    const its = p.options.flatMap((id) => itemOf(id) ?? []);
    if (!its.length) return '';
    return its.every((it) => it.group === its[0].group) ? its[0].group : its[0].category;
  };

  const look = (p: Piece | null) => (p ? looks.of(c.round, p.maker, p.look) : null);
  const trueArt = (p: Piece) => {
    const it = itemOf(p.item);
    return it ? { url: itemImage(it.id), w: it.w, h: it.h } : null;
  };

  const act = (a: { do: 'buy' | 'use' | 'ready' | 'guess'; orb?: Orb; index?: number; aim?: Aim }) => session.dispatch({ type: 'craft', ...a });

  /** The currency in hand, picked up from its tile. */
  let held = $state<Orb | null>(null);
  /** Whether it can still be used this step: one left, and something for it to do. */
  const usable = (orb: Orb) =>
    playing &&
    holds(c, me, orb) > 0 &&
    (ORBS[orb].side === 'scramble' ? c.step === 'craft' && !done && !!mine && canScramble(mine, orb) : c.step === 'guess' && !!theirs && theirs.guess === undefined);
  /** What is in hand, while it can still go somewhere (the last one used, or the step over, it is gone). */
  const hand = $derived(held && usable(held) ? held : null);
  // A new step starts empty-handed.
  $effect(() => {
    void `${c.round}:${c.step}`;
    held = null;
  });

  const pickUp = (orb: Orb) => (held = held === orb ? null : orb);
  /** Puts what is in hand there; shift keeps it in hand for another. */
  function putOn(aim: Aim, e: MouseEvent) {
    if (!hand) return;
    act({ do: 'use', orb: hand, aim });
    if (!e.shiftKey) held = null;
  }

  /** What the held currency goes on, as a line under the tiles. */
  const HINT: Record<Orb, string> = {
    annul: 'Click the mod line to take away',
    chaos: 'Click a mod line, or the picture, to swap',
    veil: 'Click where on the picture to hide',
    chance: 'Click the item to trade it for another',
    exalt: 'Click the item to bring a line back',
    divine: 'Click the item to put back what was swapped',
    unveil: 'Click the item to uncover some of its picture',
  };
  /** The maker's lines, those the currency in hand can go on aimable (only once its own lines are here: before that, they don't line up with its slots). */
  const makerMods = $derived(
    mine ? marked(mine, lines).map((m) => ({ ...m, aimable: !!lines && (hand === 'annul' || hand === 'chaos') && m.mark !== 'gone' })) : [],
  );
  const makerTarget = $derived(hand === 'chaos' ? 'whole' : hand === 'veil' ? 'spot' : hand === 'chance' ? 'item' : null);

  /** The pointer, for the currency in hand to follow it (a mouse's only). */
  let pointer = $state<{ x: number; y: number } | null>(null);
  function onmove(e: PointerEvent) {
    pointer = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null;
  }
  // A right click puts it back, unless it is on a tile (that picks one up).
  function oncontext(e: MouseEvent) {
    if (held && !(e.target as Element | null)?.closest('.orb')) held = null;
  }

  /** Who the step still waits for (by name), those here. */
  const waitingOn = $derived(
    s.players
      .filter((p) => p.connected && p.id !== me)
      .filter((p) => (c.step === 'guess' ? guessedBy(c, p.id)?.guess === undefined : !c.ready.includes(p.id) && (c.step !== 'craft' || madeBy(c, p.id))))
      .map((p) => p.name),
  );
  const waitLine = $derived(waitingOn.length ? `Waiting for ${waitingOn.join(', ')}` : 'Everyone is done');

  /** What the last orb on a piece did, in a line. */
  function lastLine(p: Piece | null, side: 'scramble' | 'undo'): string {
    const l = p?.last;
    if (!l || ORBS[l.orb].side !== side) return '';
    const name = ORBS[l.orb].name;
    if (!l.hit) return `The ${name} found nothing to undo.`;
    switch (l.orb) {
      case 'annul':
        return `The ${name} took a line away.`;
      case 'chaos':
        return `The ${name} swapped something for another item’s.`;
      case 'veil':
        return `The ${name} hid more of the picture.`;
      case 'chance':
        return `The ${name} traded your item for another.`;
      case 'exalt':
        return `The ${name} brought a line back.`;
      case 'divine':
        return `The ${name} put back what was swapped.`;
      case 'unveil':
        return `The ${name} uncovered some of the picture.`;
    }
  }

  const task = $derived(
    !playing
      ? 'Each player scrambles an item for another to name'
      : c.step === 'shop'
      ? 'Buy currency for the round'
      : c.step === 'craft'
        ? `Scramble your item for ${nameOf(mine?.guesser ?? '')} to name`
        : c.step === 'guess'
          ? theirs
            ? `${nameOf(theirs.maker)} scrambled this item. Name it`
            : 'The items are being named'
          : 'The items, unmasked',
  );

  // Keys 1 to 6 name the item, as in a question.
  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape' && held) {
      held = null;
      return;
    }
    if (c.step !== 'guess' || !theirs || theirs.guess !== undefined || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= theirs.options.length) {
      e.preventDefault();
      act({ do: 'guess', index: n - 1 });
    }
  }
</script>

<svelte:window onkeydown={onkey} onpointermove={onmove} oncontextmenu={oncontext} />

{#snippet orbTile(orb: Orb, mode: 'buy' | 'use', usable: boolean)}
  {@const n = holds(c, me, orb)}
  <button
    class="orb"
    class:mine={usable}
    class:held={mode === 'use' && hand === orb}
    aria-pressed={mode === 'use' ? hand === orb : undefined}
    data-cursor="card:{[...SCRAMBLES, ...UNDOS].indexOf(orb)}"
    data-fx="hover"
    use:backdropShadow={{ fill: 'linear' }}
    disabled={!usable}
    title={ORBS[orb].does}
    onclick={() => (mode === 'buy' ? act({ do: 'buy', orb }) : pickUp(orb))}
    oncontextmenu={() => mode === 'use' && usable && pickUp(orb)}
  >
    <span class="orb-name">{ORBS[orb].name}</span>
    {#if mode === 'buy'}
      <span class="orb-price">{ORBS[orb].price}<span class="unit">g</span></span>
    {/if}
    <span class="orb-count" class:none={n === 0}>{mode === 'buy' ? (n ? `${n} held` : '') : `×${n}`}</span>
    <span class="orb-does">{ORBS[orb].does}</span>
  </button>
{/snippet}

<div class="craft">
  <div class="task" data-cursor="task" class:timed={!!timer}>
    <p class="task-text">
      {#if c.step === 'shop' && playing}Buy currency with your <b class="num purse">{gold}</b> gold{:else}{task}{/if}
    </p>
    {#if timer}<div class="clock">{@render timer()}</div>{/if}
  </div>

  {#key `${c.round}:${c.step}`}
    <div class="step" in:fade={{ duration: 250 }}>
      {#if c.step === 'shop' && playing}
        <div class="shop">
          <div class="shelves">
            <section class="shelf">
              <h3>To scramble your item</h3>
              <div class="orbs">
                {#each SCRAMBLES as orb (orb)}{@render orbTile(orb, 'buy', !done && gold >= ORBS[orb].price)}{/each}
              </div>
            </section>
            <section class="shelf">
              <h3>To unscramble the one passed to you</h3>
              <div class="orbs">
                {#each UNDOS as orb (orb)}{@render orbTile(orb, 'buy', !done && gold >= ORBS[orb].price)}{/each}
              </div>
            </section>
          </div>
        </div>
      {:else if c.step === 'craft' && mine}
        <div class="play">
          <div class="item">
            <CraftItem name={itemOf(mine.item)?.name ?? null} sub={itemOf(mine.item)?.base ?? ''} art={look(mine)} mods={makerMods} target={makerTarget} onaim={putOn} />
          </div>
          <div class="side">
            <div class="orbs column">
              {#each SCRAMBLES as orb (orb)}{@render orbTile(orb, 'use', usable(orb))}{/each}
            </div>
            <p class="last" class:hint={!!hand}>{hand ? HINT[hand] : lastLine(mine, 'scramble')}</p>
          </div>
        </div>
      {:else if c.step === 'guess' && theirs}
        <div class="play">
          <div class="item">
            <CraftItem name={null} sub={kindOf(theirs)} art={look(theirs)} mods={theirs.shown.map((text) => ({ text }))} target={hand ? 'item' : null} onaim={putOn} />
          </div>
          <div class="side">
            <div class="orbs row">
              {#each UNDOS as orb (orb)}{@render orbTile(orb, 'use', usable(orb))}{/each}
            </div>
            <p class="last" class:hint={!!hand}>{hand ? HINT[hand] : lastLine(theirs, 'undo')}</p>
            <div class="names">
              {#each theirs.options as id, i (id)}
                <button
                  class="name"
                  class:mine={theirs.guess === undefined}
                  class:picked={theirs.guess === i}
                  data-cursor="opt:{i}"
                  data-fx="hover"
                  use:backdropShadow={{ fill: 'linear' }}
                  disabled={theirs.guess !== undefined}
                  onclick={() => act({ do: 'guess', index: i })}
                >
                  <span class="key">{i + 1}</span>
                  <span class="text">{itemOf(id)?.name ?? '?'}</span>
                </button>
              {/each}
            </div>
          </div>
        </div>
      {:else if c.step === 'reveal' && (mine || theirs)}
        <div class="reveal">
          {#each [theirs, mine] as p, k (k)}
            {#if p}
              {@const right = rightGuess(p)}
              {@const picked = typeof p.guess === 'number' && p.guess >= 0 ? itemOf(p.options[p.guess]) : null}
              <div class="told">
                <p class="told-line">
                  {#if k === 0}
                    {#if right}You named {nameOf(p.maker)}’s item: <b class="good num">+{p.paid ?? 0}</b> gold
                    {:else}{picked ? `You took it for ${picked.name}` : 'You named nothing in time'}; <b class="bad num">{p.paid ?? 0}</b> gold to {nameOf(p.maker)}{/if}
                  {:else if right}{nameOf(p.guesser)} named your item
                  {:else}{nameOf(p.guesser)} {picked ? `took it for ${picked.name}` : 'named nothing in time'}: <b class="good num">+{p.paid ?? 0}</b> gold to you{/if}
                </p>
                <CraftItem name={itemOf(p.item)?.name ?? null} sub={itemOf(p.item)?.base ?? ''} art={trueArt(p)} mods={marked(p, lines)} verdict={(k === 0) === right ? 'good' : 'bad'} />
              </div>
            {/if}
          {/each}
        </div>
      {:else}
        <p class="muted watch">{playing ? "The round goes on without you; you’re in from the next." : 'You are watching: only the players see their items until the reveal.'}</p>
      {/if}
    </div>
  {/key}

  {#if hand && pointer}
    <span class="in-hand" style:left="{pointer.x}px" style:top="{pointer.y}px" aria-hidden="true">{ORBS[hand].name}</span>
  {/if}

  <div class="footer">
    {#if c.step === 'guess' ? theirs?.guess !== undefined : done}
      <p class="wait muted">{waitLine}</p>
    {/if}
    {#if c.step !== 'guess' && playing}
      <button class="btn primary" disabled={done || (c.step === 'craft' && !mine)} onclick={() => act({ do: 'ready' })}>
        {c.step === 'shop' ? 'Done shopping' : c.step === 'craft' ? 'Pass it on' : c.round >= CRAFT.rounds ? 'See the end' : 'Next round'}
      </button>
    {/if}
  </div>
</div>

<style>
  .craft {
    width: min(980px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .task {
    position: relative;
    margin: 0 0 1.2rem;
    text-align: center;
  }
  .task-text {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.45;
  }
  .task.timed .task-text {
    padding-inline: 60px;
  }
  .clock {
    position: absolute;
    right: 0;
    top: 50%;
    translate: 0 -50%;
    display: grid;
    place-items: center;
  }
  .task .clock :global(.timer) {
    width: 52px;
    height: 52px;
  }
  .num {
    font-family: var(--font-cinzel);
  }
  .step {
    min-height: 0;
  }

  /* The shop: the gold to spend, then a shelf for each side. */
  .purse {
    color: var(--gold-hi);
  }
  .shelves {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.6rem;
  }
  .shelf h3 {
    margin: 0 0 0.6rem;
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--gold);
    text-align: center;
  }
  .orbs {
    display: grid;
    gap: 0.55rem;
  }
  .orbs.row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  /* An orb, and a name to pick: the answers' tiles (QuestionView .option). */
  .orb,
  .name {
    position: relative;
    display: grid;
    width: 100%;
    text-align: left;
    color: inherit;
    font: inherit;
    --bs-fill-a: rgba(40, 31, 22, 0.95);
    --bs-fill-b: rgba(20, 16, 12, 0.95);
    --bs-fill-angle: 90deg;
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-angle), var(--bs-fill-a), var(--bs-fill-b)));
    border: 1px solid var(--line);
    border-radius: 4px;
    cursor: default;
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.05),
      inset 0 0 0 1px var(--bs-ring),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent));
    transition:
      transform 0.25s var(--ease-out),
      border-color 0.3s,
      opacity 0.3s,
      --bs-ring 0.3s,
      --bs1 0.4s,
      --bs1-color 0.4s,
      --bs-fill-a 0.4s,
      --bs-fill-b 0.4s;
  }
  .orb.mine,
  .name.mine {
    cursor: pointer;
  }
  .orb:disabled,
  .name:disabled:not(.picked) {
    opacity: 0.5;
  }
  .orb.mine:hover,
  .orb.mine:focus-visible,
  .name.mine:hover,
  .name.mine:focus-visible,
  .name.picked {
    border-color: var(--gold);
    --bs-ring: rgba(241, 217, 155, 0.1);
    --bs-fill-a: rgba(70, 48, 25, 0.96);
    --bs-fill-b: rgba(29, 22, 14, 0.95);
    --bs1: 0px 26px;
    --bs1-color: rgba(224, 138, 68, 0.2);
  }
  .orb.mine:active,
  .name.mine:active {
    transform: scale(0.985);
  }
  /* The one in hand: lit as the game lights currency picked up. */
  .orb.held,
  .orb.held:hover {
    border-color: #9a9aff;
    --bs-ring: rgba(136, 136, 255, 0.45);
    --bs-fill-a: rgba(42, 40, 84, 0.96);
    --bs-fill-b: rgba(20, 19, 40, 0.95);
    --bs1: 0px 26px;
    --bs1-color: rgba(136, 136, 255, 0.2);
  }
  .last.hint {
    color: #b4b4ff;
  }
  /* The currency in hand, beside the pointer. */
  .in-hand {
    position: fixed;
    z-index: 50;
    translate: 14px 10px;
    padding: 0.1rem 0.45rem;
    border: 1px solid #6a6ac0;
    border-radius: 3px;
    background: rgba(8, 8, 16, 0.92);
    font-family: var(--font-tooltip);
    font-size: 0.82rem;
    color: #d0d0ff;
    white-space: nowrap;
    pointer-events: none;
  }
  .orb {
    grid-template-columns: 1fr auto;
    grid-template-areas: 'name price' 'does count';
    column-gap: 0.8rem;
    row-gap: 0.15rem;
    padding: 0.6rem 0.85rem;
  }
  .orb-name {
    grid-area: name;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.95rem;
    color: #e8d7b8;
  }
  .orb-price {
    grid-area: price;
    font-family: var(--font-cinzel);
    font-weight: 600;
    color: var(--gold-hi);
  }
  .unit {
    margin-left: 0.1em;
    font-size: 0.8em;
    opacity: 0.8;
  }
  .orb-count {
    grid-area: count;
    align-self: end;
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    color: var(--gold);
  }
  .orb-count.none {
    opacity: 0.5;
  }
  .orb-does {
    grid-area: does;
    font-size: 0.9rem;
    line-height: 1.3;
    color: var(--muted);
  }
  /* Beside the item: no price, the count where the price would be. */
  .side .orb {
    grid-template-areas: 'name count' 'does does';
  }
  .side .orb-count {
    align-self: center;
  }
  .orbs.row .orb {
    grid-template-areas: 'name' 'count';
    padding: 0.5rem 0.6rem;
    text-align: center;
  }
  .orbs.row .orb-does {
    display: none;
  }
  .orbs.row .orb-name {
    font-size: 0.85rem;
  }

  /* The item and what to do with it, side by side. */
  .play {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2rem;
    align-items: stretch;
  }
  .item {
    display: flex;
    flex-direction: column;
    min-height: 420px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }
  .last {
    margin: 0;
    min-height: 1.4em;
    font-size: 0.95rem;
    color: var(--muted);
    text-align: center;
  }
  .names {
    display: grid;
    grid-auto-rows: 1fr;
    gap: 0.55rem;
  }
  .name {
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.8rem;
    padding: 0.75rem 1rem;
  }
  .key {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding-top: 2px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.78rem;
    color: var(--gold);
    border: 1px solid var(--gold-lo);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
  }
  .name .text {
    font-size: 1.05rem;
    line-height: 1.2;
  }

  /* The reveal: the item you named, and yours. */
  .reveal {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    grid-auto-flow: column;
    gap: 2rem;
  }
  .told {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 420px;
  }
  .told-line {
    margin: 0;
    min-height: 2.9em;
    text-align: center;
    line-height: 1.45;
  }
  .good {
    color: var(--verdict-good-icon);
  }
  .bad {
    color: var(--verdict-bad-icon);
  }
  .watch {
    text-align: center;
  }

  .footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.2rem;
  }
  .wait {
    margin: 0;
    min-height: 1.4em;
    text-align: center;
  }

  /* A phone either way: the shop's tiles two by two, name and price, then what it does. */
  @media (orientation: portrait) and (max-width: 640px), (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .shelf h3 {
      margin-bottom: 0.3rem;
      font-size: 0.85rem;
    }
    .shelf .orbs {
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
    }
    .shelf .orb {
      grid-template-areas: 'name price' 'does does';
      align-content: start;
      column-gap: 0.4rem;
      row-gap: 0.1rem;
      padding: 0.4rem 0.55rem;
    }
    /* What you hold, as a stack's count on the tile's edge. */
    .shelf .orb-count {
      position: absolute;
      top: -0.55rem;
      left: 0.45rem;
      padding: 0.05rem 0.35rem 0;
      font-size: 0.68rem;
      line-height: 1.2;
      background: #0b0907;
      border: 1px solid var(--gold-lo);
      border-radius: 0.6rem;
    }
    .shelf .orb-count.none {
      display: none;
    }
    .orb-name {
      font-size: 0.85rem;
    }
    .orb-does {
      font-size: 0.75rem;
      line-height: 1.25;
    }
    /* The undos beside the one to name: one line each, the name and how many. */
    .orbs.row .orb {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'name count';
      column-gap: 0.3rem;
      align-items: baseline;
      padding: 0.35rem 0.5rem;
      text-align: left;
    }
    .orbs.row .orb-name {
      font-size: 0.8rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .orbs.row {
      gap: 0.4rem;
    }
    .last {
      min-height: 1.25em;
      font-size: 0.82rem;
      line-height: 1.25;
    }
    .side {
      gap: 0.4rem;
    }
  }
  /* A phone upright: one column, as tall as the game's stage (Game.svelte); the picture gives way first. */
  @media (orientation: portrait) and (max-width: 640px) {
    .craft,
    .step {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .play,
    .reveal {
      flex: 1;
      min-height: 0;
    }
    .task {
      margin-bottom: 0.5rem;
    }
    .task-text {
      font-size: 1rem;
    }
    .shelves {
      grid-template-columns: 1fr;
      gap: 0.6rem;
    }
    .orb {
      padding: 0.45rem 0.7rem;
    }
    .play {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 0.5rem;
    }
    .item {
      min-height: 0;
    }
    .names {
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
    }
    .name {
      gap: 0.45rem;
      padding: 0.45rem 0.55rem;
    }
    .name .text {
      font-size: 0.86rem;
    }
    .key {
      width: 22px;
      height: 22px;
      font-size: 0.7rem;
    }
    .side .orb-does {
      display: none;
    }
    .orbs.column {
      grid-template-columns: 1fr 1fr;
    }
    .reveal {
      grid-auto-flow: row;
      grid-template-columns: 1fr;
      grid-auto-rows: minmax(0, 1fr);
      gap: 0.5rem;
    }
    .told {
      min-height: 0;
      gap: 0.25rem;
    }
    .told-line {
      min-height: 0;
      font-size: 0.85rem;
      line-height: 1.3;
    }
    /* What it was is the reveal's news: its name and picture; the lines were seen at the time. */
    .told :global(.mods) {
      display: none;
    }
    .footer {
      margin-top: 0.5rem;
      flex-direction: row;
      justify-content: center;
      gap: 0.8rem;
    }
    .wait {
      flex: 1 1 0;
      min-width: 0;
      font-size: 0.85rem;
      line-height: 1.25;
      text-align: left;
    }
  }
  /* A phone on its side: item and choices side by side, everything tighter. */
  @media (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .task {
      margin-bottom: 0.4rem;
    }
    .task-text {
      font-size: 0.95rem;
    }
    .play {
      gap: 0.8rem;
    }
    /* What the header, the task and the footer leave. */
    .item,
    .told {
      min-height: 0;
      height: calc(100svh - 165px);
    }
    .told {
      height: calc(100svh - 158px);
      gap: 0.25rem;
    }
    .told-line {
      min-height: 0;
      font-size: 0.85rem;
      line-height: 1.3;
    }
    .orbs.column {
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
    }
    .orb {
      padding: 0.35rem 0.6rem;
    }
    .orb-does {
      display: none;
    }
    .names {
      grid-template-columns: 1fr 1fr;
      gap: 0.35rem;
    }
    .name {
      padding: 0.35rem 0.5rem;
    }
    .name .text {
      font-size: 0.82rem;
    }
    .shelves {
      gap: 1rem;
    }
    .shelves .orb-does {
      display: block;
      font-size: 0.72rem;
    }
    .footer {
      margin-top: 0.4rem;
      flex-direction: row;
      justify-content: center;
      gap: 1rem;
    }
  }
</style>
