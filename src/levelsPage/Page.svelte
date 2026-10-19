<script lang="ts">
  // The sound levels page (levels.html): every moment's sound, and a few
  // that land together in the game, played as the game plays them
  // (lib/sound.ts, placed by lib/spatial.svelte.ts), switched between
  // before (the levels as they were before the last change, BEFORE) and
  // after (the game's now). Switching plays the last sound again, so the
  // two can be heard one after the other; blind hides which is which.
  import { onDestroy } from 'svelte';
  import { MIX, MOMENTS } from '../lib/soundDesign';
  import { getVolume, setLift, setTrims, sfx, type Sfx } from '../lib/sound';

  type Side = 'before' | 'after';

  /**
   * The last change to the levels, undone: the whole mix's lift (dB, MIX.lift)
   * and each moment's level (dB on top of the game's now) as they were, and
   * what changed, in words. Set it anew with each change to hear it against.
   */
  const BEFORE: { lift: number; trims: Partial<Record<Sfx, number>>; change: string } = {
    lift: MIX.lift,
    trims: { deathmatch: 10, defeat: 6 },
    change: 'deathmatch 10 dB and defeat 6 dB quieter, to sit with start and victory',
  };

  function apply(s: Side) {
    setLift(s === 'before' ? BEFORE.lift : MIX.lift);
    setTrims(s === 'before' ? BEFORE.trims : {});
  }

  const GROUPS: { name: string; ids: Sfx[] }[] = [
    { name: 'Big moments', ids: ['start', 'deathmatch', 'victory', 'defeat', 'stratum', 'blast', 'caveIn', 'fallen', 'itemBlown', 'flare', 'plunge'] },
    { name: 'Answers and lives', ids: ['reveal', 'correct', 'wrong', 'pick', 'select', 'burn', 'fill', 'lifeLost', 'wardShatter', 'findReward', 'revive', 'struck', 'fallenFar'] },
    { name: 'Turns and controls', ids: ['hover', 'click', 'tick', 'turn', 'yourTurn', 'join', 'vote', 'draw', 'fuse'] },
    { name: 'Zone card', ids: ['zoneTick', 'zoneLock', 'zoneSting', 'zoneBurn', 'zoneShatter', 'zoneDrift', 'zoneVoid'] },
  ];
  // Any sound added to the game since, so none is left off the page.
  const listed = new Set(GROUPS.flatMap((g) => g.ids));
  const others = (Object.keys(MOMENTS) as Sfx[]).filter((id) => !listed.has(id));
  if (others.length) GROUPS.push({ name: 'Other', ids: others });

  /** Sounds that land together in the game: a wrong answer and the lives it takes, the blast and what it destroys, a run's end. */
  const STACKS: Sfx[][] = [
    ['wrong', 'caveIn', 'lifeLost'],
    ['blast', 'itemBlown', 'lifeLost'],
    ['wrong', 'lifeLost', 'fallen'],
    ['deathmatch', 'defeat', 'blast'],
  ];

  /** Held for as long as it is in the game; the fuse burns over the clock's last seconds. */
  const HOLD: Partial<Record<Sfx, number>> = { fuse: 2500 };

  const words = (id: string) => id.replace(/([A-Z])/g, ' $1').toLowerCase();

  let side = $state<Side>('after');
  let blind = $state(false);
  /** Blind: X is after (true) or before. */
  let xIsAfter = $state(true);
  let revealed = $state(false);
  let replay = $state(true);
  let last = $state<Sfx[] | null>(null);
  let stops: (() => void)[] = [];
  /**
   * The random draws the last play made (each moment's nudge in pitch and
   * level, sound.ts sfx), handed back when it plays again: a replay is the
   * same take, so only the lift differs between before and after.
   */
  let draws: number[] = [];
  let pending = 0;

  // The page opens on after, the game's own.
  apply('after');
  onDestroy(() => {
    clearTimeout(pending);
    apply('after');
  });

  function play(ids: Sfx[], again = false) {
    clearTimeout(pending);
    for (const stop of stops) stop();
    if (!again) draws = [];
    const random = Math.random;
    let i = 0;
    Math.random = () => (i < draws.length ? draws[i++] : (draws[i++] = random()));
    try {
      stops = ids.map((id) => sfx(id, HOLD[id] ? { holdMs: HOLD[id] } : {})).filter((s): s is () => void => !!s);
    } finally {
      Math.random = random;
    }
    last = ids;
  }

  /** How long (ms) a switch waits before playing again: the last sound faded out and the lift settled (it glides, 30 ms a step). */
  const SETTLE = 200;

  function choose(s: Side) {
    if (s === side) return;
    side = s;
    for (const stop of stops) stop();
    apply(s);
    clearTimeout(pending);
    const ids = last;
    if (replay && ids) pending = window.setTimeout(() => play(ids, true), SETTLE);
  }
  const flip = () => choose(side === 'after' ? 'before' : 'after');

  function setBlind(on: boolean) {
    blind = on;
    revealed = false;
    if (on) xIsAfter = Math.random() < 0.5;
  }

  /** The two choices as shown: by name, or X and Y when blind. */
  const choices = $derived<{ side: Side; label: string; hint: string }[]>(
    blind
      ? [
          { side: xIsAfter ? 'after' : 'before', label: 'X', hint: revealed ? (xIsAfter ? 'after' : 'before') : '?' },
          { side: xIsAfter ? 'before' : 'after', label: 'Y', hint: revealed ? (xIsAfter ? 'before' : 'after') : '?' },
        ]
      : [
          { side: 'before', label: 'Before', hint: 'as it was' },
          { side: 'after', label: 'After', hint: 'now' },
        ],
  );

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') {
      e.preventDefault();
      flip();
    } else if (e.key === '1' || e.key === '2') choose(choices[Number(e.key) - 1].side);
    else if (e.key === 'r' && last) play(last, true);
  }

  /** Svelte action: the mouse over the page never plays the game's hover, which would land over what is being compared. */
  function quiet(node: HTMLElement) {
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener('pointerover', stop);
    return { destroy: () => node.removeEventListener('pointerover', stop) };
  }

  const same = (a: Sfx[] | null, b: Sfx[]) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);
</script>

<svelte:window onkeydown={onKey} />

<!-- #app: the screen sounds are placed across (lib/spatial.svelte.ts). Its buttons play no click of their own. -->
<main id="app" data-sfx="none" use:quiet>
  <header>
    <h1>Sound levels</h1>
    <p class="hint">
      Every sound through the game’s whole mix, switched between <b>before</b>, the mix as it was, and <b>after</b>, the game’s now: {BEFORE.change}. Set the
      computer’s volume as for a video, and the game’s own volume ({Math.round(getVolume() * 100)}%) is used as it is.
    </p>
  </header>

  <section class="bar" aria-label="Mix">
    <div class="seg" role="group" aria-label="Before or after">
      {#each choices as c, i (c.label)}
        <button class:on={side === c.side} aria-pressed={side === c.side} onclick={() => choose(c.side)}>
          {c.label} <small>{c.hint}</small> <kbd>{i + 1}</kbd>
        </button>
      {/each}
    </div>
    <label class="check"><input type="checkbox" bind:checked={replay} /> Play again on switching <kbd>Space</kbd></label>
    <label class="check"><input type="checkbox" checked={blind} onchange={(e) => setBlind(e.currentTarget.checked)} /> Blind</label>
    {#if blind}
      <button class="small" onclick={() => (revealed = true)} disabled={revealed}>Reveal</button>
      <button class="small" onclick={() => setBlind(true)}>Shuffle</button>
    {/if}
    <span class="now">
      {#if last}Last: <b>{last.map(words).join(' + ')}</b> <kbd>R</kbd>{:else}Click a sound to hear it.{/if}
    </span>
  </section>

  {#each GROUPS as g (g.name)}
    <section>
      <h2>{g.name}</h2>
      <div class="grid">
        {#each g.ids as id (id)}
          <button class="sound" class:last={same(last, [id])} onclick={() => play([id])}>{words(id)}</button>
        {/each}
      </div>
    </section>
  {/each}

  <section>
    <h2>Together</h2>
    <p class="hint">As they land at once in the game; the last is the loudest three at once, to hear the limiter hold it.</p>
    <div class="grid">
      {#each STACKS as s (s.join('+'))}
        <button class="sound" class:last={same(last, s)} onclick={() => play(s)}>{s.map(words).join(' + ')}</button>
      {/each}
    </div>
  </section>
</main>

<style>
  #app {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.2rem 1rem 3rem;
    font-family: var(--font-body);
    font-size: 15px;
  }
  h1,
  h2 {
    margin: 0 0 0.6rem;
    font-family: var(--font-cinzel);
    font-weight: normal;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--gold-hi);
  }
  h1 {
    font-size: 1.1rem;
  }
  h2 {
    margin-top: 1.6rem;
    font-size: 0.85rem;
  }
  .hint {
    margin: 0.4rem 0;
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .hint b,
  .now b {
    font-style: normal;
    color: var(--gold-hi);
  }
  button {
    font: inherit;
    color: var(--text);
    background: rgba(28, 21, 14, 0.9);
    border: 1px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1.2rem;
    margin: 1rem -1rem 0;
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--gold-lo);
    background: rgba(12, 10, 8, 0.96);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--gold-lo);
    border-radius: 6px;
    overflow: hidden;
  }
  .seg button {
    border: 0;
    border-right: 1px solid var(--line);
    border-radius: 0;
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    font-family: var(--font-cinzel);
    font-size: 0.95rem;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button.on {
    background: rgba(201, 164, 92, 0.28);
    color: var(--gold-hi);
  }
  .seg small {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .small {
    padding: 0.3rem 0.7rem;
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
  }
  .now {
    margin-left: auto;
    font-size: 0.9rem;
    color: var(--muted);
  }
  kbd {
    font-size: 0.7rem;
    color: var(--muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.5rem;
  }
  .sound {
    padding: 0.7rem 0.8rem;
    text-align: left;
    font-family: var(--font-body);
    font-size: 1rem;
  }
  .sound.last {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
  }
  @media (max-width: 600px) {
    .now {
      margin-left: 0;
      flex-basis: 100%;
    }
  }
</style>
