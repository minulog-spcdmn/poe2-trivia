<script lang="ts">
  // The end of a turns game, for this device's player: what they learned.
  // Every item revealed in the game as a strip of art (rimmed in gold when
  // they named it, in red when they missed it), the ones to remember, what the
  // Codex gained, and the seal the game earned or the next one to chase. From
  // the game as this device saw it (Session.huntTally, lib/hunt.ts), so a
  // reload keeps it. Its beats come once the end screen has settled and the
  // Codex bar is in view: the stream of sparks into the bar, then the seal.
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { session, engine } from '../lib/session.svelte';
  import { itemImage } from '../lib/ui';
  import { sfx } from '../lib/sound';
  import { backdropShadow } from '../lib/backdropShadow';
  import { FILL_SPAN, FILL_START, SCORE_LANDS, fillBar, milestoneReached } from '../lib/fx/moments';
  import { FILL_LEAD } from '../lib/soundDesign';
  import { fxActive } from '../lib/fx/core';
  import { openCodex } from '../lib/codexRoute.svelte';
  import type { SealRow } from '../lib/achievements';
  import AchievementSeal from './AchievementSeal.svelte';

  /** Whose answers are this device's (online, its seat); null in hot-seat, where every answer was given here. */
  let { me }: { me: string | null } = $props();

  /** After this long the last reveal's codex entry and achievement check have landed: the Codex and the seals are read then. */
  const READ_AFTER = 1500;
  /** The Codex bar's beat never comes before this (the screen's own entrance plays first). */
  const BEAT_FROM = 1600;
  /** The seal comes this long after the bar's count lands. */
  const SEAL_AFTER = 250;
  const OLD_GOLD = '#d9a45a';
  /** The strip flies in one picture after another, at most this many steps apart. */
  const STAGGER_MAX = 24;

  const tally = $derived(session.huntTally);
  /** Every reveal this device saw, of the items this build knows (a host on another build may have others). */
  const seen = $derived(
    (tally?.seen ?? []).flatMap((x) => {
      const item = engine.byId.get(x.id);
      return item ? [{ ...x, item, own: me === null || x.by === me }] : [];
    }),
  );
  /** The latest misses: this player's (in hot-seat, anyone's), up to three. */
  const misses = $derived(seen.filter((x) => x.own && !x.ok).slice(-3));
  /** New to the Codex this game, as the reveals' New chips said. */
  const chips = $derived(seen.filter((x) => x.fresh).length);
  const total = engine.items.length;

  /** How many of the game's items the Codex holds now (null until read, or if it can't be). */
  let after = $state<number | null>(null);
  /** And as the game began (Session kept it with the tally; else worked out from the chips). */
  const before = $derived(after === null ? 0 : Math.min(after, tally?.known ?? Math.max(0, after - chips)));
  /** What the Codex gained: the New chips, and the art of a wrong "find the art" pick, which it counts as seen too. */
  const added = $derived(after === null ? chips : after - before);
  /** The bar shows the count now (it filled, or jumped). */
  let filled = $state(false);
  /** It fills smoothly (with the effects; without, it jumps). */
  let smooth = $state(false);
  const share = $derived(after === null ? 0 : (filled ? after : before) / total);

  /** The seal named (undefined while it is read; null: none to name). */
  let seal = $state<SealRow | null | undefined>(undefined);
  const sealWon = $derived(!!seal && seal.earned !== null);
  let sealIn = $state(false);
  const sealShare = $derived(seal?.progress && seal.progress.need > 0 ? Math.min(1, seal.progress.have / seal.progress.need) : 0);

  let stripEl = $state<HTMLElement>();
  let barEl = $state<HTMLElement>();
  let sealEl = $state<HTMLElement>();

  function toCodex() {
    session.leave();
    openCodex();
  }

  onMount(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => void timers.push(setTimeout(fn, ms));
    let read = false;
    let settled = false;
    let inView = false;
    let begun = false;

    later(READ_AFTER, () => {
      void import('../lib/codex')
        .then(({ loadCodex }) => {
          const items = loadCodex().items;
          after = engine.items.filter((it) => items[it.id]).length;
        })
        .catch((err) => console.warn('codex', err))
        .finally(() => {
          read = true;
          begin();
        });
      void import('../lib/achievements')
        .then(({ nextSeal, sealRows }) => (seal = nextSeal(sealRows(engine.items), session.earnedAtStart)))
        .catch((err) => {
          console.warn('achievements', err);
          seal = null;
        });
    });
    later(BEAT_FROM, () => {
      settled = true;
      begin();
    });
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        inView = true;
        io.disconnect();
        begin();
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    if (barEl) io.observe(barEl);

    /** The beat: the stream of sparks from the strip into the Codex bar, the count landing, then the seal. */
    function begin() {
      if (begun || !read || !settled || !inView) return;
      begun = true;
      const stream = after !== null && after > before && fxActive() && !!stripEl && !!barEl;
      if (stream) {
        fillBar(stripEl!, barEl!, before / total, after! / total);
        later(FILL_START * 1000 - FILL_LEAD, () => sfx('fill'));
        later(FILL_START * 1000, () => {
          smooth = true;
          filled = true;
        });
      } else filled = true;
      later(SCORE_LANDS * 1000 + SEAL_AFTER, showSeal);
    }

    async function showSeal() {
      sealIn = true;
      if (!seal || seal.earned === null) return;
      await tick();
      if (sealEl?.isConnected && fxActive()) milestoneReached(sealEl, OLD_GOLD);
      sfx('findReward');
    }

    return () => {
      io.disconnect();
      for (const t of timers) clearTimeout(t);
    };
  });
</script>

<section class="recap panel" aria-labelledby="recap-title" use:backdropShadow={{ fill: 'linear' }} in:fly={{ y: 30, duration: 700, delay: 1000 }}>
  <h2 id="recap-title">What you learned</h2>
  {#if seen.length}
    <ul class="strip" bind:this={stripEl} aria-label="The items revealed this game">
      {#each seen as x, i (x.at)}
        <li
          class="thumb"
          class:right={x.own && x.ok}
          class:missed={x.own && !x.ok}
          style:--i={Math.min(i, STAGGER_MAX)}
          title="{x.item.name}{x.own ? (x.ok ? ': named right' : ': missed') : ''}"
        >
          <img src={itemImage(x.item.id)} alt={x.item.name} loading="lazy" decoding="async" />
          {#if x.fresh}<span class="new" title="New to your Codex">New</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if misses.length}
    <h3 class="remember">Remember these:</h3>
    <ul class="misses">
      {#each misses as x (x.at)}
        <li>
          <span class="art"><img src={itemImage(x.item.id)} alt="" loading="lazy" decoding="async" /></span>
          <span class="names">
            <span class="iname">{x.item.name}</span>
            <span class="ibase">{x.item.base}</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="codex">
    <p class="codex-line">
      <span>{#if added}<span class="n">+{added}</span> to your Codex{:else}Nothing new for your Codex{/if}</span>
      {#if after !== null}<span class="count n">{filled ? after : before} / {total}</span>{/if}
    </p>
    <span class="bar" class:hidden={after === null} bind:this={barEl} aria-hidden="true">
      <span class="fill" class:smooth style:width="{share * 100}%" style:--fill-span="{FILL_SPAN}s"></span>
    </span>
  </div>

  {#if seal !== null}
    <div class="seal-line" class:won={sealWon} class:in={sealIn && !!seal}>
      {#if seal}
        {@const a = seal.achievement}
        {@const p = seal.progress}
        <span class="seal-at" bind:this={sealEl}>
          <AchievementSeal sign={a.sign} tier={a.tier} earned={sealWon} progress={sealShare} size={48} />
        </span>
        <span class="body">
          <span class="title"><span class="lead">{sealWon ? 'Seal earned:' : 'Next seal:'}</span> {a.title}</span>
          <span class="text">{a.text}</span>
          {#if !sealWon && p && p.need > 1}
            <span class="advance">
              <span class="meter"><span class="meter-fill" style:width="{sealShare * 100}%"></span></span>
              <span class="n">{Math.min(p.have, p.need)} / {p.need}</span>
            </span>
          {/if}
        </span>
      {/if}
    </div>
  {/if}

  {#if session.mode === 'local'}
    <button class="to-codex" onclick={toCodex}>See them all in your Codex</button>
  {/if}
</section>

<style>
  .recap {
    width: min(460px, 100%);
    margin-top: 2rem;
    padding: 1rem 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.9rem;
    text-align: left;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.28em;
    /* Letter spacing also trails the last letter; balance it so the words are centred. */
    padding-left: 0.28em;
    text-transform: uppercase;
    text-align: center;
    color: var(--gold);
  }
  .n {
    font-family: var(--font-cinzel);
  }

  /* ---- the strip: every item revealed ---- */
  .strip {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.45rem;
  }
  .thumb {
    position: relative;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    background: radial-gradient(circle at 50% 40%, #241b12, #0d0a07 75%);
    border: 1px solid var(--line);
    animation: thumb-in 0.4s var(--ease-back) both;
    animation-delay: calc(1100ms + var(--i) * 60ms);
  }
  .thumb.right {
    border: 2px solid var(--gold);
    box-shadow: 0 0 8px rgba(201, 164, 92, 0.35);
  }
  .thumb.missed {
    border: 2px solid var(--bad);
    background: radial-gradient(circle at 50% 40%, #2c1410, #0d0a07 75%);
    box-shadow: 0 0 8px rgba(224, 85, 63, 0.3);
  }
  .thumb img {
    width: 36px;
    height: 36px;
    object-fit: contain;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8));
  }
  @keyframes thumb-in {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.7);
    }
  }
  /* New to the Codex: a small tag on the rim, with a glint passing over it once it lands. */
  .new {
    position: absolute;
    left: 50%;
    bottom: -0.55em;
    translate: -50% 0;
    padding: 0.08em 0.45em 0;
    font-family: var(--font-display);
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    line-height: 1.4;
    white-space: nowrap;
    color: #f4e3b5;
    background:
      linear-gradient(100deg, transparent 35%, rgba(255, 248, 225, 0.85) 50%, transparent 65%) no-repeat,
      linear-gradient(180deg, #6e5628, #2d220e);
    background-size:
      300% 100%,
      100% 100%;
    background-position:
      150% 0,
      0 0;
    border: 1px solid rgba(201, 164, 92, 0.6);
    border-radius: 999px;
    animation: glint 1.1s ease-in-out both;
    animation-delay: calc(1500ms + var(--i) * 60ms);
  }
  @keyframes glint {
    to {
      background-position:
        -50% 0,
        0 0;
    }
  }

  /* ---- remember these ---- */
  .remember {
    margin: 0.1rem 0 -0.35rem;
    font-family: var(--font-body);
    font-size: 1rem;
    font-weight: 400;
    font-style: italic;
    letter-spacing: normal;
    color: var(--muted);
  }
  .misses {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .misses li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.35rem 0.6rem 0.35rem 0.35rem;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.25);
  }
  .misses .art {
    flex: none;
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    background: radial-gradient(circle at 50% 40%, #241b12, #0d0a07 75%);
  }
  .misses img {
    width: 46px;
    height: 46px;
    object-fit: contain;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8));
  }
  .names {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  /* As the item's tooltip names it: the unique's name over its base type. */
  .iname {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1rem;
    color: var(--unique-hi);
    text-shadow: 0 0 10px rgba(224, 138, 68, 0.35);
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.78rem;
    color: #d8a26a;
    opacity: 0.85;
  }

  /* ---- the Codex: what it gained, as a thin bar ---- */
  .codex {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .codex-line {
    margin: 0;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    font-family: var(--font-display);
    font-size: 0.86rem;
    letter-spacing: 0.04em;
    color: #cbbfa8;
  }
  .codex-line .n {
    color: var(--gold-hi);
  }
  .count {
    font-size: 0.78rem;
    white-space: nowrap;
  }
  .codex-line .count {
    color: var(--muted);
  }
  .bar {
    position: relative;
    display: block;
    height: 5px;
    border-radius: 3px;
    background: #0b0907;
    box-shadow:
      inset 0 0 0 1px rgba(125, 99, 51, 0.35),
      inset 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .bar.hidden {
    visibility: hidden;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
    background: linear-gradient(90deg, #6d4a1c, #c9a45c 70%, #f1d99b);
    box-shadow: 0 0 8px rgba(224, 138, 68, 0.45);
  }
  .fill.smooth {
    transition: width var(--fill-span) linear;
  }

  /* ---- the seal: earned in this game, or the next to chase ---- */
  .seal-line {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-height: 56px;
    padding: 0.4rem 0.6rem 0.4rem 0.4rem;
    border-radius: 8px;
    border: 1px solid transparent;
    background: rgba(0, 0, 0, 0.18);
    opacity: 0;
    transition: opacity 0.6s;
  }
  .seal-line.in {
    opacity: 1;
  }
  .seal-line.won {
    border-color: rgba(201, 164, 92, 0.25);
    background: linear-gradient(90deg, rgba(201, 164, 92, 0.1), rgba(0, 0, 0, 0.15) 70%);
  }
  .seal-at {
    flex: none;
    display: grid;
  }
  .seal-line.won.in .seal-at {
    animation: seal-in 0.6s var(--ease-back) both;
  }
  @keyframes seal-in {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
    flex: 1;
  }
  .title {
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    color: #b9ab94;
  }
  .lead {
    color: var(--muted);
  }
  .won .title {
    color: var(--gold-hi);
  }
  .won .lead {
    color: var(--gold);
  }
  .text {
    font-size: 0.95rem;
    line-height: 1.3;
    color: #a89c87;
  }
  .advance {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.2rem;
  }
  .meter {
    position: relative;
    display: block;
    flex: 1;
    height: 5px;
    min-width: 40px;
    max-width: 160px;
    border-radius: 3px;
    background: #0b0907;
    box-shadow:
      inset 0 0 0 1px rgba(125, 99, 51, 0.35),
      inset 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .meter-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
    background: linear-gradient(90deg, #6d4a1c, #c9a45c 70%, #f1d99b);
  }
  .advance .n {
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
  }

  /* Hot-seat: the whole Codex, a step away. */
  .to-codex {
    align-self: center;
    margin-top: -0.2rem;
    padding: 0.2rem 0.4rem;
    font-family: var(--font-body);
    font-size: 0.98rem;
    font-style: italic;
    color: var(--gold);
    background: none;
    border: 0;
    border-bottom: 1px dotted var(--gold-lo);
    border-radius: 0;
    cursor: pointer;
  }
  .to-codex:hover {
    color: var(--gold-hi);
  }
</style>
